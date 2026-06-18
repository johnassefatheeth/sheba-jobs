import { withPrisma } from "@sheba/db";
import type { Env } from "./env.js";
import { applyWorkerEnv, configureUploads } from "./env.js";

export async function withWorkerContext<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  applyWorkerEnv(env);
  process.env.SHEBA_WORKER_RUNTIME = "1";
  configureUploads(env.UPLOADS);
  return withPrisma(env.HYPERDRIVE.connectionString, fn);
}
