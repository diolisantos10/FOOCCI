import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { getOrCreateConfig } from "@/services/menu/RepriceService";
import {
  PrecificacaoClient,
  type PricingConfigDTO,
  type PricingItemDTO,
  type PriceLogDTO,
} from "./PrecificacaoClient";

export const metadata = { title: "CMV & Precificação — Foocci" };

export default async function PrecificacaoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const restaurantId = session.user.restaurantId;
  const canEdit = ["OWNER", "MANAGER"].includes(session.user.role);

  const [config, categories, logs] = await Promise.all([
    getOrCreateConfig(restaurantId),
    prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
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

  return (
    <>
      <TopBar title="CMV & Precificação" />
      <PrecificacaoClient
        initialConfig={initialConfig}
        initialItems={initialItems}
        initialLogs={initialLogs}
        canEdit={canEdit}
      />
    </>
  );
}
