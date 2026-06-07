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

  const hits = qWords.filter(qw =>
    cWords.some(cw => cw.startsWith(qw) || qw.startsWith(cw)),
  );
  return hits.length / Math.max(qWords.length, cWords.length);
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
  const clearWinner = !!top && top.score >= HIGH_CONFIDENCE &&
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

    // Ambiguous: top is not confident enough, or two equally strong matches
    const clearWinner = top.score >= HIGH_CONFIDENCE &&
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
