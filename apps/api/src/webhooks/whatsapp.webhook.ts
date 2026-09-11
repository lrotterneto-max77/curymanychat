import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { inboundQueue } from "../queues/whatsapp.queues";

export const whatsappWebhookRouter = Router();

/**
 * Verificação inicial do webhook (handshake exigido pela Meta).
 */
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN) {
    logger.info("Webhook verificado com sucesso pela Meta");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

function isSignatureValid(rawBody: Buffer, signatureHeader?: string): boolean {
  if (!env.META_APP_SECRET || !signatureHeader) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Recebe eventos (status de mensagens e mensagens inbound).
 * Grava o payload cru IMEDIATAMENTE (antes de qualquer parsing) e
 * responde 200 rápido — o processamento pesado vai para a fila,
 * evitando timeout/retentativas desnecessárias da Meta.
 */
whatsappWebhookRouter.post("/", async (req, res) => {
  const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (rawBody && !isSignatureValid(rawBody, signatureHeader)) {
    logger.warn("Webhook com assinatura inválida — descartado");
    return res.sendStatus(401);
  }

  const event = await prisma.webhookEvent.create({
    data: { rawPayload: req.body, type: req.body?.object || "unknown" },
  });

  // resposta imediata — processamento assíncrono via fila
  res.sendStatus(200);

  await inboundQueue.add("process", { webhookEventId: event.id });
});
