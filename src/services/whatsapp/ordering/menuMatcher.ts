/**
 * Menu matcher — pure function, no I/O.
 *
 * Scores customer text against real menu items using normalized string
 * similarity. Returns matched items, unresolved items (not found / ambiguous /
 * unavailable), and missing required option questions.
 *
 * W0/W1: rule-based only. No LLM, no external calls.
 */

import { channelPrice } from "@/services/menu/MenuPricingService";
import type {
  WaMenuItem,
  WaParsedItem,
  WaOrderItem,
  WaUnresolvedItem,
  WaMissingQuestion,
} from "./types";

// ── Text normalization ─────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Scoring ────────────────────────────────────────────────────────────────────

const HIGH_CONFIDENCE  = 0.65;
const CLEAR_WINNER_GAP = 0.15;  // top must beat 2nd by this margin to be unambiguous
const MIN_THRESHOLD    = 0.35;  // below this → not a candidate

/** Small bounded Levenshtein (early-exit when distance exceeds max). */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = i;
    let rowMin = cur;
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      cur = Math.min(prev[j]! + 1, cur + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      prev[j] = cur;
      if (cur < rowMin) rowMin = cur;
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length]!;
}

/**
 * Typo-tolerant token equality: prefix match (existing behaviour) OR a small
 * edit distance for words long enough that one wrong/missing letter shouldn't
 * break the order ("yaksoba" → "yakisoba"). Never invents: only nudges scoring.
 */
function tokensSimilar(a: string, b: string): boolean {
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const len = Math.min(a.length, b.length);
  if (len >= 5) {
    const maxDist = len >= 8 ? 2 : 1;
    return levenshtein(a, b, maxDist) <= maxDist;
  }
  return false;
}

function matchScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;

  if (c === q)          return 1.0;
  if (c.startsWith(q) || q.startsWith(c)) return 0.85;
  if (c.includes(q) || q.includes(c))     return 0.75;

  const qWords = q.split(" ").filter(w => w.length >= 2);
  const cWords = c.split(" ").filter(w => w.length >= 2);
  if (qWords.length === 0) return 0;

  // Typo-tolerant word hits ("yaksoba carne" still hits "yakisoba carne ...").
  const hits = qWords.filter(qw => cWords.some(cw => tokensSimilar(cw, qw)));
  const ratio = hits.length / Math.max(qWords.length, cWords.length);

  // Single-token typo of a product word ("yaksoba") behaves like a prefix hit so
  // the customer gets the numbered options instead of "não encontrei".
  if (qWords.length === 1 && hits.length === 1) {
    return Math.max(ratio, 0.8);
  }
  return ratio;
}

/**
 * Containment tie — "coca cola" matches BOTH "Coca-Cola lata" and "Coca-Cola 2L":
 * when the query is contained in 2+ visible product names, NEVER auto-pick one
 * (the 2L bug). The customer chooses from the numbered options.
 */
function containmentTieCount(query: string, names: string[]): number {
  const q = normalize(query);
  if (q.length < 4) return 0;
  return names.filter(n => normalize(n).includes(q)).length;
}

// ── Single best match (used by smart parsing + menu questions) ──────────────────

export interface BestMenuMatch {
  top:         WaMenuItem | null;
  score:       number;
  clearWinner: boolean;
  candidates:  WaMenuItem[]; // top 3 above MIN_THRESHOLD, best first
}

/**
 * Scores `text` against the visible menu and returns the single best match plus
 * whether it is an unambiguous clear winner. Pure — no item construction.
 */
