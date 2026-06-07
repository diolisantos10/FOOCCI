/**
 * Pure report builder for the WA Pedido Texto diagnostic Test Center.
 *
 * Separated from the React page so it can be unit-tested directly: given a
 * processCustomerMessage result, it produces the full plain-text report that
 * the "Copiar relatório / Baixar TXT" buttons emit. No DOM, no React.
 *
 * It exposes every useful engine output (parsed items, menu matches with
 * per-item status, missing questions, comanda, suggested reply, session,
 * payment, safety notes) so the lab is debuggable without reading raw JSON.
 */

import { buildDiagnosticReportText, type DiagnosticReportSection } from "./diagnosticReport";

// ── Minimal structural shapes (subset of WaProcessResult) ─────────────────────

export interface WaReportParsedItem  { rawText: string; quantity: number; name: string }
export interface WaReportMatchedItem {
  rawText?: string; quantity: number; menuItemName: string;
  variantName?: string; unitPrice: number; lineTotal: number;
  options: { optionName: string }[];
}
export interface WaReportUnresolved  { rawText: string; quantity: number; reason: string; candidates: string[] }
export interface WaReportMissingQ    { itemName: string; groupName: string; options: string[] }
export interface WaReportDraftLine   { name: string; quantity: number; variant?: string; options: string[]; lineTotal: number }
export interface WaReportDraft       { subtotal: number; items: WaReportDraftLine[]; missingRequirements: string[] }
export interface WaReportSession {
  status: string; stage: string; deliveryType: string | null;
  paymentMethod: string | null; paymentStatus: string | null; orderId: string | null;
}
export interface WaReportPayment { method: string | null; status: string | null; isDryRunStub?: boolean; changeFor?: number }

export interface WaOrderingReportResult {
  stage:            string;
  intent:           string;
  session:          WaReportSession;
  parsedItems:      WaReportParsedItem[];
  matchedItems:     WaReportMatchedItem[];
  unresolvedItems:  WaReportUnresolved[];
  missingQuestions: WaReportMissingQ[];
  draft:            WaReportDraft | null;
  deliveryQuote:    { fee: number } | null;
  payment:          WaReportPayment | null;
  estimatedTotal:   number;
  suggestedReply:   string;
  operatorSummary:  string;
  safetyNotes:      string[];
  sideEffectsPerformed: string[];
  handoff:          boolean;
}

export interface WaOrderingReportMeta {
  restaurant?:  string;
  slug?:        string;
  phone?:       string;
  mode?:        string;
  messageText:  string;
  previousStage?: string;
}

export type WaMatchStatus =
  | "RESOLVED" | "NEEDS_VARIANT" | "NEEDS_REQUIRED_OPTION"
  | "AMBIGUOUS" | "UNAVAILABLE" | "UNKNOWN";

/** Derives a matched item's resolution status from the pending questions. */
export function deriveMatchStatus(
  item:    { menuItemName: string },
  missing: WaReportMissingQ[],
): WaMatchStatus {
  const qs = missing.filter(q => q.itemName === item.menuItemName);
  if (qs.some(q => q.groupName === "Tamanho/Variante")) return "NEEDS_VARIANT";
  if (qs.length > 0) return "NEEDS_REQUIRED_OPTION";
  return "RESOLVED";
}

function unresolvedStatus(reason: string): WaMatchStatus {
  if (reason === "AMBIGUOUS")   return "AMBIGUOUS";
  if (reason === "UNAVAILABLE") return "UNAVAILABLE";
  return "UNKNOWN";
}

const brl = (n: number) => `R$ ${n.toFixed(2)}`;

