import { formatPostedFreshness } from "@sheba/db";

type TelegramJob = {
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

function normalizeButtonUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
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

  lines.push("");
  lines.push(`🕐 <i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  if (job.scrapedFrom?.trim()) {
    lines.push(`🔗 <i>Source: ${escapeHtml(job.scrapedFrom.trim())}</i>`);
  }

  lines.push("");
  lines.push("🇪🇹 <i>Sheba Jobs Ethiopia</i>");

  return lines.join("\n");
}

export async function postJobToTelegramChannel(job: TelegramJob): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!token || !channelId) return false;

  const applyUrl = normalizeButtonUrl(job.applyUrl) ?? normalizeButtonUrl(job.sourceUrl);
  if (!applyUrl) {
    console.warn("[telegram-poster] skip job without valid apply URL:", job.title.slice(0, 60));
    return false;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: channelId,
      text: formatTelegramJobMessage(job),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Apply Now", url: applyUrl }]],
      },
    }),
  });

  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    console.error("[telegram-poster] send failed:", payload.description ?? response.statusText);
    return false;
  }

  return true;
}
