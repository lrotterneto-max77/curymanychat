import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { requireAuth } from "../../middlewares/auth.middleware";
import { syncTemplatesWithMeta } from "./templates.service";

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

templatesRouter.get("/", async (_req, res) => {
  const templates = await prisma.whatsappTemplate.findMany({ orderBy: { name: "asc" } });
  res.json(templates);
});

/**
 * Sincroniza templates com a conta oficial da Meta.
 * Se um template antes aprovado virar REJECTED/PAUSED, pausa
 * automaticamente qualquer campanha ativa associada a ele.
 */
templatesRouter.post("/sync", async (_req, res) => {
  try {
    const result = await syncTemplatesWithMeta();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ error: "Falha ao sincronizar templates com a Meta", details: String(err) });
  }
});
