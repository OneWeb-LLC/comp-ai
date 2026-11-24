# Environment variables — Vercel + Supabase Community Edition

**Names only.** Set values in Vercel, Render/Coolify (API), Supabase, and Trigger.dev dashboards. Never commit secrets.

## Vercel — App (`apps/app`)

| Name | Phase | Required for Preview |
|------|-------|---------------------|
| `DATABASE_URL` | Runtime | Yes |
| `AUTH_SECRET` | Runtime | Yes |
| `SECRET_KEY` | Runtime | Yes |
| `RESEND_API_KEY` | Runtime | Yes |
| `REVALIDATION_SECRET` | Runtime | Yes |
| `BETTER_AUTH_URL` | Runtime | Yes (Preview app URL) |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Build | Yes |
| `NEXT_PUBLIC_PORTAL_URL` | Build | Yes (Preview portal URL) |
| `NEXT_PUBLIC_API_URL` | Build | Yes (API base URL) |
| `NEXT_PUBLIC_SELF_HOSTED` | Build | Yes (`true`) |
| `TRIGGER_SECRET_KEY` | Runtime | Yes |
| `INTERNAL_API_TOKEN` | Runtime | Yes (match API) |
| `SERVICE_TOKEN_TRIGGER` | Runtime | Yes (match API) |
| `APP_AWS_ACCESS_KEY_ID` | Runtime | For uploads |
| `APP_AWS_SECRET_ACCESS_KEY` | Runtime | For uploads |
| `APP_AWS_REGION` | Runtime | For uploads |
| `APP_AWS_BUCKET_NAME` | Runtime | For uploads |
| `APP_AWS_ORG_ASSETS_BUCKET` | Runtime | For logos / assets |
| `OPENAI_API_KEY` | Runtime | For AI flows |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Runtime | If Google login |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Runtime | Optional |
| `AUTH_MICROSOFT_CLIENT_ID` / `AUTH_MICROSOFT_CLIENT_SECRET` | Runtime | Optional |
| `SKIP_ENV_VALIDATION` | Build | Optional (`true` only if validating build before secrets exist) |

## Vercel — Portal (`apps/portal`)

| Name | Phase | Required for Preview |
|------|-------|---------------------|
| `DATABASE_URL` | Runtime | Yes |
| `BETTER_AUTH_SECRET` | Runtime | Yes |
| `BETTER_AUTH_URL` | Runtime | Yes (Preview portal URL) |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Build | Yes |
| `NEXT_PUBLIC_API_URL` | Build | Yes |
| `RESEND_API_KEY` | Runtime | Yes |
| `INTERNAL_API_TOKEN` | Runtime | Yes |
| `SERVICE_TOKEN_PORTAL` | Runtime | Yes (match API) |
| `APP_AWS_*` | Runtime | If portal downloads/uploads |

## API (Render / Docker / Coolify)

| Name | Required for Preview |
|------|---------------------|
| `DATABASE_URL` | Yes |
| `PORT` | Yes (`3333`) |
| `BASE_URL` | Yes (public API URL) |
| `BETTER_AUTH_URL` | Yes (app URL) |
| `NEXT_PUBLIC_APP_URL` | Yes (app URL) |
| `SELF_HOSTED` | Yes (`true`) |
| `AUTH_TRUSTED_ORIGINS` | Yes (app, portal, API preview origins) |
| `TRIGGER_SECRET_KEY` | Yes |
| `INTERNAL_API_TOKEN` | Yes |
| `SERVICE_TOKEN_TRIGGER` | Yes |
| `SERVICE_TOKEN_PORTAL` | Yes |
| `RESEND_API_KEY` | Yes |
| `OPENAI_API_KEY` | For AI-assisted API paths |
| `APP_AWS_*` | For file features |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional rate limits |

## Supabase / migrations (`packages/db`)

| Name | Where |
|------|--------|
| `DATABASE_URL` | Migrator shell / CI |
| `DIRECT_URL` | Optional; Prisma direct connection for migrations |

## Trigger.dev Cloud

Sync the same runtime secrets as production API/app for the target environment (`staging` recommended). Minimum:

| Name | Projects |
|------|----------|
| `DATABASE_URL` | app + api |
| `DIRECT_URL` | app + api (if used) |
| `TRIGGER_SECRET_KEY` | app + api |
| `SERVICE_TOKEN_TRIGGER` | api tasks calling API |

Do **not** set `NODE_EXTRA_CA_CERTS` on Vercel (see TLS checklist). Trigger.dev may use `caBundleExtension` in `apps/api/trigger.config.ts`.