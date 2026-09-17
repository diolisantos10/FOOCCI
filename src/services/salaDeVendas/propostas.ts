/**
 * A PROPOSTA — a porta que a tabela não tinha.
 *
 * ── O DEFEITO QUE ISTO FECHA (auditoria de 17/09/2026, R4) ──────────────────
 *
 * `LeadProposta` existe no banco desde sempre, completa: situação, plano, valor,
 * desconto, validade, quem criou. E era **lida em um único lugar**
 * (`painel.ts`), por ninguém escrita. Nenhuma rota, nenhuma tela e nenhum
 * serviço criava uma proposta.
 *
 * O efeito não é uma funcionalidade faltando: é uma **métrica nascendo falsa**.
 * "Receita em negociação" e "propostas aceitas" liam uma tabela vazia e
 * devolviam zero — e zero, ali, não queria dizer "não temos proposta em aberto",
 * queria dizer "ninguém consegue registrar uma". Régua verde no componente
 * errado, com o número saindo para o CEO.
 *
 * ── RETROFIT, NÃO SISTEMA NOVO ──────────────────────────────────────────────
 *
 * Nada aqui cria tabela. A proposta continua sendo `LeadProposta`; o catálogo
 * continua sendo `@/lib/billing/pricing` (via `precos.ts`); o motivo de perda
 * continua sendo `MotivoDePerda`, o MESMO catálogo do lead e da oportunidade; e
 * o estado da venda continua andando por `jornadaComercial.ts` — proposta
 * recusada não "arquiva conversa", ela PERDE a oportunidade com motivo.
 *
 * ── ⛔ O QUE ESTE ARQUIVO SE RECUSA A FAZER: CONCEDER DESCONTO ──────────────
 *
 * A tela de referência tem campo de cupom. Esta casa não tem alçada de desconto
 * — e isso não é omissão, é decisão registrada em `precos.ts`
 * (`RESPONDIDO_PELO_CHECKOUT.descontoAlemDaTabela`, decisão do CEO de
 * 25/08/2026): *"o checkout cobra a tabela publicada, e o único abatimento —
 * metade do primeiro mês — já vem embutido na primeira cobrança."*
 *
 * Então `descontoPct` da proposta é **derivado** do abatimento que o checkout já
 * aplica, nunca digitado. Pedir desconto extra é RECUSADO com a frase da
 * política, e a proposta não nasce. Um campo livre aqui seria um vendedor
 * prometendo um número que o cartão não vai cobrar — o defeito que `precos.ts`
 * inteiro existe para impedir.
 *
 * ── ⚠️ DUAS COLUNAS QUE FALTAM, E COMO SE VIVE SEM ELAS ─────────────────────
 *
 * `prisma/schema.prisma` não é tocado por esta frente. Duas consequências, ditas
 * em voz alta em vez de contornadas em silêncio:
 *
 *  1. **Não há `LeadProposta.oportunidadeId`.** O vínculo proposta ↔
 *     oportunidade é gravado na TRILHA (`EventoDaJornada`), com
 *     `chaveDeIdempotencia = "proposta:<id>:oportunidade"` — que é UNIQUE no
 *     banco. Isso dá busca exata nos dois sentidos e é append-only, mas é um
 *     índice emprestado: o lugar certo é uma coluna.
 *  2. **`SituacaoDaProposta` não tem `VISTA`.** "O cliente abriu" é registrado
 *     como `EM_NEGOCIACAO` + evento de trilha `proposta:<id>:vista`. O estado
 *     visível existe na trilha; o enum ainda não o conhece.
 */

import type { PrismaClient, Prisma, SituacaoDaProposta } from "@prisma/client";
import {
  PLAN_CYCLE_CENTS,
  firstChargeCents,
  firstMonthDiscountCents,
  monthlyEquivalentCents,
  PLAN_LABEL,
  CYCLE_LABEL,
  formatBRL,
  type PlanCode,
  type CycleCode,
} from "@/lib/billing/pricing";
import { RESPONDIDO_PELO_CHECKOUT } from "./precos";
import {
  registrarNaTrilha,
  moverOportunidade,
  type Autoria,
  type Recusa,
} from "./jornadaComercial";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Quantos dias uma proposta vale, quando ninguém disser outra coisa. */
export const VALIDADE_PADRAO_EM_DIAS = 7;

