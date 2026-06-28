import "dotenv/config";
import {
  buildDefaultChannelDescription,
  setTelegramChannelDescription,
  setTelegramGroupDescription,
} from "./lib/telegramPoster.js";

const description = process.argv.slice(2).join(" ").trim() || buildDefaultChannelDescription();

let ok = true;

if (process.env.TELEGRAM_BOT_CHANNEL_ID?.trim()) {
  console.log("[telegram] setting channel description:\n", description, "\n");
  ok = (await setTelegramChannelDescription(description)) && ok;
}

if (process.env.TELEGRAM_BOT_GROUP_ID?.trim()) {
  console.log("[telegram] setting group description:\n", description, "\n");
  ok = (await setTelegramGroupDescription(description)) && ok;
}

if (!process.env.TELEGRAM_BOT_CHANNEL_ID?.trim() && !process.env.TELEGRAM_BOT_GROUP_ID?.trim()) {
  console.error("[telegram] set TELEGRAM_BOT_CHANNEL_ID and/or TELEGRAM_BOT_GROUP_ID");
  process.exit(1);
}

process.exit(ok ? 0 : 1);
