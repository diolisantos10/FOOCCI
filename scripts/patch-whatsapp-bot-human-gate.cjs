#!/usr/bin/env node
/**
 * Integra o Bot/Humano Gate no inbound comercial e impede que mensagens já
 * consumidas pelo gate reapareçam depois no turno humano.
 *
 * É idempotente e FAIL-CLOSED: se os anchors mudarem, o build falha em vez de
 * publicar uma versão em que o SDR possa receber texto de bot por acidente.
 */
const fs = require("node:fs");
const path = require("node:path");

const inboundPath = path.join(process.cwd(), "src/services/foocci-sdr/FoocciSalesInbound.ts");
const agrupamentoPath = path.join(process.cwd(), "src/services/salaDeVendas/ta/agrupamento.ts");

let inbound = fs.readFileSync(inboundPath, "utf8");
let agrupamento = fs.readFileSync(agrupamentoPath, "utf8");

const importAnchor = 'import type { TipoDaMensagem } from "@prisma/client";';
const importGate = 'import { interceptarAutomacaoAntesDoTA } from "@/services/foocci-sdr/WhatsappBotGate";';

if (!inbound.includes(importGate)) {
  if (!inbound.includes(importAnchor)) {
    throw new Error("Bot/Humano Gate: anchor de import não encontrado; recusando build sem proteção");
  }
  inbound = inbound.replace(importAnchor, `${importAnchor}\n${importGate}`);
}

const chamadaGate = "const botGate = await interceptarAutomacaoAntesDoTA";
const carimboGate = 'turnoId: `bot-gate:${botGate.status}`';

if (!inbound.includes(chamadaGate)) {
  const anchor = '  if (!leitura.temTexto || !msg.text) return undefined;\n\n  try {';
  if (!inbound.includes(anchor)) {
    throw new Error("Bot/Humano Gate: anchor de chamarOTA não encontrado; recusando build sem proteção");
  }

  const integrado = `  if (!leitura.temTexto || !msg.text) return undefined;\n\n  // ⛔ BOT/HUMANO antes do TA. Menu automático nunca vira fala de prospecto.\n  const botGate = await interceptarAutomacaoAntesDoTA(prisma, {\n    leadId,\n    fromPhone: msg.fromPhone,\n    text: msg.text,\n    agora,\n  }).catch((e) => ({\n    intercepted: true as const,\n    status: \"FALHA_DE_NAVEGACAO\" as const,\n    detalhe: \`gate BOT/HUMANO falhou fechado: \${e instanceof Error ? e.message : String(e)}\`,\n  }));\n\n  if (botGate.intercepted) {\n    // A entrada continua visível na conversa/auditoria, mas fica consumida pelo\n    // gate. Sem este carimbo, \"aguarde, vou transferir\" poderia reaparecer\n    // junto com a primeira fala humana e ser interpretado pelo SDR.\n    if (msg.waMessageId) {\n      await prisma.leadMensagem.updateMany({\n        where: { leadId, waMessageId: msg.waMessageId, direcao: \"ENTRADA\" },\n        data: { turnoId: \`bot-gate:\${botGate.status}\` },\n      }).catch((e) =>\n        console.error(\`[foocci-sdr] falha ao carimbar entrada do BOT/HUMANO lead=\${leadId}:\`, e),\n      );\n    }\n\n    console.info(\`[foocci-sdr] BOT/HUMANO: \${botGate.status} — \${botGate.detalhe} lead=\${leadId}\`);\n    return undefined;\n  }\n\n  try {`;

  inbound = inbound.replace(anchor, integrado);
}

if (!inbound.includes(importGate) || !inbound.includes(chamadaGate) || !inbound.includes(carimboGate)) {
  throw new Error("Bot/Humano Gate: validação pós-patch do inbound falhou");
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

if (!agrupamento.includes(marcadorAgrupamento) || !agrupamento.includes('startsWith: "bot-gate:"')) {
  throw new Error("Bot/Humano Gate: validação pós-patch do agrupamento falhou");
}

fs.writeFileSync(inboundPath, inbound, "utf8");
fs.writeFileSync(agrupamentoPath, agrupamento, "utf8");
console.log("[patch] Bot/Humano Gate integrado; entradas automáticas ficam fora do turno humano");