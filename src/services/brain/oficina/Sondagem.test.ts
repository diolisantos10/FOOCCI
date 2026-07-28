import { describe, it, expect } from "vitest";

import {
  avaliarSondagem,
  podePropor,
  proximasPerguntas,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
  type ServicoContratado,
} from "./Sondagem";

const VAZIA: EstadoDaSondagem = {};

/** Ficha inteira respondida — o que o SDR levantou antes de falar de serviço. */
function fichaCheia(over: Record<string, string | boolean> = {}) {
  const f: Record<string, string | boolean> = {};
  for (const c of CAMPOS_DA_FICHA) f[c.chave] = "respondido";
  return { ...f, ...over };
}

/** Um serviço com tudo definido: origem, quem executa e as definições. */
function servicoFechado(chave: string, origem: "cliente" | "agencia" | "misto" = "agencia"): ServicoContratado {
  const cat = CATALOGO_DE_SERVICOS.find((s) => s.chave === chave);
  const definicoes: Record<string, string> = {};
  for (const d of cat?.definicoes ?? []) definicoes[d.chave] = "definido";
  return { chave, origemDoInsumo: origem, quemExecuta: "equipe do cliente", definicoes };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("a falha real que originou isto", () => {
  it("NÃO deixa propor reels sem saber de onde vem o vídeo", () => {
    const a = avaliarSondagem({ ficha: fichaCheia(), servicos: [{ chave: "reels" }] });
    expect(a.podePropor).toBe(false);
    const reels = a.servicos.find((s) => s.chave === "reels");
    expect(reels?.pronto).toBe(false);
    expect(reels?.origemDoInsumo).toBeNull();
    expect(reels?.quemTrazOMaterial).toMatch(/NÃO DEFINIDO/);
  });

  it("a pergunta que faltou aparece com todas as letras", () => {
    const a = avaliarSondagem({ ficha: fichaCheia(), servicos: [{ chave: "reels" }] });
    const p = a.perguntar.find((x) => x.chave === "reels.origemDoInsumo");
    expect(p?.pergunta).toMatch(/vem de você ou a gente produz/i);
  });

  it("reels NÃO é 'pessoa falando' — o formato é perguntado, não presumido", () => {
    const cat = CATALOGO_DE_SERVICOS.find((s) => s.chave === "reels");
    const tipo = cat?.definicoes.find((d) => d.chave === "tipo_de_reels");
    expect(tipo?.pergunta).toMatch(/ambiente/i);
    expect(tipo?.pergunta).toMatch(/bastidor/i);
  });

  it("também cobra o formato do reels, não só a origem", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [{ chave: "reels", origemDoInsumo: "agencia" }],
    });
    expect(a.perguntar.map((p) => p.chave)).toContain("reels.tipo_de_reels");
  });

  it("catálogo não apresentado = nem começou", () => {
    const a = avaliarSondagem({ ficha: fichaCheia() });
    expect(a.podePropor).toBe(false);
    expect(a.veredito).toMatch(/apresente o catálogo/i);
  });

  it("com tudo definido, libera a proposta", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [servicoFechado("reels", "cliente"), servicoFechado("legenda")],
    });
    expect(a.podePropor).toBe(true);
    expect(a.veredito).toMatch(/Sondagem fechada/i);
  });
});

describe("de onde vem o material", () => {
  it("cliente entrega → precisa saber QUEM produz", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [{ chave: "reels", origemDoInsumo: "cliente", definicoes: { tipo_de_reels: "ambiente", quantidade: "8" } }],
    });
    expect(a.perguntar.map((p) => p.chave)).toContain("reels.quemExecuta");
  });

  it("agência produz → não pergunta quem produz do lado do cliente", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [{ chave: "reels", origemDoInsumo: "agencia", definicoes: { tipo_de_reels: "produto", quantidade: "8" } }],
    });
    expect(a.perguntar.map((p) => p.chave)).not.toContain("reels.quemExecuta");
    expect(a.podePropor).toBe(true);
  });

  it("misto também exige dono do material", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [{ chave: "reels", origemDoInsumo: "misto", definicoes: { tipo_de_reels: "misto", quantidade: "8" } }],
    });
    expect(a.perguntar.map((p) => p.chave)).toContain("reels.quemExecuta");
  });

  it("cada serviço vira uma frase legível de quem traz o material", () => {
    const a = avaliarSondagem({
      ficha: fichaCheia(),
      servicos: [servicoFechado("reels", "cliente"), servicoFechado("arte_grafica", "agencia")],
    });
    expect(a.servicos[0]?.quemTrazOMaterial).toMatch(/cliente entrega/i);
    expect(a.servicos[1]?.quemTrazOMaterial).toMatch(/agência produz/i);
  });
});

