import { Router, Request } from "express";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { requireAuth } from "../../middlewares/auth.middleware";
import { sendManualTextMessage, listConversations, getConversationDetail } from "./conversations.service";
import { recordAuditLog } from "../../services/audit-log.service";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

/**
 * Corretor só pode agir sobre leads atribuídos a ele mesmo.
 * ADMIN/MANAGER têm acesso a qualquer lead.
 */
async function hasAccessToLead(req: Request, leadId: string): Promise<boolean> {
  if (req.user!.role !== "BROKER") return true;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { brokerId: true } });
  return !!lead && lead.brokerId === req.user!.userId;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).optional(),
});

// Lista conversas (inbox), ordenadas por atividade mais recente.
// BROKER só vê as suas; ADMIN/MANAGER veem todas — mesmo modelo já usado em GET /leads.
conversationsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetros inválidos", details: parsed.error.flatten() });
  }

  const result = await listConversations({
    requesterRole: req.user!.role,
    requesterId: req.user!.userId,
    search: parsed.data.q,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return res.json(result);
});

const sendMessageSchema = z.object({
  body: z.string().min(1, "mensagem vazia").max(4096),
});

// Envio manual de mensagem de texto (mensagem de sessão) para um lead.
// Bloqueado pelo compliance-engine se a janela de atendimento estiver fechada.
conversationsRouter.post("/:leadId/messages", async (req, res) => {
  const { leadId } = req.params;

  if (!(await hasAccessToLead(req, leadId))) {
    return res.status(403).json({ error: "Acesso negado a este lead" });
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const result = await sendManualTextMessage(leadId, parsed.data.body);

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  await recordAuditLog({
    userId: req.user!.userId,
    action: "SEND_MANUAL_MESSAGE",
    entityType: "Message",
    entityId: result.message.id,
    metadata: { leadId },
  });

  return res.status(201).json(result.message);
});

// Detalhe da conversa: dados do lead, histórico cronológico de mensagens e windowOpen.
conversationsRouter.get("/:leadId", async (req, res) => {
  const { leadId } = req.params;

  if (!(await hasAccessToLead(req, leadId))) {
    return res.status(403).json({ error: "Acesso negado a este lead" });
  }

  const conversation = await getConversationDetail(leadId);

  if (!conversation) {
    return res.status(404).json({ error: "Conversa não encontrada para este lead" });
  }

  return res.json(conversation);
});
