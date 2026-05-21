import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  ensureUniqueJobSlug,
  formatPostedFreshness,
  prisma,
} from '@sheba/db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT_API || 4000;
const EXPIRATION_CHECK_MS = 3 * 60 * 60 * 1000;

async function backfillMissingSlugs() {
  while (true) {
    const missing = await prisma.job.findMany({
      where: { OR: [{ slug: null }, { slug: "" }] },
      select: { id: true, title: true, company: true },
      take: 500,
    });
    if (missing.length === 0) break;

    for (const job of missing) {
      const slug = await ensureUniqueJobSlug(prisma, job.title, job.company, job.id);
      await prisma.job.update({ where: { id: job.id }, data: { slug } });
    }

    console.log(`[api] backfilled ${missing.length} job slug(s)`);
  }
}

async function markExpiredJobs() {
  const now = new Date();
  const result = await prisma.job.updateMany({
    where: {
      isExpired: false,
      expiresAt: { lt: now },
    },
    data: { isExpired: true },
  });

  if (result.count > 0) {
    console.log(`[api] marked ${result.count} job(s) expired`);
  }
}

function scheduleExpirationChecks() {
  void markExpiredJobs();
  setInterval(() => {
    void markExpiredJobs();
  }, EXPIRATION_CHECK_MS);
}

function withFreshness<T extends { postedAt?: Date | null }>(job: T) {
  return {
    ...job,
    freshness: formatPostedFreshness(job.postedAt),
  };
}

// GET /jobs with optional filters: search, location, category, limit, offset
app.get('/jobs', async (req: Request, res: Response) => {
  const {
    search,
    location,
    category,
    posterType,
    jobType,
    experienceLevel,
    educationLevel,
    scrapedFrom,
    isRemote,
    isInternship,
    includeExpired = 'false',
    limit = '50',
    offset = '0'
  } = req.query;

  const where: any = {};

  if (search) {
    where.OR = [
      { title: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } },
      { company: { contains: String(search), mode: 'insensitive' } }
    ];
  }
  if (location) where.normalizedLocation = { contains: String(location).toLowerCase(), mode: 'insensitive' };
  if (category) where.normalizedCategory = { equals: String(category), mode: 'insensitive' };
  if (posterType) where.posterType = { equals: String(posterType), mode: 'insensitive' };
  if (jobType) where.jobType = { equals: String(jobType), mode: 'insensitive' };
  if (experienceLevel) where.experienceLevel = { equals: String(experienceLevel), mode: 'insensitive' };
  if (educationLevel) where.educationLevel = { equals: String(educationLevel), mode: 'insensitive' };
  if (scrapedFrom) where.scrapedFrom = { contains: String(scrapedFrom), mode: 'insensitive' };
  if (isRemote !== undefined) where.isRemote = String(isRemote).toLowerCase() === 'true';
  if (isInternship !== undefined) where.isInternship = String(isInternship).toLowerCase() === 'true';
  if (String(includeExpired).toLowerCase() !== 'true') where.isExpired = false;

  try {
    const jobs = await prisma.job.findMany({
      where,
      orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: Number(limit),
      skip: Number(offset)
    });

    res.json(jobs.map(withFreshness));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/jobs/:slugOrId', async (req: Request, res: Response) => {
  const { slugOrId } = req.params;
  try {
    const job =
      (await prisma.job.findUnique({ where: { slug: slugOrId } })) ??
      (await prisma.job.findUnique({ where: { id: slugOrId } }));

    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(withFreshness(job));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function start() {
  await backfillMissingSlugs();
  scheduleExpirationChecks();
  app.listen(PORT, () => {
    console.log(`Sheba API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
