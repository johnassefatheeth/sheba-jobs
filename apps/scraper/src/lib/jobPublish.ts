import { ensureUniqueJobSlug, prisma } from "@sheba/db";
import { postJobToTelegramChannel } from "./telegramPoster.js";

type PersistedJob = {
  id: string;
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  postedAt?: Date | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  jobType?: string | null;
  experienceLevel?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
  scrapedFrom?: string | null;
  telegramPostedAt?: Date | null;
};

export async function assignSlugIfMissing(job: { id: string; title: string; company?: string | null; slug?: string | null }) {
  if (job.slug) return job.slug;
  const slug = await ensureUniqueJobSlug(prisma, job.title, job.company, job.id);
  await prisma.job.update({ where: { id: job.id }, data: { slug } });
  return slug;
}

export async function announceJobOnTelegram(job: PersistedJob, isNew: boolean) {
  if (!isNew || job.telegramPostedAt) return;

  const posted = await postJobToTelegramChannel(job);
  if (!posted) return;

  await prisma.job.update({
    where: { id: job.id },
    data: { telegramPostedAt: new Date() },
  });
}
