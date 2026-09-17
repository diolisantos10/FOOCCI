/**
 * O MOTOR DE DIAGNÓSTICO — o coração do Revenue Supervisor.
 *
 * ── A DIFERENÇA QUE ESTE ARQUIVO EXISTE PARA FAZER ──────────────────────────
 *
 * O projeto é explícito: *"Seu papel NÃO é apenas exibir dashboards. Ele precisa
 * DIAGNOSTICAR a operação."* À pergunta "por que as vendas caíram ontem?", o
 * que se espera de volta não é um gráfico:
 *
 *     ↓ 18% oportunidades criadas
 *     Principal causa: SDR conseguiu chegar a apenas 12% dos decisores.
 *     Problema: 34% dos contatos encontrados são canais de pedidos.
 *     Ação: priorizar enriquecimento de decisores nos 813 prospects de maior ICP.
 *
 * Três frases, quatro números. É isso que este arquivo produz.
 *
 * ── O ALGORITMO, EM DUAS FRASES ─────────────────────────────────────────────
 *
 * 1. **Sobe o funil decompondo a queda.** A variação de uma etapa é, por
 *    identidade aritmética, a soma de dois efeitos: o volume que veio da etapa
 *    de cima mudou, ou a conversão daquela passagem mudou. Se o efeito de VOLUME
 *    domina, a causa está mais acima e a busca continua; se o efeito de
 *    CONVERSÃO domina, a passagem culpada foi encontrada e a subida para.
 *
 * 2. **Interroga as dimensões daquela passagem.** Achada a passagem, o motor
 *    dispara as sondas que fazem sentido para ELA — qualidade do ICP,
 *    enriquecimento, acesso ao decisor, tipo de gatekeeper, propostas, perdas,
 *    ativação, churn — e devolve causa provável, evidência numérica e ação.
 *
 * ── A REGRA DE OURO, QUE É CÓDIGO E NÃO RECOMENDAÇÃO ────────────────────────
 *
 * **Toda afirmação do diagnóstico carrega o número que a sustenta.** Não é uma
 * convenção de escrita: `Evidencia` não existe sem `numero`, e o diagnóstico só
 * se monta a partir de `Evidencia`. Uma frase sem número não tem como ser dita
 * por este módulo — a estrutura não a comporta.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  funilDeReceita,
  janelaAnterior,
  totalDe,
  ETAPAS_DA_RECEITA,
  ROTULO_DA_ETAPA,
  type EtapaDaReceita,
  type FunilDeReceita,
  type Periodo,
} from "./funilDeReceita";

type Banco = PrismaClient | Prisma.TransactionClient;

/** Abaixo disto é oscilação, não queda. */
export const LIMIAR_DE_QUEDA = 0.1;

/** Sem este volume na janela anterior, a variação percentual é folclore. */
export const MINIMO_PARA_COMPARAR = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Evidência: a estrutura que torna impossível afirmar sem número
// ─────────────────────────────────────────────────────────────────────────────

export type UnidadeDaEvidencia = "contagem" | "fracao" | "minutos";

export interface Evidencia {
  /** A frase, SEM o número — o número entra formatado pela tela. */
  afirmacao: string;
  numero: number;
  unidade: UnidadeDaEvidencia;
  /** Sobre quantos o número foi apurado, quando é fração. */
  base?: number;
}

/**
 * Monta uma evidência, ou devolve `null`.
 *
 * `null` quando o número não existe ou não é finito — e quem chama é obrigado a
 * lidar com o `null`, porque `Evidencia` não aceita `numero` opcional. É assim
 * que a regra de ouro vira trava: sem número, a afirmação não chega a existir.
 */
export function evidencia(
  afirmacao: string,
  numero: number | null | undefined,
  unidade: UnidadeDaEvidencia,
  base?: number,
): Evidencia | null {
  if (typeof numero !== "number" || !Number.isFinite(numero)) return null;
  return base === undefined
    ? { afirmacao, numero, unidade }
    : { afirmacao, numero, unidade, base };
}

