/**
 * Shared parser for an OrderItem's `addonsJson` → a flat list of addon lines to
 * print on the comanda (kitchen + cashier, HTML + ESC/POS).
 *
 * WHY THIS EXISTS: checkout stores the customer's choices as an OBJECT
 *   { options: [{ groupName, optionName, qty, priceAdjustment }], extras: [{ name, unitPrice, qty }] }
 * but the old ticket parsers only accepted a flat ARRAY and looked for `name`/`price`
 * — so options (optionName/priceAdjustment) and the whole object shape were dropped,
 * printing "Refri" with no idea WHICH refri / grilled-or-not / add-ons. This parser
 * accepts BOTH the grouped object and legacy arrays, and all the field-name variants
 * different order sources use. Pure + defensive: never throws on weird shapes.
 */

export interface ParsedAddon {
  name: string;
  price?: number;
}

const GROUP_KEYS = ["options", "extras", "adicionais", "addons", "choices", "opcoes"];

function nameOf(e: Record<string, unknown>): string | null {
  const raw =
    e.optionName ?? e.name ?? e.label ?? e.desc_item_choice ??
    e.description ?? e.desc ?? e.title ?? e.optionLabel;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function priceOf(e: Record<string, unknown>): number | undefined {
  const raw =
    e.priceAdjustment ?? e.price ?? e.unitPrice ?? e.unit_price ??
    e.aditional_price ?? e.additionalPrice ?? e.additional_price;
  if (raw == null) return undefined;
  const n = Number(raw);
  return !isNaN(n) && n !== 0 ? n : undefined;
}

function qtyOf(e: Record<string, unknown>): number {
  const raw = e.qty ?? e.quantity;
  const n = raw != null ? Number(raw) : 1;
  return !isNaN(n) && n > 1 ? n : 1;
}

/**
 * Normalizes `addonsJson` (string | array | { options, extras, … }) into a flat,
 * printable list. Every selected option and extra is included; qty > 1 is shown
 * as "2x Nome".
 */
export function parseTicketAddons(raw: unknown): ParsedAddon[] {
  if (raw == null) return [];

  let data: unknown = raw;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return []; }
  }

  // Gather entries from an array OR a grouped object ({ options, extras, … }).
  const entries: unknown[] = [];
  if (Array.isArray(data)) {
    entries.push(...data);
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    // Grouped keys first (options before extras, deterministic order)...
    for (const k of GROUP_KEYS) {
      if (Array.isArray(o[k])) entries.push(...(o[k] as unknown[]));
    }
    // ...then any other array-valued keys we don't know by name.
    for (const [k, v] of Object.entries(o)) {
      if (GROUP_KEYS.includes(k)) continue;
      if (Array.isArray(v)) entries.push(...v);
    }
    // A single un-grouped addon object with a name-ish field.
    if (entries.length === 0 && nameOf(o)) entries.push(o);
  }

  const out: ParsedAddon[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      const name = entry.trim();
      if (name) out.push({ name });
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const base = nameOf(e);
    if (!base) continue;
    const qty = qtyOf(e);
    out.push({ name: qty > 1 ? `${qty}x ${base}` : base, price: priceOf(e) });
  }
  return out;
}
