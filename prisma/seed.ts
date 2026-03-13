/**
 * Prisma seed script.
 *
 * Creates a development restaurant and owner account.
 * Run with: npm run db:seed
 *
 * Credentials for local dev:
 *   Email:    owner@pizzaria-demo.com
 *   Password: demo1234
 *   Slug:     pizzaria-demo
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding database...");

  // Idempotent: skip if already exists
  const existing = await prisma.restaurant.findUnique({
    where: { slug: "pizzaria-demo" },
  });

  if (existing) {
    console.log("✅  Seed data already exists. Skipping.");
    return;
  }

  const hashedPassword = await hash("demo1234", 12);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Pizzaria Demo",
      slug: "pizzaria-demo",
      phone: "+5511999990000",
      email: "contato@pizzaria-demo.com",
      address: "Rua das Pizzas, 123 – São Paulo, SP",
      timezone: "America/Sao_Paulo",
      plan: "STARTER",
      users: {
        create: {
          name: "Proprietário Demo",
          email: "owner@pizzaria-demo.com",
          password: hashedPassword,
          role: "OWNER",
        },
      },
    },
    include: { users: { select: { id: true, email: true, role: true } } },
  });

  console.log(`✅  Restaurant created: ${restaurant.name} (${restaurant.slug})`);
  console.log(`✅  Owner created: ${restaurant.users[0]?.email}`);
  console.log("\n📋  Dev credentials:");
  console.log("   Slug:     pizzaria-demo");
  console.log("   Email:    owner@pizzaria-demo.com");
  console.log("   Password: demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
