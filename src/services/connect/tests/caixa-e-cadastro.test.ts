/**
 * A CAIXA E O CADASTRO — as duas travas que são de código, não de aviso.
 *
 * Guardrail da casa: prompt é aviso; código é trava. Duas afirmações desta obra
 * seriam só comentário bonito se ninguém as cobrasse:
 *
 *   1. "esta porta nunca grava `acionado`" — cobrado abaixo pela trava que LANÇA;
 *   2. "o cadastro não inventa cargo" — cobrado contra o organograma canônico,
 *      que é a fonte única da estrutura da Foocci.
 */

import { describe, it, expect } from "vitest";
import {
  CarimboIndevido,
  ESTADOS_DA_CAIXA,
  caixaSemRegistro,
  carimboDeEntrega,
  recusarCarimboIndevido,
} from "@/services/connect/caixa";
import {
  AGENTES_PERMITIDOS,
  DIRETOR_DO_PRODUTO,
  GERENTE_DO_PRODUTO,
  QUEM_PODE_DESPACHAR,
  cadastroDoProduto,
  diretorDoProduto,
} from "@/services/connect/cadastro";
import { linhaPertenceAoFio, prefixoDoFio, registroDaLinha, sementeDoTurno } from "@/services/connect/armazem";
import { CARGOS_DE_DIRECAO, slugDoGerente } from "@/services/organizacao/departamentosCanonicos";
import type { LinhaDeRodadaLida } from "@/services/connect/armazem";

describe("a caixa postal — a trava que impede o carimbo indevido", () => {
  it("o vocabulário tem os quatro estados, e `nao_verificavel` está entre eles", () => {
    expect(ESTADOS_DA_CAIXA).toEqual(["entregue", "acionado", "respondido", "nao_verificavel"]);
  });

  it("o carimbo que a porta escreve é `entregue`, e ele se declara", () => {
    const c = carimboDeEntrega();
    expect(c.estado).toBe("entregue");
    expect(c.gravado).toBe(true);
    expect(c.nunca_grava).toBe("acionado");
    expect(c.porque).toMatch(/evidência devolvida por quem executou/i);
  });

  it("quando nada foi gravado, o carimbo diz `null` — e não finge entrega", () => {
    const c = caixaSemRegistro();
    expect(c.estado).toBeNull();
    expect(c.gravado).toBe(false);
    expect(c.nunca_grava).toBe("acionado");
  });

  it("⭐ tentar carimbar `acionado` LANÇA — não é aviso em comentário", () => {
    expect(() => recusarCarimboIndevido("acionado")).toThrow(CarimboIndevido);
    expect(() => recusarCarimboIndevido("acionado")).toThrow(/só pode gravar "entregue"/);
  });

  it("qualquer outro estado do vocabulário também é barrado", () => {
    for (const estado of ["respondido", "nao_verificavel", "qualquer-coisa"]) {
      expect(() => recusarCarimboIndevido(estado), estado).toThrow(CarimboIndevido);
    }
  });

  it("a outra metade — `entregue` atravessa a trava", () => {
    expect(() => recusarCarimboIndevido("entregue")).not.toThrow();
  });
});

describe("o fio — o histórico amarra por semente, e é reconferido em código", () => {
  const FIO = "connect:foocci:abc";

  function linha(metadata: string | null): LinhaDeRodadaLida {
    return {
      id: "r1", agentSlug: "waiter", status: "COMPLETED", seed: sementeDoTurno(FIO, 1),
      startedAt: new Date(), finishedAt: new Date(), durationMs: 1,
      scenariosTotal: 1, scenariosPassed: 1, scenariosWarning: 0, scenariosFailed: 0,
      p0Count: 0, opportunityCount: 0, metadata, cenarios: [], oportunidades: [],
    };
  }

  it("a semente carrega fio e turno, com separador", () => {
    expect(sementeDoTurno(FIO, 3)).toBe("connect:foocci:abc#t3");
    expect(prefixoDoFio(FIO)).toBe("connect:foocci:abc#t");
  });

  it("⭐ o separador impede que um fio arraste as rodadas de outro", () => {
    // Sem o `#t`, "connect:foocci:abc" seria prefixo de "connect:foocci:abc2".
    expect(sementeDoTurno("connect:foocci:abc2", 1).startsWith(prefixoDoFio(FIO))).toBe(false);
  });

  it('"o banco filtrou" não é "eu conferi": a linha só conta se o registro disser', () => {
    expect(linhaPertenceAoFio(linha(JSON.stringify({ connect: { fio: FIO, turno: 1 } })), FIO)).toBe(true);
    expect(linhaPertenceAoFio(linha(JSON.stringify({ connect: { fio: "outro", turno: 1 } })), FIO)).toBe(false);
    expect(linhaPertenceAoFio(linha(null), FIO)).toBe(false);
    expect(linhaPertenceAoFio(linha("isto não é json"), FIO)).toBe(false);
    expect(registroDaLinha(linha(JSON.stringify({ connect: { fio: FIO } })))).toBeNull(); // sem turno
  });
});

describe("o cadastro do produto — lido do organograma, nunca escrito aqui", () => {
  it("o Diretor conectado é o cargo canônico, com o título que está lá", () => {
    const canonico = CARGOS_DE_DIRECAO.find((c) => c.slug === DIRETOR_DO_PRODUTO)!;
    const lido = diretorDoProduto();
    expect(lido.slug).toBe(canonico.slug);
    expect(lido.titulo).toBe(canonico.titulo);
    expect(lido.nivel).toBe(canonico.nivel);
    expect(lido.fonte).toBe("organograma-canonico");
  });

  it("o gerente que recebe é derivado do organograma, não digitado", () => {
    expect(GERENTE_DO_PRODUTO).toBe(slugDoGerente("produto"));
  });

  it("⭐ o Gerente Geral vem `null` com o motivo — o cargo NÃO é inventado para cumprir a ordem", () => {
    const c = cadastroDoProduto();
    expect(c.gerente_geral).toBeNull();
    expect(c.por_que_sem_gerente_geral).toMatch(/regra 10/i);
    expect(c.por_que_sem_gerente_geral).toMatch(/segunda taxonomia/i);
  });

  it("as listas fechadas são curtas e explícitas", () => {
    expect(AGENTES_PERMITIDOS).toEqual(["waiter"]);
    expect(QUEM_PODE_DESPACHAR).toEqual(["diretor-geral", "diretor-foocci"]);
    expect(cadastroDoProduto().gerente_do_agente.departamento).toBe("produto");
  });
});
