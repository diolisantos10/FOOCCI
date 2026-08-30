/**
 * ⭐⭐ A PROVA DA TRAVA DE IDENTIDADE — e ela é por MUTAÇÃO, não por asserção.
 *
 * A ordem do CEO, literal: *"Se o agente não existir no organograma, a operação
 * deve entrar em fila de correção, nunca assumir uma identidade superior."*
 *
 * Um teste que só afirmasse `expect(de).toBe("sdr-ia-ta")` não provaria nada
 * disso: ele passa igual num código que caia para o Diretor quando o TA sumir.
 * O que prova é **tirar o TA do diretório e exigir que nada saia** — e é isso
 * que os testes de mutação abaixo fazem, cada um dizendo qual linha ele mata.
 */

import { describe, expect, it } from "vitest";
import {
  DECISOR_DO_CONECTOR,
  DIRETORIO_DO_FOOCCI,
  MOTIVO_ORIGEM_NAO_CADASTRADA,
  ORIGEM_DO_CONECTOR,
  conferirIdentidades,
  crachaPorChave,
  resolverOrigem,
  type CrachaCorporativo,
} from "./origem";

/** O diretório sem o TA — o cenário exato que a ordem do CEO descreve. */
const SEM_O_TA: readonly CrachaCorporativo[] = DIRETORIO_DO_FOOCCI.filter(
  (c) => c.chave !== ORIGEM_DO_CONECTOR,
);

describe("quem pergunta é o TA, e ele está no diretório", () => {
  it("o crachá de origem é o do agente que atende o lead, não o do Diretor", () => {
    const r = resolverOrigem();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cracha.chave).toBe("sdr-ia-ta");
    expect(r.cracha.endereco).toBe("dioli.foocci.vendas.sdr-ia-ta");
    // ⛔ O ponto do trabalho inteiro: NÃO é o Diretor.
    expect(r.cracha.chave).not.toBe("diretor");
    expect(r.cracha.endereco).not.toBe("dioli.foocci.direcao.diretor");
  });

  it("cada crachá cita a fonte de onde foi lido — nenhum nasce neste arquivo", () => {
    for (const c of DIRETORIO_DO_FOOCCI) {
      expect(c.fonte.length).toBeGreaterThan(10);
      expect(c.endereco.split(".")).toHaveLength(4);
    }
    // O TA e o Gerente Comercial saem do catálogo de fichas, com o número.
    expect(crachaPorChave("sdr-ia-ta")!.fonte).toContain("ficha 1.5");
    expect(crachaPorChave("gerente-comercial")!.fonte).toContain("ficha 1.1");
  });

  it("a hierarquia é a que a fonte declara: o TA responde ao Gerente Comercial", () => {
    expect(crachaPorChave(ORIGEM_DO_CONECTOR)!.superior).toBe(
      "dioli.foocci.vendas.gerente-comercial",
    );
    expect(crachaPorChave(DECISOR_DO_CONECTOR)!.superior).toBe("dioli.foocci.direcao.diretor");
  });
});

describe("⛔ MUTAÇÃO — tire o TA do diretório e nada pode sair", () => {
  /**
   * ⭐ A MUTAÇÃO PRINCIPAL. Mata qualquer `?? DIRETOR` que alguém acrescente a
   * `resolverOrigem` para "fazer a escalada voltar a passar".
   */
  it("sem crachá de origem, recusa com motivo próprio — e NUNCA devolve o Diretor", () => {
    const r = resolverOrigem(ORIGEM_DO_CONECTOR, SEM_O_TA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe(MOTIVO_ORIGEM_NAO_CADASTRADA);
    expect(r.motivo).toBe("origemNaoCadastrada");
    // ⛔ A recusa manda CADASTRAR — não manda tentar de novo com outro crachá.
    expect(r.detalhe).toContain("fila de correção");
    expect(r.detalhe).toContain("não assume a identidade do Diretor");
    expect(r.detalhe).toContain("cadastrar o crachá");
  });

  /**
   * ⭐ A mutação que mais importa, dita como propriedade e não como texto:
   * seja qual for a chave que falte, o resultado NUNCA carrega um crachá.
   * É o que impede um `?? crachaPorChave("diretor")` de nascer aqui.
   */
  it("nenhuma recusa devolve crachá — não há plano B, por construção", () => {
    for (const chave of ["sdr-ia-ta", "qualquer-coisa", "", "diretor-foocci"]) {
      const r = resolverOrigem(chave, SEM_O_TA.filter((c) => c.chave !== chave));
      if (r.ok) {
        // Só pode ter dado certo se a chave de fato existe no diretório dado.
        expect(r.cracha.chave).toBe(chave);
        continue;
      }
      expect(r).not.toHaveProperty("cracha");
      expect(r.motivo).toBe(MOTIVO_ORIGEM_NAO_CADASTRADA);
    }
  });

  it("o motivo é DISTINTO de uma falha de canal — a fila trata as duas diferente", () => {
    const r = resolverOrigem("agente-que-nao-existe", DIRETORIO_DO_FOOCCI);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Não é "núcleo fora do ar", não é "porta não configurada".
    expect(r.motivo).not.toBe("portaInalcancavel");
    expect(r.motivo).not.toBe("portaNaoConfigurada");
    expect(r.detalhe).toContain("não se resolve sozinho");
  });

  it("uma chave desconhecida não cai no vizinho mais parecido", () => {
    // `sdr-humano` e `sdr-ia-ta` são fichas diferentes (1.6 e 1.5).
    expect(crachaPorChave("sdr")).toBeNull();
    expect(crachaPorChave("sdr-ia")).toBeNull();
    expect(crachaPorChave("SDR-IA-TA")).toBeNull();
  });
});

describe("⛔ três papéis, três identidades — o beco sem saída não volta", () => {
  it("quem pergunta, quem decide e quem recebe a escalada são diferentes", () => {
    const r = conferirIdentidades();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.de).toBe("dioli.foocci.vendas.sdr-ia-ta");
    expect(r.para).toBe("dioli.foocci.vendas.gerente-comercial");
    expect(r.escalada).toBe("dioli.foocci.direcao.diretor");
    // Os três, dois a dois, distintos.
    expect(new Set([r.de, r.para, r.escalada]).size).toBe(3);
  });

  /**
   * ⭐ MUTAÇÃO: voltar `de` para `"diretor"` — o estado exato que o CEO mediu em
   * produção. A escalada do Gerente Comercial vai para o Diretor, que passaria a
   * ser quem abriu a consulta. O gatilho do Postgres barrava isso EM PRODUÇÃO;
   * aqui é barrado antes de sair da máquina.
   */
  it("pôr o Diretor de volta como origem é reprovado — a escalada voltaria para ele", () => {
    const r = conferirIdentidades("diretor", DECISOR_DO_CONECTOR);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("volta para quem perguntou");
  });

  /** MUTAÇÃO: apontar a consulta para o próprio TA. */
  it("quem pergunta não pode ser quem decide", () => {
    const r = conferirIdentidades(ORIGEM_DO_CONECTOR, ORIGEM_DO_CONECTOR);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("MESMO crachá");
  });

  it("um decisor sem crachá é recusado, não substituído", () => {
    const r = conferirIdentidades(ORIGEM_DO_CONECTOR, "gerente-que-nao-existe");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("não tem crachá");
  });
});
