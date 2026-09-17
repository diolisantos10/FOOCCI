/**
 * PÓS-VENDA — *"Lead NÃO volta para o início. Ele se torna CLIENTE."*
 *
 * ── O QUE FALTAVA ───────────────────────────────────────────────────────────
 *
 * B1 fez o cliente NASCER: `ganharOportunidade()` cria a linha em
 * `clientes_comerciais` e grava a criação na trilha. E parava aí. O documento
 * pede o que vem depois, e nomeia: *"ativação → acompanhamento → suporte →
 * satisfação/NPS → recompra → cross-sell → upsell → reativação"*.
 *
 * Um cliente recém-ganho sem jornada aberta é a conta que ninguém ligou e
 * ninguém percebeu que não ligou. O próprio schema de B1 escreve isso em cima
 * de `ativadoEm`: *"`null` = comprou e ainda não ligou — que é o estado onde o
 * churn nasce"*.
 *
 * ── SINAL DE CHURN COM REGRA ESCRITA, NÃO ACHISMO ───────────────────────────
 *
 * `riscoDeChurn` é um número anulável. Preencher esse número com intuição seria
 * pior que deixá-lo vazio: vazio a tela escreve "não medido" e alguém vai olhar;
 * chutado, ele vira verdade. Por isso o risco aqui é a **soma de sinais
 * nomeados**, cada um com peso declarado, e o motivo sai por escrito com os
 * sinais que pesaram. Sem nenhum sinal observável, o risco é `null`.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { SituacaoDoCliente, EstagioDaOportunidade } from "@prisma/client";
import {
  ganharOportunidade,
  moverCliente,
  registrarNaTrilha,
  type Autoria,
  type ResultadoDoGanho,
} from "../jornadaComercial";

type Cliente = PrismaClient | Prisma.TransactionClient;

const DIA = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// A JORNADA DO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

/** Os marcos que o documento nomeia, na ordem em que acontecem. */
export type MarcoDoPosVenda =
  | "ATIVACAO"
  | "ACOMPANHAMENTO"
  | "SUPORTE"
  | "NPS"
  | "RECOMPRA"
  | "CROSS_SELL"
  | "UPSELL"
  | "REATIVACAO";

export const REGUA_DO_POS_VENDA = {
  /** Comprou e não ligou dentro disto: a ativação virou pendência. */
  diasParaAtivar: 7,
  /** Primeiro acompanhamento depois de ativar. */
  diasParaPrimeiroAcompanhamento: 15,
  /** NPS não se pergunta a quem acabou de chegar. */
  diasAtivoParaNps: 30,
  /** Sem compra nova depois disto, a recompra entra em pauta. */
  diasSemCompraParaRecompra: 120,
} as const;

/** A ficha da conta, reduzida ao que decide ação de pós-venda. */
export interface FichaDoCliente {
  id: string;
  situacao: SituacaoDoCliente;
  ganhoEm: Date;
  ativadoEm: Date | null;
  passosDeAtivacao: string[];
  /** 0 a 100. `null` = não medida. */
  saude: number | null;
  saudeEm: Date | null;
  /** 0 a 10. `null` = não respondeu. */
  nps: number | null;
  npsEm: Date | null;
  riscoDeChurn: number | null;
  motivoDoRisco: string | null;
  ultimaCompraEm: Date | null;
  recompras: number;
  upsells: number;
  receitaTotalCents: number;
}

export interface AcaoDePosVenda {
  marco: MarcoDoPosVenda;
  porque: string;
  /** Quando ela deveria acontecer. */
  venceEm: Date;
}

/**
 * O que esta conta precisa agora. Função **pura**.
 *
 * Devolve lista e não um único item de propósito: uma conta pode ao mesmo tempo
 * estar sem ativar e sem NPS, e escolher uma só esconderia a outra até a
 * próxima rodada.
 */
