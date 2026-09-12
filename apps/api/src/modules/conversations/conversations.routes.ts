import { Router, Request } from "express";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { requireAuth } from "../../middlewares/auth.middleware";
import { sendManualTextMessage } from "./conversations.service";
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

// Leitura da conversa (histórico de mensagens) — usada para conferir que
// inbound e outbound ficam sempre na mesma Conversation por lead.
conversationsRouter.get("/:leadId", async (req, res) => {
  const { leadId } = req.params;

  if (!(await hasAccessToLead(req, leadId))) {
    return res.status(403).json({ error: "Acesso negado a este lead" });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { leadId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return res.status(404).json({ error: "Conversa não encontrada para este lead" });
  }

  return res.json(conversation);
});
