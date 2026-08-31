# =============================================================================
# STAGE 1: Dependencies - Install and cache workspace dependencies
# =============================================================================
FROM oven/bun:1.2.8 AS deps

WORKDIR /app

# Copy workspace configuration and package sources required for workspace:* resolution
COPY package.json bun.lock turbo.json ./
COPY packages ./packages

# Copy app package.json files only (full app sources copied in builder stages)
COPY apps/app/package.json ./apps/app/
COPY apps/portal/package.json ./apps/portal/

# Install all dependencies
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

# =============================================================================
# STAGE 2: Ultra-Minimal Migrator - local Prisma 7 schema + migrations
# =============================================================================
FROM node:22-alpine AS migrator

WORKDIR /app

# Copy local Prisma schema, migrations, seed scripts, and schema combiner
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/scripts/build-dist-schema.js ./packages/db/scripts/build-dist-schema.js
COPY packages/db/src/client.ts packages/db/src/ssl-config.ts ./packages/db/src/
COPY packages/db/src/scripts/backfill-framework-versions.ts ./packages/db/src/scripts/

# Prisma 7 requires Node 22.12+; oven/bun ships an older Node for preinstall checks.
RUN echo '{"name":"migrator","dependencies":{"prisma":"7.6.0","@prisma/client":"7.6.0","@prisma/adapter-pg":"7.6.0","pg":"^8.13.0","zod":"^4.3.6","tsx":"^4.19.0"}}' > package.json

RUN npm install --omit=dev

# Flatten prisma/schema/*.prisma into packages/db/dist/schema.prisma
RUN node packages/db/scripts/build-dist-schema.js \
    && cp -R packages/db/prisma/migrations packages/db/dist/migrations

# Prisma 7 reads the datasource URL from prisma.config.* (not the flattened schema).
RUN printf '%s\n' \
  'const { defineConfig } = require("prisma/config");' \
  'module.exports = defineConfig({' \
  '  schema: "packages/db/dist/schema.prisma",' \
  '  migrations: { path: "packages/db/dist/migrations" },' \
  '  datasource: { url: process.env.DATABASE_URL },' \
  '});' \
  > prisma.config.cjs

CMD ["npx", "prisma", "migrate", "deploy"]

# =============================================================================
# STAGE 3: App Builder
# =============================================================================
FROM deps AS app-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/app ./apps/app

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Build workspace packages (Next.js resolves workspace:* via dist/ exports).
# Turbo also runs packages/db build (Prisma client + combined schema).
RUN bunx turbo run build --filter=@trycompai/app^...

# Sync Prisma schema fragments for app prisma generate during build:docker
RUN cd apps/app && bun run db:getschema

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_IS_DUB_ENABLED
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_IS_DUB_ENABLED=$NEXT_PUBLIC_IS_DUB_ENABLED \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max_old_space_size=3072 \
    SKIP_ENV_VALIDATION=true

# Build the app (Node + Turbopack — Bun lacks worker_threads stdout; webpack OOMs on CX33)
RUN cd apps/app && bun run db:getschema \
    && node ../../node_modules/prisma/build/index.js generate --schema=prisma/schema \
    && node ../../packages/db/scripts/fix-generated-extensions.js src/generated/prisma \
    && node ../../node_modules/next/dist/bin/next build

# =============================================================================
# STAGE 4: App Production
# =============================================================================
FROM node:22-alpine AS app

WORKDIR /app

# Copy Next standalone output
COPY --from=app-builder /app/apps/app/.next/standalone ./
COPY --from=app-builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=app-builder /app/apps/app/public ./apps/app/public

EXPOSE 3000
CMD ["node", "apps/app/server.js"]

# =============================================================================
# STAGE 5: Portal Builder
# =============================================================================
FROM deps AS portal-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/portal ./apps/portal

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Build workspace packages (Next.js resolves workspace:* via dist/ exports).
RUN bunx turbo run build --filter=@trycompai/portal^...

# Sync Prisma schema fragments for portal prisma generate
RUN cd apps/portal && bun run db:getschema

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max_old_space_size=3072 \
    SKIP_ENV_VALIDATION=true

# Build the portal (Node + Turbopack)
RUN cd apps/portal && \
    node ../../node_modules/prisma/build/index.js generate --schema=prisma/schema \
    && node ../../packages/db/scripts/fix-generated-extensions.js src/generated/prisma \
    && node ../../node_modules/next/dist/bin/next build

# =============================================================================
# STAGE 6: Portal Production
# =============================================================================
FROM node:22-alpine AS portal

WORKDIR /app

# Copy Next standalone output for portal
COPY --from=portal-builder /app/apps/portal/.next/standalone ./
COPY --from=portal-builder /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=portal-builder /app/apps/portal/public ./apps/portal/public

EXPOSE 3000
CMD ["node", "apps/portal/server.js"]

# (Trigger.dev hosted; no local runner stage)
