/**
 * Semeia as fichas da empresa a partir do catálogo aprovado.
 *
 *   npx tsx scripts/seed-fichas.ts            → grava
 *   npx tsx scripts/seed-fichas.ts --ensaio   → só mostra o que faria
 *
 * Rode `seed-organizacao.ts` antes: sem departamento e sem cargo, uma ficha não
 * tem onde morar nem quem responda por ela.
 *
 * ── O QUE ESTE SCRIPT NÃO FAZ, DE PROPÓSITO ──
 *
 * 1. **Não liga nada.** Toda ficha nova nasce `DRAFT` com runtime desligado.
 *    Ligar um agente é decisão do proprietário, uma por uma, com gate.
 *
 * 2. **Não escreve conteúdo em agente de produto.** As fichas 3.2 a 3.4 apontam
 *    para agentes que já existem e operam, com constituição própria. Nelas o
 *    script toca em quatro campos e só: departamento, número do catálogo e os
 *    dois cargos. O `allowedActions` do Waiter não é assunto do catálogo da
 *    empresa.
 *
 * 3. **Não muda decisão de gente.** Se o proprietário ativar uma ficha, rodar o
 *    seed de novo não a desliga: `status` e `isRuntimeEnabled` são preservados
 *    na atualização.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  lerCatalogo,
  paraPerfilNovo,
  cargoResponsavelPor,
  registrarGerentes,
  type FichaDaEmpresa,
} from "../src/services/agents/fichasDaEmpresa";
import { DEPARTAMENTOS } from "../src/services/organizacao/departamentosCanonicos";

const prisma = new PrismaClient();
const ENSAIO = process.argv.includes("--ensaio");

const CATALOGO = path.join(
  process.cwd(),
  "docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md",
);

function departamentoDe(ficha: FichaDaEmpresa) {
  const d = DEPARTAMENTOS.find((x) => x.numero === ficha.departamento);
  if (!d) throw new Error(`Ficha ${ficha.numero} aponta para o departamento ${ficha.departamento}, que não existe.`);
  return d;
}

async function main() {
  const fichas = lerCatalogo(readFileSync(CATALOGO, "utf8"));
  if (fichas.length === 0) {
    throw new Error(`Nenhuma ficha lida de ${CATALOGO}. O catálogo mudou de formato?`);
  }

  const slugPorNumero = new Map(DEPARTAMENTOS.map((d) => [d.numero, d.slug]));
  registrarGerentes(fichas, slugPorNumero);

  const deps = new Map((await prisma.department.findMany()).map((d) => [d.slug, d.id]));
  const cargos = new Map((await prisma.position.findMany()).map((p) => [p.slug, p.id]));

  if (deps.size === 0) {
    throw new Error("Nenhum departamento no banco. Rode `npx tsx scripts/seed-organizacao.ts` primeiro.");
  }

  let criadas = 0;
  let atualizadas = 0;
  let vinculadas = 0;
  const avisos: string[] = [];

  for (const ficha of fichas) {
    const dep = departamentoDe(ficha);
    const departmentId = deps.get(dep.slug);
    if (!departmentId) {
      avisos.push(`${ficha.numero}: departamento "${dep.slug}" não está no banco — ficha pulada.`);
      continue;
    }

    const donoSlug = cargoResponsavelPor(ficha, dep.slug);
    const ownerPositionId = cargos.get(donoSlug) ?? null;
    if (!ownerPositionId) {
      avisos.push(`${ficha.numero}: cargo dono "${donoSlug}" não está no banco — ficha fica sem dono.`);
    }
    // Quem cobra o dono. Na v3 não existe Gerente Geral: acima do Agente Gerente
    // está o Diretor da Foocci, direto.
    const managerPositionId = cargos.get("diretor-foocci") ?? null;

    // ── Ficha que já existe como agente de produto: só o vínculo ──
    if (ficha.jaExisteComo) {
      const alvo = await prisma.agentProfile.findUnique({ where: { slug: ficha.jaExisteComo } });
      if (!alvo) {
        avisos.push(
          `${ficha.numero}: aponta para "${ficha.jaExisteComo}", que não está no banco. ` +
            `Rode o seed de agentes de produto — a ficha NÃO foi criada de novo, para não duplicar.`,
        );
        continue;
      }

      if (!ENSAIO) {
        await prisma.agentProfile.update({
          where: { slug: ficha.jaExisteComo },
          data: { catalogNumber: ficha.numero, departmentId, ownerPositionId, managerPositionId },
        });
      }
      vinculadas++;
      continue;
    }

    // ── Ficha nova da empresa ──
    const novo = paraPerfilNovo(ficha);
    const existente = await prisma.agentProfile.findUnique({ where: { slug: novo.slug } });

    if (existente && existente.population === "PRODUTO") {
      // Colisão de nome com agente de produto. Sobrescrever aqui apagaria a
      // constituição dele — é exatamente o acidente de 07/08/2026.
      avisos.push(
        `${ficha.numero} (${novo.slug}): já existe um agente de PRODUTO com esse slug. ` +
          `NADA foi gravado. Renomeie a ficha no catálogo.`,
      );
      continue;
    }

    if (ENSAIO) {
      existente ? atualizadas++ : criadas++;
      continue;
    }

    if (existente) {
      // `status` e `isRuntimeEnabled` ficam de fora: se o proprietário ligou a
      // ficha, o seed não desliga pelas costas dele.
      await prisma.agentProfile.update({
        where: { slug: novo.slug },
        data: {
          name: novo.name,
          population: novo.population,
          executionMode: novo.executionMode,
          catalogNumber: novo.catalogNumber,
          description: novo.description,
          allowedActions: novo.allowedActions,
          forbiddenActions: novo.forbiddenActions,
          escalationRules: novo.escalationRules,
          evaluationCriteria: novo.evaluationCriteria,
          safetyRules: novo.safetyRules,
          departmentId,
          ownerPositionId,
          managerPositionId,
          source: novo.source,
        },
      });
      atualizadas++;
    } else {
      await prisma.agentProfile.create({
        data: { ...novo, departmentId, ownerPositionId, managerPositionId },
      });
      criadas++;
    }
  }

  // ── Fichas da v1 que não existem mais na planta ──
  //
  // ARQUIVADAS, não apagadas. Apagar tiraria do sistema a prova de que aquela
  // função já foi considerada — e daqui a três meses alguém proporia "criar um
  // Agente de SEO" sem saber que ele existiu e saiu por decisão do CEO.
  //
  // O runtime é desligado junto: uma ficha fora da planta não pode continuar
  // rodando só porque ninguém lembrou de desligá-la.
  const doCatalogo = fichas.map((f) => f.slug);
  const foraDaPlanta = await prisma.agentProfile.findMany({
    where: { population: "EMPRESA", slug: { notIn: doCatalogo }, status: { not: "ARCHIVED" } },
    select: { slug: true, name: true, catalogNumber: true },
  });

  if (!ENSAIO) {
    for (const f of foraDaPlanta) {
      await prisma.agentProfile.update({
        where: { slug: f.slug },
        data: {
          status: "ARCHIVED",
          isRuntimeEnabled: false,
          departmentId: null,
          description: `[APOSENTADA em 25/08/2026 — fora da planta v3] ${f.name}`,
        },
      });
    }
  }

  // ── Relatório ──
  console.log(ENSAIO ? "\n── ENSAIO: nada foi gravado ──\n" : "\n── Fichas da empresa ──\n");

  for (const d of DEPARTAMENTOS) {
    const doDep = fichas.filter((f) => f.departamento === d.numero);
    const ia = doDep.filter((f) => f.modo === "IA").length;
    const humano = doDep.filter((f) => f.modo === "HUMANO").length;
    const hibrido = doDep.filter((f) => f.modo === "HIBRIDO").length;
    console.log(
      `  ${String(d.numero).padStart(2)} · ${d.nome.padEnd(38)} ` +
        `${String(doDep.length).padStart(2)} fichas  (${ia} IA · ${humano} humano · ${hibrido} híbrido)`,
    );
  }

  console.log(
    `\n${criadas} criada(s) · ${atualizadas} atualizada(s) · ${vinculadas} vinculada(s) a agente de produto.`,
  );

  if (foraDaPlanta.length) {
    console.log(
      `\n${foraDaPlanta.length} ficha(s) da v1 arquivada(s), não apagada(s): ` +
        foraDaPlanta.map((f) => f.slug).join(", "),
    );
  }

  if (avisos.length) {
    console.log(`\n⚠ ${avisos.length} aviso(s):`);
    for (const a of avisos) console.log(`   ${a}`);
  }

  if (!ENSAIO) {
    const ativas = await prisma.agentProfile.count({
      where: { population: "EMPRESA", status: "ACTIVE" },
    });
    const ligadas = await prisma.agentProfile.count({
      where: { population: "EMPRESA", isRuntimeEnabled: true },
    });

    await prisma.internalAuditEvent.create({
      data: {
        actorType: "SYSTEM",
        actorLabel: "scripts/seed-fichas",
        acao: "semear_fichas_da_empresa",
        recurso: "agent_profiles",
        resultado: "PERMITIDO",
        detalhe: {
          criadas,
          atualizadas,
          vinculadas,
          arquivadas: foraDaPlanta.length,
          avisos: avisos.length,
        },
      },
    });

    console.log(
      `\nNenhuma ficha foi ligada: ${ativas} ativa(s), ${ligadas} com runtime.\n` +
        "Ligar cada uma é decisão do proprietário, uma por uma, com gate.",
    );
  }
}

main()
  .catch((e) => {
    console.error("Seed falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
