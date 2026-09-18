/**
 * ⭐ ACORDAR A CONSCIÊNCIA DO CONTATO FRIO — o retrofit, em um comando.
 *
 *     npm run frio:acordar            # conta o que vai fazer, e NÃO escreve
 *     npm run frio:acordar -- --gravar
 *
 * ── O QUE ELE CONSERTA ──────────────────────────────────────────────────────
 *
 * 1. liga cada lead de prospecção à sua `Empresa` e ao seu `Contato` — sem isso
 *    `objetivoDaProspeccao()` devolve `null` e o agente não sabe que o objetivo
 *    de um número frio é achar o responsável comercial;
 * 2. tira o selo "Novo lead" de cima de quem NÓS fomos caçar.
 *
 * ── ⛔ ELE NÃO MANDA MENSAGEM. NENHUMA. ─────────────────────────────────────
 *
 * Nem template, nem retomada, nem "só um oi". Este script só escreve registro.
 * Se um dia alguém precisar acrescentar envio aqui, a resposta é não: quem fala
 * é a esteira de prospecção, com os portões dela.
 *
 * ── E ELE PODE RODAR DE NOVO ────────────────────────────────────────────────
 *
 * Idempotente por construção. A segunda execução devolve `ligados: 0` e
 * `corrigidos: 0` sem criar nada — as escritas por baixo deduplicam no banco.
 */

import { PrismaClient } from "@prisma/client";
import {
  retrofitEmpresaDosLeadsDeProspeccao,
  corrigirEtapaDosContatosFrios,
} from "../src/services/salaDeVendas/prospeccao/empresaDoLead";

const prisma = new PrismaClient();

const FONTES_FRIAS = ["LISTA_PROSPECCAO", "INDICACAO", "IMPORTACAO"] as const;

async function main(): Promise<void> {
  const gravar = process.argv.includes("--gravar");

  const semEmpresa = await prisma.siteLead.count({
    where: { empresaId: null, fonte: { in: [...FONTES_FRIAS] } },
  });
  const comSeloErrado = await prisma.siteLead.count({
    where: { stage: "NOVO", fonte: { in: [...FONTES_FRIAS] } },
  });

  console.log("── ANTES ──────────────────────────────────────────");
  console.log(`contatos frios SEM empresa ligada: ${semEmpresa}`);
  console.log(`contatos frios com selo "Novo lead": ${comSeloErrado}`);

  if (!gravar) {
    // Ensaio é o padrão de propósito: um retrofit que escreve por omissão é um
    // retrofit que já rodou errado uma vez antes de alguém ler a saída.
    console.log('\nENSAIO — nada foi escrito. Rode com "-- --gravar" para valer.');
    return;
  }

  const ligacao = await retrofitEmpresaDosLeadsDeProspeccao(prisma);
  console.log("\n── LIGAÇÃO À EMPRESA ──────────────────────────────");
  console.log(`examinados:            ${ligacao.examinados}`);
  console.log(`LIGADOS:               ${ligacao.ligados}`);
  console.log(`  empresas criadas:    ${ligacao.empresasCriadas}`);
  console.log(`já estavam ligados:    ${ligacao.jaEstavamLigados}`);
  console.log(`SEM LIGAR — sem nome de restaurante: ${ligacao.semNomeDeRestaurante}`);
  console.log(`SEM LIGAR — não é contato frio:      ${ligacao.naoEhContatoFrio}`);
  if (ligacao.falharam.length) {
    console.log(`falharam (${ligacao.falharam.length}):`);
    for (const f of ligacao.falharam) console.log(`  ${f.leadId}: ${f.erro}`);
  }

  const etapa = await corrigirEtapaDosContatosFrios(prisma);
  console.log("\n── O SELO NA TELA ─────────────────────────────────");
  console.log(`examinados:  ${etapa.examinados}`);
  console.log(`CORRIGIDOS:  ${etapa.corrigidos}`);
  console.log(`já eram lead (interesse demonstrado): ${etapa.jaEramLead}`);
  if (etapa.recusados.length) {
    console.log(`recusados (${etapa.recusados.length}):`);
    for (const r of etapa.recusados) console.log(`  ${r.leadId}: ${r.motivo}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
