import "dotenv/config";
import { postRecentJobsToTelegramGroup } from "./lib/jobPublish.js";

async function main() {
  try {
    await postRecentJobsToTelegramGroup();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
