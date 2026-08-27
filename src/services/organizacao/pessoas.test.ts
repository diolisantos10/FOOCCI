/**
 * PESSOAS E ACESSOS — as duas coisas que não podem dar errado calado.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Uma área de RH erra de dois jeitos caros, e nenhum dos dois grita na hora:
 *
 *  · **cortar demais** — desativar o último CEO tranca a casa por fora. Não há
 *    tela que conserte, porque a tela que conserta é justamente a que exige um
 *    CEO. O conserto seria um comando de terminal em produção — exatamente o
 *    que esta área existe para eliminar;
 *  · **apagar em vez de desativar** — o nome da pessoa está preso a cada
 *    conversa que ela atendeu. Apagar o registro transforma meses de histórico
 *    em "atendido por ninguém", e ninguém percebe até alguém perguntar quem
 *    falou com um cliente.
 *
 * O terceiro é mais sutil e vive na criação: **o mesmo e-mail troca a senha de
 * quem já existe**. É útil de propósito (é assim que se recupera acesso
 * perdido) e é uma armadilha se a tela não avisar.
 */

import { describe, it, expect, vi } from "vitest";
import {
  criarPessoa,
  mudarAtivacao,
  listarPessoas,
  tipoValido,
  TIPOS_DE_ACESSO,
} from "./pessoas";

function banco(over: {
  existente?: { id: string } | null;
  pessoa?: { id: string; nome: string; role: string; isActive: boolean } | null;
  outrosCeos?: number;
} = {}) {
  return {
    internalUser: {
      findUnique: vi.fn(async (args: { where: { email?: string; id?: string } }) =>
        args.where.id ? (over.pessoa ?? null) : (over.existente ?? null),
      ),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => over.outrosCeos ?? 0),
      upsert: vi.fn(async () => ({ id: "novo" })),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    department: { findUnique: vi.fn(async () => ({ id: "dep" })) },
    departmentMembership: { upsert: vi.fn(async () => ({})) },
  };
}

describe("os tipos de acesso", () => {
  it("⭐ AGENTE_IA não está na lista — agente não faz login", () => {
    // Oferecê-lo aqui criaria uma ficha que parece acesso e nunca entra:
    // `autenticarInterno` recusa esse papel mesmo com senha gravada. Quem
    // criasse veria "acesso criado" e a pessoa não entraria nunca.
    const papeis = TIPOS_DE_ACESSO.map((t) => t.papel) as string[];
    expect(papeis, `a lista oferece: ${papeis.join(", ")}`).not.toContain("AGENTE_IA");
    expect(tipoValido("AGENTE_IA")).toBe(false);
  });

  it("todo tipo explica o que pode e o que não pode", () => {
    // O CEO pediu: "cada um tem os seus poderes". Sem a explicação, escolher o
    // tipo é escolher uma palavra — e a diferença entre gerente e diretor vira
    // folclore, resolvido perguntando ao colega mais antigo.
    for (const t of TIPOS_DE_ACESSO) {
      expect(t.rotulo.trim(), `${t.papel} sem rótulo`).not.toBe("");
      expect(t.resumo.trim().length, `${t.papel} sem resumo`).toBeGreaterThan(10);
      expect(t.pode.length, `${t.papel} não diz o que pode`).toBeGreaterThan(0);
    }
  });

  it("recusa papel inventado", () => {
    expect(tipoValido("DONO_SUPREMO")).toBe(false);
    expect(tipoValido("MASTER_CEO")).toBe(true);
  });
});

