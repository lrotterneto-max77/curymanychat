import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "./utils/env";
import { logger } from "./utils/logger";
import { errorHandler } from "./middlewares/error-handler";
import { authRouter } from "./modules/auth/auth.routes";
import { leadsRouter } from "./modules/leads/leads.routes";
import { templatesRouter } from "./modules/templates/templates.routes";
import { campaignsRouter } from "./modules/campaigns/campaigns.routes";
import { conversationsRouter } from "./modules/conversations/conversations.routes";
import { whatsappWebhookRouter } from "./webhooks/whatsapp.webhook";

const app = express();

app.use(helmet());
app.use(cors());
app.use(pinoHttp({ logger }));

// captura o corpo bruto (necessário para validar assinatura do webhook da Meta)
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Rate limiting geral da API (proteção própria da aplicação, não relacionado a limites da Meta)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/webhooks/whatsapp", whatsappWebhookRouter);

app.use("/auth", authRouter);
app.use("/leads", leadsRouter);
app.use("/templates", templatesRouter);
app.use("/campaigns", campaignsRouter);
app.use("/conversations", conversationsRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`API rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});
