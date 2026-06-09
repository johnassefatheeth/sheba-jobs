import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  ensureUniqueJobSlug,
  formatPostedFreshness,
  prisma,
} from '@sheba/db';
import { scheduleWebsiteScraper } from './websiteScraperSchedule.js';
import {
  buildJobWhere,
  getJobMeta,
  parseJobListQuery,
  startOfToday,
} from './jobQuery.js';

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

app.get('/jobs/meta', async (req: Request, res: Response) => {
  try {
    const query = parseJobListQuery(req);
    const meta = await getJobMeta(query);
    res.json(meta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/jobs', async (req: Request, res: Response) => {
  const query = parseJobListQuery(req);
  const { limit = '50', offset = '0', legacy } = req.query;
  const where = buildJobWhere(query);
  const today = startOfToday();

  try {
    const [jobs, total, postedToday] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.job.count({ where }),
      prisma.job.count({ where: { ...where, postedAt: { gte: today } } }),
    ]);

    const payload = jobs.map(withFreshness);

    if (String(legacy).toLowerCase() === 'array') {
      return res.json(payload);
    }

    res.json({
      jobs: payload,
      total,
      postedToday,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/jobs/:slugOrId', async (req: Request, res: Response) => {
  const { slugOrId } = req.params;
  if (slugOrId === 'meta') return res.status(404).json({ error: 'Not found' });

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
  scheduleWebsiteScraper();
  app.listen(PORT, () => {
    console.log(`Sheba API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
