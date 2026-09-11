import { prisma } from "../../utils/prisma";
import { outboundQueue } from "../../queues/whatsapp.queues";
import { logger } from "../../utils/logger";

interface AudienceFilter {
  tags?: string[];
  development?: string;
  status?: string;
  brokerId?: string;
}

function buildAudienceWhere(filter: AudienceFilter) {
  const where: any = {};
  if (filter.tags?.length) where.tags = { hasSome: filter.tags };
  if (filter.development) where.development = filter.development;
  if (filter.status) where.status = filter.status;
  if (filter.brokerId) where.brokerId = filter.brokerId;
  return where;
}

/**
 * Calcula o preview de elegibilidade mostrado na tela de confirmação
 * ANTES de qualquer campanha ser efetivamente criada/enfileirada.
 */
export async function previewCampaignAudience(filter: AudienceFilter) {
  const where = buildAudienceWhere(filter);
  const candidates = await prisma.lead.findMany({
    where,
    include: { consent: true },
  });

  const suppressionPhones = new Set(
    (await prisma.suppressionList.findMany({ select: { phoneE164: true } })).map((s) => s.phoneE164)
  );

  const seenPhones = new Set<string>();
  let withOptIn = 0;
  let withoutOptIn = 0;
  let duplicates = 0;
  let invalid = 0;
  let optedOut = 0;
  let eligible = 0;

  for (const lead of candidates) {
    if (!lead.phoneE164?.startsWith("+")) {
      invalid++;
      continue;
    }
    if (seenPhones.has(lead.phoneE164)) {
      duplicates++;
      continue;
    }
    seenPhones.add(lead.phoneE164);

    if (suppressionPhones.has(lead.phoneE164)) {
      optedOut++;
      continue;
    }

    if (!lead.consent?.optIn) {
      withoutOptIn++;
      continue;
    }

    withOptIn++;
    eligible++;
  }

  return {
    totalSelected: candidates.length,
    withOptIn,
    withoutOptIn,
    duplicates,
    invalid,
    optedOut,
    eligible,
    eligibleLeadIds: candidates
      .filter((l) => l.consent?.optIn && l.phoneE164?.startsWith("+") && !suppressionPhones.has(l.phoneE164))
      .map((l) => l.id),
  };
}

/**
 * Confirma e ativa a campanha: cria um CampaignRecipient por lead elegível
 * e enfileira apenas esses. Nenhum lead sem opt-in válido chega aqui.
 */
export async function confirmAndLaunchCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campanha não encontrada");
  if (campaign.status !== "DRAFT") throw new Error("Campanha já foi confirmada anteriormente");

  const filter = campaign.audienceFilter as AudienceFilter;
  const preview = await previewCampaignAudience(filter);

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "CONFIRMED" } });

    for (const leadId of preview.eligibleLeadIds) {
      await tx.campaignRecipient.upsert({
        where: { campaignId_leadId: { campaignId, leadId } },
        update: {},
        create: { campaignId, leadId, status: "PENDING" },
      });
    }
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
  });

  for (const recipient of recipients) {
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "QUEUED" } });
    await outboundQueue.add("send", { campaignRecipientId: recipient.id });
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  logger.info({ campaignId, queued: recipients.length }, "Campanha confirmada e enfileirada");

  return { queued: recipients.length, preview };
}

export async function pauseCampaign(campaignId: string) {
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
}
