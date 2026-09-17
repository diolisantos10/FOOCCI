/**
 * A JORNADA COMERCIAL — EMPRESA → CONTATO → DECISOR → LEAD → OPORTUNIDADE → CLIENTE.
 *
 * ── POR QUE O BANCO FALSO AQUI GUARDA ESTADO ────────────────────────────────
 *
 * Os testes vizinhos usam `vi.fn()` com resposta fixa, e isso basta para provar
 * regra pura. Não basta para provar IDEMPOTÊNCIA: "rodar duas vezes não
 * duplica" só é demonstrável contra algo que LEMBRE da primeira vez e recuse a
 * segunda. Por isso este arquivo carrega uma memória pequena que respeita as
 * restrições de unicidade que o banco realmente tem — `chaveDeDedupe`,
 * `(empresa, telefone)`, `chaveDeOrigem`, `Cliente.oportunidadeId` e
 * `EventoDaJornada.chaveDeIdempotencia`.
 *
 * Um mock que aceita tudo faria o teste de idempotência passar com o serviço
 * quebrado, que é a régua verde sobre o componente errado.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TRANSICOES_DA_EMPRESA,
  TRANSICOES_DA_OPORTUNIDADE,
  TRANSICOES_DO_CLIENTE,
  validarMovimentoDaEmpresa,
  validarMovimentoDaOportunidade,
  validarMovimentoDoCliente,
  chaveDeDedupeDaEmpresa,
  somenteDigitos,
  registrarNaTrilha,
  descobrirEmpresa,
  moverEmpresa,
  registrarProveniencia,
  registrarIcp,
  registrarContato,
  vincularLead,
  abrirOportunidade,
  moverOportunidade,
  ganharOportunidade,
  moverCliente,
  AUTORIA_SISTEMA,
  type Autoria,
} from "./jornadaComercial";

const AGORA = new Date("2026-09-17T12:00:00Z");
const IA: Autoria = { autor: "IA", label: "Hunter IA" };
const GENTE: Autoria = { autor: "HUMANO", userId: "user-1", label: "Ana" };

// ─────────────────────────────────────────────────────────────────────────────
// O banco falso — só o que este serviço usa, com as restrições que importam
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

function bancoFalso() {
  let sequencia = 0;
  const novoId = (prefixo: string) => `${prefixo}-${++sequencia}`;

  const tabelas = {
    empresa: [] as Linha[],
    contato: [] as Linha[],
    oportunidade: [] as Linha[],
    cliente: [] as Linha[],
    eventoDaJornada: [] as Linha[],
    empresaProveniencia: [] as Linha[],
    empresaFatorIcp: [] as Linha[],
    siteLead: [] as Linha[],
  };

  type Tabela = keyof typeof tabelas;

  /** As chaves únicas de verdade, por tabela. `null` numa parte = sem restrição. */
  const UNICAS: Record<Tabela, string[][]> = {
    empresa: [["chaveDeDedupe"]],
    contato: [["empresaId", "telefoneDigits"]],
    oportunidade: [["chaveDeOrigem"]],
    cliente: [["oportunidadeId"]],
    eventoDaJornada: [["chaveDeIdempotencia"]],
    empresaProveniencia: [],
    empresaFatorIcp: [],
    siteLead: [],
  };

  function colide(tabela: Tabela, linha: Linha): boolean {
    return UNICAS[tabela].some((chave) => {
      // Em Postgres, NULL não colide com NULL — é exatamente por isso que uma
      // nota sem chave de idempotência pode repetir.
      if (chave.some((c) => linha[c] === null || linha[c] === undefined)) return false;
      return tabelas[tabela].some((existente) => chave.every((c) => existente[c] === linha[c]));
    });
  }

  function casa(linha: Linha, where: Linha): boolean {
    return Object.entries(where).every(([campo, valor]) => {
      if (valor !== null && typeof valor === "object") {
        // Só a forma composta de `findUnique` (ex.: empresaId_telefoneDigits).
        return Object.entries(valor as Linha).every(([c, v]) => linha[c] === v);
      }
      return linha[campo] === valor;
    });
  }

  function achar(tabela: Tabela, where: Linha): Linha | undefined {
    const composta = Object.values(where).find((v) => v !== null && typeof v === "object") as Linha | undefined;
    const criterio = composta ?? where;
    return tabelas[tabela].find((linha) => casa(linha, criterio));
  }

  function api(tabela: Tabela, prefixo: string) {
    return {
      createMany: async ({ data, skipDuplicates }: { data: Linha[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const bruta of data) {
          const linha = { id: novoId(prefixo), ...bruta };
          if (skipDuplicates && colide(tabela, linha)) continue;
          tabelas[tabela].push(linha);
          count++;
        }
        return { count };
      },
      create: async ({ data }: { data: Linha }) => {
        const linha = { id: novoId(prefixo), ...data };
        tabelas[tabela].push(linha);
        return linha;
      },
      findUnique: async ({ where }: { where: Linha }) => achar(tabela, where) ?? null,
      findMany: async ({ where }: { where?: Linha } = {}) =>
        where ? tabelas[tabela].filter((l) => casa(l, where)) : [...tabelas[tabela]],
      updateMany: async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvos = tabelas[tabela].filter((l) => casa(l, where));
        alvos.forEach((l) => Object.assign(l, data));
        return { count: alvos.length };
      },
      update: async ({ where, data }: { where: Linha; data: Linha }) => {
        const alvo = achar(tabela, where);
        if (!alvo) throw new Error(`não achei ${tabela} para atualizar`);
        Object.assign(alvo, data);
        return alvo;
      },
    };
  }

  return {
    tabelas,
    empresa: api("empresa", "emp"),
    contato: api("contato", "ct"),
    oportunidade: api("oportunidade", "op"),
    cliente: api("cliente", "cli"),
    eventoDaJornada: api("eventoDaJornada", "ev"),
    empresaProveniencia: api("empresaProveniencia", "pv"),
    empresaFatorIcp: api("empresaFatorIcp", "fi"),
    siteLead: api("siteLead", "lead"),
  };
}

