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
      select: { id: true, phone: true, totalOrders: true, createdAt: true },
    });
    const grupos = gruposDuplicados(clientes);
    if (!grupos.length) continue;
    const absorvidos = grupos.flatMap((g) => { const s = sobrevivente(g); return g.filter((x) => x.id !== s.id); });
    const ids = absorvidos.map((a) => a.id);
    const [pedidos, cupons, envios] = await Promise.all([
      prisma.order.count({ where: { customerId: { in: ids } } }),
      prisma.customerCoupon.count({ where: { customerId: { in: ids } } }),
      prisma.campaignExecution.count({ where: { customerId: { in: ids } } }),
    ]);
    totalGrupos += grupos.length; totalAbsorvidos += absorvidos.length;
    console.log(`\n${r.name} (${r.slug}) — ${clientes.length} clientes com telefone`);
    console.log(`  pessoas duplicadas: ${grupos.length} · cadastros a absorver: ${absorvidos.length}`);
    console.log(`  o que muda de dono: ${pedidos} pedidos · ${cupons} cupons · ${envios} envios de campanha`);
    for (const g of grupos.slice(0, 5)) {
      console.log("  ex.:", g.map((x) => `${mascara(x.phone)} (${x.totalOrders} ped.)`).join("  ⇄  "));
    }
  }
  console.log(`\nTOTAL: ${totalGrupos} pessoas duplicadas · ${totalAbsorvidos} cadastros a absorver`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
