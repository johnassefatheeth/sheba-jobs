import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@sheba/db';
import {
  adminEnabled,
  createAdminToken,
  extractBearerToken,
  verifyAdminPassword,
  verifyAdminToken,
} from './auth.js';
import { publishChannelPost, telegramConfigured } from './telegram.js';
import {
  channelPostImagePublicUrl,
  deleteChannelPostImage,
  isTelegramPhotoUrl,
  saveChannelPostImage,
} from './uploads.js';

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminEnabled()) {
    return res.status(503).json({ error: 'Admin panel is not configured (set ADMIN_PASSWORD)' });
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

function parsePostType(value: unknown): string | null {
  const type = String(value ?? '').toLowerCase().trim();
  if (type === 'challenge' || type === 'news') return type;
  return null;
}

function parsePostBody(req: Request, res: Response) {
  const type = parsePostType(req.body?.type);
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  const buttonText = req.body?.buttonText != null ? String(req.body.buttonText).trim() : null;
  const buttonUrl = req.body?.buttonUrl != null ? String(req.body.buttonUrl).trim() : null;
  const imageUrl = req.body?.imageUrl != null ? String(req.body.imageUrl).trim() : null;

  if (!type) {
    res.status(400).json({ error: 'type must be "challenge" or "news"' });
    return null;
  }
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return null;
  }
  if (!body) {
    res.status(400).json({ error: 'body is required' });
    return null;
  }

  return {
    type,
    title,
    body,
    buttonText: buttonText || null,
    buttonUrl: buttonUrl || null,
    imageUrl: imageUrl || null,
  };
}

router.post('/login', (req: Request, res: Response) => {
  if (!adminEnabled()) {
    return res.status(503).json({ error: 'Admin panel is not configured (set ADMIN_PASSWORD)' });
  }

  const password = String(req.body?.password ?? '');
  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  res.json({ token: createAdminToken() });
});

router.use(requireAdmin);

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalJobs,
      activeJobs,
      expiredJobs,
      postedToday,
      telegramPostedJobs,
      subscribers,
      activeSubscribers,
      channelPosts,
      publishedPosts,
      draftPosts,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { isExpired: false } }),
      prisma.job.count({ where: { isExpired: true } }),
      prisma.job.count({ where: { postedAt: { gte: today }, isExpired: false } }),
      prisma.job.count({ where: { telegramPostedAt: { not: null } } }),
      prisma.telegramSubscriber.count(),
      prisma.telegramSubscriber.count({ where: { isActive: true } }),
      prisma.channelPost.count(),
      prisma.channelPost.count({ where: { status: 'published' } }),
      prisma.channelPost.count({ where: { status: 'draft' } }),
    ]);

    res.json({
      jobs: { total: totalJobs, active: activeJobs, expired: expiredJobs, postedToday, telegramPosted: telegramPostedJobs },
      subscribers: { total: subscribers, active: activeSubscribers },
      channelPosts: { total: channelPosts, published: publishedPosts, drafts: draftPosts },
      telegram: { configured: telegramConfigured() },
      admin: { enabled: adminEnabled() },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/jobs', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const search = String(req.query.search ?? '').trim();
  const includeExpired = String(req.query.includeExpired).toLowerCase() === 'true';

  const where = {
  ...(includeExpired ? {} : { isExpired: false }),
  ...(search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}),
  };

  try {
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          title: true,
          company: true,
          category: true,
          isExpired: true,
          postedAt: true,
          telegramPostedAt: true,
          scrapedFrom: true,
          createdAt: true,
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ jobs, total, limit, offset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const data: { isExpired?: boolean } = {};

  if (typeof req.body?.isExpired === 'boolean') {
    data.isExpired = req.body.isExpired;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const job = await prisma.job.update({ where: { id }, data });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Job not found' });
  }
});

router.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Job not found' });
  }
});

function withPostImage<T extends Record<string, unknown>>(post: T) {
  const imagePath = typeof post.imagePath === 'string' ? post.imagePath : null;
  const imageUrl = typeof post.imageUrl === 'string' ? post.imageUrl : null;
  return {
    ...post,
    imagePreviewUrl: channelPostImagePublicUrl(imagePath) || imageUrl || null,
  };
}

