import { formatPostedFreshness, isHahuListingUrl } from "@sheba/db";

export type TelegramJob = {
  id?: string;
  slug?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  category?: string | null;
  description?: string | null;
  postedAt?: Date | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  /** Provider hint, e.g. HaHu `email` / `in_person` (also parsed from `source` like `hahu:email`). */
  applicationMethod?: string | null;
  /** Stored scrape source tag, e.g. `hahu:email`. */
  source?: string | null;
  jobType?: string | null;
  posterType?: string | null;
  experienceLevel?: string | null;
  educationLevel?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
  scrapedFrom?: string | null;
  companyLogoUrl?: string | null;
};

type ApplicationMethod = "link" | "email" | "in_person" | "both" | "phone";

type ApplyPresentation = {
  buttonUrl: string | null;
  instructionHtml: string | null;
  postable: boolean;
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

function parseTelPhone(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value || !/^tel:/i.test(value)) return null;

  try {
    const phone = decodeURIComponent(new URL(value).pathname).trim();
    return phone || null;
  } catch {
    const match = value.match(/^tel:([^?&#]+)/i);
    return match?.[1]?.trim() || null;
  }
}

function normalizeApplicationMethod(raw?: string | null): ApplicationMethod | null {
  if (!raw?.trim()) return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "link" || value === "url" || value === "online" || value === "website") return "link";
  if (value === "email" || value === "e_mail") return "email";
  if (value === "in_person" || value === "inperson" || value === "physical" || value === "walk_in") {
    return "in_person";
  }
  if (value === "both") return "both";
  if (value === "phone" || value === "telephone" || value === "call") return "phone";
  return null;
}

function applicationMethodFromJob(job: TelegramJob): ApplicationMethod | null {
  const direct = normalizeApplicationMethod(job.applicationMethod);
  if (direct) return direct;

  const source = job.source?.trim();
  if (source) {
    const suffix = source.includes(":") ? source.split(":").slice(1).join(":") : source;
    const fromSource = normalizeApplicationMethod(suffix);
    if (fromSource) return fromSource;
  }

  if (parseMailtoEmail(job.applyUrl)) return "email";
  if (parseTelPhone(job.applyUrl)) return "phone";
  if (normalizeButtonUrl(job.applyUrl)) return "link";

  if (!job.applyUrl?.trim() && job.description) {
    if (/\b(in[\s-]?person|walk[\s-]?in|apply in person|submit.*in person|at our office)\b/i.test(job.description)) {
      return "in_person";
    }
  }

  return null;
}

function resolveDirectApplyButtonUrl(job: TelegramJob, method: ApplicationMethod | null): string | null {
  if (method === "email" || method === "in_person" || method === "phone") {
    return null;
  }

  const directApply = normalizeButtonUrl(job.applyUrl);
  if (method === "both") {
    if (directApply && !isHahuListingUrl(directApply)) return directApply;
    return null;
  }

  if (directApply && !isHahuListingUrl(directApply)) {
    return directApply;
  }

  const shebaPage = resolveShebaJobPageUrl(job);
  if (shebaPage) return shebaPage;

  const source = normalizeButtonUrl(job.sourceUrl);
  if (source && !isHahuListingUrl(source)) return source;

  return null;
}

function formatApplyInstruction(job: TelegramJob, method: ApplicationMethod | null): string | null {
  const email = parseMailtoEmail(job.applyUrl);
  const phone = parseTelPhone(job.applyUrl);
  const location = job.location?.trim();

  if (email || method === "email") {
    return `📧 <b>How to apply:</b> Send your resume to <code>${escapeHtml(email!)}</code>`;
  }

  if (phone || method === "phone") {
    return `📞 <b>How to apply:</b> Call <code>${escapeHtml(phone!)}</code>`;
  }

  if (method === "in_person") {
    const where = location ? ` at <b>${escapeHtml(location)}</b>` : "";
    return `🤝 <b>How to apply:</b> Submit your application in person${where}.`;
  }

  if (method === "both" && !email && !phone) {
    return "📋 <b>How to apply:</b> See the job description for application instructions.";
  }

  return null;
}

function resolveApplyPresentation(job: TelegramJob): ApplyPresentation {
  const method = applicationMethodFromJob(job);
  const instructionHtml = formatApplyInstruction(job, method);
  const buttonUrl = resolveDirectApplyButtonUrl(job, method);
  const shebaPage = resolveShebaJobPageUrl(job);
  const postable = Boolean(buttonUrl || instructionHtml || shebaPage);

  return { buttonUrl, instructionHtml, postable };
}

function resolveShebaJobPageUrl(job: TelegramJob): string | null {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.SITE_URL ||
    ""
  ).replace(/\/$/, "");
  if (!base) return null;

  const segment = job.slug?.trim() || job.id?.trim();
  if (!segment) return null;

  return `${base}/jobs/${encodeURIComponent(segment)}`;
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

  const applyPresentation = resolveApplyPresentation(job);
  if (applyPresentation.instructionHtml) {
    lines.push("");
    lines.push(applyPresentation.instructionHtml);
  }

  lines.push("");
  lines.push(`🕐 <i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  if (job.scrapedFrom?.trim()) {
    lines.push(`🔗 <i>Source: ${escapeHtml(job.scrapedFrom.trim())}</i>`);
  }

  lines.push("");
  lines.push("🇪🇹 <i>Sheba Jobs Ethiopia</i>");
  lines.push(formatBroadcastLinkLine(true));

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

  const applyPresentation = resolveApplyPresentation(job);
  if (applyPresentation.instructionHtml) {
    lines.push("");
    lines.push(applyPresentation.instructionHtml);
  }

  lines.push("");
  lines.push(`🕐 <i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  if (job.scrapedFrom?.trim()) {
    lines.push(`🔗 <i>Source: ${escapeHtml(job.scrapedFrom.trim())}</i>`);
  }

  lines.push("");
  lines.push("🇪🇹 <i>Sheba Jobs Ethiopia</i>");
  lines.push(formatBroadcastLinkLine(false));

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

/** Public group URL (explicit TELEGRAM_GROUP_LINK or @username from TELEGRAM_BOT_GROUP_ID). */
export function resolveTelegramGroupLink(): string | null {
  const explicit = process.env.TELEGRAM_GROUP_LINK?.trim();
  if (explicit) return explicit;

  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  if (groupId?.startsWith("@")) {
    return `https://t.me/${groupId.slice(1)}`;
  }

  return null;
}

/** Outbound job posts go to every configured broadcast chat (channel + optional group). */
export function getTelegramBroadcastChatIds(): string[] {
  const ids: string[] = [];
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  if (channelId) ids.push(channelId);
  if (groupId) ids.push(groupId);
  return ids;
}

export function telegramBroadcastConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && getTelegramBroadcastChatIds().length > 0);
}

function formatBroadcastLink(compact: boolean, link: string, verb: "Follow" | "Join"): string {
  const handle = link.replace(/^https?:\/\/t\.me\//i, "").split("/")[0];
  const label = handle ? `@${handle}` : link;
  if (compact) {
    return `📢 <a href="${escapeHtml(link)}">${verb} ${escapeHtml(label)}</a>`;
  }
  return `📢 <a href="${escapeHtml(link)}">${verb} ${escapeHtml(label)}</a>`;
}

function formatBroadcastLinkLine(compact: boolean): string {
  const parts: string[] = [];
  const channelLink = resolveTelegramChannelLink();
  const groupLink = resolveTelegramGroupLink();

  if (channelLink) parts.push(formatBroadcastLink(compact, channelLink, "Follow"));
  if (groupLink) parts.push(formatBroadcastLink(compact, groupLink, "Join"));

  if (parts.length === 0) return "";

  const joined = parts.join(compact ? " · " : "\n");
  if (compact) return `\n${joined}`;
  return `\n\n${joined}${channelLink && !groupLink ? " for every job" : ""}`;
}

const TELEGRAM_DESCRIPTION_MAX = 255;

type TelegramApiResult = { ok?: boolean; description?: string; result?: unknown };

function telegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

function telegramBotConfig(): { token: string; channelId: string } | null {
  const token = telegramBotToken();
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!token || !channelId) return null;
  return { token, channelId };
}

async function callTelegramBotApi(method: string, body: Record<string, unknown>): Promise<TelegramApiResult> {
  const config = telegramBotConfig();
  if (!config) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_CHANNEL_ID not set" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return (await response.json()) as TelegramApiResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[telegram-poster] request failed:", message);
    return { ok: false, description: message };
  }
}

