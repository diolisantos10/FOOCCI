/**
 * crmEvaluator — Deterministic evaluation engine for the CRM Agent logic.
 *
 * Runs each CrmScenario against the matching PURE CRM function and grades the
 * result with severity-weighted checks. No DB. No LLM. No network. No sends.
 * No campaign records. Safe to call in any context.
 *
 * Scoring (per scenario):
 *   - any failed CRITICAL check → FAIL  (score 40)
 *   - only failed WARNING checks → WARN (score 70)
 *   - everything passes          → PASS (score 100)
 */

import { evaluateContactSafety } from "../ContactSafetyService";
import { resolveCustomerClassification } from "../CustomerSegmentService";
import { computeSnapshot } from "../CustomerIntelligenceSnapshotService";
import { computeActions } from "../CrmActionCenterService";
import {
  composePreview,
  buildDeterministicVariants,
  impliesDiscount,
  detectSpamLanguage,
  DEFAULT_TONE,
} from "../MessageVariationService";
import { classifyAttributionQuality } from "../CampaignAttributionService";
import { evaluateReviewEligibility } from "../ReviewRequestService";

import { CRM_SCENARIOS, type CrmScenario, type CrmScenarioGroupId, type Severity } from "./crmScenarios";

// ─── result types ─────────────────────────────────────────────────────────────

export type CheckSeverity = "critical" | "warning";
export type Verdict = "PASS" | "WARN" | "FAIL";

export interface CrmCheckResult {
  label:    string;
  severity: CheckSeverity;
  pass:     boolean;
  detail:   string;
}

export interface CrmScenarioResult {
  id:              string;
  group:           CrmScenarioGroupId;
  groupLabel:      string;
  name:            string;
  description:     string;
  severity:        Severity;
  verdict:         Verdict;
  score:           number;
  checks:          CrmCheckResult[];
  failedChecks:    string[];   // labels of failed critical checks
  warnings:        string[];   // labels of failed warning checks
  expectedSummary: string;
  actualSummary:   string;
  durationMs:      number;
}

export interface CrmEvalSummary {
  total:     number;
  passed:    number;
  warned:    number;
  failed:    number;
  avgScore:  number;
  durationMs: number;
}

export interface CrmEvalReport {
  restaurantId:   string;
  restaurantName: string;
  slug:           string;
  mode:           string;
  useLiveLLM:     boolean;
  ranAt:          string;
  durationMs:     number;
  summary:        CrmEvalSummary;
  results:        CrmScenarioResult[];
}

// ─── check helpers ─────────────────────────────────────────────────────────────

function check(label: string, severity: CheckSeverity, pass: boolean, detail: string): CrmCheckResult {
  return { label, severity, pass, detail };
}

function eq<T>(actual: T, expected: T): boolean {
  return actual === expected;
}

// ─── per-kind evaluation ────────────────────────────────────────────────────────