export function proximosPassosDoCliente(c: FichaDoCliente, agora: Date): AcaoDePosVenda[] {
  const acoes: AcaoDePosVenda[] = [];

  if (c.situacao === "CANCELADO") return acoes;

  if (!c.ativadoEm) {
    const dias = Math.floor((agora.getTime() - c.ganhoEm.getTime()) / DIA);
    acoes.push({
      marco: "ATIVACAO",
      porque:
        dias >= REGUA_DO_POS_VENDA.diasParaAtivar
          ? `comprou há ${dias} dias e ainda não ligou — é aqui que o churn nasce`
          : `comprou há ${dias} dia(s) e a ativação está em andamento`,
      venceEm: new Date(c.ganhoEm.getTime() + REGUA_DO_POS_VENDA.diasParaAtivar * DIA),
    });
    // Sem ativar, nada depois da ativação faz sentido: não se pergunta NPS de
    // um produto que a pessoa ainda não usou.
    return acoes;
  }

  const diasAtivo = Math.floor((agora.getTime() - c.ativadoEm.getTime()) / DIA);

  if (diasAtivo >= REGUA_DO_POS_VENDA.diasParaPrimeiroAcompanhamento && c.saude === null) {
    acoes.push({
      marco: "ACOMPANHAMENTO",
      porque: `ativo há ${diasAtivo} dias e a saúde da conta nunca foi medida`,
      venceEm: new Date(c.ativadoEm.getTime() + REGUA_DO_POS_VENDA.diasParaPrimeiroAcompanhamento * DIA),
    });
  }

  if (diasAtivo >= REGUA_DO_POS_VENDA.diasAtivoParaNps && c.nps === null) {
    acoes.push({
      marco: "NPS",
      porque: `ativo há ${diasAtivo} dias e nunca respondeu à pesquisa de satisfação`,
      venceEm: new Date(c.ativadoEm.getTime() + REGUA_DO_POS_VENDA.diasAtivoParaNps * DIA),
    });
  }

  // Detrator tem suporte, não oferta. Vender mais para quem está insatisfeito é
  // o jeito mais caro de descobrir que ele estava insatisfeito.
  if (c.nps !== null && c.nps <= 6) {
    acoes.push({
      marco: "SUPORTE",
      porque: `NPS ${c.nps} — detrator recebe socorro antes de qualquer oferta`,
      venceEm: agora,
    });
  }

  const desdeUltimaCompra = c.ultimaCompraEm ?? c.ativadoEm;
  const diasSemComprar = Math.floor((agora.getTime() - desdeUltimaCompra.getTime()) / DIA);
  if (diasSemComprar >= REGUA_DO_POS_VENDA.diasSemCompraParaRecompra && c.situacao === "ATIVO") {
    acoes.push({
      marco: "RECOMPRA",
      porque: `${diasSemComprar} dias sem compra nova nesta conta`,
      venceEm: new Date(desdeUltimaCompra.getTime() + REGUA_DO_POS_VENDA.diasSemCompraParaRecompra * DIA),
    });
  }

  if (c.situacao === "INATIVO") {
    acoes.push({
      marco: "REATIVACAO",
      porque: "a conta parou de usar sem cancelar — ela ainda existe e é mais barata de recuperar do que de substituir",
      venceEm: agora,
    });
  }

  return acoes;
}

// ─────────────────────────────────────────────────────────────────────────────
// O SINAL DE CHURN — soma de sinais nomeados, nunca intuição
// ─────────────────────────────────────────────────────────────────────────────

export interface SinalDeChurn {
  codigo: string;
  peso: number;
  descricao: string;
  observar: (c: FichaDoCliente, agora: Date) => boolean;
}

export const REGUA_DE_CHURN = {
  /** A partir deste risco, a conta vai para `EM_RISCO`. */
  limiarDeRisco: 50,
  /** Saúde abaixo disto é sinal. */
  saudeBaixa: 50,
  /** NPS até aqui é detrator. */
  npsDetrator: 6,
  /** Dias sem compra que já contam como sinal. */
  diasSemCompra: 180,
  /** Dias comprado sem ativar que já contam como sinal. */
  diasSemAtivar: 14,
} as const;

