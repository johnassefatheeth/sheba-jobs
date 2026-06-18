import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { prisma as prismaProxy } from "./shared.js";

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
  var pgPool: pg.Pool | undefined;
}

function initLocalPrismaClient(connectionString: string) {
  const pool = createPool(connectionString);
  const adapter = new PrismaPg(pool);
  return { pool, client: new PrismaClient({ adapter }) };
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

export * from "./shared.js";
export { prismaProxy as prisma };
export default prismaProxy;
