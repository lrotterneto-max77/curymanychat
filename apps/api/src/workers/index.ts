import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../queues/connection";
import {
  OUTBOUND_QUEUE_NAME,
  INBOUND_QUEUE_NAME,
  TEMPLATE_SYNC_QUEUE_NAME,
  outboundRateLimiterOptions,
  templateSyncQueue,
} from "../queues/whatsapp.queues";
import { processSendMessageJob } from "./send-message.processor";
import { processInboundEventJob } from "./inbound-event.processor";
import { processTemplateSyncJob } from "./sync-templates.processor";
import { logger } from "../utils/logger";
import { env } from "../utils/env";

// Worker de envio — concorrência e rate limit calibrados conforme .env,
// que por sua vez deve refletir os limites reais informados pela Meta.
const outboundWorker = new Worker(OUTBOUND_QUEUE_NAME, processSendMessageJob, {
  connection: redisConnection,
  concurrency: env.OUTBOUND_QUEUE_CONCURRENCY,
  limiter: outboundRateLimiterOptions,
});

const inboundWorker = new Worker(INBOUND_QUEUE_NAME, processInboundEventJob, {
  connection: redisConnection,
  concurrency: 5,
});

const templateSyncWorker = new Worker(TEMPLATE_SYNC_QUEUE_NAME, processTemplateSyncJob, {
  connection: redisConnection,
  concurrency: 1,
});

for (const worker of [outboundWorker, inboundWorker, templateSyncWorker]) {
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: worker.name, err }, "Job falhou");
  });
}

// Agenda sincronização periódica de templates (a cada 6 horas)
async function scheduleTemplateSync() {
  await templateSyncQueue.add(
    "sync",
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: "template-sync-recurring" }
  );
}
scheduleTemplateSync().catch((err) => logger.error(err, "Falha ao agendar sync de templates"));

logger.info("Workers iniciados: outbound, inbound, template-sync");