/**
 * Os sinais. Cada um com peso declarado — e a soma é limitada a 100.
 *
 * ⚠️ Um sinal que depende de um dado NÃO MEDIDO nunca dispara. Saúde `null` não
 * é saúde ruim; NPS `null` não é detrator. Tratar ausência como sinal negativo
 * encheria a fila de risco com contas que ninguém mediu, e a fila de risco de
 * verdade sumiria dentro dela.
 */
export const SINAIS_DE_CHURN: readonly SinalDeChurn[] = [
  {
    codigo: "nao-ativou",
    // Peso igual ao limiar, e sozinho: o schema de B1 escreve que é aqui que o
    // churn nasce. Um sinal que o documento chama de origem do problema e que
    // precisa de um segundo sinal para acender é um alarme que toca tarde.
    peso: 50,
    descricao: "comprou e não ligou o produto",
    observar: (c, agora) =>
      !c.ativadoEm && agora.getTime() - c.ganhoEm.getTime() >= REGUA_DE_CHURN.diasSemAtivar * DIA,
  },
  {
    codigo: "saude-baixa",
    peso: 30,
    descricao: "saúde medida abaixo do piso",
    observar: (c) => c.saude !== null && c.saude < REGUA_DE_CHURN.saudeBaixa,
  },
  {
    codigo: "detrator",
    peso: 30,
    descricao: "respondeu o NPS como detrator",
    observar: (c) => c.nps !== null && c.nps <= REGUA_DE_CHURN.npsDetrator,
  },
  {
    codigo: "parou-de-comprar",
    peso: 20,
    descricao: "sem compra nova há mais de meio ano",
    observar: (c, agora) => {
      const ref = c.ultimaCompraEm ?? c.ativadoEm;
      return !!ref && agora.getTime() - ref.getTime() >= REGUA_DE_CHURN.diasSemCompra * DIA;
    },
  },
  {
    codigo: "parou-de-usar",
    peso: 40,
    descricao: "a conta está marcada como inativa",
    observar: (c) => c.situacao === "INATIVO",
  },
];

export interface LeituraDeRisco {
  /** 0 a 100, ou `null` quando nenhum sinal pôde ser observado. */
  risco: number | null;
  motivo: string;
  sinais: string[];
}

/**
 * Avalia o risco de churn. Função pura, e a saída explica o número.
 *
 * `risco === null` quando nenhum sinal disparou **e** nada foi medido — é
 * diferente de `risco === 0`, que significa "olhei e está tudo bem".
 */