router.get('/posts', async (req: Request, res: Response) => {
  const type = req.query.type ? parsePostType(req.query.type) : null;
  const status = String(req.query.status ?? '').trim();

  try {
    const posts = await prisma.channelPost.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ posts: posts.map(withPostImage) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/posts', async (req: Request, res: Response) => {
  const parsed = parsePostBody(req, res);
  if (!parsed) return;

  try {
    const post = await prisma.channelPost.create({
      data: {
        type: parsed.type,
        title: parsed.title,
        body: parsed.body,
        buttonText: parsed.buttonText,
        buttonUrl: parsed.buttonUrl,
        imageUrl: parsed.imageUrl,
        status: 'draft',
      },
    });
    res.status(201).json(withPostImage(post));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const post = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json(withPostImage(post));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/posts/:id', async (req: Request, res: Response) => {
  const existing = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const data: {
    type?: string;
    title?: string;
    body?: string;
    buttonText?: string | null;
    buttonUrl?: string | null;
    imageUrl?: string | null;
  } = {};

  if (req.body?.type != null) {
    const type = parsePostType(req.body.type);
    if (!type) return res.status(400).json({ error: 'type must be "challenge" or "news"' });
    data.type = type;
  }
  if (req.body?.title != null) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'title cannot be empty' });
    data.title = title;
  }
  if (req.body?.body != null) {
    const body = String(req.body.body).trim();
    if (!body) return res.status(400).json({ error: 'body cannot be empty' });
    data.body = body;
  }
  if (req.body?.buttonText !== undefined) {
    data.buttonText = req.body.buttonText ? String(req.body.buttonText).trim() : null;
  }
  if (req.body?.buttonUrl !== undefined) {
    data.buttonUrl = req.body.buttonUrl ? String(req.body.buttonUrl).trim() : null;
  }
  if (req.body?.imageUrl !== undefined) {
    const imageUrl = req.body.imageUrl ? String(req.body.imageUrl).trim() : null;
    if (imageUrl && !isTelegramPhotoUrl(imageUrl)) {
      return res.status(400).json({ error: 'imageUrl must be a valid http(s) URL' });
    }
    data.imageUrl = imageUrl;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const post = await prisma.channelPost.update({ where: { id: req.params.id }, data });
    res.json(withPostImage(post));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const post = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    await deleteChannelPostImage(post.imagePath);
    await prisma.channelPost.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Not found' });
  }
});

router.post('/posts/:id/image', async (req: Request, res: Response) => {
  const post = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });

  const data = String(req.body?.data ?? '').trim();
  const mimeType = String(req.body?.mimeType ?? '').trim().toLowerCase();
  if (!data) return res.status(400).json({ error: 'Image data is required' });

  try {
    if (post.imagePath) await deleteChannelPostImage(post.imagePath);
    const saved = await saveChannelPostImage(post.id, data, mimeType);
    const updated = await prisma.channelPost.update({
      where: { id: post.id },
      data: { imagePath: saved.imagePath, imageUrl: null },
    });
    res.json(withPostImage(updated));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save image';
    res.status(400).json({ error: message });
  }
});

router.delete('/posts/:id/image', async (req: Request, res: Response) => {
  const post = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });

  try {
    await deleteChannelPostImage(post.imagePath);
    const updated = await prisma.channelPost.update({
      where: { id: post.id },
      data: { imagePath: null },
    });
    res.json(withPostImage(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/posts/:id/publish', async (req: Request, res: Response) => {
  const post = await prisma.channelPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Not found' });

  if (post.status === 'published' && post.telegramPostedAt) {
    return res.status(409).json({ error: 'Already published to Telegram' });
  }

  const result = await publishChannelPost(post);
  if (!result.ok) {
    return res.status(502).json({ error: result.error });
  }

  try {
    const updated = await prisma.channelPost.update({
      where: { id: post.id },
      data: {
        status: 'published',
        telegramPostedAt: new Date(),
        telegramMessageId: result.messageId ?? null,
      },
    });
    res.json(withPostImage(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Published to Telegram but failed to update database' });
  }
});

router.get('/subscribers', async (_req: Request, res: Response) => {
  try {
    const subscribers = await prisma.telegramSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        telegramChatId: true,
        username: true,
        firstName: true,
        isActive: true,
        receiveAll: true,
        categories: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deliveries: true } },
      },
    });
    res.json({ subscribers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
