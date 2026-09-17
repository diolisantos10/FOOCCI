/**
 * EFICIÊNCIA POR ETAPA, COM SLA — e o ÍNDICE DE SAÚDE DA OPERAÇÃO.
 *
 * ── O QUE FOI REUSADO, E O QUE FALTAVA ──────────────────────────────────────
 *
 * A casa já media SLA e já ordenava por gargalo, só que do LEAD para dentro:
 * `distribuicao.leadsComSlaEstourado` (prazo de primeira resposta),
 * `painel.tempoDePrimeiraResposta` e a ordem do `visaoDoGerente`. Nada disso é
 * duplicado aqui — `tempoDePrimeiraResposta` é importado tal como está e vira a
 * etapa ATENDIMENTO.
 *
 * O que faltava eram os prazos das outras quatro etapas, que o projeto fixa:
 * Hunter < 2 dias, SDR < 1 dia, Atendimento < 4 h, Vendas < 2 dias, CRM < 7
 * dias. Eles só passaram a ser mensuráveis com o B1: medir "quanto o Hunter
 * demora" exige `Empresa.descobertaEm` e a trilha dizendo quando ela ficou
 * pronta — dois dados que não existiam.
 *
 * ── GARGALO NÃO É OPINIÃO: É UMA CONTA ABERTA ───────────────────────────────
 *
 * `gravidade` não é um número mágico. São três parcelas com peso declarado
 * (estouro do prazo, fração fora do prazo, perda de conversão contra a janela
 * anterior), e **cada parcela só entra se tiver sido medida**. Quando nada foi
 * medido, a gravidade não vira zero — vira `{medido:false}`, e a etapa sai da
 * fila de gargalos em vez de aparecer como a mais saudável de todas.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { taxa, tempoDePrimeiraResposta, type Duracao, type Taxa } from "./painel";
import {
  funilDeReceita,
  janelaAnterior,
  type EtapaDaReceita,
  type FunilDeReceita,
  type Periodo,
} from "./funilDeReceita";

type Banco = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// As cinco etapas operacionais e seus prazos
// ─────────────────────────────────────────────────────────────────────────────

export const ETAPAS_OPERACIONAIS = ["HUNTER", "SDR", "ATENDIMENTO", "VENDAS", "CRM"] as const;
export type EtapaOperacional = (typeof ETAPAS_OPERACIONAIS)[number];

const HORA = 60;
const DIA = 24 * HORA;

/** Os prazos do projeto, em minutos. Fonte: a tela do Revenue Supervisor. */
export const SLA_DA_ETAPA: Record<EtapaOperacional, number> = {
  HUNTER: 2 * DIA,
  SDR: 1 * DIA,
  ATENDIMENTO: 4 * HORA,
  VENDAS: 2 * DIA,
  CRM: 7 * DIA,
};

export const ROTULO_OPERACIONAL: Record<EtapaOperacional, string> = {
  HUNTER: "Hunter",
  SDR: "SDR",
  ATENDIMENTO: "Atendimento",
  VENDAS: "Vendas",
  CRM: "CRM",
};

export const O_QUE_O_PRAZO_MEDE: Record<EtapaOperacional, string> = {
  HUNTER: "da descoberta da empresa até ela ficar pronta para o SDR",
  SDR: "de pronta para o SDR até encontrar o decisor",
  ATENDIMENTO: "da entrada do lead até a primeira resposta",
  VENDAS: "da abertura da oportunidade até o fechamento como ganha",
  CRM: "da venda até a ativação do cliente",
};

/** O degrau do funil de receita que cada etapa operacional entrega. */
export const DEGRAU_DA_ETAPA: Record<EtapaOperacional, EtapaDaReceita> = {
  HUNTER: "PRONTAS_PARA_SDR",
  SDR: "DECISORES_ENCONTRADOS",
  ATENDIMENTO: "OPORTUNIDADES",
  VENDAS: "VENDAS",
  CRM: "CLIENTES_ATIVOS",
};

// ─────────────────────────────────────────────────────────────────────────────
// Medir a permanência de cada etapa
// ─────────────────────────────────────────────────────────────────────────────

/** Uma amostra de durações, já pronta para virar média e taxa de cumprimento. */
interface Amostra {
  minutos: number[];
}

const VAZIA: Amostra = { minutos: [] };

function media(a: Amostra): Duracao {
  if (a.minutos.length === 0) return { medido: false, motivo: "semDados" };
  const soma = a.minutos.reduce((s, m) => s + m, 0);
  return { medido: true, minutos: Math.round(soma / a.minutos.length), base: a.minutos.length };
}

