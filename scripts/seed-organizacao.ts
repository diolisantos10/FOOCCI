/**
 * Semeia a estrutura organizacional da Foocci: 9 departamentos e 12 cargos.
 *
 *   npx tsx scripts/seed-organizacao.ts
 *
 * ── O QUE ESTE SCRIPT NÃO FAZ, DE PROPÓSITO ──
 *
 * Não cria pessoa nenhuma. Os cargos nascem VAGOS.
 *
 * Quem ocupa cada cargo é fato sobre a empresa, não decisão de engenharia — e
 * inventar um "Gerente de Marketing" para a tela não ficar vazia produziria
 * exatamente a mentira que este programa existe para impedir: uma tela dizendo
 * que alguém responde por uma área quando ninguém responde.
 *
 * Cargo vago aparece como vago. É informação, não defeito.
 *
 * Idempotente: rodar duas vezes não duplica nada.
 */

import { PrismaClient } from "@prisma/client";
import { DEPARTAMENTOS, CARGOS } from "../src/services/organizacao/departamentosCanonicos";

const prisma = new PrismaClient();

async function main() {
  console.log("── Departamentos");
  for (const d of DEPARTAMENTOS) {
    const dep = await prisma.department.upsert({
      where: { slug: d.slug },
      update: { numero: d.numero, nome: d.nome, missao: d.missao },
      create: { numero: d.numero, slug: d.slug, nome: d.nome, missao: d.missao },
    });
    console.log(`   ${String(dep.numero).padStart(2)} · ${dep.nome}`);
  }

  // Duas passagens: a primeira cria os cargos, a segunda liga o organograma.
  // Sem isso, um cargo tentaria reportar a outro que ainda não existe.
  console.log("\n── Cargos (todos vagos)");
  for (const c of CARGOS) {
    const departmentId = c.departamento
      ? (await prisma.department.findUnique({ where: { slug: c.departamento } }))?.id ?? null
      : null;

    await prisma.position.upsert({
      where: { slug: c.slug },
      update: { titulo: c.titulo, nivel: c.nivel, departmentId },
      create: { slug: c.slug, titulo: c.titulo, nivel: c.nivel, departmentId },
    });
  }

  for (const c of CARGOS) {
    if (!c.reportaA) continue;
    const chefe = await prisma.position.findUnique({ where: { slug: c.reportaA } });
    if (!chefe) throw new Error(`Cargo "${c.slug}" reporta a "${c.reportaA}", que não existe.`);
    await prisma.position.update({
      where: { slug: c.slug },
      data: { reportsToPositionId: chefe.id },
    });
  }

  for (const c of CARGOS) {
    const ocupantes = await prisma.internalUser.count({
      where: { position: { slug: c.slug }, isActive: true },
    });
    console.log(`   ${c.titulo.padEnd(42)} ${ocupantes === 0 ? "vago" : `${ocupantes} ocupante(s)`}`);
  }

  const pessoas = await prisma.internalUser.count();
  console.log(
    `\n${DEPARTAMENTOS.length} departamentos · ${CARGOS.length} cargos · ${pessoas} pessoa(s).`,
  );

  if (pessoas === 0) {
    console.log(
      "\nNenhuma pessoa cadastrada — é o esperado. Quem ocupa cada cargo é\n" +
        "decisão do proprietário, e este script não a toma no lugar dele.\n" +
        "Para criar o primeiro acesso: npx tsx scripts/criar-usuario-interno.ts",
    );
  }
}

main()
  .catch((e) => {
    console.error("Seed falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
