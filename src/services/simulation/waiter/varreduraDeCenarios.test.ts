/**
 * Varredura: nenhuma frase de nenhum cenário produz P0 no motor determinístico.
 *
 * O cron das 6h roda 12 cenários sorteados. Quando um P0 aparecia, quem
 * descobria era o e-mail da madrugada — e só naquele sorteio, com aquela frase.
 * Foi assim com "vocês têm pizza?": o defeito estava no código havia tempo e só
 * apareceu no dia em que o sorteio calhou de pegar aquela mensagem.
 *
 * O espaço determinístico é pequeno e fechado: `runScenario` só depende da
 * mensagem do template e de `seedMainInCart`. Persona e constraints não entram
 * na decisão. Então dá para varrer TUDO em milissegundos, e é isso que este
 * teste faz — o que o cron amostra por sorteio, o CI cobre por inteiro.
 *
 * O corte é em P0. P1 e P2 são acompanhados pela rodada noturna e pela curadoria
 * humana; travar o CI neles pararia a fila por questão de gosto comercial. P0 é
 * outra coisa: é o agente mentindo para o cliente, e disso ninguém fica sabendo
 * depois.
 */

import { describe, it, expect } from "vitest";

import { WaiterSimulationAdapter } from "./WaiterSimulationAdapter";
import { WAITER_SCENARIO_TEMPLATES } from "./waiterScenarioTemplates";
import type { SimulationScenario } from "../types";

function cenarioDe(tpl: (typeof WAITER_SCENARIO_TEMPLATES)[number], mensagem: string): SimulationScenario {
  return {
    scenarioKey:         `${tpl.scenarioType}_varredura`,
    scenarioType:        tpl.scenarioType,
    persona:             tpl.personas[0]!,
    customerGoal:        tpl.goal,
    customerConstraints: tpl.constraintsPool[0] ?? {},
    initialMessage:      mensagem,
    expectedBehaviors:   tpl.expectedBehaviors,
    disallowedBehaviors: tpl.disallowedBehaviors,
  };
}

describe("varredura de todos os cenários do Garçom", () => {
  it("nenhuma mensagem de nenhum cenário chega a P0", async () => {
    const criticos: string[] = [];

    for (const tpl of WAITER_SCENARIO_TEMPLATES) {
      for (const mensagem of tpl.messages) {
        const cenario = cenarioDe(tpl, mensagem);
        const saida = await WaiterSimulationAdapter.runScenario(cenario);
        const nota = WaiterSimulationAdapter.evaluateScenario(cenario, saida);
        if (nota.severity === "P0") {
          criticos.push(
            `${tpl.scenarioType} — cliente: "${mensagem}" | agente: "${saida.finalMessage}" ` +
            `| cards: [${saida.cards.join(", ")}] | ${nota.evidence.join(" | ")}`,
          );
        }
      }
    }

    expect(criticos, `\n${criticos.join("\n")}\n`).toEqual([]);
  });

  it("a varredura cobre o cenário que originou o P0", () => {
    const tpl = WAITER_SCENARIO_TEMPLATES.find((t) => t.scenarioType === "NON_EXISTENT_PRODUCT");
    expect(tpl?.messages).toContain("vocês têm pizza?");
  });

  it("todo cenário tem frase para varrer — template mudo passaria batido", () => {
    for (const tpl of WAITER_SCENARIO_TEMPLATES) {
      expect(tpl.messages.length, tpl.scenarioType).toBeGreaterThan(0);
    }
  });
});