async function postTelegramMessage(
  token: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; description?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !payload.ok) {
      return { ok: false, description: payload.description ?? response.statusText };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[telegram-poster] request failed:", message);
    return { ok: false, description: message };
  }
}

const DEFAULT_CHANNEL_DESCRIPTION_EN =
  "Sheba Jobs Ethiopia — jobs from Ethiojobs, HaHu, Afriwork, EffoySira & Telegram in one place. Browse & filter at sheba.jobs · Alerts: @ShebaJobsbot";

const DEFAULT_CHANNEL_DESCRIPTION_AM =
  "ሼባ ጆብስ ኢትዮጵያ — ከብዙ መድረኮች የስራ ዕድሎች በአንድ ቦታ። በ sheba.jobs ይፈልጉ እና ያጣሩ። ማሳወቂያ፡ @ShebaJobsbot";

/** Default channel “About” text (max 255 chars per Telegram). */
export function buildDefaultChannelDescription(): string {
  const custom = process.env.TELEGRAM_CHANNEL_DESCRIPTION?.trim();
  if (custom) return custom.slice(0, TELEGRAM_DESCRIPTION_MAX);

  const text = `${DEFAULT_CHANNEL_DESCRIPTION_EN}\n\n${DEFAULT_CHANNEL_DESCRIPTION_AM}`;
  if (text.length <= TELEGRAM_DESCRIPTION_MAX) return text;

  return text.slice(0, TELEGRAM_DESCRIPTION_MAX - 1).trimEnd() + "…";
}

