import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

/** `sslmode=require` in the URI is treated like strict verify with `pg` and can ignore `Pool.ssl`. */
function stripSslModeFromConnectionString(href: string): string {
  const q = href.indexOf("?");
  if (q === -1) return href;
  const base = href.slice(0, q);
  const qs = new URLSearchParams(href.slice(q + 1));
  qs.delete("sslmode");
  const tail = qs.toString();
  return tail ? `${base}?${tail}` : base;
}

function createPool(connectionString: string) {
  const strictTls = process.env.DATABASE_SSL_STRICT === "true";
  const conn = strictTls ? connectionString : stripSslModeFromConnectionString(connectionString);

  const pool = strictTls
    ? new pg.Pool({
        connectionString: conn,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 15_000,
        keepAlive: true,
      })
    : new pg.Pool({
        connectionString: conn,
        ssl: { rejectUnauthorized: false },
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 15_000,
        keepAlive: true,
      });

  pool.on("error", (err) => {
    console.error("[db] idle pool connection error:", err.message);
  });

  return pool;
}

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var pgPool: pg.Pool | undefined;
}

function initLocalPrismaClient(connectionString: string) {
  const pool = createPool(connectionString);
  const adapter = new PrismaPg(pool);
  return { pool, client: new PrismaClient({ adapter }) };
}

/** Hyperdrive / Workers: one short-lived client per request or cron invocation. */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export async function withPrisma<T>(connectionString: string, fn: () => Promise<T>): Promise<T> {
  const client = createPrismaClient(connectionString);
  const previous = globalThis.prisma;
  globalThis.prisma = client;
  try {
    return await fn();
  } finally {
    await client.$disconnect().catch(() => {});
    globalThis.prisma = previous;
  }
}

const connectionString = process.env.DATABASE_URL;
if (connectionString) {
  if (process.env.NODE_ENV !== "production") {
    void globalThis.prisma?.$disconnect().catch(() => {});
    void globalThis.pgPool?.end().catch(() => {});
    const { pool, client } = initLocalPrismaClient(connectionString);
    globalThis.pgPool = pool;
    globalThis.prisma = client;
  } else if (!globalThis.prisma) {
    const { pool, client } = initLocalPrismaClient(connectionString);
    globalThis.pgPool = pool;
    globalThis.prisma = client;
  }
}

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