export function avaliarRiscoDeChurn(c: FichaDoCliente, agora: Date): LeituraDeRisco {
  if (c.situacao === "CANCELADO") {
    return { risco: 100, motivo: "a conta já foi cancelada", sinais: ["cancelada"] };
  }

  const disparados = SINAIS_DE_CHURN.filter((s) => s.observar(c, agora));

  if (!disparados.length) {
    // Nada disparou. Isso só vale como "sem risco" se houve o que medir.
    const houveMedicao = c.saude !== null || c.nps !== null || c.ativadoEm !== null;
    if (!houveMedicao) {
      return {
        risco: null,
        motivo: "nenhum sinal observável nesta conta — risco não medido, e não medido não é zero",
        sinais: [],
      };
    }
    return { risco: 0, motivo: "nenhum sinal de churn observado nesta conta", sinais: [] };
  }

  const soma = Math.min(100, disparados.reduce((t, s) => t + s.peso, 0));
  return {
    risco: soma,
    motivo: `risco ${soma}: ${disparados.map((s) => s.descricao).join("; ")}`,
    sinais: disparados.map((s) => s.codigo),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ABRIR A JORNADA — o que acontece no instante do ganho
// ─────────────────────────────────────────────────────────────────────────────

export function chaveDoMarco(clienteId: string, marco: MarcoDoPosVenda): string {
  return `cliente:posvenda:${clienteId}:${marco}`;
}

/**
 * Abre a jornada de pós-venda de um cliente recém-ganho.
 *
 * Idempotente pela chave de `EventoDaJornada`: chamar duas vezes (reprocesso,
 * webhook reentregue, cron duplicado) não grava a abertura duas vezes.
 */
export async function abrirJornadaDoCliente(
  db: Cliente,
  params: { clienteId: string; empresaId?: string | null; oportunidadeId?: string | null; autoria: Autoria },
): Promise<{ abriu: boolean }> {
  const abriu = await registrarNaTrilha(db, {
    entidade: "CLIENTE",
    entidadeId: params.clienteId,
    clienteId: params.clienteId,
    empresaId: params.empresaId ?? null,
    oportunidadeId: params.oportunidadeId ?? null,
    tipo: "NOTA",
    autoria: params.autoria,
    motivo: "ATIVACAO",
    nota:
      "jornada de pós-venda aberta: ativação → acompanhamento → suporte → NPS → recompra → cross-sell → upsell → reativação",
    fonte: "crm-ia",
    chaveDeIdempotencia: chaveDoMarco(params.clienteId, "ATIVACAO"),
  });

  return { abriu };
}

export type ResultadoDoGanhoComPosVenda =
  | (Extract<ResultadoDoGanho, { ok: true }> & { jornadaAberta: boolean })
  | Exclude<ResultadoDoGanho, { ok: true }>;

/**
 * ⭐ GANHAR E ABRIR O PÓS-VENDA, numa chamada só.
 *
 * Envolve `ganharOportunidade()` de B1 em vez de reimplementá-la: a criação do
 * cliente, a validação da transição e a trilha continuam sendo dela. O que se
 * acrescenta é o passo seguinte, que é justamente o que faltava — e acrescentar
 * aqui garante que ninguém ganhe uma oportunidade e esqueça de abrir a jornada,
 * porque não existe caminho que faça uma sem a outra.
 */
export async function ganharEAbrirPosVenda(
  db: Cliente,
  params: {
    oportunidadeId: string;
    de: EstagioDaOportunidade;
    autoria: Autoria;
    empresaId?: string | null;
    restaurantId?: string | null;
    receitaInicialCents?: number | null;
    motivo?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDoGanhoComPosVenda> {
  const ganho = await ganharOportunidade(db, params);
  if (!ganho.ok) return ganho;

  const { abriu } = await abrirJornadaDoCliente(db, {
    clienteId: ganho.clienteId,
    empresaId: params.empresaId ?? null,
    oportunidadeId: params.oportunidadeId,
    autoria: params.autoria,
  });

  return { ...ganho, jornadaAberta: abriu };
}

/**
 * Aplica o risco medido à conta: grava o número e o motivo, e move para
 * `EM_RISCO` quando passa do limiar.
 *
 * Risco `null` **não escreve nada**. Gravar "não medido" como zero mandaria a
 * conta para a lista de contas saudáveis sem ninguém ter olhado para ela.
 */
export async function aplicarRiscoDeChurn(
  db: Cliente,
  params: { cliente: FichaDoCliente; autoria: Autoria; agora?: Date },
): Promise<{ escreveu: boolean; moveu: boolean; leitura: LeituraDeRisco }> {
  const agora = params.agora ?? new Date();
  const leitura = avaliarRiscoDeChurn(params.cliente, agora);

  if (leitura.risco === null) return { escreveu: false, moveu: false, leitura };

  await db.cliente.update({
    where: { id: params.cliente.id },
    data: { riscoDeChurn: leitura.risco, motivoDoRisco: leitura.motivo },
  });

  let moveu = false;
  if (
    leitura.risco >= REGUA_DE_CHURN.limiarDeRisco &&
    (params.cliente.situacao === "ATIVO" || params.cliente.situacao === "EM_ATIVACAO")
  ) {
    const r = await moverCliente(db, {
      clienteId: params.cliente.id,
      de: params.cliente.situacao,
      para: "EM_RISCO",
      autoria: params.autoria,
      motivo: leitura.motivo,
      agora,
    });
    moveu = r.ok && r.mudou;
  }

  return { escreveu: true, moveu, leitura };
}
