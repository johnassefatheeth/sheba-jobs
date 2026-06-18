import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getUploadsBucket } from "../env.js";

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const EXT_BY_MIME = Object.fromEntries(
  Object.entries(ALLOWED_MIME).map(([mime, ext]) => [ext, mime])
) as Record<string, string>;

function localUploadRoot() {
  return path.resolve(process.cwd() || ".", "uploads", "channel-posts");
}

export function channelPostImagePublicUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const base = process.env.API_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT_API || 4000}`;
  return `${base.replace(/\/$/, "")}/uploads/channel-posts/${path.basename(imagePath)}`;
}

function objectKey(filename: string) {
  return `channel-posts/${path.basename(filename)}`;
}

async function ensureLocalUploadDir() {
  await mkdir(localUploadRoot(), { recursive: true });
}

export async function saveChannelPostImage(
  postId: string,
  base64Data: string,
  mimeType: string
): Promise<{ imagePath: string }> {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    throw new Error("Unsupported image type. Use JPEG, PNG, WebP, or GIF.");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) throw new Error("Image file is empty");
  if (buffer.length > MAX_BYTES) throw new Error("Image must be 5 MB or smaller");

  const filename = `${postId}${ext}`;
  const bucket = getUploadsBucket();

  if (bucket) {
    await bucket.put(objectKey(filename), buffer, {
      httpMetadata: { contentType: mimeType },
    });
    return { imagePath: filename };
  }

  if (process.env.SHEBA_WORKER_RUNTIME === "1") {
    throw new Error("Image uploads require R2 (not configured yet). Use an image URL instead.");
  }

  await ensureLocalUploadDir();
  const imagePath = path.join(localUploadRoot(), filename);
  await writeFile(imagePath, buffer);
  return { imagePath: filename };
}

export async function deleteChannelPostImage(imagePath: string | null | undefined) {
  if (!imagePath) return;
  const filename = path.basename(imagePath);
  const bucket = getUploadsBucket();

  if (bucket) {
    await bucket.delete(objectKey(filename)).catch(() => {});
    return;
  }

  const file = path.join(localUploadRoot(), filename);
  await unlink(file).catch(() => {});
}

export async function readChannelPostImage(imagePath: string | null | undefined): Promise<Buffer | null> {
  if (!imagePath) return null;
  const filename = path.basename(imagePath);
  const bucket = getUploadsBucket();

  if (bucket) {
    const object = await bucket.get(objectKey(filename));
    if (!object) return null;
    return Buffer.from(await object.arrayBuffer());
  }

  const root = path.resolve(localUploadRoot());
  const file = path.resolve(root, filename);
  if (!file.startsWith(root)) return null;

  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(file);
  } catch {
    return null;
  }
}

export function resolveChannelPostImageFile(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (getUploadsBucket()) return path.basename(imagePath);
  const root = path.resolve(localUploadRoot());
  const file = path.resolve(root, path.basename(imagePath));
  if (!file.startsWith(root)) return null;
  return file;
}

export function channelPostImageFilename(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  return path.basename(imagePath);
}

export function isTelegramPhotoUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export { EXT_BY_MIME };
