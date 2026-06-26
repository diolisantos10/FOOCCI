"use client";

import { useState, useRef, useCallback } from "react";
import { CUSTOMER_PROFILES } from "./profiles";
import {
  validateStep, buildReport, toCsv, toSummaryText,
  IMPROVEMENT_SUGGESTIONS, FAILURE_TO_FIX_AREA,
  computeProbableRootCause, computeRecommendedFix, computeSeverity,
  EVALUATOR_VERSION, runEvaluatorSelfTests,
} from "./engine";

// Run self-tests once at module load to surface evaluator regressions in dev.
if (typeof window !== "undefined") {
  const st = runEvaluatorSelfTests();
  if (!st.pass) {
    console.error("[AutoPilot self-test FAIL]", st.failures);
  } else {
    console.info(`[AutoPilot self-test PASS] evaluator=${EVALUATOR_VERSION}`);
  }
}
import type {
  CustomerProfile,
  CatalogItem,
  CartItem,
  ScenarioResult,
  ScenarioStep,
  AutoPilotReport,
  AutoPilotStatus,
  FailureType,
  Severity,
} from "./types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  slug:           string;
  catalog:        CatalogItem[];
  restaurantName: string;
}

// ── Speed options ─────────────────────────────────────────────────────────────

const SPEED_OPTIONS: { label: string; ms: number }[] = [
  { label: "Rápido",  ms: 500  },
  { label: "Normal",  ms: 900  },
  { label: "Devagar", ms: 1800 },
];

// ── Intent label helpers ──────────────────────────────────────────────────────

function expectedIntentFromBehavior(behavior: CustomerProfile["behavior"]): string {
  const map: Record<CustomerProfile["behavior"], string> = {
    passive:    "Comportamento behavioral (silent browsing)",
    guided:     "Receber sugestões guiadas com cards",
    direct:     "Receber recomendação direta com cards",
    indecisive: "Receber qualificação via options[] e depois cards",
    budget:     "Receber opção econômica via cards",
    premium:    "Receber opção premium via cards",
  };
  return map[behavior];
}

const MODE_LABEL: Record<string, string> = {
  BROWSE:           "Navegação geral (BROWSE)",
  SUGGESTION:       "Sugestão de produto (SUGGESTION)",
  INTERVENTION:     "Intervenção de vendas (INTERVENTION)",
  CHECKOUT_SUPPORT: "Suporte a checkout (CHECKOUT_SUPPORT)",
};

// ── Catalog resolution for silent profiles ────────────────────────────────────

function findCatalogItemByHints(
  catalog:       CatalogItem[],
  hints:         string[],
  fallbackIndex: number = 0,
): CatalogItem | null {
  for (const hint of hints) {
    const lh    = hint.toLowerCase();
    const found = catalog.find((item) => item.name.toLowerCase().includes(lh));
    if (found) return found;
  }
  return catalog[fallbackIndex] ?? catalog[0] ?? null;
}

function resolveSilentCartItems(
  catalog:    CatalogItem[],
  hintGroups: string[][],
): CatalogItem[] {
  if (!hintGroups || hintGroups.length === 0) {
    return catalog[0] ? [catalog[0]] : [];
  }
  const items: CatalogItem[] = [];
  for (let i = 0; i < hintGroups.length; i++) {
    const hints = hintGroups[i] ?? [];
    const item  = findCatalogItemByHints(catalog, hints, i);
    if (item) items.push(item);
  }
  return items.length > 0 ? items : (catalog[0] ? [catalog[0]] : []);
}

// ── API helper ────────────────────────────────────────────────────────────────