export function formatarEvidencia(e: Evidencia): string {
  const n =
    e.unidade === "fracao"
      ? `${Math.round(e.numero * 100)}%`
      : e.unidade === "minutos"
        ? `${e.numero} min`
        : String(e.numero);
  const sobre = e.base !== undefined ? ` (sobre ${e.base})` : "";
  return `${n} ${e.afirmacao}${sobre}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A subida pelo funil
// ─────────────────────────────────────────────────────────────────────────────

export interface EloDaCadeia {
  /** A etapa de cima e a de baixo desta passagem. */
  acima: EtapaDaReceita;
  abaixo: EtapaDaReceita;
  volumeAcima: number;
  volumeAcimaAnterior: number;
  conversao: number;
  conversaoAnterior: number;
  /** Quanto da queda de `abaixo` veio de ter entrado menos gente em cima. */
  efeitoVolume: number;
  /** Quanto veio da passagem ter convertido pior. */
  efeitoConversao: number;
  /** Qual dos dois manda aqui. */
  dominante: "volume" | "conversao";
}

interface Numeros {
  atual: Record<EtapaDaReceita, number | null>;
  anterior: Record<EtapaDaReceita, number | null>;
}

function numerosDo(funil: FunilDeReceita): Numeros {
  const atual = {} as Record<EtapaDaReceita, number | null>;
  const anterior = {} as Record<EtapaDaReceita, number | null>;
  for (const d of funil.degraus) {
    atual[d.etapa] = totalDe(d.volume);
    anterior[d.etapa] = totalDe(d.volumeAnterior);
  }
  return { atual, anterior };
}

/**
 * A decomposição de uma passagem. `null` quando não há como decompor sem mentir.
 *
 * Exige volume medido dos dois lados e base suficiente na janela anterior: sem
 * isso, "caiu 40%" pode ser dois virando um.
 */
export function decompor(
  acima: EtapaDaReceita,
  abaixo: EtapaDaReceita,
  n: Numeros,
): EloDaCadeia | null {
  const va = n.atual[acima];
  const vaAnt = n.anterior[acima];
  const vb = n.atual[abaixo];
  const vbAnt = n.anterior[abaixo];

  if (va === null || vaAnt === null || vb === null || vbAnt === null) return null;
  if (vaAnt < MINIMO_PARA_COMPARAR || va === 0) return null;

  const c = vb / va;
  const cAnt = vbAnt / vaAnt;

  const efeitoVolume = (va - vaAnt) * cAnt;
  const efeitoConversao = va * (c - cAnt);

  return {
    acima,
    abaixo,
    volumeAcima: va,
    volumeAcimaAnterior: vaAnt,
    conversao: c,
    conversaoAnterior: cAnt,
    efeitoVolume,
    efeitoConversao,
    dominante: Math.abs(efeitoVolume) >= Math.abs(efeitoConversao) ? "volume" : "conversao",
  };
}

/** A etapa mais ABAIXO que caiu além do limiar — é por ela que a pergunta começa. */
export function etapaQueCaiu(funil: FunilDeReceita): EtapaDaReceita | null {
  for (let i = funil.degraus.length - 1; i >= 0; i -= 1) {
    const d = funil.degraus[i];
    if (!d) continue;
    // Retrato não cai nem sobe: comparar "clientes ativos agora" com "clientes
    // ativos agora" daria sempre 0%, e um 0% falso vira âncora de diagnóstico.
    if (d.ehRetrato) continue;
    const t = d.tendencia;
    if (t.medido && t.de >= MINIMO_PARA_COMPARAR && t.variacao <= -LIMIAR_DE_QUEDA) {
      return d.etapa;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// As sondas de dimensão
// ─────────────────────────────────────────────────────────────────────────────

/** Gatekeepers que são canal de PEDIDO, não de decisão. Do documento. */
export const CANAIS_DE_PEDIDOS = ["BOT_DE_PEDIDOS", "WHATSAPP_GERAL"] as const;

const ESTAGIOS_SEM_DECISOR = ["PRONTA_PARA_SDR", "GATEKEEPER"] as const;

export interface Sondagem {
  /** A causa em uma frase, já com o número dentro. */
  problema: string;
  evidencias: Evidencia[];
  acaoRecomendada: string;
}

async function sondarDecisor(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const janela = { gte: p.de, lt: p.ate };

  const [gatekeepers, prontasAlta, prontas] = await Promise.all([
    db.contato.groupBy({
      by: ["tipoDeGatekeeper"],
      where: { ehGatekeeper: true, criadoEm: janela },
      _count: { _all: true },
    }),
    db.empresa.count({
      where: { estagio: { in: [...ESTAGIOS_SEM_DECISOR] }, prioridade: "ALTA" },
    }),
    db.empresa.count({ where: { estagio: { in: [...ESTAGIOS_SEM_DECISOR] } } }),
  ]);

  const totalGk = gatekeepers.reduce((s, g) => s + g._count._all, 0);
  const evidencias: Evidencia[] = [];

  let fracaoPedidos: number | null = null;
  if (totalGk > 0) {
    const pedidos = gatekeepers
      .filter((g) => CANAIS_DE_PEDIDOS.includes(g.tipoDeGatekeeper as never))
      .reduce((s, g) => s + g._count._all, 0);
    fracaoPedidos = pedidos / totalGk;
    const e = evidencia(
      "dos contatos encontrados são canais de pedidos, não de decisão",
      fracaoPedidos,
      "fracao",
      totalGk,
    );
    if (e) evidencias.push(e);
  }

  const eFila = evidencia(
    "empresas paradas antes do decisor",
    prontas > 0 ? prontas : null,
    "contagem",
  );
  if (eFila) evidencias.push(eFila);

  const eAlta = evidencia(
    "delas são de maior ICP e ainda não têm decisor",
    prontasAlta > 0 ? prontasAlta : null,
    "contagem",
  );
  if (eAlta) evidencias.push(eAlta);

  if (evidencias.length === 0) return null;

  const problema =
    fracaoPedidos !== null
      ? `${Math.round(fracaoPedidos * 100)}% dos contatos encontrados são canais de pedidos, não de decisão`
      : `${prontas} empresas estão paradas antes de chegar ao decisor`;

  const acaoRecomendada =
    prontasAlta > 0
      ? `priorizar enriquecimento de decisores nos ${prontasAlta} prospects de maior ICP antes de ampliar aquisição`
      : `priorizar enriquecimento de decisores nas ${prontas} empresas paradas antes de ampliar aquisição`;

  return { problema, evidencias, acaoRecomendada };
}

async function sondarEnriquecimento(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const [paradas, semIcp, descartadasNoPeriodo] = await Promise.all([
    db.empresa.count({ where: { estagio: { in: ["DESCOBERTA", "ENRIQUECENDO"] } } }),
    db.empresa.count({ where: { estagio: { in: ["DESCOBERTA", "ENRIQUECENDO"] }, scoreIcp: null } }),
    db.empresa.count({
      where: { estagio: "DESCARTADA", estagioMudouEm: { gte: p.de, lt: p.ate } },
    }),
  ]);

  const evidencias: Evidencia[] = [];
  const eParadas = evidencia("empresas paradas no enriquecimento", paradas || null, "contagem");
  if (eParadas) evidencias.push(eParadas);

  if (paradas > 0) {
    const e = evidencia("delas sem ICP calculado", semIcp / paradas, "fracao", paradas);
    if (e) evidencias.push(e);
  }

  const eDesc = evidencia(
    "empresas descartadas no período",
    descartadasNoPeriodo || null,
    "contagem",
  );
  if (eDesc) evidencias.push(eDesc);

  if (evidencias.length === 0) return null;

  return {
    problema: `${paradas} empresas travadas antes de ficarem prontas para o SDR, ${semIcp} delas sem ICP calculado`,
    evidencias,
    acaoRecomendada:
      semIcp > 0
        ? `rodar o cálculo de ICP nas ${semIcp} empresas sem score antes de descobrir empresa nova — fila sem régua não vira trabalho`
        : `destravar o enriquecimento das ${paradas} empresas em fila antes de ampliar a descoberta`,
  };
}

async function sondarDescoberta(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const anterior = janelaAnterior(p);
  const [agora, antes, fontes] = await Promise.all([
    db.empresa.count({ where: { descobertaEm: { gte: p.de, lt: p.ate } } }),
    db.empresa.count({ where: { descobertaEm: { gte: anterior.de, lt: anterior.ate } } }),
    db.empresa.groupBy({
      by: ["fonteDaDescoberta"],
      where: { descobertaEm: { gte: p.de, lt: p.ate } },
      _count: { _all: true },
    }),
  ]);

  if (antes < MINIMO_PARA_COMPARAR) return null;

  const evidencias: Evidencia[] = [];
  const eQueda = evidencia("de queda no volume descoberto", (agora - antes) / antes, "fracao", antes);
  if (eQueda) evidencias.push(eQueda);
  const eFontes = evidencia("fontes de descoberta ativas no período", fontes.length || null, "contagem");
  if (eFontes) evidencias.push(eFontes);

  if (evidencias.length === 0) return null;

  return {
    problema: `a descoberta entregou ${agora} empresas contra ${antes} na janela anterior`,
    evidencias,
    acaoRecomendada:
      fontes.length <= 1
        ? `a aquisição depende de ${fontes.length} fonte — abrir uma segunda fonte de descoberta antes de cobrar o SDR`
        : `recompor o volume de descoberta: ${antes - agora} empresas a menos entraram no topo`,
  };
}

async function sondarOportunidades(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const [qualificadasSemOportunidade, semResposta] = await Promise.all([
    db.empresa.count({ where: { estagio: "QUALIFICADA" } }),
    db.siteLead.count({
      where: { createdAt: { gte: p.de, lt: p.ate }, primeiraRespostaEm: null },
    }),
  ]);

  const evidencias: Evidencia[] = [];
  const eQual = evidencia(
    "empresas qualificadas sem oportunidade aberta",
    qualificadasSemOportunidade || null,
    "contagem",
  );
  if (eQual) evidencias.push(eQual);
  const eSem = evidencia("leads do período que nunca responderam", semResposta || null, "contagem");
  if (eSem) evidencias.push(eSem);

  if (evidencias.length === 0) return null;

  return {
    problema:
      qualificadasSemOportunidade > 0
        ? `${qualificadasSemOportunidade} empresas qualificadas não viraram oportunidade`
        : `${semResposta} leads entraram no período e nenhum deles respondeu`,
    evidencias,
    acaoRecomendada:
      qualificadasSemOportunidade > 0
        ? `abrir oportunidade para as ${qualificadasSemOportunidade} empresas já qualificadas — o trabalho de acesso já foi pago`
        : `revisar a abordagem: ${semResposta} conversas iniciadas sem uma única resposta`,
  };
}

async function sondarVendas(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const janela = { gte: p.de, lt: p.ate };
  const [emNegociacao, perdidas, propostasAbertas] = await Promise.all([
    db.oportunidade.count({ where: { estagio: { in: ["PROPOSTA", "NEGOCIACAO"] } } }),
    db.oportunidade.count({ where: { estagio: "PERDIDA", fechadaEm: janela } }),
    db.leadProposta.count({ where: { situacao: "ENVIADA" } }),
  ]);

  const evidencias: Evidencia[] = [];
  const eNeg = evidencia("oportunidades paradas em proposta ou negociação", emNegociacao || null, "contagem");
  if (eNeg) evidencias.push(eNeg);
  const ePer = evidencia("oportunidades perdidas no período", perdidas || null, "contagem");
  if (ePer) evidencias.push(ePer);
  const eProp = evidencia("propostas enviadas sem resposta", propostasAbertas || null, "contagem");
  if (eProp) evidencias.push(eProp);

  if (evidencias.length === 0) return null;

  return {
    problema: `${emNegociacao} oportunidades estão paradas entre proposta e negociação e ${perdidas} foram perdidas no período`,
    evidencias,
    acaoRecomendada:
      propostasAbertas > 0
        ? `cobrar resposta das ${propostasAbertas} propostas enviadas antes de abrir negociação nova`
        : `revisar as ${emNegociacao} negociações paradas: fechamento não é fila de espera`,
  };
}

async function sondarClientes(db: Banco, p: Periodo): Promise<Sondagem | null> {
  const [semAtivar, emRisco, cancelados] = await Promise.all([
    db.cliente.count({ where: { situacao: "EM_ATIVACAO", ativadoEm: null } }),
    db.cliente.count({ where: { situacao: "EM_RISCO" } }),
    db.cliente.count({ where: { canceladoEm: { gte: p.de, lt: p.ate } } }),
  ]);

  const evidencias: Evidencia[] = [];
  const eSem = evidencia("clientes comprados e nunca ativados", semAtivar || null, "contagem");
  if (eSem) evidencias.push(eSem);
  const eRisco = evidencia("clientes marcados em risco", emRisco || null, "contagem");
  if (eRisco) evidencias.push(eRisco);
  const eCanc = evidencia("cancelamentos no período", cancelados || null, "contagem");
  if (eCanc) evidencias.push(eCanc);

  if (evidencias.length === 0) return null;

  return {
    problema: `${semAtivar} clientes compraram e não ativaram, ${emRisco} estão marcados em risco`,
    evidencias,
    acaoRecomendada:
      semAtivar > 0
        ? `atacar a ativação dos ${semAtivar} clientes parados — o churn nasce aqui, antes do cancelamento`
        : `abrir plano de retenção para os ${emRisco} clientes em risco`,
  };
}

const SONDA_DA_ETAPA: Record<
  EtapaDaReceita,
  (db: Banco, p: Periodo) => Promise<Sondagem | null>
> = {
  EMPRESAS_ENCONTRADAS: sondarDescoberta,
  PROSPECTS_VALIDOS: sondarEnriquecimento,
  PRONTAS_PARA_SDR: sondarEnriquecimento,
  DECISORES_ENCONTRADOS: sondarDecisor,
  OPORTUNIDADES: sondarOportunidades,
  VENDAS: sondarVendas,
  CLIENTES_ATIVOS: sondarClientes,
};

// ─────────────────────────────────────────────────────────────────────────────
// O diagnóstico
// ─────────────────────────────────────────────────────────────────────────────

export interface Diagnostico {
  medido: true;
  /** A etapa onde a queda apareceu. */
  foco: EtapaDaReceita;
  focoRotulo: string;
  /** A queda observada em `foco`, em fração (−0,18 = −18%). */
  queda: number;
  quedaDe: number;
  quedaPara: number;
  /** A passagem apontada como causa, e o caminho percorrido até ela. */
  causa: EloDaCadeia | null;
  cadeia: EloDaCadeia[];
  /** A causa em uma frase, com número. */
  causaProvavel: string;
  problema: string | null;
  evidencias: Evidencia[];
  acaoRecomendada: string | null;
}

export type ResultadoDoDiagnostico =
  | Diagnostico
  | { medido: false; motivo: "semBase"; detalhe: string }
  | { medido: false; motivo: "semQueda"; detalhe: string }
  | { medido: false; motivo: "semCadeia"; foco: EtapaDaReceita; detalhe: string };

/**
 * Diagnostica o funil de receita de um período.
 *
 * `foco` opcional força a pergunta ("por que as VENDAS caíram?"); sem ele, o
 * motor escolhe a etapa mais abaixo que caiu além do limiar — porque é o fim do
 * funil que o CEO percebe primeiro, e é de lá que a pergunta real nasce.
 */
export async function diagnosticar(
  db: Banco,
  params: Periodo & { foco?: EtapaDaReceita; funil?: FunilDeReceita },
): Promise<ResultadoDoDiagnostico> {
  const p: Periodo = { de: params.de, ate: params.ate };
  const funil = params.funil ?? (await funilDeReceita(db, p));
  const n = numerosDo(funil);

  const temAlgumNumero = ETAPAS_DA_RECEITA.some((e) => n.atual[e] !== null);
  if (!temAlgumNumero) {
    return {
      medido: false,
      motivo: "semBase",
      detalhe:
        "nenhuma etapa do funil tem fonte ligada — não há o que diagnosticar, e isto não é o mesmo que estar tudo bem",
    };
  }

  const foco = params.foco ?? etapaQueCaiu(funil);
  if (!foco) {
    return {
      medido: false,
      motivo: "semQueda",
      detalhe: `nenhuma etapa caiu mais de ${Math.round(LIMIAR_DE_QUEDA * 100)}% contra a janela anterior`,
    };
  }

  const degrauFoco = funil.degraus.find((d) => d.etapa === foco)!;
  const t = degrauFoco.tendencia;
  if (!t.medido) {
    return {
      medido: false,
      motivo: "semCadeia",
      foco,
      detalhe: `${ROTULO_DA_ETAPA[foco]} não tem comparação com a janela anterior`,
    };
  }

  // ── A SUBIDA ──────────────────────────────────────────────────────────────
  const cadeia: EloDaCadeia[] = [];
  let indice = ETAPAS_DA_RECEITA.indexOf(foco);
  let culpado: EloDaCadeia | null = null;

  while (indice > 0 && cadeia.length < ETAPAS_DA_RECEITA.length) {
    const acima = ETAPAS_DA_RECEITA[indice - 1];
    const abaixo = ETAPAS_DA_RECEITA[indice];
    if (!acima || !abaixo) break;
    const elo = decompor(acima, abaixo, n);
    if (!elo) break;
    cadeia.push(elo);

    if (elo.dominante === "conversao") {
      culpado = elo;
      break;
    }
    // O volume manda: a causa está mais acima. Continua subindo — e se já
    // chegamos ao topo, o próprio topo é a causa.
    culpado = elo;
    indice -= 1;
  }

  // A etapa cuja sonda responde: a de baixo da passagem culpada, ou o topo.
  const etapaDaSonda: EtapaDaReceita = culpado
    ? culpado.dominante === "conversao"
      ? culpado.abaixo
      : culpado.acima
    : foco;

  const sondagem = await SONDA_DA_ETAPA[etapaDaSonda](db, p);

  const causaProvavel = culpado
    ? culpado.dominante === "conversao"
      ? `a passagem ${ROTULO_DA_ETAPA[culpado.acima]} → ${ROTULO_DA_ETAPA[culpado.abaixo]} converteu ${Math.round(culpado.conversao * 100)}% contra ${Math.round(culpado.conversaoAnterior * 100)}% na janela anterior`
      : `entrou menos volume em ${ROTULO_DA_ETAPA[culpado.acima]}: ${culpado.volumeAcima} contra ${culpado.volumeAcimaAnterior} na janela anterior`
    : `${ROTULO_DA_ETAPA[foco]} caiu ${Math.round(Math.abs(t.variacao) * 100)}% e não há etapa acima com número comparável`;

  const evidencias: Evidencia[] = [];
  const eQueda = evidencia(
    `de queda em ${ROTULO_DA_ETAPA[foco].toLowerCase()}`,
    t.variacao,
    "fracao",
    t.de,
  );
  if (eQueda) evidencias.push(eQueda);

  if (culpado) {
    const eConv = evidencia(
      `de conversão em ${ROTULO_DA_ETAPA[culpado.acima]} → ${ROTULO_DA_ETAPA[culpado.abaixo]}, contra ${Math.round(culpado.conversaoAnterior * 100)}% antes`,
      culpado.conversao,
      "fracao",
      culpado.volumeAcima,
    );
    if (eConv) evidencias.push(eConv);
  }

  if (sondagem) evidencias.push(...sondagem.evidencias);

  return {
    medido: true,
    foco,
    focoRotulo: ROTULO_DA_ETAPA[foco],
    queda: t.variacao,
    quedaDe: t.de,
    quedaPara: t.para,
    causa: culpado,
    cadeia,
    causaProvavel,
    problema: sondagem?.problema ?? null,
    evidencias,
    acaoRecomendada: sondagem?.acaoRecomendada ?? null,
  };
}
