-- ═══════════════════════════════════════════════════════════════════════════
-- AUTORIZAÇÃO NO BANCO — Row Level Security nas tabelas da Sala de Vendas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reforço de escopo do CEO, 25/08/2026:
--   "A autorização deve ser aplicada no frontend, backend, APIs e banco."
--
-- As três primeiras já existiam. Esta migração faz a quarta.
--
-- ── O QUE MUDA NA PRÁTICA ──
--
-- Até aqui, quem tivesse a string de conexão do banco lia a base comercial
-- inteira: as camadas de autorização viviam todas na aplicação, e um `psql`
-- passava por baixo das três. Depois desta migração, uma conexão que **não
-- declara quem está perguntando** enxerga ZERO linhas nestas tabelas.
--
-- ── COMO A IDENTIDADE CHEGA AO BANCO ──
--
-- Por variáveis de sessão, marcadas com SET LOCAL dentro da transação:
--
--     SET LOCAL app.papel = 'AGENTE_HUMANO';
--     SET LOCAL app.usuario_id = 'cmt7...';
--
-- `SET LOCAL` morre com a transação. Isso importa com pool de conexões: um SET
-- comum vazaria a identidade de um usuário para a próxima requisição que
-- pegasse a mesma conexão — que é o defeito mais perigoso possível aqui.
--
-- ── FALHA FECHADA ──
--
-- Sem `app.papel`, `current_setting` devolve NULL, nenhuma comparação é
-- verdadeira, e a política nega. O padrão é NÃO VER — quem esquecer de declarar
-- identidade recebe uma lista vazia, e não a base inteira.
--
-- ── O LIMITE DESTA MIGRAÇÃO, ESCRITO COM ESSE NOME ──
--
-- A política de LEITURA é fechada. As de ESCRITA são permissivas, e isso é
-- deliberado e provisório:
--
--   * os serviços da Sala abrem transação PRÓPRIA (`db.$transaction`) para
--     manter atomicidade, e o Prisma não aninha transação interativa — então
--     não há como cravar `SET LOCAL` na mesma transação da escrita sem
--     reescrever esses serviços;
--   * uma política de escrita fechada pela metade derrubaria a captura de lead
--     do site e a recepção do WhatsApp, que gravam sem sessão de usuário.
--
-- Ou seja: **o banco passa a proteger a confidencialidade (quem lê o quê), e a
-- integridade da escrita continua guardada na aplicação.** Fechar a escrita é
-- um passo separado, com refatoração dos serviços — e está no backlog com esse
-- nome, em vez de ser afirmado como pronto aqui.
--
-- `SiteLead` também fica de fora: três subsistemas fora da Sala escrevem nela
-- (o formulário do site, o CRM comercial e o webhook), e fechá-la exige
-- identidade em todos os três.

-- ─── Quem está perguntando ───────────────────────────────────────────────────

-- ── O PAPEL, VALIDADO PELO PRÓPRIO BANCO ──
--
-- Devolve o papel declarado **somente se ele for um papel real**. Qualquer outra
-- coisa vira NULL, e NULL nega.
--
-- ⚠️ Isto parece redundante — a aplicação já valida o papel contra uma lista
-- fechada antes de declará-lo. Não é: o motivo de existir uma camada no banco é
-- justamente valer quando a aplicação NÃO está no caminho. Confiar na validação
-- da aplicação aqui seria construir a quarta camada apoiada na segunda.
--
-- Medido na verificação: com `app.papel = 'CHEFAO'` — um papel que não existe —
-- a política devolvia a fila aberta inteira. Agora devolve zero.
CREATE OR REPLACE FUNCTION app_papel() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT CASE
      WHEN current_setting('app.papel', true) IN (
        'MASTER_CEO', 'DIRETOR_FOOCCI', 'GERENTE_DEPARTAMENTO',
        'AGENTE_HUMANO', 'AGENTE_IA', 'AUDITOR_QA', 'SISTEMA'
      ) THEN current_setting('app.papel', true)
      ELSE NULL
    END
  $$;

CREATE OR REPLACE FUNCTION app_usuario() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.usuario_id', true) $$;

COMMENT ON FUNCTION app_papel() IS
  'Papel declarado pela transação atual. NULL quando ninguém declarou — e NULL nega.';

