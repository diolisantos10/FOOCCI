/**
 * Portões da saúde de canal.
 *
 * Cada regra é testada com as DUAS metades: o caso que deve acender E o caso
 * que deve ficar calado. Um teste que só prova "acende" não impede o defeito
 * real deste módulo, que é acender para quem não deveria — e um aviso que
 * acende à toa é ignorado no primeiro dia.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateInstagramHealth,
  sortChannelHealth,
  humanizeSilence,
  CHANNEL_SILENCE_ATTENTION_MS,
  instagramCardStatus,
  type InstagramHealthInput,
  type InstagramCardStatusInput,
  type IntegrationCardStatus,
} from "../channelHealth";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function input(over: Partial<InstagramHealthInput> = {}): InstagramHealthInput {
  return {
    configured: true,
    enabled: true,
    paused: false,
    mode: "REPLY_ONLY",
    lastError: null,
    lastWebhookAt: new Date(NOW.getTime() - HOUR),
    connectedAt: new Date(NOW.getTime() - 30 * 24 * HOUR),
    now: NOW,
    ...over,
  };
}

const health = (o: Partial<InstagramHealthInput> = {}) =>
  evaluateInstagramHealth(input(o)).filter((i) => i.level !== "info");

describe("canal ausente NÃO é canal caído", () => {
  // ⚠️ Cada caso abaixo usa um estado que ACENDERIA se a guarda caísse (erro
  // registrado, silêncio de 15 dias, RECEIVE_ONLY). Sem isso o teste passaria
  // vazio — provando nada — e foi assim na primeira versão deste arquivo: a
  // sabotagem que apagou as guardas de `configured` e `enabled` passou verde
  // em dois destes portões.
  const LOUD = {
    lastError: "token morto",
    lastWebhookAt: null,
    connectedAt: new Date(NOW.getTime() - 15 * 24 * HOUR),
    mode: "RECEIVE_ONLY",
  } satisfies Partial<InstagramHealthInput>;

  it("o estado LOUD realmente acende quando o canal está ligado (controle do teste)", () => {
    expect(evaluateInstagramHealth(input(LOUD)).length).toBeGreaterThan(0);
  });

  it("cala para restaurante que nunca configurou o Instagram", () => {
    expect(evaluateInstagramHealth(input({ ...LOUD, configured: false }))).toEqual([]);
  });

  it("cala para canal desligado (enabled=false)", () => {
    expect(evaluateInstagramHealth(input({ ...LOUD, enabled: false }))).toEqual([]);
  });

  it("cala para mode DISABLED", () => {
    expect(evaluateInstagramHealth(input({ ...LOUD, mode: "DISABLED" }))).toEqual([]);
  });

  it("cala para canal pausado de propósito pelo lojista", () => {
    expect(evaluateInstagramHealth(input({ ...LOUD, paused: true }))).toEqual([]);
  });

  it("MAS acende para canal ligado e mudo — senão o filtro acima zeraria tudo", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) });
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBe("attention");
  });

  it("um canal desligado com erro registrado continua calado — desligado é desligado", () => {
    expect(evaluateInstagramHealth(input({ enabled: false, lastError: "token morto" }))).toEqual([]);
  });
});

describe("silêncio NUNCA fica vermelho (guardrail 5)", () => {
  it("15 dias sem receber é 'attention', não 'down'", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) });
    expect(items[0]!.level).toBe("attention");
    expect(items.some((i) => i.level === "down")).toBe(false);
  });

  it("um ano sem receber continua sendo 'attention' — silêncio não vira prova", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - 365 * 24 * HOUR) });
    expect(items[0]!.level).toBe("attention");
  });

  it("só um erro registrado produz 'down'", () => {
    const items = health({ lastError: "Sessão expirada." });
    expect(items[0]!.level).toBe("down");
  });

  it("o texto de silêncio traz a ressalva de movimento baixo, para não soar como defeito", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) });
    expect(items[0]!.headline.toLowerCase()).toContain("movimento baixo");
  });

  it("o texto de erro NÃO traz a ressalva — ali é defeito mesmo", () => {
    const items = health({ lastError: "Sessão expirada." });
    expect(items[0]!.headline.toLowerCase()).not.toContain("movimento baixo");
  });
});

describe("o limiar de 48h, dos dois lados", () => {
  it("logo abaixo do limite: nada a dizer", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - (CHANNEL_SILENCE_ATTENTION_MS - HOUR)) });
    expect(items).toEqual([]);
  });

  it("logo acima do limite: acende", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - (CHANNEL_SILENCE_ATTENTION_MS + HOUR)) });
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBe("attention");
  });
});

describe("ausência de informação não é informação (guardrail 1)", () => {
  it("nunca recebeu E não se sabe desde quando: cala, e não diz que está bem", () => {
    const items = evaluateInstagramHealth(input({ lastWebhookAt: null, connectedAt: null }));
    expect(items.filter((i) => i.level !== "info")).toEqual([]);
    // E o que sobra jamais afirma saúde.
    expect(items.some((i) => i.level === "ok" as never)).toBe(false);
  });

  it("conectado há pouco e ainda sem mensagem é normal — cala", () => {
    const items = health({ lastWebhookAt: null, connectedAt: new Date(NOW.getTime() - HOUR) });
    expect(items).toEqual([]);
  });

  it("conectado há muito e nunca recebeu nada: acende em 'attention'", () => {
    const items = health({ lastWebhookAt: null, connectedAt: new Date(NOW.getTime() - 10 * 24 * HOUR) });
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBe("attention");
    expect(items[0]!.headline).toContain("ainda não recebeu");
  });
});

describe("todo aviso carrega o próximo passo", () => {
  it("qualquer item tem ação e link não vazios", () => {
    const cases = [
      input({ lastError: "x" }),
      input({ lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) }),
      input({ mode: "RECEIVE_ONLY" }),
      input({ lastWebhookAt: null, connectedAt: new Date(NOW.getTime() - 10 * 24 * HOUR) }),
    ];
    for (const c of cases) {
      for (const item of evaluateInstagramHealth(c)) {
        expect(item.action.length).toBeGreaterThan(0);
        expect(item.actionHref).toBe("/integracoes/instagram");
        // A ação vira botão ao lado do texto. Acima de ~32 caracteres ela quebra
        // em três linhas a 375px e a faixa come um terço da tela do celular.
        expect(item.action.length).toBeLessThanOrEqual(32);
      }
    }
  });
});

describe("o recado de 'somente recebimento'", () => {
  it("aparece quando o modo é RECEIVE_ONLY e o canal está saudável", () => {
    const items = evaluateInstagramHealth(input({ mode: "RECEIVE_ONLY" }));
    expect(items.some((i) => i.level === "info")).toBe(true);
  });

  it("CALA quando já há problema de saúde — uma faixa por vez, senão come a tela", () => {
    const comErro = evaluateInstagramHealth(input({ mode: "RECEIVE_ONLY", lastError: "token morto" }));
    expect(comErro).toHaveLength(1);
    expect(comErro[0]!.level).toBe("down");

    const mudo = evaluateInstagramHealth(input({ mode: "RECEIVE_ONLY", lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) }));
    expect(mudo).toHaveLength(1);
    expect(mudo[0]!.level).toBe("attention");
  });

  it("NÃO aparece em REPLY_ONLY — senão vira ruído em canal saudável", () => {
    const items = evaluateInstagramHealth(input({ mode: "REPLY_ONLY" }));
    expect(items.some((i) => i.level === "info")).toBe(false);
  });

  it("não acende sozinho para canal desligado", () => {
    expect(evaluateInstagramHealth(input({ mode: "RECEIVE_ONLY", enabled: false }))).toEqual([]);
  });

  it("informa sem alterar: o texto manda ir a Integrações, não promete mudar nada", () => {
    const info = evaluateInstagramHealth(input({ mode: "RECEIVE_ONLY" })).find((i) => i.level === "info")!;
    expect(info.action).toContain("Integrações");
    expect(info.headline).not.toMatch(/ativamos|habilitamos|já foi/i);
  });
});

describe("nenhum segredo vaza pelo item", () => {
  it("o item só carrega campos declarados — nada de token/config crua", () => {
    const item = health({ lastError: "OAuthException" })[0]!;
    expect(Object.keys(item).sort()).toEqual(
      ["action", "actionHref", "channel", "detail", "headline", "label", "lastInboundAt", "level", "silentHours"].sort(),
    );
  });
});

describe("ordenação e formatação", () => {
  it("o que quebrou vem antes do recado (a ordenação segue valendo para outros canais)", () => {
    const mk = (level: "down" | "attention" | "info") => ({
      channel: "INSTAGRAM" as const, label: "Instagram", level,
      headline: "h", action: "a", actionHref: "/integracoes/instagram",
      lastInboundAt: null, silentHours: null,
    });
    const sorted = sortChannelHealth([mk("info"), mk("attention"), mk("down")]);
    expect(sorted.map((i) => i.level)).toEqual(["down", "attention", "info"]);
  });

  it("humanizeSilence usa horas abaixo de 48h e dias acima", () => {
    expect(humanizeSilence(5 * HOUR)).toBe("há 5 horas");
    expect(humanizeSilence(1 * HOUR)).toBe("há 1 hora");
    expect(humanizeSilence(15 * 24 * HOUR)).toBe("há 15 dias");
    expect(humanizeSilence(10 * 60 * 1000)).toBe("há menos de uma hora");
  });

  it("o número de dias aparece no texto — é ele que assusta", () => {
    const items = health({ lastWebhookAt: new Date(NOW.getTime() - 15 * 24 * HOUR) });
    expect(items[0]!.headline).toContain("15 dias");
  });
});

/**
 * O selo do cartão de Integrações, com as duas metades.
 *
 * O defeito original: verde com o canal morto há treze dias. O defeito oposto,
 * que seria pior: âmbar num canal que recebeu há dez minutos.
 */
