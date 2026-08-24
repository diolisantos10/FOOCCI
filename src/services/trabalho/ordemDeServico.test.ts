import { describe, it, expect } from "vitest";
import { validarOrdemDeServico, type NovaOrdemDeServico } from "./ordemDeServico";

const os = (over: Partial<NovaOrdemDeServico> = {}): NovaOrdemDeServico => ({
  objetivo: "Ligar a Sala de Vendas",
  resultadoEsperado: "SDR IA respondendo inbound em até 5 minutos",
  criterioDeAceite: "10 leads atendidos sem intervenção, com handoff registrado",
  ...over,
});

const tarefa = (over = {}) => ({
  titulo: "Configurar fila",
  assigneePositionId: "gerente-vendas",
  prazo: new Date("2026-09-01"),
  ...over,
});

describe("uma OS precisa dizer o que quer, o que espera e como se sabe que acabou", () => {
  it("uma OS completa passa", () => {
    // A metade que PASSA: sem ela, uma validação que recusasse tudo ficaria
    // verde em todos os testes abaixo.
    expect(validarOrdemDeServico(os())).toEqual([]);
  });

  it("sem objetivo não dá para saber o que se está pedindo", () => {
    expect(validarOrdemDeServico(os({ objetivo: "  " })).map((r) => r.campo)).toContain("objetivo");
  });

  it("sem resultado esperado não há como saber se terminou", () => {
    expect(validarOrdemDeServico(os({ resultadoEsperado: "" })).map((r) => r.campo)).toContain(
      "resultadoEsperado",
    );
  });

  it("sem critério de aceite, 'pronto' vira opinião", () => {
    // É o campo que a pressa mais tenta pular, e o que evita a discussão no
    // fim, quando o trabalho já foi feito do jeito errado.
    expect(validarOrdemDeServico(os({ criterioDeAceite: "" })).map((r) => r.campo)).toContain(
      "criterioDeAceite",
    );
  });

  it("acusa todas as faltas de uma vez", () => {
    const r = validarOrdemDeServico({ objetivo: "", resultadoEsperado: "", criterioDeAceite: "" });
    expect(r).toHaveLength(3);
  });
});

describe("toda tarefa tem responsável", () => {
  it("cargo basta — e é o caso normal, porque cargo existe mesmo vago", () => {
    const r = validarOrdemDeServico(os({ tarefas: [tarefa()] }));
    expect(r).toEqual([]);
  });

  it("pessoa também basta", () => {
    const r = validarOrdemDeServico(
      os({ tarefas: [tarefa({ assigneePositionId: null, assigneeUserId: "u1" })] }),
    );
    expect(r).toEqual([]);
  });

  it("nenhum dos dois é recusado", () => {
    // Tarefa sem responsável é a que ninguém pega: aparece na lista, some da
    // conversa, e reaparece atrasada sem que ninguém tenha falhado.
    const r = validarOrdemDeServico(
      os({ tarefas: [tarefa({ assigneePositionId: null, assigneeUserId: null })] }),
    );
    expect(r.map((x) => x.campo)).toContain("tarefas[0].responsavel");
  });

  it("o índice da tarefa aparece na recusa — com dez tarefas, saber qual importa", () => {
    const r = validarOrdemDeServico(
      os({ tarefas: [tarefa(), tarefa({ assigneePositionId: null })] }),
    );
    expect(r.map((x) => x.campo)).toContain("tarefas[1].responsavel");
    expect(r.map((x) => x.campo)).not.toContain("tarefas[0].responsavel");
  });
});

describe("toda tarefa tem prazo", () => {
  it("prazo próprio serve", () => {
    expect(validarOrdemDeServico(os({ tarefas: [tarefa()] }))).toEqual([]);
  });

  it("sem prazo próprio, herda o da OS", () => {
    const r = validarOrdemDeServico(
      os({ prazo: new Date("2026-09-30"), tarefas: [tarefa({ prazo: null })] }),
    );
    expect(r).toEqual([]);
  });

  it("sem prazo em lugar nenhum é recusado", () => {
    // Sem prazo não existe atraso, e sem atraso o painel nunca fica vermelho —
    // o que é bem diferente de estar tudo em dia.
    const r = validarOrdemDeServico(os({ prazo: null, tarefas: [tarefa({ prazo: null })] }));
    expect(r.map((x) => x.campo)).toContain("tarefas[0].prazo");
  });

  it("título em branco não conta como título", () => {
    const r = validarOrdemDeServico(os({ tarefas: [tarefa({ titulo: "   " })] }));
    expect(r.map((x) => x.campo)).toContain("tarefas[0].titulo");
  });

  it("OS sem tarefa nenhuma é válida — nem toda ordem vira lista na hora", () => {
    expect(validarOrdemDeServico(os({ tarefas: [] }))).toEqual([]);
  });
});
