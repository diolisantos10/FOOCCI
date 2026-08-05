/**
 * Categorias de upsell do fechamento = CONFIGURAÇÃO DO RESTAURANTE.
 *
 * O caso real que motivou tudo: a **Foocci Bakery** não tem "sobremesa" — tem
 * **Confeitaria**. Enquanto a sequência do fechamento era constante no código
 * (regex de "bebida" e "sobremesa"), a segunda etapa não casava com nada na
 * padaria e o Garçom simplesmente **não fazia o upsell**. Dinheiro deixado na
 * mesa em todo pedido, e nenhum alarme — o silêncio parecia sucesso.
 *
 * METADE destes testes prova que o LEGÍTIMO PASSA:
 *   - restaurante sem configuração continua com o fechamento de hoje, com as
 *     MESMAS frases e os MESMOS cards;
 *   - restaurante configurado oferece na ordem dele;
 *   - o cliente que já tem a categoria no carrinho não é importunado.
 * A outra metade prova que o perigoso NÃO passa: oferta em loop, oferta de
 * categoria apagada, oferta depois da recusa.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { decide, createWaiterMemory, type V2CatalogItem, type WaiterMemory } from "../WaiterBrainV2";
import { buildWaiterProfileDirective, UPSELL_RULES } from "../waiter/WaiterAgentProfile";
import {
  resolveUpsellSequence,
  normalizeCategoryKey,
  sanitizeUpsellCategories,
  upsellCategoryLabels,
  MAX_UPSELL_CATEGORIES,
} from "../waiter/upsellCategories";
import { BAKERY_MENU, BAKERY_UPSELL_CATEGORIES } from "@/services/demo/foocci-bakery.data";

// ── Cardápio de padaria: o caso real. Não existe "Sobremesas". ────────────────
const PADARIA: V2CatalogItem[] = [
  { id: "pao-frances", name: "Pão Francês",     categoryName: "Padaria",        price: 1.4,  sortOrder: 1 },
  { id: "pao-queijo",  name: "Pão de Queijo",   categoryName: "Padaria",        price: 6.9,  sortOrder: 2 },
  { id: "coxinha",     name: "Coxinha",         categoryName: "Salgados",       price: 9.9,  sortOrder: 3 },
  { id: "cafe",        name: "Café Coado",      categoryName: "Café & Bebidas", price: 6.0,  sortOrder: 10 },
  { id: "capuccino",   name: "Cappuccino",      categoryName: "Café & Bebidas", price: 12.0, sortOrder: 11 },
  { id: "bolo-fuba",   name: "Bolo de Fubá",    categoryName: "Confeitaria",    price: 14.0, sortOrder: 20 },
  { id: "torta-limao", name: "Torta de Limão",  categoryName: "Confeitaria",    price: 18.0, sortOrder: 21 },
];

// ── Cardápio clássico: bebida + sobremesa nomeadas do jeito que a regex espera ─
const CLASSICO: V2CatalogItem[] = [
  { id: "pizza",  name: "Pizza Calabresa", categoryName: "Pizzas",     price: 55, sortOrder: 1 },
  { id: "coca",   name: "Coca-Cola",       categoryName: "Bebidas",    price: 8,  sortOrder: 10 },
  { id: "suco",   name: "Suco de Laranja", categoryName: "Bebidas",    price: 12, sortOrder: 11 },
  { id: "gateau", name: "Petit Gateau",    categoryName: "Sobremesas", price: 24, sortOrder: 20 },
];

const checkout = (over: {
  catalog: V2CatalogItem[];
  cartItemIds: string[];
  memory?: WaiterMemory;
  upsellCategories?: readonly string[] | null;
}) =>
  decide({
    event:       "ON_CHECKOUT_STARTED",
    cartValue:   50,
    ...over,
  });

const BAKERY_CFG = ["Café & Bebidas", "Confeitaria"];

/** Aplica o memoryPatch como o cliente web faz, para encadear turnos. */
function apply(mem: WaiterMemory, patch: Partial<WaiterMemory> | undefined): WaiterMemory {
  return { ...mem, ...(patch ?? {}) };
}

