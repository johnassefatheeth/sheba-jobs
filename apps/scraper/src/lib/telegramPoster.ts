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
  experienceLevel?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
  scrapedFrom?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function formatTelegramJobMessage(job: TelegramJob): string {
  const lines: string[] = [`<b>${escapeHtml(job.title.trim())}</b>`];

  const meta = [job.company, job.location, job.category].filter(Boolean).join(" • ");
  if (meta) lines.push(escapeHtml(meta));

  const tags: string[] = [];
  if (job.jobType) tags.push(job.jobType);
  if (job.experienceLevel) tags.push(job.experienceLevel);
  if (job.isRemote) tags.push("Remote");
  if (job.isInternship) tags.push("Internship");
  if (tags.length > 0) lines.push(escapeHtml(tags.join(" • ")));

  if (job.scrapedFrom) {
    lines.push(`<i>Source: ${escapeHtml(job.scrapedFrom)}</i>`);
  }

  if (job.description?.trim()) {
    lines.push("");
    lines.push(escapeHtml(truncate(job.description, 900)));
  }

  lines.push("");
  lines.push(`<i>Posted ${escapeHtml(formatPostedFreshness(job.postedAt))}</i>`);

  return lines.join("\n");
}

export async function postJobToTelegramChannel(job: TelegramJob): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!token || !channelId) return false;

  const applyUrl = job.applyUrl?.trim() || job.sourceUrl?.trim();
  if (!applyUrl) {
    console.warn("[telegram-poster] skip job without apply URL:", job.title.slice(0, 60));
    return false;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: channelId,
      text: formatTelegramJobMessage(job),
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [[{ text: "Apply", url: applyUrl }]],
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
