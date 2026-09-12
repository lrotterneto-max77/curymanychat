import { prisma } from "../utils/prisma";

/**
 * Garante que existe uma Conversation para o lead informado (cria se ainda
 * não existir). Usado tanto para vincular mensagens outbound (campanhas,
 * respostas manuais) quanto como base para o upsert feito no processamento
 * de mensagens inbound — para que inbound e outbound sempre apontem para a
 * mesma Conversation por lead (Conversation.leadId é @unique).
 */
export async function getOrCreateConversation(leadId: string) {
  return prisma.conversation.upsert({
    where: { leadId },
    update: {},
    create: { leadId },
  });
}
