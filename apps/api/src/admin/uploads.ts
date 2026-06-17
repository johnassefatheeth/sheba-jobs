import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'channel-posts');
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function channelPostImagePublicUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const base = process.env.API_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT_API || 4000}`;
  return `${base.replace(/\/$/, '')}/uploads/channel-posts/${path.basename(imagePath)}`;
}

export async function ensureUploadDir() {
  await mkdir(UPLOAD_ROOT, { recursive: true });
}

export async function saveChannelPostImage(
  postId: string,
  base64Data: string,
  mimeType: string
): Promise<{ imagePath: string }> {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) throw new Error('Image file is empty');
  if (buffer.length > MAX_BYTES) throw new Error('Image must be 5 MB or smaller');

  await ensureUploadDir();
  const filename = `${postId}${ext}`;
  const imagePath = path.join(UPLOAD_ROOT, filename);
  await writeFile(imagePath, buffer);
  return { imagePath: filename };
}

export async function deleteChannelPostImage(imagePath: string | null | undefined) {
  if (!imagePath) return;
  const file = path.join(UPLOAD_ROOT, path.basename(imagePath));
  await unlink(file).catch(() => {});
}

export function resolveChannelPostImageFile(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const root = path.resolve(UPLOAD_ROOT);
  const file = path.resolve(root, path.basename(imagePath));
  if (!file.startsWith(root)) return null;
  return file;
}

export function isTelegramPhotoUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
