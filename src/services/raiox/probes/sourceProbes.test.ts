/**
 * As duas metades de cada sonda de código.
 *
 * Metade 1: a sonda ACHA o problema quando ele existe.
 * Metade 2: a sonda NÃO INVENTA problema quando ele não existe.
 *
 * A segunda metade é a que faz o instrumento valer alguma coisa. Varredura que
 * só foi vista achando coisa é indistinguível de varredura que alarma sempre —
 * e a que alarma sempre é desligada na primeira semana.
 */

import { describe, it, expect } from "vitest";
import { available, unavailable, type RaioXSample, type SourceSample } from "../types";
import {
  portaAbertaProbe,
  idSemDonoProbe,
  seloVazioProbe,
  estadoMortoProbe,
  loopSemTetoProbe,
} from "./sourceProbes";

const CLEAN: SourceSample = {
  root: "/repo",
  filesScanned: 1200,
  paidCallFiles: ["src/services/brain/engines/OpenAIEngineAdapter.ts"],
  publicPaidRoutes: [],
  publicRoutesTotal: 260,
  unscopedIdRoutes: [],
  routesWithIdIntakeTotal: 70,
  hollowChecks: [],
  deadStateFields: [],
  schemaFieldsChecked: 780,
  unboundedLoops: [],
};

function sampleWith(source: Partial<SourceSample>): RaioXSample {
  return {
    collectedAt: new Date("2026-08-05T06:00:00Z"),
    ai: unavailable("não usado neste teste"),
    messages: unavailable("não usado neste teste"),
    print: unavailable("não usado neste teste"),
    carts: unavailable("não usado neste teste"),
    billing: unavailable("não usado neste teste"),
    gates: unavailable("não usado neste teste"),
    brain: unavailable("não usado neste teste"),
    jobs: unavailable("não usado neste teste"),
    data: unavailable("não usado neste teste"),
    business: unavailable("não usado neste teste"),
    source: available({ ...CLEAN, ...source }),
  };
}

const ctx = { runId: "t", now: new Date("2026-08-05T06:00:00Z") };

// ── porta aberta ──────────────────────────────────────────────────────────────

