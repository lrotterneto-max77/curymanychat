import { prisma } from "../../utils/prisma";
import { metaApiService } from "../../services/meta-api.service";
import { logger } from "../../utils/logger";

export async function syncTemplatesWithMeta() {
  const metaTemplates = await metaApiService.listTemplates();
  let pausedCampaigns = 0;

  for (const t of metaTemplates) {
    const bodyComponent = Array.isArray(t.components)
      ? (t.components as any[]).find((c) => c.type === "BODY")
      : null;

    const before = await prisma.whatsappTemplate.findUnique({ where: { metaTemplateId: t.id } });

    const updated = await prisma.whatsappTemplate.upsert({
      where: { metaTemplateId: t.id },
      update: {
        name: t.name,
        category: t.category,
        language: t.language,
        status: t.status as any,
        body: bodyComponent?.text || "",
        lastSyncedAt: new Date(),
      },
      create: {
        metaTemplateId: t.id,
        name: t.name,
        category: t.category,
        language: t.language,
        status: t.status as any,
        body: bodyComponent?.text || "",
      },
    });

    const becameBlocked =
      before && before.status === "APPROVED" && (updated.status === "REJECTED" || updated.status === "PAUSED");

    if (becameBlocked) {
      const affected = await prisma.campaign.updateMany({
        where: { templateId: updated.id, status: { in: ["CONFIRMED", "RUNNING"] } },
        data: { status: "PAUSED" },
      });
      pausedCampaigns += affected.count;
      logger.warn(
        { templateId: updated.id, affectedCampaigns: affected.count },
        "Template deixou de estar aprovado — campanhas pausadas automaticamente"
      );
    }
  }

  return { synced: metaTemplates.length, pausedCampaigns };
}
