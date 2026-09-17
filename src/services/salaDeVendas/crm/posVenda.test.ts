/**
 * PÓS-VENDA — ganho → cliente → jornada, e o churn com regra escrita.
 *
 * O caso que dá nome ao bloco é o do documento: *"Lead NÃO volta para o início.
 * Ele se torna CLIENTE."* Prová-lo exige um banco falso que respeite a
 * restrição `Cliente.oportunidadeId` única — sem ela, "ganhar duas vezes cria
 * dois clientes" passaria despercebido.
 */

import { describe, it, expect, vi } from "vitest";
import {
  REGUA_DE_CHURN,
  REGUA_DO_POS_VENDA,
  SINAIS_DE_CHURN,
  abrirJornadaDoCliente,
  aplicarRiscoDeChurn,
  avaliarRiscoDeChurn,
  chaveDoMarco,
  ganharEAbrirPosVenda,
  proximosPassosDoCliente,
  type FichaDoCliente,
} from "./posVenda";

const AGORA = new Date("2026-09-17T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);

function conta(p: Partial<FichaDoCliente> = {}): FichaDoCliente {
  return {
    id: "cli-1",
    situacao: "ATIVO",
    ganhoEm: diasAtras(200),
    ativadoEm: diasAtras(190),
    passosDeAtivacao: ["cardápio publicado"],
    saude: 80,
    saudeEm: diasAtras(5),
    nps: 9,
    npsEm: diasAtras(5),
    riscoDeChurn: null,
    motivoDoRisco: null,
    ultimaCompraEm: diasAtras(10),
    recompras: 1,
    upsells: 0,
    receitaTotalCents: 150_000,
    ...p,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A JORNADA DO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

describe("proximosPassosDoCliente — a jornada que o documento nomeia", () => {
  it("comprou e não ligou: a ativação é a única pauta, e o porquê diz onde o churn nasce", () => {
    const acoes = proximosPassosDoCliente(conta({ ativadoEm: null, ganhoEm: diasAtras(30) }), AGORA);
    expect(acoes.map((a) => a.marco)).toEqual(["ATIVACAO"]);
    expect(acoes[0]!.porque).toContain("churn nasce");
  });

  it("não se pergunta NPS de quem ainda não usou o produto", () => {
    const acoes = proximosPassosDoCliente(conta({ ativadoEm: null, ganhoEm: diasAtras(60), nps: null }), AGORA);
    expect(acoes.map((a) => a.marco)).not.toContain("NPS");
  });

  it("ativo há tempo e sem saúde medida pede acompanhamento", () => {
    const acoes = proximosPassosDoCliente(
      conta({ ativadoEm: diasAtras(REGUA_DO_POS_VENDA.diasParaPrimeiroAcompanhamento + 1), saude: null, nps: 9 }),
      AGORA,
    );
    expect(acoes.map((a) => a.marco)).toContain("ACOMPANHAMENTO");
  });

  it("ativo há mais de um mês e sem NPS pede a pesquisa", () => {
    const acoes = proximosPassosDoCliente(
      conta({ ativadoEm: diasAtras(REGUA_DO_POS_VENDA.diasAtivoParaNps + 1), nps: null, saude: 80 }),
      AGORA,
    );
    expect(acoes.map((a) => a.marco)).toContain("NPS");
  });

  it("⭐ detrator recebe SUPORTE — nunca oferta", () => {
    const acoes = proximosPassosDoCliente(conta({ nps: 4 }), AGORA);
    const suporte = acoes.find((a) => a.marco === "SUPORTE");
    expect(suporte).toBeTruthy();
    expect(suporte!.porque).toContain("socorro");
  });

  it("muito tempo sem compra nova abre a pauta de recompra", () => {
    const acoes = proximosPassosDoCliente(
      conta({ ultimaCompraEm: diasAtras(REGUA_DO_POS_VENDA.diasSemCompraParaRecompra + 1) }),
      AGORA,
    );
    expect(acoes.map((a) => a.marco)).toContain("RECOMPRA");
  });

  it("conta inativa pede reativação", () => {
    const acoes = proximosPassosDoCliente(conta({ situacao: "INATIVO" }), AGORA);
    expect(acoes.map((a) => a.marco)).toContain("REATIVACAO");
  });

  it("conta cancelada não tem pauta — reconquista é oportunidade nova, não jornada velha", () => {
    expect(proximosPassosDoCliente(conta({ situacao: "CANCELADO" }), AGORA)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CHURN
// ─────────────────────────────────────────────────────────────────────────────

describe("sinal de churn — regra escrita, e nunca achismo", () => {
  it("todo sinal tem código, peso e descrição", () => {
    for (const s of SINAIS_DE_CHURN) {
      expect(s.codigo).toMatch(/^[a-z-]+$/);
      expect(s.peso).toBeGreaterThan(0);
      expect(s.descricao.length).toBeGreaterThan(10);
    }
  });

  it("conta saudável e medida dá risco ZERO — e zero aqui significa 'olhei'", () => {
    const l = avaliarRiscoDeChurn(conta(), AGORA);
    expect(l.risco).toBe(0);
    expect(l.sinais).toEqual([]);
  });

  it("⭐ conta sem NADA medido dá risco NULL — não medido não é zero", () => {
    const l = avaliarRiscoDeChurn(
      conta({ ativadoEm: null, saude: null, nps: null, ganhoEm: diasAtras(1), ultimaCompraEm: null, situacao: "EM_ATIVACAO" }),
      AGORA,
    );
    expect(l.risco).toBeNull();
    expect(l.motivo).toContain("não medido não é zero");
  });

  it("⚠️ saúde null NÃO é saúde ruim, e NPS null NÃO é detrator", () => {
    const l = avaliarRiscoDeChurn(conta({ saude: null, nps: null }), AGORA);
    expect(l.sinais).not.toContain("saude-baixa");
    expect(l.sinais).not.toContain("detrator");
  });

  it("comprou e não ligou é o sinal mais pesado", () => {
    const l = avaliarRiscoDeChurn(
      conta({ situacao: "EM_ATIVACAO", ativadoEm: null, ganhoEm: diasAtras(REGUA_DE_CHURN.diasSemAtivar + 1), saude: null, nps: null, ultimaCompraEm: null }),
      AGORA,
    );
    expect(l.sinais).toContain("nao-ativou");
    expect(l.risco).toBeGreaterThanOrEqual(REGUA_DE_CHURN.limiarDeRisco);
    expect(l.motivo).toContain("não ligou o produto");
  });

  it("sinais somam, e a soma é limitada a 100", () => {
    const l = avaliarRiscoDeChurn(
      conta({ situacao: "INATIVO", saude: 10, nps: 2, ultimaCompraEm: diasAtras(400) }),
      AGORA,
    );
    expect(l.risco).toBe(100);
    expect(l.sinais.length).toBeGreaterThanOrEqual(4);
  });

  it("conta cancelada é risco 100 com motivo próprio", () => {
    expect(avaliarRiscoDeChurn(conta({ situacao: "CANCELADO" }), AGORA)).toMatchObject({ risco: 100 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O BANCO FALSO
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, any>;

function bancoFalso() {
  const oportunidades: Linha[] = [
    { id: "op-1", empresaId: "emp-1", estagio: "NEGOCIACAO", valorPotencialCents: 120_000 },
  ];
  const clientes: Linha[] = [];
  const eventos: Linha[] = [];
  let seq = 0;

  const db: any = {
    oportunidade: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const o of oportunidades) {
          if (o.id !== where.id) continue;
          if (where.estagio && o.estagio !== where.estagio) continue;
          Object.assign(o, data);
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: any) => oportunidades.find((o) => o.id === where.id) ?? null,
    },
    cliente: {
      createMany: async ({ data }: any) => {
        const novo = data[0]!;
        // ⭐ A restrição que importa: `oportunidadeId` é única.
        if (clientes.some((c) => c.oportunidadeId === novo.oportunidadeId)) return { count: 0 };
        clientes.push({ id: `cli-${++seq}`, ...novo });
        return { count: 1 };
      },
      findUnique: async ({ where }: any) =>
        clientes.find((c) =>
          where.oportunidadeId ? c.oportunidadeId === where.oportunidadeId : c.id === where.id,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const c = clientes.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const c of clientes) {
          if (where.id && c.id !== where.id) continue;
          if (where.situacao && c.situacao !== where.situacao) continue;
          Object.assign(c, data);
          count += 1;
        }
        return { count };
      },
    },
    eventoDaJornada: {
      createMany: async ({ data }: any) => {
        const novo = data[0]!;
        if (novo.chaveDeIdempotencia && eventos.some((e) => e.chaveDeIdempotencia === novo.chaveDeIdempotencia)) {
          return { count: 0 };
        }
        eventos.push(novo);
        return { count: 1 };
      },
    },
  };

  return { db, oportunidades, clientes, eventos };
}

const IA = { autor: "IA" as const, label: "CRM IA" };

describe("⭐ ganhar → virar cliente → abrir a jornada de pós-venda", () => {
  it("a oportunidade ganha cria o cliente E abre a jornada, numa chamada só", async () => {
    const { db, clientes, eventos } = bancoFalso();

    const r = await ganharEAbrirPosVenda(db, {
      oportunidadeId: "op-1",
      de: "NEGOCIACAO",
      autoria: IA,
      empresaId: "emp-1",
      receitaInicialCents: 49_900,
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jornadaAberta).toBe(true);
    expect(clientes).toHaveLength(1);
    expect(clientes[0]!.situacao).toBe("EM_ATIVACAO");

    const abertura = eventos.find((e) => e.chaveDeIdempotencia === chaveDoMarco(r.clienteId, "ATIVACAO"));
    expect(abertura).toBeTruthy();
    expect(abertura!.nota).toContain("ativação");
    expect(abertura!.nota).toContain("recompra");
    expect(abertura!.nota).toContain("upsell");
  });

  it("⭐ IDEMPOTÊNCIA: ganhar duas vezes devolve o mesmo cliente e não abre a jornada duas vezes", async () => {
    const { db, clientes, eventos } = bancoFalso();
    const params = { oportunidadeId: "op-1", de: "NEGOCIACAO" as const, autoria: IA, empresaId: "emp-1", agora: AGORA };

    const primeira = await ganharEAbrirPosVenda(db, params);
    const segunda = await ganharEAbrirPosVenda(db, { ...params, de: "GANHA" as const });

    expect(primeira.ok && segunda.ok).toBe(true);
    if (!primeira.ok || !segunda.ok) return;
    expect(segunda.clienteId).toBe(primeira.clienteId);
    expect(segunda.jaEraCliente).toBe(true);
    expect(segunda.jornadaAberta).toBe(false);
    expect(clientes).toHaveLength(1);
    expect(eventos.filter((e) => e.chaveDeIdempotencia?.includes("posvenda"))).toHaveLength(1);
  });

  it("a recusa da transição de B1 continua valendo — perda não vira ganho por aqui", async () => {
    const { db, clientes } = bancoFalso();
    const r = await ganharEAbrirPosVenda(db, {
      oportunidadeId: "op-1",
      de: "PERDIDA",
      autoria: IA,
      agora: AGORA,
    });
    expect(r.ok).toBe(false);
    expect(clientes).toHaveLength(0);
  });

  it("abrir a jornada isoladamente também é idempotente", async () => {
    const { db } = bancoFalso();
    const p = { clienteId: "cli-9", autoria: IA };
    expect(await abrirJornadaDoCliente(db, p)).toEqual({ abriu: true });
    expect(await abrirJornadaDoCliente(db, p)).toEqual({ abriu: false });
  });
});

describe("aplicarRiscoDeChurn — o número só é escrito quando foi medido", () => {
  it("⭐ risco não medido não escreve nada na conta", async () => {
    const { db } = bancoFalso();
    const espiao = vi.spyOn(db.cliente, "update");

    const r = await aplicarRiscoDeChurn(db, {
      cliente: conta({
        situacao: "EM_ATIVACAO",
        ativadoEm: null,
        saude: null,
        nps: null,
        ganhoEm: diasAtras(1),
        ultimaCompraEm: null,
      }),
      autoria: IA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ escreveu: false, moveu: false });
    expect(r.leitura.risco).toBeNull();
    expect(espiao).not.toHaveBeenCalled();
  });

  it("risco acima do limiar grava o número, o motivo e move a conta para EM_RISCO", async () => {
    const { db, clientes } = bancoFalso();
    clientes.push({ id: "cli-1", situacao: "ATIVO" });

    const r = await aplicarRiscoDeChurn(db, {
      cliente: conta({ saude: 10, nps: 3 }),
      autoria: IA,
      agora: AGORA,
    });

    expect(r.escreveu).toBe(true);
    expect(r.moveu).toBe(true);
    expect(clientes[0]!.situacao).toBe("EM_RISCO");
    expect(clientes[0]!.riscoDeChurn).toBe(60);
    expect(clientes[0]!.motivoDoRisco).toContain("saúde medida abaixo do piso");
  });

  it("risco medido e baixo grava zero e NÃO move a conta", async () => {
    const { db, clientes } = bancoFalso();
    clientes.push({ id: "cli-1", situacao: "ATIVO" });

    const r = await aplicarRiscoDeChurn(db, { cliente: conta(), autoria: IA, agora: AGORA });

    expect(r).toMatchObject({ escreveu: true, moveu: false });
    expect(clientes[0]!.situacao).toBe("ATIVO");
    expect(clientes[0]!.riscoDeChurn).toBe(0);
  });
});
