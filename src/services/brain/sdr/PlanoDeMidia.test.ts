import { describe, it, expect } from "vitest";

import { gerarPlano, renderizarPlano, lerData } from "./PlanoDeMidia";
import { CAMPOS_DA_FICHA, type EstadoDaSondagem } from "../oficina/Sondagem";

const HOJE = new Date("2026-07-29T12:00:00Z");

function fichaCheia(over: Record<string, string> = {}) {
  const f: Record<string, string> = {};
  for (const c of CAMPOS_DA_FICHA) f[c.chave] = "respondido";
  f.data_inicio = "03/08/2026";
  return { ...f, ...over };
}

function estadoPronto(servicos: EstadoDaSondagem["servicos"], over: Record<string, string> = {}): EstadoDaSondagem {
  return { ficha: fichaCheia(over), servicos };
}

const REELS_8 = { chave: "reels", origemDoInsumo: "agencia" as const, definicoes: { tipo_de_reels: "ambiente", quantidade: "8" } };

// ─────────────────────────────────────────────────────────────────────────────

describe("defeito 1 — o plano sem data", () => {
  it("toda linha nasce com data e dia da semana", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), hoje: HOJE });
    expect(p.liberado).toBe(true);
    expect(p.linhas.length).toBeGreaterThan(0);
    for (const l of p.linhas) {
      expect(l.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.diaDaSemana.length).toBeGreaterThan(3);
    }
  });

  it("as datas ficam dentro do período e em ordem", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), hoje: HOJE });
    const datas = p.linhas.map((l) => l.data);
    expect([...datas].sort()).toEqual(datas);
    expect(datas[0]! >= p.inicio!).toBe(true);
    expect(datas[datas.length - 1]! <= p.fim!).toBe(true);
  });

  it("data em texto vago NÃO vira data presumida — trava pedindo o dia", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8], { data_inicio: "semana que vem" }), hoje: HOJE });
    expect(p.liberado).toBe(false);
    expect(p.motivo).toMatch(/não é uma data/i);
    expect(p.motivo).toContain("semana que vem");
  });

  it("as peças não se empilham no primeiro dia", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), hoje: HOJE });
    expect(new Set(p.linhas.map((l) => l.data)).size).toBeGreaterThan(1);
  });
});

describe("defeito 2 — prometer material que ninguém sabe se existe", () => {
  it("serviço sem origem definida não gera plano nenhum", () => {
    const p = gerarPlano({ estado: estadoPronto([{ chave: "reels", definicoes: { tipo_de_reels: "x", quantidade: "8" } }]), hoje: HOJE });
    expect(p.liberado).toBe(false);
    expect(p.linhas).toHaveLength(0);
  });

  it("cada linha carrega quem traz o material", () => {
    const p = gerarPlano({
      estado: estadoPronto([{ ...REELS_8, origemDoInsumo: "cliente", quemExecuta: "a dona" }]),
      hoje: HOJE,
    });
    expect(p.linhas.every((l) => l.quemTrazOMaterial.includes("cliente entrega"))).toBe(true);
    expect(p.linhas.every((l) => l.dependeDoCliente)).toBe(true);
  });

  it("avisa quando o calendário depende de material do cliente", () => {
    const p = gerarPlano({
      estado: estadoPronto([{ ...REELS_8, origemDoInsumo: "cliente", quemExecuta: "a dona" }]),
      hoje: HOJE,
    });
    expect(p.avisos.join(" ")).toMatch(/dependem de material que o cliente entrega/i);
  });

  it("material da agência não vira dependência do cliente", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), hoje: HOJE });
    expect(p.linhas.some((l) => l.dependeDoCliente)).toBe(false);
  });
});

