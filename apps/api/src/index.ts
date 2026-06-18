import "dotenv/config";
import express from "express";
import path from "node:path";
import { createExpressApp } from "./app.js";
import { scheduleWebsiteScraper } from "./websiteScraperSchedule.js";
import { backfillAllMissingSlugs } from "./cron.js";

const PORT = Number(process.env.PORT_API || 4000);

async function start() {
  await backfillAllMissingSlugs();
  scheduleWebsiteScraper();

  const app = createExpressApp();

  app.use(
    "/uploads/channel-posts",
    express.static(path.resolve(process.cwd(), "uploads", "channel-posts"))
  );

  app.listen(PORT, () => {
    console.log(`Sheba API (local) running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