export function buildWaOrderingReport(
  r:    WaOrderingReportResult,
  meta: WaOrderingReportMeta,
): string {
  const sections: DiagnosticReportSection[] = [];

  // 1. Parsed items
  sections.push({
    title: "Itens interpretados",
    rows: r.parsedItems.length > 0
      ? r.parsedItems.map((p, i) => ({
          label: `item ${i + 1}`,
          value: `${p.quantity}x ${p.name} (raw: "${p.rawText}")`,
        }))
      : [{ label: "—", value: "Sem itens interpretados" }],
  });

  // 2. Menu matches (resolved + unresolved, each with a status)
  const matchRows: DiagnosticReportSection["rows"] = [];
  for (const m of r.matchedItems) {
    const status = deriveMatchStatus(m, r.missingQuestions);
    const opts   = m.options.map(o => o.optionName).join(", ");
    matchRows.push({
      label: m.menuItemName,
      value: `${m.quantity}x · ${status} · ${brl(m.unitPrice)}${m.variantName ? ` · ${m.variantName}` : ""}${opts ? ` · ${opts}` : ""}`,
    });
  }
  for (const u of r.unresolvedItems) {
    matchRows.push({
      label: u.rawText,
      value: `${unresolvedStatus(u.reason)}${u.candidates.length ? ` · candidatos: ${u.candidates.join(", ")}` : ""}`,
    });
  }
  sections.push({
    title: "Correspondências no cardápio",
    rows: matchRows.length > 0 ? matchRows : [{ label: "—", value: "Nenhum produto encontrado" }],
  });

  // 3. Missing questions
  sections.push({
    title: "Perguntas pendentes",
    rows: r.missingQuestions.length > 0
      ? r.missingQuestions.map(q => ({
          label: q.itemName,
          value: `${q.groupName}? (${q.options.join(", ")})`,
        }))
      : [{ label: "—", value: "Nenhuma pergunta pendente" }],
  });

  // 4. Comanda (draft) — only when items exist
  if (r.draft) {
    const rows: DiagnosticReportSection["rows"] = r.draft.items.map(l => ({
      label: `${l.quantity}x ${l.name}${l.variant ? ` ${l.variant}` : ""}${l.options.length ? ` (${l.options.join(", ")})` : ""}`,
      value: brl(l.lineTotal),
    }));
    rows.push({ label: "Subtotal", value: brl(r.draft.subtotal) });
    if (r.deliveryQuote && r.session.deliveryType === "DELIVERY") {
      rows.push({ label: "Entrega", value: brl(r.deliveryQuote.fee) });
    }
    rows.push({ label: "Total", value: brl(r.estimatedTotal) });
    rows.push({
      label: "Completude",
      value: r.draft.missingRequirements.length > 0
        ? `incompleto: ${r.draft.missingRequirements.join(", ")}`
        : "completo",
    });
    sections.push({ title: "Comanda", rows });
  }

  // 5. Suggested reply
  sections.push({
    title: "Resposta sugerida",
    rows: [{ label: "reply", value: r.suggestedReply || "—" }],
  });

  // 6. Session
  sections.push({
    title: "Sessão",
    rows: [
      { label: "status",            value: r.session.status },
      { label: "stage",             value: r.session.stage },
      { label: "entrega",           value: r.session.deliveryType   ?? "—" },
      { label: "pagamento",         value: r.session.paymentMethod  ?? "—" },
      { label: "pgto status",       value: r.session.paymentStatus  ?? "—" },
      { label: "orderId",           value: r.session.orderId        ?? "—" },
      { label: "efeitos colaterais", value: r.sideEffectsPerformed.length ? r.sideEffectsPerformed.join(", ") : "nenhum" },
    ],
  });

  // 7. Payment (only when present)
  if (r.payment) {
    sections.push({
      title: "Pagamento",
      rows: [
        { label: "método",          value: r.payment.method ?? "—" },
        { label: "status",          value: r.payment.status ?? "—" },
        { label: "stub (não real)", value: r.payment.isDryRunStub ? "sim" : "não" },
        ...(r.payment.changeFor ? [{ label: "troco para", value: brl(r.payment.changeFor) }] : []),
      ],
    });
  }

  // 8. Operator summary (handoff)
  if (r.handoff && r.operatorSummary) {
    sections.push({
      title: "Resumo para o operador",
      rows: [{ label: "resumo", value: r.operatorSummary }],
    });
  }

  return buildDiagnosticReportText({
    tool:        "WA Pedido Texto — Test Center",
    restaurant:  meta.restaurant,
    slug:        meta.slug,
    phone:       meta.phone,
    mode:        meta.mode,
    verdict:     r.handoff ? "HANDOFF — atendente necessário" : r.session.status,
    inputs: {
      mensagem:        meta.messageText,
      "stage anterior": meta.previousStage ?? "—",
      "stage final":    r.stage,
      intent:           r.intent,
    },
    sections,
    safetyNotes: [
      ...r.safetyNotes,
      r.sideEffectsPerformed.length === 0
        ? "nenhum efeito colateral real executado"
        : `efeitos reais: ${r.sideEffectsPerformed.join(", ")}`,
    ],
  });
}