describe("defeito 3 — esconder o que não se sabe", () => {
  it("o que o cliente não respondeu vai declarado, com a pergunta", () => {
    const ficha = fichaCheia();
    delete (ficha as Record<string, unknown>).metricas_atuais;
    const p = gerarPlano({
      estado: { ficha, perguntadas: ["metricas_atuais"], servicos: [REELS_8] },
      hoje: HOJE,
    });
    expect(p.liberado).toBe(true);
    expect(p.pendenciasDeclaradas.map((x) => x.chave)).toContain("metricas_atuais");
    expect(p.pendenciasDeclaradas[0]?.pergunta.length).toBeGreaterThan(10);
  });

  it("serviço contratado sem quantidade não some calado", () => {
    const p = gerarPlano({
      estado: estadoPronto([{ chave: "carrossel", origemDoInsumo: "agencia", definicoes: { quantidade: "sei lá" } }]),
      hoje: HOJE,
    });
    expect(p.avisos.join(" ")).toMatch(/falta a quantidade/i);
  });
});

describe("ritmo dos serviços", () => {
  it("stories é semanal — 3 por semana em 4 semanas dá 12", () => {
    const p = gerarPlano({
      estado: estadoPronto([{ chave: "story", origemDoInsumo: "agencia", definicoes: { quantidade: "3 por semana" } }]),
      hoje: HOJE,
    });
    expect(p.linhas).toHaveLength(12);
  });

  it("reels é mensal — 8 por mês em 4 semanas dá 8", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), hoje: HOJE });
    expect(p.linhas).toHaveLength(8);
  });

  it("8 por mês em 8 semanas dá 16", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), semanas: 8, hoje: HOJE });
    expect(p.linhas).toHaveLength(16);
  });

  it("serviço contínuo não vira linha de calendário", () => {
    const p = gerarPlano({
      estado: estadoPronto([REELS_8, { chave: "trafego", origemDoInsumo: "agencia", definicoes: { verba: "R$ 1.000", destino: "WhatsApp" } }]),
      hoje: HOJE,
    });
    expect(p.linhas.some((l) => l.servico === "trafego")).toBe(false);
    expect(p.continuos.map((c) => c.servico)).toContain("trafego");
  });
});

describe("lerData", () => {
  it("lê os formatos que o cliente usa", () => {
    expect(lerData("2026-08-05", HOJE)).toBe("2026-08-05");
    expect(lerData("05/08/2026", HOJE)).toBe("2026-08-05");
    expect(lerData("5/8", HOJE)).toBe("2026-08-05");
    expect(lerData("dia 5 de agosto", HOJE)).toBe("2026-08-05");
    expect(lerData("começamos 5/8/26", HOJE)).toBe("2026-08-05");
  });

  it("data sem ano que já passou vira o ano que vem", () => {
    expect(lerData("10 de janeiro", HOJE)).toBe("2027-01-10");
  });

  it("recusa o que não é data", () => {
    expect(lerData("semana que vem", HOJE)).toBeNull();
    expect(lerData("assim que possível", HOJE)).toBeNull();
    expect(lerData("", HOJE)).toBeNull();
    expect(lerData("32/13/2026", HOJE)).toBeNull();
  });
});

describe("o texto que vai pra proposta", () => {
  it("plano bloqueado imprime o motivo, não um calendário", () => {
    const texto = renderizarPlano(gerarPlano({ estado: { ficha: {} }, hoje: HOJE }));
    expect(texto).toMatch(/NÃO LIBERADO/);
    expect(texto).not.toMatch(/CALENDÁRIO/);
  });

  it("plano liberado traz datas, dono do material e rodapé de pendências", () => {
    const ficha = fichaCheia();
    delete (ficha as Record<string, unknown>).historico;
    const texto = renderizarPlano(gerarPlano({
      estado: { ficha, perguntadas: ["historico"], servicos: [{ ...REELS_8, origemDoInsumo: "cliente", quemExecuta: "a dona" }] },
      hoje: HOJE,
    }));
    expect(texto).toMatch(/CALENDÁRIO — 2026-08-03/);
    expect(texto).toMatch(/cliente entrega/);
    expect(texto).toMatch(/AINDA AGUARDANDO SUA RESPOSTA/);
  });

  it("início explícito ganha do que está na ficha", () => {
    const p = gerarPlano({ estado: estadoPronto([REELS_8]), inicioEm: "2026-09-01", hoje: HOJE });
    expect(p.inicio).toBe("2026-09-01");
  });
});