async function callWaiterApi(
  slug:                 string,
  event:                string,
  message:              string,
  history:              { role: string; content: string }[],
  cart:                 CartItem[],
  lastAddedId?:         string,
  suggestedProductIds?: string[],
) {
  const body: Record<string, unknown> = {
    event, message, history,
    cart:  cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
    stage: "BROWSE",
  };
  if (lastAddedId)                              body.lastAddedId         = lastAddedId;
  if (suggestedProductIds?.length)              body.suggestedProductIds = suggestedProductIds;

  const res = await fetch(`/api/pedido/${encodeURIComponent(slug)}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const d    = json.data ?? json;
  return {
    reply:   typeof d.reply   === "string" ? d.reply                     : "",
    cards:   Array.isArray(d.cards)        ? (d.cards   as string[])     : [],
    options: Array.isArray(d.options)      ? (d.options as { label: string; value: string }[]) : [],
    mode:    typeof d.mode    === "string" ? d.mode                      : "BROWSE",
  };
}

// ── Scenario runner ───────────────────────────────────────────────────────────

async function runScenario(
  profile:   CustomerProfile,
  slug:      string,
  catalog:   CatalogItem[],
  stepDelay: number,
  stopRef:   React.MutableRefObject<boolean>,
  onStep:    (step: ScenarioStep) => void,
): Promise<ScenarioResult> {
  const t0         = Date.now();
  const catalogIds = new Set(catalog.map((c) => c.id));
  const firstItem  = catalog[0] ?? null;

  const steps:    ScenarioStep[]                       = [];
  const history:  { role: string; content: string }[] = [];
  const cart:     CartItem[]                           = [];
  const allCards:    string[]      = [];
  const allMessages: string[]      = [];
  const allFailures: FailureType[] = [];

  let checkoutReached    = false;
  let orderConfirmed     = false;
  let detectedMode       = "BROWSE";
  let lastReply          = "";
  let lastOptions:       { label: string; value: string }[] = [];
  let permissionDeclined   = false;
  let promptsGiven         = 0;
  const suggestedIdsAccum: string[] = [];
  let lastResponseCards: string[]   = [];

  const seenCardIds = new Set<string>();

  // ── Build step sequence ────────────────────────────────────────────────────

  type StepDef = {
    event:        string;
    message:      string;
    requireCards: boolean;
    lastAddedId?: string;
  };

  const seq: StepDef[] = [{ event: "ON_ENTRY", message: "", requireCards: false }];

  if (profile.isSilent) {
    // Cart additions via silent item resolution
    const silentItems = resolveSilentCartItems(catalog, profile.silentCartItems ?? []);
    for (const item of silentItems) {
      seq.push({ event: "ON_ITEM_ADDED", message: "", requireCards: false, lastAddedId: item.id });
    }

    // Optional idle prompt
    if (profile.requiresIdle) {
      seq.push({ event: "ON_IDLE", message: "", requireCards: false });
    }

    // Permission response
    if (profile.permissionResponse === "accept") {
      seq.push({
        event:        "ON_PERMISSION_ACCEPTED",
        message:      "Quero sugestão",
        requireCards: catalogIds.size > 0,
      });
    } else if (profile.permissionResponse === "decline") {
      seq.push({
        event:        "ON_PERMISSION_DECLINED",
        message:      "Prefiro continuar",
        requireCards: false,
      });
    }

    if (profile.requiresCheckout) {
      seq.push({ event: "ON_CHECKOUT_STARTED", message: "", requireCards: false });
      seq.push({ event: "AFTER_CHECKOUT",       message: "", requireCards: false });
    }

  } else {
    // Typed profile sequence
    if (profile.behavior === "indecisive" || profile.behavior === "passive") {
      seq.push({ event: "ON_IDLE", message: "", requireCards: false });
    }

    profile.intentMessages.forEach((msg, i) => {
      const isLast = i === profile.intentMessages.length - 1;
      seq.push({
        event:        "ON_USER_MESSAGE",
        message:      msg,
        requireCards: isLast && catalogIds.size > 0 &&
          (profile.requiresCart || profile.requiresSearchCards === true),
      });
    });

    if (profile.requiresCart) {
      // Budget profiles resolve lastAddedId at runtime from Waiter's suggestion cards
      const resolveFromCards = profile.budget !== undefined;
      seq.push({
        event:        "ON_ITEM_ADDED",
        message:      "",
        requireCards: false,
        lastAddedId:  resolveFromCards ? undefined : (firstItem?.id ?? undefined),
      });
    }

    if (profile.requiresCheckout) {
      seq.push({ event: "ON_CHECKOUT_STARTED", message: "", requireCards: false });
      seq.push({ event: "AFTER_CHECKOUT",       message: "", requireCards: false });
    }
  }

  // ── Execute steps ──────────────────────────────────────────────────────────

  for (let i = 0; i < seq.length; i++) {
    if (stopRef.current) break;

    const def = seq[i];
    if (!def) break;
    const { event, message, requireCards } = def;
    let lastAddedId = def.lastAddedId;

    // For budget profiles: resolve lastAddedId from the Waiter's previous suggestion cards
    if (event === "ON_ITEM_ADDED" && !lastAddedId) {
      if (lastResponseCards.length > 0) {
        if (profile.budget !== undefined) {
          lastAddedId = lastResponseCards.find((id) => {
            const item = catalog.find((c) => c.id === id);
            return item !== undefined && item.price <= profile.budget!;
          }) ?? lastResponseCards[0];
        } else {
          lastAddedId = lastResponseCards[0];
        }
      }
      if (!lastAddedId && firstItem && profile.budget === undefined) lastAddedId = firstItem.id;
    }
    const t1 = Date.now();

    let response: { reply: string; cards: string[]; options: { label: string; value: string }[]; mode: string } | null = null;
    let stepFailures:   FailureType[]                           = [];
    let stepAssertions: { label: string; pass: boolean; detail?: string }[] = [];

    try {
      response = await callWaiterApi(slug, event, message, history, cart, lastAddedId, suggestedIdsAccum.length > 0 ? [...suggestedIdsAccum] : undefined);

      if (message)        history.push({ role: "user",      content: message        });
      if (response.reply) history.push({ role: "assistant", content: response.reply });

      // Cart update — use lastAddedId to find the actual catalog item
      if (event === "ON_ITEM_ADDED" && lastAddedId) {
        const item = catalog.find((c) => c.id === lastAddedId) ?? firstItem;
        if (item) {
          const existing = cart.find((c) => c.id === item.id);
          if (existing) existing.qty += 1;
          else          cart.push({ ...item, qty: 1 });
        }
      }

      if (response.reply)              lastReply   = response.reply;
      if (response.options.length > 0) lastOptions = response.options;
      if (event === "ON_USER_MESSAGE" || event === "ON_PERMISSION_ACCEPTED") {
        detectedMode = response.mode;
      }

      allMessages.push(response.reply);
      allCards.push(...response.cards);
      if (event === "ON_CHECKOUT_STARTED") checkoutReached = true;
      if (event === "AFTER_CHECKOUT")       orderConfirmed  = true;

      // Track prompts offered (options on non-item events)
      if (response.options.length > 0 &&
          event !== "ON_ITEM_ADDED" && event !== "ON_ENTRY" && event !== "ON_PERMISSION_DECLINED") {
        promptsGiven++;
      }

      const v = validateStep(event, message, response, catalogIds, requireCards, seenCardIds);
      stepAssertions = v.assertions;
      stepFailures   = v.failureTypes;

      // Update seen cards for duplicate tracking and accumulate for next API call
      for (const id of response.cards) {
        seenCardIds.add(id);
        if (!suggestedIdsAccum.includes(id)) suggestedIdsAccum.push(id);
      }
      if (response.cards.length > 0) lastResponseCards = [...response.cards];

      // Budget check for cart additions
      if (event === "ON_ITEM_ADDED" && lastAddedId && profile.budget !== undefined) {
        const item = catalog.find((c) => c.id === lastAddedId) ?? firstItem;
        if (item && item.price > profile.budget) {
          stepFailures    = [...stepFailures, "bad_product_fit"];
          stepAssertions  = [
            ...stepAssertions,
            {
              label: `Budget: ${item.name} (R$${item.price.toFixed(2)}) excede orçamento R$${profile.budget}`,
              pass:  false,
            },
          ];
        }
      }

      // ── Silent profile post-assertions ─────────────────────────────────────

      if (profile.isSilent) {

        // ON_ITEM_ADDED: Rule 7 already covered; additionally tag as invasive if it failed
        if (event === "ON_ITEM_ADDED") {
          const invaded = response.cards.length > 0 || response.options.length > 0;
          if (invaded && !stepFailures.includes("ui_invasion_after_click")) {
            stepFailures   = [...stepFailures, "invasive_after_item_add"];
            stepAssertions = [
              ...stepAssertions,
              {
                label:  "Rule 7 (silent): ON_ITEM_ADDED → cards=[], options=[]",
                pass:   false,
                detail: `cards=${response.cards.length}, options=${response.options.length}`,
              },
            ];
          }
        }

        // After permission declined: next steps must not offer cards or options
        if (permissionDeclined && event !== "ON_PERMISSION_DECLINED") {
          const violated = response.cards.length > 0 || response.options.length > 0;
          if (violated) {
            stepFailures   = [...stepFailures, "ignored_decline"];
            stepAssertions = [
              ...stepAssertions,
              {
                label:  "Após recusa: UI silenciosa — sem cards ou options",
                pass:   false,
                detail: `cards=${response.cards.length}, options=${response.options.length}`,
              },
            ];
          } else {
            stepAssertions = [
              ...stepAssertions,
              { label: "Após recusa: UI silenciosa respeitada", pass: true },
            ];
          }
        }

        // ON_PERMISSION_DECLINED → mark state
        if (event === "ON_PERMISSION_DECLINED") {
          permissionDeclined = true;
        }

        // ON_PERMISSION_ACCEPTED → expect cards
        if (event === "ON_PERMISSION_ACCEPTED") {
          const hasCards = response.cards.length > 0;
          if (!hasCards) {
            stepFailures   = [...stepFailures, "missed_final_upsell"];
            stepAssertions = [
              ...stepAssertions,
              {
                label:  "Após aceite: cards esperados",
                pass:   false,
                detail: `cards=0, mode=${response.mode}`,
              },
            ];
          } else {
            stepAssertions = [
              ...stepAssertions,
              { label: "Após aceite: cards retornados", pass: true },
            ];
          }
        }

        // ON_CHECKOUT_STARTED: expect active upsell — Waiter must show cards directly (no modal)
        if (event === "ON_CHECKOUT_STARTED" && profile.expectsCheckoutUpsell) {
          const hasCards = response.cards.length > 0;
          if (!hasCards) {
            stepFailures   = [...stepFailures, "missed_final_upsell"];
            stepAssertions = [
              ...stepAssertions,
              {
                label:  "Checkout upsell ativo: cards de bebida/sobremesa esperados",
                pass:   false,
                detail: `cards=0, options=${response.options.length}, mode=${response.mode}`,
              },
            ];
          } else {
            stepAssertions = [
              ...stepAssertions,
              {
                label: `Checkout upsell ativo: ${response.cards.length} card(s) retornado(s)`,
                pass:  true,
              },
            ];
          }
        }

        // Repeated prompt detection
        if (promptsGiven > 1 && response.options.length > 0 &&
            event !== "ON_ITEM_ADDED" && event !== "ON_ENTRY") {
          stepFailures   = [...stepFailures, "repeated_prompt"];
          stepAssertions = [
            ...stepAssertions,
            {
              label:  "Sem prompt repetido no mesmo cenário",
              pass:   false,
              detail: `Prompt #${promptsGiven} no evento ${event}`,
            },
          ];
        }
      }

      // Constraint check — verify returned cards against declared profile constraints
      if (profile.constraints && event === "ON_USER_MESSAGE" && response.cards.length > 0) {
        const { maxBudget, excludeKeywords } = profile.constraints;
        const constraintViolations: string[] = [];

        for (const cardId of response.cards) {
          const item = catalog.find((c) => c.id === cardId);
          if (!item) continue;
          if (maxBudget !== undefined && item.price > maxBudget) {
            constraintViolations.push(
              `${item.name} (R$${item.price.toFixed(2)}) excede orçamento R$${maxBudget}`,
            );
          }
          if (excludeKeywords?.some((kw) => item.name.toLowerCase().includes(kw.toLowerCase()))) {
            const kw = excludeKeywords.find((k) => item.name.toLowerCase().includes(k.toLowerCase()));
            constraintViolations.push(`${item.name} contém ingrediente restrito "${kw}"`);
          }
        }

        if (constraintViolations.length > 0) {
          stepFailures   = [...stepFailures, "constraint_ignored"];
          stepAssertions = [
            ...stepAssertions,
            {
              label:  "Constraint: cards respeitam restrições declaradas (orçamento/ingrediente)",
              pass:   false,
              detail: constraintViolations.slice(0, 3).join("; "),
            },
          ];
        } else {
          stepAssertions = [
            ...stepAssertions,
            { label: "Constraint: todos os cards respeitam restrições declaradas", pass: true },
          ];
        }
      }

      // requiresIdleUpsell: ON_IDLE must return options for re-engagement
      if (profile.requiresIdleUpsell && event === "ON_IDLE") {
        const hasOptions = response.options.length > 0;
        if (!hasOptions) {
          stepFailures   = [...stepFailures, "missed_final_upsell"];
          stepAssertions = [
            ...stepAssertions,
            {
              label:  "Idle upsell: ON_IDLE deve retornar options de reconexão",
              pass:   false,
              detail: `options=0, cards=${response.cards.length}, mode=${response.mode}`,
            },
          ];
        } else {
          stepAssertions = [
            ...stepAssertions,
            {
              label: `Idle upsell: ${response.options.length} option(s) de reconexão retornado(s)`,
              pass:  true,
            },
          ];
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ft: FailureType = msg.startsWith("HTTP 429") ? "timeout" : "unknown_error";
      stepFailures   = [ft];
      stepAssertions = [{ label: `Erro na API: ${msg.slice(0, 100)}`, pass: false }];
    }

    allFailures.push(...stepFailures);

    const step: ScenarioStep = {
      stepIndex:    i,
      event,
      message,
      response,
      assertions:   stepAssertions,
      passed:       stepFailures.length === 0,
      failureTypes: stepFailures,
      durationMs:   Date.now() - t1,
    };

    steps.push(step);
    onStep(step);

    if (i < seq.length - 1 && !stopRef.current) {
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  // Checkout completeness checks
  if (profile.requiresCheckout && !checkoutReached)                   allFailures.push("checkout_not_reached");
  if (profile.requiresCheckout && checkoutReached && !orderConfirmed) allFailures.push("order_not_confirmed");

  const unique = [...new Set(allFailures)];
  const status: "PASS" | "FAIL" | "ERROR" = unique.length === 0 ? "PASS" : "FAIL";

  const actualAction =
    checkoutReached         ? "Chegou ao checkout com sucesso" :
    allCards.length > 0     ? `Mostrou ${allCards.length} produto(s) via cards` :
    lastOptions.length > 0  ? `Apresentou ${lastOptions.length} opção(ões) de qualificação` :
                              "Respondeu sem cards ou options";

  return {
    profileId:              profile.id,
    profileName:            profile.name,
    goal:                   profile.goal,
    status,
    stepsRun:               steps.length,
    failures:               unique,
    steps,
    waiterMessages:         allMessages.filter(Boolean),
    cardsShown:             allCards,
    cartFinal:              [...cart],
    checkoutReached,
    orderConfirmed,
    improvementSuggestions: unique.map((f) => IMPROVEMENT_SUGGESTIONS[f]).filter(Boolean),
    durationMs:             Date.now() - t0,
    isSilent:               profile.isSilent ?? false,
    // ── Diagnostic fields ───────────────────────────────────────────────────
    customerGoal:      profile.goal,
    expectedIntent:    expectedIntentFromBehavior(profile.behavior),
    detectedIntent:    MODE_LABEL[detectedMode] ?? detectedMode,
    expectedAction:    profile.expectedOutcome,
    actualAction,
    waiterMessage:     lastReply,
    optionsReturned:   lastOptions,
    cardsReturned:     allCards,
    renderedProducts:  allCards,
    probableRootCause: computeProbableRootCause(unique),
    recommendedFix:    computeRecommendedFix(unique),
    severity:          computeSeverity(unique, status),
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-400" :
    score >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`text-4xl font-bold tabular-nums ${color}`}>
      {score}<span className="text-lg text-ink2">/100</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "PASS"    ? "bg-green-900 text-green-300" :
    status === "FAIL"    ? "bg-red-900   text-red-300"   :
    status === "running" ? "bg-amber-900 text-amber-300 animate-pulse" :
                           "bg-ink  text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${cls}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const cls =
    severity === "critical" ? "bg-red-900    text-red-200"    :
    severity === "high"     ? "bg-brand-900 text-brand-300" :
    severity === "medium"   ? "bg-amber-900  text-amber-300"  :
                              "bg-ink   text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {severity}
    </span>
  );
}

