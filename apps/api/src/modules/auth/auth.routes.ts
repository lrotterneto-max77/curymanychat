import { Router } from "express";
import { z } from "zod";
import { login, createUser } from "./auth.service";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";
import { recordAuditLog } from "../../services/audit-log.service";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    await recordAuditLog({
      userId: result.user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: result.user.id,
    });
    return res.json(result);
  } catch {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MANAGER", "BROKER"]),
});

// Apenas ADMIN pode criar usuários
authRouter.post("/users", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const user = await createUser(parsed.data);
  await recordAuditLog({
    userId: req.user!.userId,
    action: "CREATE_USER",
    entityType: "User",
    entityId: user.id,
  });

  return res.status(201).json(user);
});
