import { describe, it, expect } from "vitest";
import {
  toClientPortalView,
  findInternalLeak,
  assertNoInternalLeak,
  emptyAgencyClientView,
  INTERNAL_ONLY_KEYS,
  type AgencyClientView,
} from "./views";

function fullInternalView(): AgencyClientView {
  const base = emptyAgencyClientView({
    id: "r1",
    name: "Foocci",
    initial: "F",
    category: "FoodTech",
    activeSince: "2026-08-01T00:00:00.000Z",
    isActive: true,
  });
  return {
    ...base,
    projects: [
      {
        id: "p1",
        name: "Lançamento",
        kind: "Lançamento",
        progress: 40,
        statusLabel: "Ativo",
        agents: ["Agente Social Media"],
        deliverableCount: 2,
        decisionCount: 1,
      },
    ],
    requests: [
      {
        id: "q1",
        code: "#REQ-1",
        title: "Campanha",
        routedTo: "Agente Social Media",
        statusLabel: "Em triagem",
        when: "hoje",
        priority: "high",
      },
    ],
    internal: {
      cost:          [{ label: "Custo do atendimento", value: "R$ 1.000" }],
      margin:        [{ label: "Margem", value: "38%" }],
      prompts:       [{ agent: "Agente Design", prompt: "Você é..." }],
      logs:          [{ at: "09:00", line: "run ok" }],
      internalTasks: [{ id: "t1", title: "Revisar peça", owner: "Ana", state: "aberta" }],
      cascade:       [{ requestId: "q1", chain: ["PM", "Branding", "Design"] }],
    },
  };
}

describe("fronteira agência × portal do cliente", () => {
  it("o seletor não deixa passar NENHUMA chave interna", () => {
    const portal = toClientPortalView(fullInternalView());
    expect(findInternalLeak(portal)).toBeNull();
    for (const key of INTERNAL_ONLY_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(portal, key)).toBe(false);
    }
  });

  it("preserva o que o cliente TEM direito de ver", () => {
    const portal = toClientPortalView(fullInternalView());
    expect(portal.client.name).toBe("Foocci");
    expect(portal.projects).toHaveLength(1);
    expect(portal.requests[0].code).toBe("#REQ-1");
  });

  it("a varredura encontra vazamento aninhado e diz ONDE", () => {
    const leaky = { client: { name: "x" }, projects: [{ id: "p", cascade: ["a"] }] };
    expect(findInternalLeak(leaky)).toBe("$.projects[0].cascade");
  });

  it("cada chave interna, sozinha, é detectada", () => {
    for (const key of INTERNAL_ONLY_KEYS) {
      expect(findInternalLeak({ a: { b: { [key]: 1 } } })).toBe(`$.a.b.${key}`);
    }
  });

  it("assertNoInternalLeak explode com a evidência no texto", () => {
    const bad = { chat: [{ id: "1", logs: [] }] } as never;
    expect(() => assertNoInternalLeak(bad)).toThrow(/\$\.chat\[0\]\.logs/);
  });

  it("a vista vazia é vazia de verdade — nada de número inventado", () => {
    const v = emptyAgencyClientView({
      id: "r1",
      name: "Novo",
      initial: "N",
      category: null,
      activeSince: null,
      isActive: true,
    });
    expect(v.results).toEqual([]);
    expect(v.brand.health).toBeNull();
    expect(v.projects).toEqual([]);
    expect(findInternalLeak(toClientPortalView(v))).toBeNull();
  });
});