describe("porta-aberta", () => {
  it("ACHA: rota pública sem nenhuma prova que alcança chamada paga vira P0", () => {
    const [f] = portaAbertaProbe.run(
      sampleWith({
        publicPaidRoutes: [
          {
            route: "/api/gerar-imagem",
            file: "src/app/api/gerar-imagem/route.ts",
            pathToCost: ["src/app/api/gerar-imagem/route.ts", "src/services/img/openai.ts"],
            guards: [],
          },
        ],
      }),
      ctx,
    );
    expect(f.severity).toBe("P0");
    expect(f.status).toBe("FAIL");
    // a evidência precisa carregar o caso concreto, não só a contagem
    expect(f.evidence[0]).toContain("/api/gerar-imagem");
    expect(f.evidence[0]).toContain("src/services/img/openai.ts");
  });

  it("NÃO INVENTA: rota pública COM segredo de admin não vira achado", () => {
    const [f] = portaAbertaProbe.run(
      sampleWith({
        publicPaidRoutes: [
          {
            route: "/api/admin/treino",
            file: "src/app/api/admin/treino/route.ts",
            pathToCost: ["a", "b"],
            guards: ["segredo de admin"],
          },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("PASS");
    expect(f.severity).toBe("INFO");
  });

  it("faixa intermediária: loja aberta (só escopo de slug) é WARNING, não P0", () => {
    const [f] = portaAbertaProbe.run(
      sampleWith({
        publicPaidRoutes: [
          {
            route: "/api/pedido/[slug]",
            file: "src/app/api/pedido/[slug]/route.ts",
            pathToCost: ["a", "b"],
            guards: ["escopo derivado do slug público (loja aberta)"],
          },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("WARNING");
    expect(f.severity).toBe("P2");
  });
});

// ── id sem dono ───────────────────────────────────────────────────────────────

describe("id-sem-dono", () => {
  it("ACHA: rota que recebe restaurantId sem prova de posse", () => {
    const [f] = idSemDonoProbe.run(
      sampleWith({
        unscopedIdRoutes: [
          {
            file: "src/app/api/relatorio/route.ts",
            route: "/api/relatorio",
            intake: [{ line: 12, snippet: 'searchParams.get("restaurantId")' }],
            ownershipProofs: [],
          },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("FAIL");
    expect(f.evidence.join(" ")).toContain("src/app/api/relatorio/route.ts:12");
  });

  it("NÃO INVENTA: nenhuma rota suspeita ⇒ PASS com o denominador à vista", () => {
    const [f] = idSemDonoProbe.run(sampleWith({}), ctx);
    expect(f.status).toBe("PASS");
    expect(f.metrics.rotasQueRecebemId).toBe(70);
  });

  it("faixa intermediária: id-como-senha com justificativa escrita cai para P2", () => {
    const [f] = idSemDonoProbe.run(
      sampleWith({
        unscopedIdRoutes: [
          {
            file: "src/app/api/pedido/order-status/route.ts",
            route: "/api/pedido/order-status",
            intake: [{ line: 29, snippet: 'searchParams.get("orderId")' }],
            ownershipProofs: ["id tratado como senha, com a decisão escrita no arquivo (revisar)"],
          },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("WARNING");
    expect(f.severity).toBe("P2");
  });
});

// ── selo vazio ────────────────────────────────────────────────────────────────

describe("selo-vazio", () => {
  it("ACHA: veredito escrito como literal vira achado com arquivo:linha", () => {
    const [f] = seloVazioProbe.run(
      sampleWith({
        hollowChecks: [
          {
            file: "src/services/x/Gate.ts",
            line: 98,
            field: "approved",
            snippet: 'return { approved: true, mode: "SKIPPED" }',
            enclosing: "judgeReply",
          },
        ],
      }),
      ctx,
    );
    expect(f.severity).toBe("P1");
    expect(f.evidence[0]).toContain("src/services/x/Gate.ts:98");
    expect(f.evidence[0]).toContain("judgeReply");
  });

  it("NÃO INVENTA: sem literais de veredito ⇒ PASS", () => {
    const [f] = seloVazioProbe.run(sampleWith({}), ctx);
    expect(f.status).toBe("PASS");
    expect(f.metrics.vereditosLiterais).toBe(0);
  });
});

// ── estado morto ──────────────────────────────────────────────────────────────

describe("estado-morto", () => {
  it("ACHA: campo escrito e nunca lido, com os locais de escrita", () => {
    const [f] = estadoMortoProbe.run(
      sampleWith({
        deadStateFields: [
          { model: "Payment", field: "cardLast4", writes: [{ file: "src/services/pay.ts", line: 90 }], reads: 0 },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("WARNING");
    expect(f.evidence[0]).toContain("Payment.cardLast4");
    expect(f.evidence[0]).toContain("src/services/pay.ts:90");
  });

  it("NÃO INVENTA: nenhum campo morto ⇒ PASS citando quantos foram avaliados", () => {
    const [f] = estadoMortoProbe.run(sampleWith({}), ctx);
    expect(f.status).toBe("PASS");
    expect(f.summary).toContain("780");
  });
});

// ── loop sem teto ─────────────────────────────────────────────────────────────

describe("loop-sem-teto", () => {
  it("ACHA: laço sem parada em arquivo que gasta por chamada sobe para P1/FAIL", () => {
    const [f] = loopSemTetoProbe.run(
      sampleWith({
        unboundedLoops: [
          { file: "src/services/img/retry.ts", line: 40, kind: "laço infinito", snippet: "while (true) {", reachesPaidCall: true },
        ],
      }),
      ctx,
    );
    expect(f.status).toBe("FAIL");
    expect(f.severity).toBe("P1");
    expect(f.evidence[0]).toContain("alcança chamada paga");
  });

  it("gradação: laço sem custo pago fica em P2", () => {
    const [f] = loopSemTetoProbe.run(
      sampleWith({
        unboundedLoops: [
          { file: "src/lib/poll.ts", line: 10, kind: "laço infinito", snippet: "while (true) {", reachesPaidCall: false },
        ],
      }),
      ctx,
    );
    expect(f.severity).toBe("P2");
  });

  it("NÃO INVENTA: sem laços ⇒ PASS", () => {
    const [f] = loopSemTetoProbe.run(sampleWith({}), ctx);
    expect(f.status).toBe("PASS");
  });
});

// ── ausência de dado ──────────────────────────────────────────────────────────

describe("bloco indisponível", () => {
  it("sonda não devolve PASS quando a varredura não rodou — ela interrompe", () => {
    const sample = { ...sampleWith({}), source: unavailable<SourceSample>("src/ não existe na imagem") };
    // Quem transforma isso em UNKNOWN é o orquestrador; aqui prova-se que a
    // sonda NÃO segue em frente inventando zeros.
    expect(() => portaAbertaProbe.run(sample, ctx)).toThrowError(/src\/ não existe/);
  });
});