export function bestMenuMatch(
  text:    string,
  menu:    WaMenuItem[],
  channel: "DELIVERY" | "PICKUP" | "DINE_IN" = "DELIVERY",
): BestMenuMatch {
  const visible = menu.filter(m =>
    m.isActive && (channel === "DINE_IN" ? true : m.showInDelivery),
  );
  const scored = visible
    .map(m => ({ m, score: matchScore(text, m.name) }))
    .filter(x => x.score >= MIN_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const top    = scored[0];
  const second = scored[1];
  // Generic term contained in 2+ product names (coca cola → lata E 2L): always ask.
  const tie = containmentTieCount(text, scored.map(x => x.m.name)) >= 2;
  const clearWinner = !!top && !tie && top.score >= HIGH_CONFIDENCE &&
    (!second || (top.score - second.score) >= CLEAR_WINNER_GAP);

  return {
    top:         top?.m ?? null,
    score:       top?.score ?? 0,
    clearWinner,
    candidates:  scored.slice(0, 3).map(x => x.m),
  };
}

// ── Match result ───────────────────────────────────────────────────────────────

export interface MatchResult {
  matched:    WaOrderItem[];
  unresolved: WaUnresolvedItem[];
  missing:    WaMissingQuestion[];
}

export function matchItems(
  parsed:  WaParsedItem[],
  menu:    WaMenuItem[],
  channel: "DELIVERY" | "PICKUP" | "DINE_IN" = "DELIVERY",
): MatchResult {
  const matched:    WaOrderItem[]      = [];
  const unresolved: WaUnresolvedItem[] = [];
  const missing:    WaMissingQuestion[] = [];

  const pricingChannel = channel === "DINE_IN" ? "DINE_IN" as const : "DELIVERY" as const;

  // Only show items visible for this channel
  const visible = menu.filter(m =>
    m.isActive && (channel === "DINE_IN" ? true : m.showInDelivery),
  );

  for (const item of parsed) {
    if (!item.name.trim()) continue;

    const scored = visible
      .map(m => ({ m, score: matchScore(item.name, m.name) }))
      .filter(x => x.score >= MIN_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unresolved.push({ rawText: item.rawText, quantity: item.quantity, reason: "NOT_FOUND", candidates: [] });
      continue;
    }

    // scored.length > 0 is guaranteed by the check above, but TS doesn't infer it
    const top    = scored[0]!;
    const second = scored[1];

    // Ambiguous: top is not confident enough, two equally strong matches, or the
    // term is contained in 2+ product names (coca cola → lata E 2L: never auto-pick).
    const tie = containmentTieCount(item.name, scored.map(x => x.m.name)) >= 2;
    const clearWinner = !tie && top.score >= HIGH_CONFIDENCE &&
      (!second || (top.score - second.score) >= CLEAR_WINNER_GAP);

    if (!clearWinner) {
      unresolved.push({
        rawText:    item.rawText,
        quantity:   item.quantity,
        reason:     "AMBIGUOUS",
        candidates: scored.slice(0, 3).map(x => x.m.name),
      });
      continue;
    }

    const menuItem = top.m;

    if (!menuItem.isAvailable) {
      unresolved.push({ rawText: item.rawText, quantity: item.quantity, reason: "UNAVAILABLE", candidates: [] });
      continue;
    }

    // Resolve delivery-channel price (never invent prices)
    const unitPrice = channelPrice(
      { price: menuItem.price, priceDelivery: menuItem.priceDelivery },
      pricingChannel,
    );
    const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;

    matched.push({
      rawText:      item.rawText,
      quantity:     item.quantity,
      menuItemId:   menuItem.id,
      menuItemName: menuItem.name,
      options:      [],
      extras:       [],
      unitPrice,
      lineTotal,
    });

    // Required option groups with no answer yet
    for (const group of menuItem.optionGroups) {
      if (group.required && group.minSelect > 0) {
        missing.push({
          itemName:  menuItem.name,
          groupName: group.name,
          required:  true,
          options:   group.options.filter(o => o.isAvailable).map(o => o.name),
        });
      }
    }

    // Item with variants but none selected
    if (menuItem.hasVariants && menuItem.variants.length > 0) {
      const availableVariants = menuItem.variants.filter(v => v.isAvailable);
      if (availableVariants.length > 0) {
        missing.push({
          itemName:  menuItem.name,
          groupName: "Tamanho/Variante",
          required:  true,
          options:   availableVariants.map(v => v.name),
        });
      }
    }
  }

  return { matched, unresolved, missing };
}
