import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  REDIS_URL: z.string().min(1, "REDIS_URL é obrigatório"),

  JWT_SECRET: z.string().min(10, "JWT_SECRET precisa ter pelo menos 10 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  META_ACCESS_TOKEN: z.string().optional().default(""),
  WEBHOOK_VERIFY_TOKEN: z.string().optional().default(""),
  META_GRAPH_API_VERSION: z.string().default("v20.0"),

  OUTBOUND_QUEUE_CONCURRENCY: z.coerce.number().default(8),
  OUTBOUND_RATE_LIMIT_MAX: z.coerce.number().default(50),
  OUTBOUND_RATE_LIMIT_DURATION_MS: z.coerce.number().default(60000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
