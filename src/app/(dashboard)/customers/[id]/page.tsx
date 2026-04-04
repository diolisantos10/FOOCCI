import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import CustomerProfileClient from "./CustomerProfileClient";
import type { Classification, BehaviorData, InsightItem } from "./CustomerProfileClient";

export const metadata = { title: "Perfil do Cliente" };

// ─── CRM Classification ───────────────────────────────────────────────────────

function classify(spend: number): Classification {
  if (spend >= 2000) return { tier: "Diamond", icon: "💎", gradient: "from-cyan-400 to-blue-500",     nextTier: null,      nextThreshold: null, progressPercent: 100 };
  if (spend >= 800)  return { tier: "Gold",    icon: "🥇", gradient: "from-amber-400 to-orange-500", nextTier: "Diamond", nextThreshold: 2000, progressPercent: Math.round(((spend - 800)  / 1200) * 100) };
  if (spend >= 300)  return { tier: "Silver",  icon: "🥈", gradient: "from-gray-300 to-gray-500",    nextTier: "Gold",    nextThreshold: 800,  progressPercent: Math.round(((spend - 300)  / 500)  * 100) };
  return                    { tier: "Bronze",  icon: "🥉", gradient: "from-orange-400 to-orange-700",nextTier: "Silver",  nextThreshold: 300,  progressPercent: Math.round((spend / 300)            * 100) };
}

// ─── Order row type (inferred from Prisma select) ────────────────────────────

type OrderRow = {
  status: string;
  createdAt: Date;
  total: { toString(): string };
  items: Array<{
    name: string;
    quantity: number;
    menuItem: { category: { name: string } };
  }>;
  payment: { method: string } | null;
};

// ─── Header analytics ─────────────────────────────────────────────────────────

function computeHeader(orders: OrderRow[]) {
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  const sorted = [...delivered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let purchaseFrequencyDays = 0;

  if (sorted.length >= 2) {
    const gaps: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const current  = sorted[i];
      const previous = sorted[i - 1];

      if (!current || !previous) continue;

      gaps.push(
        (current.createdAt.getTime() - previous.createdAt.getTime()) / 86_400_000
      );
    }

    if (gaps.length > 0) {
      purchaseFrequencyDays = Math.round(
        gaps.reduce((a, b) => a + b, 0) / gaps.length
      );
    }
  }

  const counts: Record<string, number> = {};
  delivered.forEach((o) =>
    o.items.forEach((item) => {
      counts[item.name] = (counts[item.name] ?? 0) + item.quantity;
    })
  );
  const favoriteProduct =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { purchaseFrequencyDays, favoriteProduct };
}

// ─── Behavior analytics ───────────────────────────────────────────────────────

function computeBehavior(orders: OrderRow[]): BehaviorData {
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  /* ── Time slots (all orders) ── */
  let morning = 0, afternoon = 0, evening = 0;
  orders.forEach((o) => {
    const h = o.createdAt.getHours();
    if (h >= 6 && h < 12) morning++;
    else if (h >= 12 && h < 18) afternoon++;
    else evening++;
  });
  const timeTotal = orders.length || 1;
  const timeSlots: BehaviorData["timeSlots"] = [
    { id: "morning",   label: "Manhã", icon: "🌅", range: "6h–12h",  count: morning,   pct: Math.round((morning   / timeTotal) * 100) },
    { id: "afternoon", label: "Tarde", icon: "☀️",  range: "12h–18h", count: afternoon, pct: Math.round((afternoon / timeTotal) * 100) },
    { id: "evening",   label: "Noite", icon: "🌙", range: "18h–0h",  count: evening,   pct: Math.round((evening   / timeTotal) * 100) },
  ];
  const preferredTime = (timeSlots.reduce((a, b) => (b.count > a.count ? b : a)).label) as BehaviorData["preferredTime"];

  /* ── Day distribution (all orders) ── */
  const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dayCounts: Record<string, number> = {};
  orders.forEach((o) => {
    const d = DAY_NAMES[o.createdAt.getDay()]!;
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  });
  const maxDay = Math.max(...DAY_NAMES.map((d) => dayCounts[d] ?? 0), 1);
  const dayDistribution: BehaviorData["dayDistribution"] = DAY_NAMES.map((d) => ({
    day:   d,
    count: dayCounts[d] ?? 0,
    pct:   Math.round(((dayCounts[d] ?? 0) / maxDay) * 100),
  }));
  const preferredDays = [...dayDistribution]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((d) => d.count > 0)
    .map((d) => d.day);

  /* ── Categories (delivered orders) ── */
  const catCounts: Record<string, number> = {};
  delivered.forEach((o) =>
    o.items.forEach((item) => {
      const cat = item.menuItem?.category?.name ?? "Outros";
      catCounts[cat] = (catCounts[cat] ?? 0) + item.quantity;
    })
  );
  const catTotal = Object.values(catCounts).reduce((a, b) => a + b, 0) || 1;
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const favoriteCategories = sortedCats.slice(0, 4).map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / catTotal) * 100),
  }));
  const leastCategories = sortedCats.length > 4
    ? sortedCats.slice(-2).map(([name, count]) => ({ name, count }))
    : [];

  /* ── Payment (delivered orders) ── */
  const payCounts: Record<string, number> = {};
  delivered.forEach((o) => {
    if (o.payment?.method)
      payCounts[o.payment.method] = (payCounts[o.payment.method] ?? 0) + 1;
  });
  const payTotal = Object.values(payCounts).reduce((a, b) => a + b, 0) || 1;
  const paymentDistribution = Object.entries(payCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([method, count]) => ({
      method,
      count,
      pct: Math.round((count / payTotal) * 100),
    }));
  const preferredPayment = paymentDistribution[0]?.method ?? null;

  return {
    timeSlots,
    preferredTime,
    dayDistribution,
    preferredDays,
    favoriteCategories,
    leastCategories,
    paymentDistribution,
    preferredPayment,
  };
}

