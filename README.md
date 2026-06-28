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

5. Start API server (also runs the website scraper every 20 minutes by default):

```bash
cd apps/api
npm install
npm run dev
```

Copy website-scraper env vars (`WEBSITE_JOBS_*`, `DATABASE_URL`) into `apps/api/.env`. Disable auto-scrape with `WEBSITE_SCRAPER_ENABLED=false`.

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
npm run telegram:post-recent  # seed last 10 jobs to your Telegram channel (needs TELEGRAM_BOT_*)
npm run telegram:set-channel-info  # set channel About/description (bot needs “Change channel info” admin right)
```

New scraped jobs are posted automatically to your Telegram channel and/or group when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_CHANNEL_ID` / `TELEGRAM_BOT_GROUP_ID` are set.

Deployment
----------
Both apps target **Cloudflare Workers** (free tier). Database stays on **Supabase** (free tier).

### Frontend (`apps/web`)

```bash
cd apps/web
npm install
npm run deploy   # use WSL or Linux CI on Windows — see OpenNext warnings
```

Custom domain: `jobs.sheba-labs.com` (see `wrangler.jsonc`).

### API (`apps/api`)

One-time Cloudflare setup:

1. **Hyperdrive** (pools connections to Supabase Postgres):
   ```bash
   cd apps/api
   npx wrangler hyperdrive create sheba-jobs-db --connection-string="YOUR_SUPABASE_DIRECT_URL"
   ```
   Copy the id into `wrangler.jsonc` → `hyperdrive[0].id`.

2. **R2 bucket** for admin channel-post images:
   ```bash
   npx wrangler r2 bucket create sheba-jobs-uploads
   ```

3. **Secrets** (copy `.dev.vars.example` → `.dev.vars`, fill in, then):
   ```bash
   npx wrangler secret bulk .dev.vars
   ```

4. **Deploy**:
   ```bash
   npm install
   npm run deploy
   ```

Custom domain: `api.sheba-labs.com`. Cron triggers mark expired jobs and backfill slugs.

**Website scraping** runs on **GitHub Actions** (free for public repos) — see `.github/workflows/website-scrape.yml`. Add `DATABASE_URL` (+ optional Telegram secrets) as GitHub repo secrets. Workers free-tier cron only allows ~10ms CPU, which is not enough for scraping.

### Local API dev

```bash
cd apps/api
cp .dev.vars.example .dev.vars   # optional for worker dev
npm run dev                        # Express on :4000 with DATABASE_URL in .env
npm run dev:worker                 # Wrangler dev (needs Hyperdrive + .dev.vars)
```

Notes
-----
- This is an MVP scaffold: scrapers include example code requiring credentials and network access.
- Use `prisma` CLI in `packages/db` to run migrations or push the schema.
