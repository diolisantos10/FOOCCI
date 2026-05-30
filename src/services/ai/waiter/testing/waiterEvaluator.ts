/**
 * waiterEvaluator — Deterministic evaluation engine for WaiterBrainV2
 *
 * Runs decide() against a live restaurant catalog and evaluates each
 * WaiterTestCase's checks against the resulting V2Output.
 *
 * No OpenAI calls. No DB writes. Pure function — safe to call in any context.
 */

import { decide, type V2CatalogItem, type V2Input } from "../../WaiterBrainV2";
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
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export function evaluateScenario(
  tc:      WaiterTestCase,
  catalog: V2CatalogItem[],
): ScenarioResult {
  const input: V2Input = {
    event:       "ON_USER_MESSAGE",
    cartItemIds: tc.cartItemIds ?? [],
    cartValue:   0,
    catalog,
    message:     tc.message,
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
