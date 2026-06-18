import { httpServerHandler } from "cloudflare:node";
import { createExpressApp } from "./app.js";
import { handleScheduled } from "./cron.js";
import type { Env } from "./env.js";
import { withWorkerContext } from "./workerContext.js";

const PORT = 3000;
const app = createExpressApp();
app.listen(PORT);

const expressHandler = httpServerHandler({ port: PORT }) as {
  fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
};

function forwardToExpress(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!expressHandler.fetch) {
    return Promise.reject(new Error("Express httpServerHandler is not configured"));
  }
  return Promise.resolve(expressHandler.fetch(request, env, ctx));
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return withWorkerContext(env, () => forwardToExpress(request, env, ctx));
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(withWorkerContext(env, () => handleScheduled(controller.cron)));
  },
} satisfies ExportedHandler<Env>;
