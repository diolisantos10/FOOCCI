import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import CustomerProfileClient from "./CustomerProfileClient";
import type { Classification, BehaviorData, InsightItem, OrderHistoryItem, InteractionItem, CustomerTag, AddressItem } from "./CustomerProfileClient";
import { CustomerIntelligenceService } from "@/services/crm/CustomerIntelligenceService";
import type { CustomerIntelligenceReport } from "@/services/crm/CustomerIntelligenceService";
import { CustomerIntelligenceSnapshotService } from "@/services/crm/CustomerIntelligenceSnapshotService";
import type { NextBestAction } from "@/services/crm/CustomerIntelligenceSnapshotService";

export const metadata = { title: "Perfil do Cliente" };

// ─── CRM Classification ───────────────────────────────────────────────────────

function classify(spend: number): Classification {
  if (spend >= 2000) return { tier: "Diamond", icon: "💎", gradient: "from-cyan-400 to-blue-500",     nextTier: null,      nextThreshold: null, progressPercent: 100 };
  if (spend >= 800)  return { tier: "Gold",    icon: "🥇", gradient: "from-amber-400 to-brand-500", nextTier: "Diamond", nextThreshold: 2000, progressPercent: Math.round(((spend - 800)  / 1200) * 100) };
  if (spend >= 300)  return { tier: "Silver",  icon: "🥈", gradient: "from-gray-300 to-gray-500",    nextTier: "Gold",    nextThreshold: 800,  progressPercent: Math.round(((spend - 300)  / 500)  * 100) };
  return                    { tier: "Bronze",  icon: "🥉", gradient: "from-brand-400 to-brand-700",nextTier: "Silver",  nextThreshold: 300,  progressPercent: Math.round((spend / 300)            * 100) };
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

// ─── Interaction builder ──────────────────────────────────────────────────────

function buildInteractions(
  orders: Array<{ id: string; status: string; total: { toString(): string }; createdAt: Date }>,
  conversations: Array<{ id: string; messages: Array<{ id: string; content: string; direction: string; sentAt: Date }> }>
): InteractionItem[] {
  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const items: InteractionItem[] = [];

  for (const o of orders) {
    const total = Number(o.total);
    const type: InteractionItem["type"] =
      o.status === "DELIVERED" ? "order_delivered"
      : o.status === "CANCELLED" ? "order_cancelled"
      : "order_placed";
    const label =
      type === "order_delivered" ? "Pedido entregue"
      : type === "order_cancelled" ? "Pedido cancelado"
      : "Pedido realizado";
    items.push({
      id:          `order-${o.id}`,
      type,
      description: `${label} — ${fmtBRL(total)}`,
      date:        o.createdAt.toISOString(),
    });
  }

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      const preview =
        msg.content.length > 55
          ? `${msg.content.slice(0, 55)}…`
          : msg.content;
      const type: InteractionItem["type"] =
        msg.direction === "INBOUND" ? "message_in" : "message_out";
      const label =
        type === "message_in" ? "Mensagem recebida" : "Mensagem enviada";
      items.push({
        id:          `msg-${msg.id}`,
        type,
        description: `${label} — "${preview}"`,
        date:        msg.sentAt.toISOString(),
      });
    }
  }

  return items
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 50);
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

// ─── Tags computation ─────────────────────────────────────────────────────────

