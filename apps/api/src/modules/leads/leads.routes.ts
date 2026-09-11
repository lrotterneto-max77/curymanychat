import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";
import { parseLeadsFile, importLeadsFromRows } from "./leads-import.service";
import { normalizePhoneToE164 } from "../../services/phone-normalizer";
import { recordAuditLog } from "../../services/audit-log.service";

export const leadsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

leadsRouter.use(requireAuth);

// Listagem com filtros básicos + RBAC (corretor só vê os próprios leads)
leadsRouter.get("/", async (req, res) => {
  const { status, development, brokerId, tag } = req.query;

  const where: any = {};
  if (status) where.status = status;
  if (development) where.development = development;
  if (tag) where.tags = { has: String(tag) };

  if (req.user!.role === "BROKER") {
    where.brokerId = req.user!.userId;
  } else if (brokerId) {
    where.brokerId = brokerId;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { consent: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  res.json(leads);
});

const manualLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().min(8),
  email: z.string().email().optional(),
  source: z.string().optional(),
  development: z.string().optional(),
  brokerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  optIn: z.boolean(),
  optInSource: z.string().optional(),
  optInText: z.string().optional(),
});

// Cadastro manual
leadsRouter.post("/", async (req, res) => {
  const parsed = manualLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const phoneResult = normalizePhoneToE164(parsed.data.phone);
  if (!phoneResult.valid || !phoneResult.e164) {
    return res.status(400).json({ error: "Telefone inválido" });
  }

  const existing = await prisma.lead.findUnique({ where: { phoneE164: phoneResult.e164 } });
  if (existing) {
    return res.status(409).json({ error: "Já existe um lead com este telefone" });
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phoneE164: phoneResult.e164,
      email: parsed.data.email,
      source: parsed.data.source || "manual",
      development: parsed.data.development,
      brokerId: parsed.data.brokerId,
      tags: parsed.data.tags ?? [],
      notes: parsed.data.notes,
      consent: {
        create: {
          optIn: parsed.data.optIn,
          optInDate: parsed.data.optIn ? new Date() : null,
          optInSource: parsed.data.optIn ? parsed.data.optInSource || "manual" : null,
          optInText: parsed.data.optIn ? parsed.data.optInText : null,
        },
      },
    },
  });

  await recordAuditLog({
    userId: req.user!.userId,
    action: "CREATE_LEAD_MANUAL",
    entityType: "Lead",
    entityId: lead.id,
  });

  res.status(201).json(lead);
});

// Importação em massa CSV/XLSX
leadsRouter.post(
  "/import",
  requireRole(["ADMIN", "MANAGER"]),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    try {
      const rows = parseLeadsFile(req.file.buffer, req.file.mimetype);
      const summary = await importLeadsFromRows(rows, req.user!.userId);

      await recordAuditLog({
        userId: req.user!.userId,
        action: "IMPORT_LEADS",
        entityType: "Lead",
        metadata: summary as any,
      });

      res.json(summary);
    } catch (err) {
      res.status(400).json({ error: "Falha ao processar arquivo", details: String(err) });
    }
  }
);

// Botão manual "NÃO ENVIAR MAIS MENSAGENS"
leadsRouter.post("/:id/opt-out", async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

  await prisma.$transaction([
    prisma.leadConsent.upsert({
      where: { leadId: lead.id },
      update: { optIn: false, optOutDate: new Date(), optOutReason: "manual" },
      create: { leadId: lead.id, optIn: false, optOutDate: new Date(), optOutReason: "manual" },
    }),
    prisma.consentLog.create({
      data: { leadId: lead.id, event: "OPT_OUT", source: "manual_button" },
    }),
    prisma.suppressionList.upsert({
      where: { phoneE164: lead.phoneE164 },
      update: {},
      create: { phoneE164: lead.phoneE164, reason: "opt-out manual" },
    }),
  ]);

  await recordAuditLog({
    userId: req.user!.userId,
    action: "MANUAL_OPT_OUT",
    entityType: "Lead",
    entityId: lead.id,
  });

  res.json({ ok: true });
});
