import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";

export type ComplianceCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export const SESSION_WINDOW_HOURS = 24;

interface CheckSendParams {
  leadId: string;
  templateId?: string | null; // se null, é mensagem de sessão (texto livre)
}

/**
 * Única fonte de verdade para a regra da janela de atendimento de 24h.
 * Usada pelo compliance-engine (para decidir se pode enviar) e pelo módulo
 * de conversas (para expor `windowOpen` na API) — nunca duplicar este
 * cálculo em outro lugar do backend, e nunca reimplementar no frontend.
 */
export function isSessionWindowOpen(lastCustomerMessageAt: Date | null | undefined): boolean {
  return (
    !!lastCustomerMessageAt &&
    Date.now() - new Date(lastCustomerMessageAt).getTime() < SESSION_WINDOW_HOURS * 60 * 60 * 1000
  );
}

/**
 * Verifica, em ordem, todas as condições exigidas antes de QUALQUER envio.
 * Deve ser chamado (a) ao montar a lista de destinatários de uma campanha
 * e (b) novamente pelo worker, imediatamente antes de chamar a Meta API.
 * Nunca pular etapas por "otimização".
 */
export async function checkCanSendToLead(params: CheckSendParams): Promise<ComplianceCheckResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    include: { consent: true, conversation: true },
  });

  if (!lead) {
    return { allowed: false, reason: "lead não encontrado" };
  }

  // 1. Telefone válido (já deveria estar normalizado, mas revalida formato básico)
  if (!lead.phoneE164 || !lead.phoneE164.startsWith("+")) {
    return { allowed: false, reason: "telefone inválido / não normalizado" };
  }

  // 2. Suppression list é a fonte de verdade final de opt-out
  const suppressed = await prisma.suppressionList.findUnique({
    where: { phoneE164: lead.phoneE164 },
  });
  if (suppressed) {
    return { allowed: false, reason: `contato em suppression list (${suppressed.reason})` };
  }

  if (params.templateId) {
    // Envio via template (campanha / mensagem de negócio-iniciada): continua
    // exigindo opt-in de marketing explícito, além do template aprovado.
    // Comportamento IDÊNTICO ao anterior — nada muda aqui para campanhas.
    if (!lead.consent || !lead.consent.optIn) {
      return { allowed: false, reason: "lead sem opt-in válido" };
    }

    const template = await prisma.whatsappTemplate.findUnique({ where: { id: params.templateId } });
    if (!template) {
      return { allowed: false, reason: "template não encontrado" };
    }
    if (template.status !== "APPROVED") {
      return { allowed: false, reason: `template com status ${template.status}, não aprovado` };
    }
  } else {
    // Mensagem de sessão (resposta humana dentro da janela de atendimento):
    // pela política da Meta, o cliente ao escrever primeiro já habilita a
    // empresa a responder dentro da janela de 24h — isso é distinto do
    // opt-in de marketing exigido para campanhas/templates. Por isso NÃO
    // exigimos lead.consent.optIn aqui; o gate é a suppression list (já
    // verificada acima) e a janela de atendimento estar aberta.
    if (!isSessionWindowOpen(lead.conversation?.lastCustomerMessageAt)) {
      return {
        allowed: false,
        reason: "janela de atendimento fechada — é necessário usar um template aprovado",
      };
    }
  }

  return { allowed: true };
}

/**
 * Registra um evento de bloqueio de compliance para aparecer no painel
 * "Saúde do WhatsApp".
 */
export async function recordComplianceBlock(leadId: string, reason: string, context?: Record<string, unknown>) {
  logger.warn({ leadId, reason, context }, "Envio bloqueado pelo compliance engine");
  await prisma.complianceEvent.create({
    data: {
      type: "BLOCKED_SEND",
      severity: "INFO",
      message: `Envio bloqueado para lead ${leadId}: ${reason}`,
      metadata: { leadId, reason, ...context },
    },
  });
}

/**
 * Verifica pico de opt-outs nas últimas horas e gera alerta preventivo.
 * Chamado periodicamente (job) e após cada opt-out processado.
 */
export async function checkOptOutSpike(windowHours = 24, threshold = 10) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const count = await prisma.consentLog.count({
    where: { event: "OPT_OUT", createdAt: { gte: since } },
  });

  if (count >= threshold) {
    await prisma.complianceEvent.create({
      data: {
        type: "OPT_OUT_SPIKE",
        severity: "WARNING",
        message: `${count} opt-outs nas últimas ${windowHours}h. Recomendamos revisar a campanha ativa antes de continuar.`,
        metadata: { count, windowHours },
      },
    });
  }
}
