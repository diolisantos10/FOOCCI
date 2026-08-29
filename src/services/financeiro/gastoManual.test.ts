/**
 * O GASTO LANÇADO À MÃO — o que nenhuma API entrega.
 *
 * O que estes testes protegem, em uma frase: que um gasto lançado hoje ainda se
 * explique daqui a seis meses, e que a conta nunca fique menor do que foi.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece recusando E deixando passar. Um arquivo só com a primeira
 * metade ficaria verde contra um `problemaNoGastoManual` que recusasse TODO
 * lançamento — e nada entraria nunca, com a validação parecendo rigorosa.
 *
 * ── OS QUATRO DEFEITOS QUE DOEM MAIS ────────────────────────────────────────
 *
 *   · **Valor negativo.** Abate a conta em silêncio e faz o total mentir para
 *     MENOS. Numa empresa que está queimando caixa, errar para menos é o pior
 *     lado para errar.
 *   · **Valor fracionado.** "49,90" que chega como 4989,999… tira meio centavo
 *     por linha, e a conta para de fechar com a fatura por um motivo que
 *     ninguém encontra olhando a tela.
 *   · **Competência no futuro.** Vira previsão misturada com fato, e o CEO
 *     decide sobre um número que inclui o que ainda não aconteceu.
 *   · **"Outro" sem descrição de verdade.** É o balde onde gasto some: entra na
 *     conta, aparece no total e não responde a pergunta nenhuma depois.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CATEGORIAS_DE_GASTO,
  MOEDAS_DE_GASTO,
  ehCategoriaValida,
  ehMoedaValida,
  explicarRecusaDoGasto,
  fraseDoGastoManual,
  lancarGastoManual,
  problemaNoGastoManual,
  somarGastosManuais,
  type RecusaDoGasto,
} from "./gastoManual";

const HOJE = "2026-08-29";
const AGORA = new Date("2026-08-29T15:00:00Z");

/** Um lançamento que se sustenta inteiro. As recusas mexem em um campo só. */
const BOM = {
  descricao: "Fatura Railway de agosto",
  categoria: "hospedagem",
  fornecedor: "Railway",
  valorCent: 12_345,
  moeda: "BRL",
  competencia: "2026-08-28",
  criadoPor: "Dioli (u-ceo)",
};

// ═══════════════════════════════════════════════════════════════════════════
// AS LISTAS FECHADAS
// ═══════════════════════════════════════════════════════════════════════════

describe("as categorias e as moedas", () => {
  it("as sete categorias da lista são aceitas", () => {
    // A metade que PASSA. Sem ela, um `ehCategoriaValida` que dissesse "não"
    // sempre ficaria verde em todo o resto — e nada seria lançado.
    for (const c of CATEGORIAS_DE_GASTO) {
      expect(ehCategoriaValida(c.valor), c.valor).toBe(true);
    }
  });

  it("o que não está na lista é recusado — inclusive o vazio", () => {
    // Vazio precisa cair aqui, e não em algum `if (!categoria)` mais adiante: é
    // o valor que um `<select>` sem escolha manda, e é o caso comum de verdade.
    for (const v of ["", "marketing", "HOSPEDAGEM", " ia", null, 7]) {
      expect(ehCategoriaValida(v), String(v)).toBe(false);
    }
  });

  it("cada categoria tem rótulo escrito para gente ler", () => {
    // A lista viaja para a tela pela rota. Um valor sem rótulo viraria um
    // `<option>` em branco — e ninguém escolhe o que não lê.
    for (const c of CATEGORIAS_DE_GASTO) {
      expect(c.rotulo.trim().length, c.valor).toBeGreaterThan(5);
    }
  });

  it("só real e dólar; o resto é recusado", () => {
    expect(ehMoedaValida("BRL")).toBe(true);
    expect(ehMoedaValida("USD")).toBe(true);
    for (const v of ["", "EUR", "brl", "R$", null]) {
      expect(ehMoedaValida(v), String(v)).toBe(false);
    }
    expect(MOEDAS_DE_GASTO.map((m) => m.valor)).toEqual(["BRL", "USD"]);
  });
});

