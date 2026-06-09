# Sheba scraper

Uses **`apps/scraper/.env`** (same `DATABASE_URL` pattern as the API). Rebuild the DB package after schema changes:

```bash
cd ../../packages/db && npm run build
```

---

## Website — HaHu Jobs

`WEBSITE_JOBS_PROVIDER=hahu` calls **HaHu’s** public GraphQL endpoint (`https://graph.aggregator.hahu.jobs/v1/graphql`) with the same style of query/variables as **www.hahu.jobs** (non-expired jobs, `approved_on` desc). Only use this in line with **HaHu’s terms** and reasonable request volume.

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBSITE_JOBS_PROVIDER` | `all` | `all` (default), `hahu`, `afriwork`, `ethiojobs`, `effoysira`, or `generic`. |
| `HAHU_GRAPHQL_URL` | `https://graph.aggregator.hahu.jobs/v1/graphql` | Override if the endpoint moves. |
| `HAHU_JOBS_LIMIT` | `80` | Page size (capped at 200 in code). |
| `HAHU_JOBS_OFFSET` | `0` | Pagination offset for later runs. |
| `HAHU_JOB_DETAIL_URL_TEMPLATE` | `https://www.hahu.jobs/job/{{id}}` | Stable **sourceUrl** for deduping. Change if HaHu’s public job URL pattern differs. |
| `HAHU_HTTP_USER_AGENT` | (built-in) | Optional custom `User-Agent` header. |

Run once:

```bash
npm run start:website
```

Run on a schedule (every 20 minutes by default) without the API:

```bash
npm run start:website:daemon
```

When the **API** is running (`apps/api` `npm run dev`), the same scraper runs automatically every 20 minutes. Already-scraped jobs (same `sourceUrl`, or same job already merged from that site) are skipped to avoid redundant work.

---

## Website — all providers (default)

With `WEBSITE_JOBS_PROVIDER=all` (or leaving it unset), one run fetches from:

- HaHu GraphQL provider
- Afriworket GraphQL provider
- Ethiojobs REST provider
- EffoySira WordPress REST provider

and upserts both into your DB.

---

## Website — Afriworket GraphQL

Set:

```env
WEBSITE_JOBS_PROVIDER=afriwork
AFRIWORK_GRAPHQL_URL=https://api.afriworket.com/v1/graphql
AFRIWORK_JOBS_OFFSET=0
AFRIWORK_JOBS_PAGE_SIZE=20
AFRIWORK_JOBS_LIMIT=200
AFRIWORK_JOB_DETAIL_URL_TEMPLATE=https://afriworket.com/jobs/{{id}}
```

Optional:

- `AFRIWORK_HTTP_USER_AGENT` to customize request user-agent
- `AFRIWORK_API_HEADERS` JSON object for auth headers if Afriwork requires them in your network/session, e.g.
  `{"authorization":"Bearer <token>"}` or other required headers.

The query uses:

- `operationName: "GetAllJobs"`
- `orderCondition: { latest_activity_at: "desc" }`
- `whereCondition: { _and: [{ approval_status: { _in: ["PUBLISHED","REFRESHED"] } }] }`

Run:

```bash
npm run start:website
```

---

## Website — Ethiojobs REST API

Set:

```env
WEBSITE_JOBS_PROVIDER=ethiojobs
ETHIOJOBS_API_URL=https://api.ethiojobs.net/ethiojobs/api/job-board/jobs
ETHIOJOBS_START_PAGE=1
ETHIOJOBS_PAGE_SIZE=10
ETHIOJOBS_JOBS_LIMIT=200
ETHIOJOBS_JOB_DETAIL_URL_TEMPLATE=https://ethiojobs.net/job/{{slug}}
```

Optional:

- `ETHIOJOBS_CUSTOM_HEADER` (the `x-custom-header` token from browser request)
- `ETHIOJOBS_API_HEADERS` JSON object for any extra headers
- `ETHIOJOBS_HTTP_USER_AGENT` override

Run:

```bash
npm run start:website
```

---

## Website — EffoySira WordPress API

Set:

```env
WEBSITE_JOBS_PROVIDER=effoysira
EFFOYSIRA_API_URL=https://effoysira.com/wp-json/wp/v2/posts
EFFOYSIRA_START_PAGE=1
EFFOYSIRA_PAGE_SIZE=20
EFFOYSIRA_JOBS_LIMIT=200
```

Optional:

- `EFFOYSIRA_API_HEADERS` JSON object for extra headers
- `EFFOYSIRA_HTTP_USER_AGENT` override

Run:

```bash
npm run start:website
```

---

## Website — generic JSON `GET` (optional)

