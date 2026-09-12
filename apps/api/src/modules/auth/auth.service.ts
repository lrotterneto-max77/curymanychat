import bcrypt from "bcryptjs";
import jwt, { SignOptions } from
import { prisma } from "../../utils/prisma";
import { env } from "../../utils/env";

export interface JwtPayload {
  userId: string;
  role: "ADMIN" | "MANAGER" | "BROKER";
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active) {
    throw new Error("Credenciais inválidas");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new Error("Credenciais inválidas");
  }

  const token = jwt.sign({ userId: user.id, role: user.role } as JwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function createUser(params: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MANAGER" | "BROKER";
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
