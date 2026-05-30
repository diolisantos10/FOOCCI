/**
 * waiterEvaluator — Deterministic evaluation engine for WaiterBrainV2
 *
 * Runs decide() against a live restaurant catalog and evaluates each
 * WaiterTestCase's checks against the resulting V2Output.
 *
 * No OpenAI calls. No DB writes. Pure function — safe to call in any context.
 */

import { decide, createWaiterMemory, type V2CatalogItem, type V2Input } from "../../WaiterBrainV2";
import type { WaiterTestCase, EvalCheck } from "./waiterScenarios";

// ─── result types ─────────────────────────────────────────────────────────────

export interface CheckResult {
  type:   EvalCheck["type"];
  pass:   boolean;
  detail: string;
}

export interface ScenarioResult {
  id:          string;
  description: string;
  group:       string;
  groupLabel:  string;
  message:     string;
  pass:        boolean;
  checks:      CheckResult[];
  aiResponse: {
    message: string;
    cards:   string[];
    mode:    string;
  };
}

export interface EvalSummary {
  total:   number;
  passed:  number;
  failed:  number;
  score:   number; // 0–100, % passing scenarios
}

export interface EvalReport {
  restaurantId:   string;
  restaurantName: string;
  ranAt:          string;
  durationMs:     number;
  summary:        EvalSummary;
  results:        ScenarioResult[];
}

// ─── catalog helpers ──────────────────────────────────────────────────────────

const GROUP_KEYWORDS = /combo|família|familia|compartilh|grupo|peças|pecas|porção|porcao/i;

function isShareable(item: V2CatalogItem): boolean {
  if (item.servingSize != null && item.servingSize >= 2) return true;
  if (GROUP_KEYWORDS.test(item.name))         return true;
  if (GROUP_KEYWORDS.test(item.categoryName)) return true;
  return false;
}

// Max cards a consultative response may render (mirrors WaiterBrainV2 ceiling).
const MAX_CARDS_PER_RESPONSE = 6;

const DRINK_CAT_RE   = /bebida|suco|drink|refri|água|agua|cerveja|vinho|refrigerante|soda|shake/i;
const DESSERT_CAT_RE = /sobremesa|doce|gelad|sorvete|brownie|pudim|mousse|tembleque/i;

function isCategory(item: V2CatalogItem, cat: "drink" | "dessert"): boolean {
  const re = cat === "drink" ? DRINK_CAT_RE : DESSERT_CAT_RE;
  return re.test(item.categoryName) || re.test(item.name);
}

/** True when the response invites a clear next action (CTA, question, button, or add-language). */
function hasCtaOrNextStep(output: ReturnType<typeof decide>): boolean {
  if (output.options.length > 0) return true;
  const m = output.message;
  if (m.includes("👇") || m.includes("?")) return true;
  return /adicion|carrinho|finaliz|toc(ar|a|e|o)|toque|revisar|pedir|separo|colocar|pra fechar|pode escolher/i.test(m);
}

/** Resolves a cartSeedPattern (regex string) to a real catalog item ID, else falls back to the first item. */
export function resolveCartSeed(pattern: string | undefined, catalog: V2CatalogItem[]): string[] {
  if (!pattern || catalog.length === 0) return [];
  let re: RegExp;
  try { re = new RegExp(pattern, "i"); } catch { return catalog[0] ? [catalog[0].id] : []; }
  const hit = catalog.find((i) => re.test(i.name) || re.test(i.categoryName));
  if (hit) return [hit.id];
  return catalog[0] ? [catalog[0].id] : [];
}

// ─── check evaluator ──────────────────────────────────────────────────────────

