import {
  channelPostImageFilename,
  isTelegramPhotoUrl,
  readChannelPostImage,
} from './uploads.js';

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

function resolveTelegramGroupLink(): string | null {
  const custom = process.env.TELEGRAM_GROUP_LINK?.trim();
  if (custom) return custom;

  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  if (!groupId) return null;
  if (groupId.startsWith('@')) return `https://t.me/${groupId.slice(1)}`;
  return null;
}

function getTelegramBroadcastChatIds(): string[] {
  const ids: string[] = [];
  const channelId = process.env.TELEGRAM_BOT_CHANNEL_ID?.trim();
  const groupId = process.env.TELEGRAM_BOT_GROUP_ID?.trim();
  if (channelId) ids.push(channelId);
  if (groupId) ids.push(groupId);
  return ids;
}

export function formatChannelAnnouncement(post: ChannelPostPayload): string {
  const icon = post.type === 'challenge' ? '🏆' : '📰';
  const label = post.type === 'challenge' ? 'Challenge' : 'News';
  const title = escapeHtml(post.title.trim());
  const body = escapeHtml(post.body.trim()).replace(/\n/g, '\n');

  let message = `${icon} <b>${label}: ${title}</b>\n\n${body}`;

  const channelLink = resolveTelegramChannelLink();
  const groupLink = resolveTelegramGroupLink();
  const links: string[] = [];

  if (channelLink) {
    const handle = channelLink.replace(/^https?:\/\/t\.me\//i, '').split('/')[0];
    const labelText = handle ? `@${handle}` : 'our channel';
    links.push(`📢 <a href="${escapeHtml(channelLink)}">Follow ${escapeHtml(labelText)}</a>`);
  }
  if (groupLink) {
    const handle = groupLink.replace(/^https?:\/\/t\.me\//i, '').split('/')[0];
    const labelText = handle ? `@${handle}` : 'our group';
    links.push(`📢 <a href="${escapeHtml(groupLink)}">Join ${escapeHtml(labelText)}</a>`);
  }
  if (links.length > 0) {
    message += `\n\n${links.join('\n')}`;
  }

  return message;
}

function truncateCaption(text: string): string {
  if (text.length <= TELEGRAM_CAPTION_MAX) return text;
  return text.slice(0, TELEGRAM_CAPTION_MAX - 1).trimEnd() + '…';
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && getTelegramBroadcastChatIds().length > 0);
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
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIds = getTelegramBroadcastChatIds();
  if (!token || chatIds.length === 0) {
    return {
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_CHANNEL_ID and/or TELEGRAM_BOT_GROUP_ID not set',
    };
  }

  const text = formatChannelAnnouncement(post);
  const caption = truncateCaption(text);
  const replyMarkup = buildReplyMarkup(post);
  const hasLocalImage = Boolean(post.imagePath);
  const remoteUrl = isTelegramPhotoUrl(post.imageUrl) ? post.imageUrl!.trim() : null;

  let lastMessageId: string | undefined;
  let lastError: string | undefined;

  for (const chatId of chatIds) {
    let result: { ok: boolean; description?: string; messageId?: string };

    if (hasLocalImage) {
      const buffer = await readChannelPostImage(post.imagePath);
      if (!buffer) {
        return { ok: false, error: 'Channel post image not found in storage' };
      }
      const filename = channelPostImageFilename(post.imagePath) || 'image.jpg';
      result = await sendTelegramPhotoMultipart(token, chatId, caption, buffer, filename, replyMarkup);
      if (!result.ok && remoteUrl) {
        result = await sendTelegramPhotoUrl(token, chatId, caption, remoteUrl, replyMarkup);
      }
    } else if (remoteUrl) {
      result = await sendTelegramPhotoUrl(token, chatId, caption, remoteUrl, replyMarkup);
      if (!result.ok) {
        result = await sendTelegramText(token, chatId, text, replyMarkup);
      }
    } else {
      result = await sendTelegramText(token, chatId, text, replyMarkup);
    }

    if (!result.ok) {
      lastError = result.description ?? 'Telegram send failed';
      return { ok: false, error: `${lastError} (chat ${chatId})` };
    }

    lastMessageId = result.messageId;
  }

  return { ok: true, messageId: lastMessageId };
}
