/**
 * Portão do RODÍZIO DE CATÁLOGO — o que destrava o agente de CRM.
 *
 * O defeito: `buildReadyMadeCampaignPayload` nunca semeou `messagePool`, então
 * `resolveActivePhrases` caía no fallback de frase única. Com UMA frase, o seletor
 * por conversão não liga (`selectorPool.length > 1` no runner) e as 5 redações
 * aprovadas de cada template ficavam paradas no código. O agente rodava em WIDE
 * com um baralho de uma carta.
 *
 * As duas metades:
 *  • METADE 1 (prova) — campanha pronta sem pool roda as 5, e o seletor liga.
 *  • METADE 2 (os limites) — mensagem EDITADA pelo lojista continua rodando só a
 *    dele; escolha explícita no pool continua mandando; com 1 frase o seletor
 *    continua caindo no sorteio sem quebrar.
 *
 * Puro: nada é enviado, nada toca banco.
 */

import { describe, it, expect } from "vitest";
import {
  resolveActivePhrases,
  catalogRotation,
  parseMessagePool,
  phraseKey,
} from "@/services/crm/crmMessagePool";
import {
  READY_MADE_MESSAGE_VARIANTS,
  getReadyMadeMessageVariants,
} from "@/services/crm/readyMadeCampaigns";
import { selectPhraseWeights } from "@/services/crm/CrmPhraseSelector";
import { missingSocialVariables } from "@/services/crm/renderCrmMessage";
import { KNOWN_CRM_VARIABLES, renderCrmMessage } from "@/services/crm/renderCrmMessage";

const TEMPLATE = "reativar-mornos";
const VARIANTES = READY_MADE_MESSAGE_VARIANTS[TEMPLATE]!;

/** Campanha pronta recém-ativada: mensagem = a do catálogo, nenhum pool salvo. */
const campanhaPronta = { templateId: TEMPLATE, message: VARIANTES[0]! };

