/**
 * One-time (or rare) login: prints TELEGRAM_SESSION=... for apps/scraper/.env
 *
 * Prerequisites in .env: TELEGRAM_API_ID, TELEGRAM_API_HASH (from https://my.telegram.org)
 */
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/StringSession.js";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();

async function main() {
  if (!apiId || !apiHash) {
    console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in apps/scraper/.env first.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const existing = process.env.TELEGRAM_SESSION?.trim() || "";
  const stringSession = new StringSession(existing);

  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => (await rl.question("Phone (international, e.g. +251...): ")).trim(),
    phoneCode: async () => (await rl.question("Code from Telegram / SMS: ")).trim(),
    password: async () => (await rl.question("Cloud password (2FA), empty if none: ")).trim(),
    onError: (err) => console.error(err),
  });

  const saved = stringSession.save();
  console.log("\n--- Paste into apps/scraper/.env (single line, keep secret) ---\n");
  console.log(`TELEGRAM_SESSION="${saved}"\n`);

  await rl.close();
  await client.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
