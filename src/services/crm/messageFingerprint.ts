/**
 * Message fingerprint + campaign identity helpers (PURE — no DB).
 *
 * The fingerprint lets the CRM recognise the SAME or near-same message even under
 * a new campaignId. It is deterministic and normalized so that
 *   "Olá João, hoje temos promoção de almoço!"
 *   "olá {{nome}}, hoje temos promoçao de almoço"
 * collapse to the same fingerprint (case/accents/spacing/template-vars/punct
 * removed). Fuzzy similarity is intentionally left for a future iteration.
 */

const TEMPLATE_VAR_RE = /\{\{?\s*[\w.]+\s*\}?\}/g; // {nome} or {{nome}}
const ACCENTS_RE = /[̀-ͯ]/g;

/** Canonical normalization shared by fingerprint + family-key slug. */
export function normalizeMessageText(message: string): string {
  return (message ?? "")
    .normalize("NFD").replace(ACCENTS_RE, "")     // strip accents
    .toLowerCase()
    .replace(TEMPLATE_VAR_RE, " ")                 // drop personalization vars
    .replace(/https?:\/\/\S+/g, " ")               // drop urls (vary per restaurant)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")             // drop punctuation/emoji
    .replace(/\s+/g, " ")
    .trim();
}

/** Small, stable, dependency-free hash (FNV-1a → base36). */
function hash36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Deterministic fingerprint of a CRM message. Empty/whitespace → "". */
export function generateMessageFingerprint(message: string): string {
  const norm = normalizeMessageText(message);
  if (!norm) return "";
  // Prefix with the word count so very different lengths rarely collide.
  const words = norm.split(" ").length;
  return `mf_${words}_${hash36(norm)}`;
}

/** Slugifies any label into a stable key segment. */
function slug(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(ACCENTS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Suggests a stable campaignFamilyKey (concept key) from name (+ optional
 * objective/period). e.g. "Páscoa 2026" → "pascoa-2026".
 */
export function suggestCampaignFamilyKey(input: { name: string; objective?: string | null; period?: string | null }): string {
  const parts = [slug(input.name)];
  if (input.period) parts.push(slug(input.period));
  const joined = parts.filter(Boolean).join("-").replace(/-+/g, "-");
  return joined || `campanha-${slug(input.objective ?? "geral")}`;
}
