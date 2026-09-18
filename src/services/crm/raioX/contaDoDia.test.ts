/**
 * A CONTA DO DIA — e a invariante que a torna confiável.
 *
 * A regra do CEO (D-0E3): todo restaurante, todo dia, tem um número máximo
 * permitido, e a operação trabalha NESSE número. Para cobrar isso o sistema
 * precisa saber responder três coisas: de quantos eu podia, quantos mandei, e
 * para cada um que não mandei, QUAL regra barrou.
 *
 * A terceira só vale se a conta FECHAR. Aqui ela é provada, não afirmada.
 */
import { describe, it, expect } from "vitest";
import {
  montarContaDoDia, conferirFechamento, avaliarOciosidade,
  LACUNA_SEM_RODADA, LACUNA_CORTE_DE_AUDIENCIA,
  PISO_ALARME_GRAVE,
} from "./contaDoDia";

const base = {
  restaurantId: "r1",
  tetoDiario: 900,
  enviadasHoje: 0,
  enviadasNoCiclo: 0,
  barrados: [],
  cortadosAntesDoBanco: [],
  elegiveisMedidos: null as number | null,
};

describe("A invariante: enviados + barrados + cortados = elegíveis", () => {
  it("fecha quando cada elegível tem exatamente um destino", () => {
    const f = conferirFechamento({
      ...base,
      enviadasNoCiclo: 60,
      barrados: [
        { degrau: "BLOCKED:CUSTOMER_OPTED_OUT", quantidade: 15 },
        { degrau: "BLOCKED:CUSTOMER_WEEKLY_CAP_REACHED", quantidade: 10 },
        { degrau: "SKIPPED:MISSING_PHONE", quantidade: 5 },
      ],
      cortadosAntesDoBanco: [{ degrau: "CORTADO_ANTES_DO_BANCO", quantidade: 310 }],
      elegiveisMedidos: 400,
    });
    expect(f.fecha).toBe(true);
    expect(f.diferenca).toBe(0);
  });

  it("ACUSA o degrau escondido: 2.396 elegíveis, zero enviados e ninguém barrado", () => {
    // O retrato de produção. Antes, isso passava despercebido porque ninguém
    // somava as partes. Agora a diferença tem nome e número.
    const f = conferirFechamento({ ...base, enviadasNoCiclo: 0, elegiveisMedidos: 2396 });
    expect(f.fecha).toBe(false);
    expect(f.diferenca).toBe(2396);
    expect(f.explicacao).toContain("DEGRAU ESCONDIDO");
  });

  it("ACUSA contagem duplicada quando a soma passa do elegível", () => {
    const f = conferirFechamento({
      ...base, enviadasNoCiclo: 10,
      barrados: [{ degrau: "BLOCKED:X", quantidade: 10 }],
      elegiveisMedidos: 15,
    });
    expect(f.fecha).toBe(false);
    expect(f.diferenca).toBe(-5);
    expect(f.explicacao).toContain("CONTAGEM DUPLICADA");
  });

  it("FAIL-CLOSED: sem elegível medido, NÃO se declara fechada", () => {
    const f = conferirFechamento({ ...base, elegiveisMedidos: null });
    expect(f.fecha).toBe(false);
    expect(f.diferenca).toBeNull();
    // E a lacuna sobe escrita, não vira zero.
    expect(montarContaDoDia({ ...base }).lacunas).toContainEqual(LACUNA_SEM_RODADA);
  });

  it("a lacuna que SOBREVIVE (corte de 500 da audiência) é sempre declarada", () => {
    const conta = montarContaDoDia({ ...base, elegiveisMedidos: 10, enviadasNoCiclo: 10 });
    expect(conta.fechamento.fecha).toBe(true);
    // Fechar a conta do ciclo NÃO autoriza calar a lacuna da base inteira.
    expect(conta.lacunas).toContainEqual(LACUNA_CORTE_DE_AUDIENCIA);
  });
});

describe("De quantos eu podia / quantos mandei", () => {
  it("responde a conta e o aproveitamento", () => {
    const c = montarContaDoDia({ ...base, tetoDiario: 900, enviadasHoje: 60 });
    expect(c.podiaHoje).toBe(900);
    expect(c.enviouHoje).toBe(60);
    expect(c.sobraDoDia).toBe(840);
    expect(c.aproveitamentoPercent).toBe(7);
  });

  it("sem teto configurado não existe sobra a cobrar — e isso é dito, não chutado", () => {
    const c = montarContaDoDia({ ...base, tetoDiario: 0, enviadasHoje: 60 });
    expect(c.podiaHoje).toBeNull();
    expect(c.sobraDoDia).toBeNull();
    expect(c.alarme).toBeNull();
  });

  it("ordena os degraus do que mais barrou para o que menos barrou", () => {
    const c = montarContaDoDia({
      ...base,
      barrados: [{ degrau: "A", quantidade: 3 }, { degrau: "B", quantidade: 90 }],
    });
    expect(c.barrados.map((d) => d.degrau)).toEqual(["B", "A"]);
    expect(c.totalBarrado).toBe(93);
  });
});

describe("O alarme da capacidade ociosa", () => {
  it("GRAVE no caso do CEO: podia 900, mandou 60", () => {
    const a = avaliarOciosidade(900, 60);
    expect(a?.nivel).toBe("GRAVE");
    expect(a?.sobra).toBe(840);
    expect(a?.mensagem).toContain("840");
  });

  it("ATENÇÃO quando sobra um quarto do teto", () => {
    expect(avaliarOciosidade(900, 600)?.nivel).toBe("ATENCAO");
  });

  it("cala quando o teto foi bem aproveitado", () => {
    expect(avaliarOciosidade(900, 880)).toBeNull();
  });

  it("não grita por sobra pequena em restaurante de teto pequeno", () => {
    // 50% de sobra, mas só 10 mensagens — abaixo do piso absoluto.
    expect(avaliarOciosidade(20, 10)).toBeNull();
    expect(PISO_ALARME_GRAVE).toBeGreaterThan(10);
  });
});