// ═══════════════════════════════════════════════════════════════════════════
// (b) SEM CONFIGURAÇÃO = COMPORTAMENTO DE HOJE. Ninguém regride.
// ═══════════════════════════════════════════════════════════════════════════
describe("b) restaurante sem configuração mantém o fechamento de hoje", () => {
  it("primeiro passo continua sendo bebida, com a frase idêntica à de antes", () => {
    const out = checkout({ catalog: CLASSICO, cartItemIds: ["pizza"] });
    expect(out.mode).toBe("INTERVENTION");
    expect(out.message).toBe("Antes de fechar, deixe-me apresentar nossas bebidas.");
    expect(out.cards).toEqual(["coca", "suco"]);
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("drink_shown");
  });

  it("segundo passo continua sendo sobremesa, com a frase idêntica à de antes", () => {
    const mem = { ...createWaiterMemory(), checkoutUpsellStage: "drink_shown" as const };
    const out = checkout({ catalog: CLASSICO, cartItemIds: ["pizza"], memory: mem });
    expect(out.message).toBe("Temos também deliciosas sobremesas para completar seu pedido.");
    expect(out.cards).toEqual(["gateau"]);
    expect(out.memoryPatch?.checkoutUpsellStage).toBe("dessert_shown");
  });

  it("lista vazia é tratada como 'use o padrão', nunca como 'não ofereça nada'", () => {
    const out = checkout({ catalog: CLASSICO, cartItemIds: ["pizza"], upsellCategories: [] });
    expect(out.message).toBe("Antes de fechar, deixe-me apresentar nossas bebidas.");
    expect(out.cards.length).toBeGreaterThan(0);
  });

  it("null (falha de leitura da config) também cai no padrão — banco fora do ar não desliga o upsell", () => {
    const out = checkout({ catalog: CLASSICO, cartItemIds: ["pizza"], upsellCategories: null });
    expect(out.cards).toEqual(["coca", "suco"]);
  });

  it("bebida já no carrinho → pula direto para sobremesa (comportamento de hoje)", () => {
    const out = checkout({ catalog: CLASSICO, cartItemIds: ["pizza", "coca"] });
    expect(out.message).toBe("Temos também deliciosas sobremesas para completar seu pedido.");
  });

  it("a PADARIA sem configuração NÃO ganha o passo de Confeitaria — é o bug de origem, e ele fica documentado", () => {
    const mem = { ...createWaiterMemory(), checkoutUpsellStage: "drink_shown" as const };
    const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem });
    // "Confeitaria" não casa com nenhuma palavra de sobremesa: sem config, nada é oferecido.
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.cards).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) UPSELL NA ORDEM CONFIGURADA
// ═══════════════════════════════════════════════════════════════════════════
describe("a) upsell na ordem configurada pelo lojista", () => {
  it("Foocci Bakery: passo 1 = Café & Bebidas, com TODOS os cards da categoria", () => {
    const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], upsellCategories: BAKERY_CFG });
    expect(out.mode).toBe("INTERVENTION");
    expect(out.message).toContain("Café & Bebidas");
    expect(out.cards).toEqual(["cafe", "capuccino"]);
    expect(out.memoryPatch?.checkoutUpsellOffered).toEqual(["cat:cafe bebidas"]);
  });

  it("Foocci Bakery: passo 2 = Confeitaria — o upsell que antes não existia", () => {
    let mem = createWaiterMemory();
    const t1 = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    mem = apply(mem, t1.memoryPatch);

    const t2 = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    expect(t2.mode).toBe("INTERVENTION");
    expect(t2.message).toContain("Confeitaria");
    expect(t2.cards).toEqual(["bolo-fuba", "torta-limao"]);
  });

  it("a ORDEM é a do lojista: invertida, Confeitaria vem primeiro", () => {
    const out = checkout({
      catalog: PADARIA, cartItemIds: ["pao-frances"],
      upsellCategories: ["Confeitaria", "Café & Bebidas"],
    });
    expect(out.message).toContain("Confeitaria");
    expect(out.cards).toEqual(["bolo-fuba", "torta-limao"]);
  });

  it("configuração vence o padrão: com config, categoria fora da lista não é oferecida no fechamento", () => {
    // Só Confeitaria configurada — bebidas existem no cardápio mas NÃO entram.
    const out = checkout({
      catalog: PADARIA, cartItemIds: ["pao-frances"],
      upsellCategories: ["Confeitaria"],
    });
    expect(out.cards).toEqual(["bolo-fuba", "torta-limao"]);
    expect(out.cards).not.toContain("cafe");
  });

  it("categoria já no carrinho é pulada — não se oferece o que o cliente já pediu", () => {
    const out = checkout({
      catalog: PADARIA, cartItemIds: ["pao-frances", "cafe"],
      upsellCategories: BAKERY_CFG,
    });
    expect(out.message).toContain("Confeitaria");
  });

  it("sequência de 3 categorias percorre as três, uma por turno, e então encerra", () => {
    const cfg = ["Café & Bebidas", "Confeitaria", "Salgados"];
    let mem = createWaiterMemory();
    const vistos: string[] = [];
    for (let i = 0; i < 4; i++) {
      const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: cfg });
      mem = apply(mem, out.memoryPatch);
      if (out.mode === "INTERVENTION") vistos.push(out.cards[0]!);
    }
    expect(vistos).toEqual(["cafe", "bolo-fuba", "coxinha"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) CATEGORIA CONFIGURADA E DEPOIS APAGADA
// ═══════════════════════════════════════════════════════════════════════════
describe("c) categoria configurada e depois apagada do cardápio", () => {
  const SEM_CONFEITARIA = PADARIA.filter((i) => i.categoryName !== "Confeitaria");

  it("não quebra o fechamento e não gera oferta fantasma", () => {
    let mem = createWaiterMemory();
    const t1 = checkout({ catalog: SEM_CONFEITARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    expect(t1.cards).toEqual(["cafe", "capuccino"]);
    mem = apply(mem, t1.memoryPatch);

    const t2 = checkout({ catalog: SEM_CONFEITARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    // Confeitaria não existe mais: nenhuma oferta, e o fechamento segue.
    expect(t2.mode).toBe("CHECKOUT_SUPPORT");
    expect(t2.cards).toEqual([]);
    expect(t2.message).not.toContain("Confeitaria");
  });

  it("a categoria apagada não rouba a vez da seguinte", () => {
    const out = checkout({
      catalog: SEM_CONFEITARIA, cartItemIds: ["pao-frances"],
      upsellCategories: ["Confeitaria", "Café & Bebidas"],
    });
    expect(out.cards).toEqual(["cafe", "capuccino"]);
  });

  it("TODA a configuração apontando para categorias inexistentes → checkout limpo, sem card e sem invenção", () => {
    const out = checkout({
      catalog: PADARIA, cartItemIds: ["pao-frances"],
      upsellCategories: ["Sobremesas Veganas", "Vinhos Importados"],
    });
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.cards).toEqual([]);
  });

  it("categoria existente mas com todos os itens já no carrinho não vira oferta vazia", () => {
    const out = checkout({
      catalog: PADARIA, cartItemIds: ["pao-frances", "cafe", "capuccino"],
      upsellCategories: ["Café & Bebidas"],
    });
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.cards).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (d) NUNCA EM LOOP
// ═══════════════════════════════════════════════════════════════════════════
describe("d) o Garçom não oferece em loop", () => {
  it("dez cliques em Finalizar → cada categoria aparece no máximo UMA vez", () => {
    let mem = createWaiterMemory();
    const contagem = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
      mem = apply(mem, out.memoryPatch);
      if (out.mode === "INTERVENTION") {
        const cat = PADARIA.find((p) => p.id === out.cards[0])!.categoryName;
        contagem.set(cat, (contagem.get(cat) ?? 0) + 1);
      }
    }
    expect([...contagem.values()].every((n) => n === 1)).toBe(true);
    expect([...contagem.keys()].sort()).toEqual(["Café & Bebidas", "Confeitaria"]);
  });

  it("depois de percorrer a sequência, o fechamento fica silencioso e estável", () => {
    let mem = createWaiterMemory();
    for (let i = 0; i < 5; i++) {
      const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
      mem = apply(mem, out.memoryPatch);
    }
    const final = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    expect(final.mode).toBe("CHECKOUT_SUPPORT");
    expect(final.cards).toEqual([]);
  });

  it("recusa explícita de bebida cala 'Café & Bebidas' — o apelido legado continua valendo", () => {
    const mem = {
      ...createWaiterMemory(),
      declinedSuggestionTypes: ["drink_upsell"],
    };
    const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    expect(out.message).toContain("Confeitaria");
    expect(out.cards).not.toContain("cafe");
  });

  it("memória antiga (só checkoutUpsellStage, sem a lista) não reoferece o passo já visto", () => {
    // Sessão que começou antes desta mudança existir: deploy no meio do pedido.
    const mem = { ...createWaiterMemory(), checkoutUpsellStage: "drink_shown" as const };
    const out = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    expect(out.message).toContain("Confeitaria");
    expect(out.cards).not.toContain("cafe");
  });

  it("botão legado 'skip' avança na sequência configurada em vez de pular para sobremesa", () => {
    let mem = createWaiterMemory();
    const t1 = checkout({ catalog: PADARIA, cartItemIds: ["pao-frances"], memory: mem, upsellCategories: BAKERY_CFG });
    mem = apply(mem, t1.memoryPatch);

    const skip = decide({
      event: "ON_USER_MESSAGE", message: "skip_drink_upsell",
      cartItemIds: ["pao-frances"], cartValue: 10, catalog: PADARIA,
      memory: mem, upsellCategories: BAKERY_CFG,
    });
    expect(skip.cards).toEqual(["bolo-fuba", "torta-limao"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resolvedor — casamento exato, nunca difuso
// ═══════════════════════════════════════════════════════════════════════════
describe("resolvedor de categorias", () => {
  it("sem configuração devolve os dois passos legados, nesta ordem", () => {
    expect(upsellCategoryLabels(CLASSICO, null)).toEqual(["bebidas", "sobremesas"]);
  });

  it("acento e caixa não impedem o casamento — 'cafe & bebidas' acha 'Café & Bebidas'", () => {
    expect(upsellCategoryLabels(PADARIA, ["cafe & bebidas"])).toEqual(["Café & Bebidas"]);
  });

  it("o rótulo falado é a grafia REAL do cardápio, não a que o lojista digitou", () => {
    expect(upsellCategoryLabels(PADARIA, ["CONFEITARIA"])).toEqual(["Confeitaria"]);
  });

  it("NÃO casa por aproximação: 'Confeit' não vira 'Confeitaria'", () => {
    expect(upsellCategoryLabels(PADARIA, ["Confeit"])).toEqual([]);
  });

  it("NÃO casa por continência: 'Bebidas' não vira 'Café & Bebidas'", () => {
    expect(upsellCategoryLabels(PADARIA, ["Bebidas"])).toEqual([]);
  });

  it("categoria que casaria com a regex legada de bebida herda a chave de recusa", () => {
    const [step] = resolveUpsellSequence(PADARIA, ["Café & Bebidas"]);
    expect(step!.declineKeys).toContain("drink_upsell");
  });

  it("duplicata na configuração vira um passo só", () => {
    expect(upsellCategoryLabels(PADARIA, ["Confeitaria", "confeitaria"])).toEqual(["Confeitaria"]);
  });

  it("normalização não inventa sinônimo: '&' não vira 'e'", () => {
    expect(normalizeCategoryKey("Café & Bebidas")).not.toBe(normalizeCategoryKey("Cafe e Bebidas"));
  });

  it("saneamento remove vazios, apara espaços, deduplica e respeita o teto", () => {
    expect(sanitizeUpsellCategories(["  Bebidas  ", "", "bebidas", null, 42, "Doces"]))
      .toEqual(["Bebidas", "Doces"]);
    expect(sanitizeUpsellCategories(Array.from({ length: 20 }, (_, i) => `C${i}`)))
      .toHaveLength(MAX_UPSELL_CATEGORIES);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A padaria de vitrine nasce configurada — e a configuração aponta para o
// cardápio real dela. Config apontando para categoria que não existe seria
// exatamente o bug de origem, com outra roupa.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// O que o Garçom LÊ sobre si mesmo.
//
// Guardrail 4 — prompt é aviso, código é trava: a trava está no WaiterBrainV2 e
// já foi provada acima. Estes testes cuidam do aviso, para ele não voltar a
// contradizer a trava. Um prompt que insiste em "sobremesa" empurra o modelo a
// oferecer o que a padaria não tem.
// ═══════════════════════════════════════════════════════════════════════════
describe("o prompt e o perfil param de citar bebida/sobremesa literalmente", () => {
  const promptSrc = readFileSync(
    join(process.cwd(), "src/services/ai/PromptBuilderService.ts"), "utf8",
  );

  it("a SEQUÊNCIA PADRÃO do prompt é interpolada, não escrita à mão", () => {
    expect(promptSrc).toContain("${closingSequenceLine}");
    expect(promptSrc).toContain("${closingSequenceBlock}");
  });

  it("as etapas fixas DRINK/DESSERT saíram da sequência do prompt", () => {
    expect(promptSrc).not.toContain("3 → DRINK");
    expect(promptSrc).not.toContain("4 → DESSERT");
    expect(promptSrc).not.toContain("REGRA 6 — COMPLEMENTOS (DRINK + DESSERT)");
  });

  it("a regra de recusa não fixa mais cotas por 'bebida'/'sobremesa'", () => {
    expect(promptSrc).not.toContain("BEBIDA: máx 2 tentativas");
  });

  it("as regras de upsell do perfil não citam bebida/sobremesa como se fossem universais", () => {
    for (const regra of UPSELL_RULES) {
      expect(regra.toLowerCase()).not.toContain("bebida/sobremesa");
    }
  });

  it("a constituição recebe as categorias reais e as escreve na ordem", () => {
    const d = buildWaiterProfileDirective(["Café & Bebidas", "Confeitaria"]);
    expect(d).toContain("1. Café & Bebidas");
    expect(d).toContain("2. Confeitaria");
    expect(d).toContain("Ofereça cada uma no máximo UMA vez");
  });

  it("sem categorias, a constituição CALA — não inventa taxonomia", () => {
    const d = buildWaiterProfileDirective([]);
    expect(d).not.toContain("CATEGORIAS DE FECHAMENTO DESTE RESTAURANTE");
  });
});

describe("Foocci Bakery — seed", () => {
  it("a configuração é Bebidas → Confeitaria, nesta ordem", () => {
    expect([...BAKERY_UPSELL_CATEGORIES]).toEqual(["Café & Bebidas", "Confeitaria"]);
  });

  it("cada categoria configurada existe no cardápio do seed, escrita igual", () => {
    const nomes = BAKERY_MENU.map((c) => c.name);
    for (const cat of BAKERY_UPSELL_CATEGORIES) expect(nomes).toContain(cat);
  });

  it("a sequência resolve contra o cardápio real do seed (nada é descartado)", () => {
    const catalogo = BAKERY_MENU.map((c) => ({ categoryName: c.name }));
    expect(upsellCategoryLabels(catalogo, BAKERY_UPSELL_CATEGORIES))
      .toEqual(["Café & Bebidas", "Confeitaria"]);
  });
});
