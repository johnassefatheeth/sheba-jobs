import { prisma } from "@sheba/db";
import { resolveTelegramChannelLink, resolveTelegramGroupLink } from "./telegramPoster.js";
import { subscriberHasFilters } from "./telegramSubscriberMatch.js";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  from?: TelegramUser;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type InlineButton = { text: string; callback_data?: string; url?: string };
type FacetField = "category" | "educationLevel" | "experienceLevel" | "jobType";

const FACET_LABELS: Record<FacetField, string> = {
  category: "job field",
  educationLevel: "education level",
  experienceLevel: "experience level",
  jobType: "job type",
};

const keyboardCache = new Map<string, { field: FacetField; values: string[] }>();

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

async function callBotApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string; result?: T };
  if (!payload.ok) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }
  return payload.result as T;
}

function chatIdString(chatId: number): string {
  return String(chatId);
}

function toggleValue(values: string[], value: string): string[] {
  const exists = values.some((item) => item.toLowerCase() === value.toLowerCase());
  if (exists) {
    return values.filter((item) => item.toLowerCase() !== value.toLowerCase());
  }
  return [...values, value];
}

async function fetchFacetValues(field: FacetField, limit = 12): Promise<string[]> {
  const rows = await prisma.job.groupBy({
    by: [field],
    where: { isExpired: false, [field]: { not: null } },
    _count: { _all: true },
  });

  return rows
    .filter((row) => Boolean((row[field] as string | null)?.trim()))
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, limit)
    .map((row) => row[field] as string);
}

async function upsertSubscriber(from: TelegramUser, chatId: number) {
  return prisma.telegramSubscriber.upsert({
    where: { telegramChatId: chatIdString(chatId) },
    create: {
      telegramChatId: chatIdString(chatId),
      telegramUserId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    },
    update: {
      telegramUserId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    },
  });
}

function formatSubscriberStatus(subscriber: Awaited<ReturnType<typeof upsertSubscriber>>): string {
  const lines = [
    "<b>Your Sheba Jobs alerts</b>",
    "",
    `Status: ${subscriber.isActive ? "✅ Active" : "⏸ Paused"}`,
    `Mode: ${subscriber.receiveAll ? "All new jobs" : "Filtered jobs"}`,
  ];

  if (!subscriber.receiveAll) {
    lines.push(
      "",
      `<b>Fields:</b> ${subscriber.categories.length ? subscriber.categories.join(", ") : "Any"}`,
      `<b>Education:</b> ${subscriber.educationLevels.length ? subscriber.educationLevels.join(", ") : "Any"}`,
      `<b>Experience:</b> ${subscriber.experienceLevels.length ? subscriber.experienceLevels.join(", ") : "Any"}`,
      `<b>Job type:</b> ${subscriber.jobTypes.length ? subscriber.jobTypes.join(", ") : "Any"}`,
      `<b>Remote only:</b> ${subscriber.requireRemote ? "Yes" : "No"}`,
      `<b>Internship only:</b> ${subscriber.requireInternship ? "Yes" : "No"}`
    );
  }

  if (subscriber.isActive && !subscriberHasFilters(subscriber)) {
    lines.push("", "⚠️ Set preferences or choose <b>All jobs</b> to start receiving alerts.");
  }

  return lines.join("\n");
}

function mainMenuKeyboard(): InlineButton[][] {
  const rows: InlineButton[][] = [
    [{ text: "⚙️ Set preferences", callback_data: "menu:prefs" }],
    [{ text: "📋 My settings", callback_data: "menu:status" }],
    [
      { text: "🔔 All jobs", callback_data: "toggle:all:on" },
      { text: "⏸ Pause", callback_data: "toggle:pause" },
    ],
  ];

  const channelLink = resolveTelegramChannelLink();
  if (channelLink) {
    rows.push([{ text: "📢 Join channel", url: channelLink }]);
  }

  const groupLink = resolveTelegramGroupLink();
  if (groupLink) {
    rows.push([{ text: "👥 Join group", url: groupLink }]);
  }

  return rows;
}

function facetKeyboard(
  chatId: number,
  field: FacetField,
  values: string[],
  selected: string[]
): InlineButton[][] {
  keyboardCache.set(chatIdString(chatId), { field, values });

  const rows: InlineButton[][] = [];
  for (let index = 0; index < values.length; index += 2) {
    const row: InlineButton[] = [];
    for (let offset = 0; offset < 2; offset++) {
      const value = values[index + offset];
      if (!value) continue;
      const picked = selected.some((item) => item.toLowerCase() === value.toLowerCase());
      row.push({
        text: `${picked ? "✓ " : ""}${value.slice(0, 28)}`,
        callback_data: `pick:${field}:${index + offset}`,
      });
    }
    rows.push(row);
  }

  rows.push([
    { text: "◀ Back", callback_data: "menu:prefs" },
    { text: "✅ Done", callback_data: "menu:status" },
  ]);

  return rows;
}

