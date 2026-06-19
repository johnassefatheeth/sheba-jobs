import { ensureUniqueJobSlug, prisma } from "@sheba/db/shared";

function isTransientDbError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err.code === "P1017" || err.code === "P1001" || err.code === "P1008")
  );
}

async function withDbRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt === attempts) throw err;
      const delayMs = attempt * 1000;
      console.warn(`[cron] ${label} failed (${attempt}/${attempts}), retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function markExpiredJobs() {
  const now = new Date();
  const result = await prisma.job.updateMany({
    where: {
      isExpired: false,
      expiresAt: { lt: now },
    },
    data: { isExpired: true },
  });

  if (result.count > 0) {
    console.log(`[cron] marked ${result.count} job(s) expired`);
  }
}

export async function backfillMissingSlugsBatch() {
  const missing = await withDbRetry("backfillMissingSlugs", () =>
    prisma.job.findMany({
      where: { OR: [{ slug: null }, { slug: "" }] },
      select: { id: true, title: true, company: true },
      take: 200,
    })
  );

  if (missing.length === 0) return 0;

  for (const job of missing) {
    const slug = await withDbRetry("ensureUniqueJobSlug", () =>
      ensureUniqueJobSlug(prisma, job.title, job.company, job.id)
    );
    await withDbRetry("backfillMissingSlugs update", () =>
      prisma.job.update({ where: { id: job.id }, data: { slug } })
    );
  }

  console.log(`[cron] backfilled ${missing.length} job slug(s)`);
  return missing.length;
}

/** Local dev startup: drain the backlog in batches. */
export async function backfillAllMissingSlugs() {
  while ((await backfillMissingSlugsBatch()) > 0) {
    // continue until no rows remain
  }
}

/** Hourly website scrape — needs Workers Paid (~15 min CPU per hourly cron). */
export const SCRAPE_CRON = "17 * * * *";

let scrapeInProgress = false;

export async function runScheduledWebsiteScraper() {
  if (process.env.WEBSITE_SCRAPER_ENABLED === "false") {
    console.log("[cron] website scraper disabled (WEBSITE_SCRAPER_ENABLED=false)");
    return;
  }

  if (scrapeInProgress) {
    console.log("[cron] website scrape already in progress, skipping");
    return;
  }

  scrapeInProgress = true;
  try {
    const { runWebsiteScraper } = await import("@sheba/scraper/website");
    await runWebsiteScraper();
  } catch (err) {
    console.error("[cron] website scrape failed:", err);
    throw err;
  } finally {
    scrapeInProgress = false;
  }
}

/** Cron schedules are defined in wrangler.jsonc. */
export async function handleScheduled(cron: string) {
  console.log("[cron] tick", cron, new Date().toISOString());

  if (cron === SCRAPE_CRON) {
    await runScheduledWebsiteScraper();
    return;
  }

  if (cron === "0 */3 * * *") {
    await markExpiredJobs();
    return;
  }

  if (cron === "30 4 * * *") {
    await backfillMissingSlugsBatch();
    return;
  }

  console.warn("[cron] unknown schedule:", cron);
}