/**
 * O teto de desconto que um vendedor pode conceder: **zero**.
 *
 * Não é rigor: é o que a máquina faz. O checkout cria um `preapproval` com o
 * valor de `PLAN_CYCLE_CENTS`; não existe campo por onde outro número entre.
 * Escrever `10` aqui não daria 10% a ninguém — daria uma proposta dizendo um
 * valor e um cartão cobrando outro.
 */
export const LIMITE_DE_DESCONTO_PCT = 0;

/**
 * A máquina de estados da proposta, escrita como as outras desta casa.
 *
 * `EM_NEGOCIACAO` é o "vista" do desenho: o cliente abriu/respondeu e a conversa
 * está de pé. `ACEITA`, `RECUSADA` e `EXPIRADA` são terminais — uma proposta
 * expirada não volta a valer, faz-se outra.
 */
export const TRANSICOES_DA_PROPOSTA: Readonly<
  Record<SituacaoDaProposta, readonly SituacaoDaProposta[]>
> = {
  RASCUNHO: ["ENVIADA", "RECUSADA", "EXPIRADA"],
  ENVIADA: ["EM_NEGOCIACAO", "ACEITA", "RECUSADA", "EXPIRADA"],
  EM_NEGOCIACAO: ["ACEITA", "RECUSADA", "EXPIRADA"],
  ACEITA: [],
  RECUSADA: [],
  EXPIRADA: [],
};

export const SITUACOES_TERMINAIS_DA_PROPOSTA: readonly SituacaoDaProposta[] = [
  "ACEITA",
  "RECUSADA",
  "EXPIRADA",
];