async function sendText(
  chatId: number,
  text: string,
  keyboard?: InlineButton[][]
): Promise<void> {
  await callBotApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

async function editText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineButton[][]
): Promise<void> {
  await callBotApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

async function showPrefsMenu(chatId: number, messageId?: number): Promise<void> {
  const text =
    "<b>Choose what to filter on</b>\n\nTap a category to toggle options. Leave empty for “any”. When finished, open <b>My settings</b> to confirm alerts are active.";
  const keyboard: InlineButton[][] = [
    [{ text: "📂 Job field", callback_data: "facet:category" }],
    [{ text: "🎓 Education", callback_data: "facet:educationLevel" }],
    [{ text: "📊 Experience", callback_data: "facet:experienceLevel" }],
    [{ text: "💼 Job type", callback_data: "facet:jobType" }],
    [
      { text: "🌐 Remote only", callback_data: "toggle:remote" },
      { text: "🎯 Internship only", callback_data: "toggle:internship" },
    ],
    [{ text: "◀ Main menu", callback_data: "menu:main" }],
  ];

  if (messageId) {
    await editText(chatId, messageId, text, keyboard);
  } else {
    await sendText(chatId, text, keyboard);
  }
}

async function showFacetPicker(
  chatId: number,
  messageId: number,
  field: FacetField,
  subscriber: Awaited<ReturnType<typeof upsertSubscriber>>
): Promise<void> {
  const values = await fetchFacetValues(field);
  const selected =
    field === "category"
      ? subscriber.categories
      : field === "educationLevel"
        ? subscriber.educationLevels
        : field === "experienceLevel"
          ? subscriber.experienceLevels
          : subscriber.jobTypes;

  const label = FACET_LABELS[field];
  const text = `<b>Select ${label}</b>\n\nTap to toggle. Empty = any ${label}.`;
  await editText(chatId, messageId, text, facetKeyboard(chatId, field, values, selected));
}

async function handleStart(chatId: number, from: TelegramUser): Promise<void> {
  const subscriber = await upsertSubscriber(from, chatId);
  if (!subscriber.isActive) {
    await prisma.telegramSubscriber.update({
      where: { id: subscriber.id },
      data: { isActive: true },
    });
  }

  const channelLink = resolveTelegramChannelLink();
  const groupLink = resolveTelegramGroupLink();
  const communityLines: string[] = [];
  if (channelLink) {
    communityLines.push(`📢 Channel: <a href="${channelLink}">join here</a>`);
  }
  if (groupLink) {
    communityLines.push(`👥 Group: <a href="${groupLink}">join here</a>`);
  }
  const communityBlock = communityLines.length > 0 ? `\n\n${communityLines.join("\n")}` : "";

  await sendText(
    chatId,
    `<b>Welcome to Sheba Jobs</b> 🇪🇹\n\nI can DM you new jobs that match your preferences.${communityBlock}\n\nUse the buttons below to set filters, or send /help anytime.`,
    mainMenuKeyboard()
  );
}

async function handleStatus(chatId: number, from: TelegramUser, messageId?: number): Promise<void> {
  const subscriber = await upsertSubscriber(from, chatId);
  const text = formatSubscriberStatus(subscriber);
  const keyboard = mainMenuKeyboard();

  if (messageId) {
    await editText(chatId, messageId, text, keyboard);
  } else {
    await sendText(chatId, text, keyboard);
  }
}

async function handleHelp(chatId: number): Promise<void> {
  await sendText(
    chatId,
    "<b>Commands</b>\n/start — welcome & menu\n/prefs — set job filters\n/status — your current settings\n/pause — stop alerts\n/resume — turn alerts back on\n/help — this message",
    mainMenuKeyboard()
  );
}

async function handleCommand(chatId: number, from: TelegramUser, text: string): Promise<void> {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase();

  switch (command) {
    case "/start":
      await handleStart(chatId, from);
      return;
    case "/prefs":
      await showPrefsMenu(chatId);
      return;
    case "/status":
      await handleStatus(chatId, from);
      return;
    case "/pause":
      await prisma.telegramSubscriber.updateMany({
        where: { telegramChatId: chatIdString(chatId) },
        data: { isActive: false },
      });
      await sendText(chatId, "⏸ Alerts paused. Send /resume when you want jobs again.", mainMenuKeyboard());
      return;
    case "/resume":
      await prisma.telegramSubscriber.updateMany({
        where: { telegramChatId: chatIdString(chatId) },
        data: { isActive: true },
      });
      await handleStatus(chatId, from);
      return;
    case "/help":
      await handleHelp(chatId);
      return;
    default:
      await sendText(
        chatId,
        "Send /start to set up job alerts, or /help for commands.",
        mainMenuKeyboard()
      );
  }
}

async function handleCallback(query: TelegramCallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data?.trim();
  if (!chatId || !messageId || !data) return;

  const subscriber = await upsertSubscriber(query.from, chatId);

  if (data === "menu:main") {
    await editText(chatId, messageId, "<b>Main menu</b>", mainMenuKeyboard());
    await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (data === "menu:prefs") {
    await showPrefsMenu(chatId, messageId);
    await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (data === "menu:status") {
    await handleStatus(chatId, query.from, messageId);
    await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (data === "toggle:pause") {
    await prisma.telegramSubscriber.update({
      where: { id: subscriber.id },
      data: { isActive: false },
    });
    await editText(chatId, messageId, "⏸ Alerts paused.", mainMenuKeyboard());
    await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (data === "toggle:all:on") {
    await prisma.telegramSubscriber.update({
      where: { id: subscriber.id },
      data: { receiveAll: true, isActive: true },
    });
    await callBotApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "You will receive all new jobs",
    });
    await handleStatus(chatId, query.from, messageId);
    return;
  }

  if (data === "toggle:remote") {
    const updated = await prisma.telegramSubscriber.update({
      where: { id: subscriber.id },
      data: { requireRemote: !subscriber.requireRemote, receiveAll: false, isActive: true },
    });
    await callBotApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: updated.requireRemote ? "Remote only" : "Any location",
    });
    await showPrefsMenu(chatId, messageId);
    return;
  }

  if (data === "toggle:internship") {
    const updated = await prisma.telegramSubscriber.update({
      where: { id: subscriber.id },
      data: { requireInternship: !subscriber.requireInternship, receiveAll: false, isActive: true },
    });
    await callBotApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: updated.requireInternship ? "Internships only" : "Any job type",
    });
    await showPrefsMenu(chatId, messageId);
    return;
  }

  if (data.startsWith("facet:")) {
    const field = data.slice("facet:".length) as FacetField;
    if (field in FACET_LABELS) {
      await showFacetPicker(chatId, messageId, field, subscriber);
    }
    await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }

  if (data.startsWith("pick:")) {
    const [, fieldRaw, indexRaw] = data.split(":");
    const field = fieldRaw as FacetField;
    const index = Number(indexRaw);
    const cache = keyboardCache.get(chatIdString(chatId));
    const value = cache?.field === field ? cache.values[index] : undefined;

    if (value) {
      const updateData =
        field === "category"
          ? { categories: toggleValue(subscriber.categories, value), receiveAll: false, isActive: true }
          : field === "educationLevel"
            ? { educationLevels: toggleValue(subscriber.educationLevels, value), receiveAll: false, isActive: true }
            : field === "experienceLevel"
              ? {
                  experienceLevels: toggleValue(subscriber.experienceLevels, value),
                  receiveAll: false,
                  isActive: true,
                }
              : { jobTypes: toggleValue(subscriber.jobTypes, value), receiveAll: false, isActive: true };

      const updated = await prisma.telegramSubscriber.update({
        where: { id: subscriber.id },
        data: updateData,
      });
      await showFacetPicker(chatId, messageId, field, updated);
      await callBotApi("answerCallbackQuery", { callback_query_id: query.id, text: value });
      return;
    }
  }

  await callBotApi("answerCallbackQuery", { callback_query_id: query.id });
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.text || !message.from) return;
  if (message.chat.type !== "private") return;

  await handleCommand(message.chat.id, message.from, message.text);
}

export async function registerTelegramBotCommands(): Promise<void> {
  await callBotApi("setMyCommands", {
    commands: [
      { command: "start", description: "Welcome & menu" },
      { command: "prefs", description: "Set job filters" },
      { command: "status", description: "Your alert settings" },
      { command: "pause", description: "Pause job alerts" },
      { command: "resume", description: "Resume job alerts" },
      { command: "help", description: "How this bot works" },
    ],
  });
}

export async function pollTelegramUpdates(startOffset = 0): Promise<number> {
  const result = await callBotApi<TelegramUpdate[]>("getUpdates", {
    offset: startOffset,
    timeout: 25,
    allowed_updates: ["message", "callback_query"],
  });

  let nextOffset = startOffset;
  for (const update of result) {
    nextOffset = update.update_id + 1;
    try {
      await handleTelegramUpdate(update);
    } catch (err) {
      console.error("[telegram-bot] update failed:", err);
    }
  }

  return nextOffset;
}
