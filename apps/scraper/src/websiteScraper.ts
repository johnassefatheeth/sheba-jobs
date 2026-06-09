import { runWebsiteScraper } from "./lib/websiteScrapeRunner.js";

runWebsiteScraper().catch((err) => {
  console.error(err);
  process.exit(1);
});