// ─── Insights computation ─────────────────────────────────────────────────────

function computeInsights(params: {
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: Date | null;
  purchaseFrequencyDays: number;
  behavior: BehaviorData;
}): InsightItem[] {
  const { totalOrders, totalSpend, lastOrderAt, purchaseFrequencyDays, behavior } = params;
  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const daysSinceLast = lastOrderAt
    ? Math.floor((Date.now() - lastOrderAt.getTime()) / 86_400_000)
    : 999;

  const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const topCat = behavior.favoriteCategories[0]?.name ?? null;
  const topDays = behavior.preferredDays.slice(0, 2).join(" e ");

  const insights: InsightItem[] = [];

  if (daysSinceLast > 30 && totalOrders > 2) {
    insights.push({
      id: "churn",
      type: "churn",
      icon: "⚠️",
      title: "Risco de churn",
      message: `Último pedido há ${daysSinceLast} dias. Frequência habitual: ${
        purchaseFrequencyDays > 0 ? `a cada ${purchaseFrequencyDays} dias` : "irregular"
      }.`,
      action: "Envie uma oferta de reativação com 10% de desconto no próximo pedido.",
    });
  }

  if (avgOrderValue > 0 && topCat) {
    insights.push({
      id: "upsell",
      type: "opportunity",
      icon: "📈",
      title: "Oportunidade de upsell",
      message: `Ticket médio de ${fmtBRL(avgOrderValue)}. Categoria principal: ${topCat}.`,
      action: `Sugira combos ou complementos de ${topCat} no próximo atendimento.`,
    });
  }

  if (topDays) {
    insights.push({
      id: "contact-time",
      type: "info",
      icon: "📱",
      title: "Melhor horário para contato",
      message: `Costuma pedir à ${behavior.preferredTime.toLowerCase()}${
        topDays ? `, principalmente ${topDays}` : ""
      }.`,
      action: `Agende campanhas para a ${behavior.preferredTime.toLowerCase()} nesses dias.`,
    });
  }

  if (purchaseFrequencyDays >= 3) {
    insights.push({
      id: "pattern",
      type: "info",
      icon: "🔄",
      title: "Padrão de compra regular",
      message: `Realiza pedidos a cada ${purchaseFrequencyDays} dias em média.`,
      action: `Configure lembrete automático ${Math.max(1, purchaseFrequencyDays - 2)} dias após o último pedido.`,
    });
  }

  return insights.slice(0, 4);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    select: {
      id:           true,
      name:         true,
      phone:        true,
      email:        true,
      totalOrders:  true,
      totalSpend:   true,
      lastOrderAt:  true,
      createdAt:    true,
      isActive:     true,
      restaurantId: true,
      orders: {
        orderBy: { createdAt: "asc" },
        select: {
          status:    true,
          createdAt: true,
          total:     true,
          items: {
            select: {
              name:     true,
              quantity: true,
              menuItem: {
                select: { category: { select: { name: true } } },
              },
            },
          },
          payment: { select: { method: true } },
        },
      },
    },
  });

  if (!customer || customer.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const totalSpend   = Number(customer.totalSpend);
  const classification = classify(totalSpend);
  const { purchaseFrequencyDays, favoriteProduct } = computeHeader(customer.orders as OrderRow[]);
  const behavior  = computeBehavior(customer.orders as OrderRow[]);
  const insights  = computeInsights({
    totalOrders: customer.totalOrders,
    totalSpend,
    lastOrderAt: customer.lastOrderAt,
    purchaseFrequencyDays,
    behavior,
  });

  return (
    <>
      <TopBar title={customer.name} />
      <CustomerProfileClient
        id={customer.id}
        name={customer.name}
        phone={customer.phone}
        email={customer.email}
        totalOrders={customer.totalOrders}
        totalSpend={totalSpend}
        lastOrderAt={customer.lastOrderAt?.toISOString() ?? null}
        createdAt={customer.createdAt.toISOString()}
        isActive={customer.isActive}
        classification={classification}
        purchaseFrequencyDays={purchaseFrequencyDays}
        favoriteProduct={favoriteProduct}
        behavior={behavior}
        insights={insights}
      />
    </>
  );
}