function TypeBadge({ isSilent }: { isSilent: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
      isSilent ? "bg-blue-900 text-blue-300" : "bg-ink text-muted"
    }`}>
      {isSilent ? "silent" : "typed"}
    </span>
  );
}

function AreaScoreBar({ label, score }: { label: string; score: number }) {
  const color    = score >= 80 ? "text-green-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const barColor = score >= 80 ? "bg-green-700"   : score >= 50 ? "bg-amber-700"   : "bg-red-700";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-[9px] text-ink2 leading-none">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-ink">
        <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-6 shrink-0 text-right text-[9px] tabular-nums font-bold ${color}`}>
        {score}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AutoPilotPanel({ slug, catalog, restaurantName }: Props) {
  const [status,           setStatus]          = useState<AutoPilotStatus>("idle");
  const [selectedIds,      setSelectedIds]     = useState<Set<string>>(
    new Set(CUSTOMER_PROFILES.map((p) => p.id)),
  );
  const [speedIdx,         setSpeedIdx]        = useState(1);
  const [profileIdx,       setProfileIdx]      = useState(0);
  const [currentStepLabel, setCurrentStepLabel] = useState("");
  const [currentSteps,     setCurrentSteps]    = useState<ScenarioStep[]>([]);
  const [results,          setResults]         = useState<ScenarioResult[]>([]);
  const [report,           setReport]          = useState<AutoPilotReport | null>(null);
  const [expandedResult,   setExpandedResult]  = useState<string | null>(null);
  const stopRef = useRef(false);

  const stepDelay  = SPEED_OPTIONS[speedIdx]?.ms ?? 900;

  // ── Runner ──────────────────────────────────────────────────────────────────

  const runAutoPilot = useCallback(async () => {
    const toRun = CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id));
    if (toRun.length === 0) return;

    stopRef.current = false;
    setStatus("running");
    setResults([]);
    setReport(null);
    setCurrentSteps([]);
    setExpandedResult(null);

    const accumulated: ScenarioResult[] = [];

    for (let i = 0; i < toRun.length; i++) {
      if (stopRef.current) break;

      setProfileIdx(i);
      setCurrentStepLabel("Iniciando…");
      setCurrentSteps([]);

      const profile = toRun[i];
      if (!profile) continue;

      try {
        const result = await runScenario(
          profile, slug, catalog, stepDelay, stopRef,
          (step) => {
            setCurrentStepLabel(
              `${step.event}${step.message ? `: "${step.message.slice(0, 40)}"` : ""}`,
            );
            setCurrentSteps((prev) => [...prev, step]);
          },
        );
        accumulated.push(result);
      } catch (err) {
        const msg    = err instanceof Error ? err.message : String(err);
        const unique: FailureType[] = ["unknown_error"];
        accumulated.push({
          profileId:              profile.id,
          profileName:            profile.name,
          goal:                   profile.goal,
          status:                 "ERROR",
          stepsRun:               0,
          failures:               unique,
          steps:                  [],
          waiterMessages:         [],
          cardsShown:             [],
          cartFinal:              [],
          checkoutReached:        false,
          orderConfirmed:         false,
          improvementSuggestions: [IMPROVEMENT_SUGGESTIONS.unknown_error],
          durationMs:             0,
          isSilent:               profile.isSilent ?? false,
          customerGoal:           profile.goal,
          expectedIntent:         expectedIntentFromBehavior(profile.behavior),
          detectedIntent:         "—",
          expectedAction:         profile.expectedOutcome,
          actualAction:           `Erro: ${msg.slice(0, 120)}`,
          waiterMessage:          "",
          optionsReturned:        [],
          cardsReturned:          [],
          renderedProducts:       [],
          probableRootCause:      computeProbableRootCause(unique),
          recommendedFix:         computeRecommendedFix(unique),
          severity:               "critical",
        });
        console.error("[AutoPilot] scenario error:", msg);
      }

      setResults([...accumulated]);
    }

    const finalReport = buildReport(accumulated, slug, restaurantName);
    setReport(finalReport);
    setStatus(stopRef.current ? "stopped" : "done");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, slug, catalog, restaurantName, stepDelay]);

  const stopAutoPilot = () => { stopRef.current = true; };

  const resetAll = () => {
    stopRef.current = true;
    setStatus("idle");
    setResults([]);
    setReport(null);
    setCurrentSteps([]);
    setCurrentStepLabel("");
    setExpandedResult(null);
  };

  const toggleProfile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll   = () => setSelectedIds(new Set(CUSTOMER_PROFILES.map((p) => p.id)));
  const selectNone  = () => setSelectedIds(new Set());
  const selectTyped = () => setSelectedIds(new Set(CUSTOMER_PROFILES.filter((p) => !p.isSilent).map((p) => p.id)));
  const selectSilent = () => setSelectedIds(new Set(CUSTOMER_PROFILES.filter((p) => p.isSilent).map((p) => p.id)));

  const currentProfile = CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id))[profileIdx];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left: Controls ──────────────────────────────────────────────────── */}
      <div className="flex w-52 shrink-0 flex-col border-r border-gray-800 overflow-y-auto">

        {/* Profile selector */}
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-ink2">Perfis</span>
            <span className="flex gap-1.5">
              <button onClick={selectAll}    className="text-[9px] text-ink2 hover:text-amber-400">todos</button>
              <button onClick={selectNone}   className="text-[9px] text-ink2 hover:text-red-400">nenhum</button>
              <button onClick={selectTyped}  className="text-[9px] text-ink2 hover:text-muted">T</button>
              <button onClick={selectSilent} className="text-[9px] text-blue-700 hover:text-blue-400">S</button>
            </span>
          </div>

          {/* Typed profiles */}
          <div className="mb-1 text-[9px] text-ink2 uppercase tracking-wide">Digitados</div>
          <div className="space-y-1 mb-2">
            {CUSTOMER_PROFILES.filter((p) => !p.isSilent).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="mt-px shrink-0 accent-amber-500"
                />
                <span className="text-[10px] leading-snug text-muted">{p.name}</span>
              </label>
            ))}
          </div>

          {/* Silent profiles */}
          <div className="mb-1 text-[9px] text-blue-700 uppercase tracking-wide">Silent</div>
          <div className="space-y-1">
            {CUSTOMER_PROFILES.filter((p) => p.isSilent).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="mt-px shrink-0 accent-blue-500"
                />
                <span className="text-[10px] leading-snug text-muted">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-ink2">
            {selectedIds.size}/{CUSTOMER_PROFILES.length} selecionados
          </p>
        </div>

        {/* Speed */}
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-ink2">Velocidade</div>
          <div className="flex gap-1">
            {SPEED_OPTIONS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={`flex-1 rounded border px-1 py-0.5 text-[9px] transition-colors ${
                  speedIdx === i
                    ? "border-amber-600 text-amber-300"
                    : "border-gray-800 text-ink2 hover:border-gray-700 hover:text-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-0.5 text-[9px] text-ink2">{stepDelay}ms entre passos</p>
        </div>

        {/* Controls */}
        <div className="border-b border-gray-800 px-3 py-2 space-y-1.5">
          <button
            onClick={() => void runAutoPilot()}
            disabled={status === "running" || selectedIds.size === 0 || catalog.length === 0}
            className="w-full rounded bg-amber-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶ Run AutoPilot
          </button>
          <button
            onClick={stopAutoPilot}
            disabled={status !== "running"}
            className="w-full rounded border border-gray-700 px-2 py-1 text-[10px] text-muted hover:border-red-700 hover:text-red-400 disabled:opacity-30"
          >
            ■ Stop
          </button>
          <button
            onClick={resetAll}
            disabled={status === "running"}
            className="w-full rounded border border-gray-700 px-2 py-1 text-[10px] text-muted hover:border-gray-600 hover:text-muted disabled:opacity-30"
          >
            ↺ Reset Results
          </button>
          {catalog.length === 0 && (
            <p className="text-[9px] text-red-500">Catálogo não carregado</p>
          )}
        </div>

        {/* Export */}
        {report && (
          <div className="px-3 py-2 space-y-1">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-ink2">Exportar</div>
            <button
              onClick={() => download(JSON.stringify(report, null, 2), `waiter-autopilot-${slug}-${Date.now()}.json`, "application/json")}
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-muted hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ JSON (completo)
            </button>
            <button
              onClick={() => download(toCsv(report), `waiter-autopilot-${slug}-${Date.now()}.csv`, "text/csv")}
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-muted hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ CSV (cenários)
            </button>
            <button
              onClick={() => download(toSummaryText(report), `waiter-autopilot-${slug}-${Date.now()}.txt`, "text/plain")}
              className="w-full rounded border border-gray-700 px-2 py-1 text-left text-[10px] text-muted hover:border-amber-700 hover:text-amber-400"
            >
              ⬇ Relatório TXT
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Live + Report ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Idle ──────────────────────────────────────────────────────────── */}
        {status === "idle" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-6">
            <span className="text-3xl">🤖</span>
            <p className="text-sm font-semibold text-muted">AutoPilot pronto</p>
            <p className="max-w-xs text-[11px] text-ink2">
              {selectedIds.size} perfis ({
                CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id) && !p.isSilent).length
              }T + {
                CUSTOMER_PROFILES.filter((p) => selectedIds.has(p.id) && p.isSilent).length
              }S) · catálogo: {catalog.length} itens
            </p>
            <p className="text-[10px] text-ink2">
              Clique <span className="text-amber-500">▶ Run AutoPilot</span> para iniciar
            </p>
            <p className="text-[9px] text-ink font-mono">
              evaluator: {EVALUATOR_VERSION}
            </p>
          </div>
        )}

        {/* ── Running ───────────────────────────────────────────────────────── */}
        {status === "running" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-gray-800 px-3 py-2">
              <div className="flex items-center gap-2">
                <StatusBadge status="running" />
                {currentProfile && <TypeBadge isSilent={currentProfile.isSilent ?? false} />}
                <span className="text-[11px] font-semibold text-muted">
                  {currentProfile?.name ?? "…"}
                </span>
                <span className="text-[10px] text-ink2">
                  {profileIdx + 1}/{selectedIds.size}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-ink2">{currentStepLabel}</p>
            </div>

            <div className="shrink-0 border-b border-gray-800 px-3 py-1.5">
              <div className="flex flex-wrap gap-1">
                {results.map((r) => (
                  <span
                    key={r.profileId}
                    title={r.profileName}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      r.status === "PASS" ? "bg-green-900 text-green-300" :
                      r.status === "FAIL" ? "bg-red-900   text-red-300"   :
                                            "bg-ink  text-muted"
                    }`}
                  >
                    {r.status === "PASS" ? "✓" : "✗"} {r.profileName.split(" ").slice(-1)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-ink2">
                Passos — {currentProfile?.name ?? ""}
              </div>
              <div className="space-y-1.5">
                {currentSteps.map((step, i) => (
                  <div key={i} className={`rounded border px-2 py-1.5 ${
                    step.passed ? "border-green-900 bg-green-950/20" : "border-red-900 bg-red-950/20"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={step.passed ? "text-green-400" : "text-red-400"}>
                        {step.passed ? "✓" : "✗"}
                      </span>
                      <span className="text-[10px] font-mono text-muted">{step.event}</span>
                      {step.message && (
                        <span className="truncate text-[9px] text-ink2">
                          {'"'}{step.message.slice(0, 50)}{'"'}
                        </span>
                      )}
                      <span className="ml-auto text-[9px] text-ink2">{step.durationMs}ms</span>
                    </div>
                    {step.response && (
                      <div className="mt-0.5 flex gap-2 text-[9px] text-ink2">
                        <span>mode: <span className="text-muted">{step.response.mode}</span></span>
                        <span>cards: <span className="text-muted">{step.response.cards.length}</span></span>
                        <span>opts: <span className="text-muted">{step.response.options.length}</span></span>
                      </div>
                    )}
                    {!step.passed && step.failureTypes.length > 0 && (
                      <div className="mt-0.5 text-[9px] text-red-500">
                        {step.failureTypes.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
                {currentSteps.length === 0 && (
                  <div className="animate-pulse text-[10px] text-ink2">Aguardando primeiro passo…</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Done / Stopped: Report ─────────────────────────────────────────── */}
        {(status === "done" || status === "stopped") && report && (() => {
          const typed  = report.scenarioResults.filter((r) => !r.isSilent);
          const silent = report.scenarioResults.filter((r) =>  r.isSilent);
          const typedPassed  = typed.filter((r)  => r.status === "PASS").length;
          const silentPassed = silent.filter((r) => r.status === "PASS").length;
          const sm = report.silentMetrics;

          return (
            <div className="flex flex-1 flex-col overflow-hidden">

              {/* Score header */}
              <div className="shrink-0 border-b border-gray-800 px-4 py-3">
                <div className="flex items-start gap-6">
                  <div className="flex flex-col items-center">
                    <ScoreRing score={report.score} />
                    <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink2">Score</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div>
                      <span className={typedPassed === typed.length ? "text-green-400" : "text-amber-400"} style={{ fontWeight: "bold" }}>
                        {typedPassed}/{typed.length}
                      </span>
                      <span className="ml-1 text-ink2">typed</span>
                    </div>
                    <div>
                      <span className={silentPassed === silent.length ? "text-green-400" : "text-red-400"} style={{ fontWeight: "bold" }}>
                        {silentPassed}/{silent.length}
                      </span>
                      <span className="ml-1 text-blue-700">silent</span>
                    </div>
                    <div>
                      <span className="text-amber-300 font-bold">{report.conversionRate}%</span>
                      <span className="ml-1 text-ink2">checkout</span>
                    </div>
                    <div>
                      <span className="text-muted font-bold">{report.avgTurns}</span>
                      <span className="ml-1 text-ink2">turnos avg</span>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-1">
                    {status === "stopped" && (
                      <span className="text-[10px] text-amber-500">Interrompido</span>
                    )}
                    <span className="text-[8px] font-mono text-ink">{EVALUATOR_VERSION}</span>
                  </div>
                </div>
              </div>

              {/* Area scores */}
              <div className="shrink-0 border-b border-gray-800 px-3 py-2">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Scores por área</div>
                <div className="space-y-1">
                  <AreaScoreBar label="Intenção"     score={report.areaScores.intentScore} />
                  <AreaScoreBar label="Produto"      score={report.areaScores.productFitScore} />
                  <AreaScoreBar label="Sinc. Visual" score={report.areaScores.visualSyncScore} />
                  <AreaScoreBar label="Copy"         score={report.areaScores.salesCopyScore} />
                  <AreaScoreBar label="Controle UI"  score={report.areaScores.userControlScore} />
                  <AreaScoreBar label="Checkout"     score={report.areaScores.checkoutSafetyScore} />
                </div>
              </div>

              {/* Silent metrics */}
              {sm.silentScenarioCount > 0 && (
                <div className="shrink-0 border-b border-gray-800 px-3 py-2">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-blue-700">
                    Métricas silent ({sm.silentPassed}/{sm.silentScenarioCount} passou)
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                    <div>
                      <span className="text-ink2">Conversão: </span>
                      <span className={sm.silentConversionRate >= 80 ? "text-green-400" : "text-amber-400"}>
                        {sm.silentConversionRate}%
                      </span>
                    </div>
                    <div>
                      <span className="text-ink2">Upsell oferecido: </span>
                      <span className={sm.finalUpsellOfferedRate >= 80 ? "text-green-400" : "text-amber-400"}>
                        {sm.finalUpsellOfferedRate}%
                      </span>
                    </div>
                    <div>
                      <span className="text-ink2">Upsell aceito: </span>
                      <span className="text-muted">{sm.finalUpsellAcceptedRate}%</span>
                    </div>
                    <div>
                      <span className="text-ink2">Invasões: </span>
                      <span className={sm.invasionFailures === 0 ? "text-green-400" : "text-red-400"}>
                        {sm.invasionFailures}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-ink2">Upsells perdidos: </span>
                      <span className={sm.missedUpsellOpportunities === 0 ? "text-green-400" : "text-amber-400"}>
                        {sm.missedUpsellOpportunities}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Top fixes */}
              {report.topFixes.length > 0 && (
                <div className="shrink-0 border-b border-gray-800 px-3 py-2">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">
                    Top {report.topFixes.length} correções
                  </div>
                  <div className="space-y-1.5">
                    {report.topFixes.map((fix) => (
                      <div key={fix.failureType} className="rounded border border-gray-800 bg-ink/50 px-2 py-1.5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="shrink-0 text-[9px] font-bold text-amber-500">#{fix.priority}</span>
                          <span className="rounded bg-red-950/60 px-1 py-px text-[9px] font-mono text-red-400">
                            {fix.failureType}
                          </span>
                          <span className="text-[9px] text-ink2">{fix.affectedScenarios.length} cenário(s)</span>
                        </div>
                        <p className="text-[9px] text-muted">
                          <span className="text-ink2">Área:</span>{" "}
                          <span className="text-amber-400/80">{fix.implementationArea}</span>
                        </p>
                        <p className="text-[9px] text-muted">{fix.expectedImpact}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failure type tags */}
              {Object.keys(report.failureTypes).length > 0 && (
                <div className="shrink-0 border-b border-gray-800 px-3 py-2">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-ink2">Falhas detectadas</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(report.failureTypes)
                      .sort(([, a], [, b]) => b - a)
                      .map(([ft, count]) => (
                        <span
                          key={ft}
                          title={`${FAILURE_TO_FIX_AREA[ft as FailureType]} — ${IMPROVEMENT_SUGGESTIONS[ft as FailureType]}`}
                          className="rounded bg-red-950/40 px-1.5 py-0.5 text-[9px] text-red-400"
                        >
                          {ft} ×{count}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Scenario results */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Cenários</div>
                <div className="space-y-2">
                  {report.scenarioResults.map((r) => (
                    <div
                      key={r.profileId}
                      className={`rounded border ${
                        r.status === "PASS"
                          ? "border-green-900 bg-green-950/10"
                          : "border-red-900 bg-red-950/10"
                      }`}
                    >
                      {/* Header */}
                      <button
                        onClick={() =>
                          setExpandedResult(expandedResult === r.profileId ? null : r.profileId)
                        }
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
                      >
                        <StatusBadge status={r.status} />
                        <SeverityBadge severity={r.severity} />
                        <TypeBadge isSilent={r.isSilent} />
                        <span className="flex-1 text-[10px] font-semibold text-muted">
                          {r.profileName}
                        </span>
                        <span className="text-[9px] text-ink2">
                          {r.stepsRun}t · {r.cardsShown.length}c
                          {r.checkoutReached ? " · ✓chk" : ""}
                        </span>
                        <span className="text-[10px] text-ink2">
                          {expandedResult === r.profileId ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Expanded diagnostic */}
                      {expandedResult === r.profileId && (
                        <div className="border-t border-gray-800 px-2 py-2 space-y-2">

                          {/* Intent comparison */}
                          <div className="rounded bg-ink/60 px-2 py-1.5 space-y-0.5">
                            <p className="text-[9px] text-ink2 font-semibold uppercase tracking-wide mb-1">Intenção</p>
                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[9px]">
                              <span className="text-ink2">Esperada:</span>
                              <span className="text-muted">{r.expectedIntent}</span>
                              <span className="text-ink2">Detectada:</span>
                              <span className="text-amber-400">{r.detectedIntent}</span>
                            </div>
                          </div>

                          {/* Action comparison */}
                          <div className="rounded bg-ink/60 px-2 py-1.5 space-y-0.5">
                            <p className="text-[9px] text-ink2 font-semibold uppercase tracking-wide mb-1">Ação</p>
                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[9px]">
                              <span className="text-ink2">Esperada:</span>
                              <span className="text-muted">{r.expectedAction}</span>
                              <span className="text-ink2">Real:</span>
                              <span className={r.status === "PASS" ? "text-green-400" : "text-amber-400"}>
                                {r.actualAction}
                              </span>
                            </div>
                          </div>

                          {/* Failures + diagnosis */}
                          {r.failures.length > 0 && (
                            <div className="rounded bg-red-950/20 px-2 py-1.5 space-y-1">
                              <p className="text-[9px] text-red-400 font-semibold">
                                Falhas: {r.failures.join(", ")}
                              </p>
                              {r.failures.map((f) => (
                                <p key={f} className="text-[9px] text-ink2">
                                  <span className="text-muted font-mono">{f}</span>
                                  {" → "}
                                  <span className="text-amber-400/70">{FAILURE_TO_FIX_AREA[f]}</span>
                                </p>
                              ))}
                              <div className="mt-1 border-t border-red-900/40 pt-1 space-y-0.5">
                                <p className="text-[9px] text-muted">
                                  <span className="text-ink2">Causa:</span> {r.probableRootCause}
                                </p>
                                <p className="text-[9px] text-muted">
                                  <span className="text-ink2">Correção:</span>{" "}
                                  <span className="text-green-400/80">{r.recommendedFix}</span>
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Steps */}
                          <div>
                            <p className="text-[9px] text-ink2 mb-0.5">Passos:</p>
                            <div className="space-y-0.5">
                              {r.steps.map((step, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[9px]">
                                  <span className={step.passed ? "text-green-400" : "text-red-400"}>
                                    {step.passed ? "✓" : "✗"}
                                  </span>
                                  <span className="font-mono text-muted">{step.event}</span>
                                  {step.message && (
                                    <span className="truncate text-ink2">
                                      {'"'}{step.message.slice(0, 40)}{'"'}
                                    </span>
                                  )}
                                  {step.response && (
                                    <span className="ml-auto shrink-0 text-ink2">
                                      {step.response.mode} · {step.response.cards.length}c
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Last waiter message */}
                          {r.waiterMessage && (
                            <div>
                              <p className="text-[9px] text-ink2 mb-0.5">Última mensagem:</p>
                              <p className="text-[9px] text-muted italic">
                                {'"'}{r.waiterMessage.slice(0, 120)}{r.waiterMessage.length > 120 ? "…" : ""}{'"'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
