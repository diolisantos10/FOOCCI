/**
 * A Oficina passou a conhecer o domínio "agencia".
 *
 * Sem manual, a esteira caía no caminho pelado: nenhum eixo, nenhuma lista
 * negra e — o pior — as proibições que vinham do briefing eram descartadas.
 * A peça mais arriscada, a de um domínio que a casa não conhece, era
 * justamente a que saía sem ninguém segurando nada.
 */

import { describe, it, expect } from "vitest";

import { manualAgencia } from "./manualAgencia";
import { resolveManual, registeredDominios, violacoes } from "./HouseManual";
import { forjar } from "./OficinaService";
import { criticar } from "./PromptCritic";

describe("o manual de agência existe e é achável", () => {
  it("o domínio está registrado", () => {
    expect(registeredDominios()).toContain("agencia");
    expect(resolveManual("agencia")).not.toBeNull();
  });

  it("texto tem eixo de formato — sem ele o juiz reprova toda peça escrita", () => {
    const nomes = (manualAgencia.eixosPorMedium.texto ?? []).map((e) => e.nome);
    expect(nomes).toContain("formato");
  });

  it("a lista negra pega o jargão que denuncia peça de robô", () => {
    expect(violacoes("nossa solução inovadora vai revolucionar o mercado", manualAgencia).length).toBeGreaterThan(0);
    expect(violacoes("aumente suas vendas em 30%", manualAgencia).length).toBeGreaterThan(0);
  });

  it("texto honesto passa limpo", () => {
    expect(violacoes("o pedido cai direto na cozinha e o cliente recebe a confirmação", manualAgencia)).toEqual([]);
  });

  it("proíbe promessa de número e depoimento inventado por padrão", () => {
    const juntas = manualAgencia.proibicoesPadrao.join(" ");
    expect(juntas).toMatch(/número, percentual ou prazo/i);
    expect(juntas).toMatch(/depoimento/i);
  });
});

describe("o caminho SEM manual parou de jogar fora as proibições do cliente", () => {
  const proibicoesDoCliente = [
    "não posicionar como chatbot",
    "nunca prometer percentual de aumento",
  ];

  it("domínio desconhecido ainda reprova — isso continua certo", async () => {
    const r = await forjar({
      pedido: { agentId: "social", medium: "texto", intencao: "peça qualquer", dominio: "clinica-veterinaria" },
      verdade: {},
      rascunho: { proibicoes: proibicoesDoCliente },
    });
    expect(r.nota.aprovado).toBe(false);
  });

  it("…mas as proibições do briefing sobrevivem na ficha", async () => {
    const r = await forjar({
      pedido: { agentId: "social", medium: "texto", intencao: "peça qualquer", dominio: "clinica-veterinaria" },
      verdade: {},
      rascunho: { proibicoes: proibicoesDoCliente, publico: "donos de pet", tom: "próximo" },
    });
    expect(r.ficha.proibicoes).toEqual(proibicoesDoCliente);
    expect(r.ficha.publico).toBe("donos de pet");
    expect(r.ficha.tom).toBe("próximo");
  });

  it("sem rascunho a ficha continua pelada, como antes", async () => {
    const r = await forjar({
      pedido: { agentId: "social", medium: "texto", intencao: "peça qualquer", dominio: "clinica-veterinaria" },
      verdade: {},
    });
    expect(r.ficha.proibicoes).toEqual([]);
  });
});

describe("com manual + verdade + rascunho, a peça de agência é aprovada", () => {
  it("o comando passa no juiz — que era onde a esteira da Dioli parava", async () => {
    const r = await forjar({
      pedido: { agentId: "social", medium: "texto", intencao: "story de lançamento", dominio: "agencia" },
      verdade: {
        products:  ["sistema de vendas e relacionamento para restaurantes"],
        customers: ["dono de restaurante que já vende por WhatsApp"],
      },
      rascunho: {
        publico: "dono de restaurante pequeno e médio",
        tom:     "humano e comercial, simples e direto",
        proibicoes: ["não posicionar como chatbot"],
      },
    });

    expect(criticar(r.ficha, manualAgencia).aprovado, JSON.stringify(r.nota)).toBe(true);
    expect(r.ficha.formato.length).toBeGreaterThan(0);
    expect(r.ficha.proibicoes).toContain("não posicionar como chatbot");
    // as do manual entram junto com as do cliente
    expect(r.ficha.proibicoes.length).toBeGreaterThan(1);
  });
});
