#!/usr/bin/env node
/**
 * Build guard for the commercial Bot/Human gate.
 *
 * This used to patch FoocciSalesInbound.ts in-place. The runtime was later
 * integrated directly in source, so the old textual anchors became stale and
 * started rejecting otherwise valid production builds. Keep the guard, but make
 * it validation-only: fail closed if the gate disappears or is moved after the
 * TA dispatch.
 */
const fs = require("node:fs");
const path = require("node:path");

const inboundPath = path.join(process.cwd(), "src/services/foocci-sdr/FoocciSalesInbound.ts");

const inbound = fs.readFileSync(inboundPath, "utf8");

const gateSymbol = "interceptarAutomacaoAntesDoTA";
const gateCall = "interceptarAutomacaoAntesDoTA(tx";
const taDispatch = "comATravaDaConversa";

if (!inbound.includes(gateSymbol)) {
  throw new Error("Bot/Humano Gate: import/uso do gate não encontrado; recusando build sem proteção");
}

const gateIndex = inbound.indexOf(gateCall);
const taIndex = inbound.indexOf(taDispatch, gateIndex >= 0 ? gateIndex : 0);

if (gateIndex < 0) {
  throw new Error("Bot/Humano Gate: chamada do gate não encontrada; recusando build sem proteção");
}

if (taIndex < 0 || gateIndex > taIndex) {
  throw new Error("Bot/Humano Gate: gate não está antes do TA; recusando build sem proteção");
}

console.log("[guard] Bot/Humano Gate validado antes do TA; build liberado");
