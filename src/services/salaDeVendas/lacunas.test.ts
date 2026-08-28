/**
 * O CADERNO DE LACUNAS.
 *
 * O que estes testes protegem, em uma frase: que a lista mostre o buraco onde
 * ele está, e não onde é mais fácil de mostrar.
 *
 * Dois defeitos são muito piores que os outros aqui, e cada um tem teste com
 * nome próprio:
 *
 *   · **Juntar duas lacunas diferentes numa linha** — some uma pergunta que
 *     ninguém sabe responder, e ela some *silenciosamente*.
 *   · **Confundir "o agente respondeu tudo" com "o agente não atendeu ninguém"**
 *     — os dois desenham "0 lacunas", e só um é notícia boa.
 */

import { describe, it, expect } from "vitest";
import {
  agruparLacunas,
  perguntasQueGeraramOsHandoffs,
  semNumerosPessoais,
  cadernoDeLacunas,
  LINHAS_DO_CADERNO,
} from "./lacunas";

const T = (iso: string) => new Date(iso);

describe("agrupar o que se repete", () => {
  it("a mesma pergunta de dois leads vira uma linha com leads = 2", () => {
    const r = agruparLacunas([
      { texto: "tem multa de cancelamento?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "Tem multa de cancelamento?", leadId: "B", em: T("2026-08-28T11:00:00Z") },
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]!.leads).toBe(2);
    expect(r[0]!.vezes).toBe(2);
  });

  it("acento e caixa não criam linhas separadas", () => {
    // Metade dos leads escreve sem acento no WhatsApp. Se "integração" e
    // "integracao" virassem duas linhas, a lacuna pareceria metade do que é.
    const r = agruparLacunas([
      { texto: "vocês fazem integração com o contador?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "voces fazem integracao com o contador", leadId: "B", em: T("2026-08-28T10:05:00Z") },
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]!.leads).toBe(2);
  });

  it("o plural não separa do singular", () => {
    const r = agruparLacunas([
      { texto: "quantos usuários posso ter?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "quantos usuário posso ter?", leadId: "B", em: T("2026-08-28T10:01:00Z") },
    ]);

    expect(r).toHaveLength(1);
  });

  it("⭐ NÃO junta duas lacunas diferentes que dividem uma palavra comum", () => {
    // A metade que dói, e a razão de o agrupamento ser por palavras exatas e
    // não por semelhança: as duas dividem "custa". Um agrupador "esperto" as
    // fundiria, e o Foocci nunca descobriria que ninguém sabe responder sobre
    // o preço do treinamento.
    const r = agruparLacunas([
      { texto: "quanto custa o treinamento?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "quanto custa a mensalidade?", leadId: "B", em: T("2026-08-28T10:01:00Z") },
    ]);

    expect(r).toHaveLength(2);
    expect(r.map((l) => l.pergunta).sort()).toEqual([
      "quanto custa a mensalidade?",
      "quanto custa o treinamento?",
    ]);
  });

  it("cinco leads pesam mais que um lead perguntando cinco vezes", () => {
    const insistente = Array.from({ length: 5 }, (_, i) => ({
      texto: "tem app para o garçom?",
      leadId: "A",
      em: T(`2026-08-28T10:0${i}:00Z`),
    }));
    const espalhada = ["B", "C", "D", "E"].map((leadId, i) => ({
      texto: "vocês emitem nota fiscal?",
      leadId,
      em: T(`2026-08-28T11:0${i}:00Z`),
    }));

    const r = agruparLacunas([...insistente, ...espalhada]);

    // 4 leads distintos ganham de 5 repetições de um só.
    expect(r[0]!.pergunta).toBe("vocês emitem nota fiscal?");
    expect(r[0]!.leads).toBe(4);
    expect(r[1]!.vezes).toBe(5);
    expect(r[1]!.leads).toBe(1);
  });

  it("mostra a redação mais recente, não a primeira", () => {
    // As duas frases são diferentes no texto e idênticas no que perguntam:
    // "vocês", "têm", "de" e "no" são palavras vazias, e o que sobra dos dois
    // lados é {multa, cancelamento}. É esta insensibilidade a enchimento que
    // faz o caderno contar assunto em vez de contar redação.
    const r = agruparLacunas([
      { texto: "vocês têm multa de cancelamento?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "Tem multa no cancelamento???", leadId: "B", em: T("2026-08-28T12:00:00Z") },
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]!.pergunta).toBe("Tem multa no cancelamento???");
    expect(r[0]!.ultimaEm).toEqual(T("2026-08-28T12:00:00Z"));
  });

  it("⭐ palavra significativa a mais SEPARA — e isso é o desenho, não um defeito", () => {
    // O outro lado da moeda do teste acima, e o limite honesto desta lista:
    // "existe" não é palavra vazia, então esta pergunta não cai junto com
    // "tem multa de cancelamento". Duas linhas sobre multa em vez de uma.
    //
    // É o erro barato de propósito. O caro — juntar treinamento com
    // mensalidade — está coberto logo acima. Quem lê vinte linhas resolve a
    // duplicata num olhar; ninguém resolve uma lacuna que sumiu.
    const r = agruparLacunas([
      { texto: "tem multa de cancelamento?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "existe multa de cancelamento?", leadId: "B", em: T("2026-08-28T12:00:00Z") },
    ]);

    expect(r).toHaveLength(2);
  });

  it("mensagem sem palavra significativa não vira linha", () => {
    // "oi?" e "?" não são lacunas de conhecimento. Agrupá-las produziria uma
    // linha vazia no topo da lista — que é onde deve estar o que importa.
    const r = agruparLacunas([
      { texto: "oi?", leadId: "A", em: T("2026-08-28T10:00:00Z") },
      { texto: "?", leadId: "B", em: T("2026-08-28T10:01:00Z") },
      { texto: "vocês têm cardápio digital?", leadId: "C", em: T("2026-08-28T10:02:00Z") },
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]!.pergunta).toBe("vocês têm cardápio digital?");
  });

  it("a lista corta em vinte linhas, e o corte é o mais fraco", () => {
    const muitas = Array.from({ length: LINHAS_DO_CADERNO + 5 }, (_, i) => ({
      texto: `pergunta sobre assunto${i} do restaurante`,
      leadId: `lead${i}`,
      em: T("2026-08-28T10:00:00Z"),
    }));
    // Uma com dois leads: tem de sobreviver ao corte.
    muitas.push({
      texto: "pergunta sobre assunto0 do restaurante",
      leadId: "outro",
      em: T("2026-08-28T10:00:00Z"),
    });

    const r = agruparLacunas(muitas);

    expect(r).toHaveLength(LINHAS_DO_CADERNO);
    expect(r[0]!.leads).toBe(2);
  });
});

describe("qual mensagem é a pergunta", () => {
  it("é a última entrada ANTES do handoff, não a que veio depois", () => {
    // Inverter isto atribuiria ao handoff algo que o lead escreveu em resposta
    // ao "vou confirmar" — ou seja, registraria como lacuna a própria resposta
    // do agente refletida de volta.
    const r = perguntasQueGeraramOsHandoffs(
      [{ leadId: "A", em: T("2026-08-28T10:30:00Z") }],
      [
        { leadId: "A", texto: "oi, boa tarde", em: T("2026-08-28T10:00:00Z") },
        { leadId: "A", texto: "tem integração com Colibri?", em: T("2026-08-28T10:29:00Z") },
        { leadId: "A", texto: "ok, obrigado", em: T("2026-08-28T10:35:00Z") },
      ],
    );

    expect(r.perguntas).toHaveLength(1);
    expect(r.perguntas[0]!.texto).toBe("tem integração com Colibri?");
    expect(r.semPergunta).toBe(0);
  });

  it("uma entrada no mesmo instante do handoff conta — foi ela que o causou", () => {
    const instante = T("2026-08-28T10:30:00Z");
    const r = perguntasQueGeraramOsHandoffs(
      [{ leadId: "A", em: instante }],
      [{ leadId: "A", texto: "qual a multa?", em: instante }],
    );

    expect(r.perguntas[0]!.texto).toBe("qual a multa?");
  });

  it("não empresta a pergunta de um lead para o handoff de outro", () => {
    const r = perguntasQueGeraramOsHandoffs(
      [{ leadId: "B", em: T("2026-08-28T10:30:00Z") }],
      [{ leadId: "A", texto: "tem multa?", em: T("2026-08-28T10:00:00Z") }],
    );

    expect(r.perguntas).toHaveLength(0);
    expect(r.semPergunta).toBe(1);
  });

  it("handoff sem nenhuma entrada é contado, não descartado", () => {
    // Descartar em silêncio faria o total encolher e a operação parecer melhor
    // do que é. O número aparece separado justamente para não se misturar.
    const r = perguntasQueGeraramOsHandoffs(
      [{ leadId: "A", em: T("2026-08-28T10:30:00Z") }],
      [],
    );

    expect(r.perguntas).toHaveLength(0);
    expect(r.semPergunta).toBe(1);
  });

  it("áudio e imagem não viram pergunta vazia", () => {
    // `texto` nulo é mídia. Tratá-la como pergunta produziria uma linha em
    // branco no caderno.
    const r = perguntasQueGeraramOsHandoffs(
      [{ leadId: "A", em: T("2026-08-28T10:30:00Z") }],
      [
        { leadId: "A", texto: "tem app?", em: T("2026-08-28T10:00:00Z") },
        { leadId: "A", texto: null, em: T("2026-08-28T10:29:00Z") },
        { leadId: "A", texto: "   ", em: T("2026-08-28T10:29:30Z") },
      ],
    );

    expect(r.perguntas[0]!.texto).toBe("tem app?");
  });
});

describe("número pessoal não viaja no relatório", () => {
  it("telefone sai", () => {
    expect(semNumerosPessoais("me liga no 11 91137-7608 por favor"))
      .toBe("me liga no [número] por favor");
  });

  it("CPF e CNPJ saem", () => {
    expect(semNumerosPessoais("meu cnpj é 12.345.678/0001-90")).toBe("meu cnpj é [número]");
    expect(semNumerosPessoais("cpf 123.456.789-00")).toBe("cpf [número]");
  });

  it("⭐ número curto FICA — é ele que dá sentido à pergunta", () => {
    // A metade que faz o corte valer a pena: apagar todo dígito deixaria
    // "atendem [número] lojas?" — que não ensina nada a quem vai responder.
    expect(semNumerosPessoais("vocês atendem 2 lojas?")).toBe("vocês atendem 2 lojas?");
    expect(semNumerosPessoais("abro às 18h e fecho 23h")).toBe("abro às 18h e fecho 23h");
    expect(semNumerosPessoais("somos 15 funcionários")).toBe("somos 15 funcionários");
  });

  it("texto sem número nenhum passa intacto", () => {
    expect(semNumerosPessoais("tem multa de cancelamento?")).toBe("tem multa de cancelamento?");
  });
});

// ── A leitura do banco, com um banco de mentira ──────────────────────────────

function bancoFalso(dados: {
  handoffs: Array<{ leadId: string; createdAt: Date }>;
  saidasDaIa: number;
  entradas: Array<{ leadId: string; texto: string | null; createdAt: Date }>;
}) {
  return {
    leadHandoff: {
      findMany: async () => dados.handoffs,
    },
    leadMensagem: {
      count: async () => dados.saidasDaIa,
      findMany: async () => dados.entradas,
    },
  } as never;
}

const PERIODO = { de: T("2026-08-28T00:00:00Z"), ate: T("2026-08-29T00:00:00Z") };

describe("o caderno lido do banco", () => {
  it("⭐ sem lacuna E sem atendimento → não mediu (não é 'respondeu tudo')", async () => {
    const r = await cadernoDeLacunas(
      bancoFalso({ handoffs: [], saidasDaIa: 0, entradas: [] }),
      PERIODO,
    );

    expect(r).toEqual({ medido: false, motivo: "semAtendimento" });
  });

  it("⭐ sem lacuna COM atendimento → mediu, e o total é zero", async () => {
    // A outra metade. Este é o dia bom, e ele precisa ser distinguível do dia
    // em que ninguém trabalhou — senão a tela pinta os dois igual.
    const r = await cadernoDeLacunas(
      bancoFalso({ handoffs: [], saidasDaIa: 42, entradas: [] }),
      PERIODO,
    );

    expect(r).toEqual({ medido: true, total: 0, semPerguntaRegistrada: 0, lista: [] });
  });

  it("cruza handoff com a pergunta e devolve a lista pronta", async () => {
    const r = await cadernoDeLacunas(
      bancoFalso({
        saidasDaIa: 10,
        handoffs: [
          { leadId: "A", createdAt: T("2026-08-28T10:30:00Z") },
          { leadId: "B", createdAt: T("2026-08-28T14:00:00Z") },
        ],
        entradas: [
          { leadId: "A", texto: "tem multa de cancelamento?", createdAt: T("2026-08-28T10:29:00Z") },
          { leadId: "B", texto: "Tem multa de cancelamento?", createdAt: T("2026-08-28T13:59:00Z") },
        ],
      }),
      PERIODO,
    );

    expect(r.medido).toBe(true);
    if (!r.medido) return;
    expect(r.total).toBe(2);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0]!.leads).toBe(2);
    expect(r.semPerguntaRegistrada).toBe(0);
  });
});
