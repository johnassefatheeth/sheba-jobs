import { ensureUniqueJobSlug, prisma } from "@sheba/db";
import { postJobToTelegramChannel, postJobToTelegramGroup, telegramBroadcastConfigured } from "./telegramPoster.js";
import { notifyMatchingTelegramSubscribers } from "./telegramSubscriberNotify.js";

type PersistedJob = {
  id: string;
  slug?: string | null;
  source?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  postedAt?: Date | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  jobType?: string | null;
  posterType?: string | null;
  experienceLevel?: string | null;
  educationLevel?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
  scrapedFrom?: string | null;
  telegramPostedAt?: Date | null;
  companyLogoUrl?: string | null;
};

const TELEGRAM_POST_DELAY_MS = 1100;

export async function assignSlugIfMissing(job: { id: string; title: string; company?: string | null; slug?: string | null }) {
  if (job.slug) return job.slug;
  const slug = await ensureUniqueJobSlug(prisma, job.title, job.company, job.id);
  await prisma.job.update({ where: { id: job.id }, data: { slug } });
  return slug;
}

function telegramBotConfigured(): boolean {
  return telegramBroadcastConfigured();
}

export async function markJobPostedToTelegram(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { telegramPostedAt: new Date() },
  });
}

export async function announceJobOnTelegram(job: PersistedJob, isNew: boolean) {
  if (!isNew || job.telegramPostedAt || !telegramBotConfigured()) return;

  const posted = await postJobToTelegramChannel(job);
  if (!posted) return;

  await markJobPostedToTelegram(job.id);
  await notifyMatchingTelegramSubscribers(job);
}

/** Post up to `limit` jobs to the channel, walking older jobs when some are already posted or fail. */
export async function postRecentJobsToTelegram(options?: { limit?: number }) {
  const target = options?.limit ?? Number(process.env.TELEGRAM_BACKFILL_LIMIT ?? 10);
  if (!telegramBotConfigured()) {
    throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_CHANNEL_ID and/or TELEGRAM_BOT_GROUP_ID in apps/scraper/.env");
  }

  const pageSize = Math.max(target, 25);
  const maxScan = Number(process.env.TELEGRAM_BACKFILL_MAX_SCAN ?? 500);

  let posted = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;
  let offset = 0;

  while (posted < target && scanned < maxScan) {
    const jobs = await prisma.job.findMany({
      where: { isExpired: false },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      skip: offset,
      take: pageSize,
    });

    if (jobs.length === 0) break;
    offset += jobs.length;
    scanned += jobs.length;

    for (const job of jobs) {
      if (posted >= target) break;

      if (job.telegramPostedAt) {
        console.log("[telegram-backfill] skip already posted:", job.title.slice(0, 60));
        skipped++;
        continue;
      }

      const success = await postJobToTelegramChannel(job);
      if (success) {
        await markJobPostedToTelegram(job.id);
        posted++;
        console.log("[telegram-backfill] posted:", job.title.slice(0, 60));
      } else {
        failed++;
        console.warn("[telegram-backfill] failed:", job.title.slice(0, 60));
      }

      await new Promise((resolve) => setTimeout(resolve, TELEGRAM_POST_DELAY_MS));
    }
  }

  const exhausted = posted < target;
  console.log(
    `[telegram-backfill] done: ${posted}/${target} posted, ${skipped} skipped, ${failed} failed, ${scanned} scanned` +
      (exhausted ? " (ran out of jobs to try)" : "")
  );

  return { posted, skipped, failed, scanned, target, exhausted };
}

/** Backfill the group only — ignores telegramPostedAt (channel may already have these jobs). */
export async function postRecentJobsToTelegramGroup(options?: { limit?: number }) {
  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !groupId) {
    throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_GROUP_ID in apps/scraper/.env");
  }

  const target = options?.limit ?? Number(process.env.TELEGRAM_BACKFILL_LIMIT ?? 10);
  const pageSize = Math.max(target, 25);
  const maxScan = Number(process.env.TELEGRAM_BACKFILL_MAX_SCAN ?? 500);

  let posted = 0;
  let failed = 0;
  let scanned = 0;
  let offset = 0;

  while (posted < target && scanned < maxScan) {
    const jobs = await prisma.job.findMany({
      where: { isExpired: false },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      skip: offset,
      take: pageSize,
    });

    if (jobs.length === 0) break;
    offset += jobs.length;
    scanned += jobs.length;

    for (const job of jobs) {
      if (posted >= target) break;

      const success = await postJobToTelegramGroup(job);
      if (success) {
        posted++;
        console.log("[telegram-group-backfill] posted:", job.title.slice(0, 60));
      } else {
        failed++;
        console.warn("[telegram-group-backfill] failed:", job.title.slice(0, 60));
      }

      await new Promise((resolve) => setTimeout(resolve, TELEGRAM_POST_DELAY_MS));
    }
  }

  const exhausted = posted < target;
  console.log(
    `[telegram-group-backfill] done: ${posted}/${target} posted to ${groupId}, ${failed} failed, ${scanned} scanned` +
      (exhausted ? " (ran out of jobs to try)" : "")
  );

  return { posted, failed, scanned, target, exhausted };
}
