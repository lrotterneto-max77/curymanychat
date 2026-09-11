import { Job } from "bullmq";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { metaApiService, MetaRateLimitError, MetaApiError } from "../services/meta-api.service";
import { checkCanSendToLead, recordComplianceBlock } from "../services/compliance-engine";
import { outboundQueue, OutboundJobData } from "../queues/whatsapp.queues";

/**
 * Processa um job de envio de mensagem de campanha.
 * Revalida compliance imediatamente antes de chamar a Meta (defesa em
 * profundidade — a primeira validação já ocorreu ao montar a campanha).
 */
export async function processSendMessageJob(job: Job<OutboundJobData>) {
  const { campaignRecipientId } = job.data;

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: campaignRecipientId },
    include: { lead: true, campaign: { include: { template: true } } },
  });

  if (!recipient) {
    logger.warn({ campaignRecipientId }, "CampaignRecipient não encontrado — job descartado");
    return;
  }

  // idempotência: se já não estiver mais QUEUED, não reenvia
  if (recipient.status !== "QUEUED") {
    logger.info({ campaignRecipientId, status: recipient.status }, "Job ignorado — já processado");
    return;
  }

  const compliance = await checkCanSendToLead({
    leadId: recipient.leadId,
    templateId: recipient.campaign.templateId,
  });

  if (!compliance.allowed) {
    await recordComplianceBlock(recipient.leadId, compliance.reason, { campaignRecipientId });
    await prisma.campaignRecipient.update({
      where: { id: campaignRecipientId },
      data: { status: "SKIPPED", skipReason: compliance.reason },
    });
    return;
  }

  try {
    const result = await metaApiService.sendTemplateMessage({
      toE164: recipient.lead.phoneE164,
      templateName: recipient.campaign.template.name,
      languageCode: recipient.campaign.template.language,
    });

    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: campaignRecipientId },
        data: { status: "SENT", messageId: result.metaMessageId },
      }),
      prisma.message.create({
        data: {
          leadId: recipient.leadId,
          direction: "OUTBOUND",
          metaMessageId: result.metaMessageId,
          templateId: recipient.campaign.templateId,
          status: "SENT",
          sentAt: new Date(),
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      // pausa a FILA inteira (não só o job) até o tempo indicado pela Meta
      const pauseMs = (err.retryAfterSeconds ?? 30) * 1000;
      logger.warn({ pauseMs }, "Pausando fila de envio por rate limit da Meta");
      await outboundQueue.pause();
      setTimeout(() => outboundQueue.resume(), pauseMs);
      throw err; // reenfileira este job via retry/backoff do BullMQ
    }

    const reason = err instanceof MetaApiError ? err.message : "erro desconhecido ao enviar";
    await prisma.campaignRecipient.update({
      where: { id: campaignRecipientId },
      data: { status: "FAILED", skipReason: reason },
    });
    logger.error({ err, campaignRecipientId }, "Falha ao enviar mensagem via Meta Cloud API");
  }
}
