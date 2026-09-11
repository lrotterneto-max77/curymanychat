import { Job } from "bullmq";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { InboundJobData } from "../queues/whatsapp.queues";
import { checkOptOutSpike } from "../services/compliance-engine";

const OPT_OUT_KEYWORDS = ["sair", "parar", "stop", "cancelar", "não quero", "nao quero", "remover"];

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function handleOptOut(phoneE164: string, rawText: string) {
  const lead = await prisma.lead.findUnique({ where: { phoneE164 } });
  if (!lead) return;

  await prisma.$transaction([
    prisma.leadConsent.upsert({
      where: { leadId: lead.id },
      update: { optIn: false, optOutDate: new Date(), optOutReason: "palavra-chave: " + rawText },
      create: {
        leadId: lead.id,
        optIn: false,
        optOutDate: new Date(),
        optOutReason: "palavra-chave: " + rawText,
      },
    }),
    prisma.consentLog.create({
      data: { leadId: lead.id, event: "OPT_OUT", source: "whatsapp_keyword", text: rawText },
    }),
    prisma.suppressionList.upsert({
      where: { phoneE164 },
      update: {},
      create: { phoneE164, reason: "opt-out automático via palavra-chave" },
    }),
  ]);

  logger.info({ leadId: lead.id }, "Opt-out automático registrado via palavra-chave");
  await checkOptOutSpike();
}

async function updateMessageStatus(status: any) {
  const metaMessageId = status.id as string;
  const statusValue = status.status as "sent" | "delivered" | "read" | "failed";

  const data: Record<string, unknown> = { status: statusValue };
  if (statusValue === "delivered") data.deliveredAt = new Date(Number(status.timestamp) * 1000);
  if (statusValue === "read") data.readAt = new Date(Number(status.timestamp) * 1000);
  if (statusValue === "failed") data.failReason = status.errors?.[0]?.title || "falha desconhecida";

  await prisma.message.updateMany({ where: { metaMessageId }, data });

  // reflete status também no CampaignRecipient, se aplicável
  if (statusValue === "delivered" || statusValue === "read") {
    await prisma.campaignRecipient.updateMany({
      where: { messageId: metaMessageId },
      data: { status: statusValue === "delivered" ? "DELIVERED" : "READ" },
    });
  }
}

async function handleInboundMessage(message: any, contactPhone: string) {
  const phoneE164 = "+" + contactPhone;
  const lead = await prisma.lead.findUnique({ where: { phoneE164 } });
  if (!lead) {
    logger.warn({ phoneE164 }, "Mensagem inbound de número não cadastrado como lead");
    return;
  }

  const text: string = message.text?.body || "";

  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: { leadId: lead.id },
      update: { lastCustomerMessageAt: new Date() },
      create: { leadId: lead.id, lastCustomerMessageAt: new Date() },
    });

    await tx.message.create({
      data: {
        leadId: lead.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        metaMessageId: message.id,
        body: text,
        status: "RECEIVED",
      },
    });

    await tx.campaignRecipient.updateMany({
      where: { leadId: lead.id, status: { in: ["SENT", "DELIVERED", "READ"] } },
      data: { status: "REPLIED" },
    });
  });

  const normalized = normalizeText(text);
  if (OPT_OUT_KEYWORDS.some((kw) => normalized === kw || normalized.includes(kw))) {
    await handleOptOut(phoneE164, text);
  }
}

export async function processInboundEventJob(job: Job<InboundJobData>) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: job.data.webhookEventId } });
  if (!event) return;

  const payload = event.rawPayload as any;
  const entries = payload?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;

      for (const status of value?.statuses || []) {
        await updateMessageStatus(status);
      }

      for (const message of value?.messages || []) {
        const contactPhone = value?.contacts?.[0]?.wa_id || message.from;
        await handleInboundMessage(message, contactPhone);
      }
    }
  }

  await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
}
