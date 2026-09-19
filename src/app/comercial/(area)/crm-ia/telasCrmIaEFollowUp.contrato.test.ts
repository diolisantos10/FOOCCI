/**
 * O CONTRATO DAS DUAS TELAS NOVAS — peça 11 (CRM IA) e peça 09 (Follow-up).
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * Os testes de serviço provam que a LEITURA está certa. Não provam que a TELA
 * usa essa leitura, nem que ela não abriu uma porta de envio por baixo. Régua
 * verde sobre o componente errado é pior que régua nenhuma: a nenhuma deixa a
 * dúvida viva, a verde no lugar errado mata a dúvida e deixa o defeito.
 *
 * Então aqui se mede o que nenhum teste de serviço alcança:
 *
 *   1. cada tela busca a SUA rota de leitura, e nenhuma outra;
 *   2. ⛔ nenhuma das duas abre caminho de escrita, envio ou disparo;
 *   3. as rotas são GET e passam pela guarda antes de ler;
 *   4. as telas tratam os quatro estados de vida e mostram o "não medido";
 *   5. ⛔ os números vêm do SERVIÇO: com duas bases diferentes, a leitura
 *      devolve números diferentes — se houvesse constante no caminho, ela
 *      acertaria uma e erraria a outra.
 *
 * ⚠️ O fonte é lido SEM COMENTÁRIOS. Um teste que varresse o arquivo cru
 * encontraria a frase "esta tela não envia nada" escrita num comentário e
 * reprovaria o arquivo justamente por ele explicar que está correto.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { panoramaDaCrmIa } from "@/services/salaDeVendas/telas/crmIa";
import { panoramaDoFollowUpAutomatico } from "@/services/salaDeVendas/telas/followUpAutomatico";

const AREA = join(process.cwd(), "src/app/comercial/(area)");
const API = join(process.cwd(), "src/app/api/admin/sala-de-vendas");

const TELAS = [
  {
    nome: "CRM IA",
    pasta: "crm-ia",
    cliente: "CrmIaClient.tsx",
    rota: "crm-ia",
    servico: "crmIa",
  },
  {
    nome: "Follow-up automático",
    pasta: "follow-up-automatico",
    cliente: "FollowUpAutomaticoClient.tsx",
    rota: "follow-up-automatico",
    servico: "followUpAutomatico",
  },
] as const;

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/.*$/gm, "");
}

const fonteDaTela = (t: (typeof TELAS)[number]): string =>
  semComentarios(readFileSync(join(AREA, t.pasta, t.cliente), "utf8"));

const fonteDaRota = (t: (typeof TELAS)[number]): string =>
  semComentarios(readFileSync(join(API, t.rota, "route.ts"), "utf8"));

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ cada tela consome a SUA leitura", () => {
  for (const t of TELAS) {
    it(`${t.nome} busca /api/admin/sala-de-vendas/${t.rota}`, () => {
      expect(fonteDaTela(t)).toContain(`/api/admin/sala-de-vendas/${t.rota}`);
    });

    it(`${t.nome} tipa a tela pelo panorama do serviço — não por um tipo próprio`, () => {
      // Um tipo local divergiria em silêncio no dia em que o serviço mudasse um
      // campo: a tela compilaria e desenharia um `undefined`.
      expect(fonteDaTela(t)).toContain(`from "@/services/salaDeVendas/telas/${t.servico}"`);
    });
  }
});

describe("⛔ nenhuma das duas telas escreve, envia ou dispara", () => {
  for (const t of TELAS) {
    it(`${t.nome} não abre nenhum caminho de escrita`, () => {
      const fonte = fonteDaTela(t);
      for (const proibido of ['"POST"', '"PUT"', '"DELETE"', '"PATCH"']) {
        expect(fonte, `${t.nome} tem ${proibido}`).not.toContain(proibido);
      }
      expect(fonte).not.toContain("method:");
    });

    it(`${t.nome} não alcança nenhum outro endereço da Sala`, () => {
      const fonte = fonteDaTela(t);
      const citados = new Set(fonte.match(/\/api\/admin\/sala-de-vendas\/[a-z-]+/g) ?? []);
      for (const endereco of citados) {
        expect(endereco, `${t.nome} alcança ${endereco}`).toBe(
          `/api/admin/sala-de-vendas/${t.rota}`,
        );
      }
    });

    it(`${t.nome} não fala com nenhuma rota de conversa, envio ou disparo`, () => {
      const fonte = fonteDaTela(t);
      for (const rota of ["/conversa", "/whatsapp", "/abordagem", "/tarefas", "/distribuicao"]) {
        expect(fonte, `${t.nome} alcança ${rota}`).not.toContain(rota);
      }
    });

    it(`a rota de ${t.rota} é GET, não exporta escrita e passa pela guarda`, () => {
      const rota = fonteDaRota(t);
      expect(rota).toContain("export async function GET");
      for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(rota, `a rota de leitura ganhou um ${verbo}`).not.toContain(
          `export async function ${verbo}`,
        );
      }
      expect(rota).toContain("guardarSalaDeVendas");
      expect(rota).toContain("if (!portao.ok) return portao.resposta");
    });

    it(`a rota de ${t.rota} não chama enfileirarPlano — abrir painel não é ato`, () => {
      // Um GET que enfileira transforma "dar uma olhada" em "mandar mensagem
      // para setecentas pessoas", e ninguém descobre isso a tempo.
      expect(fonteDaRota(t)).not.toContain("enfileirarPlano");
    });
  }
});

describe("⭐ toda tela tem os quatro estados de vida e mostra o não medido", () => {
  for (const t of TELAS) {
    it(`${t.nome} trata carregando, sem acesso, erro e vazio`, () => {
      const fonte = fonteDaTela(t);
      for (const peca of ["Carregando", "SemAcesso", "Erro", "Vazio"]) {
        expect(fonte, `${t.nome} não trata "${peca}"`).toContain(`<${peca}`);
      }
    });

    it(`${t.nome} imprime as frases de "não medido" que a leitura devolveu`, () => {
      // É a peça que impede o vazio de virar zero tranquilizador.
      const fonte = fonteDaTela(t);
      expect(fonte).toContain("p.naoMedido.map");
      expect(fonte).toContain("<NaoMedido");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// O CAMINHO INTEIRO: banco falso → serviço de verdade → números diferentes
// ─────────────────────────────────────────────────────────────────────────────

const AGORA = new Date("2026-09-17T12:00:00.000Z");
const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

type Linha = Record<string, unknown>;

function lead(p: Linha = {}): Linha {
  return {
    id: "lead-x",
    nome: "Restaurante",
    stage: "EM_QUALIFICACAO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaMensagemEm: null,
    ultimaMensagemDeQuem: null,
    propostas: [],
    compromissos: [],
    oportunidades: [],
    ...p,
  };
}

/**
 * ⚠️ O potencial NÃO vem do valor da proposta: `fichaDaLinha` o tira da
 * OPORTUNIDADE aberta (`valorPotencialCents`), que é anulável de propósito —
 * `null` = ninguém estimou, nunca zero por omissão. Por isso a fixture põe a
 * oportunidade, e não só a proposta: montá-la errado faria o teste provar uma
 * soma que o produto não faz.
 */
