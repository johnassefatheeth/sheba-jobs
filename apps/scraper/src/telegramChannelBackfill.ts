import "dotenv/config";
import { postRecentJobsToTelegram } from "./lib/jobPublish.js";

async function main() {
  try {
    await postRecentJobsToTelegram();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
