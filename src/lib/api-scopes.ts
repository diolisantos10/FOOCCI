/**
 * API scopes — the per-key permission model for the external API.
 *
 * Each connection key carries a SUBSET of these scopes (stored comma-separated
 * in ApiKey.scope). Every /api/v1/* endpoint requires exactly one scope, so a
 * key only ever reaches the data sets the lojista ticked when creating it:
 * least privilege by construction (e.g. an accountant's key = sales only, the
 * Foocci Manager key = everything the owner chose). Customer data (PII/LGPD) is
 * therefore never exposed unless "customers:read" was explicitly granted.
 */

export const API_SCOPES = [
  "sales:read",
  "customers:read",
  "products:read",
  "finance:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Leigo-friendly labels + descriptions for the key-creation UI. */
export const API_SCOPE_META: Record<ApiScope, { label: string; description: string; pii?: boolean }> = {
  "sales:read":     { label: "Vendas",      description: "Faturamento e pedidos (valor, data, canal, itens)." },
  "customers:read": { label: "Clientes",    description: "Nome, telefone e histórico de compras.", pii: true },
  "products:read":  { label: "Produtos",    description: "Cardápio: itens, categorias e preços." },
  "finance:read":   { label: "Financeiro",  description: "Pagamentos, descontos, taxas e cupom por pedido." },
};

const VALID = new Set<string>(API_SCOPES);

function isScope(s: string): s is ApiScope {
  return VALID.has(s);
}

/** Parse a stored comma-separated scope string into a validated, de-duped list. */
export function parseScopes(raw: string | null | undefined): ApiScope[] {
  if (!raw) return [];
  const out: ApiScope[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (isScope(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Normalize a caller-supplied list into a canonical, storable string. Unknown
 * entries are dropped; an empty/invalid selection falls back to the safe
 * default of sales-only (never zero scopes, never everything-by-accident).
 */
export function serializeScopes(input: unknown): string {
  const arr = Array.isArray(input) ? input : [];
  const valid: ApiScope[] = [];
  for (const raw of arr) {
    if (typeof raw === "string" && isScope(raw) && !valid.includes(raw)) valid.push(raw);
  }
  if (valid.length === 0) valid.push("sales:read");
  // Store in canonical order so lists read consistently regardless of input order.
  return API_SCOPES.filter((s) => valid.includes(s)).join(",");
}

/** Does this granted set (parsed list) include the scope an endpoint requires? */
export function hasScope(granted: ApiScope[], needed: ApiScope): boolean {
  return granted.includes(needed);
}
