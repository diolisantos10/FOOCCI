#!/usr/bin/env npx tsx
/**
 * READ-ONLY diagnostic — did the imported Saipos/Nemo history land in the
 * customer records (fichas dos clientes)?
 *
 * Does NOT write or delete anything. Reports, per restaurant:
 *   - how many customers carry imported summary fields (importedTotalSpent /
 *     importedOrderCount / sourceSystem)
 *   - how many imported Orders + OrderItems exist (the per-dish detail that
 *     powers "prato favorito" / comportamento on each ficha)
 *   - whether customers are actually linked to imported orders
 *   - a few real samples so you can eyeball it
 *
 * Usage (Railway shell, or anywhere DATABASE_URL points at the DB):
 *   npx tsx scripts/check-imported-distribution.ts
 *   npx tsx scripts/check-imported-distribution.ts --restaurant sushi-cazza
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getOption(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function main() {
  const slug = getOption("restaurant");

  let restaurantId: string | null = null;
  let label = "TODOS os restaurantes";
  if (slug) {
    const r = await prisma.restaurant.findFirst({ where: { slug }, select: { id: true, name: true, slug: true } });
    if (!r) { console.error(`✖ Restaurante "${slug}" não encontrado.`); process.exit(1); }
    restaurantId = r.id;
    label = `${r.name} (${r.slug})`;
  }
  const rWhere = restaurantId ? { restaurantId } : {};
  const oWhere = restaurantId ? { restaurantId } : {};

  // ── Customer-level summary (the cadastro fields) ───────────────────────────
  const totalCustomers      = await prisma.customer.count({ where: { ...rWhere, isGuest: false } });
  const withImportedSpend   = await prisma.customer.count({ where: { ...rWhere, isGuest: false, importedTotalSpent: { gt: 0 } } });
  const withImportedOrders  = await prisma.customer.count({ where: { ...rWhere, isGuest: false, importedOrderCount: { gt: 0 } } });
  const withSourceSaipos    = await prisma.customer.count({ where: { ...rWhere, sourceSystem: { contains: "SAIPOS" } } });
  const withSourceNemo      = await prisma.customer.count({ where: { ...rWhere, sourceSystem: { contains: "NEMO" } } });
  const withPhone           = await prisma.customer.count({ where: { ...rWhere, isGuest: false, importedTotalSpent: { gt: 0 }, phone: { not: null } } });

  // ── Order-level detail (the per-dish history) ──────────────────────────────
  const importedOrders = await prisma.order.count({ where: { ...oWhere, importedAt: { not: null } } });
  const importedItems  = await prisma.orderItem.count({ where: { order: { ...oWhere, importedAt: { not: null } } } });
  const customersLinkedToImportedOrders = (await prisma.order.findMany({
    where:    { ...oWhere, importedAt: { not: null } },
    select:   { customerId: true },
    distinct: ["customerId"],
  })).length;

  console.log("══════════════════════════════════════════════════════");
  console.log(`  Distribuição do histórico importado — ${label}`);
  console.log("══════════════════════════════════════════════════════");
  console.log("");
  console.log("  ▸ CADASTRO (resumo na ficha de cada cliente)");
  console.log(`     Clientes (não-convidados):           ${totalCustomers}`);
  console.log(`     Com total gasto importado (>0):      ${withImportedSpend}`);
  console.log(`     Com qtd de pedidos importada (>0):   ${withImportedOrders}`);
  console.log(`     Origem SAIPOS:                       ${withSourceSaipos}`);
  console.log(`     Origem NEMO:                         ${withSourceNemo}`);
  console.log(`     Com telefone (contactáveis p/ CRM):  ${withPhone}`);
  console.log("");
  console.log("  ▸ DETALHE (pedidos/itens importados — prato favorito, comportamento)");
  console.log(`     Pedidos importados (Order):          ${importedOrders}`);
  console.log(`     Itens importados (OrderItem):        ${importedItems}`);
  console.log(`     Clientes com pedidos importados:     ${customersLinkedToImportedOrders}`);
  console.log("");

  // ── Samples ────────────────────────────────────────────────────────────────
  const samples = await prisma.customer.findMany({
    where:   { ...rWhere, isGuest: false, importedTotalSpent: { gt: 0 } },
    orderBy: { importedTotalSpent: "desc" },
    take:    5,
    select:  {
      name: true, phone: true, sourceSystem: true,
      importedOrderCount: true, importedTotalSpent: true, importedLastOrderAt: true,
      _count: { select: { orders: true } },
    },
  });

  if (samples.length > 0) {
    console.log("  ▸ AMOSTRA (top 5 por total importado)");
    for (const s of samples) {
      const spent = s.importedTotalSpent ? Number(s.importedTotalSpent) : 0;
      console.log(`     • ${s.name} ${s.phone ? `(${s.phone})` : "(sem telefone)"} — ${s.sourceSystem ?? "?"}`);
      console.log(`       resumo: ${s.importedOrderCount ?? 0} pedidos · ${brl(spent)} · última ${s.importedLastOrderAt?.toISOString().slice(0, 10) ?? "?"}`);
      console.log(`       pedidos vinculados na ficha: ${s._count.orders}`);
    }
    console.log("");
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  console.log("  ▸ VEREDITO");
  if (withImportedSpend === 0 && importedOrders === 0) {
    console.log("     ⚠ Nenhum dado importado encontrado para este escopo.");
  } else {
    console.log(`     ✅ Resumo importado presente em ${withImportedSpend} fichas de cliente.`);
    if (importedOrders > 0) {
      console.log(`     ✅ Detalhe por prato disponível: ${importedItems} itens em ${importedOrders} pedidos`);
      console.log(`        ligados a ${customersLinkedToImportedOrders} clientes (prato favorito/comportamento OK).`);
    } else {
      console.log("     ⚠ Só veio o RESUMO (totais) — não há pedidos/itens importados, então");
      console.log("       a ficha mostra totais mas NÃO mostra prato favorito/comportamento por prato.");
    }
  }
}

main()
  .catch((err) => { console.error("✖ Erro:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
