import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@imobiliaria.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@imobiliaria.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Usuário admin criado/confirmado:", admin.email, "(senha inicial: admin123 — troque em produção)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
