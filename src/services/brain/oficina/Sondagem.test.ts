import { describe, it, expect } from "vitest";

import {
  avaliarSondagem,
  podeEntregarPlano,
  proximasPerguntas,
  CAMPOS_DA_SONDAGEM,
  EXIGENCIAS_POR_ENTREGAVEL,
} from "./Sondagem";

const VAZIA = { respostas: {} };

function comEssenciais(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {};
  for (const c of CAMPOS_DA_SONDAGEM) if (c.essencial) r[c.chave] = "respondido";
  return { respostas: { ...r, ...over } as Record<string, string> };
}

describe("a falha que originou isto", () => {
  it("NÃO libera reels sem saber se alguém aparece na câmera", () => {
    const a = avaliarSondagem(VAZIA);
    const reels = a.entregaveis.find((e) => e.entregavel === "reels com a pessoa falando");
    expect(reels?.liberado).toBe(false);
    expect(reels?.faltaSaber).toContain("alguem_na_camera");
  });

  it("NÃO libera calendário sem data, frequência e formato", () => {
    const cal = avaliarSondagem(VAZIA).entregaveis.find((e) => e.entregavel === "calendário com datas");
    expect(cal?.faltaSaber).toEqual(expect.arrayContaining(["data_inicio", "frequencia", "formatos"]));
  });

  it("libera reels quando o cliente confirma que grava", () => {
    const a = avaliarSondagem({ respostas: { alguem_na_camera: "a dona aparece", frequencia_gravacao: "2x por semana" } });
    expect(a.entregaveis.find((e) => e.entregavel === "reels com a pessoa falando")?.liberado).toBe(true);
  });

  it("'não tem vídeo' É resposta — não conta como lacuna", () => {
    const a = avaliarSondagem({ respostas: { tem_videos: false } });
    expect(a.lacunas.map((l) => l.chave)).not.toContain("tem_videos");
  });

  it("resposta em branco NÃO conta como respondida", () => {
    const a = avaliarSondagem({ respostas: { objetivo: "   ", ofertas: [] } });
    expect(a.lacunas.map((l) => l.chave)).toEqual(expect.arrayContaining(["objetivo", "ofertas"]));
  });
});

describe("a trava de passagem de bastão", () => {
  it("sondagem vazia NÃO pode entregar plano", () => {
    const r = podeEntregarPlano(VAZIA);
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/essenciais/i);
  });

  it("com todos os essenciais, libera", () => {
    expect(podeEntregarPlano(comEssenciais()).pode).toBe(true);
  });

  it("falta UM essencial e já trava", () => {
    const quase = comEssenciais();
    delete (quase.respostas as Record<string, unknown>).formatos;
    const r = podeEntregarPlano(quase);
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("formatos");
  });
});

describe("condução da conversa", () => {
  it("a próxima pergunta é sempre um essencial pendente", () => {
    expect(avaliarSondagem(VAZIA).proxima?.essencial).toBe(true);
  });

  it("toda pergunta vem com o PORQUÊ — o SDR sabe por que está perguntando", () => {
    for (const l of proximasPerguntas(VAZIA, 5)) {
      expect(l.pergunta.length).toBeGreaterThan(20);
      expect(l.porque.length).toBeGreaterThan(15);
    }
  });

  it("respondendo tudo, não sobra próxima pergunta essencial", () => {
    const a = avaliarSondagem(comEssenciais());
    expect(a.completa).toBe(true);
    expect(a.proxima?.essencial ?? false).toBe(false);
  });

  it("a cobertura sobe conforme responde", () => {
    expect(avaliarSondagem(VAZIA).cobertura).toBe(0);
    expect(avaliarSondagem(comEssenciais()).cobertura).toBe(100);
  });
});

describe("o veredito é legível por gente", () => {
  it("sondagem vazia diz o que NÃO prometer", () => {
    expect(avaliarSondagem(VAZIA).veredito).toMatch(/Não prometa/i);
  });

  it("sondagem completa mas sem insumo avisa o que ainda trava", () => {
    const v = avaliarSondagem(comEssenciais()).veredito;
    expect(v).toMatch(/completa/i);
  });
});

describe("integridade do questionário", () => {
  it("nenhuma chave duplicada", () => {
    const chaves = CAMPOS_DA_SONDAGEM.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("toda exigência aponta para um campo que existe", () => {
    const chaves = new Set(CAMPOS_DA_SONDAGEM.map((c) => c.chave));
    for (const exigidas of Object.values(EXIGENCIAS_POR_ENTREGAVEL)) {
      for (const c of exigidas) expect(chaves.has(c)).toBe(true);
    }
  });

  it("cobre os seis grupos da conversa", () => {
    const grupos = new Set(CAMPOS_DA_SONDAGEM.map((c) => c.grupo));
    expect(grupos).toEqual(new Set(["insumo", "execucao", "negocio", "objetivo", "restricao", "operacao"]));
  });
});
