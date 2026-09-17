/**
 * A PROVA — o defeito medido em produção, reproduzido e depois recusado.
 *
 * ── O QUE FOI MEDIDO, 17/09/2026 ────────────────────────────────────────────
 *
 * 200 conversas do banco de produção: 21 receberam a MESMA mensagem repetida.
 * BUON GUSTO Pizzeria e Dory's Marmitaria receberam o mesmo texto 16 vezes.
 *
 * ── COMO ESTE ARQUIVO PROVA, e por que a prova é honesta ────────────────────
 *
 * O banco falso abaixo **implementa as mesmas travas do Postgres**: chave
 * primária que recusa a segunda linha e `@@unique` composto. Sem isso o teste
 * mediria o próprio mock, e não o desenho — régua verde sobre o componente
 * errado é pior que régua nenhuma.
 *
 * Os casos `SEM A TRAVA` rodam o MESMO laço de envio com a reserva desligada,
 * e provam que ele repete. Os casos seguintes ligam a reserva e provam que ele
 * para de repetir. Os dois números aparecem no `expect`.
 */

import { describe, it, expect } from "vitest";
import {
  reservarEnvio,
  impressaoDoConteudo,
  digitosDoTelefone,
  intervaloMinimoEmHoras,
  INTERVALO_MINIMO_HORAS_PADRAO,
} from "./travaDeRepeticao";

// ─────────────────────────────────────────────────────────────────────────────
// O BANCO FALSO — com as travas do Postgres de verdade
// ─────────────────────────────────────────────────────────────────────────────

function bancoComTravasReais() {
  const ritmo = new Map<string, Date>();
  const enviadas = new Set<string>();
  const recusas: Array<{ motivo: string; detalhe: string; telefoneDigits: string }> = [];

  return {
    recusas,
    travaDeAbordagemRitmo: {
      async updateMany(args: { where: { telefoneDigits: string; ultimoEnvioEm: { lt: Date } }; data: { ultimoEnvioEm: Date } }) {
        const atual = ritmo.get(args.where.telefoneDigits);
        if (atual === undefined) return { count: 0 };
        if (atual.getTime() >= args.where.ultimoEnvioEm.lt.getTime()) return { count: 0 };
        ritmo.set(args.where.telefoneDigits, args.data.ultimoEnvioEm);
        return { count: 1 };
      },
      async create(args: { data: { telefoneDigits: string; ultimoEnvioEm: Date } }) {
        // A chave primária do Postgres: a segunda linha é recusada.
        if (ritmo.has(args.data.telefoneDigits)) {
          throw new Error("Unique constraint failed on the fields: (`telefoneDigits`)");
        }
        ritmo.set(args.data.telefoneDigits, args.data.ultimoEnvioEm);
        return args.data;
      },
    },
    travaDeAbordagemEnviada: {
      async create(args: { data: { telefoneDigits: string; impressao: string } }) {
        const chave = `${args.data.telefoneDigits}::${args.data.impressao}`;
        // O `@@unique([telefoneDigits, impressao])`.
        if (enviadas.has(chave)) {
          throw new Error("Unique constraint failed on the fields: (`telefoneDigits`,`impressao`)");
        }
        enviadas.add(chave);
        return args.data;
      },
    },
    travaDeAbordagemRecusa: {
      async create(args: { data: { motivo: string; detalhe: string; telefoneDigits: string } }) {
        recusas.push(args.data);
        return args.data;
      },
    },
  };
}

type BancoFalso = ReturnType<typeof bancoComTravasReais>;

const TELEFONE = "+55 11 98888-7777";
const TEXTO =
  "Olá, Marcos! Aqui é a Foocci falando com o BUON GUSTO Pizzeria porque encontramos vocês no Google Maps.";
const AGORA = new Date("2026-09-17T14:26:00Z");

/**
 * O laço de envio, do jeito que a casa o tem hoje.
 *
 * `comTrava: false` é o código ATUAL: nada pergunta se o conteúdo já saiu, e o
 * envio acontece. `comTrava: true` é o mesmo laço com a reserva no caminho.
 */
