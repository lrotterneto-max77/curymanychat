import { env } from "../utils/env";
import { logger } from "../utils/logger";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

export class MetaRateLimitError extends Error {
  constructor(public retryAfterSeconds: number | null) {
    super("Rate limit atingido na Meta Cloud API");
    this.name = "MetaRateLimitError";
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public payload: unknown
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface SendTemplateParams {
  toE164: string; // ex: +5511999999999
  templateName: string;
  languageCode: string; // ex: pt_BR
  components?: Array<Record<string, unknown>>;
}

interface SendTextParams {
  toE164: string;
  body: string;
}

interface SendResult {
  metaMessageId: string;
}

/**
 * Camada isolada de comunicação com a WhatsApp Cloud API (Meta) oficial.
 * Nenhum outro módulo do sistema deve chamar graph.facebook.com diretamente.
 */
class MetaApiService {
  private phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  private accessToken = env.META_ACCESS_TOKEN;

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${GRAPH_BASE}/${path}`;
    const response = await fetch(url, init);

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
      logger.warn({ retryAfterSeconds }, "Meta Cloud API retornou 429 (rate limit)");
      throw new MetaRateLimitError(retryAfterSeconds);
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        (json as any)?.error?.message || `Erro na chamada à Meta Cloud API (${response.status})`;
      logger.error({ status: response.status, body: json }, "Erro na Meta Cloud API");
      throw new MetaApiError(message, response.status, json);
    }

    return json as T;
  }

  /** Envia mensagem de template (uso permitido para iniciar/reengajar conversa). */
  async sendTemplateMessage(params: SendTemplateParams): Promise<SendResult> {
    const body = {
      messaging_product: "whatsapp",
      to: params.toE164.replace("+", ""),
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        components: params.components ?? [],
      },
    };

    const result = await this.request<{ messages: Array<{ id: string }> }>(
      `${this.phoneNumberId}/messages`,
      { method: "POST", headers: this.authHeaders(), body: JSON.stringify(body) }
    );

    return { metaMessageId: result.messages[0].id };
  }

  /** Envia mensagem de texto livre — só válido dentro da janela de atendimento de 24h. */
  async sendTextMessage(params: SendTextParams): Promise<SendResult> {
    const body = {
      messaging_product: "whatsapp",
      to: params.toE164.replace("+", ""),
      type: "text",
      text: { body: params.body },
    };

    const result = await this.request<{ messages: Array<{ id: string }> }>(
      `${this.phoneNumberId}/messages`,
      { method: "POST", headers: this.authHeaders(), body: JSON.stringify(body) }
    );

    return { metaMessageId: result.messages[0].id };
  }

  /** Lista templates da WABA (para sincronização periódica). */
  async listTemplates(): Promise<
    Array<{ id: string; name: string; category: string; language: string; status: string; components: unknown }>
  > {
    const result = await this.request<{ data: any[] }>(
      `${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=200`,
      { method: "GET", headers: this.authHeaders() }
    );
    return result.data;
  }

  /** Consulta qualidade/status do número (para o painel de compliance). */
  async getPhoneNumberHealth(): Promise<any> {
    return this.request<any>(
      `${this.phoneNumberId}?fields=quality_rating,name_status,verified_name,code_verification_status`,
      { method: "GET", headers: this.authHeaders() }
    );
  }
}

export const metaApiService = new MetaApiService();
