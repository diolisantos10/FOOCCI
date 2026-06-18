/**
 * Full Agent Diagnostic — one consolidated battery that exercises BOTH WhatsApp
 * paths (Text Order when authorized, Receptionist when not) across an
 * allowlisted profile and a synthetic non-allowlisted profile, then emits a
 * single PASS/WARNING/FAIL verdict + an operational recommendation
 * (KEEP_ALLOWLIST / EXPAND_ALLOWLIST / READY_FOR_RESTAURANT_WIDE_REQUEST /
 * ROLLBACK_OR_PAUSE).
 *
 * Builds on the host-routing diagnostic (does NOT reimplement it). Pure read:
 * never sends WhatsApp, never calls Evolution, never creates an order or Pix,
 * never changes config. Phones are always masked.
 *
 * Scope note: this is a ROUTING/HOST-level battery. The deep Text Order runtime
 * (CEP→frete, Pix-after-summary, out-of-hours gate, conducting real catalog
 * items) is covered by the ordering suites, not here — for an allowlisted order
 * message this battery asserts only that the host is TEXT_ORDER.
 */

import {
  runHostRoutingDiagnostic,
  type HostDecision,
} from "./hostRoutingDiagnostic";
import type { ReceptionistResponseType } from "@/services/ai/WhatsAppReceptionistService";

export type PhoneProfile = "ALLOWLISTED" | "NON_ALLOWLISTED";
export type Severity = "P0" | "P1" | "P2" | "OK";
export type Recommendation =
  | "KEEP_ALLOWLIST"
  | "EXPAND_ALLOWLIST"
  | "READY_FOR_RESTAURANT_WIDE_REQUEST"
  | "ROLLBACK_OR_PAUSE";

export interface ScenarioExpectation {
  host?: HostDecision;
  /** Acceptable responseTypes (receptionist path). First is the ideal. */
  responseTypeIn?: ReceptionistResponseType[];
  noRawLink?: boolean;
  noLocation?: boolean;
  noHandoff?: boolean;
}

export interface ScenarioSpec {
  id: string;
  name: string;
  phoneProfile: PhoneProfile;
  message: string;
  expect: ScenarioExpectation;
}

export interface ScenarioResult {
  id: string;
  name: string;
  phoneProfile: PhoneProfile;
  host: HostDecision;
  responseType?: ReceptionistResponseType;
  passed: boolean;
  failures: string[];
  severity: Severity;
}

export interface FullAgentSafety {
  noEvolution: boolean;
  noRealOrder: boolean;
  noRealPix: boolean;
  runtimeTouched: boolean;
}

export interface FullAgentSummary {
  status: "PASS" | "WARNING" | "FAIL";
  p0: number;
  p1: number;
  p2: number;
  recommendation: Recommendation;
}

export interface FullAgentResult {
  ok: boolean;
  restaurantSlug: string | null;
  fieldValidated: boolean;
  summary: FullAgentSummary;
  scenarios: ScenarioResult[];
  safety: FullAgentSafety;
  notes: string[];
}

// ── Canonical battery ─────────────────────────────────────────────────────────

const RODIZIO = "Quero 1 rodízio completo por favor\nTemakis grelhados";
const LOOSE_ADDRESS = "Rua Araraquara 60\nCidade Kemel Poá";

