import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MenuFiscalClient } from "./MenuFiscalClient";

export const metadata = { title: "Fiscal do cardápio" };

export default async function CardapioFiscalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const restaurantId = session.user.restaurantId;

  const [categories, config] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        fiscalNcm: true,
        fiscalCest: true,
        fiscalCfop: true,
        fiscalCsosn: true,
        fiscalCst: true,
        fiscalOrigem: true,
        fiscalUnidade: true,
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            fiscalNcm: true,
            fiscalCest: true,
            fiscalCfop: true,
            fiscalCsosn: true,
            fiscalCst: true,
            fiscalOrigem: true,
            fiscalUnidade: true,
          },
        },
      },
    }),
    prisma.fiscalConfig.findUnique({
      where: { restaurantId },
      select: { regimeTributario: true, defaultNcm: true, defaultCfop: true, defaultCsosn: true, defaultCst: true },
    }),
  ]);

  const regime = config?.regimeTributario ?? "SIMPLES_NACIONAL";
  const defaults = {
    ncm: config?.defaultNcm ?? "",
    cfop: config?.defaultCfop ?? "",
    csosn: config?.defaultCsosn ?? "",
    cst: config?.defaultCst ?? "",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Fiscal do cardápio</h1>
          <p className="text-sm text-muted">
            Códigos por categoria e por item. Em branco = herda (item → categoria → padrão da loja).
          </p>
        </div>
        <Link href="/settings/notas-fiscais" className="text-sm text-brand-600 hover:underline">
          ← Configurações
        </Link>
      </div>
      <MenuFiscalClient categories={categories} regime={regime} defaults={defaults} />
    </div>
  );
}
