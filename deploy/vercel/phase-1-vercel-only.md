# Phase 1 — Vercel only (API deferred)

Use this when you want **app + portal on Vercel** before choosing an API host (Render, Coolify, etc.).

## What works without an API

| Works | Does not work yet |
|-------|-------------------|
| Vercel build + deploy from `main` | Login, sessions, org creation |
| Static/marketing shells, some read-only UI | Portal auth flows |
| Proving monorepo build on Vercel | Trigger tasks that call the API |

## Team projects (One Web LLC / `oweb`)

| Vercel project | Root | Dashboard |
|----------------|------|-----------|
| **comp-ai-app** | `apps/app` | https://vercel.com/oweb/comp-ai-app |
| **comp-ai-portal** | `apps/portal` | https://vercel.com/oweb/comp-ai-portal |

Default aliases (until custom domains):

- App: `https://comp-ai-app-oweb.vercel.app`
- Portal: `https://comp-ai-portal-oweb.vercel.app`

## Minimum env (set in each project → Settings → Environment Variables)

Phase 1 uses **`SKIP_ENV_VALIDATION=true`** so builds succeed before Supabase/API secrets exist. Remove it once real values are in place.

**App:** `NEXT_PUBLIC_SELF_HOSTED`, `NEXT_PUBLIC_API_URL` (placeholder until API exists), `NEXT_PUBLIC_BETTER_AUTH_URL`, `NEXT_PUBLIC_PORTAL_URL`.

**Portal:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`.

Full list when you go live: [env-vars.md](./env-vars.md).

## When you pick an API host

1. Set `NEXT_PUBLIC_API_URL` on **both** Vercel projects to the API base URL.
2. On the API, set `AUTH_TRUSTED_ORIGINS` to the two Vercel URLs (and later custom domains).
3. Add `DATABASE_URL`, auth, Resend, and the rest per [env-vars.md](./env-vars.md).
4. Remove `SKIP_ENV_VALIDATION` and redeploy.

See [README.md](./README.md) for the full Preview checklist.