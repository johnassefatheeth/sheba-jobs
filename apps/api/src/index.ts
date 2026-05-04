import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from '@sheba/db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT_API || 4000;

// GET /jobs with optional filters: search, location, category, limit, offset
app.get('/jobs', async (req: Request, res: Response) => {
  const { search, location, category, limit = '50', offset = '0' } = req.query;

  const where: any = {};

  if (search) {
    where.OR = [
      { title: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } }
    ];
  }
  if (location) where.location = { equals: String(location), mode: 'insensitive' };
  if (category) where.category = { equals: String(category), mode: 'insensitive' };

  try {
    const jobs = await prisma.job.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Sheba API running on port ${PORT}`);
});
