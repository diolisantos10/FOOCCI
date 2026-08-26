/**
 * OS MEUS NÚMEROS — e o número que nunca pode ser do colega.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Um painel pessoal erra de dois jeitos, e só um deles aparece na tela:
 *
 *  · **conta errado** — o vendedor vê 4 clientes e tem 7. Alguém percebe no
 *    mesmo dia, porque ele conhece a própria carteira;
 *  · **conta os dos outros** — o vendedor vê 40 e acha que a Sala está movimentada.
 *    Ninguém percebe, porque o número é plausível. E a partir daí ele sabe o
 *    tamanho da carteira alheia, que é exatamente o que o painel do gerente
 *    existe para não entregar.
 *
 * O segundo é o que a maioria destes casos mede.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meusNumeros, DIAS_PARA_ESQUECIDO } from "./meusNumeros";
import type { SessaoInterna } from "@/lib/internal-auth";

/**
 * O código sem os comentários.
 *
 * Um teste que varre a fonte procurando `searchParams` encontra a frase "esta
 * rota não lê `searchParams`" e reprova o arquivo justamente por ele explicar
 * que está correto. Já aconteceu nesta base, duas vezes.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const EU = "user-diego";

function sessao(over: Partial<SessaoInterna> = {}): SessaoInterna {
  return {
    userId: EU,
    nome: "Diego",
    email: "diego@foocci.com.br",
    role: "AGENTE_HUMANO",
    gerencia: [],
    departamentos: ["vendas"],
    ...over,
  } as SessaoInterna;
}

/**
 * Um banco que devolve o que se mandar, e que GUARDA os `where` recebidos.
 *
 * Guardar é o ponto: a metade importante dos casos não olha o resultado, olha a
 * pergunta que foi feita ao banco. Um painel que devolve o número certo por
 * acaso, tendo perguntado errado, passa em qualquer teste de resultado.
 */
function banco(resp: {
  counts?: number[];
  maisParado?: { lastInteractionAt: Date | null } | null;
}) {
  const fila = [...(resp.counts ?? [])];
  const leadWheres: unknown[] = [];
  const msgWheres: unknown[] = [];

  return {
    leadWheres,
    msgWheres,
    siteLead: {
      count: vi.fn(async (args: { where: unknown }) => {
        leadWheres.push(args.where);
        return fila.shift() ?? 0;
      }),
      findFirst: vi.fn(async (args: { where: unknown }) => {
        leadWheres.push(args.where);
        return resp.maisParado ?? null;
      }),
    },
    leadMensagem: {
      count: vi.fn(async (args: { where: unknown }) => {
        msgWheres.push(args.where);
        return fila.shift() ?? 0;
      }),
    },
  };
}

describe("⭐ nenhum número é do colega", () => {
  it("toda consulta de lead MINHA carrega o meu id", async () => {
    // O caso que carrega o arquivo. As consultas nascem de `Promise.all`, então
    // basta uma esquecer o recorte para o painel passar a contar a Sala inteira
    // — e o número continuaria parecendo razoável.
    const db = banco({ counts: [7, 2, 1, 3, 12], maisParado: { lastInteractionAt: new Date() } });
    await meusNumeros(db as never, { sessao: sessao() });

    // A última é a fila livre, que é de propósito da Sala inteira.
    const minhas = db.leadWheres.slice(0, -1);
    expect(minhas.length, "consultas de lead esperadas").toBeGreaterThanOrEqual(4);

    for (const [i, w] of minhas.entries()) {
      expect(
        (w as { atendenteUserId?: string }).atendenteUserId,
        `a consulta ${i} não filtrou pelo meu id: ${JSON.stringify(w)}`,
      ).toBe(EU);
    }
  });

  it('⭐ "respondi hoje" conta as MINHAS mensagens, não as da Sala', async () => {
    // O erro tentador: filtrar por `autor: "HUMANO"`. Devolveria o total de todo
    // mundo, e o vendedor acharia que trabalhou dez vezes mais do que trabalhou.
    const db = banco({ counts: [1, 0, 0, 5, 3] });
    await meusNumeros(db as never, { sessao: sessao() });

    const w = db.msgWheres[0] as { autorUserId?: string; direcao?: string };
    expect(w.autorUserId, "não filtrou pelo meu id").toBe(EU);
    expect(w.direcao, "contou mensagem de entrada como resposta minha").toBe("SAIDA");
  });

  it("⭐ nem o CEO consegue pedir os números de outra pessoa", async () => {
    // A identidade vem da sessão, e não há parâmetro que a troque. Um `?userId=`
    // seria a forma mais barata de transformar este painel em tela de vigiar o
    // vizinho — e teria sido fácil de acrescentar "para o gerente poder ver".
    const db = banco({ counts: [1, 0, 0, 0, 0] });
    await meusNumeros(db as never, { sessao: sessao({ userId: "user-ceo", role: "MASTER_CEO" }) });

    expect((db.leadWheres[0] as { atendenteUserId?: string }).atendenteUserId).toBe("user-ceo");
  });

  it("a fila livre é a única consulta sem dono — e ela não é minha", async () => {
    // A quinta pergunta: o que dá para pegar. Um painel só do que já é meu
    // ensina a não pegar trabalho novo.
    const db = banco({ counts: [1, 0, 0, 0, 9] });
    const r = await meusNumeros(db as never, { sessao: sessao() });

    const ultima = db.leadWheres[db.leadWheres.length - 1] as {
      atendenteUserId?: string;
      atendidoPor?: { in: string[] };
    };
    expect(ultima.atendenteUserId, "a fila livre virou fila minha").toBeUndefined();
    expect(ultima.atendidoPor?.in).toEqual(["NINGUEM", "AGUARDANDO_HUMANO"]);
    expect(r.livresNaFila).toBe(9);
  });
});