export function validarMovimentoDaProposta(p: {
  de: SituacaoDaProposta;
  para: SituacaoDaProposta;
}): Recusa[] {
  if (p.de === p.para) return [];
  if (!TRANSICOES_DA_PROPOSTA[p.de].includes(p.para)) {
    return [
      {
        campo: "para",
        motivo: `proposta em ${p.de} não vai para ${p.para}`,
      },
    ];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO — planos, não eletrônicos
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemDoCatalogo {
  plano: PlanCode;
  ciclo: CycleCode;
  nome: string;
  nomeDoCiclo: string;
  /** O que sai do cartão a cada renovação, no ciclo cheio. Em CENTAVOS. */
  doCicloCents: number;
  /** Mensalidade equivalente — ninguém é cobrado neste valor. Em CENTAVOS. */
  equivalenteAoMesCents: number;
  /** O que sai na PRIMEIRA cobrança, com o meio mês já abatido. Em CENTAVOS. */
  primeiraCobrancaCents: number;
  /** Quanto foi abatido na primeira, em pontos percentuais do ciclo. */
  descontoDaPrimeiraPct: number;
  /** Os mesmos números, já em reais, para a tela e para o WhatsApp. */
  emReais: { doCiclo: string; equivalenteAoMes: string; primeiraCobranca: string };
}

/**
 * Quanto por cento a primeira cobrança abate do ciclo cheio — ARREDONDADO.
 *
 * `LeadProposta.descontoPct` é `Int`: não há onde guardar a fração. O número
 * exato em dinheiro continua sendo `primeiraCobrancaCents`, que é o que o
 * cartão cobra; este percentual é rótulo, nunca a conta.
 */
export function descontoDaPrimeiraPct(plano: PlanCode, ciclo: CycleCode): number {
  const cheio = PLAN_CYCLE_CENTS[plano][ciclo];
  if (cheio <= 0) return 0;
  return Math.round((firstMonthDiscountCents(plano, ciclo) / cheio) * 100);
}

/** O catálogo inteiro, derivado da fonte única. Nenhum número é digitado aqui. */
export function catalogoDePlanos(): ItemDoCatalogo[] {
  const planos: PlanCode[] = ["STARTER", "GROWTH", "PRO"];
  const ciclos: CycleCode[] = ["MENSAL", "TRIMESTRAL", "ANUAL"];
  return planos.flatMap((plano) =>
    ciclos.map((ciclo) => {
      const doCiclo = PLAN_CYCLE_CENTS[plano][ciclo];
      const primeira = firstChargeCents(plano, ciclo);
      const mes = monthlyEquivalentCents(plano, ciclo);
      return {
        plano,
        ciclo,
        nome: PLAN_LABEL[plano],
        nomeDoCiclo: CYCLE_LABEL[ciclo],
        doCicloCents: doCiclo,
        equivalenteAoMesCents: mes,
        primeiraCobrancaCents: primeira,
        descontoDaPrimeiraPct: descontoDaPrimeiraPct(plano, ciclo),
        emReais: {
          doCiclo: formatBRL(doCiclo),
          equivalenteAoMes: formatBRL(mes),
          primeiraCobranca: formatBRL(primeira),
        },
      };
    }),
  );
}

export function itemDoCatalogo(plano: PlanCode, ciclo: CycleCode): ItemDoCatalogo {
  const achado = catalogoDePlanos().find((i) => i.plano === plano && i.ciclo === ciclo);
  if (!achado) throw new Error(`plano/ciclo fora do catálogo: ${plano}/${ciclo}`);
  return achado;
}

// ─────────────────────────────────────────────────────────────────────────────
// O VÍNCULO COM A OPORTUNIDADE — a coluna que não existe, na trilha
// ─────────────────────────────────────────────────────────────────────────────

export function chaveDoVinculoDaProposta(propostaId: string): string {
  return `proposta:${propostaId}:oportunidade`;
}

/** A oportunidade desta proposta, ou `null` — nunca um palpite pelo lead. */
export async function oportunidadeDaProposta(
  db: Cliente,
  propostaId: string,
): Promise<string | null> {
  const evento = await db.eventoDaJornada.findUnique({
    where: { chaveDeIdempotencia: chaveDoVinculoDaProposta(propostaId) },
    select: { oportunidadeId: true },
  });
  return evento?.oportunidadeId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRIAR
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoDeProposta {
  oportunidadeId: string;
  plano: PlanCode;
  ciclo: CycleCode;
  /**
   * Desconto PEDIDO, em pontos percentuais. Qualquer valor acima de
   * `LIMITE_DE_DESCONTO_PCT` recusa a proposta inteira, com a frase da política.
   */
  descontoPedidoPct?: number | null;
  validadeEmDias?: number | null;
  condicoes?: string | null;
  autoria: Autoria;
  agora?: Date;
}

export type ResultadoDaProposta =
  | { ok: true; propostaId: string; criada: boolean; valorMensalCent: number }
  | { ok: false; causa: "oportunidadeNaoExiste" }
  /** A oportunidade não tem lead: não há com quem negociar nem onde gravar. */
  | { ok: false; causa: "semLead" }
  | { ok: false; causa: "oportunidadeFechada"; estagio: string }
  | { ok: false; causa: "recusado"; recusas: Recusa[] };

/**
 * Monta a proposta a partir de uma OPORTUNIDADE e grava em `LeadProposta`.
 *
 * ── Por que a oportunidade, e não o lead ────────────────────────────────────
 *
 * O documento pede *"produto → oferta → checkout → pagamento → pedido"*, e o que
 * é ganho ou perdido no fim é a OPORTUNIDADE. Uma proposta pendurada só no lead
 * não teria como fechar o ciclo: o pagamento não saberia o que ganhar.
 *
 * A linha, porém, mora em `LeadProposta`, que pende do `SiteLead` — então a
 * oportunidade precisa ter lead. Sem lead a criação é RECUSADA, e não
 * "silenciosamente pulada".
 *
 * ── O que ela também faz ────────────────────────────────────────────────────
 *
 * Empurra a oportunidade para `PROPOSTA` quando ela ainda está em
 * `QUALIFICACAO` — pela porta da jornada, com trilha. Uma proposta existindo com
 * a oportunidade em DESCOBERTA seria o funil mentindo.
 */
export async function criarProposta(
  db: Cliente,
  pedido: PedidoDeProposta,
): Promise<ResultadoDaProposta> {
  const desconto = pedido.descontoPedidoPct ?? 0;
  if (desconto > LIMITE_DE_DESCONTO_PCT) {
    return {
      ok: false,
      causa: "recusado",
      recusas: [{ campo: "descontoPedidoPct", motivo: RESPONDIDO_PELO_CHECKOUT.descontoAlemDaTabela }],
    };
  }

  const validade = pedido.validadeEmDias ?? VALIDADE_PADRAO_EM_DIAS;
  if (!Number.isInteger(validade) || validade < 1 || validade > 90) {
    return {
      ok: false,
      causa: "recusado",
      recusas: [{ campo: "validadeEmDias", motivo: "a validade vai de 1 a 90 dias" }],
    };
  }

  const oportunidade = await db.oportunidade.findUnique({
    where: { id: pedido.oportunidadeId },
    select: { id: true, leadId: true, estagio: true, empresaId: true },
  });
  if (!oportunidade) return { ok: false, causa: "oportunidadeNaoExiste" };
  if (oportunidade.estagio === "GANHA" || oportunidade.estagio === "PERDIDA") {
    return { ok: false, causa: "oportunidadeFechada", estagio: oportunidade.estagio };
  }
  if (!oportunidade.leadId) return { ok: false, causa: "semLead" };

  const item = itemDoCatalogo(pedido.plano, pedido.ciclo);
  const agora = pedido.agora ?? new Date();
  const validaAte = new Date(agora.getTime() + validade * 24 * 60 * 60 * 1000);

  const proposta = await db.leadProposta.create({
    data: {
      leadId: oportunidade.leadId,
      situacao: "RASCUNHO",
      // O plano no vocabulário do banco + o ciclo: é o par que o checkout precisa
      // para criar a assinatura, e é o que a tela imprime.
      plano: `${pedido.plano}/${pedido.ciclo}`,
      // ⚠️ O que a proposta registra é a MENSALIDADE EQUIVALENTE, que é o número
      // que o dono do restaurante compara. O que sai do cartão está em
      // `condicoes` e no link, e os dois vêm da mesma fonte.
      valorMensalCent: item.equivalenteAoMesCents,
      descontoPct: item.descontoDaPrimeiraPct,
      condicoes: montarCondicoes(item, pedido.condicoes),
      validaAte,
      criadaPorId: pedido.autoria.userId ?? null,
    },
    select: { id: true },
  });

  // ⭐ O VÍNCULO. Sem coluna, ele vive na trilha — e a chave única do banco é o
  // que impede dois vínculos para a mesma proposta.
  await registrarNaTrilha(db, {
    entidade: "OPORTUNIDADE",
    entidadeId: oportunidade.id,
    oportunidadeId: oportunidade.id,
    empresaId: oportunidade.empresaId,
    leadId: oportunidade.leadId,
    tipo: "VINCULO",
    autoria: pedido.autoria,
    nota: `Proposta ${proposta.id} — ${item.nome} ${item.nomeDoCiclo}, ${item.emReais.equivalenteAoMes}/mês.`,
    fonte: "proposta",
    chaveDeIdempotencia: chaveDoVinculoDaProposta(proposta.id),
  });

  // A oportunidade acompanha o fato. Pela porta da jornada, nunca por update solto.
  if (oportunidade.estagio === "QUALIFICACAO") {
    await moverOportunidade(db, {
      oportunidadeId: oportunidade.id,
      de: "QUALIFICACAO",
      para: "PROPOSTA",
      autoria: pedido.autoria,
      motivo: `Proposta ${proposta.id} montada.`,
      agora,
    });
  }

  return { ok: true, propostaId: proposta.id, criada: true, valorMensalCent: item.equivalenteAoMesCents };
}

/**
 * As condições, em texto — o que o cliente lê e o que o cartão cobra, juntos.
 *
 * Os dois números moram na mesma frase de propósito: separados, o vendedor fala
 * do "R$ X por mês" e o cliente leva um susto na fatura do primeiro ciclo.
 */
export function montarCondicoes(item: ItemDoCatalogo, extra?: string | null): string {
  const linhas = [
    `Plano ${item.nome}, cobrança ${item.nomeDoCiclo.toLowerCase()}.`,
    `Primeira cobrança: ${item.emReais.primeiraCobranca} (metade do primeiro mês já abatida).`,
    `Renovações: ${item.emReais.doCiclo} por ciclo — equivalente a ${item.emReais.equivalenteAoMes}/mês.`,
    "Pagamento: cartão de crédito, em assinatura recorrente no Mercado Pago.",
  ];
  const limpo = extra?.trim();
  if (limpo) linhas.push(limpo);
  return linhas.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVER — cada degrau na trilha
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDoMovimento =
  | { ok: true; mudou: boolean }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "recusado"; recusas: Recusa[] }
  | { ok: false; causa: "situacaoMudou"; atual: SituacaoDaProposta };

/**
 * A única porta por onde `LeadProposta.situacao` muda.
 *
 * Mesma doutrina de `jornadaComercial.moverOportunidade`: a condição de situação
 * vai DENTRO do `updateMany`, então duas chamadas simultâneas não movem duas
 * vezes, e a trilha é gravada na mesma operação.
 */
export async function moverProposta(
  db: Cliente,
  params: {
    propostaId: string;
    de: SituacaoDaProposta;
    para: SituacaoDaProposta;
    autoria: Autoria;
    motivo?: string | null;
    nota?: string | null;
    /** Carimbos da linha, quando o degrau tem um. */
    enviadaEm?: Date | null;
    respondidaEm?: Date | null;
    agora?: Date;
  },
): Promise<ResultadoDoMovimento> {
  const recusas = validarMovimentoDaProposta(params);
  if (recusas.length) return { ok: false, causa: "recusado", recusas };
  if (params.de === params.para) return { ok: true, mudou: false };

  const agora = params.agora ?? new Date();

  const alterados = await db.leadProposta.updateMany({
    where: { id: params.propostaId, situacao: params.de },
    data: {
      situacao: params.para,
      ...(params.enviadaEm ? { enviadaEm: params.enviadaEm } : {}),
      ...(params.respondidaEm ? { respondidaEm: params.respondidaEm } : {}),
    },
  });

  if (alterados.count === 1) {
    const oportunidadeId = await oportunidadeDaProposta(db, params.propostaId);
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: oportunidadeId ?? params.propostaId,
      oportunidadeId,
      tipo: "MUDANCA_DE_ESTAGIO",
      autoria: params.autoria,
      deEstagio: `PROPOSTA:${params.de}`,
      paraEstagio: `PROPOSTA:${params.para}`,
      motivo: params.motivo ?? null,
      nota: params.nota ?? null,
      fonte: "proposta",
      chaveDeIdempotencia: `proposta:${params.propostaId}:${params.de}>${params.para}`,
    });
    return { ok: true, mudou: true };
  }

  const atual = await db.leadProposta.findUnique({
    where: { id: params.propostaId },
    select: { situacao: true },
  });
  if (!atual) return { ok: false, causa: "naoExiste" };
  if (atual.situacao === params.para) return { ok: true, mudou: false };
  return { ok: false, causa: "situacaoMudou", atual: atual.situacao };
}

/** O cliente abriu / respondeu. Ver a ressalva do cabeçalho: não há `VISTA`. */
export async function marcarPropostaVista(
  db: Cliente,
  params: { propostaId: string; autoria: Autoria; agora?: Date },
): Promise<ResultadoDoMovimento> {
  const agora = params.agora ?? new Date();
  return moverProposta(db, {
    propostaId: params.propostaId,
    de: "ENVIADA",
    para: "EM_NEGOCIACAO",
    autoria: params.autoria,
    motivo: "o cliente viu a proposta",
    respondidaEm: agora,
    agora,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PERDER — com motivo do catálogo, nunca "arquivar"
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDaPerda =
  | { ok: true; propostaId: string; oportunidadePerdida: boolean }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "recusado"; recusas: Recusa[] }
  | { ok: false; causa: "situacaoMudou"; atual: SituacaoDaProposta };

/**
 * ⛔ A RECUSA — e por que ela não pode ser só uma mudança de situação.
 *
 * O documento é explícito: *"CRM = GANHO ou CRM = PERDIDO + motivo. Nunca
 * simplesmente arquivar conversa."* Uma proposta `RECUSADA` com a oportunidade
 * pendurada em `PROPOSTA` para sempre é exatamente o arquivamento silencioso com
 * outro nome — o funil segue mostrando receita que já morreu.
 *
 * Então recusar a proposta PERDE a oportunidade, pelo serviço da jornada, com
 * motivo do catálogo `MotivoDePerda` — o mesmo do lead, e não um segundo.
 * `motivoPerdaId` é obrigatório: `validarMovimentoDaOportunidade` recusa o
 * movimento sem ele, e essa recusa sobe até quem chamou.
 */
export async function recusarProposta(
  db: Cliente,
  params: {
    propostaId: string;
    motivoPerdaId: string;
    motivoPerdaDetalhe?: string | null;
    autoria: Autoria;
    agora?: Date;
  },
): Promise<ResultadoDaPerda> {
  const agora = params.agora ?? new Date();

  const proposta = await db.leadProposta.findUnique({
    where: { id: params.propostaId },
    select: { id: true, situacao: true },
  });
  if (!proposta) return { ok: false, causa: "naoExiste" };

  if (!params.motivoPerdaId) {
    return {
      ok: false,
      causa: "recusado",
      recusas: [{ campo: "motivoPerdaId", motivo: "perder exige motivo do catálogo — nunca arquivar" }],
    };
  }

  const motivo = await db.motivoDePerda.findUnique({
    where: { id: params.motivoPerdaId },
    select: { id: true, exigeDetalhe: true, ativo: true },
  });
  if (!motivo || !motivo.ativo) {
    return {
      ok: false,
      causa: "recusado",
      recusas: [{ campo: "motivoPerdaId", motivo: "motivo inexistente ou desativado" }],
    };
  }
  if (motivo.exigeDetalhe && !params.motivoPerdaDetalhe?.trim()) {
    return {
      ok: false,
      causa: "recusado",
      recusas: [{ campo: "motivoPerdaDetalhe", motivo: "este motivo exige um detalhe escrito" }],
    };
  }

  const movimento = await moverProposta(db, {
    propostaId: proposta.id,
    de: proposta.situacao,
    para: "RECUSADA",
    autoria: params.autoria,
    motivo: params.motivoPerdaDetalhe ?? null,
    respondidaEm: agora,
    agora,
  });
  if (!movimento.ok) return movimento;

  const perdida = await perderAOportunidade(db, {
    propostaId: proposta.id,
    motivoPerdaId: params.motivoPerdaId,
    motivoPerdaDetalhe: params.motivoPerdaDetalhe ?? null,
    autoria: params.autoria,
    agora,
  });

  return { ok: true, propostaId: proposta.id, oportunidadePerdida: perdida };
}

/**
 * Leva a oportunidade da proposta a PERDIDA. Devolve `false` quando não havia o
 * que perder (sem vínculo, ou já fechada) — e `false` aqui é informação, não
 * falha: uma oportunidade já ganha não vira perdida porque uma proposta velha
 * expirou.
 */
async function perderAOportunidade(
  db: Cliente,
  params: {
    propostaId: string;
    motivoPerdaId: string;
    motivoPerdaDetalhe: string | null;
    autoria: Autoria;
    agora: Date;
  },
): Promise<boolean> {
  const oportunidadeId = await oportunidadeDaProposta(db, params.propostaId);
  if (!oportunidadeId) return false;

  const oportunidade = await db.oportunidade.findUnique({
    where: { id: oportunidadeId },
    select: { estagio: true },
  });
  if (!oportunidade) return false;
  if (oportunidade.estagio === "GANHA" || oportunidade.estagio === "PERDIDA") return false;

  const r = await moverOportunidade(db, {
    oportunidadeId,
    de: oportunidade.estagio,
    para: "PERDIDA",
    autoria: params.autoria,
    motivoPerdaId: params.motivoPerdaId,
    motivoPerdaDetalhe: params.motivoPerdaDetalhe,
    agora: params.agora,
  });
  return r.ok && r.mudou;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRAR
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoDaVarredura {
  examinadas: number;
  expiradas: number;
  oportunidadesPerdidas: number;
  /** Propostas vencidas que NÃO expiraram, com o porquê. Nunca some em silêncio. */
  naoExpiradas: Array<{ propostaId: string; motivo: string }>;
}

/**
 * A validade venceu → a proposta EXPIRA e a oportunidade é PERDIDA com motivo.
 *
 * O motivo vem do catálogo pelo slug `sem-resposta` ("Parou de responder"), que
 * já existe em `semear.ts`. Se ele não estiver semeado, a proposta expira e a
 * oportunidade **fica de pé**, com o motivo listado em `naoExpiradas` — porque
 * perder sem motivo é o arquivamento que o documento proíbe, e inventar um
 * motivo seria pior que não perder.
 */
export const SLUG_DA_PERDA_POR_EXPIRACAO = "sem-resposta";

export async function expirarPropostasVencidas(
  db: Cliente,
  params: { autoria: Autoria; agora?: Date; limite?: number },
): Promise<ResultadoDaVarredura> {
  const agora = params.agora ?? new Date();

  const vencidas = await db.leadProposta.findMany({
    where: {
      situacao: { in: ["RASCUNHO", "ENVIADA", "EM_NEGOCIACAO"] },
      validaAte: { lt: agora },
    },
    select: { id: true, situacao: true },
    take: params.limite ?? 200,
  });

  const motivo = await db.motivoDePerda.findUnique({
    where: { slug: SLUG_DA_PERDA_POR_EXPIRACAO },
    select: { id: true, ativo: true },
  });

  const resultado: ResultadoDaVarredura = {
    examinadas: vencidas.length,
    expiradas: 0,
    oportunidadesPerdidas: 0,
    naoExpiradas: [],
  };

  for (const proposta of vencidas) {
    const movimento = await moverProposta(db, {
      propostaId: proposta.id,
      de: proposta.situacao,
      para: "EXPIRADA",
      autoria: params.autoria,
      motivo: "a validade da proposta venceu",
      agora,
    });
    if (!movimento.ok || !movimento.mudou) {
      resultado.naoExpiradas.push({
        propostaId: proposta.id,
        motivo: movimento.ok ? "outra chamada já a moveu" : movimento.causa,
      });
      continue;
    }
    resultado.expiradas += 1;

    if (!motivo || !motivo.ativo) {
      resultado.naoExpiradas.push({
        propostaId: proposta.id,
        motivo:
          `expirou, mas a oportunidade NÃO foi perdida: o motivo "${SLUG_DA_PERDA_POR_EXPIRACAO}" ` +
          "não está no catálogo. Rode o semeador — perder sem motivo é arquivar.",
      });
      continue;
    }

    const perdeu = await perderAOportunidade(db, {
      propostaId: proposta.id,
      motivoPerdaId: motivo.id,
      motivoPerdaDetalhe: "A proposta venceu sem resposta.",
      autoria: params.autoria,
      agora,
    });
    if (perdeu) resultado.oportunidadesPerdidas += 1;
  }

  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// LER
// ─────────────────────────────────────────────────────────────────────────────

export interface PropostaNaTela {
  id: string;
  situacao: SituacaoDaProposta;
  plano: string | null;
  valorMensalCent: number | null;
  descontoPct: number | null;
  condicoes: string | null;
  enviadaEm: Date | null;
  respondidaEm: Date | null;
  validaAte: Date | null;
  criadaEm: Date;
  /** `true` quando a validade já passou e ninguém varreu ainda. */
  vencida: boolean;
}

export async function lerPropostasDoLead(
  db: Cliente,
  params: { leadId: string; agora?: Date },
): Promise<PropostaNaTela[]> {
  const agora = params.agora ?? new Date();
  const linhas = await db.leadProposta.findMany({
    where: { leadId: params.leadId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      situacao: true,
      plano: true,
      valorMensalCent: true,
      descontoPct: true,
      condicoes: true,
      enviadaEm: true,
      respondidaEm: true,
      validaAte: true,
      createdAt: true,
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    situacao: l.situacao,
    plano: l.plano,
    valorMensalCent: l.valorMensalCent,
    descontoPct: l.descontoPct,
    condicoes: l.condicoes,
    enviadaEm: l.enviadaEm,
    respondidaEm: l.respondidaEm,
    validaAte: l.validaAte,
    criadaEm: l.createdAt,
    vencida:
      !SITUACOES_TERMINAIS_DA_PROPOSTA.includes(l.situacao) &&
      l.validaAte !== null &&
      l.validaAte.getTime() < agora.getTime(),
  }));
}
