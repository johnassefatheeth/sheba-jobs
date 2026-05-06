Sheba Job - MVP
================

Overview
--------
Sheba Job is a job aggregation MVP targeting the Ethiopian market. This repository contains three apps and a shared Prisma package:

- `apps/web` — Next.js (App Router) frontend
- `apps/api` — Node.js (Express) backend API
- `apps/scraper` — Scraper services (Telegram, website)
- `packages/db` — Prisma schema and client

Requirements
------------
- Node.js 18+
- PostgreSQL
- pnpm or npm

Quick start (local)
-------------------

1. Copy env example:

```bash
cp .env.example .env
```

2. Install dependencies (from repo root):

```bash
npm install
# or pnpm install
```

3. Configure Supabase URLs in `.env` and `packages/db/.env` (see `.env.example`): **`DATABASE_URL`** (pooler port **6543**, `pgbouncer=true`) for the app, **`DIRECT_URL`** (pooler port **5432**) for Prisma CLI. The pooler hostname must match your project **region** in the Supabase dashboard.

4. Initialize Prisma client and push schema (always from `packages/db` so the right `.env` is used):

```bash
cd packages/db
npm install
npm run prisma:generate
npm run db:push
```

If `db push` fails with **P1001**, your network may block Supabase (try `ping` / `Test-NetConnection` to the pooler host, another network/VPN off, or a phone hotspot). Encode `@` and `#` in the DB password as `%40` and `%23`.

5. Start API server:

```bash
cd apps/api
npm run dev
```

6. Start frontend:

```bash
cd apps/web
npm run dev
```

7. Scraper — see **`apps/scraper/README.md`** (Telegram session setup + website JSON API env vars).

```bash
cd apps/scraper
npm install
npm run telegram:session   # once, to obtain TELEGRAM_SESSION
npm run start:telegram
npm run start:website      # needs WEBSITE_JOBS_* in .env
```

Deployment
----------
- Frontend: deploy `apps/web` to Vercel.
- Backend + scraper: deploy to Railway (or any Node host). Ensure `DATABASE_URL` and Telegram secrets in env.

Notes
-----
- This is an MVP scaffold: scrapers include example code requiring credentials and network access.
- Use `prisma` CLI in `packages/db` to run migrations or push the schema.
