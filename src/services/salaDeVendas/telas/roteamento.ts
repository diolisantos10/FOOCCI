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
  escolherResponsavel,
  leadsComSlaEstourado,
  descreverInaptidao,
  type CandidatoADistribuicao,
  type MotivoDaInaptidao,
} from "../distribuicao";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * ⭐ AS DUAS FUNÇÕES PURAS DA DECISÃO, REPASSADAS POR AQUI.
 *
 * A tela simula no navegador, e tem que simular com a FUNÇÃO REAL — uma cópia
 * "de tela" mostraria o que deveria acontecer, e a divergência só apareceria
 * num lead perdido.
 *
 * Elas saem por este módulo, e não direto de `../distribuicao`, por duas
 * razões que apontam para o mesmo lugar: o contrato da frente comercial manda
 * a tela consumir **o panorama do serviço** e nada mais, e o nome do módulo de
 * distribuição é também o nome da ROTA de escrita que a tela tem proibido
 * alcançar. Um caminho só de entrada deixa o contrato legível.
 *
 * ⚠️ São puras e não tocam o banco: não distribuem, não gravam, não movem lead.
 */
export { escolherResponsavel, podeReceber } from "../distribuicao";
export type { CandidatoADistribuicao, Aptidao, Escolha } from "../distribuicao";

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
  /** Fim da pausa, quando há. O simulador da tela precisa dele para reconstruir
   *  o candidato EXATO que `podeReceber` avaliaria — sem este campo, a pausa
   *  desapareceria na simulação e ela mentiria para o lado otimista. */
  pausadoAte: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O PREVIEW — quem pegaria o próximo lead, e por qual regra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A DECISÃO DO MOTOR PARA UM LEAD, nomeando a regra que pegou.
 *
 * ⚠️ Esta decisão é calculada com a MESMA função que a distribuição real chama
 * (`escolherResponsavel`), sem cópia e sem versão "de tela". Um simulador que
 * reimplementasse a regra mostraria o que deveria acontecer, não o que
 * acontece — e a divergência só apareceria no lead perdido.
 */
export type DecisaoDoMotor =
  | { roteia: true; paraUserId: string; paraNome: string; regra: string; porque: string }
  | { roteia: false; regra: string; porque: string };

export interface LeadNoPreview {
  leadId: string;
  codigo: string | null;
  nome: string;
  esperandoDesde: string;
  /** `null` = a fonte não existe para este lead. NUNCA um valor plausível. */
  produto: string | null;
  regiao: string | null;
  valorCents: number | null;
  interesse: string | null;
  prioritario: boolean;
  atendidoPor: string;
  decisao: DecisaoDoMotor;
}

export interface LogDeDecisao {
  leadId: string;
  leadNome: string;
  quando: string;
  nota: string;
}

/**
 * ⭐ A CASCATA — o que aconteceria se a fila de agora fosse distribuída.
 *
 * Pura, e de propósito: é o que permite testar a decisão sem banco.
 *
 * Roda lead a lead e, a cada escolha, **soma 1 na carga do escolhido e carimba
 * o recebimento nele**. Sem isso o preview mostraria a mesma pessoa recebendo
 * os seis leads da fila, porque uma chamada isolada de `escolherResponsavel`
 * não sabe da anterior — e o gerente leria uma concentração que não existiria.
 */
