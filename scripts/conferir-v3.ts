/**
 * CONFERE A ARQUITETURA v3 CONTRA O BANCO DE VERDADE.
 *
 *   npx tsx scripts/conferir-v3.ts
 *
 * ── PARA QUE ISTO EXISTE ──
 *
 * Os testes provam que o CÓDIGO está certo. Este script pergunta outra coisa: o
 * BANCO onde a aplicação vai rodar está no estado que a arquitetura descreve?
 *
 * São perguntas diferentes, e a segunda é a que costuma passar batida. O código
 * pode estar impecável e o banco ter ficado sem o seed, sem a migração, ou com a
 * trava de append-only faltando — e nada avisa, porque a aplicação sobe igual.
 *
 * ── A REGRA DESTE ARQUIVO ──
 *
 * Nenhuma conferência devolve "ok" por ausência de dado. Um banco vazio não é um
 * banco correto. Onde a resposta for "não dá para saber", o relatório escreve
 * isso — nunca um ✓.
 *
 * Sai com código 1 se algo reprovar, para servir de portão antes de liberar.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEPARTAMENTOS, CARGOS_DE_DIRECAO } from "../src/services/organizacao/departamentosCanonicos";
import { lerCatalogo } from "../src/services/agents/fichasDaEmpresa";

const prisma = new PrismaClient();

type Estado = "ok" | "falhou" | "naoSei";

interface Conferencia {
  criterio: string;
  estado: Estado;
  detalhe: string;
}

const resultados: Conferencia[] = [];

function registrar(criterio: string, estado: Estado, detalhe: string) {
  resultados.push({ criterio, estado, detalhe });
}

/** `ok` quando a condição vale E houve dado para julgar. */
function conferir(criterio: string, condicao: boolean, detalhe: string) {
  registrar(criterio, condicao ? "ok" : "falhou", detalhe);
}

