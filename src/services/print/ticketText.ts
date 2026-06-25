/**
 * Plain-text thermal tickets for the Carteiro (80mm ≈ 48 cols).
 *
 * Two formats, modeled on the restaurant's reference notinhas:
 *   - renderKitchenTicketText  → "comanda da cozinha": resumida, SEM preço, só os
 *     itens roteados para AQUELA estação (cada cozinha imprime os seus).
 *   - renderCashierTicketText  → "nota do caixa": completa, com valores, totais e
 *     forma de pagamento (todos os itens).
 *
 * The Carteiro prints `body` as raw text, so accents are stripped to ASCII — the
 * existing test ticket already avoids them (printers commonly garble UTF-8). The
 * year of a birthday-style date is irrelevant; times use the restaurant timezone.
 */

import { formatOrderNumber } from "@/lib/order-number";

export const TICKET_WIDTH = 48;

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Strip diacritics / non-ASCII so the thermal printer never garbles output. */
export function ascii(s: string): string {
  return (s ?? "")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rule(ch = "-"): string {
  return ch.repeat(TICKET_WIDTH);
}

function center(s: string): string {
  const t = s.length > TICKET_WIDTH ? s.slice(0, TICKET_WIDTH) : s;
  const pad = Math.max(0, Math.floor((TICKET_WIDTH - t.length) / 2));
  return " ".repeat(pad) + t;
}

/** left text + right text on one line; wraps left if they collide. */
function lr(left: string, right: string): string {
  const gap = TICKET_WIDTH - left.length - right.length;
  if (gap >= 1) return left + " ".repeat(gap) + right;
  // collision → left on its own (wrapped) line(s), value right-aligned below
  const wrapped = wrap(left, TICKET_WIDTH);
  const last = wrapped.pop() ?? "";
  const tailGap = TICKET_WIDTH - last.length - right.length;
  if (tailGap >= 1) return [...wrapped, last + " ".repeat(tailGap) + right].join("\n");
  return [...wrapped, last, " ".repeat(Math.max(0, TICKET_WIDTH - right.length)) + right].join("\n");
}

/** Greedy word-wrap; hard-breaks words longer than width. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const rawWord of text.split(" ")) {
    let w = rawWord;
    while (w.length > width) {
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (w.length === 0) continue;
    const lastIdx = out.length - 1;
    const last = lastIdx >= 0 ? (out[lastIdx] ?? "") : "";
    if (lastIdx >= 0 && last.length + 1 + w.length <= width) out[lastIdx] = `${last} ${w}`;
    else out.push(w);
  }
  return out.length ? out : [""];
}

/** Item line(s): right-aligned qty column + name, hanging-indented when wrapped. */
function itemLines(qty: number, name: string, priceStr?: string): string[] {
  const q = String(qty).padStart(2);
  const n = ascii(name).toUpperCase();
  const prefix = `${q}  ${n}`;
  const firstMax = TICKET_WIDTH - (priceStr ? priceStr.length + 1 : 0);

  if (prefix.length <= firstMax) {
    const line = priceStr
      ? prefix + " ".repeat(TICKET_WIDTH - prefix.length - priceStr.length) + priceStr
      : prefix;
    return [line];
  }
  // name too long → wrap, keep qty column on the first line, price on the first line
  const wrapped = wrap(n, firstMax - 4);
  const first = `${q}  ${wrapped[0] ?? ""}`;
  const line0 = priceStr
    ? first + " ".repeat(Math.max(1, TICKET_WIDTH - first.length - priceStr.length)) + priceStr
    : first;
  return [line0, ...wrapped.slice(1).map((l) => `    ${l}`)];
}

/** Indented observation, wrapped under a "    >> " marker. */
function obsLines(text: string): string[] {
  return wrap(ascii(text), TICKET_WIDTH - 7).map((l) => `    >> ${l}`);
}

export function money(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: tz,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}/${ascii(get("month")).replace(".", "").toLowerCase()} - ${get("hour")}:${get("minute")}`;
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function fmtTime(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
    }).format(date);
  } catch {
    return "";
  }
}

// ── Addons ────────────────────────────────────────────────────────────────────

interface ParsedAddon { name: string; price?: number }

export function parseAddons(raw: unknown): ParsedAddon[] {
  if (raw == null) return [];
  try {
    const arr: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    const out: ParsedAddon[] = [];
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const rawName = e.name ?? e.label ?? e.desc_item_choice ?? e.description ?? e.desc ?? e.title;
      if (typeof rawName !== "string" || !rawName.trim()) continue;
      const rawPrice = e.price ?? e.unitPrice ?? e.unit_price ?? e.aditional_price ?? e.additionalPrice ?? e.additional_price;
      const price = rawPrice != null ? Number(rawPrice) : undefined;
      out.push({ name: rawName.trim(), price: price != null && !isNaN(price) && price !== 0 ? price : undefined });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Shared types ──────────────────────────────────────────────────────────────

// ESC/POS character-size codes (GS ! n). Double-HEIGHT only keeps the 48-col
// width intact (no re-wrap needed); the printer just prints those lines taller.
const BIG_ON  = "\x1d\x21\x01";
const BIG_OFF = "\x1d\x21\x00";

const TYPE_LABELS: Record<string, string> = {
  DELIVERY: "ENTREGA",
  PICKUP:   "RETIRADA",
  DINE_IN:  "MESA",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Dinheiro", CREDIT_CARD: "Cartao de Credito", DEBIT_CARD: "Cartao de Debito",
  PIX: "Pix", ONLINE: "Pago Online", CARD_MACHINE: "Maquininha", PIX_IN_PERSON: "Pix na Entrega",
};

export interface TicketItem {
  name:       string;
  price:      unknown;
  quantity:   number;
  notes:      string | null;
  addonsJson: unknown;
}

export interface TicketOrder {
  id:           string;
  orderNumber:  number | null;
  type:         string;
  subtotal:     unknown;
  deliveryFee:  unknown;
  discount:     unknown;
  total:        unknown;
  notes:        string | null;
  createdAt:    Date;
  estimatedAt:  Date | null;
  customerName: string;
  customerPhone: string | null;
  address: {
    street: string; number: string; complement: string | null;
    neighborhood: string; city: string;
  } | null;
  payment: { method: string; amount: unknown; status: string | null } | null;
}

export interface TicketStore {
  cnpj?:  string | null;
  lines?: string[];
}

// ── Kitchen ticket ────────────────────────────────────────────────────────────

export function renderKitchenTicketText(args: {
  order: TicketOrder;
  items: TicketItem[];
  restaurantName: string;
  stationName: string;
  timezone: string;
  /** Opt-in: emphasize item lines with ESC/POS double-height ("letras grandes"). */
  largeFont?: boolean;
}): string {
  const { order, items, restaurantName, stationName, timezone, largeFont } = args;
  const L: string[] = [];
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const big = (line: string) => (largeFont ? `${BIG_ON}${line}${BIG_OFF}` : line);

  L.push(rule("="));
  L.push(center(TYPE_LABELS[order.type] ?? ascii(order.type)));
  L.push(lr("", fmtDate(order.createdAt, timezone)));
  L.push(rule("="));
  L.push(`Pedido: ${formatOrderNumber(order.orderNumber, order.id)}`);
  L.push(ascii(order.customerName).toUpperCase());
  if (order.type === "DELIVERY" && order.address?.neighborhood) {
    L.push(`Bairro: ${ascii(order.address.neighborhood)}`);
  }
  L.push(`>> ${ascii(stationName).toUpperCase()}`);
  L.push(rule());
  L.push("Qt  Descricao");
  L.push(rule());

  for (const it of items) {
    for (const ln of itemLines(it.quantity, it.name)) L.push(big(ln));
    for (const a of parseAddons(it.addonsJson)) L.push(`    >> ${ascii(a.name)}`);
    if (it.notes) for (const ln of obsLines(it.notes)) L.push(ln);
  }

  L.push(rule());
  L.push(lr("Itens nesta estacao:", String(totalQty)));
  if (order.notes) {
    L.push(rule());
    for (const ln of wrap(`** ${ascii(order.notes)} **`, TICKET_WIDTH)) L.push(ln);
  }
  L.push(rule("="));
  L.push(center(ascii(restaurantName).toUpperCase()));
  L.push("\n\n\n");
  return L.join("\n");
}

// ── Cashier ticket ────────────────────────────────────────────────────────────

export function renderCashierTicketText(args: {
  order: TicketOrder;
  items: TicketItem[];
  restaurantName: string;
  store: TicketStore;
  timezone: string;
}): string {
  const { order, items, restaurantName, store, timezone } = args;
  const L: string[] = [];
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);

  // Fiscal header
  L.push(rule("="));
  L.push(ascii(restaurantName).toUpperCase());
  if (store.cnpj) L.push(`CNPJ: ${ascii(store.cnpj)}`);
  for (const ln of store.lines ?? []) L.push(ascii(ln));
  L.push(rule("="));

  // Type + date
  L.push(lr(TYPE_LABELS[order.type] ?? ascii(order.type), fmtDate(order.createdAt, timezone)));
  L.push(`Pedido: ${formatOrderNumber(order.orderNumber, order.id)}`);
  L.push(ascii(order.customerName).toUpperCase());
  if (order.customerPhone) L.push(`Telefone: ${ascii(order.customerPhone)}`);

  if (order.type === "DELIVERY" && order.address) {
    const a = order.address;
    const l1 = ascii([a.street, a.number].filter(Boolean).join(", ") + (a.complement ? `, ${a.complement}` : ""));
    if (l1) L.push(l1);
    const l2 = ascii([a.city, a.neighborhood].filter(Boolean).join(" - "));
    if (l2) L.push(l2);
  }

  // Obs block
  const isPaid = !!order.payment && (order.payment.status === "PAID" || order.payment.method === "ONLINE" || order.payment.method === "PIX");
  const paymentLabel = order.payment ? (PAYMENT_LABELS[order.payment.method] ?? ascii(order.payment.method)) : null;
  if (isPaid || order.estimatedAt || order.notes) {
    L.push(rule());
    if (isPaid) L.push(`Obs: ${paymentLabel}`);
    if (order.estimatedAt) L.push(`Entrega para as: ${fmtTime(order.estimatedAt, timezone)}`);
    if (order.notes) for (const ln of wrap(`** ${ascii(order.notes)} **`, TICKET_WIDTH)) L.push(ln);
  }

  // Items + value
  L.push(rule());
  L.push(lr("Qt  Descricao", "Valor"));
  L.push(rule());
  for (const it of items) {
    const lineTotal = money(Number(it.price) * it.quantity);
    for (const ln of itemLines(it.quantity, it.name, lineTotal)) L.push(ln);
    for (const a of parseAddons(it.addonsJson)) {
      L.push(a.price != null ? lr(`    + ${ascii(a.name)}`, money(a.price)) : `    + ${ascii(a.name)}`);
    }
    if (it.notes) for (const ln of obsLines(it.notes)) L.push(ln);
  }
  L.push(rule());
  L.push(lr("Quantidade de itens:", String(totalQty)));

  // Totals
  L.push(lr("Total itens(=)", money(order.subtotal)));
  L.push(lr("Taxa de entrega(+)", money(order.deliveryFee)));
  L.push(lr("Acrescimo(+)", money(0)));
  L.push(lr("Desconto(-)", money(order.discount)));
  L.push(lr("TOTAL(=)", money(order.total)));

  if (order.payment) {
    L.push(rule());
    L.push("Forma de pagamento");
    L.push(lr(paymentLabel ?? "-", money(order.payment.amount)));
  }

  L.push(rule("="));
  L.push(center(ascii(restaurantName).toUpperCase()));
  L.push(center("Foocci"));
  L.push("\n\n\n");
  return L.join("\n");
}
