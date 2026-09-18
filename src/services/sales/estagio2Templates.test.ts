/**
 * ⛔ A RÉGUA DOS MODELOS DO ESTÁGIO 2.
 *
 * Três coisas são medidas aqui, e as três já custaram caro:
 *
 *   1. **Variável sem fonte** — disparo recusado pela Meta, contato a contato.
 *      ~10% da lista já foi perdida assim.
 *   2. **Texto de panfleto** — o bloco de nove linhas que foi a 750 contatos e
 *      capturou zero decisores. A rubrica é a mesma régua da Supervisora: se
 *      ela não sai VERDE, o TEXTO está errado, não a régua.
 *   3. **Preço dentro do modelo** — modelo aprovado não muda; preço muda. Um
 *      número colado aqui passa a mentir no dia seguinte, sem avisar ninguém.
 */

import { describe, it, expect } from "vitest";
import {
  ESTAGIO_2_TEMPLATES,
  corpoComExemplos,
  exemplosNaOrdem,
  modeloPodeSair,
} from "./estagio2Templates";
import { COLD_GREETING_TEMPLATES } from "./coldContactDiscovery";
import { avaliarPelaRubrica } from "@/services/salaDeVendas/supervisora/rubrica";

describe("⛔ toda variável tem fonte de dado", () => {
  for (const m of ESTAGIO_2_TEMPLATES) {
    it(`${m.name}: as posições do corpo batem com as declaradas`, () => {
      const noCorpo = [...m.body.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
      const declaradas = m.variaveis.map((v) => v.posicao);
      expect([...new Set(noCorpo)].sort((a, b) => a - b)).toEqual([...declaradas].sort((a, b) => a - b));
    });

    it(`${m.name}: as posições são inteiros sequenciais a partir de 1`, () => {
      expect(m.variaveis.map((v) => v.posicao).sort((a, b) => a - b)).toEqual(
        m.variaveis.map((_, i) => i + 1),
      );
    });

    it(`${m.name}: toda variável declara fonte e exemplo não vazios`, () => {
      for (const v of m.variaveis) {
        expect(v.fonte.trim().length, `posição ${v.posicao} sem fonte`).toBeGreaterThan(0);
        expect(v.exemplo.trim().length, `posição ${v.posicao} sem exemplo`).toBeGreaterThan(0);
      }
      expect(exemplosNaOrdem(m)).toHaveLength(m.variaveis.length);
    });
  }

  it("o estágio 1 continua declarando a fonte da sua única variável", () => {
    for (const t of COLD_GREETING_TEMPLATES) {
      const temVariavel = /\{\{\d+\}\}/.test(t.body);
      expect(temVariavel, `${t.name}: corpo e restaurantNameParam divergem`).toBe(t.restaurantNameParam);
    }
  });
});

describe("⛔ a Meta recusa variável na ponta do corpo", () => {
  for (const m of ESTAGIO_2_TEMPLATES) {
    it(`${m.name} não começa nem termina em variável`, () => {
      const b = m.body.trim();
      expect(b.startsWith("{{")).toBe(false);
      expect(b.endsWith("}}")).toBe(false);
    });
  }
});

describe("⛔ nenhum preço, número ou resultado dentro do modelo", () => {
  for (const m of ESTAGIO_2_TEMPLATES) {
    it(`${m.name} não carrega valor nem percentual`, () => {
      expect(m.body).not.toMatch(/R\$|\d+\s*%|\breais\b/i);
      // Só os `{{n}}` podem ter dígitos: número solto no texto é verdade
      // comercial congelada num modelo que ninguém reaprova.
      expect(m.body.replace(/\{\{\d+\}\}/g, "")).not.toMatch(/\d/);
    });
  }
});

describe("⛔ nenhum texto novo sai AMARELO ou VERMELHO na rubrica", () => {
  for (const m of ESTAGIO_2_TEMPLATES) {
    it(`${m.name} sai VERDE`, () => {
      const parecer = avaliarPelaRubrica(corpoComExemplos(m));
      expect(parecer.veredito, parecer.detalhe).toBe("VERDE");
    });
  }
});

describe("⛔ o closer chega sabendo — nunca perguntando", () => {
  for (const m of ESTAGIO_2_TEMPLATES) {
    it(`${m.name} cita algo já sabido na primeira frase, e não abre com 'como posso ajudar'`, () => {
      const primeira = m.body.split("\n")[0]!;
      expect(primeira, "a primeira linha não cita nenhum dado já conhecido").toMatch(/\{\{\d+\}\}/);
      expect(m.body.toLowerCase()).not.toMatch(/como posso (te )?ajudar/);
    });
  }
});

describe("⛔ fail-closed: variável sem dado não deixa o modelo sair", () => {
  const completo = ESTAGIO_2_TEMPLATES[0]!;

  it("com todas as fontes preenchidas, pode sair", () => {
    expect(
      modeloPodeSair(completo, {
        "SiteLead.nome": "Marcos",
        "AgenteEscolhido.nome": "Ana",
        "SiteLead.restaurante": "Cantina do Porto",
        "SiteLead.desafio": "cliente que some",
      }),
    ).toBe(true);
  });

  it("com uma fonte vazia, NÃO pode sair — e não se inventa o valor", () => {
    expect(
      modeloPodeSair(completo, {
        "SiteLead.nome": "Marcos",
        "AgenteEscolhido.nome": "Ana",
        "SiteLead.restaurante": "  ",
        "SiteLead.desafio": "cliente que some",
      }),
    ).toBe(false);
  });

  it("com a fonte ausente, NÃO pode sair", () => {
    expect(modeloPodeSair(completo, { "SiteLead.nome": "Marcos" })).toBe(false);
  });
});

describe("os nomes não colidem com o estágio 1", () => {
  it("nenhum nome do estágio 2 é um dos três do primeiro contato", () => {
    const frios = COLD_GREETING_TEMPLATES.map((t) => t.name);
    for (const m of ESTAGIO_2_TEMPLATES) expect(frios).not.toContain(m.name);
  });
});