describe("⭐ a lista do código e o CHECK do banco são a MESMA lista", () => {
  it("⭐ nenhuma categoria existe só de um lado", () => {
    /*
      ── A DIVERGÊNCIA QUE NÃO DÁ ERRO ATÉ DAR ───────────────────────────────

      A lista fechada existe em dois lugares de propósito: em TypeScript, para a
      tela montar o seletor e a recusa sair em português; e como CHECK no banco,
      porque validação de aplicativo é AVISO — um script de importação ou um
      `psql` colado à mão passam por baixo dela.

      O preço de ter duas é a divergência. Alguém acrescenta "marketing" aqui, a
      tela passa a oferecer a opção, e a gravação estoura em PRODUÇÃO com um erro
      de constraint que ninguém traduz — o CEO vê "não consegui lançar" e não
      sabe por quê.

      Este teste lê o arquivo da migração. Uma asserção de comportamento provaria
      que HOJE as duas batem; ler o SQL prova que elas não podem se separar sem
      alguém ver o teste reprovar.
    */
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260829120000_gasto_manual/migration.sql",
      ),
      "utf8",
    );

    const bloco = /gastos_manuais_categoria_conhecida[\s\S]*?IN \(([^)]*)\)/.exec(sql);
    expect(bloco, "o CHECK de categoria sumiu da migração").not.toBeNull();

    const noBanco = (bloco![1]!.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1)).sort();
    const noCodigo = CATEGORIAS_DE_GASTO.map((c) => c.valor).sort();

    expect(noBanco).toEqual(noCodigo);
  });

  it("⭐ o CHECK que recusa valor negativo continua na migração", () => {
    // A trava de verdade contra o abatimento silencioso. A validação em
    // TypeScript é a primeira porta; esta é a que vale para quem entra por
    // fora dela.
    const sql = readFileSync(
      path.join(process.cwd(), "prisma/migrations/20260829120000_gasto_manual/migration.sql"),
      "utf8",
    );

    expect(sql).toMatch(/CHECK \("valorCent" >= 0\)/);

    // E a migração é ADITIVA: nada do que já está de pé é tocado. A conferência
    // é feita sobre o SQL sem comentários — o cabeçalho explica justamente que
    // não há DROP nenhum, e ler a explicação como se fosse comando reprovaria
    // um arquivo correto.
    const comandos = sql.replace(/^\s*--.*$/gm, "");
    expect(comandos).not.toMatch(/\bDROP\b/);
    expect(comandos).not.toMatch(/\bALTER TABLE "(?!gastos_manuais")/);
    expect(comandos).toMatch(/CREATE TABLE "gastos_manuais"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A CONFERÊNCIA, ANTES DO BANCO
// ═══════════════════════════════════════════════════════════════════════════

describe("o lançamento é conferido antes de o banco ser tocado", () => {
  it("um lançamento completo passa", () => {
    // A metade que PASSA, e a mais importante do bloco: sem ela, todas as
    // recusas abaixo ficariam verdes contra uma validação que recusasse tudo.
    expect(problemaNoGastoManual(BOM, HOJE)).toBeNull();
  });

  it("descrição vazia é recusada — valor sem descrição não se explica depois", () => {
    for (const d of ["", "   ", "-", null, undefined, 42]) {
      expect(problemaNoGastoManual({ ...BOM, descricao: d }, HOJE), String(d))
        .toBe("semDescricao");
    }
  });

  it("categoria fora da lista é recusada", () => {
    expect(problemaNoGastoManual({ ...BOM, categoria: "marketing" }, HOJE))
      .toBe("categoriaInvalida");
    expect(problemaNoGastoManual({ ...BOM, categoria: "" }, HOJE))
      .toBe("categoriaInvalida");
  });

  it("moeda fora da lista é recusada", () => {
    expect(problemaNoGastoManual({ ...BOM, moeda: "EUR" }, HOJE)).toBe("moedaInvalida");
    expect(problemaNoGastoManual({ ...BOM, moeda: undefined }, HOJE)).toBe("moedaInvalida");
  });

  it("sem autor é recusado — gasto sem responsável é gasto que ninguém explica", () => {
    expect(problemaNoGastoManual({ ...BOM, criadoPor: "" }, HOJE)).toBe("semAutor");
    expect(problemaNoGastoManual({ ...BOM, criadoPor: undefined }, HOJE)).toBe("semAutor");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O VALOR
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o valor é centavo INTEIRO e não negativo", () => {
  it("⭐ valor negativo é recusado — abateria a conta em silêncio", () => {
    /*
      O defeito mais caro do arquivo. Um "-50000" lançado por engano (ou por
      alguém tentando "estornar") derrubaria R$ 500 do total, e o CEO leria um
      gasto menor do que o real.

      Estorno é um lançamento próprio, com descrição e responsável. Um negativo
      solto não é estorno: é uma subtração sem explicação.
    */
    expect(problemaNoGastoManual({ ...BOM, valorCent: -1 }, HOJE)).toBe("valorNegativo");
    expect(problemaNoGastoManual({ ...BOM, valorCent: -50_000 }, HOJE)).toBe("valorNegativo");
  });

  it("⭐ valor fracionado é recusado — meio centavo por linha derruba a conta", () => {
    // `Number("49.90") * 100` é 4989,999999999999. Gravado, ele trunca meio
    // centavo, e a conta para de fechar com a fatura por um motivo que ninguém
    // encontra olhando a tela.
    expect(problemaNoGastoManual({ ...BOM, valorCent: 4989.999999999999 }, HOJE))
      .toBe("valorFracionado");
    expect(problemaNoGastoManual({ ...BOM, valorCent: 0.5 }, HOJE)).toBe("valorFracionado");
  });

  it("o que não é número é recusado antes de virar comparação", () => {
    // `NaN >= 0` é falso e `Infinity >= 0` é verdadeiro: os dois atravessariam
    // uma checagem só de sinal, e o infinito estouraria a coluna INTEGER com um
    // erro de banco que ninguém traduz.
    for (const v of ["4990", null, undefined, NaN, Infinity, -Infinity, {}]) {
      expect(problemaNoGastoManual({ ...BOM, valorCent: v }, HOJE), String(v))
        .toBe("valorNaoEhNumero");
    }
  });

  it("zero é aceito — é um valor, não uma ausência", () => {
    // A metade que passa. Uma linha de R$ 0,00 registrada de propósito (um plano
    // gratuito que ainda assim precisa constar) é diferente de não ter linha.
    expect(problemaNoGastoManual({ ...BOM, valorCent: 0 }, HOJE)).toBeNull();
  });

  it("um inteiro grande passa — o teto é o da coluna, não uma regra inventada", () => {
    expect(problemaNoGastoManual({ ...BOM, valorCent: 1_000_000 }, HOJE)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS DATAS
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ competência e pagamento não moram no futuro", () => {
  it("⭐ competência amanhã é recusada — previsão não é gasto", () => {
    /*
      Deixar o futuro entrar faria a conta de "quanto gastamos" incluir o que
      ainda não aconteceu, e o CEO tomaria decisão sobre um número que mistura
      fato com plano. A recusa é o que mantém esta tela sendo sobre o passado.
    */
    expect(problemaNoGastoManual({ ...BOM, competencia: "2026-08-30" }, HOJE))
      .toBe("competenciaNoFuturo");
    expect(problemaNoGastoManual({ ...BOM, competencia: "2027-01-01" }, HOJE))
      .toBe("competenciaNoFuturo");
  });

  it("HOJE passa — a fronteira é o futuro, e não o presente", () => {
    // A metade que passa, e ela importa: recusar hoje quebraria o lançamento
    // mais comum de todos, que é o gasto do próprio dia.
    expect(problemaNoGastoManual({ ...BOM, competencia: HOJE }, HOJE)).toBeNull();
  });

  it("competência de meses atrás passa — fatura antiga é gasto antigo", () => {
    // A fatura da Railway de agosto é gasto de agosto mesmo lançada em outubro.
    expect(problemaNoGastoManual({ ...BOM, competencia: "2026-01-15" }, HOJE)).toBeNull();
  });

  it("competência ausente ou inventada é recusada", () => {
    for (const c of ["", null, undefined, "29/08/2026", "2026-02-31"]) {
      expect(problemaNoGastoManual({ ...BOM, competencia: c }, HOJE), String(c))
        .toBe("semCompetencia");
    }
  });

  it("pagamento no futuro é recusado — agendado não saiu da conta", () => {
    expect(problemaNoGastoManual({ ...BOM, pagoEm: "2026-09-05" }, HOJE))
      .toBe("pagamentoNoFuturo");
    expect(problemaNoGastoManual({ ...BOM, pagoEm: "não sei" }, HOJE))
      .toBe("pagamentoNoFuturo");
  });

  it("pagamento em branco passa — é o estado normal do que ainda não foi pago", () => {
    // A metade que passa. Obrigar uma data de pagamento faria quem lança
    // inventar uma, e "ainda não pagou" deixaria de ser um fato consultável.
    for (const v of [undefined, null, ""]) {
      expect(problemaNoGastoManual({ ...BOM, pagoEm: v }, HOJE), String(v)).toBeNull();
    }
    expect(problemaNoGastoManual({ ...BOM, pagoEm: HOJE }, HOJE)).toBeNull();
  });

  it("pagamento ANTES da competência passa — pré-pagamento é normal", () => {
    // Domínio pago em janeiro cobre o ano inteiro. Recusar isso obrigaria a
    // mentir na competência, que é justamente o campo que faz a conta do dia.
    expect(
      problemaNoGastoManual({ ...BOM, competencia: "2026-08-01", pagoEm: "2026-07-20" }, HOJE),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// "OUTRO"
// ═══════════════════════════════════════════════════════════════════════════

describe('⭐ "outro" é o balde onde gasto some — e por isso exige descrição de verdade', () => {
  it('⭐ "outro" com descrição genérica é recusado', () => {
    /*
      Toda categoria já exige descrição. Se "outro" exigisse só isso, ele não
      exigiria nada a mais que as outras — e "outro" é a escolha de quem tem
      pressa.

      `categoria: outro, descrição: "diversos"` entra na conta, aparece no total
      e não responde a nenhuma pergunta seis meses depois. Recusar é o que
      impede a categoria de virar um ralo.
    */
    for (const d of ["outros", "Diversos", "gasto", "despesas", "n/a", "GERAL"]) {
      expect(problemaNoGastoManual({ ...BOM, categoria: "outro", descricao: d }, HOJE), d)
        .toBe("outroSemDescricaoEspecifica");
    }
  });

  it('⭐ "outro" com descrição curta demais também é recusado', () => {
    // "taxa" tem forma de descrição e não nomeia nada. O piso de caracteres é
    // uma escolha, não uma verdade — mas sem piso nenhum, "xx" passaria.
    expect(problemaNoGastoManual({ ...BOM, categoria: "outro", descricao: "taxa" }, HOJE))
      .toBe("outroSemDescricaoEspecifica");
  });

  it('⭐ "outro" COM descrição específica passa — a resposta honesta é aceita', () => {
    // A outra metade, e a razão de "outro" existir: obrigar a mentir numa lista
    // curta é pior que aceitar uma resposta escrita à mão.
    expect(
      problemaNoGastoManual(
        { ...BOM, categoria: "outro", descricao: "Multa de trânsito da entrega" },
        HOJE,
      ),
    ).toBeNull();
  });

  it("as outras categorias NÃO exigem descrição longa — a régua extra é só de “outro”", () => {
    // Sem este caso, alguém "consertaria" a regra aplicando o piso a todas as
    // categorias, e "Railway" — que é uma descrição perfeitamente boa em
    // hospedagem — passaria a ser recusada.
    expect(problemaNoGastoManual({ ...BOM, descricao: "Railway" }, HOJE)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS FRASES
// ═══════════════════════════════════════════════════════════════════════════

describe("a recusa chega escrita, e não como código", () => {
  it("nenhuma frase devolve o nome da causa", () => {
    // Devolver `outroSemDescricaoEspecifica` na tela obrigaria o CEO a adivinhar
    // o que consertar.
    const todas: RecusaDoGasto[] = [
      "semDescricao", "categoriaInvalida", "outroSemDescricaoEspecifica", "moedaInvalida",
      "valorNaoEhNumero", "valorFracionado", "valorNegativo", "semCompetencia",
      "competenciaNoFuturo", "pagamentoNoFuturo", "semAutor",
    ];

    for (const r of todas) {
      const frase = explicarRecusaDoGasto(r);
      expect(frase, r).not.toContain(r);
      expect(frase.length, r).toBeGreaterThan(30);
    }
    // Frases repetidas apagariam na tela a diferença entre duas recusas.
    expect(new Set(todas.map(explicarRecusaDoGasto)).size).toBe(todas.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A GRAVAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

function bancoFalso(existentes: unknown[] = []) {
  return {
    gastoManual: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "g-1",
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue(existentes),
    },
  };
}

describe("a gravação do gasto", () => {
  it("grava o que veio, com o dia fixado em UTC", async () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra um
    // `lancarGastoManual` que não gravasse nada.
    const db = bancoFalso();
    const r = await lancarGastoManual(db as never, BOM, AGORA);

    expect(r.ok).toBe(true);
    const gravado = db.gastoManual.create.mock.calls[0]![0].data;
    expect(gravado.descricao).toBe("Fatura Railway de agosto");
    expect(gravado.categoria).toBe("hospedagem");
    expect(gravado.fornecedor).toBe("Railway");
    expect(gravado.valorCent).toBe(12_345);
    expect(gravado.moeda).toBe("BRL");
    expect(gravado.criadoPor).toBe("Dioli (u-ceo)");
    expect(gravado.recorrente).toBe(false);

    // ⚠️ Meia-noite UTC, e não a de São Paulo. A coluna é DATE e não tem fuso:
    // gravar 03:00 UTC faria a leitura de volta cair no dia anterior em metade
    // dos ambientes.
    expect((gravado.competencia as Date).toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(gravado.pagoEm).toBeNull();
  });

  it("⭐ o dia gravado volta igual na leitura — ida e volta sem deslizar", async () => {
    // O defeito que a escolha do UTC impede: gravar 28 e ler 27. Ele não dá
    // erro nenhum — só move o gasto de dia, que é o mesmo estrago do corte de
    // fuso do log de IA, pelo caminho oposto.
    const db = bancoFalso();
    const r = await lancarGastoManual(db as never, { ...BOM, pagoEm: "2026-08-29" }, AGORA);

    expect(r.ok && r.gasto.competencia).toBe("2026-08-28");
    expect(r.ok && r.gasto.pagoEm).toBe("2026-08-29");
  });

  it("⭐ a gravação valida DE NOVO e recusa sem tocar no banco", async () => {
    // A rota já validou, mas amanhã existe um script de importação — e ele vai
    // chamar esta função, não aquela. A regra precisa estar onde a escrita
    // acontece, senão ela não está em lugar nenhum.
    const db = bancoFalso();
    const r = await lancarGastoManual(db as never, { ...BOM, valorCent: -1 }, AGORA);

    expect(r).toEqual({ ok: false, recusa: "valorNegativo" });
    expect(db.gastoManual.create).not.toHaveBeenCalled();
  });

  it("fornecedor em branco vira nulo, e não string vazia", async () => {
    // String vazia na ficha vira um travessão que se lê como "alguém apagou", e
    // não como "ninguém preencheu".
    const db = bancoFalso();
    await lancarGastoManual(db as never, { ...BOM, fornecedor: "   " }, AGORA);

    expect(db.gastoManual.create.mock.calls[0]![0].data.fornecedor).toBeNull();
  });

  it("⭐ o “hoje” da validação sai do instante recebido, e não do relógio", async () => {
    // Uma validação que lesse o relógio por conta própria mudaria de resposta à
    // meia-noite, e o mesmo lançamento passaria às 23h59 e seria recusado à
    // 00h01 — um bug que só aparece de madrugada.
    const db = bancoFalso();
    const emJulho = new Date("2026-07-10T12:00:00Z");

    const r = await lancarGastoManual(db as never, BOM, emJulho);

    expect(r).toEqual({ ok: false, recusa: "competenciaNoFuturo" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A CONTA
// ═══════════════════════════════════════════════════════════════════════════

function linha(over: Partial<{
  id: string; descricao: string; categoria: string; fornecedor: string | null;
  valorCent: number; moeda: string; competencia: string; pagoEm: string | null;
  recorrente: boolean; criadoPor: string;
}> = {}) {
  return {
    id: over.id ?? "g-1",
    descricao: over.descricao ?? "Fatura",
    categoria: over.categoria ?? "hospedagem",
    fornecedor: over.fornecedor ?? null,
    valorCent: over.valorCent ?? 10_000,
    moeda: over.moeda ?? "BRL",
    competencia: new Date(`${over.competencia ?? "2026-08-29"}T00:00:00.000Z`),
    pagoEm: over.pagoEm ? new Date(`${over.pagoEm}T00:00:00.000Z`) : null,
    recorrente: over.recorrente ?? false,
    criadoPor: over.criadoPor ?? "Dioli (u-ceo)",
  };
}

describe("⭐ a soma dos lançamentos", () => {
  it("soma centavos inteiros por dia e por categoria", async () => {
    // A metade que PASSA, e sem ela nada abaixo prova coisa nenhuma.
    const db = bancoFalso([
      linha({ id: "a", valorCent: 10_000, competencia: "2026-08-29" }),
      linha({ id: "b", valorCent: 2_550, competencia: "2026-08-29", categoria: "dominio" }),
      linha({ id: "c", valorCent: 30_000, competencia: "2026-08-28" }),
    ]);

    const r = await somarGastosManuais(db as never, { de: "2026-08-28", ate: "2026-08-29" });
    const dia29 = r.dias.find((d) => d.chave === "2026-08-29")!;

    expect(dia29.porMoeda).toEqual([{ moeda: "BRL", centavos: 12_550, lancamentos: 2 }]);
    expect(dia29.estado).toBe("LANCADO");
    expect(r.total.porMoeda).toEqual([{ moeda: "BRL", centavos: 42_550, lancamentos: 3 }]);
    expect(r.categorias.map((c) => c.chave)).toEqual(["hospedagem", "dominio"]);
    expect(r.categorias.find((c) => c.chave === "dominio")!.porMoeda[0]!.centavos).toBe(2_550);
  });

  it("⭐ real e dólar NÃO se somam — cada moeda tem a sua linha", async () => {
    /*
      Não há cotação neste repositório, e fixar uma taxa produziria um "total da
      empresa" que não bate com fatura nenhuma. A separação está na FORMA do
      dado — `SomaDeGastoManual` não tem campo de total único —, então nem um
      descuido consegue somar as duas.
    */
    const db = bancoFalso([
      linha({ id: "a", valorCent: 10_000, moeda: "BRL" }),
      linha({ id: "b", valorCent: 2_000, moeda: "USD", categoria: "ia" }),
    ]);

    const r = await somarGastosManuais(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.total.porMoeda).toEqual([
      { moeda: "BRL", centavos: 10_000, lancamentos: 1 },
      { moeda: "USD", centavos: 2_000, lancamentos: 1 },
    ]);
    expect(r.total).not.toHaveProperty("centavos");
    expect(fraseDoGastoManual(r.total)).toContain("R$");
    expect(fraseDoGastoManual(r.total)).toContain("US$");
  });

  it("⭐ dia SEM lançamento é SEM_LANCAMENTO — nunca R$ 0,00", async () => {
    /*
      A armadilha central deste arquivo, e ela é diferente da do gasto de IA.
      Lá, um dia sem linha significa mesmo que nenhuma chamada foi feita. Aqui
      não: a Railway cobra por mês e o domínio por ano, então a imensa maioria
      dos dias não tem lançamento — e nenhum deles é um dia de gasto zero.
    */
    const db = bancoFalso([]);
    const r = await somarGastosManuais(db as never, { de: "2026-08-28", ate: "2026-08-29" });

    expect(r.dias).toHaveLength(2);
    for (const d of r.dias) {
      expect(d.estado).toBe("SEM_LANCAMENTO");
      expect(d.porMoeda).toEqual([]);
      const frase = fraseDoGastoManual(d);
      expect(frase).not.toMatch(/R\$|US\$|0,00/);
      expect(frase).toContain("não quer dizer gasto zero");
    }
  });

  it("⭐ todo dia da faixa aparece, mesmo os sem lançamento no meio", async () => {
    // Se a lista viesse do banco, o dia sem lançamento sumiria da tela — e
    // "sumiu" é lido como "não gastou".
    const db = bancoFalso([
      linha({ id: "a", competencia: "2026-08-27" }),
      linha({ id: "b", competencia: "2026-08-29" }),
    ]);

    const r = await somarGastosManuais(db as never, { de: "2026-08-27", ate: "2026-08-29" });

    expect(r.dias.map((d) => d.chave)).toEqual(["2026-08-27", "2026-08-28", "2026-08-29"]);
    expect(r.dias[1]!.estado).toBe("SEM_LANCAMENTO");
  });

  it("a consulta pergunta pela COMPETÊNCIA, e não pela data de pagamento", async () => {
    // A fatura da Railway de agosto é gasto de agosto mesmo quando o cartão só
    // passa em setembro. Contar por `pagoEm` jogaria o gasto no mês errado — e
    // faria o mês em que ninguém pagou nada parecer um mês sem gasto.
    const db = bancoFalso([]);
    await somarGastosManuais(db as never, { de: "2026-08-01", ate: "2026-08-31" });

    const where = db.gastoManual.findMany.mock.calls[0]![0].where as {
      competencia: { gte: Date; lte: Date };
    };
    expect(where.competencia.gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(where.competencia.lte.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("os lançamentos voltam para a tela com quem lançou", async () => {
    // Sem o autor na lista, um gasto estranho não tem a quem perguntar.
    const db = bancoFalso([linha({ id: "a", criadoPor: "Dioli (u-ceo)" })]);
    const r = await somarGastosManuais(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.lancamentos).toHaveLength(1);
    expect(r.lancamentos[0]!.criadoPor).toBe("Dioli (u-ceo)");
    expect(r.lancamentos[0]!.competencia).toBe("2026-08-29");
  });

  it("faixa invertida estoura antes de consultar", async () => {
    const db = bancoFalso([]);
    await expect(
      somarGastosManuais(db as never, { de: "2026-08-29", ate: "2026-08-01" }),
    ).rejects.toThrow(RangeError);
    expect(db.gastoManual.findMany).not.toHaveBeenCalled();
  });
});
