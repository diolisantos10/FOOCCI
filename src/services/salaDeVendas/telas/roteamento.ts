/**
 * A TELA DO MOTOR DE DECISÃO — o que ele decide hoje, e o que ele ainda não decide.
 *
 * ── A REGRA MAIS IMPORTANTE DESTE ARQUIVO ───────────────────────────────────
 *
 * O desenho do CEO lista nove critérios de distribuição: produto, região,
 * idioma, valor, especialidade, carteira, disponibilidade, round-robin e VIP —
 * mais fallback e SLA por regra. **Seis deles não existem no código.**
 *
 * Desenhar os onze na tela como se todos funcionassem seria a pior coisa que
 * esta tela poderia fazer: o gerente passaria a confiar num roteamento por
 * idioma que nunca rodou, e o defeito só apareceria num cliente perdido.
 *
 * Então a tela tem duas listas, e a separação é o produto:
 *
 *   · `REGRAS_QUE_EXISTEM` — cada uma aponta a função que a executa;
 *   · `PREVISTAS_NAO_CONSTRUIDAS` — cada uma diz o que falta para existir.
 *
 * ── E O SLA ─────────────────────────────────────────────────────────────────
 *
 * `leadsComSlaEstourado` lê a coluna `slaVenceEm`. Medido em 17/09/2026:
 * **nenhum código da casa grava essa coluna.** A consulta está correta e o
 * relógio nunca foi ligado. A tela diz isso com todas as letras em vez de
 * mostrar um tranquilizador "0 SLAs estourados" — que seria a mesma tela que
 * um sistema funcionando mostraria.
 */

import type { Prisma, PrismaClient, ModoDeDistribuicao } from "@prisma/client";
import {
  lerCandidatos,
  podeReceber,
  leadsComSlaEstourado,
  descreverInaptidao,
  type CandidatoADistribuicao,
  type MotivoDaInaptidao,
} from "../distribuicao";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO DE REGRAS — o que existe, e o que só está desenhado
// ─────────────────────────────────────────────────────────────────────────────

export interface RegraQueExiste {
  criterio: string;
  /** O que ela faz, em uma frase de operação. */
  oQueFaz: string;
  /** Onde ela mora. É o endereço que o Diretor abre para conferir. */
  ondeMora: string;
  /** O modo de distribuição em que ela vale. `null` = vale em todos. */
  modo: ModoDeDistribuicao | null;
}

export const REGRAS_QUE_EXISTEM: readonly RegraQueExiste[] = [
  {
    criterio: "Disponibilidade",
    oQueFaz: "quem está OFFLINE ou em pausa com prazo aberto não recebe lead nenhum",
    ondeMora: "distribuicao.ts · podeReceber",
    modo: null,
  },
  {
    criterio: "Capacidade (carga)",
    oQueFaz: "quem já está no limite de conversas abertas sai da roda até liberar",
    ondeMora: "distribuicao.ts · podeReceber",
    modo: null,
  },
  {
    criterio: "Menor carga",
    oQueFaz: "o próximo lead vai para quem tem menos conversa aberta; empate desempata por quem recebeu há mais tempo",
    ondeMora: "distribuicao.ts · escolherResponsavel",
    modo: "DISPONIBILIDADE",
  },
  {
    criterio: "Round-robin",
    oQueFaz: "rodízio por quem recebeu há mais tempo — quem nunca recebeu vem primeiro",
    ondeMora: "distribuicao.ts · escolherResponsavel",
    modo: "RODIZIO",
  },
  {
    criterio: "Especialidade",
    oQueFaz: "só entram no rodízio os SDRs que têm a especialidade exigida",
    ondeMora: "distribuicao.ts · podeReceber + escolherResponsavel",
    modo: "ESPECIALIDADE",
  },
  {
    criterio: "Região",
    oQueFaz: "só entram os SDRs que atendem a região exigida",
    ondeMora: "distribuicao.ts · podeReceber",
    modo: "ESPECIALIDADE",
  },
  {
    criterio: "Manual (fila aberta)",
    oQueFaz: "ninguém distribui: a fila sem responsável fica visível e é puxada por quem está livre",
    ondeMora: "distribuicao.ts · escolherResponsavel",
    modo: "MANUAL",
  },
  {
    criterio: "Lead com dono não é redistribuído",
    oQueFaz: "a escrita é condicional em o lead estar sem dono; só a assunção do gerente, com motivo escrito, tira lead de alguém",
    ondeMora: "distribuicao.ts · distribuir + assuncaoDoGerente",
    modo: null,
  },
];