function propostaParada(id: string, valorCents: number | null, dias: number): Linha {
  return lead({
    id,
    stage: "PROPOSTA_ENVIADA",
    oportunidades: [{ estagio: "PROPOSTA", valorPotencialCents: valorCents }],
    propostas: [
      {
        situacao: "ENVIADA",
        valorMensalCent: valorCents,
        enviadaEm: diasAtras(dias),
        respondidaEm: null,
        updatedAt: diasAtras(dias),
      },
    ],
  });
}

function bancoDaCrm(leads: Linha[]) {
  return {
    siteLead: { findMany: async () => leads },
    cliente: { findMany: async () => [] },
    cadencia: { findMany: async () => [] },
    leadCadencia: { findMany: async () => [] },
    sdrIaConfig: { findUnique: async () => null },
  } as never;
}

describe("⛔ os números da CRM IA vêm do serviço, não de constante", () => {
  const baseA = [propostaParada("p1", 50_000, 10), propostaParada("p2", null, 9)];
  const baseB = baseA.slice(1);

  it("a contagem de propostas paradas acompanha a base", async () => {
    const a = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    const b = await panoramaDaCrmIa(bancoDaCrm(baseB), { agora: AGORA, env: {} });

    const conta = (p: typeof a) => p.segmentos.find((s) => s.chave === "propostasParadas")!.total;
    expect(conta(a)).toBe(2);
    expect(conta(b)).toBe(1);
  });

  it("⛔ receita potencial soma só o estimado, e declara o piso", async () => {
    const p = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    // Uma das duas propostas não tem valor: ela NÃO entra como zero.
    expect(p.receitaPotencial.cents).toBe(50_000);
    expect(p.receitaPotencial.semEstimativa).toBe(1);
    expect(p.naoMedido.join(" ")).toContain("piso");
  });

  it('⛔ nenhum indicador inventa "vs. ontem"', async () => {
    const p = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    expect(p.indicadores.length).toBe(6);
    for (const i of p.indicadores) {
      expect(i.variacao, `${i.chave} inventou variação`).toBeNull();
      expect(i.porqueSemVariacao).toContain("sem base de ontem");
    }
  });

  it("⛔ com a chave de envio desligada, o interruptor sai DESLIGADO e o diagnóstico diz", async () => {
    const p = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    const envio = p.interruptores.find((i) => i.chave === "followUpAutomatico")!;
    expect(envio.ligado).toBe(false);
    expect(p.diagnostico.join(" ")).toContain("envio está DESLIGADO");
  });

  it('⛔ cadência ausente do banco é "não medido", e NUNCA "desligada"', async () => {
    const p = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    const reativacao = p.interruptores.find((i) => i.chave === "reativacaoDeInativos")!;
    // Sem a cadência no banco, dizer "desligada" afirmaria algo que ninguém apurou.
    expect(reativacao.ligado).toBeNull();
    expect(reativacao.porqueNaoMedido).toContain("não existe na base");
  });

  it("⛔ sem objeção registrada, a campanha diz isso em vez de chutar um argumento", async () => {
    const p = await panoramaDaCrmIa(bancoDaCrm(baseA), { agora: AGORA, env: {} });
    expect(p.campanha).not.toBeNull();
    expect(p.campanha!.objecaoPrincipal).toBeNull();
    expect(p.campanha!.acaoRecomendada).toContain("não está registrada");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function bancoDoFollowUp(cadencias: Linha[], tarefas: Linha[] = []) {
  return {
    cadencia: { findMany: async () => cadencias },
    leadCadencia: { groupBy: async () => [] },
    leadTarefa: { findMany: async () => tarefas },
  } as never;
}

function cadencia(slug: string, passos: Linha[], ativa = true): Linha {
  return { id: slug, slug, nome: slug, ativa, quando: null, passos };
}

describe("⛔ o follow-up automático mostra o que existe — e não grava jornada", () => {
  it("desenha uma jornada por cadência do banco, com gatilho e parada", async () => {
    const p = await panoramaDoFollowUpAutomatico(
      bancoDoFollowUp([
        cadencia("proposta-sem-retorno", [
          { id: "s0", ordem: 0, esperaHoras: 48, tipo: "FOLLOW_UP", executor: "IA", titulo: "cobrar retorno", templateNome: "t1", roteiro: null },
        ]),
      ]),
      { agora: AGORA, env: {} },
    );

    expect(p.jornadas.length).toBe(1);
    const tipos = p.jornadas[0]!.blocos.map((b) => b.tipo);
    expect(tipos[0]).toBe("GATILHO");
    expect(tipos).toContain("ESPERA");
    expect(tipos).toContain("TEMPLATE");
    expect(tipos.at(-1)).toBe("PARADA");
  });

  it("⛔ traz a condição REAL do passo, vinda do catálogo tipado", async () => {
    const p = await panoramaDoFollowUpAutomatico(
      bancoDoFollowUp([
        cadencia("proposta-sem-retorno", [
          { id: "s0", ordem: 0, esperaHoras: 48, tipo: "FOLLOW_UP", executor: "IA", titulo: "cobrar retorno", templateNome: null, roteiro: null },
        ]),
      ]),
      { agora: AGORA, env: {} },
    );
    const passo = p.jornadas[0]!.blocos.find((b) => b.tipo === "TEMPLATE")!;
    expect(passo.condicao).toContain("cobra retorno só de proposta enviada");
  });

  it("⛔ mensagens, respostas, recuperações e vendas saem NULL com o motivo — nunca 0", async () => {
    const p = await panoramaDoFollowUpAutomatico(
      bancoDoFollowUp([cadencia("proposta-sem-retorno", [])]),
      { agora: AGORA, env: {} },
    );
    expect(p.resultados.mensagensEnviadas).toBeNull();
    expect(p.resultados.respostas).toBeNull();
    expect(p.resultados.recuperacoes).toBeNull();
    expect(p.resultados.vendasRecuperadasCents).toBeNull();
    expect(p.resultados.porqueNaoMedido).toContain("atribuição por automação");

    for (const linha of p.tabela) {
      expect(linha.mensagensEnviadas).toBeNull();
      expect(linha.vendasCents).toBeNull();
    }
  });

  it("⛔ a lacuna do construtor sobe escrita, e não morre num commit", async () => {
    const p = await panoramaDoFollowUpAutomatico(bancoDoFollowUp([]), { agora: AGORA, env: {} });
    expect(p.oQueFaltaParaEditar.length).toBeGreaterThan(0);
    expect(p.oQueFaltaParaEditar.join(" ")).toContain("CONDIÇÃO");
    expect(p.naoMedido.join(" ")).toContain("Construtor da Jornada é de LEITURA");
  });

  it("⛔ sem cadência no banco não se desenha jornada de exemplo", async () => {
    const p = await panoramaDoFollowUpAutomatico(bancoDoFollowUp([]), { agora: AGORA, env: {} });
    expect(p.jornadas).toEqual([]);
    expect(p.tabela).toEqual([]);
    expect(p.porqueSemJornadas).toContain("nenhuma cadência cadastrada");
  });

  it("estado com cadência em código que NÃO existe no banco é apontado", async () => {
    const p = await panoramaDoFollowUpAutomatico(bancoDoFollowUp([]), { agora: AGORA, env: {} });
    expect(p.modelosProntos.length).toBeGreaterThan(0);
    expect(p.modelosProntos.every((m) => m.existeNoBanco === false)).toBe(true);
    expect(p.naoMedido.join(" ")).toContain("não é enfileirado em lugar nenhum");
  });
});
