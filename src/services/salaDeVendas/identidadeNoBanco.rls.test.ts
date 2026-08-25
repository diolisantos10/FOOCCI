/**
 * A QUARTA CAMADA, CONTRA POSTGRES DE VERDADE.
 *
 * ── POR QUE ESTE ARQUIVO PRECISA DE BANCO ───────────────────────────────────
 *
 * Row Level Security não é lógica de aplicação: é regra do Postgres. Não existe
 * como testá-la com mock — um mock provaria que o TypeScript chama a função
 * certa, e a pergunta é outra: **o banco recusa?**
 *
 * A verificação já achou dois buracos que a leitura do SQL não acharia:
 *
 *   1. `NULL IN (...)` devolve NULL, não `false`. Sem `COALESCE`, o papel
 *      ausente atravessava o `OR` e deixava a política indecisa.
 *   2. O ramo "lead de ninguém é alcançável" não exigia identidade. Uma conexão
 *      anônima lia a fila aberta inteira — 6 linhas, medidas. A trava aparecia
 *      como ativa em `pg_class` e vazava.
 *
 * ── COMO RODAR ──
 *
 *     SALA_VENDAS_TEST_DB=postgresql://…/foocci_rls npx vitest run …rls.test.ts
 *
 * Sem a variável, o arquivo é PULADO com aviso alto — e o aviso é o ponto:
 * pular calado faria a suíte verde afirmar que a autorização de banco foi
 * verificada quando ninguém a verificou.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_DO_BANCO = process.env.SALA_VENDAS_TEST_DB;
const temBanco = Boolean(URL_DO_BANCO);

if (!temBanco) {
  console.warn(
    "[rls] PULADO: SALA_VENDAS_TEST_DB não definida. " +
      "A autorização NO BANCO não foi verificada nesta execução.",
  );
}

// Construção preguiçosa: `new PrismaClient({ url: undefined })` estoura na
// coleção, e um arquivo pulado não pode derrubar a suíte inteira.
let db: import("@prisma/client").PrismaClient;

const SEM_BANCO = !temBanco;

describe.skipIf(SEM_BANCO)("a trava do banco", () => {
  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient({ datasources: { db: { url: URL_DO_BANCO } } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /**
   * Conta mensagens sob uma identidade declarada — ou sem nenhuma.
   *
   * Usa `set_config` PARAMETRIZADO, que é o mesmo caminho de `comIdentidade`.
   * A primeira versão deste ajudante concatenava o papel na string do comando, e
   * o teste com `MASTER_CEO'; --` leu a base inteira: a aspa fechava e o resto
   * virava comentário. Foi o que motivou trocar `SET LOCAL` por `set_config`.
   */
  async function mensagensVistasPor(
    papel: string | null,
    usuarioId?: string,
  ): Promise<number> {
    return db.$transaction(async (tx) => {
      if (papel !== null) {
        await tx.$executeRaw`SELECT set_config('app.papel', ${papel}, true)`;
        if (usuarioId) {
          await tx.$executeRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
        }
      }
      return tx.leadMensagem.count();
    });
  }

  it("as tabelas da Sala têm RLS ligado E forçado", async () => {
    // FORCE é tão obrigatório quanto ENABLE: a aplicação conecta como DONA das
    // tabelas, e a dona ignora RLS sem ele. Sem FORCE, tudo isto é decorativo.
    const { travaDoBancoEstaDePe } = await import("./identidadeNoBanco");
    const r = await travaDoBancoEstaDePe(db);

    expect(r.tabelasSemRLS).toEqual([]);
    expect(r.ativa).toBe(true);
  });

  it("sem identidade declarada, NADA é visível", async () => {
    // O caso que importa: alguém com a string de conexão, num `psql`.
    expect(await mensagensVistasPor(null)).toBe(0);
  });

  it("papel inventado também não vê nada", async () => {
    // O banco valida o papel POR CONTA PRÓPRIA. Confiar na validação da
    // aplicação aqui seria apoiar a quarta camada na segunda — e a quarta
    // existe justamente para valer quando a aplicação não está no caminho.
    expect(await mensagensVistasPor("CHEFAO")).toBe(0);
    expect(await mensagensVistasPor("")).toBe(0);
    // Com `set_config` parametrizado, isto é um papel chamado "MASTER_CEO'; --",
    // e não um comando. Pela concatenação antiga, promovia a CEO.
    expect(await mensagensVistasPor("MASTER_CEO'; --")).toBe(0);
  });

  it("o CEO vê tudo", async () => {
    // A metade que PASSA. Sem ela, uma política que negasse tudo ficaria verde
    // em todos os testes acima — e a Sala não abriria para ninguém.
    const total = await mensagensVistasPor("MASTER_CEO");
    expect(total).toBeGreaterThan(0);
  });

  it("o SDR vê o que é dele e o que está na fila aberta — e mais nada", async () => {
    const doCeo = await mensagensVistasPor("MASTER_CEO");
    const daMarina = await mensagensVistasPor("AGENTE_HUMANO", "marina");

    expect(daMarina).toBeGreaterThan(0);
    expect(daMarina).toBeLessThan(doCeo);
  });

  it("dois SDRs veem conjuntos diferentes", async () => {
    // Se os dois vissem o mesmo, a política estaria ignorando `app.usuario_id`
    // e devolvendo só a fila aberta para todo mundo.
    const marina = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.papel', 'AGENTE_HUMANO', true)`;
      await tx.$executeRaw`SELECT set_config('app.usuario_id', 'marina', true)`;
      const linhas = await tx.leadMensagem.findMany({ select: { leadId: true } });
      return linhas.map((l) => l.leadId).sort();
    });

    const outra = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.papel', 'AGENTE_HUMANO', true)`;
      await tx.$executeRaw`SELECT set_config('app.usuario_id', 'outra', true)`;
      const linhas = await tx.leadMensagem.findMany({ select: { leadId: true } });
      return linhas.map((l) => l.leadId).sort();
    });

    expect(marina).not.toEqual(outra);
    // Mas os dois alcançam a fila aberta — é o que sustenta "puxar da fila".
    const emComum = marina.filter((m) => outra.includes(m));
    expect(emComum.length).toBeGreaterThan(0);
  });

  it("o SISTEMA vê tudo — é o webhook, sem pessoa por trás", async () => {
    const sistema = await mensagensVistasPor("SISTEMA");
    const ceo = await mensagensVistasPor("MASTER_CEO");
    expect(sistema).toBe(ceo);
  });

  it("a identidade NÃO vaza da transação para a conexão", async () => {
    // `SET LOCAL` morre com a transação. Se algum dia virar `SET`, a identidade
    // do último usuário fica grudada na conexão e vaza para a próxima
    // requisição que pegar a mesma — um vazamento intermitente, dependente de
    // carga, indistinguível de "engano de quem reportou".
    await mensagensVistasPor("MASTER_CEO");
    expect(await mensagensVistasPor(null)).toBe(0);
  });

  it("`comIdentidade` recusa papel fora da lista antes de tocar no banco", async () => {
    const { comIdentidade, IdentidadeInvalida } = await import("./identidadeNoBanco");

    await expect(
      comIdentidade(
        db,
        { tipo: "pessoa", papel: "CHEFAO" as never, usuarioId: "x" },
        async () => 1,
      ),
    ).rejects.toBeInstanceOf(IdentidadeInvalida);
  });

  it("`comIdentidade` recusa id com aspas — o caminho da injeção", async () => {
    const { comIdentidade, IdentidadeInvalida } = await import("./identidadeNoBanco");

    await expect(
      comIdentidade(
        db,
        { tipo: "pessoa", papel: "AGENTE_HUMANO", usuarioId: "x'; DROP TABLE lead_mensagens; --" },
        async () => 1,
      ),
    ).rejects.toBeInstanceOf(IdentidadeInvalida);
  });

  it("`comoSistema` exige motivo escrito", async () => {
    const { comoSistema } = await import("./identidadeNoBanco");
    expect(() => comoSistema("  ")).toThrow();
    expect(comoSistema("webhook").tipo).toBe("sistema");
  });
});
