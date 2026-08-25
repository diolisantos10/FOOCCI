-- Perfis oficiais da v3 (documento 05-RBAC-E-PERMISSOES).
--
-- A v1 tinha sete perfis com outros nomes. O CEO fixou seis em 25/08/2026.
--
-- ── POR QUE RECRIAR O TIPO EM VEZ DE SÓ RENOMEAR VALORES ──
--
-- `ALTER TYPE ... RENAME VALUE` resolveria os cinco que têm equivalente, mas o
-- Postgres não remove valor de enum: `GERENTE_GERAL` e `VIEWER` ficariam para
-- sempre, e um enum com valores que a arquitetura proíbe é um convite a usá-los.
--
-- Recriar o tipo com um CASE explícito é mais longo e mais honesto: cada valor
-- antigo aparece escrito, com o novo ao lado. Quem ler esta migração daqui a um
-- ano vê o mapa inteiro sem precisar procurar em outro lugar.
--
-- Nenhuma linha é perdida. Hoje `internal_users` está vazia (nenhuma pessoa foi
-- cadastrada), mas a migração funcionaria igual se não estivesse.

-- ── InternalRole ─────────────────────────────────────────────────────────────

ALTER TYPE "InternalRole" RENAME TO "InternalRole_v1";

CREATE TYPE "InternalRole" AS ENUM (
  'MASTER_CEO',
  'DIRETOR_FOOCCI',
  'GERENTE_DEPARTAMENTO',
  'AGENTE_HUMANO',
  'AGENTE_IA',
  'AUDITOR_QA'
);

ALTER TABLE "internal_users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "internal_users"
  ALTER COLUMN "role" TYPE "InternalRole"
  USING (
    CASE "role"::text
      WHEN 'CEO'           THEN 'MASTER_CEO'
      WHEN 'DIRETOR'       THEN 'DIRETOR_FOOCCI'
      -- O Gerente Geral deixa de existir (regra 10). Quem estivesse nele passa a
      -- Diretor, que é a camada que absorveu a função — nunca a gerente de um
      -- departamento, porque isso o rebaixaria a uma área só.
      WHEN 'GERENTE_GERAL' THEN 'DIRETOR_FOOCCI'
      WHEN 'GERENTE'       THEN 'GERENTE_DEPARTAMENTO'
      WHEN 'MEMBRO'        THEN 'AGENTE_HUMANO'
      WHEN 'SYSTEM_AI'     THEN 'AGENTE_IA'
      -- VIEWER era "lê e não escreve". O equivalente na v3 é o auditor, que lê
      -- tudo e só escreve avaliação e não conformidade.
      WHEN 'VIEWER'        THEN 'AUDITOR_QA'
    END
  )::"InternalRole";

ALTER TABLE "internal_users" ALTER COLUMN "role" SET DEFAULT 'AGENTE_HUMANO';

DROP TYPE "InternalRole_v1";

-- ── PositionLevel ────────────────────────────────────────────────────────────
--
-- Só sai `GERENTE_GERAL`. Um cargo nesse nível vira DIRETOR, pelo mesmo motivo
-- acima.

ALTER TYPE "PositionLevel" RENAME TO "PositionLevel_v1";

CREATE TYPE "PositionLevel" AS ENUM ('CEO', 'DIRETOR', 'GERENTE', 'OPERACAO');

ALTER TABLE "positions"
  ALTER COLUMN "nivel" TYPE "PositionLevel"
  USING (
    CASE "nivel"::text
      WHEN 'GERENTE_GERAL' THEN 'DIRETOR'
      ELSE "nivel"::text
    END
  )::"PositionLevel";

DROP TYPE "PositionLevel_v1";