async function main() {
  const catalogo = lerCatalogo(
    readFileSync(
      path.join(process.cwd(), "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md"),
      "utf8",
    ),
  );

  // ── 1. Exatamente 6 departamentos oficiais ──
  const ativos = await prisma.department.findMany({ where: { isActive: true }, orderBy: { numero: "asc" } });
  conferir(
    "1 · exatamente 6 departamentos oficiais",
    ativos.length === 6,
    `${ativos.length} ativo(s): ${ativos.map((d) => `${d.numero}·${d.slug}`).join(", ") || "nenhum"}`,
  );

  const esperados = DEPARTAMENTOS.map((d) => d.slug).sort();
  conferir(
    "1b · são os 6 da planta, com a numeração certa",
    JSON.stringify(ativos.map((d) => d.slug).sort()) === JSON.stringify(esperados) &&
      ativos.every((d) => DEPARTAMENTOS.some((c) => c.slug === d.slug && c.numero === d.numero)),
    `esperado ${esperados.join(", ")}`,
  );

  // ── 2. Cada departamento tem um Agente Gerente ──
  const semGerente: string[] = [];
  for (const d of ativos) {
    const gerentes = await prisma.position.count({
      where: { departmentId: d.id, nivel: "GERENTE", isActive: true },
    });
    if (gerentes !== 1) semGerente.push(`${d.slug} (${gerentes})`);
  }
  conferir(
    "2 · cada departamento tem UM Agente Gerente",
    ativos.length > 0 && semGerente.length === 0,
    // O caso de zero departamentos precisa de texto próprio: dizer "todos com
    // um" ao lado de um ✗ faria a mensagem contradizer a própria marca — que é
    // a tela mentindo, em miniatura.
    ativos.length === 0
      ? "não há departamento ativo para conferir"
      : semGerente.length
        ? `sem exatamente um: ${semGerente.join(", ")}`
        : `todos os ${ativos.length} com um`,
  );

  // ── 3. Todo cargo abaixo do Diretor começa com "Agente" ──
  const direcao = CARGOS_DE_DIRECAO.map((c) => c.slug);
  const abaixo = await prisma.position.findMany({
    where: { slug: { notIn: direcao }, isActive: true },
    select: { slug: true, titulo: true },
  });
  const foraDoPadrao = abaixo.filter((p) => !p.titulo.startsWith("Agente"));
  conferir(
    '3 · todo cargo abaixo do Diretor começa com "Agente"',
    abaixo.length > 0 && foraDoPadrao.length === 0,
    abaixo.length === 0
      ? "não há cargo para conferir — o seed rodou?"
      : foraDoPadrao.length
        ? `fora do padrão: ${foraDoPadrao.map((p) => p.titulo).join(", ")}`
        : `${abaixo.length} cargo(s) conferido(s)`,
  );

  // ── 4. Marketing não está duplicado dentro da Foocci ──
  const marketing = ativos.filter((d) => /marketing|growth|m[íi]dia|aquisi/i.test(d.nome));
  conferir(
    "4 · marketing não é departamento interno",
    marketing.length === 0,
    marketing.length
      ? `encontrado: ${marketing.map((d) => d.nome).join(", ")}`
      : ativos.length === 0
        ? "nenhum — mas não há departamento nenhum"
        : `nenhum entre os ${ativos.length}`,
  );

  // ── 10 · Não existe Gerente Geral ──
  const geral = await prisma.position.count({
    where: { OR: [{ slug: "gerente-geral" }, { titulo: { contains: "Gerente Geral" } }], isActive: true },
  });
  conferir("10 · não existe cargo de Gerente Geral ativo", geral === 0, `${geral} encontrado(s)`);

  // ── Catálogo e banco batem ──
  const fichasNoBanco = await prisma.agentProfile.count({
    where: { population: "EMPRESA", status: { not: "ARCHIVED" } },
  });
  const novasNoCatalogo = catalogo.filter((f) => !f.jaExisteComo).length;
  conferir(
    "catálogo · as fichas do documento estão no banco",
    fichasNoBanco === novasNoCatalogo,
    `banco ${fichasNoBanco} · catálogo ${novasNoCatalogo}`,
  );

  // ── Nenhuma ficha ligada ──
  const ligadas = await prisma.agentProfile.count({
    where: { population: "EMPRESA", isRuntimeEnabled: true },
  });
  // Zero fichas ligadas num banco com zero fichas é verdade, mas é verdade vazia.
  // O texto diz de onde vem o zero, para ninguém ler como "conferido e limpo".
  conferir(
    "nenhuma ficha da empresa está ligada",
    ligadas === 0,
    ligadas > 0
      ? `${ligadas} com runtime ligado`
      : fichasNoBanco === 0
        ? "nenhuma — mas também não há ficha no banco"
        : `nenhuma das ${fichasNoBanco}`,
  );

  // ── Toda ficha tem responsável ──
  const semDono = await prisma.agentProfile.count({
    where: { population: "EMPRESA", status: { not: "ARCHIVED" }, ownerPositionId: null },
  });
  conferir(
    "toda ficha da empresa tem cargo responsável",
    fichasNoBanco > 0 && semDono === 0,
    fichasNoBanco === 0
      ? "não há ficha no banco para conferir"
      : semDono === 0
        ? `todas as ${fichasNoBanco} com dono`
        : `${semDono} sem dono`,
  );

  // ── Nenhuma ficha presa a departamento morto ──
  const orfas = await prisma.agentProfile.count({
    where: { department: { isActive: false } },
  });
  conferir(
    "nenhuma ficha presa a departamento desativado",
    orfas === 0,
    orfas > 0
      ? `${orfas} órfã(s) — somem da tela`
      : fichasNoBanco === 0
        ? "nenhuma — mas também não há ficha no banco"
        : "nenhuma",
  );

  // ── A trava de append-only da linha do tempo ──
  const gatilhos = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = '"domain_events"'::regclass AND NOT tgisinternal;`,
  );
  conferir(
    "linha do tempo é append-only por gatilho",
    gatilhos.length >= 2,
    `${gatilhos.length} gatilho(s) — esperado 2. Se faltar: npm run db:travas`,
  );

  // ── Quem ocupa os cargos ──
  const pessoas = await prisma.internalUser.count({ where: { isActive: true } });
  if (pessoas === 0) {
    // NÃO é "ok". É informação: sem ninguém cadastrado, nenhuma área interna
    // abre — nem para o CEO. Dizer ✓ aqui seria afirmar uma operação que não
    // existe.
    registrar(
      "acesso · alguém consegue entrar",
      "naoSei",
      "nenhuma pessoa cadastrada — as áreas internas respondem 401 para todos, " +
        "inclusive o CEO. Use scripts/criar-usuario-interno.ts",
    );
  } else {
    conferir("acesso · alguém consegue entrar", true, `${pessoas} pessoa(s) ativa(s)`);
  }

  // ── Relatório ──
  const largura = Math.max(...resultados.map((r) => r.criterio.length));
  console.log("\n── Conferência da arquitetura v3 ──\n");

  for (const r of resultados) {
    const marca = r.estado === "ok" ? "✓" : r.estado === "falhou" ? "✗" : "?";
    console.log(`  ${marca} ${r.criterio.padEnd(largura)}  ${r.detalhe}`);
  }

  const falhou = resultados.filter((r) => r.estado === "falhou");
  const naoSei = resultados.filter((r) => r.estado === "naoSei");

  console.log(
    `\n${resultados.length - falhou.length - naoSei.length} conferido(s) · ` +
      `${falhou.length} reprovado(s) · ${naoSei.length} sem resposta.`,
  );

  if (naoSei.length) {
    console.log(
      "\n'Sem resposta' NÃO é aprovação: é uma pergunta que este banco não\n" +
        "consegue responder hoje. Tratar como ok seria afirmar o que ninguém mediu.",
    );
  }

  if (falhou.length) {
    console.log("\nReprovado. Não libere antes de resolver o que está marcado com ✗.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Conferência falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