function cumprimento(a: Amostra, slaMinutos: number): Taxa {
  const dentro = a.minutos.filter((m) => m <= slaMinutos).length;
  return taxa(dentro, a.minutos.length);
}

/** Hunter: descoberta → pronta para o SDR, pela trilha. */
async function amostraDoHunter(db: Banco, p: Periodo): Promise<Amostra> {
  const eventos = await db.eventoDaJornada.findMany({
    where: {
      entidade: "EMPRESA",
      tipo: "MUDANCA_DE_ESTAGIO",
      paraEstagio: "PRONTA_PARA_SDR",
      criadoEm: { gte: p.de, lt: p.ate },
      empresaId: { not: null },
    },
    select: { criadoEm: true, empresa: { select: { descobertaEm: true } } },
  });

  const minutos: number[] = [];
  for (const e of eventos) {
    if (!e.empresa) continue;
    const delta = e.criadoEm.getTime() - e.empresa.descobertaEm.getTime();
    if (delta >= 0) minutos.push(Math.round(delta / 60_000));
  }
  return { minutos };
}

/**
 * SDR: pronta para o SDR → decisor encontrado.
 *
 * Duas leituras porque o par mora em duas linhas da trilha. A referência de
 * início é a chegada MAIS RECENTE a `PRONTA_PARA_SDR` antes do achado: uma
 * empresa que voltou à fila começou a contar de novo, e usar a primeira vez
 * cobraria do SDR de hoje o tempo de uma tentativa de três meses atrás.
 */
async function amostraDoSdr(db: Banco, p: Periodo): Promise<Amostra> {
  const achados = await db.eventoDaJornada.findMany({
    where: {
      entidade: "EMPRESA",
      tipo: "MUDANCA_DE_ESTAGIO",
      paraEstagio: "DECISOR_ENCONTRADO",
      criadoEm: { gte: p.de, lt: p.ate },
      empresaId: { not: null },
    },
    select: { empresaId: true, criadoEm: true },
  });

  if (achados.length === 0) return VAZIA;

  const ids = [...new Set(achados.map((a) => a.empresaId as string))];
  const prontas = await db.eventoDaJornada.findMany({
    where: {
      entidade: "EMPRESA",
      tipo: "MUDANCA_DE_ESTAGIO",
      paraEstagio: "PRONTA_PARA_SDR",
      empresaId: { in: ids },
    },
    select: { empresaId: true, criadoEm: true },
    orderBy: { criadoEm: "asc" },
  });

  const porEmpresa = new Map<string, Date[]>();
  for (const l of prontas) {
    const chave = l.empresaId as string;
    const lista = porEmpresa.get(chave);
    if (lista) lista.push(l.criadoEm);
    else porEmpresa.set(chave, [l.criadoEm]);
  }

  const minutos: number[] = [];
  for (const a of achados) {
    const marcos = porEmpresa.get(a.empresaId as string);
    if (!marcos) continue;
    const anteriores = marcos.filter((d) => d.getTime() <= a.criadoEm.getTime());
    if (anteriores.length === 0) continue;
    const inicio = anteriores[anteriores.length - 1];
    if (!inicio) continue;
    minutos.push(Math.round((a.criadoEm.getTime() - inicio.getTime()) / 60_000));
  }
  return { minutos };
}

/** Vendas: abertura da oportunidade → fechamento como ganha. */
async function amostraDeVendas(db: Banco, p: Periodo): Promise<Amostra> {
  const ganhas = await db.oportunidade.findMany({
    where: { estagio: "GANHA", fechadaEm: { gte: p.de, lt: p.ate } },
    select: { criadoEm: true, fechadaEm: true },
  });

  const minutos: number[] = [];
  for (const o of ganhas) {
    if (!o.fechadaEm) continue;
    const delta = o.fechadaEm.getTime() - o.criadoEm.getTime();
    if (delta >= 0) minutos.push(Math.round(delta / 60_000));
  }
  return { minutos };
}

/**
 * CRM: venda → ativação.
 *
 * ⚠️ Clientes que NUNCA ativaram ficam de fora da média, e é exatamente onde o
 * churn nasce. Por isso a etapa carrega `semAtivacao` até a tela: uma média
 * ótima sobre os três que ativaram, ao lado de quarenta que nunca ligaram, é o
 * indicador que melhora quando a operação piora.
 */
