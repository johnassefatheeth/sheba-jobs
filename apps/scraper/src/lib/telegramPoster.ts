import { formatPostedFreshness } from "@sheba/db";

export type TelegramJob = {
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  postedAt?: Date | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  jobType?: string | null;
  posterType?: string | null;
  experienceLevel?: string | null;
  educationLevel?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
  scrapedFrom?: string | null;
  companyLogoUrl?: string | null;
};

const SECTION_HEADER =
  /\s+(?=(?:role|responsibilities|requirements?|qualifications?|benefits?|skills?|duties|how to apply|to apply|payment|ideal candidate|not suitable for|about (?:the )?role|job description|what you(?:'|')?ll do|what we offer|description)\s*:)/gi;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Telegram inline buttons only accept http(s) URLs — not mailto:, tel:, tg:, etc. */
function normalizeButtonUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseMailtoEmail(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value || !/^mailto:/i.test(value)) return null;

  try {
    const email = decodeURIComponent(new URL(value).pathname).trim();
    return email || null;
  } catch {
    const match = value.match(/^mailto:([^?&#]+)/i);
    return match?.[1]?.trim() || null;
  }
}

function resolveTelegramButtonUrl(job: TelegramJob): string | null {
  if (parseMailtoEmail(job.applyUrl)) {
    return normalizeButtonUrl(job.sourceUrl);
  }

  return normalizeButtonUrl(job.applyUrl) ?? normalizeButtonUrl(job.sourceUrl);
}

/** Preserve structure: sections, bullets, and line breaks for Telegram HTML. */
export function formatDescriptionForTelegram(raw: string): string {
  let text = raw.replace(/\r/g, "").trim();
  if (!text) return "";

  text = text.replace(SECTION_HEADER, "\n\n");
  text = text.replace(/:\s*•\s+/g, ":\n• ");
  text = text.replace(/(?<!^)(?<!\n)\s*•\s+/g, "\n• ");
  text = text.replace(/(?<!^)(?<!\n)\s+-\s+(?=[A-Za-z])/g, "\n• ");
  text = text.replace(/(?<=\S)\s+(?=\d+[\).]\s)/g, "\n");
  text = text.replace(/\ntell us:\s*/gi, "\ntell us:\n");
  text = text.replace(/\n +(?=[A-Za-z])/g, "\n• ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  if (text.length > 2800) {
    text = `${text.slice(0, 2799).trimEnd()}…`;
  }

  return escapeHtml(text);
}

function formatTagLine(job: TelegramJob): string | null {
  const tags: string[] = [];
  if (job.posterType) tags.push(`🏢 ${job.posterType}`);
  if (job.jobType) tags.push(`💼 ${job.jobType}`);
  if (job.experienceLevel) tags.push(`📊 ${job.experienceLevel}`);
  if (job.educationLevel) tags.push(`🎓 ${job.educationLevel}`);
  if (job.isRemote) tags.push("🌐 Remote");
  if (job.isInternship) tags.push("🎯 Internship");
  if (tags.length === 0) return null;
  return escapeHtml(tags.join("  ·  "));
}

function formatDescriptionSection(description: string): string {
  const formatted = formatDescriptionForTelegram(description);
  if (!formatted) return "";

  if (formatted.length < 220) {
    return `\n\n📝 <b>Description</b>\n${formatted}`;
  }

  return `\n\n📝 <b>Description</b>\n<blockquote expandable>${formatted}</blockquote>`;
}

/** Shorter caption for sendPhoto (Telegram limit: 1024 chars). */
export function formatTelegramPhotoCaption(job: TelegramJob): string {
  const lines: string[] = [`<b>💼 ${escapeHtml(job.title.trim())}</b>`, ""];

  if (job.company?.trim()) {
    lines.push(`🏢 <b>Company:</b> ${escapeHtml(job.company.trim())}`);
  }
  if (job.location?.trim()) {
    lines.push(`📍 <b>Location:</b> ${escapeHtml(job.location.trim())}`);
  }
  if (job.category?.trim()) {
    lines.push(`📂 <b>Field:</b> ${escapeHtml(job.category.trim())}`);
  }

  const tagLine = formatTagLine(job);
  if (tagLine) {
    lines.push("");
    lines.push(tagLine);
  }

  const applyEmail = parseMailtoEmail(job.applyUrl);
  if (applyEmail) {
    lines.push("");
    lines.push(`📧 <b>Apply at</b> '<code>${escapeHtml(applyEmail)}</code>'`);
  }

  lines.push("");
  lines.push(`🕐 <i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  if (job.scrapedFrom?.trim()) {
    lines.push(`🔗 <i>Source: ${escapeHtml(job.scrapedFrom.trim())}</i>`);
  }

  lines.push("");
  lines.push("🇪🇹 <i>Sheba Jobs Ethiopia</i>");
  lines.push(formatChannelLinkLine(true));

  let caption = lines.join("\n");
  if (caption.length > 1020) {
    caption = `${caption.slice(0, 1017).trimEnd()}…`;
  }
  return caption;
}

export function formatTelegramJobMessage(job: TelegramJob): string {
  const lines: string[] = [`<b>💼 ${escapeHtml(job.title.trim())}</b>`, ""];

  if (job.company?.trim()) {
    lines.push(`🏢 <b>Company:</b> ${escapeHtml(job.company.trim())}`);
  }
  if (job.location?.trim()) {
    lines.push(`📍 <b>Location:</b> ${escapeHtml(job.location.trim())}`);
  }
  if (job.category?.trim()) {
    lines.push(`📂 <b>Field:</b> ${escapeHtml(job.category.trim())}`);
  }

  const tagLine = formatTagLine(job);
  if (tagLine) {
    lines.push("");
    lines.push(tagLine);
  }

  if (job.description?.trim()) {
    lines.push(formatDescriptionSection(job.description));
  }

  const applyEmail = parseMailtoEmail(job.applyUrl);
  if (applyEmail) {
    lines.push("");
    lines.push(`📧 <b>Apply at</b> '<code>${escapeHtml(applyEmail)}</code>'`);
  }

  lines.push("");
  lines.push(`🕐 <i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  if (job.scrapedFrom?.trim()) {
    lines.push(`🔗 <i>Source: ${escapeHtml(job.scrapedFrom.trim())}</i>`);
  }

  lines.push("");
  lines.push("🇪🇹 <i>Sheba Jobs Ethiopia</i>");
  lines.push(formatChannelLinkLine(false));

  return lines.join("\n");
}

/** Public channel URL for promos (explicit TELEGRAM_CHANNEL_LINK or @username from TELEGRAM_BOT_CHANNEL_ID). */
export function resolveTelegramChannelLink(): string | null {
  const explicit = process.env.TELEGRAM_CHANNEL_LINK?.trim();
  if (explicit) return explicit;

  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (channelId?.startsWith("@")) {
    return `https://t.me/${channelId.slice(1)}`;
  }

  return null;
}

function formatChannelLinkLine(compact: boolean): string {
  const link = resolveTelegramChannelLink();
  if (!link) return "";

  const handle = link.replace(/^https?:\/\/t\.me\//i, "").split("/")[0];
  const label = handle ? `@${handle}` : "our channel";
  if (compact) {
    return `\n📢 <a href="${escapeHtml(link)}">Follow ${escapeHtml(label)}</a>`;
  }

  return `\n\n📢 <a href="${escapeHtml(link)}">Follow ${escapeHtml(label)}</a> for every job`;
}

const TELEGRAM_DESCRIPTION_MAX = 255;

type TelegramApiResult = { ok?: boolean; description?: string; result?: unknown };

function telegramBotConfig(): { token: string; channelId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!token || !channelId) return null;
  return { token, channelId };
}

async function callTelegramBotApi(method: string, body: Record<string, unknown>): Promise<TelegramApiResult> {
  const config = telegramBotConfig();
  if (!config) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_CHANNEL_ID not set" };
  }

  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (await response.json()) as TelegramApiResult;
}

const DEFAULT_CHANNEL_DESCRIPTION_EN =
  "Sheba Jobs — Sheba Labs' first publicly available product. We fetch jobs from multiple platforms so you see every opportunity out there.";

const DEFAULT_CHANNEL_DESCRIPTION_AM =
  "ሼባ ጆብስ — የሼባ ላብስ የመጀመሪያ ለህዝብ የቀረበ ምርት። ከብዙ መድረኮች የስራ ዕድሎችን በማምጣት ያሉትን ሁሉንም ዕድሎች ያሳያል።";

/** Default channel “About” text (max 255 chars per Telegram). */
export function buildDefaultChannelDescription(): string {
  const custom = process.env.TELEGRAM_CHANNEL_DESCRIPTION?.trim();
  if (custom) return custom.slice(0, TELEGRAM_DESCRIPTION_MAX);

  const text = `${DEFAULT_CHANNEL_DESCRIPTION_EN}\n\n${DEFAULT_CHANNEL_DESCRIPTION_AM}`;
  if (text.length <= TELEGRAM_DESCRIPTION_MAX) return text;

  return text.slice(0, TELEGRAM_DESCRIPTION_MAX - 1).trimEnd() + "…";
}

/** Set the channel description (requires bot admin with “Change channel info”). */
export async function setTelegramChannelDescription(description?: string): Promise<boolean> {
  const config = telegramBotConfig();
  if (!config) {
    console.warn("[telegram-poster] cannot set channel description: bot not configured");
    return false;
  }

  const text = (description ?? buildDefaultChannelDescription()).trim().slice(0, TELEGRAM_DESCRIPTION_MAX);
  if (!text) {
    console.warn("[telegram-poster] channel description is empty");
    return false;
  }

  const payload = await callTelegramBotApi("setChatDescription", {
    chat_id: config.channelId,
    description: text,
  });

  if (!payload.ok) {
    console.error("[telegram-poster] setChatDescription failed:", payload.description ?? "unknown error");
    return false;
  }

  console.log("[telegram-poster] channel description updated");
  return true;
}

/** Sync channel description when TELEGRAM_SYNC_CHANNEL_INFO=true. */
export async function syncTelegramChannelInfoIfEnabled(): Promise<void> {
  if (process.env.TELEGRAM_SYNC_CHANNEL_INFO?.trim().toLowerCase() !== "true") return;
  await setTelegramChannelDescription();
}

function isTelegramPhotoUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function postJobToTelegramChannel(
  job: TelegramJob,
  options?: { allowPhoto?: boolean }
): Promise<boolean> {
  const config = telegramBotConfig();
  if (!config) return false;
  const { token, channelId } = config;

  const applyEmail = parseMailtoEmail(job.applyUrl);
  const applyUrl = resolveTelegramButtonUrl(job);
  if (!applyUrl && !applyEmail) {
    console.warn("[telegram-poster] skip job without valid apply link:", job.title.slice(0, 60));
    return false;
  }

  const replyMarkup = applyUrl
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: "✅ Apply Now", url: applyUrl }]],
        },
      }
    : {};

  const allowPhoto = options?.allowPhoto !== false;
  const logoUrl =
    allowPhoto && isTelegramPhotoUrl(job.companyLogoUrl) ? job.companyLogoUrl!.trim() : null;
  const endpoint = logoUrl ? "sendPhoto" : "sendMessage";
  const body = logoUrl
    ? {
        chat_id: channelId,
        photo: logoUrl,
        caption: formatTelegramPhotoCaption(job),
        parse_mode: "HTML",
        ...replyMarkup,
      }
    : {
        chat_id: channelId,
        text: formatTelegramJobMessage(job),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...replyMarkup,
      };

  const response = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    if (logoUrl) {
      console.warn("[telegram-poster] photo send failed, retrying as text:", payload.description ?? response.statusText);
      return postJobToTelegramChannel(job, { allowPhoto: false });
    }
    console.error("[telegram-poster] send failed:", payload.description ?? response.statusText);
    return false;
  }

  return true;
}

