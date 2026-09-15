#!/usr/bin/env node
/**
 * Patch de integração do Bot/Humano Gate no único ponto que chama o TA após
 * receber WhatsApp de vendas. É idempotente e FAIL-CLOSED: se os anchors mudarem,
 * o build falha em vez de publicar uma versão sem a proteção.
 *
 * O módulo funcional vive em src/services/foocci-sdr/WhatsappBotGate.ts.
 * Este patch existe porque a branch de produção é compartilhada e o Railway já
 * usa patches de build para contratos críticos; evita reescrever um arquivo de
 * recepção grande enquanto outras entregas mexem nele.
 */
const fs = require("node:fs");
const path = require("node:path");

const arquivo = path.join(process.cwd(), "src/services/foocci-sdr/FoocciSalesInbound.ts");
let fonte = fs.readFileSync(arquivo, "utf8");

const importAnchor = 'import type { TipoDaMensagem } from "@prisma/client";';
const importGate = 'import { interceptarAutomacaoAntesDoTA } from "@/services/foocci-sdr/WhatsappBotGate";';

if (!fonte.includes(importGate)) {
  if (!fonte.includes(importAnchor)) {
    throw new Error("Bot/Humano Gate: anchor de import não encontrado; recusando build sem proteção");
  }
  fonte = fonte.replace(importAnchor, `${importAnchor}\n${importGate}`);
}

const chamadaGate = "const botGate = await interceptarAutomacaoAntesDoTA";
if (!fonte.includes(chamadaGate)) {
  const anchor = '  if (!leitura.temTexto || !msg.text) return undefined;\n\n  try {';
  if (!fonte.includes(anchor)) {
    throw new Error("Bot/Humano Gate: anchor de chamarOTA não encontrado; recusando build sem proteção");
  }

  const integrado = `  if (!leitura.temTexto || !msg.text) return undefined;\n\n  // ⛔ BOT/HUMANO antes do TA. Menu automático nunca vira fala de prospecto.\n  // A mensagem já foi gravada; aqui decidimos somente se ela pode chegar ao SDR.\n  const botGate = await interceptarAutomacaoAntesDoTA(prisma, {\n    leadId,\n    fromPhone: msg.fromPhone,\n    text: msg.text,\n    agora,\n  }).catch((e) => ({\n    intercepted: true as const,\n    status: \"FALHA_DE_NAVEGACAO\" as const,\n    detalhe: \`gate BOT/HUMANO falhou fechado: \${e instanceof Error ? e.message : String(e)}\`,\n  }));\n\n  if (botGate.intercepted) {\n    console.info(\`[foocci-sdr] BOT/HUMANO: \${botGate.status} — \${botGate.detalhe} lead=\${leadId}\`);\n    return undefined;\n  }\n\n  try {`;

  fonte = fonte.replace(anchor, integrado);
}

if (!fonte.includes(importGate) || !fonte.includes(chamadaGate)) {
  throw new Error("Bot/Humano Gate: validação pós-patch falhou");
}

fs.writeFileSync(arquivo, fonte, "utf8");
console.log("[patch] Bot/Humano Gate integrado antes do TA");
