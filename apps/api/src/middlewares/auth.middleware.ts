import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../modules/auth/auth.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token ausente" });
  }

  try {
    const token = header.replace("Bearer ", "");
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireRole(roles: Array<"ADMIN" | "MANAGER" | "BROKER">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Acesso negado para este perfil" });
    }
    return next();
  };
}
