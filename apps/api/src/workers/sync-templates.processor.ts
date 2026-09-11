import { Job } from "bullmq";
import { syncTemplatesWithMeta } from "../modules/templates/templates.service";
import { logger } from "../utils/logger";

export async function processTemplateSyncJob(_job: Job) {
  const result = await syncTemplatesWithMeta();
  logger.info(result, "Sincronização periódica de templates concluída");
  return result;
}
