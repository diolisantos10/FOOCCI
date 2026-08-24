import { describe, it, expect, vi } from "vitest";
import {
  posseDoItem,
  podeIrPara,
  validarHandoff,
  situacaoDoSla,
  aceitarHandoff,
  recusarHandoff,
  type NovoHandoff,
} from "./handoff";

const base = (over: Partial<NovoHandoff> = {}): NovoHandoff => ({
  origemDepartmentId: "vendas",
  destinoDepartmentId: "implantacao",
  resumo: "Cliente fechou; segue para implantação.",
  entregaveis: ["dossiê de vendas", "contrato assinado"],
  taskId: "t1",
  ...over,
});

describe("de quem é o item", () => {
  it("enquanto o handoff está ENVIADO, o item é do emissor", () => {
    // É a frase do documento 09 virada em código: quem envia continua
    // responsável até alguém aceitar. Sem isso, o trabalho fica no limbo entre
    // dois departamentos, e o limbo não tem dono.
    expect(posseDoItem("ENVIADO")).toBe("emissor");
  });

  it("ACEITO é o único estado em que a posse muda", () => {
    expect(posseDoItem("ACEITO")).toBe("destino");
  });

  it("recusado e devolvido voltam para o emissor", () => {
    expect(posseDoItem("RECUSADO")).toBe("emissor");
    expect(posseDoItem("DEVOLVIDO")).toBe("emissor");
  });
});

describe("transições de estado", () => {
  it("de ENVIADO dá para aceitar e recusar", () => {
    expect(podeIrPara("ENVIADO", "ACEITO")).toBe(true);
    expect(podeIrPara("ENVIADO", "RECUSADO")).toBe(true);
  });

  it("aceito não volta atrás", () => {
    // Desfazer um aceite apagaria uma passagem que aconteceu de verdade.
    // Devolver trabalho aceito é um handoff NOVO, na direção contrária — e aí a
    // linha do tempo mostra as duas passagens em vez de esconder uma.
    expect(podeIrPara("ACEITO", "DEVOLVIDO")).toBe(false);
    expect(podeIrPara("ACEITO", "ENVIADO")).toBe(false);
    expect(podeIrPara("ACEITO", "RECUSADO")).toBe(false);
  });

  it("recusado e devolvido são finais", () => {
    for (const destino of ["ACEITO", "ENVIADO", "RECUSADO", "DEVOLVIDO"] as const) {
      expect(podeIrPara("RECUSADO", destino)).toBe(false);
      expect(podeIrPara("DEVOLVIDO", destino)).toBe(false);
    }
  });
});

describe("o que um handoff precisa ter para existir", () => {
  it("um handoff completo passa", () => {
    // A metade que PASSA. Sem ela, uma validação que recusasse tudo estaria
    // "verde" nos testes abaixo.
    expect(validarHandoff(base())).toEqual([]);
  });

  it("sem item, não há o que passar", () => {
    const r = validarHandoff(base({ taskId: null }));
    expect(r.map((x) => x.campo)).toContain("item");
  });

  it("com dois itens, o aceite moveria duas coisas ao mesmo tempo", () => {
    const r = validarHandoff(base({ taskId: "t1", projectId: "p1" }));
    expect(r.map((x) => x.campo)).toContain("item");
  });

  it("sem entregável é conversa, não passagem de trabalho", () => {
    const r = validarHandoff(base({ entregaveis: [] }));
    expect(r.map((x) => x.campo)).toContain("entregaveis");
  });

  it("resumo em branco não conta como resumo", () => {
    expect(validarHandoff(base({ resumo: "   " })).map((x) => x.campo)).toContain("resumo");
  });

  it("não se passa trabalho para o próprio departamento", () => {
    const r = validarHandoff(base({ destinoDepartmentId: "vendas" }));
    expect(r.map((x) => x.campo)).toContain("departamentos");
  });

  it("SLA zero é recusado — 'sem SLA' se escreve com null", () => {
    // SLA 0 não é ausência de prazo: é um prazo vencido no instante do envio.
    expect(validarHandoff(base({ slaHoras: 0 })).map((x) => x.campo)).toContain("slaHoras");
    expect(validarHandoff(base({ slaHoras: null }))).toEqual([]);
    expect(validarHandoff(base({ slaHoras: 24 }))).toEqual([]);
  });

  it("acusa TODAS as faltas de uma vez, não a primeira", () => {
    // Devolver uma por vez faria quem preenche o formulário descobrir os erros
    // em série, num vai-e-volta.
    const r = validarHandoff({
      origemDepartmentId: "vendas",
      destinoDepartmentId: "vendas",
      resumo: "",
      entregaveis: [],
    });
    expect(r.length).toBeGreaterThanOrEqual(4);
  });
});

