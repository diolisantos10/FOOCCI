/**
 * SEMEIA O QUE A SALA DE VENDAS PRECISA PARA OPERAR.
 *
 *   npx tsx scripts/seed-sala-de-vendas.ts
 *
 * ── O QUE ELE CRIA ──────────────────────────────────────────────────────────
 *
 *   1. O catálogo de MOTIVOS DE PERDA. Sem ele nenhum lead pode ser marcado
 *      como perdido — a regra do funil exige motivo estruturado, e um catálogo
 *      vazio trava a operação no primeiro "não".
 *   2. A CONFIGURAÇÃO DO TA, **desligada**.
 *   3. Uma CADÊNCIA de retomada, **inativa**.
 *
 * ── O QUE ELE NÃO CRIA, E NUNCA VAI CRIAR ───────────────────────────────────
 *
 * Lead nenhum. Nem de exemplo, nem de demonstração.
 *
 * Um lead falso numa base comercial é indistinguível de um lead real três
 * semanas depois — e alguém vai ligar para ele. Pior: ele entra na contagem do
 * funil e na taxa de conversão, e a partir daí todo número da tela carrega uma
 * mentira que ninguém consegue mais separar.
 *
 * ── IDEMPOTENTE ─────────────────────────────────────────────────────────────
 *
 * Roda quantas vezes for preciso. Um seed que só funciona uma vez quebra
 * exatamente quando alguém precisa reaplicá-lo — que é sempre no pior dia.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Os motivos de perda.
 *
 * Agrupados porque a pergunta que o relatório responde não é "quantos disseram
 * que estava caro" — é "quanto perdemos por PREÇO". Sem grupo, cinco motivos
 * próximos aparecem como cinco linhas pequenas e o padrão some.
 *
 * "Outro" exige detalhe. Sem essa trava ele vira o maior motivo de perda da
 * empresa em dois meses, e não explica coisa nenhuma.
 */
// ── A LÓGICA MORA NO SERVIÇO ────────────────────────────────────────────────
//
// Ela saiu daqui em 25/08/2026 para poder ser chamada também por rota: em
// produção não há terminal, e sem a semeadura NENHUM lead pode ser marcado como
// perdido — a regra do funil exige motivo estruturado, e o catálogo nasce vazio.
//
// Este script continua sendo o caminho de quem tem terminal. Ele CHAMA o
// serviço em vez de repetir a lógica: duas cópias divergiriam no dia em que
// alguém acrescentasse um motivo de perda em uma só.
import { semearSalaDeVendas } from "../src/services/salaDeVendas/semear";

async function main() {
  console.log("\n── Semeando a Sala de Vendas ──\n");

  const r = await semearSalaDeVendas();

  const motivos = r.motivos;
  console.log(`  ✓ ${motivos} motivos de perda no catálogo`);

  const ta = r.configDoTA;
  console.log(
    ta === "criada"
      ? "  ✓ configuração do TA criada — DESLIGADA"
      : "  · configuração do TA já existia — não foi tocada",
  );

  const cadencia = r.cadencia;
  console.log(
    cadencia === "criada"
      ? "  ✓ cadência de retomada criada — INATIVA"
      : "  · cadência de retomada já existia — não foi tocada",
  );

  // O estado que interessa conferir depois: nada ligado.
  const ligado = r.agentesLigados;
  const cadenciasAtivas = r.cadenciasAtivas;

  console.log(
    `\n  Agentes de IA ligados: ${ligado} · cadências ativas: ${cadenciasAtivas}`,
  );
  console.log("  Nenhum lead foi criado. Base de vendas não recebe dado falso.\n");
}

main()
  .catch((e) => {
    console.error("Seed falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
