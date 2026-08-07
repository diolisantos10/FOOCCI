/**
 * O portão do pontinho de estado.
 *
 * O compilador já barra o estado ESQUECIDO (`Record<EstadoAgente, …>` obriga a
 * chave). Estes testes barram o estado COPIADO — dois estados com o mesmo
 * desenho — que o TypeScript não enxerga e que é exatamente como um "não sei"
 * viraria um "está com defeito" na tela.
 */

import { describe, expect, it } from "vitest";
import type { EstadoAgente } from "@/services/agents/salaDosAgentes.types";
import {
  DESENHO_DO_ESTADO,
  ORDEM_DOS_ESTADOS,
  desenhoDoEstado,
  estaEmOperacao,
  nomeDoEstado,
} from "./_estados";

const TODOS: EstadoAgente[] = ["trabalhando", "atencao", "desligado", "desconhecido"];

describe("desenho dos estados do agente", () => {
  it("tem entrada para cada estado do contrato", () => {
    for (const e of TODOS) {
      expect(DESENHO_DO_ESTADO[e], `estado "${e}" sem desenho`).toBeTruthy();
    }
    expect(Object.keys(DESENHO_DO_ESTADO).sort()).toEqual([...TODOS].sort());
  });

  it("dá visual PRÓPRIO a cada estado — nenhum herda o do vizinho", () => {
    const classes = TODOS.map((e) => DESENHO_DO_ESTADO[e].classe);
    expect(new Set(classes).size, "dois estados dividem o mesmo desenho de ponto").toBe(
      TODOS.length,
    );
  });

  it("dá nome e ajuda próprios a cada estado", () => {
    const textos = TODOS.map((e) => DESENHO_DO_ESTADO[e].texto);
    const ajudas = TODOS.map((e) => DESENHO_DO_ESTADO[e].ajuda);
    expect(new Set(textos).size).toBe(TODOS.length);
    expect(new Set(ajudas).size).toBe(TODOS.length);
    for (const e of TODOS) {
      expect(DESENHO_DO_ESTADO[e].texto.trim().length).toBeGreaterThan(0);
      expect(DESENHO_DO_ESTADO[e].ajuda.trim().length).toBeGreaterThan(0);
    }
  });

  it("separa 'não sei' de 'sei' pela FORMA, não só pela cor", () => {
    // desconhecido é o único vazado: sem preenchimento, com contorno.
    expect(DESENHO_DO_ESTADO.desconhecido.classe).toContain("bg-transparent");
    expect(DESENHO_DO_ESTADO.desconhecido.classe).toContain("border");
    for (const e of ["trabalhando", "atencao", "desligado"] as const) {
      expect(DESENHO_DO_ESTADO[e].classe, `${e} não pode ser vazado`).not.toContain(
        "bg-transparent",
      );
    }
  });

  it("não pinta 'desconhecido' de amarelo — ele não é uma gravidade", () => {
    expect(DESENHO_DO_ESTADO.desconhecido.classe).not.toContain("amber");
    expect(DESENHO_DO_ESTADO.desconhecido.classe).not.toContain("green");
    expect(DESENHO_DO_ESTADO.desconhecido.classe).not.toContain("red");
  });

  it("cai em 'desconhecido' — nunca em 'desligado' — diante de valor que não conhece", () => {
    // Ausência de informação não é informação: um estado novo do contrato que
    // ainda não tem desenho é "não sei", e nunca "está parado".
    expect(desenhoDoEstado("estado-que-ainda-nao-existe")).toBe(DESENHO_DO_ESTADO.desconhecido);
    expect(nomeDoEstado("")).toBe(DESENHO_DO_ESTADO.desconhecido.texto);
  });

  it("mostra todos os estados na legenda, sem repetir", () => {
    expect([...ORDEM_DOS_ESTADOS].sort()).toEqual([...TODOS].sort());
    expect(new Set(ORDEM_DOS_ESTADOS).size).toBe(ORDEM_DOS_ESTADOS.length);
  });
});

describe("estaEmOperacao — o critério do contador do topo", () => {
  it("não conta quem está desligado", () => {
    // O defeito que este predicado conserta: o contador dizia "12 falam com o
    // cliente" com oito perfis em DRAFT no meio. Soma certa de uma coisa errada.
    expect(estaEmOperacao({ estado: "desligado" })).toBe(false);
  });

  it("conta quem trabalha e quem está em atenção", () => {
    expect(estaEmOperacao({ estado: "trabalhando" })).toBe(true);
    expect(estaEmOperacao({ estado: "atencao" })).toBe(true);
  });

  it("conta 'desconhecido' como EM OPERAÇÃO", () => {
    // "Não consigo provar se trabalhou" não é "não roda". Excluí-lo daqui
    // transformaria ausência de medição em ausência de trabalho — o mesmo erro
    // desta tela, só do outro lado.
    expect(estaEmOperacao({ estado: "desconhecido" })).toBe(true);
  });

  it("é o COMPLEMENTO exato de 'fora de operação' — as parcelas fecham", () => {
    const elenco = [
      { estado: "trabalhando" },
      { estado: "atencao" },
      { estado: "desconhecido" },
      { estado: "desligado" },
      { estado: "desligado" },
    ];
    const dentro = elenco.filter(estaEmOperacao).length;
    const fora = elenco.filter((a) => !estaEmOperacao(a)).length;
    expect(dentro).toBe(3);
    expect(fora).toBe(2);
    expect(dentro + fora).toBe(elenco.length);
  });

  it("usa o campo de estado, não o texto do motor", () => {
    // Categoria derivada de frase livre quebra na primeira reescrita da frase.
    // Um perfil em DRAFT chega como estado "desligado" — é esse o sinal.
    const rascunho = { estado: "desligado", motorExplicacao: "Perfil em DRAFT — não roda" };
    const ativo = { estado: "atencao", motorExplicacao: "Perfil em DRAFT — não roda" };
    expect(estaEmOperacao(rascunho)).toBe(false);
    expect(estaEmOperacao(ativo)).toBe(true);
  });
});
