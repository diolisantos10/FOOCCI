/**
 * InvoiceExtractService — reads a purchase invoice (foto or PDF text) and
 * returns structured line items for the Insumos import review.
 *
 * Regra de Ouro (Lei 1): fala com a IA SOMENTE através do Brain —
 * selectEngine() escolhe o piloto governado e callStructuredJson() executa.
 *
 * Extraction is READ-ONLY: results become proposals the lojista confirms on
 * screen (InvoiceMatchService builds them); nothing is applied automatically.
 */

import { selectEngine } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
import type { ExtractedInvoiceItem } from "./InvoiceMatchService";

/** Agent id under Brain governance (routing/telemetry). */
const AGENT_ID = "invoice-reader";
const MAX_ITEMS = 100;

const SYSTEM_PROMPT = `Você extrai itens de notas fiscais, cupons fiscais e recibos de compra de insumos de restaurantes brasileiros.

Responda APENAS com JSON válido neste formato exato:
{"items":[{"name":"...","quantity":1.5,"unit":"kg","unitPrice":89.9,"totalPrice":134.85}]}

Regras:
- name: descrição do produto exatamente como está na nota
- quantity: quantidade comprada (número; null se ilegível)
- unit: unidade de venda — kg, g, L, ml, un, cx, pct, dz (null se ilegível)
- unitPrice: preço de UMA unidade (null se a nota só mostra o total)
- totalPrice: valor total da linha (null se ilegível)
- números com ponto decimal, sem "R$"
- IGNORE linhas que não são produtos: frete, desconto, impostos, subtotal, total, forma de pagamento, troco
- Se a imagem não parecer uma nota/cupom de compra, retorne {"items":[]}`;

function invoiceEngineSelection() {
  const selection = selectEngine(AGENT_ID);
  // Deploy-level accuracy override (e.g. gpt-4o) without a code change.
  const model = process.env.INVOICE_EXTRACT_MODEL ?? selection.model;
  return { ...selection, model };
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function parseItems(raw: string | null | undefined): ExtractedInvoiceItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const result: ExtractedInvoiceItem[] = [];
  for (const it of items.slice(0, MAX_ITEMS)) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (name.length < 2) continue;
    result.push({
      name,
      quantity: toNumberOrNull(o.quantity),
      unit: typeof o.unit === "string" && o.unit.trim() !== "" ? o.unit.trim().slice(0, 20) : null,
      unitPrice: toNumberOrNull(o.unitPrice),
      totalPrice: toNumberOrNull(o.totalPrice),
    });
  }
  return result;
}

/** Foto da nota (JPEG/PNG/WebP) → itens estruturados. */
export async function extractFromImage(
  base64: string,
  mimeType: string
): Promise<ExtractedInvoiceItem[]> {
  const raw = await callStructuredJson({
    selection: invoiceEngineSelection(),
    systemPrompt: SYSTEM_PROMPT,
    userContent: "Extraia os itens desta nota de compra:",
    imageDataUrl: `data:${mimeType};base64,${base64}`,
    temperature: 0,
    responseFormat: "json",
  });
  return parseItems(raw);
}

/** Texto extraído de um PDF (via pdf-parse) → itens estruturados. */
export async function extractFromText(text: string): Promise<ExtractedInvoiceItem[]> {
  const raw = await callStructuredJson({
    selection: invoiceEngineSelection(),
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Extraia os itens desta nota de compra (texto extraído de PDF):\n\n${text.slice(0, 20000)}`,
    temperature: 0,
    responseFormat: "json",
  });
  return parseItems(raw);
}

export const InvoiceExtractService = { extractFromImage, extractFromText, parseItems };
