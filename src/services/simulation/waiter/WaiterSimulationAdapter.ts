/**
 * WaiterSimulationAdapter — drives the REAL deterministic Waiter engine
 * (WaiterBrainV2.decide) with artificial customers, fully in the sandbox.
 *
 * Driver: SERVICE. No LLM, no DB, no order, no Pix, no WhatsApp — decide() is a
 * pure function over a synthetic catalog. This is the lowest-risk way to exercise
 * the same decision logic that ships in /pedido.
 */

import { decide, resolveMenuIntent, type V2CatalogItem, type V2Input } from "@/services/ai/WaiterBrainV2";
import { makeRng } from "../scenarioGenerator";
import { classifyEvaluation } from "../simulationEvaluator";
import { makeOpportunity } from "../opportunityBuilder";
import { waiterSyntheticCatalog } from "./waiterSyntheticCatalog";
import { precoSeSustenta, valoresDefensaveis } from "./precoDefensavel";
import { WAITER_SCENARIO_TEMPLATES, type WaiterScenarioTemplate, type WaiterCheckKind } from "./waiterScenarioTemplates";
import type {
  AgentSimulationAdapter,
  EvaluatedScenario,
  GenerateScenariosInput,
  ScenarioEvaluation,
  ScenarioRunOutput,
  SimulationOpportunity,
  SimulationScenario,
} from "../types";

const DRINK_CATEGORY = "Bebidas";
const NON_VEGAN = /salm[ãa]o|frango|filad[ée]lfia|carne|peixe|camar[ãa]o/i;
const PRICE_RE = /R\$\s?(\d+(?:[.,]\d{1,2})?)/g;

const catalog = waiterSyntheticCatalog();
const catalogIds = new Set(catalog.map((i) => i.id));
const catalogById = new Map(catalog.map((i) => [i.id, i]));

function mainDishId(): string {
  return "yakisoba"; // a substantial single main for cart-seeded flows
}