async function rodada(
  db: BancoFalso,
  opcoes: { comTrava: boolean; quantas: number; agora?: Date; intervaloHoras?: number },
): Promise<{ enviadas: number; recusadas: number }> {
  let enviadas = 0;
  let recusadas = 0;

  for (let i = 0; i < opcoes.quantas; i++) {
    if (opcoes.comTrava) {
      const r = await reservarEnvio(db as never, {
        telefone: TELEFONE,
        conteudo: TEXTO,
        natureza: "abordagem",
        leadId: "L-BUON-GUSTO",
        origem: "teste",
        agora: opcoes.agora ?? AGORA,
        ...(opcoes.intervaloHoras !== undefined ? { intervaloHoras: opcoes.intervaloHoras } : {}),
      });
      if (!r.liberado) {
        recusadas += 1;
        continue;
      }
    }
    enviadas += 1; // ← aqui a mensagem bateria na Meta
  }

  return { enviadas, recusadas };
}

describe("o defeito, reproduzido com o código ATUAL", () => {
  it("SEM A TRAVA: dezesseis rodadas mandam dezesseis vezes a mesma mensagem", async () => {
    const db = bancoComTravasReais();

    const r = await rodada(db, { comTrava: false, quantas: 16 });

    // É o número medido em produção para BUON GUSTO Pizzeria.
    expect(r.enviadas).toBe(16);
    expect(r.recusadas).toBe(0);
    expect(db.recusas).toHaveLength(0);
  });

  it("SEM A TRAVA: duas rodadas SIMULTÂNEAS mandam as duas", async () => {
    const db = bancoComTravasReais();

    const [a, b] = await Promise.all([
      rodada(db, { comTrava: false, quantas: 1 }),
      rodada(db, { comTrava: false, quantas: 1 }),
    ]);

    expect(a.enviadas + b.enviadas).toBe(2);
  });
});

describe("com a trava, o mesmo laço para de repetir", () => {
  it("dezesseis rodadas → UMA mensagem sai, quinze recusadas com motivo", async () => {
    const db = bancoComTravasReais();

    const r = await rodada(db, { comTrava: true, quantas: 16 });

    expect(r.enviadas).toBe(1);
    expect(r.recusadas).toBe(15);
    // A recusa fica ESCRITA — não vira silêncio.
    expect(db.recusas).toHaveLength(15);
    expect(db.recusas[0]?.motivo).toBe("intervaloMinimo");
  });

  it("⭐ CORRIDA: duas rodadas simultâneas para o mesmo lead → UMA mensagem só sai", async () => {
    const db = bancoComTravasReais();

    const [a, b] = await Promise.all([
      rodada(db, { comTrava: true, quantas: 1 }),
      rodada(db, { comTrava: true, quantas: 1 }),
    ]);

    expect(a.enviadas + b.enviadas).toBe(1);
    expect(a.recusadas + b.recusadas).toBe(1);
  });

  it("⭐ CORRIDA maior: dez rodadas simultâneas → UMA mensagem só sai", async () => {
    const db = bancoComTravasReais();

    const todas = await Promise.all(
      Array.from({ length: 10 }, () => rodada(db, { comTrava: true, quantas: 1 })),
    );

    expect(todas.reduce((s, r) => s + r.enviadas, 0)).toBe(1);
    expect(todas.reduce((s, r) => s + r.recusadas, 0)).toBe(9);
  });

  it("o mesmo conteúdo continua recusado DEPOIS do intervalo mínimo", async () => {
    const db = bancoComTravasReais();

    const primeira = await rodada(db, { comTrava: true, quantas: 1, agora: AGORA });
    expect(primeira.enviadas).toBe(1);

    // Três dias depois: o ritmo já liberou, e o conteúdo não.
    const depois = new Date(AGORA.getTime() + 72 * 3_600_000);
    const segunda = await rodada(db, { comTrava: true, quantas: 1, agora: depois });

    expect(segunda.enviadas).toBe(0);
    expect(db.recusas.at(-1)?.motivo).toBe("conteudoJaEnviado");
  });

  it("conteúdo DIFERENTE depois do intervalo passa — a cadência planejada não quebra", async () => {
    const db = bancoComTravasReais();

    const um = await reservarEnvio(db as never, {
      telefone: TELEFONE, conteudo: TEXTO, natureza: "abordagem", origem: "teste", agora: AGORA,
    });
    expect(um.liberado).toBe(true);

    const doisDiasDepois = new Date(AGORA.getTime() + 48 * 3_600_000);
    const dois = await reservarEnvio(db as never, {
      telefone: TELEFONE,
      conteudo: "Marcos, passando de novo — conseguiu ver o material que mandei?",
      natureza: "abordagem",
      origem: "teste",
      agora: doisDiasDepois,
    });

    expect(dois.liberado).toBe(true);
  });
});

