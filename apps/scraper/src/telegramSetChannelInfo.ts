import "dotenv/config";
import {
  buildDefaultChannelDescription,
  setTelegramChannelDescription,
} from "./lib/telegramPoster.js";

const description = process.argv.slice(2).join(" ").trim() || buildDefaultChannelDescription();

console.log("[telegram] setting channel description:\n", description, "\n");

const ok = await setTelegramChannelDescription(description);
process.exit(ok ? 0 : 1);
