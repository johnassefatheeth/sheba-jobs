import type { PrismaClient } from "./generated/prisma/client.js";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/** Runtime prisma handle — set by Node pool init or Worker withWorkerPrisma. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = globalThis.prisma;
    if (!client) {
      throw new Error(
        "Prisma client is not initialized. Set DATABASE_URL for local dev or run inside a Worker context."
      );
    }
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { buildJobSlugBase, ensureUniqueJobSlug, slugifySegment } from "./slug.js";
export { formatPostedFreshness } from "./freshness.js";
export { isHahuListingUrl, sanitizeApplyUrl } from "./applyUrl.js";
export {
  buildJobCanonicalPath,
  buildJobSeoDescription,
  buildJobSeoTitle,
} from "./seo.js";

export default prisma;
