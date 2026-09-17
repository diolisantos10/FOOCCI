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
const politicaPath = path.join(process.cwd(), "src/services/foocci-sdr/ColdLeadInboundPolicy.ts");
const agrupamentoPath = path.join(process.cwd(), "src/services/salaDeVendas/ta/agrupamento.ts");

let inbound = fs.readFileSync(inboundPath, "utf8");
const politica = fs.readFileSync(politicaPath, "utf8");
let agrupamento = fs.readFileSync(agrupamentoPath, "utf8");

// ⚠️ A CORRENTE TEM DOIS ELOS DESDE QUE O GATEKEEPER FOI LIGADO (17/09/2026).
//
// Antes, o inbound chamava `interceptarAutomacaoAntesDoTA` direto. Hoje ele
// chama `aplicarPoliticaAntesDoTA`, e é ela quem chama o gate por dentro —
// junto do registro do interlocutor e da indicação explícita. A proteção
// continua inteira, mas conferir só o inbound passaria a aprovar um arquivo
// onde o gate não está mais: por isso a validação agora percorre os DOIS elos.
// Quebrar qualquer um deles para o build, como antes.
const politicaCall = "aplicarPoliticaAntesDoTA(tx";
const gateSymbol = "interceptarAutomacaoAntesDoTA";
const gateCallNaPolitica = "interceptarAutomacaoAntesDoTA(db";
const taDispatch = "comATravaDaConversa";

if (!inbound.includes(politicaCall)) {
  throw new Error("Bot/Humano Gate: política antes do TA não é chamada no inbound; recusando build sem proteção");
}
if (!politica.includes(gateSymbol) || !politica.includes(gateCallNaPolitica)) {
  throw new Error("Bot/Humano Gate: a política não chama o gate; recusando build sem proteção");
}

const gateIndex = inbound.indexOf(politicaCall);
const taIndex = inbound.indexOf(taDispatch, gateIndex);
if (taIndex < 0 || gateIndex > taIndex) {
  throw new Error("Bot/Humano Gate: gate não está antes do TA; recusando build sem proteção");
}

// O source atual já chama o gate. Falta apenas carimbar a entrada interceptada
// para que o agrupador não a entregue de novo ao TA numa mensagem posterior.
//
// ⚠️ O carimbo passou a usar `gate.kind` (BOT | REFERRAL), e não `gate.status`:
// quem devolve agora é a política, e `status` era campo do gate antigo — lê-lo
// aqui gravaria `bot-gate:undefined`. O prefixo `bot-gate:` é o que o
// agrupamento filtra, e ele continua igual.
const carimboGate = 'turnoId:`bot-gate:${gate.kind}`';
if (!inbound.includes(carimboGate)) {
  const anchor = "if(gate.intercepted){console.info(";
  if (!inbound.includes(anchor)) {
    throw new Error("Bot/Humano Gate: ramo de interceptação não encontrado");
  }

  const protegido = 'if(gate.intercepted){if(msg.waMessageId){await prisma.leadMensagem.updateMany({where:{leadId,waMessageId:msg.waMessageId,direcao:"ENTRADA"},data:{turnoId:`bot-gate:${gate.kind}`}}).catch((e)=>console.error(`[foocci-sdr] falha ao carimbar entrada do BotGate ${leadId}:`,e))}console.info(';
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
