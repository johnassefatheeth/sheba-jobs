import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

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

const strictTls = process.env.DATABASE_SSL_STRICT === "true";
const conn = strictTls ? connectionString : stripSslModeFromConnectionString(connectionString);

const pool = strictTls
  ? new pg.Pool({ connectionString: conn })
  : new pg.Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
    });

const adapter = new PrismaPg(pool);

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Dev (tsx --watch): replace singleton so TLS/env changes are not stuck behind a cached client.
if (process.env.NODE_ENV !== "production") {
  void globalThis.prisma?.$disconnect().catch(() => {});
  globalThis.prisma = new PrismaClient({ adapter });
}

export const prisma =
  process.env.NODE_ENV === "production"
    ? (globalThis.prisma ??= new PrismaClient({ adapter }))
    : globalThis.prisma!;

export default prisma;