function computeTags(params: {
  totalSpend: number;
  totalOrders: number;
  lastOrderAt: Date | null;
  purchaseFrequencyDays: number;
}): CustomerTag[] {
  const { totalSpend, totalOrders, lastOrderAt, purchaseFrequencyDays } = params;

  const daysSinceLast = lastOrderAt
    ? Math.floor((Date.now() - lastOrderAt.getTime()) / 86_400_000)
    : 999;

  const tags: CustomerTag[] = [];

  if (totalSpend >= 800) {
    tags.push({ id: "high-value", label: "Alto valor", color: "amber" });
  }

  if (totalOrders >= 10) {
    tags.push({ id: "loyal", label: "Cliente fiel", color: "purple" });
  }

  if (purchaseFrequencyDays > 0 && purchaseFrequencyDays <= 14) {
    tags.push({ id: "frequent", label: "Comprador frequente", color: "green" });
  }

  if (daysSinceLast > 30 && totalOrders > 2) {
    tags.push({ id: "at-risk", label: "Em risco", color: "red" });
  }

  if (totalOrders <= 2) {
    tags.push({ id: "new", label: "Novo cliente", color: "blue" });
  }

  if (purchaseFrequencyDays >= 15 && purchaseFrequencyDays <= 30) {
    tags.push({ id: "regular", label: "Pedidos regulares", color: "teal" });
  }

  return tags;
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
      id:                   true,
      name:                 true,
      phone:                true,
      email:                true,
      birthDate:            true,
      totalOrders:          true,
      totalSpend:           true,
      lastOrderAt:          true,
      createdAt:            true,
      isActive:             true,
      restaurantId:         true,
      tier:                 true,
      segment:              true,
      notes:                true,
      document:             true,
      financialBalance:     true,
      importedOrderCount:   true,
      importedTotalSpent:   true,
      importedLastOrderAt:  true,
      averageTicket:        true,
      crmContactable:       true,
      contactStatus:        true,
      hasOptedOut:          true,
      sourceSystem:         true,
      dataEnrichmentStatus: true,
      dataCompletenessScore: true,
      enrichmentNotes:      true,
      addresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id:           true,
          label:        true,
          street:       true,
          number:       true,
          complement:   true,
          neighborhood: true,
          city:         true,
          state:        true,
          zipCode:      true,
          isDefault:    true,
        },
      },
      orders: {
        orderBy: { createdAt: "asc" },
        select: {
          id:          true,
          orderNumber: true,
          status:      true,
          createdAt:   true,
          total:       true,
          subtotal:    true,
          deliveryFee: true,
          discount:    true,
          type:        true,
          notes:       true,
          items: {
            select: {
              name:     true,
              quantity: true,
              price:    true,
              menuItem: {
                select: { category: { select: { name: true } } },
              },
            },
          },
          payment: { select: { method: true } },
        },
      },
      conversations: {
        select: {
          id: true,
          messages: {
            orderBy: { sentAt: "desc" },
            take: 20,
            select: {
              id:        true,
              content:   true,
              direction: true,
              sentAt:    true,
            },
          },
        },
      },
      preferences: { select: { id: true } },
    },
  });

  if (!customer || customer.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const totalSpend = Number(customer.totalSpend);
  // When a customer has no real Foocci orders, use imported historical spend for classification
  const importedSpend = customer.importedTotalSpent !== null ? Number(customer.importedTotalSpent) : null;
  const classifySpend = customer.totalOrders > 0 ? totalSpend : (importedSpend ?? totalSpend);
  const addresses: AddressItem[] = customer.addresses.map((a) => ({
    id:           a.id,
    label:        a.label,
    street:       a.street,
    number:       a.number,
    complement:   a.complement,
    neighborhood: a.neighborhood,
    city:         a.city,
    state:        a.state,
    zipCode:      a.zipCode,
    isDefault:    a.isDefault,
  }));
  const classification = classify(classifySpend);
  const serializedOrders: OrderHistoryItem[] = [...customer.orders]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((o) => ({
      id:          o.id,
      orderNumber: o.orderNumber ?? null,
      status:      o.status,
      total:       Number(o.total),
      subtotal:    Number(o.subtotal),
      deliveryFee: Number(o.deliveryFee),
      discount:    Number(o.discount),
      type:        o.type ?? undefined,
      notes:       o.notes ?? null,
      createdAt:   o.createdAt.toISOString(),
      items:       o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
      payment:     o.payment?.method ?? null,
    }));

  const { purchaseFrequencyDays, favoriteProduct } = computeHeader(customer.orders as OrderRow[]);
  const behavior      = computeBehavior(customer.orders as OrderRow[]);
  const interactions  = buildInteractions(
    customer.orders as Array<{ id: string; status: string; total: { toString(): string }; createdAt: Date }>,
    customer.conversations
  );
  const insights  = computeInsights({
    totalOrders: customer.totalOrders,
    totalSpend,
    lastOrderAt: customer.lastOrderAt,
    purchaseFrequencyDays,
    behavior,
  });
  const tags = computeTags({
    totalSpend,
    totalOrders: customer.totalOrders,
    lastOrderAt: customer.lastOrderAt,
    purchaseFrequencyDays,
  });

  const intelligence: CustomerIntelligenceReport = await CustomerIntelligenceService.getFullReport(
    customer.restaurantId,
    customer.id,
    {
      id:                   customer.id,
      restaurantId:         customer.restaurantId,
      name:                 customer.name,
      phone:                customer.phone,
      email:                customer.email,
      document:             customer.document,
      birthDate:            customer.birthDate,
      notes:                customer.notes,
      totalOrders:          customer.totalOrders,
      totalSpend,
      lastOrderAt:          customer.lastOrderAt,
      sourceSystem:         customer.sourceSystem,
      crmContactable:       customer.crmContactable,
      contactStatus:        customer.contactStatus,
      hasOptedOut:          customer.hasOptedOut,
      dataEnrichmentStatus: customer.dataEnrichmentStatus,
      hasAddresses:         customer.addresses.length > 0,
      hasPreferences:       !!customer.preferences,
      importedOrderCount:   customer.importedOrderCount,
      importedTotalSpent:   customer.importedTotalSpent !== null ? Number(customer.importedTotalSpent) : null,
    },
  );

  // Unified intelligence snapshot — surfaces the deterministic Next Best Action.
  const snapshot = await CustomerIntelligenceSnapshotService.getSnapshot(
    customer.restaurantId,
    customer.id,
  ).catch(() => null);
  const nextBestAction: NextBestAction | null = snapshot?.nextBestAction ?? null;

  return (
    <>
      <TopBar title={customer.name} />
      <CustomerProfileClient
        id={customer.id}
        name={customer.name}
        phone={customer.phone ?? ""}
        email={customer.email}
        totalOrders={customer.totalOrders}
        totalSpend={totalSpend}
        lastOrderAt={customer.lastOrderAt?.toISOString() ?? null}
        createdAt={customer.createdAt.toISOString()}
        isActive={customer.isActive}
        segment={customer.segment}
        classification={classification}
        purchaseFrequencyDays={purchaseFrequencyDays}
        favoriteProduct={favoriteProduct}
        behavior={behavior}
        insights={insights}
        orders={serializedOrders}
        interactions={interactions}
        tags={tags}
        addresses={addresses}
        notes={customer.notes ?? null}
        document={customer.document ?? null}
        financialBalance={customer.financialBalance !== null ? Number(customer.financialBalance) : null}
        importedOrderCount={customer.importedOrderCount ?? null}
        importedTotalSpent={customer.importedTotalSpent !== null ? Number(customer.importedTotalSpent) : null}
        importedLastOrderAt={customer.importedLastOrderAt?.toISOString() ?? null}
        averageTicket={customer.averageTicket !== null ? Number(customer.averageTicket) : null}
        intelligence={intelligence}
        nextBestAction={nextBestAction}
      />
    </>
  );
}