function runChecks(scenario: CrmScenario): { checks: CrmCheckResult[]; actual: string } {
  switch (scenario.group) {
    case "contact_safety": {
      const d = evaluateContactSafety(scenario.input);
      const checks: CrmCheckResult[] = [
        check("sendable matches expected", "critical", eq(d.sendable, scenario.expect.sendable),
          `sendable=${d.sendable} (esperado ${scenario.expect.sendable})`),
      ];
      if (scenario.expect.reason !== undefined) {
        checks.push(check("block reason matches", "critical", eq(d.reason, scenario.expect.reason ?? null),
          `reason=${d.reason ?? "null"} (esperado ${scenario.expect.reason ?? "null"})`));
      }
      // Safety invariant: a blocked decision must always carry a reason.
      checks.push(check("blocked decision carries a reason", "critical",
        d.sendable || d.reason !== null,
        d.sendable ? "sendable — n/a" : `reason=${d.reason ?? "MISSING"}`));
      return { checks, actual: `sendable=${d.sendable}, reason=${d.reason ?? "null"}` };
    }

    case "segmentation": {
      const c = resolveCustomerClassification(scenario.input);
      const checks: CrmCheckResult[] = [
        check("segment matches expected", "critical", eq(c.segment, scenario.expect.segment),
          `segment=${c.segment} (esperado ${scenario.expect.segment})`),
      ];
      if (scenario.expect.tier !== undefined) {
        checks.push(check("tier matches expected", "warning", eq(c.tier, scenario.expect.tier),
          `tier=${c.tier} (esperado ${scenario.expect.tier})`));
      }
      return { checks, actual: `segment=${c.segment}, tier=${c.tier}, source=${c.source}` };
    }

    case "intelligence": {
      const snap = computeSnapshot(scenario.input);
      const nba = snap.nextBestAction;
      const checks: CrmCheckResult[] = [];
      if (scenario.expect.actionType !== undefined) {
        checks.push(check("nextBestAction type matches", "critical", eq(nba.actionType, scenario.expect.actionType),
          `actionType=${nba.actionType} (esperado ${scenario.expect.actionType})`));
      }
      if (scenario.expect.safeToContact !== undefined) {
        checks.push(check("safeToContact matches", "critical", eq(nba.safeToContact, scenario.expect.safeToContact),
          `safeToContact=${nba.safeToContact} (esperado ${scenario.expect.safeToContact})`));
      }
      if (scenario.expect.suggestedOfferType !== undefined) {
        checks.push(check("suggestedOfferType matches", "warning", eq(nba.suggestedOfferType, scenario.expect.suggestedOfferType),
          `offer=${nba.suggestedOfferType} (esperado ${scenario.expect.suggestedOfferType})`));
      }
      // Safety invariant: opted-out / non-contactable must never be safeToContact.
      if (snap.contactability === "OPTED_OUT" || snap.contactability === "NO_PHONE" || snap.contactability === "NOT_CONTACTABLE") {
        checks.push(check("no unsafe contact recommendation", "critical", nba.safeToContact === false,
          `contactability=${snap.contactability}, safeToContact=${nba.safeToContact}`));
      }
      return { checks, actual: `segment=${snap.segment}, tier=${snap.tier}, action=${nba.actionType}, safe=${nba.safeToContact}` };
    }

    case "action_center": {
      const actions = computeActions(scenario.input);
      const present = new Set(actions.map((a) => a.type));
      const checks: CrmCheckResult[] = [];
      for (const t of scenario.expect.mustInclude ?? []) {
        checks.push(check(`includes ${t}`, "critical", present.has(t),
          present.has(t) ? `ação ${t} presente` : `ação ${t} AUSENTE`));
      }
      for (const t of scenario.expect.mustExclude ?? []) {
        checks.push(check(`excludes ${t}`, "critical", !present.has(t),
          present.has(t) ? `ação ${t} NÃO deveria existir` : `ação ${t} corretamente ausente`));
      }
      if (scenario.expect.readySafety) {
        const a = actions.find((x) => x.type === scenario.expect.readySafety!.type);
        checks.push(check(`${scenario.expect.readySafety.type} safetyStatus=${scenario.expect.readySafety.status}`, "warning",
          !!a && a.safetyStatus === scenario.expect.readySafety.status,
          a ? `safetyStatus=${a.safetyStatus}` : "ação não encontrada"));
      }
      // Safety invariant: a missing-Evolution base must always raise the operator-facing
      // SAFETY_ISSUE_ALERT (the per-send Evolution gate itself lives in ContactSafetyService).
      if (!scenario.input.hasEvolutionConfig) {
        checks.push(check("missing Evolution raises SAFETY_ISSUE_ALERT", "critical", present.has("SAFETY_ISSUE_ALERT"),
          present.has("SAFETY_ISSUE_ALERT") ? "alerta de segurança presente" : "SAFETY_ISSUE_ALERT ausente sem Evolution"));
      }
      return { checks, actual: `actions=[${[...present].join(", ") || "nenhuma"}]` };
    }

    case "message_variation": {
      const { snapshot, intent, couponCode, safety, previousMessages } = scenario.input;
      const candidates = buildDeterministicVariants({
        intent, snapshot, couponCode, tone: DEFAULT_TONE, restaurantName: "Restaurante Teste", maxVariants: 2,
      });
      const r = composePreview({
        snapshot, intent, couponCode, safety, candidates,
        generatedBy: "deterministic", previousMessages, maxVariants: 3,
      });
      const checks: CrmCheckResult[] = [
        // Draft-only invariant — ALWAYS true.
        check("requiresApproval is true", "critical", r.requiresApproval === true, `requiresApproval=${r.requiresApproval}`),
      ];
      if (scenario.expect.blocked) {
        checks.push(check("blocked draft (no message)", "critical", r.draftMessage === null && r.blockedReasons.length > 0,
          `draft=${r.draftMessage === null ? "null" : "PRESENT"}, blockedReasons=${r.blockedReasons.length}`));
      } else {
        checks.push(check("draft generated", "critical", r.draftMessage !== null,
          r.draftMessage ? "rascunho gerado" : "rascunho ausente (bloqueado inesperadamente)"));
        // No spam language in any produced text.
        const allText = [r.draftMessage ?? "", ...r.alternatives].join(" ");
        const spam = detectSpamLanguage(allText);
        checks.push(check("no spam language", "critical", spam.length === 0,
          spam.length ? `linguagem inadequada: ${spam.join("; ")}` : "sem linguagem de spam"));
      }
      if (scenario.expect.noDiscountWithoutCoupon && !couponCode && r.draftMessage) {
        checks.push(check("no invented discount", "critical", !impliesDiscount(r.draftMessage),
          impliesDiscount(r.draftMessage) ? "desconto prometido sem cupom" : "sem desconto inventado"));
      }
      if (scenario.expect.noInventedFavorite) {
        const inventedFav = r.usedFacts.some((f) => /favorit/i.test(f));
        checks.push(check("no invented favorite", "critical", !inventedFav,
          inventedFav ? "rascunho inventou um favorito inexistente" : "sem favorito inventado"));
      }
      return { checks, actual: `generatedBy=${r.generatedBy}, draft=${r.draftMessage ? "ok" : "null"}, blocked=${r.blockedReasons.length}, facts=${r.usedFacts.length}` };
    }

    case "attribution": {
      const q = classifyAttributionQuality(
        scenario.input.hasCouponLink, scenario.input.couponOrderCount, scenario.input.assistedConversions,
      );
      const checks: CrmCheckResult[] = [
        check("attributionQuality matches", "critical", eq(q, scenario.expect.quality),
          `quality=${q} (esperado ${scenario.expect.quality})`),
      ];
      // Safety invariant: no coupon link cannot yield a coupon-grade attribution.
      if (!scenario.input.hasCouponLink) {
        checks.push(check("no coupon attribution without a coupon link", "critical",
          q !== "COUPON_PROVEN" && q !== "CAMPAIGN_COUPON",
          `quality=${q}`));
      }
      return { checks, actual: `quality=${q}` };
    }

    case "review_request": {
      const d = evaluateReviewEligibility(scenario.input);
      const checks: CrmCheckResult[] = [
        check("eligibility matches expected", "critical", eq(d.eligible, scenario.expect.eligible),
          `eligible=${d.eligible} (esperado ${scenario.expect.eligible})`),
        check("requiresApproval is true", "critical", d.requiresApproval === true, `requiresApproval=${d.requiresApproval}`),
      ];
      for (const b of scenario.expect.blocks ?? []) {
        checks.push(check(`block ${b} present`, "critical", d.blocks.includes(b),
          d.blocks.includes(b) ? `bloqueio ${b} presente` : `bloqueio ${b} AUSENTE (blocks=[${d.blocks.join(", ")}])`));
      }
      if (scenario.expect.preferredPlatform !== undefined) {
        checks.push(check("preferred platform matches", "warning", eq(d.preferredPlatform, scenario.expect.preferredPlatform),
          `platform=${d.preferredPlatform ?? "null"} (esperado ${scenario.expect.preferredPlatform ?? "null"})`));
      }
      // Safety invariant: a non-eligible decision must not carry a draft message.
      checks.push(check("no draft when not eligible", "critical", d.eligible || d.draftMessage === null,
        d.eligible ? "elegível — n/a" : `draft=${d.draftMessage === null ? "null" : "PRESENT"}`));
      return { checks, actual: `eligible=${d.eligible}, platform=${d.preferredPlatform ?? "null"}, blocks=[${d.blocks.join(", ")}]` };
    }
  }
}

