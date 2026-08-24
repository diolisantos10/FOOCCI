/**
 * Aplica as travas que o Prisma não sabe representar.
 *
 *   npx tsx scripts/aplicar-travas.ts
 *
 * ── POR QUE ESTE SCRIPT EXISTE ──
 *
 * O schema do Prisma descreve tabelas, colunas, índices e chaves. Ele NÃO
 * descreve gatilho. Isso significa que um banco criado por `prisma db push` ou
 * por `prisma migrate diff --from-empty` sai sem a trava de append-only da linha
 * do tempo — com todas as tabelas certas, e sem a garantia que importa.
 *
 * O defeito é do tipo silencioso: o banco parece completo, a aplicação sobe, e
 * `domain_events` aceita UPDATE e DELETE numa tabela cuja documentação inteira
 * diz que a história não se reescreve.
 *
 * Foi assim que apareceu: o teste da trava reprovou num banco montado por
 * diferença de schema, e estava certo em reprovar.
 *
 * Idempotente: `CREATE OR REPLACE` e `DROP TRIGGER IF EXISTS` — rodar de novo
 * não quebra nada.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION domain_events_somente_insercao()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'domain_events e append-only: % nao e permitido. Um evento registra o que aconteceu; corrigir o passado seria reescrever a historia, nao consertar o dado. Registre um evento NOVO.',
        TG_OP
        USING ERRCODE = 'insufficient_privilege';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS domain_events_sem_update ON "domain_events";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER domain_events_sem_update
      BEFORE UPDATE ON "domain_events"
      FOR EACH ROW EXECUTE FUNCTION domain_events_somente_insercao();
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS domain_events_sem_delete ON "domain_events";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER domain_events_sem_delete
      BEFORE DELETE ON "domain_events"
      FOR EACH ROW EXECUTE FUNCTION domain_events_somente_insercao();
  `);

  // Conferir que a trava realmente pegou. Um script que diz "aplicado" sem
  // verificar é a mesma promessa vazia que ele existe para consertar.
  const gatilhos = await prisma.$queryRawUnsafe<Array<{ tgname: string }>>(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = '"domain_events"'::regclass AND NOT tgisinternal;`,
  );

  console.log(`✓ ${gatilhos.length} gatilho(s) ativo(s) em domain_events:`);
  for (const g of gatilhos) console.log(`   ${g.tgname}`);

  if (gatilhos.length < 2) {
    throw new Error("Esperava 2 gatilhos (update e delete). A linha do tempo NÃO está travada.");
  }
}

main()
  .catch((e) => {
    console.error("Falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