-- Quem enxerga a operação inteira. Espelha `vePelaOperacaoToda` na aplicação;
-- SISTEMA é o webhook e os scripts, que não têm pessoa por trás.
--
-- COALESCE não é enfeite: sem papel declarado, `current_setting` devolve NULL, e
-- `NULL IN (...)` é NULL — não é falso. Um NULL solto atravessa o `OR` abaixo e
-- deixa a política indecisa em vez de negar.
CREATE OR REPLACE FUNCTION app_ve_tudo() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT COALESCE(
      app_papel() IN (
        'MASTER_CEO', 'DIRETOR_FOOCCI', 'GERENTE_DEPARTAMENTO', 'AUDITOR_QA', 'SISTEMA'
      ),
      false
    )
  $$;

-- A MESMA regra de `podeVerOLead`, agora dentro do banco: é dele, é de ninguém,
-- ou está esperando gente.
--
-- ── ⚠️ A PRIMEIRA LINHA É A QUE FAZ ISTO VALER, E ELA FALTAVA ──
--
-- Sem `app_papel() IS NULL THEN false`, a política tinha um buraco que a
-- verificação pegou: o ramo "lead de ninguém ou esperando gente" não depende de
-- identidade nenhuma. Uma conexão anônima — um `psql` com a string do banco —
-- não passava pelo primeiro ramo, mas passava por esse, e **lia a fila aberta
-- inteira**.
--
-- Medido: 6 linhas devolvidas sem nenhuma identidade declarada. A trava existia,
-- estava marcada como ativa em `pg_class`, e vazava. É a definição de teatro de
-- segurança, e só apareceu porque a consulta foi feita de verdade.
--
-- "Lead sem dono é alcançável" sempre quis dizer "alcançável por um SDR
-- autenticado" — nunca "por qualquer um".
CREATE OR REPLACE FUNCTION app_alcanca_lead(lead_id text) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT CASE
      WHEN app_papel() IS NULL THEN false
      WHEN app_ve_tudo() THEN true
      ELSE EXISTS (
        SELECT 1 FROM "SiteLead" l
         WHERE l.id = lead_id
           AND (
             l."atendenteUserId" = app_usuario()
             OR l."atendidoPor" IN ('NINGUEM', 'AGUARDANDO_HUMANO')
           )
      )
    END
  $$;

COMMENT ON FUNCTION app_alcanca_lead(text) IS
  'Espelho de podeVerOLead. Se as duas divergirem, a do banco é a que vale.';

-- ─── As políticas ────────────────────────────────────────────────────────────
--
-- Um bloco por tabela, e todas com a mesma forma:
--   * ENABLE + FORCE — FORCE é obrigatório porque a aplicação conecta como DONA
--     das tabelas, e o dono ignora RLS sem ele. Sem FORCE, tudo isto seria
--     decorativo.
--   * SELECT com a política de alcance;
--   * INSERT/UPDATE/DELETE permissivos (ver o limite, no topo).

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'lead_mensagens',
    'lead_qualificacoes',
    'lead_score_fatores',
    'lead_tarefas',
    'lead_compromissos',
    'lead_propostas',
    'lead_handoffs',
    'lead_cadencias',
    'lead_avaliacoes_qa'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY sala_le ON %I FOR SELECT USING (app_alcanca_lead("leadId"))', t);

    EXECUTE format(
      'CREATE POLICY sala_insere ON %I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY sala_atualiza ON %I FOR UPDATE USING (true) WITH CHECK (true)', t);
    EXECUTE format(
      'CREATE POLICY sala_apaga ON %I FOR DELETE USING (true)', t);
  END LOOP;
END $$;

-- `lead_avaliacao_criterios` não tem `leadId`: ela pende da avaliação. O alcance
-- dela é o alcance da avaliação — e escrever assim, em vez de copiar o `leadId`
-- para dentro dela, evita duas fontes que podem discordar sobre de quem é a nota.
ALTER TABLE "lead_avaliacao_criterios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_avaliacao_criterios" FORCE ROW LEVEL SECURITY;

CREATE POLICY sala_le ON "lead_avaliacao_criterios" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "lead_avaliacoes_qa" a
       WHERE a.id = "avaliacaoId"
         AND app_alcanca_lead(a."leadId")
    )
  );

CREATE POLICY sala_insere ON "lead_avaliacao_criterios" FOR INSERT WITH CHECK (true);
CREATE POLICY sala_atualiza ON "lead_avaliacao_criterios" FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY sala_apaga ON "lead_avaliacao_criterios" FOR DELETE USING (true);
