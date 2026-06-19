import { prisma } from "@sheba/db/shared";
import { jobMatchesSubscriber } from "./telegramSubscriberMatch.js";
import { sendJobToTelegramChat, type TelegramJob } from "./telegramPoster.js";

const DM_DELAY_MS = 80;

function telegramBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export async function notifyMatchingTelegramSubscribers(job: TelegramJob & { id: string }): Promise<void> {
  if (!telegramBotConfigured()) return;

  const subscribers = await prisma.telegramSubscriber.findMany({
    where: { isActive: true },
  });

  const matching = subscribers.filter((subscriber) => jobMatchesSubscriber(subscriber, job));
  if (matching.length === 0) return;

  for (const subscriber of matching) {
    const alreadySent = await prisma.telegramJobDelivery.findUnique({
      where: {
        subscriberId_jobId: {
          subscriberId: subscriber.id,
          jobId: job.id,
        },
      },
    });
    if (alreadySent) continue;

    const sent = await sendJobToTelegramChat(subscriber.telegramChatId, job);
    if (!sent) continue;

    await prisma.telegramJobDelivery.create({
      data: {
        subscriberId: subscriber.id,
        jobId: job.id,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, DM_DELAY_MS));
  }
}
