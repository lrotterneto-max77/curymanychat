import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";
import { previewCampaignAudience, confirmAndLaunchCampaign, pauseCampaign } from "./campaigns.service";
import { recordAuditLog } from "../../services/audit-log.service";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    include: { template: true, _count: { select: { recipients: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(campaigns);
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  development: z.string().optional(),
  templateId: z.string(),
  audienceFilter: z.object({
    tags: z.array(z.string()).optional(),
    development: z.string().optional(),
    status: z.string().optional(),
    brokerId: z.string().optional(),
  }),
  scheduledAt: z.string().datetime().optional(),
});

// Cria campanha em rascunho
campaignsRouter.post("/", requireRole(["ADMIN", "MANAGER"]), async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const template = await prisma.whatsappTemplate.findUnique({ where: { id: parsed.data.templateId } });
  if (!template || template.status !== "APPROVED") {
    return res.status(400).json({ error: "Template precisa estar APPROVED para ser usado em campanha" });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      development: parsed.data.development,
      templateId: parsed.data.templateId,
      audienceFilter: parsed.data.audienceFilter,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      createdById: req.user!.userId,
    },
  });

  res.status(201).json(campaign);
});

// Preview de elegibilidade (usado na tela de confirmação)
campaignsRouter.get("/:id/preview", requireRole(["ADMIN", "MANAGER"]), async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada" });

  const preview = await previewCampaignAudience(campaign.audienceFilter as any);
  res.json(preview);
});

// Confirmação explícita — só aqui a campanha é de fato enfileirada
campaignsRouter.post("/:id/confirm", requireRole(["ADMIN", "MANAGER"]), async (req, res) => {
  try {
    const result = await confirmAndLaunchCampaign(req.params.id);
    await recordAuditLog({
      userId: req.user!.userId,
      action: "CONFIRM_CAMPAIGN",
      entityType: "Campaign",
      entityId: req.params.id,
      metadata: { queued: result.queued },
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String((err as Error).message) });
  }
});

campaignsRouter.post("/:id/pause", requireRole(["ADMIN", "MANAGER"]), async (req, res) => {
  const campaign = await pauseCampaign(req.params.id);
  await recordAuditLog({
    userId: req.user!.userId,
    action: "PAUSE_CAMPAIGN",
    entityType: "Campaign",
    entityId: req.params.id,
  });
  res.json(campaign);
});