export interface RegraPrevista {
  criterio: string;
  /** O que o desenho pede. */
  oDesenhoPede: string;
  /** O que falta, concretamente, para ela existir. */
  oQueFalta: string;
}

/**
 * ⚠️ Nenhuma linha daqui é uma regra ativa. Esta lista é o buraco, escrito.
 */
export const PREVISTAS_NAO_CONSTRUIDAS: readonly RegraPrevista[] = [
  {
    criterio: "Produto",
    oDesenhoPede: "rotear pelo produto que o lead quer",
    oQueFalta: "o Foocci vende um produto só, em três planos. Não há campo de produto no lead para rotear por ele.",
  },
  {
    criterio: "Idioma",
    oDesenhoPede: "mandar o lead para quem fala a língua dele",
    oQueFalta: "não existe campo de idioma no lead nem na disponibilidade do SDR.",
  },
  {
    criterio: "Valor potencial",
    oDesenhoPede: "lead grande vai para o vendedor sênior",
    oQueFalta: "`valorPotencialCents` existe na Oportunidade, mas `escolherResponsavel` não recebe nem lê esse número.",
  },
  {
    criterio: "Carteira",
    oDesenhoPede: "lead que já é de alguém volta para quem o atendeu",
    oQueFalta: "a carteira existe como TELA de leitura; nenhuma regra de distribuição consulta o histórico de atendimento.",
  },
  {
    criterio: "VIP / prioritário",
    oDesenhoPede: "o VIP fura a fila",
    oQueFalta: "o campo `prioritario` existe no lead e nenhuma regra de distribuição o lê — ele hoje só ordena listas.",
  },
  {
    criterio: "Fallback",
    oDesenhoPede: "se ninguém puder atender, cai para uma fila reserva",
    oQueFalta: "quando ninguém está apto, a distribuição recusa e explica o motivo. Não há segunda tentativa nem fila reserva.",
  },
  {
    criterio: "SLA por regra",
    oDesenhoPede: "cada regra com o seu prazo de primeira resposta",
    oQueFalta: "há UM prazo por lead (`slaVenceEm`) e nenhum código da casa o preenche — ver o quadro do SLA nesta tela.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA
// ─────────────────────────────────────────────────────────────────────────────

export interface AtendenteNoMotor {
  userId: string;
  nome: string;
  estado: CandidatoADistribuicao["estado"];
  carga: number;
  capacidade: number;
  especialidades: string[];
  regioes: string[];
  apto: boolean;
  /** O motivo da recusa, quando não está apto. */
  motivo: MotivoDaInaptidao | null;
  ultimoRecebimentoEm: string | null;
}

export interface QuadroDoSla {
  /** Quantos leads têm prazo gravado. Zero significa relógio desligado. */
  comPrazo: number;
  /** Quantos estouraram. `null` quando não há prazo gravado em lead nenhum. */
  estourados: number | null;
  /** Por que o número acima é `null`, quando é. */
  naoMedido: string | null;
}

export interface PanoramaDoRoteamento {
  modo: ModoDeDistribuicao;
  /** `true` quando o modo veio do padrão porque não há configuração gravada. */
  modoEhPadrao: boolean;
  atendentes: AtendenteNoMotor[];
  aptos: number;
  /** "ninguém disponível: 2 pausados, 1 no limite" — ou vazio quando há apto. */
  porQueNinguemEstaApto: string | null;
  /** Leads esperando dono agora. */
  semResponsavel: number;
  sla: QuadroDoSla;
  regrasQueExistem: readonly RegraQueExiste[];
  previstasNaoConstruidas: readonly RegraPrevista[];
  naoMedido: string[];
}

/** O mesmo padrão da rota de distribuição: sem configuração, é MANUAL. */
export const MODO_PADRAO: ModoDeDistribuicao = "MANUAL";

/**
 * ⭐ O estado do motor, agora.
 *
 * Só leitura. Esta função não distribui, não transfere e não muda o modo —
 * quem faz isso é a rota `/api/admin/sala-de-vendas/distribuicao`, que já
 * existe e já tem as travas de papel.
 */
export async function panoramaDoRoteamento(
  db: Cliente,
  params: { agora?: Date } = {},
): Promise<PanoramaDoRoteamento> {
  const agora = params.agora ?? new Date();

  const [config, candidatos, semResponsavel, comPrazo] = await Promise.all([
    db.sdrIaConfig.findUnique({ where: { slug: "ta" }, select: { distribuicao: true } }),
    lerCandidatos(db),
    db.siteLead.count({
      where: {
        atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] },
        stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
      },
    }),
    db.siteLead.count({ where: { slaVenceEm: { not: null } } }),
  ]);

  const modo = config?.distribuicao ?? MODO_PADRAO;

  // A aptidão é medida com as MESMAS exigências que a distribuição real usaria
  // no modo corrente: sem exigência fora de ESPECIALIDADE. Medir com exigências
  // que o modo não aplica pintaria de vermelho um time que está apto.
  const atendentes: AtendenteNoMotor[] = candidatos.map((c) => {
    const a = podeReceber(c, agora);
    return {
      userId: c.userId,
      nome: c.nome,
      estado: c.estado,
      carga: c.carga,
      capacidade: c.capacidade,
      especialidades: c.especialidades,
      regioes: c.regioes,
      apto: a.apto,
      motivo: a.motivo ?? null,
      ultimoRecebimentoEm: c.ultimoRecebimentoEm ? c.ultimoRecebimentoEm.toISOString() : null,
    };
  });

  const aptos = atendentes.filter((a) => a.apto).length;

  let porQueNinguemEstaApto: string | null = null;
  if (aptos === 0) {
    const detalhe: Record<MotivoDaInaptidao, number> = {
      offline: 0, pausado: 0, noLimite: 0, semEspecialidade: 0, semRegiao: 0,
    };
    for (const a of atendentes) if (a.motivo) detalhe[a.motivo] += 1;
    porQueNinguemEstaApto = descreverInaptidao(detalhe);
  }

  // ⚠️ Só conta SLA estourado se ALGUÉM tem prazo. Sem isso, a tela mostraria
  // "0 estourados" numa operação em que o relógio nunca foi ligado — e zero
  // aqui é indistinguível de "tudo em dia".
  const sla: QuadroDoSla = comPrazo
    ? { comPrazo, estourados: (await leadsComSlaEstourado(db, agora)).length, naoMedido: null }
    : {
        comPrazo: 0,
        estourados: null,
        naoMedido:
          "Nenhum lead tem prazo de primeira resposta gravado. A consulta de SLA está de pé e correta; o que falta é alguém preencher `slaVenceEm` na entrada do lead — hoje nenhum código da casa escreve nessa coluna.",
      };

  const naoMedido: string[] = [];
  if (sla.naoMedido) naoMedido.push(sla.naoMedido);
  if (!candidatos.length) {
    naoMedido.push(
      "Nenhum atendente com disponibilidade cadastrada. Sem isso o motor não tem para quem distribuir, em modo nenhum.",
    );
  }
  if (modo === "MANUAL") {
    naoMedido.push(
      "A distribuição está em MANUAL: nada é atribuído sozinho. As regras abaixo descrevem o que valeria nos outros modos.",
    );
  }

  return {
    modo,
    modoEhPadrao: !config,
    atendentes,
    aptos,
    porQueNinguemEstaApto,
    semResponsavel,
    sla,
    regrasQueExistem: REGRAS_QUE_EXISTEM,
    previstasNaoConstruidas: PREVISTAS_NAO_CONSTRUIDAS,
    naoMedido,
  };
}
