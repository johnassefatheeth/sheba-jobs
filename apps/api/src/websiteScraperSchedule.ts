import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INTERVAL_MS = 20 * 60 * 1000;
const scraperDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scraper");

let scrapeInProgress = false;

function runWebsiteScraperProcess(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "start:website"], {
      cwd: scraperDir,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function scheduleWebsiteScraper() {
  if (process.env.WEBSITE_SCRAPER_ENABLED === "false") {
    console.log("[api] website scraper scheduler disabled (WEBSITE_SCRAPER_ENABLED=false)");
    return;
  }

  const intervalMs = Number(process.env.WEBSITE_SCRAPER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const minutes = Math.round(intervalMs / 60_000);

  const tick = async () => {
    if (scrapeInProgress) {
      console.log("[api] website scrape already in progress, skipping this tick");
      return;
    }
    scrapeInProgress = true;
    try {
      const code = await runWebsiteScraperProcess();
      if (code !== 0) {
        console.error("[api] website scrape exited with code", code);
      }
    } catch (err) {
      console.error("[api] website scrape failed:", err);
    } finally {
      scrapeInProgress = false;
    }
  };

  console.log(`[api] website scraper scheduled every ${minutes} minute(s)`);
  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
