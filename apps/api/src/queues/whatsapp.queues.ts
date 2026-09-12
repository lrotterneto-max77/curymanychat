import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { env } from "../utils/env";

export const OUTBOUND_QUEUE_NAME = "whatsapp-outbound";
export const INBOUND_QUEUE_NAME = "whatsapp-inbound";
export const TEMPLATE_SYNC_QUEUE_NAME = "templates-sync";

/**
 * Fila de envio. O rate limiter é calibrado abaixo dos limites informados
 * pela documentação oficial da Meta para a conta/tier atual — nunca
 * configurado para "testar" ou burlar o limite real da API.
 */
export const outboundQueue = new Queue(OUTBOUND_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: false, // falhas definitivas ficam para revisão manual (dead-letter)
  },
});

export const inboundQueue = new Queue(INBOUND_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  },
});

export const templateSyncQueue = new Queue(TEMPLATE_SYNC_QUEUE_NAME, {
  connection: redisConnection,
});

export interface OutboundJobData {
  campaignRecipientId: string;
}

export interface InboundJobData {
  webhookEventId: string;
}

export const outboundRateLimiterOptions = {
  max: env.OUTBOUND_RATE_LIMIT_MAX,
  duration: env.OUTBOUND_RATE_LIMIT_DURATION_MS,
};
