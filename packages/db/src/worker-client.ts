import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma-cloudflare/client.js";
import { prisma as prismaProxy } from "./shared.js";
export function createWorkerPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export async function withWorkerPrisma<T>(
  connectionString: string,
  fn: () => Promise<T>
): Promise<T> {
  const client = createWorkerPrismaClient(connectionString);
  const previous = globalThis.prisma;
  globalThis.prisma = client as unknown as typeof globalThis.prisma;
  try {
    return await fn();
  } finally {
    await client.$disconnect().catch(() => {});
    globalThis.prisma = previous;
  }
}

export { prismaProxy as prisma };