describe("o que a trava NÃO pode bloquear", () => {
  it("resposta dentro de conversa viva passa sempre, mesmo repetida", async () => {
    const db = bancoComTravasReais();

    for (let i = 0; i < 5; i++) {
      const r = await reservarEnvio(db as never, {
        telefone: TELEFONE,
        conteudo: "Claro! Somos R$ 297 por mês, sem fidelidade.",
        natureza: "conversa",
        origem: "ta",
        agora: AGORA,
      });
      expect(r.liberado).toBe(true);
    }

    expect(db.recusas).toHaveLength(0);
  });
});

describe("fail-closed — na dúvida, não envia", () => {
  it("telefone ilegível recusa", async () => {
    const db = bancoComTravasReais();
    const r = await reservarEnvio(db as never, {
      telefone: "123", conteudo: TEXTO, natureza: "abordagem", origem: "teste", agora: AGORA,
    });
    expect(r).toMatchObject({ liberado: false, motivo: "semTelefone" });
  });

  it("conteúdo vazio recusa", async () => {
    const db = bancoComTravasReais();
    const r = await reservarEnvio(db as never, {
      telefone: TELEFONE, conteudo: "   ", natureza: "abordagem", origem: "teste", agora: AGORA,
    });
    expect(r).toMatchObject({ liberado: false, motivo: "semConteudo" });
  });

  it("banco fora do ar recusa — e NÃO libera", async () => {
    const db = bancoComTravasReais();
    db.travaDeAbordagemRitmo.updateMany = async () => {
      throw new Error("connection refused");
    };

    const r = await reservarEnvio(db as never, {
      telefone: TELEFONE, conteudo: TEXTO, natureza: "abordagem", origem: "teste", agora: AGORA,
    });

    expect(r).toMatchObject({ liberado: false, motivo: "bancoIndisponivel" });
  });
});

describe("as peças de baixo", () => {
  it("a impressão ignora espaço e caixa, e separa textos diferentes", () => {
    expect(impressaoDoConteudo("Olá,  Marcos!")).toBe(impressaoDoConteudo("olá, marcos!"));
    expect(impressaoDoConteudo("Olá, Marcos!")).not.toBe(impressaoDoConteudo("Olá, Marina!"));
  });

  it("o telefone é comparado por dígitos — formato legado é a mesma pessoa", () => {
    expect(digitosDoTelefone("+55 (11) 98888-7777")).toBe(digitosDoTelefone("5511988887777"));
  });

  it("o intervalo configurável só APERTA, nunca afrouxa", () => {
    expect(intervaloMinimoEmHoras({} as NodeJS.ProcessEnv)).toBe(INTERVALO_MINIMO_HORAS_PADRAO);
    expect(
      intervaloMinimoEmHoras({ FOOCCI_INTERVALO_MINIMO_ABORDAGEM_HORAS: "1" } as NodeJS.ProcessEnv),
    ).toBe(INTERVALO_MINIMO_HORAS_PADRAO);
    expect(
      intervaloMinimoEmHoras({ FOOCCI_INTERVALO_MINIMO_ABORDAGEM_HORAS: "72" } as NodeJS.ProcessEnv),
    ).toBe(72);
  });
});
