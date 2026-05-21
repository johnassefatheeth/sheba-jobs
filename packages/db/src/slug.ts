import type { PrismaClient } from "./generated/prisma/client.js";

export function slugifySegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildJobSlugBase(title: string, company?: string | null): string {
  const parts = [title, company?.trim() || "", "ethiopia"].map(slugifySegment).filter(Boolean);
  const slug = parts.join("-");
  return slug.slice(0, 180) || "job-ethiopia";
}

export async function ensureUniqueJobSlug(
  prisma: PrismaClient,
  title: string,
  company?: string | null,
  excludeId?: string
): Promise<string> {
  const base = buildJobSlugBase(title, company);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.job.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    const next = `${base}-${suffix}`;
    candidate = next.slice(0, 200);
    suffix += 1;
  }
}
