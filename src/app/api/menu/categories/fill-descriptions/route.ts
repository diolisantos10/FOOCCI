import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";

// Known descriptions for Japanese / specialty category names (case-insensitive match on normalized name).
// Only fills categories that currently have no description.
const KNOWN_DESCRIPTIONS: Record<string, string> = {
  sashimi:      "Fatias de peixe e frutos do mar frescos, servidos com shoyu, wasabi e gengibre",
  sashimis:     "Fatias de peixe e frutos do mar frescos, servidos com shoyu, wasabi e gengibre",
  niguiri:      "Bolinho de arroz temperado coberto com peixe, frutos do mar ou proteínas frescas",
  niguiris:     "Bolinho de arroz temperado coberto com peixe, frutos do mar ou proteínas frescas",
  uramaki:      "Rolinho invertido com arroz por fora, alga nori por dentro e recheio variado",
  uramakis:     "Rolinho invertido com arroz por fora, alga nori por dentro e recheio variado",
  temaki:       "Cone de alga nori com arroz shari e recheio de peixe, frutos do mar ou vegetais",
  temakis:      "Cone de alga nori com arroz shari e recheio de peixe, frutos do mar ou vegetais",
  hossomaki:    "Rolinho fino envolto em alga nori com um único recheio selecionado",
  hossomakis:   "Rolinho fino envolto em alga nori com um único recheio selecionado",
  combinados:   "Seleção combinada de peças variadas para quem quer experimentar diferentes sabores",
  combinações:  "Monte seu combinado personalizado com as melhores peças da casa",
  entradas:     "Petiscos e pratos pequenos para compartilhar antes da refeição principal",
  yakisoba:     "Macarrão frito ao estilo japonês com legumes salteados e sua escolha de proteína",
  guioza:       "Pastel japonês frito ou cozido no vapor, recheado com carne moída e legumes",
  "tempurá":    "Camarões e legumes empanados em massa leve e crocante, fritos na hora",
  tempura:      "Camarões e legumes empanados em massa leve e crocante, fritos na hora",
  bebidas:      "Refrescos, sucos naturais, refrigerantes e drinks para acompanhar sua refeição",
  sobremesas:   "Doces e sobremesas para encerrar sua experiência gastronômica",
  especiais:    "Criações exclusivas do nosso chef com ingredientes selecionados",
  hikari:       "Peixes de pele prateada levemente marinados em vinagre para realçar o sabor",
  missoshiru:   "Sopa tradicional japonesa com missô, tofu, wakame e cebolinha",
  "hot roll":   "Rolinhos empanados e fritos com recheio cremoso e cobertura especial",
  "hot rolls":  "Rolinhos empanados e fritos com recheio cremoso e cobertura especial",
  tataki:       "Peixe levemente grelhado por fora e cru por dentro, fatiado e temperado",
  tiradito:     "Inspiração peruana: fatias de peixe marinadas em molho cítrico e especiarias",
  robata:       "Itens grelhados na brasa ao estilo japonês, selados para preservar os sucos naturais",
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: ctx.restaurantId },
      select: { id: true, name: true, description: true },
    });

    const updates: Array<{ id: string; name: string; description: string }> = [];

    for (const cat of categories) {
      if (cat.description && cat.description.trim() !== "") continue;
      const desc = KNOWN_DESCRIPTIONS[normalize(cat.name)];
      if (desc) updates.push({ id: cat.id, name: cat.name, description: desc });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.menuCategory.update({
            where: { id: u.id },
            data: { description: u.description },
          })
        )
      );
    }

    return ok({ updated: updates.length, categories: updates.map((u) => u.name) });
  } catch (err) {
    console.error("[POST /api/menu/categories/fill-descriptions]", err);
    return serverError();
  }
}
