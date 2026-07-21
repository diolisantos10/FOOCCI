/**
 * renderCrmMessage — the single canonical renderer for CRM WhatsApp messages.
 *
 * The exact saved CRM template is sent, with variables resolved and links/emojis/
 * line breaks preserved byte-for-byte. There is NO AI rewrite, NO greeting prefix,
 * and NO link-to-handle transformation in this path.
 *
 * Variable syntax (all equivalent — backwards compatible):
 *   {nome}  ·  {{nome}}  ·  { nome }  ·  {{ nome }}
 *
 * Why both braces: the UI documents single braces ({nome}), but older saved
 * templates use double braces ({{nome}}). A single-brace-only renderer turned
 * "{{nome}}" into "{Diego}" (it replaced the inner {nome} and left the outer
 * braces). Matching {{?...}}? for each known variable fixes that for good — the
 * output never contains "{Diego}" or "{{Diego}}".
 *
 * Pure module: no DB, no network, no clock side effects beyond Date.now() for the
 * "days since last order" label. Safe to import on the client (preview).
 */

import { buildInstagramUrl, buildTikTokUrl, buildFacebookUrl, buildYouTubeUrl } from "@/lib/social";

export interface RenderCustomer {
  name:         string;
  tier?:        string | null;
  lastOrderAt?: string | null;
  /** Customer id — powers the personal referral link ({link_indicacao}). */
  id?:          string | null;
}

export interface RenderContext {
  restaurantName:  string;
  pedidoUrl:       string;
  googleReviewUrl?: string | null;
  instagramUrl?:   string | null;
  tiktokUrl?:      string | null;
  facebookUrl?:    string | null;
  youtubeUrl?:     string | null;
  /** Campaign coupon — drives {cupom}, e.g. "20% de desconto" / "sobremesa grátis".
   *  `expiresAt` (a wallet coupon's REAL expiry, e.g. the cupom-vencendo campaign)
   *  wins over validityDays when resolving {validade}. */
  coupon?:         { type: "PERCENTAGE" | "FIXED" | "CUSTOM" | "FREE_SHIPPING"; value: number; description?: string | null; validityDays?: number | null; expiresAt?: Date | string | null } | null;
  /** Next-tier nudge ("Quase no próximo nível"): the tier the customer is chasing
   *  and how much spend is missing — both resolved per recipient by the runner. */
  nextTierLabel?:   string | null;
  nextTierMissing?: number | null;
}

/** True when the coupon actually carries a benefit (drives {cupom}/{validade}). */
function couponHasBenefit(coupon: RenderContext["coupon"]): boolean {
  if (!coupon) return false;
  if (coupon.type === "FREE_SHIPPING") return true; // benefit is the fee itself
  return coupon.type === "CUSTOM" ? !!coupon.description?.trim() : coupon.value > 0;
}

/** Owner-facing coupon phrasing for use inside a message ("20% de desconto"). */
export function couponMessageLabel(coupon: RenderContext["coupon"]): string {
  if (!couponHasBenefit(coupon)) return "";
  if (coupon!.type === "CUSTOM")        return coupon!.description!.trim();
  if (coupon!.type === "FREE_SHIPPING") return "frete grátis";
  return coupon!.type === "PERCENTAGE" ? `${coupon!.value}% de desconto` : `R$ ${coupon!.value} de desconto`;
}

/** The coupon's expiry date as "dd/mm" — the real expiresAt when present, else
 *  today + validityDays. Empty if no coupon benefit. */