describe("criar pessoa", () => {
  it("cria com senha e devolve ela uma vez", async () => {
    const db = banco();
    const r = await criarPessoa(db as never, {
      nome: "Marina",
      email: "Marina@Foocci.com.br",
      papel: "AGENTE_HUMANO",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.senha.length).toBeGreaterThan(8);
    expect(r.jaExistia).toBe(false);

    // E-mail vira minúsculo: senão "Marina@" e "marina@" viram duas pessoas
    // com o mesmo endereço, e a segunda nunca entra.
    const args = db.internalUser.upsert.mock.calls[0]![0] as { where: { email: string } };
    expect(args.where.email).toBe("marina@foocci.com.br");
  });

  it("⭐ o mesmo e-mail TROCA a senha, e diz isso", async () => {
    // A armadilha útil. Quem digita o e-mail de um colega por engano derruba o
    // acesso dele sem receber erro nenhum — por isso `jaExistia` volta, e a
    // tela é obrigada a escrever "senha trocada" em vez de "pessoa criada".
    const db = banco({ existente: { id: "ja-existe" } });
    const r = await criarPessoa(db as never, {
      nome: "Marina",
      email: "marina@foocci.com.br",
      papel: "AGENTE_HUMANO",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jaExistia, "não avisou que a senha de alguém foi trocada").toBe(true);
  });

  it("⭐ recriar reativa quem tinha sido desligado", async () => {
    // Sem `isActive: true` no update, readmitir alguém geraria uma senha nova
    // que não entra — e o sintoma seria "criei e não funciona".
    const db = banco({ existente: { id: "saiu" } });
    await criarPessoa(db as never, {
      nome: "Marina",
      email: "marina@foocci.com.br",
      papel: "AGENTE_HUMANO",
    });

    const args = db.internalUser.upsert.mock.calls[0]![0] as {
      update: { isActive?: boolean; passwordHash?: string };
    };
    expect(args.update.isActive).toBe(true);
    expect(args.update.passwordHash, "o update não grava a senha nova").toBeTruthy();
  });

  it("recusa e-mail inválido e papel desconhecido, com frase", async () => {
    const semArroba = await criarPessoa(banco() as never, {
      nome: "X",
      email: "naoehemail",
      papel: "AGENTE_HUMANO",
    });
    expect(semArroba).toMatchObject({ ok: false });

    const papelRuim = await criarPessoa(banco() as never, {
      nome: "X",
      email: "x@y.com",
      papel: "DONO_SUPREMO",
    });
    expect(papelRuim).toMatchObject({ ok: false });
    if (papelRuim.ok) return;
    expect(papelRuim.erro).toContain("DONO_SUPREMO");
  });

  it("nome vazio é recusado — pessoa sem nome não assina conversa", async () => {
    const r = await criarPessoa(banco() as never, {
      nome: "   ",
      email: "x@y.com",
      papel: "AGENTE_HUMANO",
    });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("⭐ cortar acesso", () => {
  it("desativa, e NUNCA apaga", async () => {
    // O nome da pessoa está preso a cada conversa que ela atendeu. Apagar
    // transformaria meses de histórico em "atendido por ninguém".
    const db = banco({
      pessoa: { id: "p1", nome: "Marina", role: "AGENTE_HUMANO", isActive: true },
    });

    const r = await mudarAtivacao(db as never, { id: "p1", ativa: false });

    expect(r).toMatchObject({ ok: true, nome: "Marina", ativa: false });
    expect(db.internalUser.delete, "apagou a pessoa em vez de desativar").not.toHaveBeenCalled();

    const args = db.internalUser.update.mock.calls[0]![0] as { data: { isActive: boolean } };
    expect(args.data.isActive).toBe(false);
  });

  it("⭐ recusa cortar o ÚLTIMO CEO — isso trancaria a casa por fora", async () => {
    // Não há tela que conserte, porque a tela que conserta é justamente a que
    // exige um CEO. O conserto seria um comando de terminal em produção.
    const db = banco({
      pessoa: { id: "ceo", nome: "Dono", role: "MASTER_CEO", isActive: true },
      outrosCeos: 0,
    });

    const r = await mudarAtivacao(db as never, { id: "ceo", ativa: false });

    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.erro).toContain("último CEO");
    expect(db.internalUser.update, "cortou o último CEO mesmo assim").not.toHaveBeenCalled();
  });

  it("deixa cortar um CEO quando há outro ativo", async () => {
    // A outra metade: uma trava que recusasse SEMPRE passaria no caso acima e
    // deixaria a empresa sem como remover um CEO que saiu.
    const db = banco({
      pessoa: { id: "ceo1", nome: "Sócio", role: "MASTER_CEO", isActive: true },
      outrosCeos: 1,
    });

    const r = await mudarAtivacao(db as never, { id: "ceo1", ativa: false });
    expect(r).toMatchObject({ ok: true, ativa: false });
  });

  it("devolver acesso funciona, e não é bloqueado por nada", async () => {
    const db = banco({
      pessoa: { id: "p1", nome: "Marina", role: "MASTER_CEO", isActive: false },
      outrosCeos: 0,
    });

    // Reativar um CEO nunca pode ser recusado pela regra do "último": ela existe
    // para impedir que a casa fique sem CEO, e reativar faz o contrário.
    const r = await mudarAtivacao(db as never, { id: "p1", ativa: true });
    expect(r).toMatchObject({ ok: true, ativa: true });
  });

  it("pessoa inexistente é recusa nomeada, não exceção", async () => {
    const r = await mudarAtivacao(banco({ pessoa: null }) as never, { id: "sumiu", ativa: false });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("a lista", () => {
  it("⭐ mostra os desativados junto, e ativos primeiro", async () => {
    // Esconder os desativados responderia "não achei" a quem pergunta
    // "cortaram o acesso do Fulano?" — que é a pergunta mais comum desta tela.
    const db = banco();
    await listarPessoas(db as never);

    const args = db.internalUser.findMany.mock.calls[0]![0] as {
      where?: unknown;
      orderBy: Array<Record<string, string>>;
    };
    expect(args.where, "a lista passou a filtrar alguém").toBeUndefined();
    expect(args.orderBy[0]).toEqual({ isActive: "desc" });
  });
});