function expectedSummaryOf(scenario: CrmScenario): string {
  switch (scenario.group) {
    case "contact_safety":    return `sendable=${scenario.expect.sendable}${scenario.expect.reason !== undefined ? `, reason=${scenario.expect.reason ?? "null"}` : ""}`;
    case "segmentation":      return `segment=${scenario.expect.segment}${scenario.expect.tier ? `, tier=${scenario.expect.tier}` : ""}`;
    case "intelligence":      return [scenario.expect.actionType && `action=${scenario.expect.actionType}`, scenario.expect.safeToContact !== undefined && `safe=${scenario.expect.safeToContact}`, scenario.expect.suggestedOfferType && `offer=${scenario.expect.suggestedOfferType}`].filter(Boolean).join(", ");
    case "action_center":     return [scenario.expect.mustInclude?.length && `inclui [${scenario.expect.mustInclude.join(", ")}]`, scenario.expect.mustExclude?.length && `exclui [${scenario.expect.mustExclude.join(", ")}]`].filter(Boolean).join("; ");
    case "message_variation": return `blocked=${scenario.expect.blocked}${scenario.expect.noDiscountWithoutCoupon ? ", sem desconto sem cupom" : ""}${scenario.expect.noInventedFavorite ? ", sem favorito inventado" : ""}`;
    case "attribution":       return `quality=${scenario.expect.quality}`;
    case "review_request":    return `eligible=${scenario.expect.eligible}${scenario.expect.blocks?.length ? `, blocks=[${scenario.expect.blocks.join(", ")}]` : ""}${scenario.expect.preferredPlatform !== undefined ? `, platform=${scenario.expect.preferredPlatform ?? "null"}` : ""}`;
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export function evaluateScenario(scenario: CrmScenario): CrmScenarioResult {
  const startedAt = Date.now();
  let checks: CrmCheckResult[];
  let actual: string;
  try {
    const out = runChecks(scenario);
    checks = out.checks;
    actual = out.actual;
  } catch (err) {
    checks = [check("scenario executed without throwing", "critical", false, `erro: ${(err as Error).message}`)];
    actual = `EXCEPTION: ${(err as Error).message}`;
  }

  const failedChecks = checks.filter((c) => !c.pass && c.severity === "critical").map((c) => c.label);
  const warnings     = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.label);

  const verdict: Verdict = failedChecks.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
  const score = verdict === "FAIL" ? 40 : verdict === "WARN" ? 70 : 100;

  return {
    id:              scenario.id,
    group:           scenario.group,
    groupLabel:      scenario.groupLabel,
    name:            scenario.name,
    description:     scenario.description,
    severity:        scenario.severity,
    verdict,
    score,
    checks,
    failedChecks,
    warnings,
    expectedSummary: expectedSummaryOf(scenario),
    actualSummary:   actual,
    durationMs:      Date.now() - startedAt,
  };
}

export interface EvalMeta {
  restaurantId:   string;
  restaurantName: string;
  slug:           string;
  mode:           string;
  useLiveLLM:     boolean;
}

export function evaluateAll(scenarios: CrmScenario[], meta: EvalMeta, startedAt: Date = new Date()): CrmEvalReport {
  const results  = scenarios.map(evaluateScenario);
  const total    = results.length;
  const passed   = results.filter((r) => r.verdict === "PASS").length;
  const warned   = results.filter((r) => r.verdict === "WARN").length;
  const failed   = results.filter((r) => r.verdict === "FAIL").length;
  const avgScore = total === 0 ? 100 : Math.round(results.reduce((s, r) => s + r.score, 0) / total);
  const durationMs = Date.now() - startedAt.getTime();

  return {
    restaurantId:   meta.restaurantId,
    restaurantName: meta.restaurantName,
    slug:           meta.slug,
    mode:           meta.mode,
    useLiveLLM:     meta.useLiveLLM,
    ranAt:          startedAt.toISOString(),
    durationMs,
    summary: { total, passed, warned, failed, avgScore, durationMs },
    results,
  };
}

/** Convenience: evaluate the full library (used by tests). */
export function evaluateLibrary(meta: EvalMeta): CrmEvalReport {
  return evaluateAll(CRM_SCENARIOS, meta);
}
