import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  logger.error({ err, path: req.path }, "Erro não tratado");
  res.status(500).json({ error: "Erro interno do servidor" });
}
