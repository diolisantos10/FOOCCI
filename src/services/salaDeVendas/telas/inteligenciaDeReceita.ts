/**
 * AS MEDIÇÕES QUE FALTAVAM AO REVENUE SUPERVISOR (peça 13 do desenho do CEO).
 *
 * O supervisor já media funil de receita, eficiência por etapa, índice de saúde,
 * diagnóstico causal e ações. O desenho pede mais quatro coisas: **reuniões**,
 * **reativações**, **clientes em risco** e a **receita ao longo do mês contra a
 * meta**. Três têm fonte. Uma não tem, e a que não tem é justamente a linha
 * tracejada que o olho procura primeiro.
 *
 * ── ⛔ A META NÃO EXISTE NESTE SISTEMA ──────────────────────────────────────
 *
 * Não há tabela, campo nem cadastro de meta de receita em lugar nenhum do
 * schema. Nem de previsão. O desenho mostra "Meta do mês R$ 600.000",
 * "Previsão R$ 560.000" e "80% da meta atingida" — **três números que só
 * existem no desenho**.
 *
 * Preencher esses três com uma projeção linear do ritmo do mês seria a mentira
 * mais cara que esta tela consegue contar, porque ela sai daqui parecendo
 * medição e vira decisão de dinheiro na mesa do CEO. Enquanto ninguém cadastrar
 * a meta, `META_NAO_CADASTRADA` é o que a tela diz, no lugar exato onde o
 * número estaria.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { REGUA_DE_CHURN } from "../crm/posVenda";

type Banco = PrismaClient | Prisma.TransactionClient;

const DIA = 86_400_000;

export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

export const META_NAO_CADASTRADA =
  "não existe cadastro de meta de receita neste sistema — nenhuma tabela, nenhum campo. " +
  "Projetar uma a partir do ritmo do mês seria estimativa apresentada como alvo, e o alvo " +
  "é decisão do CEO, não conta desta tela";

// ═══════════════════════════════════════════════════════════════════════════
// Reuniões
// ═══════════════════════════════════════════════════════════════════════════

export interface Reunioes {
  marcadas: number;
  realizadas: number;
  naoCompareceram: number;
  /** Ainda não aconteceram ou ninguém marcou a situação. */
  semDesfecho: number;
}

/**
 * As reuniões do período.
 *
 * `marcadas` conta pelo `comecaEm` — a reunião pertence ao mês em que acontece,
 * não ao dia em que foi agendada. `semDesfecho` fica visível porque uma agenda
 * cheia de compromissos que ninguém fechou depois não é operação saudável: é
 * agenda sem retorno de informação.
 */