describe("selo do cartão tem prazo de validade", () => {
  const card = (over: Partial<InstagramCardStatusInput> = {}): IntegrationCardStatus =>
    instagramCardStatus({
      configured: true,
      enabled: true,
      paused: false,
      mode: "RECEIVE_ONLY",
      lastError: null,
      lastWebhookAt: new Date(NOW.getTime() - HOUR),
      tokenConfigured: true,
      hasAccountIds: true,
      now: NOW,
      ...over,
    });

  it("recebeu há uma hora → verde", () => {
    expect(card()).toBe("active");
  });

  it("recebeu há 13 dias → NÃO é verde", () => {
    const s = card({ lastWebhookAt: new Date(NOW.getTime() - 13 * 24 * HOUR) });
    expect(s).not.toBe("active");
    expect(s).toBe("attention");
  });

  it("silêncio NÃO vira 'error' — atenção e quebrado são coisas diferentes", () => {
    expect(card({ lastWebhookAt: new Date(NOW.getTime() - 400 * 24 * HOUR) })).toBe("attention");
  });

  it("erro registrado → 'error', e ele ganha de tudo", () => {
    expect(card({ lastError: "OAuthException" })).toBe("error");
    expect(card({ lastError: "OAuthException", lastWebhookAt: new Date(NOW.getTime() - HOUR) })).toBe("error");
  });

  it("as duas beiras do limite de 48h", () => {
    expect(card({ lastWebhookAt: new Date(NOW.getTime() - (CHANNEL_SILENCE_ATTENTION_MS - HOUR)) })).toBe("active");
    expect(card({ lastWebhookAt: new Date(NOW.getTime() - (CHANNEL_SILENCE_ATTENTION_MS + HOUR)) })).toBe("attention");
  });

  it("nunca recebeu nada continua 'pending_validation' — não inventa atenção", () => {
    expect(card({ lastWebhookAt: null })).toBe("pending_validation");
  });

  it("pausado e desconfigurado seguem como eram — nada disto regrediu", () => {
    expect(card({ paused: true })).toBe("configured");
    expect(card({ configured: false })).toBe("unconfigured");
    expect(card({ enabled: false })).toBe("configured");
    expect(card({ enabled: false, tokenConfigured: false, hasAccountIds: false })).toBe("unconfigured");
  });
});
