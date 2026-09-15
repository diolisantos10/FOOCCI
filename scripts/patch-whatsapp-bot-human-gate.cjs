#!/usr/bin/env node
/**
 * Integra/valida a proteção Bot/Humano no runtime comercial.
 *
 * O gate já mora no source atual; este passo de build mantém as duas travas que
 * impedem uma fala automática consumida pelo gate de reaparecer depois no turno
 * do TA. É idempotente e FAIL-CLOSED: se a estrutura mudar, o build para em vez
 * de publicar uma versão sem a proteção.
 */
const fs = require("node:fs");
const path = require("node:path");

const inboundPath = path.join(process.cwd(), "src/services/foocci-sdr/FoocciSalesInbound.ts");
const agrupamentoPath = path.join(process.cwd(), "src/services/salaDeVendas/ta/agrupamento.ts");

let inbound = fs.readFileSync(inboundPath, "utf8");
let agrupamento = fs.readFileSync(agrupamentoPath, "utf8");

const gateSymbol = "interceptarAutomacaoAntesDoTA";
const gateCall = "interceptarAutomacaoAntesDoTA(tx";
const taDispatch = "comATravaDaConversa";

if (!inbound.includes(gateSymbol) || !inbound.includes(gateCall)) {
  throw new Error("Bot/Humano Gate: chamada do gate não encontrada; recusando build sem proteção");
}

const gateIndex = inbound.indexOf(gateCall);
const taIndex = inbound.indexOf(taDispatch, gateIndex);
if (taIndex < 0 || gateIndex > taIndex) {
  throw new Error("Bot/Humano Gate: gate não está antes do TA; recusando build sem proteção");
}

// O source atual já chama o gate. Falta apenas carimbar a entrada interceptada
// para que o agrupador não a entregue de novo ao TA numa mensagem posterior.
const carimboGate = 'turnoId:`bot-gate:${gate.status}`';
if (!inbound.includes(carimboGate)) {
  const anchor = "if(gate.intercepted){console.info(";
  if (!inbound.includes(anchor)) {
    throw new Error("Bot/Humano Gate: ramo de interceptação não encontrado");
  }

  const protegido = 'if(gate.intercepted){if(msg.waMessageId){await prisma.leadMensagem.updateMany({where:{leadId,waMessageId:msg.waMessageId,direcao:"ENTRADA"},data:{turnoId:`bot-gate:${gate.status}`}}).catch((e)=>console.error(`[foocci-sdr] falha ao carimbar entrada do BotGate ${leadId}:`,e))}console.info(';
  inbound = inbound.replace(anchor, protegido);
}

const marcadorAgrupamento = "BOT/HUMANO: não reconsolidar entrada consumida pelo gate";
if (!agrupamento.includes(marcadorAgrupamento)) {
  const anchorPendentes = `    where: {\n      leadId,\n      direcao: \"ENTRADA\",\n      ...(ultimaSaida ? { ocorreuEm: { gt: ultimaSaida.ocorreuEm } } : {}),\n    },`;
  const pendentesProtegidas = `    where: {\n      leadId,\n      direcao: \"ENTRADA\",\n      // BOT/HUMANO: não reconsolidar entrada consumida pelo gate.\n      OR: [\n        { turnoId: null },\n        { turnoId: { not: { startsWith: \"bot-gate:\" } } },\n      ],\n      ...(ultimaSaida ? { ocorreuEm: { gt: ultimaSaida.ocorreuEm } } : {}),\n    },`;

  if (!agrupamento.includes(anchorPendentes)) {
    throw new Error("Bot/Humano Gate: anchor de entradas pendentes não encontrado");
  }
  agrupamento = agrupamento.replace(anchorPendentes, pendentesProtegidas);

  const anchorChegouDepois = '    where: { leadId, direcao: "ENTRADA", ocorreuEm: { gt: marco } },';
  const chegouDepoisProtegido = `    where: {\n      leadId,\n      direcao: \"ENTRADA\",\n      ocorreuEm: { gt: marco },\n      OR: [\n        { turnoId: null },\n        { turnoId: { not: { startsWith: \"bot-gate:\" } } },\n      ],\n    },`;

  if (!agrupamento.includes(anchorChegouDepois)) {
    throw new Error("Bot/Humano Gate: anchor de chegouEntradaDepois não encontrado");
  }
  agrupamento = agrupamento.replace(anchorChegouDepois, chegouDepoisProtegido);
}

if (!inbound.includes(carimboGate) || !agrupamento.includes(marcadorAgrupamento) || !agrupamento.includes('startsWith: "bot-gate:"')) {
  throw new Error("Bot/Humano Gate: validação pós-patch falhou");
}

fs.writeFileSync(inboundPath, inbound, "utf8");
fs.writeFileSync(agrupamentoPath, agrupamento, "utf8");
console.log("[patch] Bot/Humano Gate validado; entradas automáticas ficam fora do turno humano");
