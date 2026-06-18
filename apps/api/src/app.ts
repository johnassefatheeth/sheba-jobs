import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  formatPostedFreshness,
  prisma,
  sanitizeApplyUrl,
} from "@sheba/db";
import {
  buildJobWhere,
  getJobMeta,
  parseJobListQuery,
  startOfToday,
} from "./jobQuery.js";
import adminRouter from "./admin/routes.js";
import { getUploadsBucket } from "./env.js";
import { parseJsonBody } from "./middleware/jsonBody.js";

function withFreshness<T extends { postedAt?: Date | null; applyUrl?: string | null }>(job: T) {
  return {
    ...job,
    applyUrl: sanitizeApplyUrl(job.applyUrl),
    freshness: formatPostedFreshness(job.postedAt),
  };
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function createExpressApp() {
  const app = express();
  app.use(cors());
  app.use(parseJsonBody);

  app.get("/uploads/channel-posts/:filename", async (req: Request, res: Response, next) => {
    const filename = req.params.filename.replace(/[/\\]/g, "");
    if (!filename) return res.status(400).json({ error: "Invalid filename" });

    const bucket = getUploadsBucket();
    if (!bucket) return next();

    const key = `channel-posts/${filename}`;
      const object = await bucket.get(key);
      if (!object) return res.status(404).json({ error: "Not found" });
      const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
      res.setHeader("Content-Type", object.httpMetadata?.contentType ?? MIME_BY_EXT[ext] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(Buffer.from(await object.arrayBuffer()));
  });

  app.use("/admin", adminRouter);

  app.get("/jobs/meta", async (req: Request, res: Response) => {
    try {
      const query = parseJobListQuery(req);
      const meta = await getJobMeta(query);
      res.json(meta);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/jobs", async (req: Request, res: Response) => {
    const query = parseJobListQuery(req);
    const { limit = "50", offset = "0", legacy } = req.query;
    const where = buildJobWhere(query);
    const today = startOfToday();

    try {
      const [jobs, total, postedToday] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: Number(limit),
          skip: Number(offset),
        }),
        prisma.job.count({ where }),
        prisma.job.count({ where: { ...where, postedAt: { gte: today } } }),
      ]);

      const payload = jobs.map(withFreshness);

      if (String(legacy).toLowerCase() === "array") {
        return res.json(payload);
      }

      res.json({
        jobs: payload,
        total,
        postedToday,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/jobs/:slugOrId", async (req: Request, res: Response) => {
    const { slugOrId } = req.params;
    if (slugOrId === "meta") return res.status(404).json({ error: "Not found" });

    try {
      const job =
        (await prisma.job.findUnique({ where: { slug: slugOrId } })) ??
        (await prisma.job.findUnique({ where: { id: slugOrId } }));

      if (!job) return res.status(404).json({ error: "Not found" });
      res.json(withFreshness(job));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
