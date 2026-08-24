/**
 * A IDENTIDADE QUE VIAJA ATÉ O BANCO.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 *
 * A migração `20260825200000_autorizacao_no_banco` ligou Row Level Security nas
 * tabelas da Sala. As políticas leem `app.papel` e `app.usuario_id` da sessão do
 * Postgres — e alguém precisa colocá-los lá.
 *
 * É este arquivo. Sem ele, toda consulta às tabelas da Sala devolve **zero
 * linhas**, porque a política falha fechada.
 *
 * ── SET LOCAL, E NÃO SET ────────────────────────────────────────────────────
 *
 * `SET LOCAL` morre com a transação. Um `SET` comum sobrevive na CONEXÃO — e com
 * pool de conexões isso vaza a identidade de um usuário para a próxima
 * requisição que pegar a mesma conexão.
 *
 * O defeito seria intermitente, dependeria de carga, e apareceria como "às vezes
 * o SDR vê lead de outro". É a pior forma de falha de autorização que existe:
 * rara o bastante para ser confundida com engano de quem reportou.
 *
 * ── `set_config()`, E NÃO `SET LOCAL` ───────────────────────────────────────
 *
 * `SET LOCAL app.papel = '...'` não aceita parâmetro: o valor teria de ser
 * concatenado na string do comando. E concatenar funciona até alguém passar
 * `MASTER_CEO'; --`, que fecha a aspa, vira um papel legítimo e **promove quem
 * quiser a CEO**. Isso não é hipótese: o teste contra Postgres real fez
 * exatamente isso e leu a base inteira.
 *
 * `set_config('app.papel', $1, true)` é uma FUNÇÃO, e função aceita parâmetro.
 * O valor viaja como dado, nunca como SQL, e o problema deixa de existir em vez
 * de ser filtrado.
 *
 * A validação por lista fechada continua abaixo — mas agora ela é a segunda
 * linha de defesa, e não a única.
 */

import type { Prisma, PrismaClient, InternalRole } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";

/**
 * Quem pode ser declarado ao banco.
 *
 * Lista fechada, e ela é a defesa: o valor vai para dentro de um comando SQL
 * montado como string, e a única coisa entre isso e uma injeção é esta
 * verificação.
 */
const PAPEIS_ACEITOS: ReadonlySet<string> = new Set<string>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AGENTE_HUMANO",
  "AGENTE_IA",
  "AUDITOR_QA",
  // Não é um papel de pessoa: é o webhook, o cron e os scripts, que gravam sem
  // ninguém logado. Ele enxerga tudo, e por isso NUNCA deve ser usado para
  // atender uma requisição de usuário.
  "SISTEMA",
]);

/** cuid/uuid e afins. Nada de aspas, ponto e vírgula ou espaço. */
const ID_PLAUSIVEL = /^[A-Za-z0-9_-]{1,64}$/;

export type Identidade =
  | { tipo: "pessoa"; papel: InternalRole; usuarioId: string }
  | { tipo: "sistema"; motivo: string };

export function identidadeDaSessao(s: SessaoInterna): Identidade {
  return { tipo: "pessoa", papel: s.role, usuarioId: s.userId };
}

/**
 * A identidade do sistema.
 *
 * `motivo` é obrigatório e não decorativo: ela enxerga tudo, e a pergunta "por
 * que este trecho roda como SISTEMA?" precisa ter resposta escrita no ponto de
 * uso. Sem isso, `SISTEMA` vira o jeito fácil de calar a autorização.
 */
export function comoSistema(motivo: string): Identidade {
  if (!motivo.trim()) {
    throw new Error("comoSistema exige um motivo escrito: ela enxerga tudo.");
  }
  return { tipo: "sistema", motivo };
}

export class IdentidadeInvalida extends Error {}

function validar(id: Identidade): { papel: string; usuarioId: string } {
  if (id.tipo === "sistema") return { papel: "SISTEMA", usuarioId: "" };

  if (!PAPEIS_ACEITOS.has(id.papel)) {
    throw new IdentidadeInvalida(`papel não aceito no banco: ${id.papel}`);
  }
  if (!ID_PLAUSIVEL.test(id.usuarioId)) {
    throw new IdentidadeInvalida("id de usuário fora do formato esperado");
  }

  return { papel: id.papel, usuarioId: id.usuarioId };
}

/**
 * Roda `trabalho` numa transação que declara quem está perguntando.
 *
 * Tudo o que estiver dentro enxerga o que essa identidade pode enxergar — e
 * nada mais. Fora daqui, as tabelas da Sala devolvem lista vazia.
 *
 * ⚠️ **Não chame `db.$transaction` lá dentro.** O Prisma não aninha transação
 * interativa, e é por isso que os serviços que abrem transação própria (criar
 * tarefa, agendar, avaliar, mover no funil) rodam FORA deste embrulho — a
 * escrita deles continua guardada na rota e no serviço, como está escrito na
 * migração.
 */
export async function comIdentidade<T>(
  db: PrismaClient,
  identidade: Identidade,
  trabalho: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const { papel, usuarioId } = validar(identidade);

  return db.$transaction(async (tx) => {
    // Parametrizado de verdade: o valor vai como DADO. O terceiro argumento
    // `true` é o "local" do `SET LOCAL` — morre com a transação.
    await tx.$executeRaw`SELECT set_config('app.papel', ${papel}, true)`;

    if (usuarioId) {
      await tx.$executeRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
    }

    return trabalho(tx);
  });
}

/** Atalho para o caminho mais comum: uma sessão de pessoa. */
export function comSessao<T>(
  db: PrismaClient,
  sessao: SessaoInterna,
  trabalho: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return comIdentidade(db, identidadeDaSessao(sessao), trabalho);
}

/**
 * Confere se a trava do banco está de pé.
 *
 * Existe porque RLS é invisível: um banco criado por `db push` ou por
 * `migrate diff` sai **sem as políticas** — e a aplicação sobe igual, as telas
 * abrem, e a autorização de banco simplesmente não existe. Foi exatamente o que
 * aconteceu com o gatilho de append-only, e a lição custou uma rodada.
 */
export async function travaDoBancoEstaDePe(db: PrismaClient): Promise<{
  ativa: boolean;
  tabelasSemRLS: string[];
}> {
  const linhas = await db.$queryRawUnsafe<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>(
    // `relkind = 'r'` é obrigatório: `pg_class` guarda índices com o mesmo
    // prefixo do nome da tabela, e índice nunca tem RLS. Sem este filtro, o
    // verificador listaria ~30 índices como "tabelas sem trava" e diria que a
    // autorização do banco está caída — sempre, inclusive quando está de pé.
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname LIKE 'lead_%'`,
  );

  // FORCE é tão obrigatório quanto ENABLE: a aplicação conecta como dona das
  // tabelas, e a dona ignora RLS sem ele.
  const semTrava = linhas
    .filter((l) => !l.relrowsecurity || !l.relforcerowsecurity)
    .map((l) => l.relname);

  return { ativa: linhas.length > 0 && semTrava.length === 0, tabelasSemRLS: semTrava };
}