describe("rodízio de catálogo — a campanha pronta deixa de rodar com uma frase só", () => {
  // ── METADE 1 — a prova ─────────────────────────────────────────────────────

  it("campanha pronta SEM pool roda as 5 variantes, não 1", () => {
    const frases = resolveActivePhrases(campanhaPronta, null);
    expect(frases).toHaveLength(5);
    expect(frases.every((p) => p.source === "catalog")).toBe(true);
    expect(new Set(frases.map((p) => p.key)).size).toBe(5);
  });

  it("O PORTÃO DO > 1: com 5 frases o seletor por conversão LIGA e diferencia pesos", () => {
    const frases = resolveActivePhrases(campanhaPronta, null);
    expect(frases.length).toBeGreaterThan(1); // ← a condição do runner

    // Baseline juntado (>100 envios na campanha): o seletor sai de EXPLORING.
    const stats = frases.map((p, i) => ({ key: p.key, sent: 40, converted: i === 0 ? 20 : 2 }));
    const sel = selectPhraseWeights(frases.map((p) => p.key), stats);

    expect(sel.mode).toBe("OPTIMIZING");
    const vencedora = sel.weights.find((w) => w.key === frases[0]!.key)!;
    const perdedora = sel.weights.find((w) => w.key === frases[1]!.key)!;
    expect(vencedora.weight).toBeGreaterThan(perdedora.weight);
    // Piso de exploração: ninguém morre sem chance.
    expect(Math.min(...sel.weights.map((w) => w.weight))).toBeGreaterThan(0);
  });

  it("vale para TODOS os 16 templates do catálogo — 5 frases distintas cada", () => {
    for (const [id, variantes] of Object.entries(READY_MADE_MESSAGE_VARIANTS)) {
      const frases = resolveActivePhrases({ templateId: id, message: variantes[0]! }, null);
      expect(frases.length, `template ${id}`).toBe(5);
      expect(new Set(frases.map((p) => p.key)).size, `template ${id} (chaves distintas)`).toBe(5);
    }
  });

  it("as 5 de cada template são as APROVADAS: sem placeholder desconhecido e sem estouro da Meta", () => {
    const LIMITE_BODY_META = 1024;
    const cliente = { name: "Maria Aparecida de Souza", tier: "DIAMANTE", lastOrderAt: "2025-01-01T00:00:00Z", id: "cmsdtgcmu0000mcio2saj2hu9" };
    const ctx = {
      restaurantName: "Restaurante Sabor da Vila Mariana",
      pedidoUrl: "https://foocci.com.br/restaurante-sabor-da-vila-mariana",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJ0000000000000000000",
      instagramUrl: "restaurantesabordavilamariana",
      tiktokUrl: "restaurantesabordavilamariana",
      facebookUrl: "restaurantesabordavilamariana",
      youtubeUrl: "restaurantesabordavilamariana",
      coupon: { type: "CUSTOM" as const, value: 0, description: "sobremesa grátis + 30% de desconto", validityDays: 30 },
      nextTierLabel: "Diamante",
      nextTierMissing: 1250,
    };

    for (const [id, variantes] of Object.entries(READY_MADE_MESSAGE_VARIANTS)) {
      expect(variantes.length, `template ${id}`).toBe(5);
      for (const [i, texto] of variantes.entries()) {
        const saida = renderCrmMessage(texto, cliente, ctx);
        // Nenhuma chave sobrando: toda variável usada é conhecida pelo renderizador.
        expect(saida, `${id}[${i}] deixou chave sem resolver`).not.toMatch(/\{\{?\s*[\w.]+\s*\}?\}/);
        expect(saida.length, `${id}[${i}] estourou o corpo da Meta`).toBeLessThanOrEqual(LIMITE_BODY_META);
        expect(saida.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("toda variável usada pelo catálogo está na lista que o renderizador conhece", () => {
    const usadas = new Set<string>();
    for (const variantes of Object.values(READY_MADE_MESSAGE_VARIANTS)) {
      for (const t of variantes) {
        for (const m of t.matchAll(/\{\{?\s*([\w.]+)\s*\}?\}/g)) usadas.add(m[1]!);
      }
    }
    const desconhecidas = [...usadas].filter((v) => !(KNOWN_CRM_VARIABLES as readonly string[]).includes(v));
    expect(desconhecidas).toEqual([]);
  });

  // ── METADE 2 — os limites: onde o rodízio NÃO entra ────────────────────────

  it("mensagem EDITADA pelo lojista manda: continua rodando só a dele", () => {
    const editada = { templateId: TEMPLATE, message: "Oi! Texto que EU escrevi, do meu jeito." };
    const frases = resolveActivePhrases(editada, null);

    expect(frases).toHaveLength(1);
    expect(frases[0]!.source).toBe("fallback");
    expect(frases[0]!.text).toContain("do meu jeito");
    expect(catalogRotation(editada)).toEqual([]);
  });

  it("escolha explícita no pool continua mandando — 1 marcada = 1 rodando", () => {
    const pool = parseMessagePool({ messagePool: { selected: [phraseKey(VARIANTES[2]!)] } });
    const frases = resolveActivePhrases(campanhaPronta, pool);

    expect(frases).toHaveLength(1);
    expect(frases[0]!.key).toBe(phraseKey(VARIANTES[2]!));
  });

  it("com 1 frase o seletor NÃO quebra — cai no sorteio, como sempre foi", () => {
    const editada = { templateId: TEMPLATE, message: "Texto único do lojista." };
    const frases = resolveActivePhrases(editada, null);
    expect(frases).toHaveLength(1);

    const sel = selectPhraseWeights(frases.map((p) => p.key), [{ key: frases[0]!.key, sent: 500, converted: 300 }]);
    expect(sel.mode).toBe("EXPLORING");
    expect(sel.weights).toHaveLength(1);
    expect(sel.weights[0]!.weight).toBe(1);
  });

  it("campanha sem templateId (custom do lojista) não ganha catálogo nenhum", () => {
    const custom = { templateId: null, message: "Campanha avulsa criada na mão." };
    expect(catalogRotation(custom)).toEqual([]);
    expect(resolveActivePhrases(custom, null)).toHaveLength(1);
  });

  it("template com uma variante só não vira rodízio artificial", () => {
    expect(getReadyMadeMessageVariants("template-que-nao-existe")).toEqual([]);
    expect(catalogRotation({ templateId: "template-que-nao-existe", message: "oi" })).toEqual([]);
  });

  // ── A rede que o restaurante não tem ───────────────────────────────────────

  it("TRAVA DA REDE: variante de TikTok some do rodízio de quem só tem Instagram", () => {
    const soInstagram = {
      restaurantName: "X", pedidoUrl: "https://foocci.com.br/x",
      instagramUrl: "xrestaurante", tiktokUrl: null, facebookUrl: null, youtubeUrl: null,
    };
    const frases = resolveActivePhrases({ templateId: "siga-redes", message: READY_MADE_MESSAGE_VARIANTS["siga-redes"]![0]! }, null);
    expect(frases).toHaveLength(5);

    const enviaveis = frases.filter((p) => missingSocialVariables(p.text, soInstagram).length === 0);
    // 3 das 5 pedem TikTok ou Facebook — saem do rodízio em vez de sair sem link.
    expect(enviaveis).toHaveLength(2);
    expect(enviaveis.length).toBeGreaterThan(0); // nunca esvazia
  });

  it("com todas as redes cadastradas, nenhuma variante é descartada", () => {
    const todas = {
      restaurantName: "X", pedidoUrl: "https://foocci.com.br/x",
      instagramUrl: "x", tiktokUrl: "x", facebookUrl: "x", youtubeUrl: "x",
    };
    const frases = resolveActivePhrases({ templateId: "siga-redes", message: READY_MADE_MESSAGE_VARIANTS["siga-redes"]![0]! }, null);
    expect(frases.filter((p) => missingSocialVariables(p.text, todas).length === 0)).toHaveLength(5);
  });

  it("a trava só olha rede social — não descarta frase por cupom ou nível", () => {
    const semRede = { restaurantName: "X", pedidoUrl: "https://foocci.com.br/x", instagramUrl: null, tiktokUrl: null, facebookUrl: null, youtubeUrl: null };
    for (const texto of READY_MADE_MESSAGE_VARIANTS["clientes-vip"]!) {
      expect(missingSocialVariables(texto, semRede)).toEqual([]);
    }
  });
});
