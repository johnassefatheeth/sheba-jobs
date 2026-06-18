import { withWorkerPrisma } from "@sheba/db/worker";
import type { Env } from "./env.js";
import { applyWorkerEnv, configureUploads } from "./env.js";

export async function withWorkerContext<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  applyWorkerEnv(env);
  process.env.SHEBA_WORKER_RUNTIME = "1";
  configureUploads(env.UPLOADS);
  return withWorkerPrisma(env.HYPERDRIVE.connectionString, fn);
}
