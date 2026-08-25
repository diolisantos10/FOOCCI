/**
 * Semeia a estrutura organizacional oficial da Foocci (v3):
 * 6 departamentos, 2 cargos de direção e os 28 cargos de agente.
 *
 *   npx tsx scripts/seed-organizacao.ts
 *
 * ── O QUE ESTE SCRIPT NÃO FAZ, DE PROPÓSITO ──
 *
 * Não cria pessoa nenhuma. Os cargos nascem VAGOS.
 *
 * Quem ocupa cada cargo é fato sobre a empresa, não decisão de engenharia — e
 * inventar um "Agente Gerente Comercial" para a tela não ficar vazia produziria
 * exatamente a mentira que este programa existe para impedir: uma tela dizendo
 * que alguém responde por uma área quando ninguém responde.
 *
 * Cargo vago aparece como vago. É informação, não defeito.
 *
 * ── DE ONDE VÊM OS 28 CARGOS DE AGENTE ──
 *
 * Do catálogo (`02-DEPARTAMENTOS-E-AGENTES.md`), não de uma lista aqui dentro.
 * Na v3, ficha e cargo são a mesma coisa vista de dois ângulos, e manter duas
 * listas produziria duas fontes que podem discordar sobre quem existe.
 *
 * ── MIGRAÇÃO DA v1 ──
 *
 * Departamento e cargo que saíram da planta são DESATIVADOS, não apagados.
 * Apagar tiraria do sistema a prova de que aquela área existiu, e daqui a três
 * meses alguém proporia recriá-la sem saber que ela saiu por decisão do CEO.
 *
 * Idempotente: rodar duas vezes não duplica nada.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEPARTAMENTOS,
  DEPARTAMENTOS_APOSENTADOS,
  CARGOS_DE_DIRECAO,
} from "../src/services/organizacao/departamentosCanonicos";
import {
  lerCatalogo,
  cargoDaFicha,
  registrarGerentes,
} from "../src/services/agents/fichasDaEmpresa";

const prisma = new PrismaClient();

const CATALOGO = path.join(
  process.cwd(),
  "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md",
);

interface CargoParaSemear {
  slug: string;
  titulo: string;
  nivel: "CEO" | "DIRETOR" | "GERENTE" | "OPERACAO";
  departamento: string | null;
  reportaA: string | null;
}

async function ocupacao(slug: string): Promise<string> {
  const n = await prisma.internalUser.count({ where: { position: { slug }, isActive: true } });
  return n === 0 ? "vago" : `${n} ocupante(s)`;
}

async function main() {
  const fichas = lerCatalogo(readFileSync(CATALOGO, "utf8"));
  if (fichas.length === 0) {
    throw new Error(`Nenhuma ficha lida de ${CATALOGO}. O catálogo mudou de formato?`);
  }

  const slugPorNumero = new Map(DEPARTAMENTOS.map((d) => [d.numero, d.slug]));
  registrarGerentes(fichas, slugPorNumero);

  // ── Liberar a faixa de numeração ANTES de escrever a nova ──
  //
  // `numero` é único, e a v3 renumera: `vendas` era 2 e passa a 1, `produto` era
  // 5 e passa a 3. Escrever direto colide no meio do caminho — o `produto` tenta
  // pegar o 3 que a `implantacao` ainda ocupa.
  //
  // A saída é esvaziar a faixa inteira primeiro, mandando todo mundo para
  // números NEGATIVOS. Duas propriedades importam:
  //
  //   1. negativo nunca colide com a numeração final, que é positiva;
  //   2. o índice é sequencial e recalculado a cada corrida, então rodar o seed
  //      duas vezes dá o mesmo resultado.
  //
  // A primeira versão disto usava `900 + numero`, e funcionava — uma vez. Na
  // segunda corrida os aposentados já estavam em 901, e o `vendas` colidia com
  // eles ao tentar o mesmo 901. Um seed que só funciona na primeira execução é
  // um seed que quebra exatamente quando alguém precisa reaplicá-lo.
  const existentes = await prisma.department.findMany({ orderBy: { id: "asc" } });
  for (const [i, d] of existentes.entries()) {
    await prisma.department.update({ where: { id: d.id }, data: { numero: -(i + 1) } });
  }

  // ── Departamentos oficiais ──
  console.log("── Departamentos oficiais (v3)");
  for (const d of DEPARTAMENTOS) {
    const dep = await prisma.department.upsert({
      where: { slug: d.slug },
      update: { numero: d.numero, nome: d.nome, missao: d.missao, isActive: true },
      create: { numero: d.numero, slug: d.slug, nome: d.nome, missao: d.missao },
    });
    console.log(`   ${String(dep.numero).padStart(2)} · ${dep.nome}`);
  }

  // ── Departamentos que saíram da planta ──
  const aposentados: string[] = [];
  for (const a of DEPARTAMENTOS_APOSENTADOS) {
    const existente = await prisma.department.findUnique({ where: { slug: a.slug } });
    if (!existente) continue;
    const jaEstavaInativo = !existente.isActive;
    await prisma.department.update({
      where: { slug: a.slug },
      data: {
        isActive: false,
        // Fora da faixa oficial (1 a 6) e estável entre corridas: a ordem vem da
        // lista de aposentados, não de onde o departamento estava antes.
        numero: 900 + DEPARTAMENTOS_APOSENTADOS.findIndex((x) => x.slug === a.slug) + 1,
        missao: `[APOSENTADO em 25/08/2026] ${a.motivo}`,
      },
    });

    // Ficha presa a departamento morto não aparece em lugar nenhum: some da
    // tela do departamento (que está inativo) e não entra em nenhum dos seis.
    // Soltar o vínculo é o que a mantém visível.
    const soltas = await prisma.agentProfile.updateMany({
      where: { departmentId: existente.id },
      data: { departmentId: null },
    });

    // Só entra no relatório quando MUDA de estado. Repetir a lista a cada
    // corrida faria parecer que algo aconteceu quando nada aconteceu.
    if (!jaEstavaInativo || soltas.count > 0) {
      aposentados.push(
        `${existente.nome} — ${a.motivo}` +
          (soltas.count > 0 ? ` (${soltas.count} ficha(s) solta(s) do vínculo)` : ""),
      );
    }
  }

  // ── Cargos ──
  const cargos: CargoParaSemear[] = [
    ...CARGOS_DE_DIRECAO.map((c) => ({
      slug: c.slug,
      titulo: c.titulo,
      nivel: c.nivel,
      departamento: c.departamento ?? null,
      reportaA: c.reportaA ?? null,
    })),
    ...fichas.map((f) => {
      const dep = slugPorNumero.get(f.departamento);
      if (!dep) {
        throw new Error(
          `Ficha ${f.numero} aponta para o departamento ${f.departamento}, que não existe na v3.`,
        );
      }
      const c = cargoDaFicha(f, dep);
      return {
        slug: c.slug,
        titulo: c.titulo,
        nivel: c.nivel,
        departamento: c.departamento,
        reportaA: c.reportaA,
      };
    }),
  ];

  // Duas passagens: a primeira cria, a segunda liga o organograma. Sem isso, um
  // cargo tentaria reportar a outro que ainda não existe.
  for (const c of cargos) {
    const departmentId = c.departamento
      ? ((await prisma.department.findUnique({ where: { slug: c.departamento } }))?.id ?? null)
      : null;

    await prisma.position.upsert({
      where: { slug: c.slug },
      update: { titulo: c.titulo, nivel: c.nivel, departmentId, isActive: true },
      create: { slug: c.slug, titulo: c.titulo, nivel: c.nivel, departmentId },
    });
  }

  for (const c of cargos) {
    if (!c.reportaA) continue;
    const chefe = await prisma.position.findUnique({ where: { slug: c.reportaA } });
    if (!chefe) throw new Error(`Cargo "${c.slug}" reporta a "${c.reportaA}", que não existe.`);
    await prisma.position.update({
      where: { slug: c.slug },
      data: { reportsToPositionId: chefe.id },
    });
  }

  // ── Cargos da v1 que não estão mais na planta ──
  const oficiais = cargos.map((c) => c.slug);
  const sobrando = await prisma.position.findMany({
    where: { slug: { notIn: oficiais }, isActive: true },
  });
  for (const p of sobrando) {
    await prisma.position.update({ where: { id: p.id }, data: { isActive: false } });
  }

  // ── Relatório ──
  console.log("\n── Direção");
  for (const c of CARGOS_DE_DIRECAO) {
    console.log(`   ${c.titulo.padEnd(46)} ${await ocupacao(c.slug)}`);
  }

  for (const d of DEPARTAMENTOS) {
    console.log(`\n── ${d.numero}. ${d.nome}`);
    const doDep = cargos
      .filter((c) => c.departamento === d.slug)
      // Gerente primeiro: é ele quem responde pelo departamento.
      .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "GERENTE" ? -1 : 1));

    for (const c of doDep) {
      console.log(`   ${c.titulo.padEnd(46)} ${await ocupacao(c.slug)}`);
    }
  }

  const pessoas = await prisma.internalUser.count();
  console.log(
    `\n${DEPARTAMENTOS.length} departamentos · ${cargos.length} cargos · ${pessoas} pessoa(s).`,
  );

  if (aposentados.length) {
    console.log(`\n${aposentados.length} departamento(s) da v1 desativado(s), não apagado(s):`);
    for (const a of aposentados) console.log(`   ${a}`);
  }
  if (sobrando.length) {
    console.log(
      `\n${sobrando.length} cargo(s) da v1 desativado(s): ${sobrando.map((p) => p.slug).join(", ")}`,
    );
  }

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
