import { describe, it, expect, vi } from "vitest";
import {
  validarDelegacao,
  pulouOGerente,
  delegar,
  caminhoDoComando,
} from "./delegacao";
import { validarFalha, abrirFalha, aceitarRisco, saudeDoDepartamento } from "./naoConformidade";

const delegacao = (over = {}) => ({
  dePositionId: "diretor-foocci",
  paraPositionId: "agente-sdr-ia",
  objetivo: "ligar a Sala de Vendas até o fim do mês",
  ...over,
});

const falha = (over = {}) => ({
  titulo: "SDR respondeu fora do script",
  descricao: "Ofereceu desconto não catalogado em três conversas.",
  gravidade: "MEDIA" as const,
  evidencia: ["conversa 4821", "conversa 4830"],
  encontradaPorId: "auditor1",
  ...over,
});

describe("o que uma delegação precisa ter", () => {
  it("uma delegação completa passa", () => {
    // A metade que PASSA: sem ela, uma validação que recusasse tudo ficaria
    // verde nos testes abaixo.
    expect(validarDelegacao(delegacao())).toEqual([]);
  });

  it("sem objetivo não passa", () => {
    expect(validarDelegacao(delegacao({ objetivo: "  " })).map((r) => r.campo)).toContain(
      "objetivo",
    );
  });

  it("ninguém delega para si mesmo", () => {
    // Não é delegação, é anotar uma tarefa — e poluiria o indicador de pulo com
    // linhas que não descrevem comando nenhum.
    const r = validarDelegacao(delegacao({ paraPositionId: "diretor-foocci" }));
    expect(r.map((x) => x.campo)).toContain("cargos");
  });

  it("delegação sem destino não passa", () => {
    expect(validarDelegacao(delegacao({ paraPositionId: "" })).map((r) => r.campo)).toContain(
      "cargos",
    );
  });
});

describe("quando a ordem pula o Agente Gerente", () => {
  it("Diretor mandando direto em quem executa: pulou", () => {
    expect(pulouOGerente({ nivelDeQuemDelega: "DIRETOR", nivelDeQuemRecebe: "OPERACAO" })).toBe(
      true,
    );
  });

  it("CEO mandando direto em quem executa: pulou", () => {
    expect(pulouOGerente({ nivelDeQuemDelega: "CEO", nivelDeQuemRecebe: "OPERACAO" })).toBe(true);
  });

  it("Diretor mandando no Agente Gerente: NÃO pulou — é o caminho normal", () => {
    expect(pulouOGerente({ nivelDeQuemDelega: "DIRETOR", nivelDeQuemRecebe: "GERENTE" })).toBe(
      false,
    );
  });

  it("Gerente mandando no time dele: NÃO pulou — é o trabalho dele", () => {
    expect(pulouOGerente({ nivelDeQuemDelega: "GERENTE", nivelDeQuemRecebe: "OPERACAO" })).toBe(
      false,
    );
  });
});

describe("registrar a delegação", () => {
  function bancoFalso(de: string, para: string, deptDoDestino: string | null = "vendas") {
    return {
      position: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ nivel: de })
          .mockResolvedValueOnce({ nivel: para, departmentId: deptDoDestino }),
      },
      delegacao: { create: vi.fn().mockResolvedValue({ id: "d1" }) },
    };
  }

  it("o pulo é GRAVADO, não deduzido depois", async () => {
    // O organograma muda. Um relatório de junho precisa dizer o que era verdade
    // em junho, não o que seria verdade hoje.
    const db = bancoFalso("DIRETOR", "OPERACAO");
    const r = await delegar(db as never, delegacao());

    expect(r).toEqual({ ok: true, delegacaoId: "d1", pulouGerente: true });
    expect(db.delegacao.create.mock.calls[0]![0].data.pulouGerente).toBe(true);
  });

  it("o caminho normal grava pulo falso", async () => {
    const db = bancoFalso("DIRETOR", "GERENTE");
    const r = await delegar(db as never, delegacao());
    expect(r.ok && r.pulouGerente).toBe(false);
  });

  it("sem departamento explícito, herda o de quem recebe", async () => {
    // É lá que o trabalho vai acontecer.
    const db = bancoFalso("GERENTE", "OPERACAO", "financeiro");
    await delegar(db as never, delegacao());
    expect(db.delegacao.create.mock.calls[0]![0].data.departmentId).toBe("financeiro");
  });

  it("cargo inexistente é recusado, e nada é gravado", async () => {
    const db = {
      position: { findUnique: vi.fn().mockResolvedValue(null) },
      delegacao: { create: vi.fn() },
    };
    const r = await delegar(db as never, delegacao());

    expect(r.ok).toBe(false);
    expect(db.delegacao.create).not.toHaveBeenCalled();
  });
});

describe("o indicador do caminho do comando", () => {
  const db = (total: number, pularam: number) => ({
    delegacao: { count: vi.fn().mockResolvedValueOnce(total).mockResolvedValueOnce(pularam) },
  });

  const janela = { de: new Date("2026-08-01"), ate: new Date("2026-08-31") };

  it("sem delegação nenhuma NÃO é saudável — é sem dados", async () => {
    // Zero de zero não é zero por cento. Pintar de verde afirmaria uma saúde
    // que ninguém mediu.
    const r = await caminhoDoComando(db(0, 0) as never, janela);
    expect(r.leitura).toBe("semDados");
    expect(r.proporcao).toBeNull();
  });

  it("pulos raros: saudável", async () => {
    const r = await caminhoDoComando(db(20, 1) as never, janela);
    expect(r.leitura).toBe("saudavel");
    expect(r.proporcao).toBeCloseTo(0.05);
  });

  it("pulo virou rotina: atenção", async () => {
    // Trinta por cento das ordens pulando o gerente não é indisciplina — é uma
    // estrutura que não está funcionando.
    const r = await caminhoDoComando(db(10, 3) as never, janela);
    expect(r.leitura).toBe("atencao");
  });

  it("um pulo em dez ainda é exceção", async () => {
    expect((await caminhoDoComando(db(10, 1) as never, janela)).leitura).toBe("saudavel");
  });
});

