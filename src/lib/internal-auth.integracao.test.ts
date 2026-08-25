import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * Integração de verdade: banco real, bcrypt real.
 *
 * Só roda com `INTERNAL_AUTH_TEST_DB` apontando para um Postgres descartável.
 * Sem ela, o arquivo pula — e diz por quê. Teste que se pula em silêncio é
 * teste que ninguém percebe que parou de rodar.
 *
 *   createdb foocci_teste
 *   psql -d foocci_teste -f prisma/migrations/<...>_organizacao_interna_foocci/migration.sql
 *   INTERNAL_AUTH_TEST_DB=postgresql://... npx vitest run internal-auth.integracao
 *
 * ── POR QUE TUDO É CARREGADO DENTRO DO `beforeAll` ──
 *
 * Duas razões, e as duas doeram uma vez:
 *
 *   1. `describe.skip` PULA os testes, mas ainda executa o corpo do bloco para
 *      poder listá-los. Construir o PrismaClient aqui fora quebrava o arquivo
 *      inteiro na coleta quando a variável não estava definida — a suíte
 *      acusava "1 arquivo falhou" com zero testes falhando.
 *   2. `autenticarInterno` usa o singleton de `@/lib/prisma`, que lê
 *      `DATABASE_URL` no instante em que é criado. Apontar `DATABASE_URL` para
 *      o banco descartável ANTES de importar o módulo é o que garante que este
 *      teste não escreva no banco de verdade de quem o rodar.
 */

const URL_TESTE = process.env.INTERNAL_AUTH_TEST_DB;
const rodar = URL_TESTE ? describe : describe.skip;

if (!URL_TESTE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[internal-auth.integracao] pulado: INTERNAL_AUTH_TEST_DB não definida. " +
      "O login contra banco real NÃO foi verificado nesta execução.",
  );
}

rodar("login interno contra banco real", () => {
  let prisma: PrismaClient;
  let autenticarInterno: (typeof import("./internal-auth"))["autenticarInterno"];

  const email = `vitest-${Date.now()}@foocci.test`;
  const senha = "senha-de-teste-123";

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;

    const { PrismaClient: Cliente } = await import("@prisma/client");
    const { hash } = await import("bcryptjs");
    ({ autenticarInterno } = await import("./internal-auth"));

    prisma = new Cliente({ datasources: { db: { url: URL_TESTE } } });

    const dep = await prisma.department.upsert({
      where: { slug: "vendas" },
      update: {},
      create: { numero: 2, slug: "vendas", nome: "Vendas e Receita", missao: "teste" },
    });

    const user = await prisma.internalUser.create({
      data: { email, nome: "Vitest", role: "GERENTE_DEPARTAMENTO", passwordHash: await hash(senha, 10) },
    });

    await prisma.departmentMembership.create({
      data: { internalUserId: user.id, departmentId: dep.id, isManager: true },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.departmentMembership.deleteMany({ where: { internalUser: { email } } });
    await prisma.internalUser.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("senha certa entra, e a sessão carrega o escopo departamental", async () => {
    const s = await autenticarInterno(email, senha);
    expect(s).not.toBeNull();
    expect(s!.role).toBe("GERENTE_DEPARTAMENTO");
    expect(s!.departamentos).toEqual(["vendas"]);
    expect(s!.gerencia).toEqual(["vendas"]);
  });

  it("senha errada não entra", async () => {
    expect(await autenticarInterno(email, "errada")).toBeNull();
  });

  it("email inexistente devolve exatamente o mesmo null da senha errada", async () => {
    // Respostas diferentes aqui entregariam a lista de quem trabalha na empresa
    // a quem estiver testando emails.
    expect(await autenticarInterno("ninguem@foocci.test", senha)).toBeNull();
  });

  it("usuário desativado não entra, mesmo com a senha certa", async () => {
    await prisma.internalUser.update({ where: { email }, data: { isActive: false } });
    expect(await autenticarInterno(email, senha)).toBeNull();
    await prisma.internalUser.update({ where: { email }, data: { isActive: true } });
  });

  it("AGENTE_IA não faz login nem com hash gravado", async () => {
    // O ator técnico existe para dar autor a uma ação de IA na trilha. Se ele
    // entrasse com senha, viraria credencial de gente.
    await prisma.internalUser.update({ where: { email }, data: { role: "AGENTE_IA" } });
    expect(await autenticarInterno(email, senha)).toBeNull();
    await prisma.internalUser.update({ where: { email }, data: { role: "GERENTE_DEPARTAMENTO" } });
  });

  it("email é normalizado — maiúscula e espaço não trancam ninguém para fora", async () => {
    expect(await autenticarInterno(`  ${email.toUpperCase()}  `, senha)).not.toBeNull();
  });
});