describe("⭐ a rota não deixa pedir os números de outro", () => {
  it("não lê nenhum parâmetro da URL", () => {
    // A trava estrutural, e ela vive fora do serviço porque é ali que o buraco
    // apareceria: um `?userId=` chega disfarçado de coisa boa — *"para o gerente
    // poder abrir os números de cada um"*. O gerente já tem o painel dele.
    //
    // Aceitar o parâmetro aqui daria essa capacidade a QUALQUER sessão da Sala,
    // porque a guarda que protege o endereço não distingue os parâmetros que
    // passam por ela.
    //
    // Lê o código sem comentários — um teste que varre prosa acha a prosa.
    const codigo = semComentarios(
      readFileSync(
        join(process.cwd(), "src/app/api/admin/sala-de-vendas/meus-numeros/route.ts"),
        "utf8",
      ),
    );

    expect(codigo, "a rota passou a ler parâmetro da URL").not.toMatch(
      /searchParams|nextUrl|req\.url/,
    );
    // E a identidade continua saindo da sessão do portão.
    expect(codigo).toContain("portao.sessao");
  });
});

describe("os números respondem o que a pergunta diz", () => {
  it("devolve o nome de quem pediu, para a tela poder dizer de quem são", async () => {
    const db = banco({ counts: [3, 1, 0, 2, 4] });
    const r = await meusNumeros(db as never, { sessao: sessao() });

    expect(r.nome).toBe("Diego");
    expect(r.meusClientes).toBe(3);
    expect(r.esperandoMinhaResposta).toBe(1);
  });

  it('"esperando minha resposta" é quem tem mensagem não lida', async () => {
    const db = banco({ counts: [5, 2, 0, 0, 0] });
    await meusNumeros(db as never, { sessao: sessao() });

    const w = db.leadWheres[1] as { naoLidas?: { gt: number } };
    expect(w.naoLidas).toEqual({ gt: 0 });
  });

  it("⭐ quem nunca teve contato conta como esquecido", async () => {
    // O caso que some sozinho: filtrar só por `lastInteractionAt < limite`
    // deixaria de fora quem tem `null` — e `null` é o lead que eu peguei e
    // nunca falei, que é o mais urgente, não o menos.
    const db = banco({ counts: [4, 0, 2, 0, 0] });
    await meusNumeros(db as never, { sessao: sessao() });

    const w = db.leadWheres[2] as { OR?: Array<Record<string, unknown>> };
    const temNulo = w.OR?.some((c) => c.lastInteractionAt === null);
    expect(temNulo, `o filtro de esquecidos ignora quem nunca teve contato: ${JSON.stringify(w.OR)}`).toBe(true);
  });

  it("o mais parado vem em horas, contadas do último contato", async () => {
    const agora = new Date("2026-08-26T18:00:00Z");
    const db = banco({
      counts: [2, 0, 1, 0, 0],
      maisParado: { lastInteractionAt: new Date("2026-08-26T06:00:00Z") },
    });

    const r = await meusNumeros(db as never, { sessao: sessao(), agora });
    expect(r.horasDoMaisParado).toBe(12);
  });

  it("⭐ sem cliente nenhum o mais parado é null, e não zero", async () => {
    // Zero diria "está tudo em dia". A verdade é "não tenho cliente". A tela
    // precisa das duas frases separadas, ou o vendedor novo abre o painel e lê
    // um elogio.
    const db = banco({ counts: [0, 0, 0, 0, 6], maisParado: null });
    const r = await meusNumeros(db as never, { sessao: sessao() });

    expect(r.horasDoMaisParado).toBeNull();
    expect(r.meusClientes).toBe(0);
  });

  it("tenho cliente, mas o mais parado nunca teve contato → null também", async () => {
    const db = banco({ counts: [3, 0, 3, 0, 0], maisParado: { lastInteractionAt: null } });
    const r = await meusNumeros(db as never, { sessao: sessao() });

    // Não há "desde quando". Quem mostra este caso é o contador de esquecidos.
    expect(r.horasDoMaisParado).toBeNull();
    expect(r.esquecidos).toBe(3);
  });

  it('⭐ "respondi hoje" começa à meia-noite, não 24 horas atrás', async () => {
    // "Últimas 24 horas" às 9h da manhã estaria contando o trabalho de ontem à
    // noite — e "respondi hoje" viraria mentira antes do almoço.
    const agora = new Date(2026, 7, 26, 9, 30, 0);
    const db = banco({ counts: [1, 0, 0, 4, 0] });
    await meusNumeros(db as never, { sessao: sessao(), agora });

    const w = db.msgWheres[0] as { ocorreuEm?: { gte: Date } };
    const inicio = w.ocorreuEm!.gte;
    expect(inicio.getHours(), `começou às ${inicio.getHours()}h`).toBe(0);
    expect(inicio.getDate()).toBe(26);
  });

  it("o limite de esquecido é o mesmo que a constante publica", async () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const db = banco({ counts: [1, 0, 0, 0, 0] });
    await meusNumeros(db as never, { sessao: sessao(), agora });

    const w = db.leadWheres[2] as { OR?: Array<{ lastInteractionAt?: { lt: Date } }> };
    const limite = w.OR?.find((c) => c.lastInteractionAt?.lt)?.lastInteractionAt!.lt;
    const dias = (agora.getTime() - limite!.getTime()) / 86_400_000;
    expect(dias).toBe(DIAS_PARA_ESQUECIDO);
  });
});
