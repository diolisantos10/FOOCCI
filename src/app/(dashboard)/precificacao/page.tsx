import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { getOrCreateConfig } from "@/services/menu/RepriceService";
import { importFromMenu } from "@/services/menu/RecipeCostService";
import {
  PrecificacaoClient,
  type PricingConfigDTO,
  type PricingItemDTO,
  type PriceLogDTO,
  type IngredientDTO,
  type RecipeLineDTO,
  type CategoryDTO,
} from "./PrecificacaoClient";

export const metadata = { title: "CMV & Precificação — Foocci" };

const PRICING_TABS = ["formula", "markup", "precos", "insumos", "automacao"] as const;
type PricingTab = (typeof PRICING_TABS)[number];

export default async function PrecificacaoPage({
  searchParams,
}: {
  searchParams: { tab?: string; ficha?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const restaurantId = session.user.restaurantId;
  const canEdit = ["OWNER", "MANAGER"].includes(session.user.role);

  // First visit: seed the Insumos catalog from the cardápio's ingredients
  // text automatically (idempotent — only runs while the catalog is empty).
  const ingredientCount = await prisma.ingredient.count({ where: { restaurantId } });
  if (ingredientCount === 0) {
    await importFromMenu(restaurantId).catch((err) =>
      console.error("[precificacao] auto-import de insumos falhou", err)
    );
  }

  const [config, categories, logs, ingredients, recipeLines] = await Promise.all([
    getOrCreateConfig(restaurantId),
    prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        markupOverride: true,
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, price: true, cost: true, hasVariants: true },
        },
      },
    }),
    prisma.priceChangeLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.ingredient.findMany({
      where: { restaurantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipeLines: true } } },
    }),
    prisma.recipeLine.findMany({
      where: { menuItem: { category: { restaurantId } } },
      select: { menuItemId: true, ingredientId: true, quantity: true },
    }),
  ]);

  const initialConfig: PricingConfigDTO = {
    monthlyRevenue: config.monthlyRevenue === null ? null : Number(config.monthlyRevenue),
    fixedExpensesMonthly:
      config.fixedExpensesMonthly === null ? null : Number(config.fixedExpensesMonthly),
    taxesFeesPct: Number(config.taxesFeesPct),
    targetProfitPct: Number(config.targetProfitPct),
    autoRepriceMode: config.autoRepriceMode,
    rounding: config.rounding,
    maxAutoChangePct: Number(config.maxAutoChangePct),
    periodOpeningStock:
      config.periodOpeningStock === null ? null : Number(config.periodOpeningStock),
    periodPurchases: config.periodPurchases === null ? null : Number(config.periodPurchases),
    periodClosingStock:
      config.periodClosingStock === null ? null : Number(config.periodClosingStock),
    periodRevenue: config.periodRevenue === null ? null : Number(config.periodRevenue),
  };

  const initialItems: PricingItemDTO[] = categories.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: cat.id,
      categoryName: cat.name,
      price: Number(item.price),
      cost: item.cost === null ? null : Number(item.cost),
      hasVariants: item.hasVariants,
    }))
  );

  const initialLogs: PriceLogDTO[] = logs.map((log) => ({
    id: log.id,
    itemName: log.itemName,
    oldPrice: log.oldPrice === null ? null : Number(log.oldPrice),
    newPrice: log.newPrice === null ? null : Number(log.newPrice),
    oldCost: log.oldCost === null ? null : Number(log.oldCost),
    newCost: log.newCost === null ? null : Number(log.newCost),
    source: log.source,
    createdAt: log.createdAt.toISOString(),
  }));

  const initialIngredients: IngredientDTO[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit),
    usedIn: i._count.recipeLines,
  }));

  const initialRecipeLines: RecipeLineDTO[] = recipeLines.map((l) => ({
    menuItemId: l.menuItemId,
    ingredientId: l.ingredientId,
    quantity: l.quantity === null ? null : Number(l.quantity),
  }));

  const initialCategories: CategoryDTO[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    markupOverride: c.markupOverride === null ? null : Number(c.markupOverride),
  }));

  // Deep-link: /precificacao?ficha=<itemId> (do Cardápio ou da aba Preços) abre a
  // aba Insumos com a ficha do produto já selecionada. Só respeita alvos válidos.
  const fichaTarget =
    searchParams.ficha && initialItems.some((i) => i.id === searchParams.ficha)
      ? searchParams.ficha
      : undefined;
  const initialTab: PricingTab | undefined = fichaTarget
    ? "insumos"
    : PRICING_TABS.includes(searchParams.tab as PricingTab)
      ? (searchParams.tab as PricingTab)
      : undefined;

  return (
    <>
      <TopBar title="CMV & Precificação" />
      <PrecificacaoClient
        initialConfig={initialConfig}
        initialItems={initialItems}
        initialLogs={initialLogs}
        initialIngredients={initialIngredients}
        initialRecipeLines={initialRecipeLines}
        initialCategories={initialCategories}
        canEdit={canEdit}
        initialTab={initialTab}
        initialFichaItemId={fichaTarget}
      />
    </>
  );
}