type BancoFalso = ReturnType<typeof bancoFalso>;
// O serviço pede um `PrismaClient`; o falso implementa só o que ele chama.
const comoPrisma = (db: BancoFalso) => db as unknown as Parameters<typeof descobrirEmpresa>[0];

async function empresaPronta(db: BancoFalso) {
  const r = await descobrirEmpresa(comoPrisma(db), {
    nome: "Sushi House",
    cidade: "São Paulo",
    estado: "SP",
    fonteDaDescoberta: "planilha-outscraper",
    autoria: IA,
    agora: AGORA,
  });
  return r.empresaId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AS MÁQUINAS DE ESTADO — transição válida e transição recusada
// ─────────────────────────────────────────────────────────────────────────────

describe("o pipeline do Hunter aceita os caminhos que existem", () => {
  it.each([
    ["DESCOBERTA", "ENRIQUECENDO"],
    ["ENRIQUECENDO", "PRONTA_PARA_SDR"],
    ["PRONTA_PARA_SDR", "GATEKEEPER"],
    ["GATEKEEPER", "DECISOR_ENCONTRADO"],
    ["DECISOR_ENCONTRADO", "QUALIFICADA"],
  ] as const)("%s → %s é permitido", (de, para) => {
    expect(validarMovimentoDaEmpresa({ de, para })).toEqual([]);
  });

  it("o caminho inteiro do documento fecha, degrau a degrau", () => {
    // A prova de que a sequência desenhada existe mesmo no código:
    // descoberta → enriquecendo → pronto SDR → gatekeeper → decisor → qualificado.
    const caminho = [
      "DESCOBERTA",
      "ENRIQUECENDO",
      "PRONTA_PARA_SDR",
      "GATEKEEPER",
      "DECISOR_ENCONTRADO",
      "QUALIFICADA",
    ] as const;

    for (let i = 0; i < caminho.length - 1; i++) {
      expect(TRANSICOES_DA_EMPRESA[caminho[i]!]).toContain(caminho[i + 1]!);
    }
  });

  it("voltar é permitido, porque acontece de verdade", () => {
    // O decisor mudou de emprego: a empresa volta para GATEKEEPER, com motivo.
    expect(validarMovimentoDaEmpresa({ de: "DECISOR_ENCONTRADO", para: "GATEKEEPER" })).toEqual([]);
  });
});

describe("o pipeline do Hunter recusa o que não existe", () => {
  it("pular a fila inteira é recusado", () => {
    // Empresa qualificada sem ficha e sem decisor é promessa vazia para quem vende.
    const recusas = validarMovimentoDaEmpresa({ de: "DESCOBERTA", para: "QUALIFICADA" });
    expect(recusas).toHaveLength(1);
    expect(recusas[0]!.campo).toBe("para");
  });

  it("descarte sem motivo é recusado", () => {
    const recusas = validarMovimentoDaEmpresa({ de: "DESCOBERTA", para: "DESCARTADA" });
    expect(recusas.map((r) => r.campo)).toContain("motivoDoDescarte");
  });

  it("descarte COM motivo passa", () => {
    // A metade que passa. Sem ela, uma regra que recusasse sempre passaria acima.
    expect(
      validarMovimentoDaEmpresa({ de: "DESCOBERTA", para: "DESCARTADA", motivoDoDescarte: "fechou as portas" }),
    ).toEqual([]);
  });

  it("sair de DESCARTADA não é do operador", () => {
    const recusas = validarMovimentoDaEmpresa({ de: "DESCARTADA", para: "DESCOBERTA" });
    expect(recusas[0]!.campo).toBe("de");
  });

  it("sair de DESCARTADA é do gerente", () => {
    expect(validarMovimentoDaEmpresa({ de: "DESCARTADA", para: "DESCOBERTA", ehGerente: true })).toEqual([]);
  });
});

describe("a oportunidade", () => {
  it("anda da descoberta até a negociação", () => {
    expect(validarMovimentoDaOportunidade({ de: "DESCOBERTA", para: "QUALIFICACAO" })).toEqual([]);
    expect(validarMovimentoDaOportunidade({ de: "QUALIFICACAO", para: "PROPOSTA" })).toEqual([]);
    expect(validarMovimentoDaOportunidade({ de: "PROPOSTA", para: "NEGOCIACAO" })).toEqual([]);
  });

  it("não pula da descoberta direto para a proposta", () => {
    expect(validarMovimentoDaOportunidade({ de: "DESCOBERTA", para: "PROPOSTA" })).toHaveLength(1);
  });

  it("perda sem motivo estruturado é recusada", () => {
    const recusas = validarMovimentoDaOportunidade({ de: "NEGOCIACAO", para: "PERDIDA" });
    expect(recusas.map((r) => r.campo)).toContain("motivoPerdaId");
  });

  it("perda COM motivo do catálogo passa", () => {
    expect(
      validarMovimentoDaOportunidade({ de: "NEGOCIACAO", para: "PERDIDA", motivoPerdaId: "mp-preco" }),
    ).toEqual([]);
  });

  it("GANHA e PERDIDA são terminais", () => {
    expect(TRANSICOES_DA_OPORTUNIDADE.GANHA).toEqual([]);
    expect(TRANSICOES_DA_OPORTUNIDADE.PERDIDA).toEqual([]);
  });
});

describe("a conta do cliente", () => {
  it("EM_ATIVACAO → ATIVO é o caminho normal", () => {
    expect(validarMovimentoDoCliente({ de: "EM_ATIVACAO", para: "ATIVO" })).toEqual([]);
  });

  it("cliente em risco volta a ficar ativo", () => {
    expect(validarMovimentoDoCliente({ de: "EM_RISCO", para: "ATIVO" })).toEqual([]);
  });

  it("cancelado é terminal — reconquista abre oportunidade nova", () => {
    expect(TRANSICOES_DO_CLIENTE.CANCELADO).toEqual([]);
    expect(validarMovimentoDoCliente({ de: "CANCELADO", para: "ATIVO" })).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHAVES
// ─────────────────────────────────────────────────────────────────────────────

describe("a chave de dedupe da empresa", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(chaveDeDedupeDaEmpresa({ nome: "Sushi House", cidade: "São Paulo", estado: "SP" })).toBe(
      chaveDeDedupeDaEmpresa({ nome: "SUSHI  HOUSE!", cidade: "sao paulo", estado: "sp" }),
    );
  });

  it("não junta a mesma marca em cidades diferentes", () => {
    expect(chaveDeDedupeDaEmpresa({ nome: "Sushi House", cidade: "São Paulo" })).not.toBe(
      chaveDeDedupeDaEmpresa({ nome: "Sushi House", cidade: "Campinas" }),
    );
  });
});

describe("somenteDigitos", () => {
  it("limpa o telefone", () => {
    expect(somenteDigitos("+55 (11) 98888-7777")).toBe("5511988887777");
  });

  it("sem número nenhum devolve null, nunca string vazia", () => {
    expect(somenteDigitos("sem telefone")).toBeNull();
    expect(somenteDigitos(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. IDEMPOTÊNCIA — rodar duas vezes não duplica
// ─────────────────────────────────────────────────────────────────────────────

describe("rodar duas vezes não duplica", () => {
  it("descobrir a mesma empresa duas vezes devolve a mesma linha", async () => {
    const db = bancoFalso();
    const ficha = {
      nome: "Sushi House",
      cidade: "São Paulo",
      estado: "SP",
      fonteDaDescoberta: "planilha-outscraper",
      autoria: IA,
      agora: AGORA,
    };

    const primeira = await descobrirEmpresa(comoPrisma(db), ficha);
    const segunda = await descobrirEmpresa(comoPrisma(db), ficha);

    expect(primeira.criada).toBe(true);
    expect(segunda.criada).toBe(false);
    expect(segunda.empresaId).toBe(primeira.empresaId);
    expect(db.tabelas.empresa).toHaveLength(1);
    // E a trilha também não inflou.
    expect(db.tabelas.eventoDaJornada.filter((e) => e.tipo === "CRIACAO")).toHaveLength(1);
  });

  it("o mesmo contato, pelo mesmo telefone, não entra duas vezes", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const pessoa = {
      empresaId,
      nome: "Juliana Ribeiro",
      telefone: "+55 11 97777-1111",
      ehDecisor: true,
      autoria: GENTE,
    };

    const a = await registrarContato(comoPrisma(db), pessoa);
    const b = await registrarContato(comoPrisma(db), pessoa);

    expect(a.criado).toBe(true);
    expect(b.criado).toBe(false);
    expect(b.contatoId).toBe(a.contatoId);
    expect(db.tabelas.contato).toHaveLength(1);
  });

  it("abrir a oportunidade duas vezes com a mesma origem não abre duas negociações", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const pedido = { empresaId, chaveDeOrigem: `oportunidade:${empresaId}:crm`, autoria: GENTE, agora: AGORA };

    const a = await abrirOportunidade(comoPrisma(db), pedido);
    const b = await abrirOportunidade(comoPrisma(db), pedido);

    expect(a.criada).toBe(true);
    expect(b.criada).toBe(false);
    expect(b.oportunidadeId).toBe(a.oportunidadeId);
    expect(db.tabelas.oportunidade).toHaveLength(1);
  });

  it("ganhar a mesma oportunidade duas vezes NÃO cria dois clientes", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const { oportunidadeId } = await abrirOportunidade(comoPrisma(db), {
      empresaId,
      chaveDeOrigem: "op-1",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "DESCOBERTA",
      para: "QUALIFICACAO",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "QUALIFICACAO",
      para: "PROPOSTA",
      autoria: GENTE,
      agora: AGORA,
    });

    const primeira = await ganharOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "PROPOSTA",
      autoria: GENTE,
      agora: AGORA,
    });
    const segunda = await ganharOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "PROPOSTA",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(primeira).toMatchObject({ ok: true, jaEraCliente: false });
    expect(segunda).toMatchObject({ ok: true, jaEraCliente: true });
    if (primeira.ok && segunda.ok) expect(segunda.clienteId).toBe(primeira.clienteId);
    expect(db.tabelas.cliente).toHaveLength(1);
  });

  it("mover para onde a entidade já está é `ok` sem escrever nada", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    const r1 = await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DESCOBERTA",
      para: "ENRIQUECENDO",
      autoria: IA,
      agora: AGORA,
    });
    const r2 = await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DESCOBERTA",
      para: "ENRIQUECENDO",
      autoria: IA,
      agora: AGORA,
    });

    expect(r1).toEqual({ ok: true, mudou: true });
    // A segunda chegou com um `de` velho, mas o destino já é o pedido: não é
    // erro, é repetição — e repetição não vira segundo evento na trilha.
    expect(r2).toEqual({ ok: true, mudou: false });
    expect(db.tabelas.eventoDaJornada.filter((e) => e.tipo === "MUDANCA_DE_ESTAGIO")).toHaveLength(1);
  });

  it("a trilha recusa o mesmo evento duas vezes, e aceita nota livre repetida", async () => {
    const db = bancoFalso();

    const a = await registrarNaTrilha(comoPrisma(db), {
      entidade: "EMPRESA",
      entidadeId: "emp-x",
      tipo: "NOTA",
      autoria: AUTORIA_SISTEMA,
      chaveDeIdempotencia: "mesma-acao",
    });
    const b = await registrarNaTrilha(comoPrisma(db), {
      entidade: "EMPRESA",
      entidadeId: "emp-x",
      tipo: "NOTA",
      autoria: AUTORIA_SISTEMA,
      chaveDeIdempotencia: "mesma-acao",
    });

    expect(a).toBe(true);
    expect(b).toBe(false);

    // Sem chave, duas notas iguais em momentos diferentes são duas notas de
    // verdade — e o banco (NULL não colide com NULL) trata assim.
    await registrarNaTrilha(comoPrisma(db), {
      entidade: "EMPRESA",
      entidadeId: "emp-x",
      tipo: "NOTA",
      autoria: GENTE,
      nota: "liguei",
    });
    await registrarNaTrilha(comoPrisma(db), {
      entidade: "EMPRESA",
      entidadeId: "emp-x",
      tipo: "NOTA",
      autoria: GENTE,
      nota: "liguei",
    });
    expect(db.tabelas.eventoDaJornada).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. A TRILHA GUARDA QUEM FEZ — IA ou gente
// ─────────────────────────────────────────────────────────────────────────────

describe("a trilha distingue IA de gente", () => {
  it("a descoberta feita pela IA fica registrada como IA", async () => {
    const db = bancoFalso();
    await empresaPronta(db);

    const evento = db.tabelas.eventoDaJornada[0]!;
    expect(evento.autor).toBe("IA");
    expect(evento.autorUserId).toBeNull();
    expect(evento.autorLabel).toBe("Hunter IA");
    expect(evento.fonte).toBe("planilha-outscraper");
  });

  it("o movimento feito por gente fica registrado com o id da pessoa", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DESCOBERTA",
      para: "ENRIQUECENDO",
      autoria: GENTE,
      motivo: "conferindo os canais à mão",
      agora: AGORA,
    });

    const evento = db.tabelas.eventoDaJornada.find((e) => e.tipo === "MUDANCA_DE_ESTAGIO")!;
    expect(evento.autor).toBe("HUMANO");
    expect(evento.autorUserId).toBe("user-1");
    expect(evento.autorLabel).toBe("Ana");
    expect(evento.motivo).toBe("conferindo os canais à mão");
    expect(evento.deEstagio).toBe("DESCOBERTA");
    expect(evento.paraEstagio).toBe("ENRIQUECENDO");
  });

  it("a mesma empresa carrega os dois autores na mesma trilha", async () => {
    // É o ponto do documento: "ações da IA vs humano" numa história só.
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DESCOBERTA",
      para: "ENRIQUECENDO",
      autoria: GENTE,
      agora: AGORA,
    });

    const autores = db.tabelas.eventoDaJornada.map((e) => e.autor);
    expect(autores).toEqual(["IA", "HUMANO"]);
  });

  it("o porteiro entra na trilha como porteiro, com o tipo dele", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    await registrarContato(comoPrisma(db), {
      empresaId,
      nome: "Atendimento",
      telefone: "1140001111",
      ehGatekeeper: true,
      tipoDeGatekeeper: "BOT_DE_PEDIDOS",
      comoFoiDescoberto: "número publicado no site",
      autoria: IA,
    });

    const evento = db.tabelas.eventoDaJornada.find((e) => e.tipo === "GATEKEEPER_IDENTIFICADO")!;
    expect(evento).toBeDefined();
    expect(db.tabelas.contato[0]!.tipoDeGatekeeper).toBe("BOT_DE_PEDIDOS");
  });

  it("o decisor entra como DECISOR_ENCONTRADO, com o como e a confiança", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    await registrarContato(comoPrisma(db), {
      empresaId,
      nome: "Juliana Ribeiro",
      cargo: "Gerente / Comercial",
      telefone: "11977772222",
      ehDecisor: true,
      confianca: "ALTA",
      comoFoiDescoberto: "informado pelo atendimento",
      autoria: IA,
    });

    const evento = db.tabelas.eventoDaJornada.find((e) => e.tipo === "DECISOR_ENCONTRADO")!;
    expect(String(evento.nota)).toContain("informado pelo atendimento");
    expect(db.tabelas.contato[0]!.confianca).toBe("ALTA");
    expect(db.tabelas.contato[0]!.ehDecisor).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROVENIÊNCIA E ICP
// ─────────────────────────────────────────────────────────────────────────────

describe("proveniência: de onde veio cada dado", () => {
  it("guarda campo, valor, fonte, data e autor — e atualiza a ficha", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    await registrarProveniencia(comoPrisma(db), {
      empresaId,
      campo: "whatsappPublicado",
      valor: "+5511999990000",
      fonte: "site-oficial",
      url: "https://sushihouse.com.br/contato",
      confianca: "ALTA",
      autoria: IA,
      atualizarFicha: true,
      agora: AGORA,
    });

    expect(db.tabelas.empresaProveniencia[0]!).toMatchObject({
      campo: "whatsappPublicado",
      fonte: "site-oficial",
      confianca: "ALTA",
      coletadoPorAutor: "IA",
      coletadoEm: AGORA,
    });
    expect(db.tabelas.empresa[0]!.whatsappPublicado).toBe("+5511999990000");
  });

  it("apurar de novo NÃO apaga a prova anterior — é append-only", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    for (const [valor, fonte] of [
      ["+5511999990000", "site-oficial"],
      ["+5511988880000", "instagram"],
    ] as const) {
      await registrarProveniencia(comoPrisma(db), {
        empresaId,
        campo: "whatsappPublicado",
        valor,
        fonte,
        autoria: IA,
        atualizarFicha: true,
        agora: AGORA,
      });
    }

    expect(db.tabelas.empresaProveniencia).toHaveLength(2);
    expect(db.tabelas.empresa[0]!.whatsappPublicado).toBe("+5511988880000");
  });
});