function runCheck(
  check: EvalCheck,
  output: ReturnType<typeof decide>,
  catalog: V2CatalogItem[],
): CheckResult {
  const catalogIdSet = new Set(catalog.map((i) => i.id));
  const catalogMap   = new Map(catalog.map((i) => [i.id, i]));

  switch (check.type) {
    case "no_forbidden_denial": {
      const msg = output.message.toLowerCase();
      const matched = /não\s+(encontrei|temos)\s+(pessoas|por[çc])/i.test(msg);
      return {
        type:   check.type,
        pass:   !matched,
        detail: matched
          ? `Response contained forbidden denial phrase: "${output.message.slice(0, 80)}"`
          : "No forbidden denial phrase found",
      };
    }

    case "cards_not_empty": {
      const pass = output.cards.length > 0;
      return {
        type:   check.type,
        pass,
        detail: pass
          ? `Returned ${output.cards.length} card(s)`
          : "No cards returned — customer would see empty suggestion",
      };
    }

    case "has_real_cards":
    case "no_hallucination": {
      const bogus = output.cards.filter((id) => !catalogIdSet.has(id));
      const pass  = bogus.length === 0;
      return {
        type:   check.type,
        pass,
        detail: pass
          ? `All ${output.cards.length} card ID(s) exist in catalog`
          : `Hallucinated IDs: ${bogus.join(", ")}`,
      };
    }

    case "includes_shareable": {
      const sharedCards = output.cards.filter((id) => {
        const item = catalogMap.get(id);
        return item ? isShareable(item) : false;
      });
      const pass = sharedCards.length > 0;
      return {
        type:   check.type,
        pass,
        detail: pass
          ? `Shareable item(s) present: ${sharedCards.slice(0, 3).join(", ")}`
          : "No shareable/combo item in returned cards — group suggestion missed",
      };
    }

    case "includes_category": {
      if (!check.categoryPattern) {
        return { type: check.type, pass: false, detail: "Missing categoryPattern for includes_category check" };
      }
      const re = new RegExp(check.categoryPattern, "i");
      const matched = output.cards.some((id) => {
        const item = catalogMap.get(id);
        return item && re.test(item.categoryName);
      });
      return {
        type:   check.type,
        pass:   matched,
        detail: matched
          ? `At least one card from category matching /${check.categoryPattern}/i`
          : `No card from category matching /${check.categoryPattern}/i`,
      };
    }

    case "has_cta_or_next_step": {
      const pass = hasCtaOrNextStep(output);
      return {
        type:   check.type,
        pass,
        detail: pass
          ? "Response carries a CTA / question / option / add-language next step"
          : `No next step in response: "${output.message.slice(0, 80)}" (options=${output.options.length})`,
      };
    }

    case "no_long_menu_dump": {
      const pass = output.cards.length <= MAX_CARDS_PER_RESPONSE;
      return {
        type:   check.type,
        pass,
        detail: pass
          ? `Card count ${output.cards.length} ≤ ${MAX_CARDS_PER_RESPONSE}`
          : `Menu dump: ${output.cards.length} cards exceeds max ${MAX_CARDS_PER_RESPONSE}`,
      };
    }

    case "respects_refusal": {
      const cat = check.refusedCategory;
      if (!cat) {
        return { type: check.type, pass: false, detail: "Missing refusedCategory for respects_refusal check" };
      }
      const offending = output.cards.filter((id) => {
        const item = catalogMap.get(id);
        return item ? isCategory(item, cat) : false;
      });
      const pass = offending.length === 0;
      return {
        type:   check.type,
        pass,
        detail: pass
          ? `No ${cat} card re-pushed after refusal`
          : `Refusal ignored — re-pushed ${cat} card(s): ${offending.slice(0, 3).join(", ")}`,
      };
    }
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export function evaluateScenario(
  tc:      WaiterTestCase,
  catalog: V2CatalogItem[],
): ScenarioResult {
  const cartItemIds = tc.cartItemIds ?? resolveCartSeed(tc.cartSeedPattern, catalog);

  const input: V2Input = {
    event:       "ON_USER_MESSAGE",
    cartItemIds,
    cartValue:   0,
    catalog,
    message:     tc.message,
    ...(tc.memory ? { memory: { ...createWaiterMemory(), ...tc.memory } } : {}),
  };

  const output    = decide(input);
  const checks    = tc.checks.map((c) => runCheck(c, output, catalog));
  const allPass   = checks.every((c) => c.pass);

  return {
    id:          tc.id,
    description: tc.description,
    group:       tc.group,
    groupLabel:  tc.groupLabel,
    message:     tc.message,
    pass:        allPass,
    checks,
    aiResponse: {
      message: output.message,
      cards:   output.cards,
      mode:    output.mode,
    },
  };
}

export function evaluateAll(
  cases:          WaiterTestCase[],
  catalog:        V2CatalogItem[],
  restaurantId:   string,
  restaurantName: string,
  startedAt:      Date,
): EvalReport {
  const results  = cases.map((tc) => evaluateScenario(tc, catalog));
  const passed   = results.filter((r) => r.pass).length;
  const total    = results.length;
  const score    = total === 0 ? 100 : Math.round((passed / total) * 100);
  const durationMs = Date.now() - startedAt.getTime();

  return {
    restaurantId,
    restaurantName,
    ranAt:    startedAt.toISOString(),
    durationMs,
    summary: { total, passed, failed: total - passed, score },
    results,
  };
}