async function amostraDoCrm(db: Banco, p: Periodo): Promise<Amostra> {
  const clientes = await db.cliente.findMany({
    where: { ativadoEm: { gte: p.de, lt: p.ate } },
    select: { ganhoEm: true, ativadoEm: true },
  });

  const minutos: number[] = [];
  for (const c of clientes) {
    if (!c.ativadoEm) continue;
    const delta = c.ativadoEm.getTime() - c.ganhoEm.getTime();
    if (delta >= 0) minutos.push(Math.round(delta / 60_000));
  }
  return { minutos };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gravidade: a conta aberta do gargalo
// ─────────────────────────────────────────────────────────────────────────────

export interface Parcela {
  fator: string;
  /** Quanto este fator pesa quando está presente. */
  peso: number;
  /** 0 = saudável, 1 = tão ruim quanto a régua reconhece. */
  nota: number;
  /** O número cru que sustentou a nota, para a tela poder mostrá-lo. */
  evidencia: string;
}

export type Gravidade =
  | { medido: true; valor: number; parcelas: Parcela[]; pesoMedido: number }
  | { medido: false; motivo: "semMedicao" };

/** A média ponderada das parcelas MEDIDAS, renormalizada pelo peso presente. */
export function comporGravidade(parcelas: Parcela[]): Gravidade {
  if (parcelas.length === 0) return { medido: false, motivo: "semMedicao" };
  const pesoMedido = parcelas.reduce((s, p) => s + p.peso, 0);
  if (pesoMedido === 0) return { medido: false, motivo: "semMedicao" };
  const soma = parcelas.reduce((s, p) => s + p.peso * p.nota, 0);
  return { medido: true, valor: soma / pesoMedido, parcelas, pesoMedido };
}

const PESO_ESTOURO = 50;
const PESO_FORA_DO_PRAZO = 30;
const PESO_QUEDA_DE_CONVERSAO = 20;

/** Estouro é limitado a 2× o prazo: acima disso já é "muito atrasado" e ponto. */
const TETO_DE_ESTOURO = 2;

// ─────────────────────────────────────────────────────────────────────────────
// A etapa medida
// ─────────────────────────────────────────────────────────────────────────────

export interface EtapaMedida {
  etapa: EtapaOperacional;
  rotulo: string;
  oQuePrazoMede: string;
  slaMinutos: number;
  /** Permanência média observada. */
  duracao: Duracao;
  /** Fração das passagens que couberam no prazo. */
  dentroDoSla: Taxa;
  /** Conversão do degrau que esta etapa entrega, e a mesma na janela anterior. */
  conversao: Taxa | null;
  conversaoAnterior: Taxa | null;
  /** Volume do degrau entregue, para a etapa não ser lida no vazio. */
  degrau: EtapaDaReceita;
  volume: FunilDeReceita["degraus"][number]["volume"];
  tendencia: FunilDeReceita["degraus"][number]["tendencia"];
  gravidade: Gravidade;
}

function medirEtapa(
  etapa: EtapaOperacional,
  amostra: Amostra,
  funil: FunilDeReceita,
): EtapaMedida {
  const sla = SLA_DA_ETAPA[etapa];
  const degrau = DEGRAU_DA_ETAPA[etapa];
  const doFunil = funil.degraus.find((d) => d.etapa === degrau)!;

  const duracao = media(amostra);
  const dentro = cumprimento(amostra, sla);

  const parcelas: Parcela[] = [];

  if (duracao.medido) {
    const excesso = Math.max(0, duracao.minutos / sla - 1);
    parcelas.push({
      fator: "estouro do prazo",
      peso: PESO_ESTOURO,
      nota: Math.min(excesso, TETO_DE_ESTOURO) / TETO_DE_ESTOURO,
      evidencia: `${duracao.minutos} min de média contra ${sla} min de prazo (sobre ${duracao.base})`,
    });
  }

  if (dentro.medido) {
    parcelas.push({
      fator: "passagens fora do prazo",
      peso: PESO_FORA_DO_PRAZO,
      nota: 1 - dentro.valor,
      evidencia: `${Math.round(dentro.valor * 100)}% dentro do prazo (sobre ${dentro.base})`,
    });
  }

  if (doFunil.conversao?.medido && doFunil.conversaoAnterior?.medido) {
    const antes = doFunil.conversaoAnterior.valor;
    const agora = doFunil.conversao.valor;
    const perda = antes > 0 ? Math.max(0, (antes - agora) / antes) : 0;
    parcelas.push({
      fator: "queda de conversão",
      peso: PESO_QUEDA_DE_CONVERSAO,
      nota: Math.min(perda, 1),
      evidencia: `conversão ${Math.round(agora * 100)}% contra ${Math.round(antes * 100)}% na janela anterior`,
    });
  }

  return {
    etapa,
    rotulo: ROTULO_OPERACIONAL[etapa],
    oQuePrazoMede: O_QUE_O_PRAZO_MEDE[etapa],
    slaMinutos: sla,
    duracao,
    dentroDoSla: dentro,
    conversao: doFunil.conversao,
    conversaoAnterior: doFunil.conversaoAnterior,
    degrau,
    volume: doFunil.volume,
    tendencia: doFunil.tendencia,
    gravidade: comporGravidade(parcelas),
  };
}

export interface EficienciaDaOperacao {
  etapas: EtapaMedida[];
  /** As etapas com gravidade MEDIDA, da pior para a melhor. */
  gargalos: EtapaMedida[];
  /** Etapas sem nenhuma medição — não são saudáveis, são cegas. */
  cegas: EtapaOperacional[];
}

export async function eficienciaPorEtapa(
  db: Banco,
  p: Periodo,
  funil: FunilDeReceita,
): Promise<EficienciaDaOperacao> {
  const [hunter, sdr, atendimento, vendas, crm] = await Promise.all([
    amostraDoHunter(db, p),
    amostraDoSdr(db, p),
    tempoDePrimeiraResposta(db as PrismaClient, p).then(deDuracao),
    amostraDeVendas(db, p),
    amostraDoCrm(db, p),
  ]);

  const etapas: EtapaMedida[] = [
    medirEtapa("HUNTER", hunter, funil),
    medirEtapa("SDR", sdr, funil),
    medirEtapa("ATENDIMENTO", atendimento, funil),
    medirEtapa("VENDAS", vendas, funil),
    medirEtapa("CRM", crm, funil),
  ];

  const gargalos = etapas
    .filter((e) => e.gravidade.medido && e.gravidade.valor > 0)
    .sort((a, b) => gravidadeDe(b) - gravidadeDe(a));

  return {
    etapas,
    gargalos,
    cegas: etapas.filter((e) => !e.gravidade.medido).map((e) => e.etapa),
  };
}

function gravidadeDe(e: EtapaMedida): number {
  return e.gravidade.medido ? e.gravidade.valor : -1;
}

/**
 * O tempo de primeira resposta já vem pronto do painel do gerente — só a média,
 * sem a lista. Para não reimplementar a consulta (que é a mesma), a média é
 * reconstituída como uma amostra de `base` elementos iguais à média.
 *
 * ⚠️ O que isso custa, dito claro: a fração "dentro do prazo" do ATENDIMENTO
 * vira 0% ou 100% — ela não conhece a dispersão. É honesto porque a média e a
 * base continuam exatas, e é o preço de não duplicar a consulta viva. O dia em
 * que a dispersão importar, `tempoDePrimeiraResposta` devolve a lista e isto
 * some.
 */
function deDuracao(d: Duracao): Amostra {
  if (!d.medido) return VAZIA;
  return { minutos: Array.from({ length: d.base }, () => d.minutos) };
}

// ─────────────────────────────────────────────────────────────────────────────
// O ÍNDICE DE SAÚDE — 0 a 100, com a conta na mesa
// ─────────────────────────────────────────────────────────────────────────────

export type IndiceDeSaude =
  | {
      medido: true;
      /** 0 a 100. */
      indice: number;
      parcelas: Parcela[];
      /** Quanto do peso total pôde ser medido — a confiança do índice. */
      pesoMedido: number;
      pesoTotal: number;
    }
  | { medido: false; motivo: "semMedicao"; pesoTotal: number };

export const PESOS_DA_SAUDE = {
  conversaoPontaAPonta: 25,
  cumprimentoDeSla: 25,
  acessoAoDecisor: 20,
  ativacaoDeClientes: 15,
  filaEmAtraso: 15,
} as const;

const PESO_TOTAL_DA_SAUDE = Object.values(PESOS_DA_SAUDE).reduce((s, n) => s + n, 0);

/**
 * A régua da conversão ponta a ponta.
 *
 * 2% de empresa descoberta a venda já é operação B2B fria funcionando. Fixar a
 * régua em 100% faria o índice morar sempre perto de zero e não ensinaria nada.
 */
export const CONVERSAO_PONTA_A_PONTA_EXCELENTE = 0.02;
/** A mesma ideia para o degrau que o projeto chama de central. */
export const ACESSO_AO_DECISOR_EXCELENTE = 0.35;

export interface EntradasDaSaude {
  funil: FunilDeReceita;
  eficiencia: EficienciaDaOperacao;
  /** Fila ativa e quanto dela está em atraso — vem do painel do gerente. */
  fila: { ativos: number; emAtraso: number } | null;
  /** Clientes ganhos e quantos chegaram a ativar. */
  ativacao: { ganhos: number; ativados: number } | null;
}

/**
 * O índice, e a conta que o produz.
 *
 * Nada de número mágico: cada parcela entra com peso declarado, nota entre 0 e
 * 1 e a evidência numérica ao lado. **Parcela não medida não entra como zero** —
 * ela some da conta e o peso total cai junto. Um índice de 72 sobre 45 pontos de
 * peso medido é uma afirmação diferente de 72 sobre 100, e a tela mostra os dois.
 */
export function indiceDeSaude(e: EntradasDaSaude): IndiceDeSaude {
  const parcelas: Parcela[] = [];

  const pontaAPonta = e.funil.pontaAPonta;
  if (pontaAPonta?.medido) {
    parcelas.push({
      fator: "conversão ponta a ponta",
      peso: PESOS_DA_SAUDE.conversaoPontaAPonta,
      nota: Math.min(pontaAPonta.valor / CONVERSAO_PONTA_A_PONTA_EXCELENTE, 1),
      evidencia: `${(pontaAPonta.valor * 100).toFixed(1)}% de ${pontaAPonta.base} empresas até a venda`,
    });
  }

  const comSla = e.eficiencia.etapas.filter((x) => x.dentroDoSla.medido);
  if (comSla.length > 0) {
    const soma = comSla.reduce((s, x) => s + (x.dentroDoSla.medido ? x.dentroDoSla.valor : 0), 0);
    const nota = soma / comSla.length;
    parcelas.push({
      fator: "cumprimento de prazo",
      peso: PESOS_DA_SAUDE.cumprimentoDeSla,
      nota,
      evidencia: `${Math.round(nota * 100)}% dentro do prazo, sobre ${comSla.length} de ${e.eficiencia.etapas.length} etapas medidas`,
    });
  }

  const acesso = e.funil.degraus.find((d) => d.etapa === "DECISORES_ENCONTRADOS")?.conversao;
  if (acesso?.medido) {
    parcelas.push({
      fator: "acesso ao decisor",
      peso: PESOS_DA_SAUDE.acessoAoDecisor,
      nota: Math.min(acesso.valor / ACESSO_AO_DECISOR_EXCELENTE, 1),
      evidencia: `${Math.round(acesso.valor * 100)}% das ${acesso.base} empresas prontas para o SDR chegaram ao decisor`,
    });
  }

  if (e.ativacao && e.ativacao.ganhos > 0) {
    const nota = e.ativacao.ativados / e.ativacao.ganhos;
    parcelas.push({
      fator: "ativação de clientes",
      peso: PESOS_DA_SAUDE.ativacaoDeClientes,
      nota: Math.min(nota, 1),
      evidencia: `${e.ativacao.ativados} de ${e.ativacao.ganhos} clientes ativaram`,
    });
  }

  if (e.fila && e.fila.ativos > 0) {
    const atraso = Math.min(e.fila.emAtraso / e.fila.ativos, 1);
    parcelas.push({
      fator: "fila em dia",
      peso: PESOS_DA_SAUDE.filaEmAtraso,
      nota: 1 - atraso,
      evidencia: `${e.fila.emAtraso} de ${e.fila.ativos} em atraso`,
    });
  }

  if (parcelas.length === 0) {
    return { medido: false, motivo: "semMedicao", pesoTotal: PESO_TOTAL_DA_SAUDE };
  }

  const pesoMedido = parcelas.reduce((s, p) => s + p.peso, 0);
  const soma = parcelas.reduce((s, p) => s + p.peso * p.nota, 0);

  return {
    medido: true,
    indice: Math.round((soma / pesoMedido) * 100),
    parcelas,
    pesoMedido,
    pesoTotal: PESO_TOTAL_DA_SAUDE,
  };
}

/** Atalho: a janela anterior de um período, reexportado para quem só usa daqui. */
export { janelaAnterior, funilDeReceita };