describe("não perguntar é o pecado — não responder, não", () => {
  it("essencial nunca perguntado trava", () => {
    const a = avaliarSondagem({ servicos: [servicoFechado("legenda")] });
    expect(a.podePropor).toBe(false);
    expect(a.naoPerguntado.map((p) => p.chave)).toContain("redes_sociais");
  });

  it("perguntado e sem resposta NÃO trava — só vai declarado", () => {
    const ficha = fichaCheia();
    delete ficha.redes_sociais;
    const a = avaliarSondagem({
      ficha,
      perguntadas: ["redes_sociais"],
      servicos: [servicoFechado("legenda")],
    });
    expect(a.podePropor).toBe(true);
    expect(a.aguardandoCliente.map((p) => p.chave)).toContain("redes_sociais");
    expect(a.motivo).toMatch(/declare na proposta/i);
  });

  it("'não tenho' É resposta", () => {
    const a = avaliarSondagem({ ficha: fichaCheia({ identidade_visual: false }) });
    const chaves = [...a.naoPerguntado, ...a.aguardandoCliente].map((p) => p.chave);
    expect(chaves).not.toContain("identidade_visual");
  });

  it("resposta em branco não conta como respondida", () => {
    const a = avaliarSondagem({ ficha: fichaCheia({ objetivo: "   " }) });
    expect(a.naoPerguntado.map((p) => p.chave)).toContain("objetivo");
  });

  it("não essencial sem perguntar não trava a proposta", () => {
    const ficha = fichaCheia();
    delete ficha.concorrentes;
    const a = avaliarSondagem({ ficha, servicos: [servicoFechado("legenda")] });
    expect(a.podePropor).toBe(true);
    expect(a.naoPerguntado.map((p) => p.chave)).toContain("concorrentes");
  });
});

describe("a leitura do cliente vem antes", () => {
  it("pergunta pelas redes e pelo acesso às contas", () => {
    const chaves = CAMPOS_DA_FICHA.map((c) => c.chave);
    expect(chaves).toEqual(expect.arrayContaining(["redes_sociais", "acesso_contas", "metricas_atuais"]));
  });

  it("redes sociais e acesso são essenciais — sem isso a agência trabalha cega", () => {
    for (const chave of ["redes_sociais", "acesso_contas", "data_inicio"]) {
      expect(CAMPOS_DA_FICHA.find((c) => c.chave === chave)?.essencial).toBe(true);
    }
  });

  it("data de início é essencial — foi o que faltou no plano sem data", () => {
    const a = avaliarSondagem({ ficha: {}, servicos: [servicoFechado("legenda")] });
    expect(a.perguntar.map((p) => p.chave)).toContain("data_inicio");
  });
});

describe("condução da conversa", () => {
  it("serviço vem antes da ficha na fila — é o que trava", () => {
    const a = avaliarSondagem({ servicos: [{ chave: "reels" }] });
    expect(a.perguntar[0]?.chave).toBe("reels.origemDoInsumo");
  });

  it("toda pergunta carrega o porquê", () => {
    for (const p of proximasPerguntas({ servicos: [{ chave: "reels" }] }, 5)) {
      expect(p.pergunta.length).toBeGreaterThan(15);
      expect(p.porque.length).toBeGreaterThan(15);
    }
  });

  it("proximasPerguntas respeita a quantidade pedida", () => {
    expect(proximasPerguntas(VAZIA, 2)).toHaveLength(2);
  });

  it("a cobertura mede o essencial respondido", () => {
    expect(avaliarSondagem(VAZIA).cobertura).toBe(0);
    expect(avaliarSondagem({ ficha: fichaCheia() }).cobertura).toBe(100);
  });

  it("podePropor é a mesma decisão de avaliarSondagem", () => {
    const e = { ficha: fichaCheia(), servicos: [{ chave: "reels" }] };
    expect(podePropor(e).pode).toBe(avaliarSondagem(e).podePropor);
    expect(podePropor(e).motivo).toBe(avaliarSondagem(e).motivo);
  });
});

describe("integridade", () => {
  it("nenhuma chave de ficha duplicada", () => {
    const chaves = CAMPOS_DA_FICHA.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("nenhum serviço duplicado no catálogo", () => {
    const chaves = CATALOGO_DE_SERVICOS.map((s) => s.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("todo serviço declara qual insumo consome", () => {
    for (const s of CATALOGO_DE_SERVICOS) expect(s.insumo.trim().length).toBeGreaterThan(0);
  });

  it("cobre os cinco grupos da ficha", () => {
    const grupos = new Set(CAMPOS_DA_FICHA.map((c) => c.grupo));
    expect(grupos).toEqual(new Set(["identificacao", "presenca", "acesso", "objetivo", "restricao"]));
  });

  it("serviço fora do catálogo ainda é avaliado, não some", () => {
    const a = avaliarSondagem({ ficha: fichaCheia(), servicos: [{ chave: "podcast" }] });
    expect(a.servicos.map((s) => s.chave)).toContain("podcast");
    expect(a.podePropor).toBe(false);
  });
});