export async function reunioesDoPeriodo(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<Reunioes> {
  const janela = { comecaEm: { gte: params.de, lt: params.ate } };

  const [marcadas, realizadas, naoCompareceram] = await Promise.all([
    db.leadCompromisso.count({ where: janela }),
    db.leadCompromisso.count({ where: { ...janela, situacao: "REALIZADO" } }),
    db.leadCompromisso.count({ where: { ...janela, situacao: "NAO_COMPARECEU" } }),
  ]);

  return {
    marcadas,
    realizadas,
    naoCompareceram,
    semDesfecho: marcadas - realizadas - naoCompareceram,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reativações — o cartão que NÃO tem fonte
// ═══════════════════════════════════════════════════════════════════════════

export const MOTIVO_DA_REATIVACAO =
  "reativar é uma TRANSIÇÃO (INATIVO → ATIVO), e o banco guarda só a situação de agora " +
  "(`Cliente.situacao`) com a data da última mudança — não o histórico dela. Contar " +
  "quem está ATIVO e já esteve inativo é impossível sem essa trilha";

export interface Reativacao {
  /** ⛔ Sempre não medido, hoje. Ver `MOTIVO_DA_REATIVACAO`. */
  reativados: Medida<number>;
  /** O número vizinho que EXISTE: contas paradas que ninguém cancelou. */
  aReativar: number;
}

export async function reativacoes(db: Banco): Promise<Reativacao> {
  const aReativar = await db.cliente.count({ where: { situacao: "INATIVO" } });
  return {
    reativados: { medido: false, motivo: MOTIVO_DA_REATIVACAO },
    aReativar,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Clientes em risco
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientesEmRisco {
  emRisco: number;
  limiar: number;
  /** Contas cujo risco ninguém avaliou. Não são contas sem risco. */
  semAvaliacao: number;
  total: number;
}

/**
 * Clientes em risco, pela régua escrita da casa.
 *
 * O limiar não é inventado aqui: é `REGUA_DE_CHURN.limiarDeRisco`, o mesmo que
 * move a conta para `EM_RISCO` em `posVenda.ts`. Duas réguas diferentes para o
 * mesmo conceito fariam a tela discordar do sistema que ela observa.
 *
 * `semAvaliacao` é o número que impede a leitura otimista: "4 em risco" sobre
 * 40 contas não avaliadas é "4 encontrados", não "4 existem".
 */
export async function clientesEmRisco(db: Banco): Promise<ClientesEmRisco> {
  const [emRisco, semAvaliacao, total] = await Promise.all([
    db.cliente.count({
      where: { riscoDeChurn: { gte: REGUA_DE_CHURN.limiarDeRisco }, situacao: { not: "CANCELADO" } },
    }),
    db.cliente.count({ where: { riscoDeChurn: null, situacao: { not: "CANCELADO" } } }),
    db.cliente.count({ where: { situacao: { not: "CANCELADO" } } }),
  ]);

  return { emRisco, limiar: REGUA_DE_CHURN.limiarDeRisco, semAvaliacao, total };
}

// ═══════════════════════════════════════════════════════════════════════════
// Receita ao longo do mês
// ═══════════════════════════════════════════════════════════════════════════

export interface PontoDaReceita {
  dia: string;
  /** Receita acumulada até o fim deste dia, em centavos. */
  acumuladoCents: number;
  /** Propostas aceitas neste dia que tinham valor. */
  propostas: number;
}

export interface ReceitaAoLongoDoMes {
  pontos: PontoDaReceita[];
  /** Propostas aceitas no período SEM valor — fechadas fora do sistema. */
  aceitasSemValor: number;
  /** ⛔ Sempre não medido, hoje. Ver `META_NAO_CADASTRADA`. */
  meta: Medida<number>;
  /** ⛔ Sempre não medido: previsão é projeção contra uma meta que não existe. */
  previsao: Medida<number>;
}

/**
 * A linha cheia do desenho — e a confissão de que a tracejada não existe.
 *
 * A curva é **acumulada**, como no desenho: cada ponto é a soma de tudo que
 * fechou até o fim daquele dia. Proposta aceita sem `valorMensalCent` não entra
 * na soma (somá-la como zero achataria a curva) e sai contada em
 * `aceitasSemValor`, porque "fechou e o preço está fora do sistema" é uma
 * informação que o CEO precisa ver ao lado do total.
 */
export async function receitaAoLongoDoMes(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<ReceitaAoLongoDoMes> {
  const aceitas = await db.leadProposta.findMany({
    where: { situacao: "ACEITA", respondidaEm: { gte: params.de, lt: params.ate } },
    select: { respondidaEm: true, valorMensalCent: true },
    orderBy: { respondidaEm: "asc" },
  });

  const inicio = new Date(
    Date.UTC(params.de.getUTCFullYear(), params.de.getUTCMonth(), params.de.getUTCDate()),
  );
  const dias = Math.max(
    1,
    Math.ceil((params.ate.getTime() - inicio.getTime()) / DIA),
  );

  const porDia = new Array<number>(dias).fill(0);
  const contagem = new Array<number>(dias).fill(0);
  let aceitasSemValor = 0;

  for (const p of aceitas) {
    if (!p.respondidaEm) continue;
    if (typeof p.valorMensalCent !== "number") {
      aceitasSemValor += 1;
      continue;
    }
    const i = Math.floor((p.respondidaEm.getTime() - inicio.getTime()) / DIA);
    if (i < 0 || i >= dias) continue;
    porDia[i]! += p.valorMensalCent;
    contagem[i]! += 1;
  }

  let acumulado = 0;
  const pontos = porDia.map((cents, i) => {
    acumulado += cents;
    return {
      dia: new Date(inicio.getTime() + i * DIA).toISOString(),
      acumuladoCents: acumulado,
      propostas: contagem[i]!,
    };
  });

  return {
    pontos,
    aceitasSemValor,
    meta: { medido: false, motivo: META_NAO_CADASTRADA },
    previsao: {
      medido: false,
      motivo: `previsão é projeção CONTRA uma meta, e ${META_NAO_CADASTRADA}`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tudo junto — uma leitura só, para a tela não fazer cinco chamadas
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtrasDaReceita {
  reunioes: Reunioes;
  reativacao: Reativacao;
  risco: ClientesEmRisco;
  receitaNoTempo: ReceitaAoLongoDoMes;
}

export async function extrasDaReceita(
  db: Banco,
  params: { de: Date; ate: Date },
): Promise<ExtrasDaReceita> {
  const [reunioes, reativacao, risco, receitaNoTempo] = await Promise.all([
    reunioesDoPeriodo(db, params),
    reativacoes(db),
    clientesEmRisco(db),
    receitaAoLongoDoMes(db, params),
  ]);
  return { reunioes, reativacao, risco, receitaNoTempo };
}
