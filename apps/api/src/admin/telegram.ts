import { readFile } from 'node:fs/promises';
import { resolveChannelPostImageFile, isTelegramPhotoUrl } from './uploads.js';

type ChannelPostPayload = {
  type: string;
  title: string;
  body: string;
  buttonText?: string | null;
  buttonUrl?: string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
};

const TELEGRAM_CAPTION_MAX = 1024;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeButtonUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function resolveTelegramChannelLink(): string | null {
  const custom = process.env.TELEGRAM_CHANNEL_LINK?.trim();
  if (custom) return custom;

  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!channelId) return null;
  if (channelId.startsWith('@')) return `https://t.me/${channelId.slice(1)}`;
  return null;
}

export function formatChannelAnnouncement(post: ChannelPostPayload): string {
  const icon = post.type === 'challenge' ? '🏆' : '📰';
  const label = post.type === 'challenge' ? 'Challenge' : 'News';
  const title = escapeHtml(post.title.trim());
  const body = escapeHtml(post.body.trim()).replace(/\n/g, '\n');

  let message = `${icon} <b>${label}: ${title}</b>\n\n${body}`;

  const link = resolveTelegramChannelLink();
  if (link) {
    const handle = link.replace(/^https?:\/\/t\.me\//i, '').split('/')[0];
    const labelText = handle ? `@${handle}` : 'our channel';
    message += `\n\n📢 <a href="${escapeHtml(link)}">Follow ${escapeHtml(labelText)}</a>`;
  }

  return message;
}

function truncateCaption(text: string): string {
  if (text.length <= TELEGRAM_CAPTION_MAX) return text;
  return text.slice(0, TELEGRAM_CAPTION_MAX - 1).trimEnd() + '…';
}

function telegramBotConfig(): { token: string; channelId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  if (!token || !channelId) return null;
  return { token, channelId };
}

export function telegramConfigured(): boolean {
  return Boolean(telegramBotConfig());
}

function buildReplyMarkup(post: ChannelPostPayload) {
  const buttonUrl = normalizeButtonUrl(post.buttonUrl);
  const buttonText = post.buttonText?.trim();
  if (!buttonUrl || !buttonText) return undefined;

  return {
    inline_keyboard: [[{ text: buttonText.slice(0, 64), url: buttonUrl }]],
  };
}

async function sendTelegramPhotoMultipart(
  token: string,
  channelId: string,
  caption: string,
  imageBuffer: Buffer,
  filename: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> }
): Promise<{ ok: boolean; description?: string; messageId?: string }> {
  const form = new FormData();
  form.append('chat_id', channelId);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([new Uint8Array(imageBuffer)]), filename);
  if (replyMarkup) {
    form.append('reply_markup', JSON.stringify(replyMarkup));
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, description: payload.description ?? response.statusText };
    }
    return {
      ok: true,
      messageId: payload.result?.message_id != null ? String(payload.result.message_id) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, description: message };
  }
}

async function sendTelegramPhotoUrl(
  token: string,
  channelId: string,
  caption: string,
  photoUrl: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> }
): Promise<{ ok: boolean; description?: string; messageId?: string }> {
  const body: Record<string, unknown> = {
    chat_id: channelId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, description: payload.description ?? response.statusText };
    }
    return {
      ok: true,
      messageId: payload.result?.message_id != null ? String(payload.result.message_id) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, description: message };
  }
}

async function sendTelegramText(
  token: string,
  channelId: string,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> }
): Promise<{ ok: boolean; description?: string; messageId?: string }> {
  const body: Record<string, unknown> = {
    chat_id: channelId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, description: payload.description ?? response.statusText };
    }
    return {
      ok: true,
      messageId: payload.result?.message_id != null ? String(payload.result.message_id) : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, description: message };
  }
}

export async function publishChannelPost(
  post: ChannelPostPayload
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const config = telegramBotConfig();
  if (!config) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_CHANNEL_ID not set' };
  }

  const text = formatChannelAnnouncement(post);
  const caption = truncateCaption(text);
  const replyMarkup = buildReplyMarkup(post);
  const localFile = resolveChannelPostImageFile(post.imagePath);
  const remoteUrl = isTelegramPhotoUrl(post.imageUrl) ? post.imageUrl!.trim() : null;

  let result: { ok: boolean; description?: string; messageId?: string };

  if (localFile) {
    const buffer = await readFile(localFile);
    const filename = localFile.split(/[/\\]/).pop() || 'image.jpg';
    result = await sendTelegramPhotoMultipart(
      config.token,
      config.channelId,
      caption,
      buffer,
      filename,
      replyMarkup
    );
    if (!result.ok && remoteUrl) {
      result = await sendTelegramPhotoUrl(config.token, config.channelId, caption, remoteUrl, replyMarkup);
    }
  } else if (remoteUrl) {
    result = await sendTelegramPhotoUrl(config.token, config.channelId, caption, remoteUrl, replyMarkup);
    if (!result.ok) {
      result = await sendTelegramText(config.token, config.channelId, text, replyMarkup);
    }
  } else {
    result = await sendTelegramText(config.token, config.channelId, text, replyMarkup);
  }

  if (!result.ok) {
    return { ok: false, error: result.description ?? 'Telegram send failed' };
  }

  return { ok: true, messageId: result.messageId };
}
