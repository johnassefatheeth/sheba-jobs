import "dotenv/config";
import { pollTelegramUpdates, registerTelegramBotCommands } from "./lib/telegramJobBot.js";

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    console.error("Set TELEGRAM_BOT_TOKEN in apps/scraper/.env");
    process.exit(1);
  }

  await registerTelegramBotCommands();
  console.log("[telegram-bot] listening for /start, /prefs, and preference callbacks");

  let offset = 0;
  for (;;) {
    try {
      offset = await pollTelegramUpdates(offset);
    } catch (err) {
      console.error("[telegram-bot] polling error:", err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