export const FULL_AGENT_SCENARIOS: ScenarioSpec[] = [
  // ── A. Allowlisted ──
  { id: "A1-greeting", name: "allowlisted · saudação", phoneProfile: "ALLOWLISTED", message: "ola",
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noRawLink: true } },
  { id: "A2-order", name: "allowlisted · yakisoba+coca", phoneProfile: "ALLOWLISTED", message: "quero 1 yakisoba e 1 coca cola",
    expect: { host: "TEXT_ORDER" } },
  { id: "A3-typo", name: "allowlisted · typo yaksoba", phoneProfile: "ALLOWLISTED", message: "quero yaksoba e coca",
    expect: { host: "TEXT_ORDER" } },
  { id: "A4-rodizio", name: "allowlisted · rodízio+temakis", phoneProfile: "ALLOWLISTED", message: RODIZIO,
    expect: { host: "TEXT_ORDER" } },
  { id: "A5-address", name: "allowlisted · endereço solto", phoneProfile: "ALLOWLISTED", message: LOOSE_ADDRESS,
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noLocation: true, noHandoff: true, noRawLink: true } },
  // A6: delivery-intent order → host routes to TEXT_ORDER; the CEP-first / frete / Pix sequencing
  // is covered by the ordering suites (not this routing battery).
  { id: "A6-delivery", name: "allowlisted · pedido para entrega", phoneProfile: "ALLOWLISTED", message: "quero 1 yakisoba para entrega",
    expect: { host: "TEXT_ORDER" } },
  // A7: Pix question without an active order session → no order intent → RECEPTIONIST (never TEXT_ORDER).
  // Proves no real Pix is generated from a standalone Pix query even for allowlisted phones.
  { id: "A7-pix", name: "allowlisted · Pix antes do pedido", phoneProfile: "ALLOWLISTED", message: "posso pagar com Pix?",
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU", "UNKNOWN"], noRawLink: true } },
  { id: "A8-handoff", name: "allowlisted · falar com atendente", phoneProfile: "ALLOWLISTED", message: "falar com atendente",
    expect: { host: "RECEPTIONIST", responseTypeIn: ["HANDOFF"] } },

  // ── B. Non-allowlisted ──
  { id: "B1-order", name: "fora-allowlist · yakisoba+coca", phoneProfile: "NON_ALLOWLISTED", message: "quero 1 yakisoba e 1 coca cola",
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noRawLink: true } },
  { id: "B2-rodizio", name: "fora-allowlist · rodízio+temakis", phoneProfile: "NON_ALLOWLISTED", message: RODIZIO,
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noRawLink: true } },
  { id: "B3-question", name: "fora-allowlist · tem temaki?", phoneProfile: "NON_ALLOWLISTED", message: "tem temaki?",
    // SAFE_MENU is ideal; UNKNOWN (GPT branch) is acceptable but P1. A raw link is P0.
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU", "UNKNOWN"], noRawLink: true } },
  { id: "B4-address", name: "fora-allowlist · endereço solto", phoneProfile: "NON_ALLOWLISTED", message: LOOSE_ADDRESS,
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU"], noLocation: true, noHandoff: true, noRawLink: true } },
  // B5: non-allowlisted phone attempting an order outside business hours → RECEPTIONIST always
  // intercepts before any ordering/payment. Gate-de-horário depth is in the ordering suites.
  { id: "B5-closed", name: "fora-allowlist · fora do horário + pedido", phoneProfile: "NON_ALLOWLISTED",
    message: "vocês estão abertos agora? quero 2 temakis",
    expect: { host: "RECEPTIONIST", responseTypeIn: ["SAFE_MENU", "UNKNOWN"], noRawLink: true } },
];

// ── Pure evaluation ───────────────────────────────────────────────────────────

export interface EvaluableResult {
  host: HostDecision;
  phoneInAllowlist: boolean;
  /**
   * True when scope=RESTAURANT_WIDE is active. In this mode every phone is
   * effectively allowlisted, so NON_ALLOWLISTED profile integrity cannot be
   * checked the same way and order messages from "non-allowlisted" phones
   * legitimately route to TEXT_ORDER.
   */
  restaurantWide?: boolean;
  receptionistPreview?: {
    responseType: ReceptionistResponseType;
    containsRawLink: boolean;
    containsRestaurantLocation: boolean;
    containsHandoff: boolean;
  };
}

/** Pure pass/severity verdict for one scenario given its host-routing result. */
export function evaluateScenario(spec: ScenarioSpec, result: EvaluableResult): ScenarioResult {
  const failures: string[] = [];
  let worst: Severity = "OK";
  const bump = (sev: Severity) => {
    const rank = { OK: 0, P2: 1, P1: 2, P0: 3 } as const;
    if (rank[sev] > rank[worst]) worst = sev;
  };

  // Profile integrity: under RESTAURANT_WIDE every phone is allowlisted, so
  // the NON_ALLOWLISTED profile's phoneInAllowlist=true is expected — not an error.
  const isRestaurantWide = result.restaurantWide === true;
  const expectedInAllowlist = spec.phoneProfile === "ALLOWLISTED" || isRestaurantWide;
  if (result.phoneInAllowlist !== expectedInAllowlist) {
    failures.push(`perfil incorreto: phoneInAllowlist=${result.phoneInAllowlist}, esperado ${expectedInAllowlist}`);
    bump("P0");
  }

  if (spec.expect.host) {
    // Under RESTAURANT_WIDE, a NON_ALLOWLISTED order message legitimately routes to
    // TEXT_ORDER (all phones are eligible). Accept that without flagging P0.
    const hostOk =
      result.host === spec.expect.host ||
      (isRestaurantWide && spec.phoneProfile === "NON_ALLOWLISTED" && result.host === "TEXT_ORDER");
    if (!hostOk) {
      failures.push(`host=${result.host}, esperado ${spec.expect.host}`);
      bump("P0");
    }
  }

  const prev = result.receptionistPreview;
  if (spec.expect.noRawLink && prev?.containsRawLink) {
    failures.push("recepcionista mandou link gigante como corpo principal");
    bump("P0");
  }
  if (spec.expect.noLocation && prev?.containsRestaurantLocation) {
    failures.push("endereço solto virou localização do restaurante");
    bump("P0");
  }
  if (spec.expect.noHandoff && prev?.containsHandoff) {
    failures.push("handoff humano indevido");
    bump("P0");
  }
  if (spec.expect.responseTypeIn && prev) {
    if (!spec.expect.responseTypeIn.includes(prev.responseType)) {
      failures.push(`responseType=${prev.responseType}, esperado um de [${spec.expect.responseTypeIn.join(", ")}]`);
      // LINK/LOCATION are hard failures; a generic UNKNOWN in a critical case is P1.
      bump(prev.responseType === "UNKNOWN" ? "P1" : "P0");
    } else if (prev.responseType === "UNKNOWN" && spec.expect.responseTypeIn[0] !== "UNKNOWN") {
      // Accepted, but the non-deterministic GPT branch in a critical case is a P1 warning.
      failures.push("caiu no branch GPT (UNKNOWN) — resposta não-determinística");
      bump("P1");
    }
  }

  return {
    id: spec.id, name: spec.name, phoneProfile: spec.phoneProfile,
    host: result.host, responseType: prev?.responseType,
    passed: worst === "OK", failures, severity: worst,
  };
}

/** Pure summary + operational recommendation from evaluated scenarios + safety. */
export function computeSummary(
  scenarios: ScenarioResult[],
  safety: FullAgentSafety,
  fieldValidated: boolean,
): FullAgentSummary {
  const p0 = scenarios.filter(s => s.severity === "P0").length;
  const p1 = scenarios.filter(s => s.severity === "P1").length;
  const p2 = scenarios.filter(s => s.severity === "P2").length;

  const safetyViolation =
    !safety.noEvolution || !safety.noRealOrder || !safety.noRealPix || safety.runtimeTouched;

  let status: FullAgentSummary["status"];
  let recommendation: Recommendation;
  if (safetyViolation) {
    status = "FAIL";
    recommendation = "ROLLBACK_OR_PAUSE";          // dangerous config / real side-effect risk
  } else if (p0 > 0) {
    status = "FAIL";
    recommendation = "KEEP_ALLOWLIST";             // behavioural P0 — do not expand
  } else if (p1 > 0) {
    status = "WARNING";
    recommendation = "KEEP_ALLOWLIST";
  } else if (fieldValidated) {
    status = "PASS";
    recommendation = "READY_FOR_RESTAURANT_WIDE_REQUEST"; // only with documented field test + rollback
  } else {
    status = "PASS";
    recommendation = "EXPAND_ALLOWLIST";           // green, but field validation still pending
  }

  return { status, p0, p1, p2, recommendation };
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface FullAgentInput {
  restaurantSlug?: string;
  restaurantId?: string;
  /** Synthetic phone for the NON_ALLOWLISTED profile (never logged in clear). */
  nonAllowlistedPhone?: string;
  /** Set true ONLY when a documented controlled field test + rollback exist. */
  fieldValidated?: boolean;
}

const DEFAULT_SYNTHETIC_PHONE = "+5511900000000";

export async function runFullAgentDiagnostic(input: FullAgentInput): Promise<FullAgentResult> {
  const notes: string[] = [];
  const safety: FullAgentSafety = { noEvolution: true, noRealOrder: true, noRealPix: true, runtimeTouched: false };
  const synthetic = (input.nonAllowlistedPhone ?? "").trim() || DEFAULT_SYNTHETIC_PHONE;

  const scenarios: ScenarioResult[] = [];
  let restaurantResolved = false;
  let restaurantWide = false;

  for (const spec of FULL_AGENT_SCENARIOS) {
    // ALLOWLISTED → empty phone self-tests the first allowlisted number (masked).
    const phone = spec.phoneProfile === "ALLOWLISTED" ? "" : synthetic;
    const host = await runHostRoutingDiagnostic({
      restaurantId:   input.restaurantId,
      restaurantSlug: input.restaurantSlug,
      phone,
      message:        spec.message,
    });

    if (host.ok) {
      restaurantResolved = true;
      if (host.config.scope === "RESTAURANT_WIDE") restaurantWide = true;
    }

    // Fold each result's safety into the global safety (any false fails the run).
    safety.noEvolution    &&= host.safety.noEvolution;
    safety.noRealOrder    &&= host.safety.noRealOrder;
    safety.noRealPix      &&= host.safety.noRealPix;
    safety.runtimeTouched ||= host.safety.runtimeTouched;

    if (!host.ok) {
      scenarios.push({
        id: spec.id, name: spec.name, phoneProfile: spec.phoneProfile,
        host: host.decision.host, passed: false,
        failures: [`diagnóstico não ok: ${host.decision.reason}`], severity: "P0",
      });
      continue;
    }

    scenarios.push(evaluateScenario(spec, {
      host: host.decision.host,
      phoneInAllowlist: host.config.phoneInAllowlist,
      restaurantWide,
      receptionistPreview: host.receptionistPreview
        ? {
            responseType:               host.receptionistPreview.responseType,
            containsRawLink:            host.receptionistPreview.containsRawLink,
            containsRestaurantLocation: host.receptionistPreview.containsRestaurantLocation,
            containsHandoff:            host.receptionistPreview.containsHandoff,
          }
        : undefined,
    }));
  }

  notes.push(
    "Bateria de nível ROTEAMENTO/HOST. Fluxo profundo do Text Order " +
    "(CEP→frete, Pix após resumo, gate de horário) é coberto pelas suites de ordering.",
  );
  if (restaurantWide) {
    notes.push(
      "scope=RESTAURANT_WIDE ativo: todos os telefones são elegíveis para Text Order. " +
      "Cenários NON_ALLOWLISTED com intenção de pedido → TEXT_ORDER é comportamento correto (não P0). " +
      "Checks de qualidade do recepcionista (no-link, no-location, no-handoff) são mantidos.",
    );
  }
  if (scenarios.some(s => s.responseType === "UNKNOWN")) {
    notes.push("Um ou mais cenários caíram no branch GPT (UNKNOWN) — resposta não-determinística (P1).");
  }

  const summary = computeSummary(scenarios, safety, input.fieldValidated === true);

  return {
    ok: restaurantResolved,
    restaurantSlug: input.restaurantSlug ?? null,
    fieldValidated: input.fieldValidated === true,
    summary,
    scenarios,
    safety,
    notes,
  };
}
