import { prisma } from "../../utils/prisma";
import { metaApiService, MetaApiError } from "../../services/meta-api.service";
import { checkCanSendToLead, isSessionWindowOpen } from "../../services/compliance-engine";
import { getOrCreateConversation } from "../../services/conversation.service";

type Role = "ADMIN" | "MANAGER" | "BROKER";

export interface ConversationListItem {
  leadId: string;
  leadName: string;
  phone: string;
  brokerName: string | null;
  status: string;
  lastMessage: string | null;
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
  lastMessageAt: string | null;
  windowOpen: boolean;
}

interface ListConversationsParams {
  requesterRole: Role;
  requesterId: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ListConversationsResult {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista conversas ordenadas pela atividade mais recente (última mensagem,
 * em qualquer direção). RBAC: BROKER só vê conversas de leads atribuídos a
 * ele mesmo; ADMIN/MANAGER veem todas — mesmo modelo de autorização já
 * usado em GET /leads.
 *
 * NOTA DE ESCALA: a ordenação por "última mensagem" é feita em memória
 * (busca todas as conversas que batem no filtro, depois pagina), porque o
 * schema atual não tem uma coluna dedicada de "última atividade" na
 * Conversation. Funciona bem no volume atual; se o número de conversas
 * crescer muito, vale considerar adicionar um campo `lastMessageAt`
 * atualizado a cada mensagem (inbound e outbound) para ordenar/paginar
 * direto no banco.
 */
export async function listConversations(params: ListConversationsParams): Promise<ListConversationsResult> {
  const { requesterRole, requesterId, search, page, pageSize } = params;

  const leadFilter: Record<string, unknown> = {};
  if (requesterRole === "BROKER") {
    leadFilter.brokerId = requesterId;
  }
  if (search) {
    leadFilter.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { phoneE164: { contains: search, mode: "insensitive" } },
    ];
  }

  const where = { lead: leadFilter };

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: {
        lead: {
          select: {
            firstName: true,
            lastName: true,
            phoneE164: true,
            broker: { select: { name: true } },
          },
        },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const items: ConversationListItem[] = conversations.map((c) => {
    const lastMessage = c.messages[0] ?? null;
    const lastMessageAt = lastMessage?.createdAt ?? c.lastCustomerMessageAt ?? null;

    return {
      leadId: c.leadId,
      leadName: [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" "),
      phone: c.lead.phoneE164,
      brokerName: c.lead.broker?.name ?? null,
      status: c.status,
      lastMessage: lastMessage?.body ?? null,
      lastMessageDirection: lastMessage?.direction ?? null,
      lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
      windowOpen: isSessionWindowOpen(c.lastCustomerMessageAt),
    };
  });

  items.sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  const paged = items.slice((page - 1) * pageSize, page * pageSize);

  return { items: paged, total, page, pageSize };
}

/**
 * Detalhe de uma conversa (dados do lead + histórico cronológico de
 * mensagens + windowOpen). Retorna null se não houver Conversation para
 * o lead ainda (lead existe mas nunca trocou mensagem).
 */
export async function getConversationDetail(leadId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { leadId },
    include: {
      lead: {
        select: {
          firstName: true,
          lastName: true,
          phoneE164: true,
          status: true,
          broker: { select: { name: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) return null;

  return {
    ...conversation,
    windowOpen: isSessionWindowOpen(conversation.lastCustomerMessageAt),
  };
}

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
