/**
 * One-time seed: fills MenuCategory.description for complex Japanese/specialty
 * categories that benefit from a short explanation in the ordering UI.
 *
 * Rules:
 *   - Only updates rows where description IS NULL (never overwrites).
 *   - Matches by normalized category name (case-insensitive, accent-insensitive).
 *   - Safe to run multiple times (idempotent).
 *
 * Run with:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-category-descriptions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DESCRIPTIONS: Array<{ namePattern: RegExp; description: string }> = [
  {
    namePattern: /^sashimis?$/i,
    description:
      "Fatias de peixe fresco servidas sem arroz, valorizando textura, sabor e frescor.",
  },
  {
    namePattern: /^niguiris?$/i,
    description:
      "Bolinho de arroz japonês coberto com peixe ou frutos do mar, servido em porções delicadas.",
  },
  {
    namePattern: /^uramakis?$/i,
    description:
      "Sushi enrolado com arroz por fora, alga por dentro e recheios variados.",
  },
  {
    namePattern: /^hossomakis?$/i,
    description:
      "Sushi enrolado com alga por fora, arroz e recheio simples no centro.",
  },
  {
    namePattern: /^temakis?$/i,
    description:
      "Cone de alga recheado com arroz, peixe e complementos, feito para comer com as mãos.",
  },
  {
    namePattern: /^hot[\s.-]?rolls?$/i,
    description:
      "Sushi empanado e frito, servido quente, crocante por fora e cremoso por dentro.",
  },
  {
    namePattern: /^jhow$/i,
    description:
      "Sushi especial sem alga externa, geralmente envolto por peixe e finalizado com recheios cremosos.",
  },
  {
    namePattern: /^pokes?$/i,
    description:
      "Bowl com base de arroz e ingredientes frescos, combinando peixe, legumes, molhos e toppings.",
  },
  {
    namePattern: /^l[aá]mens?$|^ramens?$/i,
    description:
      "Caldo quente com macarrão oriental, proteínas e acompanhamentos, servido como prato completo.",
  },
  {
    namePattern: /^pratos?\s+quentes?$/i,
    description:
      "Opções quentes e completas para quem prefere pratos preparados na hora.",
  },
  {
    namePattern: /^por[çc][oõ]es?$/i,
    description:
      "Entradas e acompanhamentos para compartilhar ou complementar o pedido.",
  },
  {
    namePattern: /^combos?$/i,
    description:
      "Combinações montadas para quem quer variedade em um pedido mais completo.",
  },
  {
    namePattern: /^festival\s+cazza/i,
    description:
      "Seleção completa da casa para quem quer experimentar várias opções em um só pedido.",
  },
  {
    namePattern: /^molho|^extra|^hashi/i,
    description:
      "Complementos, molhos e utensílios para personalizar ou acompanhar o pedido.",
  },
  {
    namePattern: /^cazza\s+hot$/i,
    description:
      "Criações quentes e especiais da casa, com combinações marcantes e finalização caprichada.",
  },
  {
    namePattern: /^rod[ií]zio\s+presencial$/i,
    description:
      "Opção disponível para consumo no salão, conforme regras e disponibilidade do restaurante.",
  },
];

async function main() {
  console.log("🌱  Seeding category descriptions…");

  const categories = await prisma.menuCategory.findMany({
    where:  { description: null },
    select: { id: true, name: true },
  });

  console.log(`   Found ${categories.length} categories with no description.`);

  let updated = 0;
  for (const cat of categories) {
    const match = DESCRIPTIONS.find((d) => d.namePattern.test(cat.name.trim()));
    if (!match) continue;

    await prisma.menuCategory.update({
      where: { id: cat.id },
      data:  { description: match.description },
    });
    console.log(`   ✅  ${cat.name} → "${match.description.slice(0, 60)}…"`);
    updated++;
  }

  console.log(`\n✅  Done. Updated ${updated} categories.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