describe("não conformidade: ausência de evidência não é aprovação", () => {
  it("uma falha com evidência passa", () => {
    expect(validarFalha(falha())).toEqual([]);
  });

  it("falha SEM evidência é recusada", () => {
    // Sem prova, a auditoria vira opinião — e opinião não bloqueia rollout.
    const r = validarFalha(falha({ evidencia: [] }));
    expect(r.map((x) => x.campo)).toContain("evidencia");
  });

  it("falha bloqueante sem plano de ação é recusada", () => {
    // Alarme sem saída: para a operação e não diz como voltar.
    const r = validarFalha(falha({ gravidade: "BLOQUEANTE" }));
    expect(r.map((x) => x.campo)).toContain("planoDeAcao");
  });

  it("bloqueante COM plano passa", () => {
    const r = validarFalha(falha({ gravidade: "BLOQUEANTE", planoDeAcao: "reverter a versão" }));
    expect(r).toEqual([]);
  });

  it("toda falha tem quem a encontrou", () => {
    expect(validarFalha(falha({ encontradaPorId: "" })).map((x) => x.campo)).toContain(
      "encontradaPorId",
    );
  });

  it("falha inválida não chega ao banco", async () => {
    const db = { naoConformidade: { create: vi.fn() } };
    await abrirFalha(db as never, falha({ evidencia: [] }));
    expect(db.naoConformidade.create).not.toHaveBeenCalled();
  });
});

describe("quem audita não assina a liberação do que auditou", () => {
  function bancoFalso(encontradaPor: string | null, situacao = "ABERTA", count = 1) {
    return {
      naoConformidade: {
        findUnique: vi.fn().mockResolvedValue({ encontradaPorId: encontradaPor, situacao }),
        updateMany: vi.fn().mockResolvedValue({ count }),
      },
    };
  }

  it("outra pessoa pode aceitar o risco", () => {
    // A metade que PASSA. Aceitar risco é decisão executiva legítima: nem tudo
    // se conserta, e às vezes consertar custa mais que o defeito.
    const db = bancoFalso("auditor1");
    return expect(
      aceitarRisco(db as never, { falhaId: "f1", aceitaPorId: "diretor1", motivo: "custo maior" }),
    ).resolves.toEqual({ ok: true, falhaId: "f1" });
  });

  it("quem encontrou NÃO aceita — mesmo com motivo escrito", async () => {
    const db = bancoFalso("auditor1");
    const r = await aceitarRisco(db as never, {
      falhaId: "f1",
      aceitaPorId: "auditor1",
      motivo: "eu mesmo acho que não é grave",
    });

    expect(r).toEqual({ ok: false, causa: "mesmaPessoa" });
    expect(db.naoConformidade.updateMany).not.toHaveBeenCalled();
  });

  it("aceitar sem motivo não passa, e não toca no banco", async () => {
    const db = bancoFalso("auditor1");
    const r = await aceitarRisco(db as never, { falhaId: "f1", aceitaPorId: "d1", motivo: " " });

    expect(r).toEqual({ ok: false, causa: "semMotivo" });
    expect(db.naoConformidade.findUnique).not.toHaveBeenCalled();
  });

  it("a escrita é condicional na situação — dois aceites não produzem dois registros", async () => {
    const db = bancoFalso("auditor1", "ABERTA", 1);
    await aceitarRisco(db as never, { falhaId: "f1", aceitaPorId: "d1", motivo: "ok" });

    const where = db.naoConformidade.updateMany.mock.calls[0]![0].where;
    expect(where.situacao).toEqual({ in: ["ABERTA", "EM_TRATAMENTO"] });
  });
});

describe("a saúde do departamento", () => {
  const db = (abertas: number, bloqueantes: number, aceitas: number, total: number) => ({
    naoConformidade: {
      count: vi
        .fn()
        .mockResolvedValueOnce(abertas)
        .mockResolvedValueOnce(bloqueantes)
        .mockResolvedValueOnce(aceitas)
        .mockResolvedValueOnce(total),
    },
  });

  it("departamento NUNCA auditado não é 'limpo'", async () => {
    // A mentira mais cara desta tela: nunca auditado e auditado-e-limpo são os
    // dois zero, e só um é boa notícia.
    const r = await saudeDoDepartamento(db(0, 0, 0, 0) as never, "vendas");
    expect(r.leitura).toBe("semAuditoria");
  });

  it("auditado e sem falha aberta é limpo", async () => {
    expect((await saudeDoDepartamento(db(0, 0, 2, 5) as never, "vendas")).leitura).toBe("limpo");
  });

  it("falha aberta é atenção", async () => {
    expect((await saudeDoDepartamento(db(3, 0, 0, 3) as never, "vendas")).leitura).toBe("atencao");
  });

  it("bloqueante manda em tudo", async () => {
    // Uma bloqueante aberta não vira "atenção" só porque as outras estão bem.
    expect((await saudeDoDepartamento(db(4, 1, 0, 5) as never, "vendas")).leitura).toBe(
      "bloqueado",
    );
  });
});