export const WaiterSimulationAdapter: AgentSimulationAdapter = {
  agentSlug: "waiter",
  departmentSlug: "waiter",
  displayName: "Waiter Simulation Lab",

  generateScenarios(input: GenerateScenariosInput): SimulationScenario[] {
    const rng = makeRng(input.seed);
    const pool = input.scenarioTypes && input.scenarioTypes.length > 0
      ? WAITER_SCENARIO_TEMPLATES.filter((t) => input.scenarioTypes!.includes(t.scenarioType))
      : WAITER_SCENARIO_TEMPLATES;
    const templates = pool.length > 0 ? pool : WAITER_SCENARIO_TEMPLATES;

    // Approved real-conversation examples (if any) only carry a classification —
    // never raw text — so they BIAS which scenario types appear without ever
    // copying literal customer wording. Phrasing always comes from templates.
    const exampleSeeds = (input.examples ?? []).filter((e) =>
      WAITER_SCENARIO_TEMPLATES.some((t) => t.scenarioType === e.scenarioType),
    );

    const out: SimulationScenario[] = [];
    for (let i = 0; i < input.count; i++) {
      let tpl = templates[i % templates.length] as WaiterScenarioTemplate;
      let inspiredByExampleId: string | undefined;
      // Half the scenarios (when examples exist) follow a real-pattern type.
      if (exampleSeeds.length > 0 && rng.bool(0.5)) {
        const ex = rng.pick(exampleSeeds);
        tpl = templateFor(ex.scenarioType) ?? tpl;
        inspiredByExampleId = ex.exampleId;
      }
      const persona = rng.pick(tpl.personas);
      const message = rng.pick(tpl.messages); // template variation — never example literal
      const constraints = { ...rng.pick(tpl.constraintsPool), ...(inspiredByExampleId ? { inspiredByExampleId } : {}) };
      out.push({
        scenarioKey: `${tpl.scenarioType}_${i + 1}`,
        scenarioType: tpl.scenarioType,
        persona,
        customerGoal: tpl.goal,
        customerConstraints: constraints,
        initialMessage: message,
        expectedBehaviors: tpl.expectedBehaviors,
        disallowedBehaviors: tpl.disallowedBehaviors,
      });
    }
    return out;
  },

  async runScenario(scenario: SimulationScenario): Promise<ScenarioRunOutput> {
    const tpl = templateFor(scenario.scenarioType);
    const cartItemIds = tpl?.seedMainInCart ? [mainDishId()] : [];
    const cartValue = cartItemIds.reduce((s, id) => s + (catalogById.get(id)?.price ?? 0), 0);

    const input: V2Input = {
      event: "ON_USER_MESSAGE",
      cartItemIds,
      cartValue,
      catalog,
      message: scenario.initialMessage,
    };
    const output = decide(input);

    return {
      transcript: [
        { role: "customer", content: scenario.initialMessage },
        { role: "agent", content: output.message, cards: output.cards, mode: output.mode },
      ],
      finalMessage: output.message,
      cards: output.cards,
      mode: output.mode,
      optionsCount: output.options.length,
      usedLLM: false,
      cartValue,
    };
  },

  evaluateScenario(scenario: SimulationScenario, output: ScenarioRunOutput): ScenarioEvaluation {
    const tpl = templateFor(scenario.scenarioType);
    const checks = tpl?.checks ?? ["no_hallucination", "no_fake_price"];
    const hasCta = output.mode !== "BROWSE" ? true : false; // mode signal
    const menuIntent = resolveMenuIntent(scenario.initialMessage, catalog, {});

    const criticalViolations: string[] = [];
    const disallowedViolations: string[] = [];
    let expectedTotal = 0;
    let expectedMet = 0;

    const meets = (ok: boolean) => { expectedTotal += 1; if (ok) expectedMet += 1; };

    for (const check of checks) {
      switch (check) {
        case "no_hallucination": {
          const bad = output.cards.filter((id) => !catalogIds.has(id));
          if (bad.length > 0) criticalViolations.push(`card(s) fora do catálogo: ${bad.join(", ")}`);
          break;
        }
        case "no_fake_price": {
          // Um garçom honesto SOMA: total do carrinho, "os dois saem por X",
          // "com a sobremesa fica Y". Antes, qualquer valor que não fosse
          // preço exato de item virava CRÍTICO — o checador reprovava o agente
          // justamente nos cenários de pagamento e fechamento, onde dizer o
          // total é o comportamento certo. Agora o valor precisa ser
          // EXPLICÁVEL pelo que está na mesa; o que não fecha continua caindo.
          const defensaveis = valoresDefensaveis({
            precosDoCatalogo: catalog.map((i) => i.price),
            valorDoCarrinho:  output.cartValue ?? 0,
            precosMostrados:  output.cards.map((id) => catalogById.get(id)?.price ?? 0).filter((p) => p > 0),
          });
          for (const m of output.finalMessage.matchAll(PRICE_RE)) {
            const raw = m[1] ?? "";
            if (!raw) continue;
            const val = Number(raw.replace(",", "."));
            if (!precoSeSustenta(val, defensaveis)) {
              criticalViolations.push(`preço inventado: R$ ${raw}`);
            }
          }
          break;
        }
        case "real_cards":
          meets(output.cards.length > 0);
          break;
        case "no_long_dump":
          if (output.cards.length > 6) disallowedViolations.push(`despejo de cardápio (${output.cards.length} cards)`);
          break;
        case "cta":
          meets(output.optionsCount > 0 || /\?/.test(output.finalMessage) || hasCta);
          break;
        case "respects_refusal": {
          const drinkCards = output.cards.filter((id) => catalogById.get(id)?.categoryName === DRINK_CATEGORY);
          if (drinkCards.length > 0) disallowedViolations.push("reinsistiu em bebida após recusa");
          break;
        }
        case "non_existent": {
          // Honest answer = no fabricated cards for an item absent from the menu.
          const fabricated = output.cards.length > 0 && menuIntent.noMatch;
          if (fabricated) criticalViolations.push("mostrou card para item inexistente");
          meets(output.cards.length === 0 || !menuIntent.noMatch);
          break;
        }
        case "vegan_safe": {
          const offending = output.cards.filter((id) => {
            const item = catalogById.get(id);
            const text = `${item?.name ?? ""} ${item?.description ?? ""}`;
            return NON_VEGAN.test(text) && !/vegano/i.test(item?.description ?? "");
          });
          if (offending.length > 0) disallowedViolations.push("ofereceu item não-vegano para cliente vegano");
          break;
        }
        case "payment_guidance":
          meets(/pag|pix|cart[ãa]o|dinheiro|forma/i.test(output.finalMessage) || output.optionsCount > 0);
          break;
        case "checkout_guidance":
          meets(/finaliz|fechar|revis|confirm|carrinho|pedido/i.test(output.finalMessage) || output.optionsCount > 0);
          break;
      }
    }

    return classifyEvaluation({ expectedTotal, expectedMet, disallowedViolations, criticalViolations });
  },

  buildOpportunities(evaluated: EvaluatedScenario): SimulationOpportunity[] {
    const { evaluation, scenario } = evaluated;
    if (evaluation.status === "PASS") return [];

    const tpl = templateFor(scenario.scenarioType);
    const type = evaluation.severity === "P0" ? "BUG" : tpl?.opportunityType ?? "UX_FRICTION";

    const recommendationByType: Record<string, string> = {
      BUG: "Corrigir comportamento crítico (alucinação/produto/preço inválido) antes de qualquer ativação.",
      MISSED_SALE: "Adicionar CTA de próximo passo e sugestão real em respostas consultivas (possível técnica da Library).",
      UX_FRICTION: "Reduzir atrito: mensagem mais curta, menos perguntas, próximo passo claro.",
      POLICY_GAP: "Definir regra clara para este caso (restrição/pagamento) no perfil/políticas do Waiter.",
      PROMPT_GAP: "Ajustar o prompt/diretiva para cobrir este caso.",
      LIBRARY_OPPORTUNITY: "Criar/ativar técnica da Library para resolver este padrão.",
      TRAINING_OPPORTUNITY: "Levar este caso para o Training Center como cenário de treino.",
    };

    return [
      makeOpportunity(evaluated, {
        type,
        severity: evaluation.severity,
        title: `${scenario.scenarioType}: ${evaluation.summary}`,
        summary: `Persona: ${scenario.persona}. Mensagem: "${scenario.initialMessage}". ${evaluation.evidence.join(" ")}`,
        evidence: evaluation.evidence,
        recommendation: recommendationByType[type] ?? "Revisar este caso na curadoria humana.",
        expectedImpact: evaluation.severity === "P0" ? "Evitar erro crítico ao cliente." : "Melhorar conversão/experiência.",
      }),
    ];
  },
};

function templateFor(scenarioType: string): WaiterScenarioTemplate | undefined {
  return WAITER_SCENARIO_TEMPLATES.find((t) => t.scenarioType === scenarioType);
}

/** Re-export for tests that want to assert template coverage. */
export const WAITER_CHECK_KINDS: WaiterCheckKind[] = [
  "no_hallucination", "no_fake_price", "real_cards", "no_long_dump", "cta",
  "respects_refusal", "non_existent", "vegan_safe", "payment_guidance", "checkout_guidance",
];
