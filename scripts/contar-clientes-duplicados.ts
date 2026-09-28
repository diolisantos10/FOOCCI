#!/usr/bin/env npx tsx
/**
 * SOMENTE LEITURA — quantos clientes estão duplicados pelo telefone (com e sem o 9).
 *
 * Não escreve, não apaga, não funde nada. Só conta e mostra amostras mascaradas.
 * Nasceu da auditoria de 27/09/2026 (PR #278): o checkout criava um cliente novo
 * quando o telefone importado estava sem o 9, e a venda não voltava para a
 * campanha. O #278 evita os próximos; os que já existem são contados aqui.
 *
 * Uso (onde DATABASE_URL aponta para o banco):
 *   npx tsx scripts/contar-clientes-duplicados.ts
 *   npx tsx scripts/contar-clientes-duplicados.ts --restaurant sushi-cazza
 */
import { PrismaClient } from "@prisma/client";
import { gruposDuplicados, sobrevivente } from "../src/services/crm/duplicados/chaveDoTelefone";

const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] ?? null; };
const mascara = (p: string | null) => (p ? p.slice(0, 5) + "****" + p.slice(-2) : "—");

async function main() {
  const slug = arg("restaurant");
  const restaurantes = await prisma.restaurant.findMany({
    where: slug ? { slug } : {}, select: { id: true, slug: true, name: true },
  });
  let totalGrupos = 0, totalAbsorvidos = 0;
  for (const r of restaurantes) {
    const clientes = await prisma.customer.findMany({
      where:  { restaurantId: r.id, phone: { not: null } },
      select: { id: true, phone: true, name: true, totalOrders: true, createdAt: true },
    });
    const grupos = gruposDuplicados(clientes);
    if (!grupos.length) continue;
    const absorvidos = grupos.flatMap((g) => { const s = sobrevivente(g); return g.filter((x) => x.id !== s.id); });
    const ids = absorvidos.map((a) => a.id);
    const [pedidos, envios, cuponsPorStatus] = await Promise.all([
      prisma.order.count({ where: { customerId: { in: ids } } }),
      prisma.campaignExecution.count({ where: { customerId: { in: ids } } }),
      prisma.customerCoupon.groupBy({ by: ["status"], where: { customerId: { in: ids } }, _count: { id: true } }),
    ]);
    const cupom = (st: string) => cuponsPorStatus.find((c) => c.status === st)?._count.id ?? 0;

    // Casos estranhos — o ensaio da fusão precisa olhar um a um.
    const primeiroNome = (n: string | null) => (n ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const maisDeDois      = grupos.filter((g) => g.length > 2).length;
    const pedidosNosDois  = grupos.filter((g) => g.filter((x) => x.totalOrders > 0).length > 1).length;
    const nomesDiferentes = grupos.filter((g) => new Set(g.map((x) => primeiroNome(x.name)).filter(Boolean)).size > 1).length;

    totalGrupos += grupos.length; totalAbsorvidos += absorvidos.length;
    console.log(`\n${r.name} (${r.slug}) — ${clientes.length} clientes com telefone`);
    console.log(`  pessoas duplicadas: ${grupos.length} · cadastros a absorver: ${absorvidos.length}`);
    console.log(`  nos cadastros a absorver: ${pedidos} pedidos · ${envios} envios de campanha`);
    console.log(`  cupons nos cadastros a absorver: ativos ${cupom("ACTIVE")} · usados ${cupom("USED")} · expirados ${cupom("EXPIRED")}`);
    console.log(`  casos estranhos: ${maisDeDois} grupos com 3+ cadastros · ${pedidosNosDois} com pedidos nos dois lados · ${nomesDiferentes} com primeiro nome diferente`);
    for (const g of grupos.slice(0, 5)) {
      console.log("  ex.:", g.map((x) => `${mascara(x.phone)} (${x.totalOrders} ped.)`).join("  ⇄  "));
    }
  }
  console.log(`\nTOTAL: ${totalGrupos} pessoas duplicadas · ${totalAbsorvidos} cadastros a absorver`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