describe("o ICP é a conta, não um número opaco", () => {
  it("guarda cada fator e soma o total na ficha", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);

    const { total } = await registrarIcp(comoPrisma(db), {
      empresaId,
      fatores: [
        { fator: "unidades", observado: "2 unidades", pontos: 30 },
        { fator: "marketplace", observado: "só iFood", pontos: 40 },
        { fator: "sistema", observado: "usa concorrente", pontos: -5 },
      ],
      reguaVersao: 3,
      prioridade: "ALTA",
      autoria: IA,
      agora: AGORA,
    });

    expect(total).toBe(65);
    expect(db.tabelas.empresaFatorIcp).toHaveLength(3);
    expect(db.tabelas.empresa[0]!).toMatchObject({ scoreIcp: 65, reguaVersao: 3, prioridade: "ALTA" });
  });

  it("empresa recém-descoberta tem scoreIcp indefinido — `null` é 'ninguém mediu', não zero", async () => {
    const db = bancoFalso();
    await empresaPronta(db);
    expect(db.tabelas.empresa[0]!.scoreIcp ?? null).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. O LEAD ANTIGO CONTINUA FUNCIONANDO
// ─────────────────────────────────────────────────────────────────────────────

describe("o lead que já existia não muda de comportamento", () => {
  it("lead sem empresa segue com os dois ponteiros nulos e nada é escrito nele", async () => {
    // É o caminho do Meta Ads e do formulário do site: pessoa sem restaurante
    // descoberto. Se este teste quebrar, a captação viva quebrou junto.
    const db = bancoFalso();
    await db.siteLead.create({
      data: { id: "lead-meta", nome: "João", stage: "NOVO", empresaId: null, contatoId: null },
    });

    const antes = { ...db.tabelas.siteLead[0]! };

    // Uma jornada inteira roda ao lado, sem tocar no lead.
    const empresaId = await empresaPronta(db);
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DESCOBERTA",
      para: "ENRIQUECENDO",
      autoria: IA,
      agora: AGORA,
    });

    expect(db.tabelas.siteLead[0]!).toEqual(antes);
    expect(db.tabelas.siteLead[0]!.empresaId).toBeNull();
    expect(db.tabelas.siteLead[0]!.stage).toBe("NOVO");
  });

  it("vincular só PREENCHE os dois campos novos — não mexe em etapa nem em responsável", async () => {
    const db = bancoFalso();
    await db.siteLead.create({
      data: {
        id: "lead-1",
        nome: "João",
        stage: "EM_QUALIFICACAO",
        atendidoPor: "HUMANO",
        empresaId: null,
        contatoId: null,
      },
    });
    const empresaId = await empresaPronta(db);
    const { contatoId } = await registrarContato(comoPrisma(db), {
      empresaId,
      nome: "João",
      telefone: "11911112222",
      ehDecisor: true,
      autoria: GENTE,
    });

    const r = await vincularLead(comoPrisma(db), { leadId: "lead-1", empresaId, contatoId, autoria: GENTE });

    expect(r).toEqual({ ok: true, vinculou: true });
    expect(db.tabelas.siteLead[0]!).toMatchObject({
      empresaId,
      contatoId,
      // ⭐ Intocados.
      stage: "EM_QUALIFICACAO",
      atendidoPor: "HUMANO",
    });
  });

  it("vincular duas vezes o mesmo par não grava dois vínculos", async () => {
    const db = bancoFalso();
    await db.siteLead.create({ data: { id: "lead-1", nome: "João", empresaId: null, contatoId: null } });
    const empresaId = await empresaPronta(db);

    const a = await vincularLead(comoPrisma(db), { leadId: "lead-1", empresaId, autoria: GENTE });
    const b = await vincularLead(comoPrisma(db), { leadId: "lead-1", empresaId, autoria: GENTE });

    expect(a).toEqual({ ok: true, vinculou: true });
    expect(b).toEqual({ ok: true, vinculou: false });
    expect(db.tabelas.eventoDaJornada.filter((e) => e.tipo === "VINCULO")).toHaveLength(1);
  });

  it("vincular lead que não existe devolve causa, não estoura", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    expect(await vincularLead(comoPrisma(db), { leadId: "sumiu", empresaId, autoria: GENTE })).toEqual({
      ok: false,
      causa: "naoExiste",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. A JORNADA INTEIRA, DE PONTA A PONTA
// ─────────────────────────────────────────────────────────────────────────────

describe("a jornada inteira: EMPRESA → CONTATO → DECISOR → LEAD → OPORTUNIDADE → CLIENTE", () => {
  it("o registro evolui e o histórico acompanha", async () => {
    const db = bancoFalso();

    // 1. O Hunter acha o restaurante.
    const { empresaId } = await descobrirEmpresa(comoPrisma(db), {
      nome: "Sushi House",
      cidade: "São Paulo",
      estado: "SP",
      bairro: "Moema",
      categoria: "Japonês",
      fonteDaDescoberta: "planilha-outscraper",
      autoria: IA,
      agora: AGORA,
    });

    await moverEmpresa(comoPrisma(db), { empresaId, de: "DESCOBERTA", para: "ENRIQUECENDO", autoria: IA, agora: AGORA });
    await registrarIcp(comoPrisma(db), {
      empresaId,
      fatores: [{ fator: "marketplace", observado: "80% iFood", pontos: 87 }],
      reguaVersao: 1,
      prioridade: "ALTA",
      autoria: IA,
      agora: AGORA,
    });
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "ENRIQUECENDO",
      para: "PRONTA_PARA_SDR",
      autoria: IA,
      agora: AGORA,
    });

    // 2. O SDR bate no porteiro.
    await registrarContato(comoPrisma(db), {
      empresaId,
      nome: "Atendimento do delivery",
      telefone: "1140001111",
      ehGatekeeper: true,
      tipoDeGatekeeper: "BOT_DE_PEDIDOS",
      autoria: IA,
    });
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "PRONTA_PARA_SDR",
      para: "GATEKEEPER",
      autoria: IA,
      agora: AGORA,
    });

    // 3. O porteiro entrega o decisor.
    const { contatoId } = await registrarContato(comoPrisma(db), {
      empresaId,
      nome: "Juliana Ribeiro",
      cargo: "Gerente / Comercial",
      telefone: "11977772222",
      ehDecisor: true,
      confianca: "ALTA",
      comoFoiDescoberto: "informado pelo atendimento",
      autoria: IA,
    });
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "GATEKEEPER",
      para: "DECISOR_ENCONTRADO",
      autoria: IA,
      agora: AGORA,
    });
    await moverEmpresa(comoPrisma(db), {
      empresaId,
      de: "DECISOR_ENCONTRADO",
      para: "QUALIFICADA",
      autoria: GENTE,
      agora: AGORA,
    });

    // 4. Nasce o lead, e ele é ligado à jornada.
    await db.siteLead.create({ data: { id: "lead-ju", nome: "Juliana", stage: "RESPONDEU", empresaId: null, contatoId: null } });
    await vincularLead(comoPrisma(db), { leadId: "lead-ju", empresaId, contatoId, autoria: GENTE });

    // 5. A oportunidade.
    const { oportunidadeId } = await abrirOportunidade(comoPrisma(db), {
      empresaId,
      chaveDeOrigem: "lead-ju",
      contatoDecisorId: contatoId,
      leadId: "lead-ju",
      valorPotencialCents: 49_900,
      produtoDeInteresse: "CRM + cardápio próprio",
      dorIdentificada: "dependência do iFood",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "DESCOBERTA",
      para: "QUALIFICACAO",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "QUALIFICACAO",
      para: "PROPOSTA",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "PROPOSTA",
      para: "NEGOCIACAO",
      autoria: GENTE,
      agora: AGORA,
    });

    // 6. Ganhou — e o lead NÃO volta para o início: vira cliente.
    const ganho = await ganharOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "NEGOCIACAO",
      autoria: GENTE,
      receitaInicialCents: 49_900,
      agora: AGORA,
    });
    expect(ganho.ok).toBe(true);
    if (!ganho.ok) return;

    await moverCliente(comoPrisma(db), {
      clienteId: ganho.clienteId,
      de: "EM_ATIVACAO",
      para: "ATIVO",
      autoria: GENTE,
      agora: AGORA,
    });

    // ── O que precisa ser verdade no fim ──
    expect(db.tabelas.empresa[0]!.estagio).toBe("QUALIFICADA");
    expect(db.tabelas.oportunidade[0]!.estagio).toBe("GANHA");
    expect(db.tabelas.cliente[0]!).toMatchObject({
      situacao: "ATIVO",
      ativadoEm: AGORA,
      receitaTotalCents: 49_900,
      empresaId,
    });
    expect(db.tabelas.siteLead[0]!.empresaId).toBe(empresaId);

    // ⭐ E o histórico acompanhou o registro: uma empresa, uma história.
    const daEmpresa = db.tabelas.eventoDaJornada.filter((e) => e.empresaId === empresaId);
    expect(daEmpresa.length).toBeGreaterThanOrEqual(10);
    expect(new Set(daEmpresa.map((e) => e.autor))).toEqual(new Set(["IA", "HUMANO"]));
  });

  it("a oportunidade perdida guarda o motivo do catálogo e a data de fechamento", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const { oportunidadeId } = await abrirOportunidade(comoPrisma(db), {
      empresaId,
      chaveDeOrigem: "op-perdida",
      autoria: GENTE,
      agora: AGORA,
    });

    const r = await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "DESCOBERTA",
      para: "PERDIDA",
      motivoPerdaId: "mp-preco",
      motivoPerdaDetalhe: "achou caro para duas unidades",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r).toEqual({ ok: true, mudou: true });
    expect(db.tabelas.oportunidade[0]!).toMatchObject({
      estagio: "PERDIDA",
      motivoPerdaId: "mp-preco",
      fechadaEm: AGORA,
    });
  });

  it("ganhar por `moverOportunidade` é recusado — o cliente nasceria sem ninguém", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const { oportunidadeId } = await abrirOportunidade(comoPrisma(db), {
      empresaId,
      chaveDeOrigem: "op-ganha",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "DESCOBERTA",
      para: "QUALIFICACAO",
      autoria: GENTE,
      agora: AGORA,
    });
    await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "QUALIFICACAO",
      para: "PROPOSTA",
      autoria: GENTE,
      agora: AGORA,
    });

    const r = await moverOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "PROPOSTA",
      para: "GANHA",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "recusado" });
    expect(db.tabelas.cliente).toHaveLength(0);
  });

  it("ganhar de um estágio que não fecha venda é recusado", async () => {
    const db = bancoFalso();
    const empresaId = await empresaPronta(db);
    const { oportunidadeId } = await abrirOportunidade(comoPrisma(db), {
      empresaId,
      chaveDeOrigem: "op-cedo",
      autoria: GENTE,
      agora: AGORA,
    });

    // DESCOBERTA → GANHA não existe: não se fecha o que nem foi qualificado.
    const r = await ganharOportunidade(comoPrisma(db), {
      oportunidadeId,
      de: "DESCOBERTA",
      autoria: GENTE,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, causa: "recusado" });
    expect(db.tabelas.cliente).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. A MIGRAÇÃO — aditiva, e aplicável em banco vazio E sobre o schema atual
// ─────────────────────────────────────────────────────────────────────────────

describe("a migração do bloco B1", () => {
  const PASTA = "prisma/migrations/20260917120000_jornada_comercial_empresa_ate_cliente";
  const sql = fs.readFileSync(path.resolve(process.cwd(), PASTA, "migration.sql"), "utf8");
  /** Só o que o Postgres executa — comentário não é instrução. */
  const comandos = sql
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n");

  it("não derruba nada", () => {
    // A ordem do CEO: empilhar, não substituir. Há lead de cliente real no funil.
    expect(comandos).not.toMatch(/\bDROP\b/i);
  });

  it("não renomeia nada", () => {
    expect(comandos).not.toMatch(/\bRENAME\b/i);
  });

  it("não torna obrigatória nenhuma coluna existente", () => {
    expect(comandos).not.toMatch(/SET\s+NOT\s+NULL/i);
    expect(comandos).not.toMatch(/ALTER\s+COLUMN/i);
  });

  it("só encosta em `SiteLead` para acrescentar duas colunas OPCIONAIS", () => {
    const alteracoes = comandos.match(/ALTER TABLE "SiteLead"[^;]*;/g) ?? [];
    // Uma só instrução, e ela acrescenta os dois ponteiros nulos.
    const acrescentos = alteracoes.filter((a) => /ADD COLUMN/i.test(a));
    expect(acrescentos).toHaveLength(1);
    expect(acrescentos[0]).toContain('"empresaId" TEXT');
    expect(acrescentos[0]).toContain('"contatoId" TEXT');
    // Nada de NOT NULL e nada de DEFAULT: coluna nova em tabela viva nasce nula.
    expect(acrescentos[0]).not.toMatch(/NOT NULL/i);
    expect(acrescentos[0]).not.toMatch(/DEFAULT/i);
  });

  it("aplica sobre o schema atual: todo objeto nasce sob guarda", () => {
    // Banco vazio é o caso fácil. O caso que importa é o segundo: rodar sobre um
    // banco que já tem parte disto não pode quebrar.
    const criacoesDeTabela = comandos.match(/CREATE TABLE[^(]*/g) ?? [];
    expect(criacoesDeTabela.length).toBeGreaterThan(0);
    criacoesDeTabela.forEach((c) => expect(c).toMatch(/IF NOT EXISTS/i));

    const criacoesDeIndice = comandos.match(/CREATE (UNIQUE )?INDEX[^(]*/g) ?? [];
    expect(criacoesDeIndice.length).toBeGreaterThan(0);
    criacoesDeIndice.forEach((c) => expect(c).toMatch(/IF NOT EXISTS/i));

    // Tipo enumerado e chave estrangeira não aceitam a cláusula: vão em bloco
    // guardado contra o catálogo.
    (comandos.match(/CREATE TYPE "[^"]+"/g) ?? []).forEach((c) => {
      const nome = c.match(/"([^"]+)"/)![1];
      expect(comandos).toContain(`WHERE typname = '${nome}'`);
    });
    (comandos.match(/ADD CONSTRAINT "([^"]+)" FOREIGN KEY/g) ?? []).forEach((c) => {
      const nome = c.match(/"([^"]+)"/)![1];
      expect(comandos).toContain(`WHERE conname = '${nome}'`);
    });
  });

  it("cria as cinco tabelas da jornada e a trilha", () => {
    for (const tabela of [
      "empresas",
      "contatos_de_empresa",
      "oportunidades",
      "clientes_comerciais",
      "jornada_eventos",
      "empresa_proveniencias",
      "empresa_fatores_icp",
    ]) {
      expect(comandos).toContain(`CREATE TABLE IF NOT EXISTS "${tabela}"`);
    }
  });

  it("nenhuma tabela da jornada tem `restaurantId` obrigatório — a base da Foocci não é de tenant", () => {
    // `clientes_comerciais` tem um ponteiro OPCIONAL e sem chave estrangeira, e
    // é a única. Se um dia alguém o tornar obrigatório, este teste reprova.
    const cliente = comandos.match(/CREATE TABLE IF NOT EXISTS "clientes_comerciais"[\s\S]*?\n\);/)![0];
    expect(cliente).toContain('"restaurantId" TEXT,');
    expect(cliente).not.toMatch(/"restaurantId" TEXT NOT NULL/);
    expect(comandos).not.toMatch(/REFERENCES "Restaurant"/);
  });
});
