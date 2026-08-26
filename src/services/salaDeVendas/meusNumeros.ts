/**
 * OS MEUS NÚMEROS — o painel de quem vende, não o de quem manda.
 *
 * ── O PEDIDO, COMO ELE FOI FEITO ────────────────────────────────────────────
 *
 * O CEO descreveu a Sala em 26/08/2026 assim: *"sou vendedor humano Diego.
 * Quando eu faço o login com meu login e senha, vai aparecer o meu, com os meus
 * números, os meus clientes"*.
 *
 * **Os meus clientes** já era verdade: `escopoDaConsulta` entra no `where` da
 * consulta, e o vendedor não recebe do servidor o lead que não é dele.
 *
 * **Os meus números** não existia. O único painel da Sala é o do gerente, e ele
 * mostra carga, produtividade e nota de QA de TODO o time — informação de gestão
 * sobre pessoas. O vendedor não tinha painel nenhum, e por um bom motivo: dar-lhe
 * o do gerente seria mostrar-lhe o desempenho comparado dos colegas, que não é
 * transparência, é outra coisa.
 *
 * ── POR QUE NÃO É O PAINEL DO GERENTE COM UM FILTRO ─────────────────────────
 *
 * Porque as perguntas são outras. O gerente pergunta *"quem do time está
 * afogado e quem está parado"*. O vendedor pergunta *"o que eu tenho para fazer
 * agora"*.
 *
 * Filtrar o painel do gerente pelo próprio nome responderia à primeira pergunta
 * com uma linha só — e ele continuaria sem saber quem está esperando resposta há
 * dois dias. Números de gestão encolhidos não viram números de trabalho.
 *
 * ── AS CINCO PERGUNTAS ──────────────────────────────────────────────────────
 *
 * 1. quantos clientes são meus agora
 * 2. quantos desses estão esperando eu responder
 * 3. qual o mais esquecido — e há quanto tempo
 * 4. quantas respostas eu mandei hoje
 * 5. quantos estão livres na fila para eu pegar
 *
 * A quinta não é "minha", e está aqui de propósito: um painel que mostra só o
 * que já é meu ensina a não pegar trabalho novo. A fila livre é a única coisa
 * aqui que fala do que ainda não é de ninguém.
 *
 * ── ⚠️ O QUE ESTE ARQUIVO NUNCA DEVOLVE ─────────────────────────────────────
 *
 * Número de colega. Nenhuma consulta aqui roda sem `atendenteUserId` igual ao
 * da sessão, e não há parâmetro que troque isso — a identidade vem da sessão,
 * nunca da URL. Um `?userId=` seria a forma mais barata de transformar este
 * painel na tela de vigiar o vizinho.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Leads sem contato há mais que isto entram na conta de "esquecidos". */
export const DIAS_PARA_ESQUECIDO = 3;

export interface MeusNumeros {
  /** Quem eu sou, para a tela poder dizer "os números de Fulano". */
  nome: string;
  /** Clientes sob minha responsabilidade agora. */
  meusClientes: number;
  /** Desses, quantos têm mensagem não lida — o cliente falou e eu não voltei. */
  esperandoMinhaResposta: number;
  /** Quantos meus estão sem contato há mais de `DIAS_PARA_ESQUECIDO` dias. */
  esquecidos: number;
  /**
   * Há quantas horas o meu lead mais parado não recebe contato. `null` quando
   * não tenho nenhum — e `null` é diferente de zero: zero diria "está tudo em
   * dia", quando a verdade é "não tenho cliente".
   */
  horasDoMaisParado: number | null;
  /** Respostas que EU mandei hoje. Só as minhas: a IA tem a conta dela. */
  respondiHoje: number;
  /** Na fila livre, esperando alguém pegar. Não é meu — é o que dá para pegar. */
  livresNaFila: number;
}

/**
 * Os números da pessoa que está pedindo, e de mais ninguém.
 *
 * `agora` entra por parâmetro para o teste poder fixar o dia. Sem isso, o caso
 * de "respondi hoje" viraria um teste que quebra à meia-noite.
 */
export async function meusNumeros(
  db: Cliente,
  params: { sessao: SessaoInterna; agora?: Date },
): Promise<MeusNumeros> {
  const agora = params.agora ?? new Date();
  const eu = params.sessao.userId;

  // ⚠️ O recorte, e ele é a razão de o arquivo ser seguro: `atendenteUserId: eu`
  // em toda consulta abaixo. Não vem de parâmetro e não tem como ser trocado
  // por quem chama.
  const meus: Prisma.SiteLeadWhereInput = { atendenteUserId: eu };

  const limiteEsquecido = new Date(agora.getTime() - DIAS_PARA_ESQUECIDO * 86_400_000);

  // O começo do dia de HOJE, na hora local. Usar "as últimas 24 horas" daria um
  // número que muda de significado ao longo do dia — às 9h da manhã ele estaria
  // contando o trabalho de ontem à noite, e "respondi hoje" viraria mentira.
  const comecoDeHoje = new Date(agora);
  comecoDeHoje.setHours(0, 0, 0, 0);

  const [
    meusClientes,
    esperandoMinhaResposta,
    esquecidos,
    maisParado,
    respondiHoje,
    livresNaFila,
  ] = await Promise.all([
    db.siteLead.count({ where: meus }),

    db.siteLead.count({ where: { ...meus, naoLidas: { gt: 0 } } }),

    db.siteLead.count({
      where: {
        ...meus,
        // `null` entra: lead meu que nunca teve contato é o caso mais urgente,
        // não o menos. Deixá-lo de fora esconderia justamente quem eu peguei e
        // nunca falei.
        OR: [{ lastInteractionAt: { lt: limiteEsquecido } }, { lastInteractionAt: null }],
      },
    }),

    db.siteLead.findFirst({
      where: meus,
      orderBy: { lastInteractionAt: { sort: "asc", nulls: "first" } },
      select: { lastInteractionAt: true },
    }),

    db.leadMensagem.count({
      where: {
        direcao: "SAIDA",
        // ⚠️ `autorUserId` e não `autor: "HUMANO"`: a segunda conta o que TODA a
        // Sala mandou. Este número precisa ser o meu, ou não serve para eu saber
        // como foi o meu dia.
        autorUserId: eu,
        ocorreuEm: { gte: comecoDeHoje },
      },
    }),

    db.siteLead.count({ where: { atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] } } }),
  ]);

  return {
    nome: params.sessao.nome,
    meusClientes,
    esperandoMinhaResposta,
    esquecidos,
    horasDoMaisParado: horasDesde(maisParado?.lastInteractionAt ?? null, agora, meusClientes),
    respondiHoje,
    livresNaFila,
  };
}

/**
 * Horas desde o último contato do lead mais parado.
 *
 * Três casos, e os três significam coisas diferentes:
 *  · não tenho cliente nenhum → `null` ("não se aplica")
 *  · tenho, e o mais parado nunca teve contato → `null` também, porque não há
 *    "desde quando" — a tela mostra isso pelo contador de esquecidos
 *  · tenho e há data → as horas
 */
function horasDesde(quando: Date | null, agora: Date, quantosClientes: number): number | null {
  if (quantosClientes === 0 || !quando) return null;
  return Math.max(0, Math.round((agora.getTime() - quando.getTime()) / 3_600_000));
}
