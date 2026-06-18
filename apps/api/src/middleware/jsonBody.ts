import type { Request, Response, NextFunction } from "express";
import type { Readable } from "node:stream";

const MAX_BYTES = 10 * 1024 * 1024;

/** Avoid express.json() — body-parser/iconv-lite breaks on Cloudflare Workers. */
export async function parseJsonBody(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    req.body = req.body ?? {};
    return next();
  }

  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.includes("application/json")) {
    req.body = req.body ?? {};
    return next();
  }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = req as unknown as Readable;

    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_BYTES) {
        return res.status(413).json({ error: "Payload too large" });
      }
      chunks.push(buf);
    }

    const text = Buffer.concat(chunks).toString("utf8");
    req.body = text ? JSON.parse(text) : {};
    return next();
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }
}