Point the scraper at a **GET** endpoint that returns JSON with a top-level array or a common wrapper (`data`, `jobs`, `results`, …). Set **`WEBSITE_JOBS_PROVIDER=generic`**.

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBSITE_JOBS_API_URL` | **Yes** | Full URL to the listing API. |
| `WEBSITE_JOBS_FIELD_MAP` | **Yes** | JSON object: our field → **dot path** in each item. Must include **`title`**. Include **`sourceUrl`** if the API exposes a canonical job URL; otherwise use template + id (below). |
| `WEBSITE_JOBS_LIST_PATH` | No | Dot path to the array if it is nested (e.g. `payload.items`). |
| `WEBSITE_JOBS_DETAIL_URL_TEMPLATE` | If no `sourceUrl` in map | e.g. `https://careers.example.com/job/{{id}}` (also supports `{{slug}}`). |
| `WEBSITE_JOBS_ID_PATH` | No | Dot path to stable id for the template (default `id`). |
| `WEBSITE_JOBS_API_HEADERS` | No | JSON object of extra headers (`Authorization`, etc.). |

**Example** (illustrative — replace with a real public API you are allowed to call):

```env
WEBSITE_JOBS_API_URL="https://example.com/api/public/vacancies"
WEBSITE_JOBS_LIST_PATH=""
WEBSITE_JOBS_FIELD_MAP={"title":"title","company":"org_name","location":"city","description":"summary","applyUrl":"apply_link","postedAt":"published_at","sourceUrl":"canonical_url"}
```

Run:

```bash
npm run start:website
```

---

## Telegram — live channels

Uses the [`telegram`](https://www.npmjs.com/package/telegram) (GramJS) client with a **user** session (not a bot token for this script).

### 1. Create API keys

1. Open **https://my.telegram.org** → API development tools.
2. Create an app → copy **`api_id`** and **`api_hash`**.

Put in **`apps/scraper/.env`**:

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH="your_api_hash_here"
```

### 2. Create a session string (once per account)

```bash
cd apps/scraper
npm run telegram:session
```

Enter phone (international format), login code, and 2FA password if enabled. Paste the printed line into **`.env`**:

```env
TELEGRAM_SESSION="....very long string...."
```

### 3. Channels to read

Comma-separated usernames or `t.me` links (public channels you can open in Telegram with this account):

```env
TELEGRAM_CHANNELS="@SomeJobsChannel,https://t.me/AnotherChannel"
TELEGRAM_FETCH_LIMIT=50
```

### 4. Run

```bash
npm run start:telegram
```

Each recent text message becomes a row: **title** = first line, **description** = full text, **sourceUrl** = `https://t.me/<channel>/<messageId>`. Tune parsing later for your posting format.

**Compliance:** Only scrape sources you are allowed to use; respect Telegram ToS and rate limits.

---

## Telegram — outbound job channel

Posts jobs from your database to a **public Telegram channel** with a consistent format and an inline **Apply** button (same URL as the website apply link). New jobs are announced automatically when the website scraper creates them, as long as the bot env vars are set.

### 1. Create a bot

1. Open Telegram and message **@BotFather**.
2. Send `/newbot`, follow the prompts, and copy the **bot token**.

### 2. Create a channel and add the bot

1. Create a new **channel** in Telegram (public or private).
2. Open channel settings → **Administrators** → add your bot.
3. Grant **Post messages** permission.

### 3. Configure env

In **`apps/scraper/.env`** (and `apps/api/.env` if the API runs the scraper):

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
# Public channel: @YourChannelName   Private channel: numeric id like -1001234567890
TELEGRAM_BOT_CHANNEL_ID=@YourChannelName
```

For a private channel, forward any message from the channel to **@userinfobot** or **@getidsbot** to get the numeric chat id.

### 4. Post the last 10 jobs (one-time seed)

```bash
cd apps/scraper
npm run telegram:post-recent
```

Optional env:

- `TELEGRAM_BACKFILL_LIMIT=10` — how many jobs to post per run
- `TELEGRAM_BACKFILL_MAX_SCAN=500` — max jobs to walk when filling the quota

Already-posted jobs are skipped; failed sends do not count toward the limit, so the command keeps going to older jobs until it posts 10 (or runs out of candidates).

### 5. Automatic posts for new jobs

No extra step needed. When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_CHANNEL_ID` are set, every **new** job saved by the website scraper (or API scheduler) is posted to the channel once.

### Message format

Each post includes:

- **Job title first** (channel preview line), with emoji styling
- Company, location, field, and employment tags
- Full job description inside a **collapsible “read more” block** (Telegram expandable quote)
- Posted date and source site
- **✅ Apply Now** inline button → external apply URL
- Sheba Jobs Ethiopia footer (not the first line)
