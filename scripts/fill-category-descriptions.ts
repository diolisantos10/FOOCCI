/**
 * Fill category descriptions where currently null or empty.
 * Never overwrites descriptions that restaurants have already set.
 *
 * Run: npx ts-node --project tsconfig.json -e "require('./scripts/fill-category-descriptions.ts')"
 * or:  npx tsx scripts/fill-category-descriptions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Map of normalised category name fragments → description to apply.
// Keys are lowercased, trimmed name substrings for flexible matching.
const DESCRIPTIONS: Record<string, string> = {
  "sashimi":         "Fatias finas de peixe fresco servidas sem arroz, realçando o sabor puro do ingrediente.",
  "niguiri":         "Bolinho de arroz temperado moldado à mão, coberto com fatia de peixe ou fruto do mar.",
  "uramaki":         "Rolls com o arroz por fora e o alga por dentro, recheados com ingredientes variados.",
  "hossomaki":       "Rolls finos enrolados em alga com um único recheio, leves e de sabor delicado.",
  "temaki":          "Cone de alga nori recheado com arroz, peixe e complementos — servido fresco e crocante.",
  "hot roll":        "Rolls empanados e fritos, crocantes por fora e macios por dentro, servidos quentes.",
  "jhow":            "Combinações exclusivas da casa, pensadas para quem quer experimentar o melhor do cardápio.",
  "poke":            "Bowl havaiano com base de arroz ou folhas, topped com peixe fresco e ingredientes coloridos.",
  "lámen":           "Caldo encorpado com macarrão artesanal, proteína, legumes e ovos marinados.",
  "lamen":           "Caldo encorpado com macarrão artesanal, proteína, legumes e ovos marinados.",
  "pratos quentes":  "Opções quentes preparadas na hora, ideais para quem prefere pratos mais robustos.",
  "porções":         "Entradas e petiscos para compartilhar, perfeitos para acompanhar a refeição.",
  "combos":          "Combinações montadas para oferecer variedade e economia numa única escolha.",
  "festival":        "Seleção especial com os sabores favoritos em porções generosas.",
  "molho":           "Molhos artesanais e complementos para personalizar o seu pedido.",
  "hashi":           "Molhos artesanais e complementos para personalizar o seu pedido.",
  "cazza hot":       "Versão quente e crocante dos clássicos da casa, com recheios especiais.",
  "rodízio":         "Modalidade presencial: prove à vontade os itens do cardápio em ritmo do seu apetite.",
};

function findDescription(name: string): string | null {
  const lower = name.toLowerCase().trim();
  for (const [fragment, desc] of Object.entries(DESCRIPTIONS)) {
    if (lower.includes(fragment)) return desc;
  }
  return null;
}

async function main() {
  const categories = await prisma.menuCategory.findMany({
    where: {
      OR: [
        { description: null },
        { description: "" },
      ],
    },
    select: { id: true, name: true, restaurantId: true },
  });

  console.log(`Found ${categories.length} categories with empty descriptions.`);

  let updated = 0;
  for (const cat of categories) {
    const desc = findDescription(cat.name);
    if (!desc) continue;
    await prisma.menuCategory.update({
      where: { id: cat.id },
      data: { description: desc },
    });
    console.log(`  ✓ [${cat.name}] → "${desc.slice(0, 60)}…"`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} / ${categories.length} categories.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
