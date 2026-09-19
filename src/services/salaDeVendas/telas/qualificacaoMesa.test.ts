/**
 * A MESA DE TRABALHO DA QUALIFICAÇÃO — medida contra um banco que filtra.
 *
 * ── A PERGUNTA OBRIGATÓRIA ──────────────────────────────────────────────────
 *
 * *O teste alcança o código que responde ao cliente?* Alcança: a mesa é lida
 * pelo `mesaDaQualificacao` de verdade, sobre o `bancoDeProva` (que aplica o
 * `where`), e a linha é desenhada pelo componente REAL da tela. Trocar o dado
 * muda o HTML; trocar a tela por constantes reprova.
 *
 * ── O QUE ESTE ARQUIVO SEGURA COM MAIS FORÇA ────────────────────────────────
 *
 * A diferença entre **zero** e **não sei**, que é a trava mais cara destas duas
 * telas. Valor Potencial sem oportunidade não vira R$ 0,00; probabilidade sem
 * oportunidade não vira 0%; conversão sem desfecho não vira 0% — e temperatura
 * ausente não vira FRIO. Cada um tem o seu teste, porque é exatamente aí que um
 * `?? 0` entraria despercebido e viraria uma afirmação que ninguém fez.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Prisma, PrismaClient } from "@prisma/client";

import { bancoDeProva } from "../bancoDeProva";
import {
  conversaoPorScore,
  mesaDaQualificacao,
  type LinhaDaMesa,
} from "./qualificacao";
import { LinhaDoLead, tomDaUrgencia } from "@/app/comercial/(area)/qualificacao/MesaDeLeads";

const TODOS: Prisma.SiteLeadWhereInput = {};

function banco(dados: Parameters<typeof bancoDeProva>[0]) {
  return bancoDeProva(dados) as unknown as PrismaClient;
}

function lead(id: string, campos: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Lead ${id}`,
    restaurante: null,
    fonte: "FORMULARIO_DEMONSTRACAO",
    utmCampaign: null,
    utmSource: null,
    score: null,
    temperatura: null,
    stage: "EM_QUALIFICACAO",
    stageChangedAt: new Date("2026-09-10T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...campos,
  };
}

function qualificacao(leadId: string, campos: Record<string, unknown> = {}) {
  return {
    id: `q-${leadId}`,
    leadId,
    planoDeInteresse: null,
    dorPrincipal: null,
    urgencia: null,
    faixaDeOrcamento: null,
    objecoes: [],
    ...campos,
  };
}

async function mesa(dados: Parameters<typeof bancoDeProva>[0], filtro = {}) {
  return mesaDaQualificacao(banco(dados), { escopo: TODOS, filtro });
}

function html(l: LinhaDaMesa): string {
  return renderToStaticMarkup(
    React.createElement("table", null,
      React.createElement("tbody", null,
        React.createElement(LinhaDoLead, {
          l, aoMover: () => {}, salvando: false, recusa: null,
        }),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe("⛔ a mesa não inventa número nem pessoa", () => {
  it("lead sem oportunidade NÃO ganha valor potencial zero — ganha o motivo", async () => {
    const r = await mesa({ siteLead: [lead("l1")], leadQualificacao: [qualificacao("l1")] });

    const l = r.linhas[0]!;
    expect(l.valorPotencialCents).toBeNull();
    expect(l.probabilidade).toBeNull();
    expect(l.porqueSemOportunidade).toContain("nenhuma oportunidade aberta");

    const h = html(l);
    expect(h).toContain("nenhuma oportunidade aberta");
    expect(h).not.toContain("R$ 0,00");
    expect(h).not.toContain("0%");
  });

  it("lead sem temperatura NÃO vira FRIO: a célula diz que ninguém pontuou", async () => {
    const r = await mesa({ siteLead: [lead("l1")] });

    expect(r.linhas[0]!.temperatura).toBeNull();

    const h = html(r.linhas[0]!);
    // A frase NEGA o FRIO ("ninguém pontuou — não é FRIO"); o que não pode
    // existir é a PÍLULA, que é onde uma temperatura seria afirmada.
    expect(h).toContain("ninguém pontuou — não é FRIO");
    expect(h).not.toContain("rounded-full px-2 py-0.5");
  });

  it("campo não perguntado sai com o motivo, nunca como traço mudo", async () => {
    const r = await mesa({ siteLead: [lead("l1")] });

    const h = html(r.linhas[0]!);
    expect(h).toContain("produto não perguntado");
    expect(h).toContain("dor não registrada");
    expect(h).toContain("nenhuma registrada — não é ausência de objeção");
  });

  it("a página inteira sem valor potencial declara o motivo uma vez, no alto", async () => {
    const r = await mesa({ siteLead: [lead("l1"), lead("l2")] });
    expect(r.naoMedido.join(" ")).toContain("Valor Potencial");
    expect(r.naoMedido.join(" ")).toContain("Oportunidade");
  });
});

describe("⭐ a mesa lê o que EXISTE, de onde ele mora", () => {
  it("valor e probabilidade vêm da oportunidade aberta do lead", async () => {
    const r = await mesa({
      siteLead: [lead("l1")],
      oportunidade: [
        {
          id: "op-1", leadId: "l1", estagio: "NEGOCIACAO",
          valorPotencialCents: 900_000, probabilidade: 80, objecoes: ["preço"],
          criadoEm: new Date("2026-09-05T00:00:00.000Z"),
        },
      ],
    });

    const l = r.linhas[0]!;
    expect(l.valorPotencialCents).toBe(900_000);
    expect(l.probabilidade).toBe(80);
    expect(html(l)).toContain("R$&nbsp;9.000,00".replace("&nbsp;", " "));
  });

  it("oportunidade GANHA ou PERDIDA não entra: ela não é mais o negócio em aberto", async () => {
    const r = await mesa({
      siteLead: [lead("l1")],
      oportunidade: [
        {
          id: "op-1", leadId: "l1", estagio: "PERDIDA",
          valorPotencialCents: 900_000, probabilidade: 80, objecoes: [],
          criadoEm: new Date("2026-09-05T00:00:00.000Z"),
        },
      ],
    });

    expect(r.linhas[0]!.valorPotencialCents).toBeNull();
  });

  it("as objeções da ficha e as da oportunidade se juntam, sem repetir", async () => {
    const r = await mesa({
      siteLead: [lead("l1")],
      leadQualificacao: [qualificacao("l1", { objecoes: ["preço", "prazo"] })],
      oportunidade: [
        {
          id: "op-1", leadId: "l1", estagio: "NEGOCIACAO",
          valorPotencialCents: null, probabilidade: null, objecoes: ["preço", "integração"],
          criadoEm: new Date("2026-09-05T00:00:00.000Z"),
        },
      ],
    });

    expect(r.linhas[0]!.objecoes).toEqual(["preço", "prazo", "integração"]);
  });

  it("o nome do desenho acompanha a temperatura do banco", async () => {
    const r = await mesa({
      siteLead: [lead("l1", { score: 92, temperatura: "PRIORIDADE_MAXIMA" })],
    });

    expect(r.linhas[0]!.temperaturaNoDesenho).toBe("PRONTO PARA COMPRAR");
    const h = html(r.linhas[0]!);
    expect(h).toContain("PRONTO PARA COMPRAR");
    expect(h).toContain("92");
  });
});

describe("⛔ a etapa encerrada fica fora da mesa", () => {
  it("GANHO, PERDIDO e NUTRICAO não aparecem: a mesa é fila de trabalho", async () => {
    const r = await mesa({
      siteLead: [
        lead("l1"),
        lead("l2", { stage: "GANHO" }),
        lead("l3", { stage: "PERDIDO" }),
        lead("l4", { stage: "NUTRICAO" }),
      ],
    });

    expect(r.total).toBe(1);
    expect(r.linhas.map((l) => l.id)).toEqual(["l1"]);
  });
});

describe("a paginação não devolve tela em branco sem explicação", () => {
  it("página além do fim é presa ao último intervalo que ainda tem linha", async () => {
    const r = await mesa({ siteLead: [lead("l1"), lead("l2")] }, { pagina: 99, porPagina: 1 });

    expect(r.paginas).toBe(2);
    expect(r.pagina).toBe(2);
    expect(r.linhas).toHaveLength(1);
  });

  it("base vazia devolve uma página, e não zero páginas", async () => {
    const r = await mesa({ siteLead: [] });
    expect(r.total).toBe(0);
    expect(r.paginas).toBe(1);
    expect(r.linhas).toEqual([]);
  });
});

describe("⛔ conversão por score: sem desfecho NÃO é 0%", () => {
  it("faixa sem nenhum GANHO nem PERDIDO devolve taxa nula, com o motivo", async () => {
    const linhas = await conversaoPorScore(banco({ siteLead: [lead("l1")] }), { escopo: TODOS });

    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) {
      expect(l.taxa).toBeNull();
      expect(l.porque).toContain("sem desfecho não há taxa");
    }
  });

  it("o denominador é quem já teve desfecho — não a base inteira", async () => {
    const linhas = await conversaoPorScore(
      banco({
        siteLead: [
          lead("g1", { temperatura: "QUENTE", stage: "GANHO" }),
          lead("p1", { temperatura: "QUENTE", stage: "PERDIDO" }),
          // Este ainda negocia: ele NÃO pode entrar no denominador, senão a
          // conversão cairia só porque a base cresceu.
          lead("n1", { temperatura: "QUENTE", stage: "EM_NEGOCIACAO" }),
        ],
      }),
      { escopo: TODOS },
    );

    const quente = linhas.find((l) => l.temperatura === "QUENTE")!;
    expect(quente.decididos).toBe(2);
    expect(quente.ganhos).toBe(1);
    expect(quente.taxa).toBe(50);
  });
});

describe("a cor da urgência não é emprestada", () => {
  it("as três do desenho têm tom próprio", () => {
    expect(tomDaUrgencia("Alta")).toBe("vermelho");
    expect(tomDaUrgencia("Média")).toBe("ambar");
    expect(tomDaUrgencia("Baixa")).toBe("verde");
  });

  it("texto que ninguém previu sai em cinza, e não vira 'quase alta'", () => {
    expect(tomDaUrgencia("depende do sócio")).toBe("cinza");
  });
});