async function setTelegramChatDescription(chatId: string, description: string): Promise<boolean> {
  const token = telegramBotToken();
  if (!token) {
    console.warn("[telegram-poster] cannot set chat description: TELEGRAM_BOT_TOKEN not set");
    return false;
  }

  const text = description.trim().slice(0, TELEGRAM_DESCRIPTION_MAX);
  if (!text) {
    console.warn("[telegram-poster] chat description is empty");
    return false;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setChatDescription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, description: text }),
  });
  const payload = (await response.json()) as TelegramApiResult;

  if (!payload.ok) {
    console.error(`[telegram-poster] setChatDescription failed for ${chatId}:`, payload.description ?? "unknown error");
    return false;
  }

  console.log(`[telegram-poster] description updated for ${chatId}`);
  return true;
}

/** Set the channel description (requires bot admin with “Change channel info”). */
export async function setTelegramChannelDescription(description?: string): Promise<boolean> {
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!channelId) {
    console.warn("[telegram-poster] cannot set channel description: TELEGRAM_BOT_CHANNEL_ID not set");
    return false;
  }

  return setTelegramChatDescription(channelId, description ?? buildDefaultChannelDescription());
}

/** Set the group description (requires bot admin with “Change group info”). */
export async function setTelegramGroupDescription(description?: string): Promise<boolean> {
  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  if (!groupId) {
    console.warn("[telegram-poster] cannot set group description: TELEGRAM_BOT_GROUP_ID not set");
    return false;
  }

  return setTelegramChatDescription(groupId, description ?? buildDefaultChannelDescription());
}

/** Sync channel + group descriptions when TELEGRAM_SYNC_CHANNEL_INFO=true. */
export async function syncTelegramChannelInfoIfEnabled(): Promise<void> {
  if (process.env.TELEGRAM_SYNC_CHANNEL_INFO?.trim().toLowerCase() !== "true") return;

  const description = buildDefaultChannelDescription();
  const tasks: Promise<boolean>[] = [];

  if (process.env.TELEGRAM_BOT_CHANNEL_ID?.trim()) {
    tasks.push(setTelegramChannelDescription(description));
  }
  if (process.env.TELEGRAM_BOT_GROUP_ID?.trim()) {
    tasks.push(setTelegramGroupDescription(description));
  }

  await Promise.all(tasks);
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

const BROADCAST_POST_DELAY_MS = 1100;

/** Post a job to every configured broadcast chat (channel and/or group). */
export async function postJobToTelegramChannel(
  job: TelegramJob,
  options?: { allowPhoto?: boolean }
): Promise<boolean> {
  const chatIds = getTelegramBroadcastChatIds();
  if (!telegramBotToken() || chatIds.length === 0) return false;

  const applyPresentation = resolveApplyPresentation(job);
  if (!applyPresentation.postable) {
    console.warn("[telegram-poster] skip job without apply details:", job.title.slice(0, 60));
    return false;
  }

  let allOk = true;
  for (let index = 0; index < chatIds.length; index++) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, BROADCAST_POST_DELAY_MS));
    }

    const ok = await sendJobToTelegramChat(chatIds[index], job, options);
    if (!ok) {
      console.error(`[telegram-poster] broadcast failed for ${chatIds[index]}:`, job.title.slice(0, 60));
      allOk = false;
    }
  }

  return allOk;
}

export async function sendJobToTelegramChat(
  chatId: string,
  job: TelegramJob,
  options?: { allowPhoto?: boolean }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  const applyPresentation = resolveApplyPresentation(job);
  if (!applyPresentation.postable) return false;

  const replyMarkup = applyPresentation.buttonUrl
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: "✅ Apply Now", url: applyPresentation.buttonUrl }]],
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

  const result = await postTelegramMessage(token, endpoint, body);
  if (!result.ok) {
    if (logoUrl) {
      return sendJobToTelegramChat(chatId, job, { allowPhoto: false });
    }
    console.error("[telegram-poster] DM send failed:", result.description);
    return false;
  }

  return true;
}
