/**
 * CrmBrainDiagnostic — checagem sintética e hermética de que o piso de segurança
 * do Agente de CRM está 100% de pé. Mesmo molde do WhatsAppBrainDiagnostic.
 *
 * O agente de CRM só pode mandar frases APROVADAS pela Meta, e nunca pode:
 *  • prometer desconto/cupom que não existe (invenção de oferta),
 *  • usar linguagem de spam ("imperdível", "clique agora", "detectamos"…),
 *  • repetir a mesma mensagem que o cliente já recebeu.
 *
 * Este diagnóstico roda esses guardrails DETERMINÍSTICOS (funções puras do
 * MessageVariationService) contra casos sintéticos e prova que os perigosos são
 * barrados e os seguros passam. Puro: sem DB, sem LLM, não envia nada.
 */

import { detectSpamLanguage, impliesDiscount, isRepetitive } from "@/services/crm/MessageVariationService";

interface GuardCase {
  name: string;
  text: string;
  /** Contexto: há cupom real concedido pela campanha? */
  hasCoupon: boolean;
  /** Mensagens já enviadas ao cliente (anti-repetição). */
  previous: string[];
  /** true = o guardrail DEVE barrar esta frase; false = DEVE deixar passar. */
  mustBlock: boolean;
}

const CASES: GuardCase[] = [
  // P0 — invenção de oferta: prometer desconto sem cupom real.
  { name: "desconto sem cupom", text: "Volta pra gente e ganhe 20% de desconto hoje!", hasCoupon: false, previous: [], mustBlock: true },
  // Com cupom real, citar desconto é permitido.
  { name: "desconto com cupom real", text: "Use o cupom VOLTA10 e ganhe 10% no seu próximo pedido 😊", hasCoupon: true, previous: [], mustBlock: false },
  // P0 — spam/linguagem inadequada.
  { name: "spam imperdível", text: "IMPERDÍVEL!! Clique agora, oferta que você não pode perder!", hasCoupon: false, previous: [], mustBlock: true },
  { name: "spam detectamos", text: "Detectamos que faz tempo que você não pede, aproveite já!", hasCoupon: false, previous: [], mustBlock: true },
  // P0 — repetição da mesma mensagem já recebida.
  { name: "repete a anterior", text: "Oi! Que tal um pedido hoje? 😋", hasCoupon: false, previous: ["Oi! Que tal um pedido hoje? 😋"], mustBlock: true },
  // Mensagem segura, no tom, sem oferta inventada, sem spam, nova → passa.
  { name: "mensagem segura", text: "Oi! Faz um tempinho que não te vemos por aqui — bora matar a saudade? 😊", hasCoupon: false, previous: ["Novidades chegando essa semana!"], mustBlock: false },
];

/** Um guardrail barra a frase? (a mesma lógica de composePreview, isolada.) */
function isBlocked(c: GuardCase): boolean {
  if (detectSpamLanguage(c.text).length > 0) return true;
  if (!c.hasCoupon && impliesDiscount(c.text)) return true;
  if (isRepetitive(c.text, c.previous)) return true;
  return false;
}

export interface CrmDiagnosticCase {
  name: string;
  blocked: boolean;
  expectedBlock: boolean;
  pass: boolean;
}

export interface CrmDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  p0: number;
  cases: CrmDiagnosticCase[];
  noSend: true;
  runtimeTouched: false;
}

export function runCrmBrainDiagnostic(): CrmDiagnosticResult {
  const cases: CrmDiagnosticCase[] = [];
  let passed = 0;

  for (const c of CASES) {
    const blocked = isBlocked(c);
    const pass = blocked === c.mustBlock;
    if (pass) passed += 1;
    cases.push({ name: c.name, blocked, expectedBlock: c.mustBlock, pass });
  }

  const allPass = passed === CASES.length;
  return {
    ok: allPass,
    status: allPass ? "PASS" : "FAIL",
    total: CASES.length,
    passed,
    p0: allPass ? 0 : 1,
    cases,
    noSend: true,
    runtimeTouched: false,
  };
}
