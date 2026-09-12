import { prisma } from "../../utils/prisma";
import { metaApiService, MetaApiError } from "../../services/meta-api.service";
import { checkCanSendToLead } from "../../services/compliance-engine";
import { getOrCreateConversation } from "../../services/conversation.service";

type SendManualMessageResult =
  | { ok: true; message: Awaited<ReturnType<typeof prisma.message.create>> }
  | { ok: false; status: number; error: string };

/**
 * Envia uma mensagem de texto livre (mensagem de sessão) para um lead,
 * usando o mesmo sendTextMessage() já usado pelo restante do sistema.
 * Só é permitido dentro da janela de atendimento aberta — quem decide
 * isso é o compliance-engine já existente, não esta função.
 */
export async function sendManualTextMessage(leadId: string, body: string): Promise<SendManualMessageResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return { ok: false, status: 404, error: "Lead não encontrado" };
  }

  const compliance = await checkCanSendToLead({ leadId, templateId: null });
  if (!compliance.allowed) {
    return { ok: false, status: 400, error: compliance.reason };
  }

  const conversation = await getOrCreateConversation(leadId);

  try {
    const result = await metaApiService.sendTextMessage({ toE164: lead.phoneE164, body });

    const message = await prisma.message.create({
      data: {
        leadId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        metaMessageId: result.metaMessageId,
        body,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return { ok: true, message };
  } catch (err) {
    const reason = err instanceof MetaApiError ? err.message : "Falha ao enviar mensagem via Meta Cloud API";
    return { ok: false, status: 502, error: reason };
  }
}