describe("SLA de aceite", () => {
  const enviadoEm = new Date("2026-08-24T10:00:00Z");

  it("sem SLA acordado NÃO é 'dentro do prazo'", () => {
    // A tentação é pintar de verde e seguir. Verde afirmaria um acordo que
    // ninguém fez — a mesma mentira que o tipo `Medida` existe para impedir na
    // Sala dos Agentes.
    const s = situacaoDoSla({ status: "ENVIADO", slaHoras: null, enviadoEm }, enviadoEm);
    expect(s.estado).toBe("semSla");
  });

  it("dentro do prazo diz quantas horas faltam", () => {
    const s = situacaoDoSla(
      { status: "ENVIADO", slaHoras: 24, enviadoEm },
      new Date("2026-08-24T16:00:00Z"),
    );
    expect(s).toEqual({ estado: "dentro", horasRestantes: 18 });
  });

  it("vencido diz há quanto tempo", () => {
    const s = situacaoDoSla(
      { status: "ENVIADO", slaHoras: 4, enviadoEm },
      new Date("2026-08-24T16:00:00Z"),
    );
    expect(s).toEqual({ estado: "vencido", horasVencidas: 2 });
  });

  it("o instante exato do limite ainda está dentro", () => {
    const s = situacaoDoSla(
      { status: "ENVIADO", slaHoras: 6, enviadoEm },
      new Date("2026-08-24T16:00:00Z"),
    );
    expect(s).toEqual({ estado: "dentro", horasRestantes: 0 });
  });

  it("handoff já aceito não tem SLA de aceite correndo", () => {
    const s = situacaoDoSla(
      { status: "ACEITO", slaHoras: 1, enviadoEm },
      new Date("2026-08-25T10:00:00Z"),
    );
    expect(s.estado).toBe("naoSeAplica");
  });
});

describe("o aceite é escrita condicional, não leitura seguida de escrita", () => {
  function bancoFalso(contagem: number, atual: unknown = null) {
    return {
      handoff: {
        updateMany: vi.fn().mockResolvedValue({ count: contagem }),
        findUnique: vi.fn().mockResolvedValue(atual),
      },
      domainEvent: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it("a condição de estado vai DENTRO do where do update", async () => {
    // Este é o teste que protege a propriedade inteira. Se alguém trocar por
    // `findUnique` + `if` + `update`, a janela de corrida volta e nada mais
    // reclama — nem o compilador, nem os outros testes.
    const db = bancoFalso(1);
    await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    const where = db.handoff.updateMany.mock.calls[0]![0].where;
    expect(where).toEqual({ id: "h1", status: "ENVIADO" });
  });

  it("quem ganha a corrida recebe ok e a linha do tempo registra", async () => {
    const db = bancoFalso(1);
    const r = await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    expect(r).toEqual({ ok: true, handoffId: "h1" });
    expect(db.domainEvent.create).toHaveBeenCalledOnce();
    expect(db.domainEvent.create.mock.calls[0]![0].data.tipo).toBe("handoff.aceito");
  });

  it("quem perde recebe recusa explicada, não sucesso falso", async () => {
    const db = bancoFalso(0, { status: "ACEITO", aceitoPorId: "outro" });
    const r = await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    expect(r).toEqual({ ok: false, causa: "jaResolvido", status: "ACEITO", aceitoPorId: "outro" });
  });

  it("quem perde NÃO gera evento — senão a linha do tempo mostraria dois aceites", async () => {
    const db = bancoFalso(0, { status: "ACEITO", aceitoPorId: "outro" });
    await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    expect(db.domainEvent.create).not.toHaveBeenCalled();
  });

  it("handoff inexistente é distinguido de handoff já resolvido", async () => {
    // As duas coisas produzem `count: 0`. A tela precisa saber a diferença:
    // uma é "chegou tarde", a outra é "esse link está quebrado".
    const db = bancoFalso(0, null);
    const r = await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    expect(r).toEqual({ ok: false, causa: "naoExiste" });
  });

  it("a leitura só acontece DEPOIS de perder — nunca antes de escrever", async () => {
    const db = bancoFalso(1);
    await aceitarHandoff(db as never, { handoffId: "h1", aceitoPorId: "u1" });

    // No caminho feliz não se lê nada: ler antes seria justamente a janela.
    expect(db.handoff.findUnique).not.toHaveBeenCalled();
  });
});

describe("a recusa tem a mesma trava, e exige motivo", () => {
  function bancoFalso(contagem: number, atual: unknown = null) {
    return {
      handoff: {
        updateMany: vi.fn().mockResolvedValue({ count: contagem }),
        findUnique: vi.fn().mockResolvedValue(atual),
      },
      domainEvent: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it("recusar sem motivo não passa, e não toca no banco", async () => {
    const db = bancoFalso(1);
    const r = await recusarHandoff(db as never, { handoffId: "h1", motivo: "  " });

    expect(r).toEqual({ ok: false, causa: "semMotivo" });
    expect(db.handoff.updateMany).not.toHaveBeenCalled();
  });

  it("recusar também é escrita condicional", async () => {
    const db = bancoFalso(1);
    await recusarHandoff(db as never, { handoffId: "h1", motivo: "faltou o contrato" });

    expect(db.handoff.updateMany.mock.calls[0]![0].where).toEqual({ id: "h1", status: "ENVIADO" });
  });

  it("aceitar e recusar ao mesmo tempo: só um vence", async () => {
    // Sem a condição no where, o resultado dependeria de quem escreveu por
    // último — e o handoff acabaria ACEITO ou RECUSADO por sorteio.
    const db = bancoFalso(0, { status: "ACEITO" });
    const r = await recusarHandoff(db as never, { handoffId: "h1", motivo: "tarde demais" });

    expect(r).toEqual({ ok: false, causa: "jaResolvido", status: "ACEITO" });
  });
});