export function couponValidadeLabel(coupon: RenderContext["coupon"]): string {
  if (!couponHasBenefit(coupon)) return "";
  if (coupon!.expiresAt) {
    const d = new Date(coupon!.expiresAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
  }
  const days = coupon!.validityDays && coupon!.validityDays > 0 ? coupon!.validityDays : 30;
  const expiry = new Date(Date.now() + days * 86_400_000);
  return expiry.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const TIER_LABELS: Record<string, string> = {
  BRONZE: "Bronze", PRATA: "Prata", OURO: "Ouro", DIAMANTE: "Diamante",
};

/** Variable names this renderer knows how to resolve. */
export const KNOWN_CRM_VARIABLES = [
  "nome",
  "restaurante",
  "ultimo_pedido",
  "nivel",
  "dias_sem_pedir",
  "produto_favorito",
  "link_cardapio",
  "link_avaliacao_google",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "cupom",
  "validade",
  "proximo_nivel",
  "falta_proximo_nivel",
  "link_indicacao",
] as const;

/**
 * Builds a regex matching a SPECIFIC variable with optional double braces and
 * optional inner whitespace: {nome} · {{nome}} · { nome } · {{ nome }}.
 */
function varPattern(name: string): RegExp {
  return new RegExp(`\\{\\{?\\s*${name}\\s*\\}?\\}`, "g");
}

function daysSince(lastOrderAt: string | null | undefined): number | null {
  if (!lastOrderAt) return null;
  const t = new Date(lastOrderAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function lastOrderLabel(dias: number | null): string {
  if (dias === null) return "há algum tempo";
  if (dias === 0)    return "hoje";
  if (dias === 1)    return "ontem";
  if (dias < 30)     return `há ${dias} dias`;
  if (dias < 365)    return `há ${Math.floor(dias / 30)} meses`;
  return "há mais de um ano";
}

/**
 * Returns the resolved value map for a customer/context, in case a caller wants
 * to build a preview legend or validate which variables are unknown.
 */
export function resolveCrmVariables(customer: RenderCustomer, ctx: RenderContext): Record<string, string> {
  const firstName = (customer.name ?? "").trim().split(/\s+/)[0] || (customer.name ?? "");
  const dias = daysSince(customer.lastOrderAt);
  // Social variables always resolve to a full, clickable URL — never a bare @handle.
  const instagram = buildInstagramUrl(ctx.instagramUrl ?? null) ?? "";
  const tiktok    = buildTikTokUrl(ctx.tiktokUrl ?? null) ?? "";
  const facebook  = buildFacebookUrl(ctx.facebookUrl ?? null) ?? "";
  const youtube   = buildYouTubeUrl(ctx.youtubeUrl ?? null) ?? "";

  return {
    nome:                  firstName,
    restaurante:           ctx.restaurantName,
    link_cardapio:         ctx.pedidoUrl,
    link_avaliacao_google: ctx.googleReviewUrl ?? ctx.pedidoUrl,
    nivel:                 TIER_LABELS[customer.tier ?? ""] ?? (customer.tier ?? ""),
    dias_sem_pedir:        dias !== null ? String(dias) : "alguns",
    ultimo_pedido:         lastOrderLabel(dias),
    produto_favorito:      "nossos pratos", // V1 simplified
    instagram,
    tiktok,
    facebook,
    youtube,
    cupom:                 couponMessageLabel(ctx.coupon),
    validade:              couponValidadeLabel(ctx.coupon),
    proximo_nivel:         ctx.nextTierLabel?.trim() ?? "",
    falta_proximo_nivel:   typeof ctx.nextTierMissing === "number" && ctx.nextTierMissing > 0
      ? `R$ ${Math.ceil(ctx.nextTierMissing).toLocaleString("pt-BR")}`
      : "",
    // Personal referral link: menu URL + ?ref=<customerId>. Without an id it
    // falls back to the plain menu link (still a valid CTA, just untracked).
    link_indicacao:        customer.id
      ? `${ctx.pedidoUrl}${ctx.pedidoUrl.includes("?") ? "&" : "?"}ref=${encodeURIComponent(customer.id)}`
      : ctx.pedidoUrl,
  };
}

/**
 * Renders a CRM template against a customer + restaurant context.
 *
 * - replaces each known variable exactly (single OR double braces)
 * - resolved values carry no braces, so the output never contains "{Diego}"
 * - unknown {tokens} are left UNCHANGED (operator can spot the typo in preview)
 * - emojis, line breaks and raw https:// links pass through untouched
 *   (a function replacer is used so values like URLs are inserted literally,
 *    never interpreted as regex replacement patterns such as "$&")
 */
export function renderCrmMessage(
  template: string,
  customer: RenderCustomer,
  ctx: RenderContext,
): string {
  if (!template) return "";
  const values = resolveCrmVariables(customer, ctx);
  let out = template;
  for (const key of KNOWN_CRM_VARIABLES) {
    const value = values[key] ?? "";
    out = out.replace(varPattern(key), () => value);
  }
  return out;
}

/**
 * Lists the unknown {tokens} still present after rendering — drives a preview
 * warning so an operator notices a typo'd variable before sending.
 */
export function findUnknownCrmVariables(rendered: string): string[] {
  const found = new Set<string>();
  const re = /\{\{?\s*([\w.]+)\s*\}?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rendered)) !== null) {
    const name = m[1] ?? "";
    if (!KNOWN_CRM_VARIABLES.includes(name as (typeof KNOWN_CRM_VARIABLES)[number])) found.add(name);
  }
  return [...found];
}