export function simularCascata(
  modo: ModoDeDistribuicao,
  candidatos: CandidatoADistribuicao[],
  quantidade: number,
  agora: Date,
): DecisaoDoMotor[] {
  const estado = candidatos.map((c) => ({ ...c }));
  const nomePor = new Map(estado.map((c) => [c.userId, c.nome]));
  const saida: DecisaoDoMotor[] = [];

  for (let i = 0; i < quantidade; i += 1) {
    const escolha = escolherResponsavel(modo, estado, agora);

    if (!escolha.escolhido) {
      saida.push(
        escolha.motivo === "modoManual"
          ? {
              roteia: false,
              regra: "Manual (fila aberta)",
              porque:
                "a distribuição está em MANUAL — ninguém é atribuído sozinho; a fila fica aberta para quem puxar",
            }
          : { roteia: false, regra: "Disponibilidade e capacidade", porque: descreverInaptidao(escolha.detalhe) },
      );
      continue;
    }

    saida.push({
      roteia: true,
      paraUserId: escolha.userId,
      paraNome: nomePor.get(escolha.userId) ?? escolha.userId,
      regra: modo === "DISPONIBILIDADE" ? "Menor carga" : modo === "ESPECIALIDADE" ? "Especialidade" : "Round-robin",
      porque: escolha.porque,
    });

    const alvo = estado.find((c) => c.userId === escolha.userId);
    if (alvo) {
      alvo.carga += 1;
      alvo.ultimoRecebimentoEm = agora;
    }
  }

  return saida;
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
  /** Os leads REAIS que estão na fila agora, com a decisão que o motor tomaria. */
  preview: LeadNoPreview[];
  /** Por que o preview está vazio, quando está. */
  previewVazio: string | null;
  /** As decisões que o motor JÁ tomou, lidas do histórico. Nada é inventado. */
  logs: LogDeDecisao[];
  /** Por que não há log, quando não há. */
  logsVazio: string | null;
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

  const [config, candidatos, semResponsavel, comPrazo, filaCrua, logsCrus] = await Promise.all([
    db.sdrIaConfig.findUnique({ where: { slug: "ta" }, select: { distribuicao: true } }),
    lerCandidatos(db),
    db.siteLead.count({
      where: {
        atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] },
        stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
      },
    }),
    db.siteLead.count({ where: { slaVenceEm: { not: null } } }),
    // A FILA DE VERDADE. Os cartões do preview saem daqui e de lugar nenhum
    // mais: lead de exemplo escrito à mão viraria, no primeiro print, o número
    // que a operação passa a repetir.
    db.siteLead.findMany({
      where: {
        atendidoPor: { in: ["NINGUEM", "AGUARDANDO_HUMANO"] },
        stage: { notIn: ["GANHO", "PERDIDO", "NUTRICAO"] },
      },
      orderBy: [{ prioritario: "desc" }, { createdAt: "asc" }],
      take: 6,
      select: {
        id: true, codigo: true, nome: true, cidade: true, createdAt: true,
        prioritario: true, temperatura: true, score: true, atendidoPor: true,
        oportunidades: {
          orderBy: { criadoEm: "desc" },
          take: 1,
          select: { valorPotencialCents: true, produtoDeInteresse: true },
        },
      },
    }),
    // O log de decisão do desenho. Fonte: a linha que a PRÓPRIA distribuição
    // grava ao atribuir (`distribuicao.ts · distribuir`). Se ela nunca rodou,
    // a aba fica vazia dizendo isso — nunca com decisão de mentira.
    db.siteLeadInteraction.findMany({
      where: { actor: "distribuicao" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { leadId: true, createdAt: true, nota: true, lead: { select: { nome: true } } },
    }),
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
      pausadoAte: c.pausadoAte ? c.pausadoAte.toISOString() : null,
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

  // ── O PREVIEW ──────────────────────────────────────────────────────────────
  const decisoes = simularCascata(modo, candidatos, filaCrua.length, agora);

  const preview: LeadNoPreview[] = filaCrua.map((l, i) => {
    const op = l.oportunidades[0];
    return {
      leadId: l.id,
      codigo: l.codigo,
      nome: l.nome,
      esperandoDesde: l.createdAt.toISOString(),
      produto: op?.produtoDeInteresse ?? null,
      regiao: l.cidade,
      valorCents: op?.valorPotencialCents ?? null,
      interesse: l.temperatura ? `${l.temperatura}${l.score === null ? "" : ` · score ${l.score}`}` : null,
      prioritario: l.prioritario,
      atendidoPor: l.atendidoPor,
      decisao: decisoes[i]!,
    };
  });

  const previewVazio = preview.length
    ? null
    : "Nenhum lead está esperando dono agora. O preview mostra a fila REAL — sem fila, não há o que prever, e lead de exemplo inventado aqui viraria número repetido em reunião.";

  const logs: LogDeDecisao[] = logsCrus.map((l) => ({
    leadId: l.leadId,
    leadNome: l.lead.nome,
    quando: l.createdAt.toISOString(),
    nota: l.nota ?? "sem nota gravada",
  }));

  const logsVazio = logs.length
    ? null
    : "A distribuição automática nunca atribuiu um lead nesta base — não há uma decisão gravada para mostrar. O log só enche quando o motor sai do modo manual e roda.";

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
    preview,
    previewVazio,
    logs,
    logsVazio,
    regrasQueExistem: REGRAS_QUE_EXISTEM,
    previstasNaoConstruidas: PREVISTAS_NAO_CONSTRUIDAS,
    naoMedido,
  };
}