export async function sendJobToTelegramChat(
  chatId: string,
  job: TelegramJob,
  options?: { allowPhoto?: boolean }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  const applyEmail = parseMailtoEmail(job.applyUrl);
  const applyUrl = resolveTelegramButtonUrl(job);
  if (!applyUrl && !applyEmail) return false;

  const replyMarkup = applyUrl
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: "✅ Apply Now", url: applyUrl }]],
        },
      }
    : {};

  const allowPhoto = options?.allowPhoto !== false;
  const logoUrl =
    allowPhoto && isTelegramPhotoUrl(job.companyLogoUrl) ? job.companyLogoUrl!.trim() : null;
  const endpoint = logoUrl ? "sendPhoto" : "sendMessage";
  const body = logoUrl
    ? {
        chat_id: chatId,
        photo: logoUrl,
        caption: formatTelegramPhotoCaption(job),
        parse_mode: "HTML",
        ...replyMarkup,
      }
    : {
        chat_id: chatId,
        text: formatTelegramJobMessage(job),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...replyMarkup,
      };

  const response = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    if (logoUrl) {
      return sendJobToTelegramChat(chatId, job, { allowPhoto: false });
    }
    console.error("[telegram-poster] DM send failed:", payload.description ?? response.statusText);
    return false;
  }

  return true;
}
