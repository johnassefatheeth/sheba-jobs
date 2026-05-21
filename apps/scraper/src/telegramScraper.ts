import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/StringSession.js";
import { ensureUniqueJobSlug, prisma } from "@sheba/db";
import { announceJobOnTelegram, assignSlugIfMissing } from "./lib/jobPublish.js";

const TELEGRAM_SITE_LABEL = "Telegram";

function mergeScrapedFrom(existing: string | null | undefined, site: string): string {
  const parts = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) parts.add(t);
  };
  if (existing) {
    for (const p of existing.split(",")) add(p);
  }
  add(site);
  return Array.from(parts).sort((a, b) => a.localeCompare(b)).join(", ");
}

function normalizeChannelRef(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("https://t.me/") || s.startsWith("http://t.me/")) {
    const path = s.replace(/^https?:\/\/t\.me\//i, "").split(/[/?#]/)[0];
    return path || "";
  }
  return s.replace(/^@/, "");
}

/**
 * Scrape recent messages from Telegram channels you can read with this account.
 * Requires a saved user session — run `npm run telegram:session` once.
 */
async function runTelegramScraper() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const sessionStr = process.env.TELEGRAM_SESSION?.trim();
  const channelsRaw = process.env.TELEGRAM_CHANNELS?.trim();

  if (!apiId || !apiHash) {
    console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH (from https://my.telegram.org) in apps/scraper/.env");
    process.exit(1);
  }
  if (!sessionStr) {
    console.error(
      "Set TELEGRAM_SESSION in apps/scraper/.env after running: npm run telegram:session\nSee apps/scraper/README.md"
    );
    process.exit(1);
  }
  if (!channelsRaw) {
    console.error("Set TELEGRAM_CHANNELS (comma-separated @handles or t.me links) in apps/scraper/.env");
    process.exit(1);
  }

  const channels = channelsRaw
    .split(",")
    .map(normalizeChannelRef)
    .filter(Boolean);

  const limit = Math.min(200, Math.max(1, Number(process.env.TELEGRAM_FETCH_LIMIT || "50")));

  const stringSession = new StringSession(sessionStr);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  if (!(await client.checkAuthorization())) {
    console.error("Telegram session is not authorized. Run: npm run telegram:session");
    await client.disconnect();
    process.exit(1);
  }

  console.log("[telegram] channels:", channels.join(", "), "| limit:", limit);

  for (const uname of channels) {
    try {
      for await (const msg of client.iterMessages(uname, { limit })) {
        const text = msg.message;
        if (!text || typeof text !== "string") continue;
        const trimmed = text.trim();
        if (trimmed.length < 12) continue;

        const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const title = (lines[0] || "Telegram post").slice(0, 200);
        const description = trimmed.length > title.length ? trimmed : null;
        const sourceUrl = `https://t.me/${uname}/${msg.id}`;

        const postedAt = (() => {
          const d = msg.date as number | undefined;
          if (d == null) return new Date();
          return new Date(d < 1e12 ? d * 1000 : d);
        })();

        try {
          const existing = await prisma.job.findUnique({
            where: { title_sourceUrl_unique: { title, sourceUrl } },
            select: { id: true, title: true, company: true, scrapedFrom: true, slug: true },
          });
          if (existing) {
            const slug = existing.slug || (await assignSlugIfMissing(existing));
            await prisma.job.update({
              where: { id: existing.id },
              data: {
                slug,
                description: description ?? undefined,
                postedAt,
                scrapedFrom: mergeScrapedFrom(existing.scrapedFrom, TELEGRAM_SITE_LABEL),
              },
            });
          } else {
            const slug = await ensureUniqueJobSlug(prisma, title, null);
            const created = await prisma.job.create({
              data: {
                slug,
                title,
                company: null,
                location: null,
                category: "telegram",
                description: description ?? "",
                source: "telegram",
                scrapedFrom: TELEGRAM_SITE_LABEL,
                sourceUrl,
                applyUrl: sourceUrl,
                postedAt,
              },
            });
            await announceJobOnTelegram(created, true);
          }
          console.log("[telegram] upsert", title.slice(0, 60));
        } catch (err) {
          console.error("[telegram] db error", sourceUrl, err);
        }
      }
    } catch (err) {
      console.error("[telegram] channel error:", uname, err);
    }
  }

  await client.disconnect();
  console.log("[telegram] done");
}

runTelegramScraper().catch((err) => {
  console.error(err);
  process.exit(1);
});
