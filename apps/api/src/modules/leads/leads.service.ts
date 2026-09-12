import { prisma } from "../../utils/prisma";
import { logger } from "../../utils/logger";

/**
 * Busca um lead pelo telefone (E.164). Se não existir, cria automaticamente
 * um lead mínimo a partir do número — usado quando chega uma mensagem pelo
 * webhook de um telefone ainda não cadastrado no CRM.
 *
 * IMPORTANTE: o lead criado desta forma nasce SEM opt-in de marketing
 * (consent.optIn = false). O fato de o cliente ter escrito no WhatsApp não é,
 * por si só, consentimento para receber campanhas/templates — apenas
 * habilita a empresa a responder dentro da janela de atendimento de 24h
 * (ver src/services/compliance-engine.ts). Esse lead só passa a ser
 * elegível para campanhas se um opt-in explícito for registrado depois
 * (import, cadastro manual, ou fluxo de consentimento futuro).
 */
export async function findOrCreateLeadByPhone(phoneE164: string) {
  const existing = await prisma.lead.findUnique({ where: { phoneE164 } });
  if (existing) return existing;

  const lead = await prisma.lead.create({
    data: {
      firstName: "Lead WhatsApp",
      phoneE164,
      source: "whatsapp_inbound",
      consent: { create: { optIn: false } },
    },
  });

  logger.info({ leadId: lead.id, phoneE164 }, "Lead criado automaticamente a partir de mensagem inbound");
  return lead;
}
