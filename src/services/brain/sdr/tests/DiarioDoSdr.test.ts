/**
 * O diário do SDR — e o que ele promete NÃO guardar.
 *
 * Cada teste aqui reprova contra o código anterior por um motivo simples: antes
 * deste bloco não existia diário nenhum. O que se prova é o contrato: contagem
 * antes de lista, cegueiras declaradas, motivo da falha nomeado, e nenhuma
 * palavra do cliente dentro do registro.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarTurno,
  lerDiario,
  limparDiario,
  impressaoDaConversa,
  CEGUEIRAS,
  TETO_DE_TURNOS,
} from "../DiarioDoSdr";

const TEXTO_DO_CLIENTE = "sou dono do Sushi da Praia e minha dor e nao ter cliente fiel";

beforeEach(() => limparDiario());

describe("o que o diário conta", () => {
  it("conta o turno em que a IA respondeu e o em que ela não respondeu, com o motivo", () => {
    registrarTurno({
      chave: "foocci-vendas::lead-a7k2m", iaRespondeu: true,
      entendido: [{ chave: "objetivo", origem: "ia" }],
      perguntasNoAr: 1, seguemSemResposta: 0, travou: false, cobertura: 0.4, podePropor: false,
    });
    registrarTurno({
      chave: "foocci-vendas::lead-a7k2m", iaRespondeu: false, motivoSemIA: "cortado_por_limite",
      entendido: [{ chave: "regiao", origem: "motor" }],
      perguntasNoAr: 1, seguemSemResposta: 0, travou: false, cobertura: 0.5, podePropor: false,
    });

    const d = lerDiario();
    expect(d.contagens.turnos).toBe(2);
    expect(d.contagens.turnosComIA).toBe(1);
    expect(d.contagens.turnosSemIA).toBe(1);
    expect(d.contagens.porMotivo.cortado_por_limite).toBe(1);
    expect(d.motivosExplicados.cortado_por_limite).toMatch(/teto de tokens/i);
  });

  it("separa o campo preenchido pelo motor de regras do preenchido pela IA", () => {
    registrarTurno({
      chave: "c1", iaRespondeu: false, motivoSemIA: "timeout",
      entendido: [{ chave: "objetivo", origem: "motor" }, { chave: "regiao", origem: "ia" }],
      perguntasNoAr: 2, seguemSemResposta: 0, travou: false, cobertura: 0.3, podePropor: false,
    });
    const d = lerDiario();
    expect(d.contagens.camposPeloMotor).toBe(1);
    expect(d.contagens.camposPelaIA).toBe(1);
    expect(d.turnos[0]?.chavesPeloMotor).toEqual(["objetivo"]);
  });

  it("conta a conversa que travou", () => {
    registrarTurno({
      chave: "c1", iaRespondeu: true, entendido: [],
      perguntasNoAr: 3, seguemSemResposta: 3, travou: true, cobertura: 0, podePropor: false,
    });
    expect(lerDiario().contagens.turnosQueTravaram).toBe(1);
  });

  it("um turno sem IA e sem motivo declarado NUNCA vira sucesso silencioso", () => {
    registrarTurno({
      chave: "c1", iaRespondeu: false, entendido: [],
      perguntasNoAr: 1, seguemSemResposta: 1, travou: true, cobertura: 0, podePropor: false,
    });
    expect(lerDiario().contagens.porMotivo.desconhecido).toBe(1);
  });
});

describe("o que o diário NUNCA guarda", () => {
  it("nenhum pedaço do que o cliente escreveu entra no registro", () => {
    registrarTurno({
      chave: `foocci-vendas::lead-a7k2m`, iaRespondeu: true,
      entendido: [{ chave: "o_que_vende", origem: "ia" }],
      perguntasNoAr: 1, seguemSemResposta: 0, travou: false, cobertura: 0.2, podePropor: false,
    });
    const serializado = JSON.stringify(lerDiario());
    expect(serializado).not.toContain(TEXTO_DO_CLIENTE);
    expect(serializado).not.toContain("Sushi");
    // nem a identidade da conversa em claro — vai como impressão digital
    expect(serializado).not.toContain("lead-a7k2m");
    expect(serializado).toContain(impressaoDaConversa("foocci-vendas::lead-a7k2m"));
  });
});

describe("o contrato de leitura", () => {
  it("declara as cegueiras, e a memória volátil é a primeira delas", () => {
    const d = lerDiario();
    expect(d.cegueiras).toEqual(CEGUEIRAS);
    expect(d.cegueiras.length).toBeGreaterThan(3);
    expect(d.cegueiras.join(" ")).toMatch(/mem[óo]ria do processo/i);
  });

  it("as contagens existem mesmo com o diário vazio — silêncio não é ausência de problema", () => {
    const d = lerDiario();
    expect(d.contagens.turnos).toBe(0);
    expect(d.turnos).toEqual([]);
    expect(d.primeiroTurnoEm).toBeNull();
  });

  it("o mais recente vem primeiro e o teto segura o crescimento", () => {
    for (let i = 0; i < TETO_DE_TURNOS + 10; i++) {
      registrarTurno({
        chave: `c${i}`, iaRespondeu: true, entendido: [],
        perguntasNoAr: 0, seguemSemResposta: 0, travou: false, cobertura: 0, podePropor: false,
        agora: new Date(Date.UTC(2026, 7, 23, 0, 0, i)),
      });
    }
    const d = lerDiario(5);
    expect(d.contagens.turnos).toBe(TETO_DE_TURNOS);
    expect(d.turnos).toHaveLength(5);
    expect(d.turnos[0]!.quando > d.turnos[1]!.quando).toBe(true);
  });

  it("anotar nunca derruba a entrevista que ele observa", () => {
    expect(() =>
      registrarTurno({
        chave: "c1", iaRespondeu: true,
        entendido: null as unknown as { chave: string; origem: "motor" }[],
        perguntasNoAr: 0, seguemSemResposta: 0, travou: false, cobertura: 0, podePropor: false,
      }),
    ).not.toThrow();
  });
});
