/**
 * A JORNADA POR ESTÁGIOS — em quantas campanhas do FLUXO PRINCIPAL cada cliente
 * cai ao mesmo tempo.
 *
 * ⚠️ CRM **do restaurante** (o restaurante falando com os clientes DELE).
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * O CEO desenhou o CRM como uma ESCADA: cada campanha é um estágio, e o cliente
 * só sobe um degrau quando cumpre a condição do anterior. Se o desenho estivesse
 * de pé, cada cliente estaria em UM estágio do fluxo principal por vez, e a soma
 * das audiências não passaria do tamanho da base.
 *
 * Medido em 18/09/2026: base de 5.479 clientes e audiências declaradas somando
 * ~17.800. Parte disso é legítima — "Siga nas redes" é gatilho independente e
 * mira a base inteira por desenho. O RESTO precisava ser medido, e não havia
 * número nenhum que respondesse. Este módulo é esse número.
 *
 * ── O QUE ELE NÃO FAZ ───────────────────────────────────────────────────────
 * Não envia, não agenda, não escreve, não pausa campanha. Uma consulta de
 * leitura e aritmética em memória. O classificador é uma FUNÇÃO PURA, para que
 * o teste prove a regra sem banco.
 *
 * ── A REGRA DE OURO DESTE ARQUIVO ───────────────────────────────────────────
 * Os predicados abaixo são um ESPELHO de `CrmAudienceService`. Se lá mudar, aqui
 * muda junto — medir por um segundo critério seria inventar uma segunda verdade,
 * exatamente o erro que este raio-x existe para não cometer.
 */

import type { PrismaClient } from "@prisma/client";
import type { SegmentConfig } from "@/lib/crm-segments";
import { DEFAULT_SEGMENT_CONFIG, buildCutoffs } from "@/lib/crm-segments";

/** Cliente Prisma, ou qualquer coisa com a mesma forma (o teste injeta um duplo). */
export type LeitorDeClientes = Pick<PrismaClient, "customer">;

/**
 * Os estágios do FLUXO PRINCIPAL — a escada do desenho do CEO.
 *
 * Os GATILHOS INDEPENDENTES ficam DE FORA desta conta de propósito: aniversário,
 * "siga nas redes" e o almoço personalizado rodam por fora do fluxo e, por
 * desenho, PODEM coexistir com qualquer estágio. Contá-los aqui acusaria
 * conflito onde o CEO já disse que não há — e o número sairia errado para cima.
 */
export const ESTAGIOS_DO_FLUXO_PRINCIPAL = [
  "cadastro-sem-compra",  // Converter 1º pedido
  "segunda-compra",       // Bem-vindo / 2ª compra
  "quente-esfriando",     // Cliente quente esfriando
  "reativar-mornos",      // Cliente morno
  "recuperar-frios",      // Cliente frio
  "recuperar-perdidos",   // Cliente perdido
  "indique-amigo",        // Indique um amigo
] as const;

export type EstagioDoFluxo = (typeof ESTAGIOS_DO_FLUXO_PRINCIPAL)[number];

/** Gatilhos independentes — declarados para que fique EXPLÍCITO que saíram da conta. */
export const GATILHOS_INDEPENDENTES = ["aniversariantes", "siga-redes", "almoco"] as const;

/** Os campos do cliente de que o classificador precisa — e só eles. */
export interface ClienteParaClassificar {
  id: string;
  totalOrders: number;
  importedOrderCount: number | null;
  lastOrderAt: Date | null;
  importedLastOrderAt: Date | null;
  isGuest: boolean;
  isActive: boolean;
  crmContactable: boolean;
  phone: string | null;
}

/**
 * O "último pedido efetivo" — COALESCE(lastOrderAt, importedLastOrderAt).
 *
 * Espelha o `OR` de duas pernas que `CrmAudienceService` monta:
 *   { lastOrderAt: { lt: c } }  OU  { lastOrderAt: null, importedLastOrderAt: { lt: c } }
 * Quem nunca pediu tem as DUAS colunas nulas e não casa com nenhuma perna — por
 * isso devolve `null`, e não uma data no passado remoto.
 */
export function ultimoPedidoEfetivo(c: ClienteParaClassificar): Date | null {
  return c.lastOrderAt ?? c.importedLastOrderAt ?? null;
}

/** Os mesmos `ELIGIBLE_FILTERS` de `CrmAudienceService`. */
export function podeReceber(c: ClienteParaClassificar): boolean {
  return c.isGuest === false && c.isActive === true && c.crmContactable === true && c.phone !== null;
}

/** Já comprou alguma vez — pedido nativo OU histórico importado. */
export function jaComprou(c: ClienteParaClassificar): boolean {
  return c.totalOrders >= 1 || (c.importedOrderCount ?? 0) >= 1;
}

/**
 * Em QUAIS estágios do fluxo principal este cliente está elegível AGORA.
 *
 * FUNÇÃO PURA. Devolve a lista, não a contagem, porque o que interessa não é só
 * "quantos" — é "quais", para saber qual PAR de campanhas se atropela.
 */
export function estagiosDoCliente(
  c: ClienteParaClassificar,
  cutoffs: { hotCutoff: Date; warmCutoff: Date; lostCutoff: Date },
  segCfg: SegmentConfig = DEFAULT_SEGMENT_CONFIG,
  agora: Date = new Date(),
): EstagioDoFluxo[] {
  if (!podeReceber(c)) return [];

  const estagios: EstagioDoFluxo[] = [];
  const eff = ultimoPedidoEfetivo(c);

  // Converter 1º pedido — NUNCA pediu (nem nativo, nem importado).
  if (c.totalOrders === 0 && (c.importedOrderCount ?? 0) === 0) {
    estagios.push("cadastro-sem-compra");
  }

  // Bem-vindo / 2ª compra — exatamente um pedido nativo.
  if (c.totalOrders === 1) estagios.push("segunda-compra");

  // Indique um amigo — qualquer um que já comprou.
  if (jaComprou(c)) estagios.push("indique-amigo");

  if (eff !== null) {
    // Cliente quente esfriando — dentro da janela quente, nos últimos ~7 dias dela.
    // O `Math.max(1, ...)` é copiado de `CrmAudienceService` de propósito: sem ele
    // um `hotMaxDays` menor que 8 viraria janela invertida (vazia), e a medição
    // discordaria do envio justamente no caso raro.
    const COOLING_WINDOW_DAYS = 7;
    const coolingCutoff = new Date(
      agora.getTime() - Math.max(1, segCfg.hotMaxDays - COOLING_WINDOW_DAYS) * 86_400_000,
    );
    if (eff >= cutoffs.hotCutoff && eff <= coolingCutoff) estagios.push("quente-esfriando");

    // Cliente morno — entre o corte morno e o quente.
    if (eff >= cutoffs.warmCutoff && eff < cutoffs.hotCutoff) estagios.push("reativar-mornos");

    // Cliente frio — mais velho que o corte morno. SEM PISO: ver o aviso abaixo.
    if (eff < cutoffs.warmCutoff) estagios.push("recuperar-frios");

    // Cliente perdido — mais velho que o corte de perdido.
    //
    // ⚠️ AQUI MORA O DEFEITO QUE ESTE MÓDULO FOI ESCRITO PARA MEDIR.
    // `lostCutoff` é MAIS ANTIGO que `warmCutoff` (120 dias contra 60). Logo
    // `eff < lostCutoff` IMPLICA `eff < warmCutoff`: todo PERDIDO é também FRIO,
    // por construção, sempre, 100% das vezes. Não é um caso de borda — é a
    // definição. O cabeçalho de `src/lib/crm-segments.ts` descreve FRIO como
    // "ordered warmMaxDays+1 days ago or more (UP TO lostMinDays)", ou seja COM
    // piso; `CrmAudienceService.recuperar-frios` chama
    // `effectiveLastOrderBefore(warmCutoff)` SEM piso nenhum. A documentação e o
    // código discordam, e é o código que manda mensagem.
    if (eff < cutoffs.lostCutoff) estagios.push("recuperar-perdidos");
  }

  return estagios;
}

export interface ParDeEstagios {
  a: EstagioDoFluxo;
  b: EstagioDoFluxo;
  clientes: number;
}

export interface JornadaDeEstagios {
  /** Clientes considerados (os que passam pelos filtros de elegibilidade). */
  clientesElegiveis: number;
  /**
   * Quantos clientes caem em N estágios ao mesmo tempo. A chave é o N; "4+" é
   * agregado em `quatroOuMais` porque abaixo disso o número já condena.
   */
  distribuicao: {
    zero: number;
    um: number;
    dois: number;
    tres: number;
    quatroOuMais: number;
  };
  /** Quantos clientes cada estágio reivindica, isoladamente. */
  porEstagio: Array<{ estagio: EstagioDoFluxo; clientes: number }>;
  /** Os pares que mais se atropelam — quem colide com quem, e em quantos clientes. */
  paresQueColidem: ParDeEstagios[];
  /**
   * O item 3 do desenho do CEO: "se comprar, SAI da jornada de conversão".
   * Quantos clientes que JÁ COMPRARAM continuam elegíveis em "Converter 1º pedido".
   * Por construção do predicado isto deve ser 0 — o número está aqui para PROVAR,
   * não para supor.
   */
  compradoresAindaEmConversao: number;
  /** Soma das audiências dos estágios do fluxo principal, contra o tamanho da base. */
  somaDasAudiencias: number;
  /** Os cortes de dia em vigor, para o número poder ser reproduzido. */
  cortes: { quenteDias: number; mornoDias: number; perdidoDias: number };
}

/** O que esta medição NÃO alcança — escrito, nunca omitido. */
export const LACUNAS_DA_JORNADA = [
  {
    degrau: "Cupom vencendo / Cliente VIP / Almoço personalizada",
    motivo:
      "A elegibilidade destas depende de cupom emitido, de tier do programa de " +
      "relacionamento e de janela de horário — dados que não estão na tabela de " +
      "clientes e que este raio-x não lê. Ficam FORA da distribuição: contá-las " +
      "como zero seria inventar ausência de conflito.",
  },
  {
    degrau: "ordem de chegada entre estágios",
    motivo:
      "Esta medição é uma FOTOGRAFIA de agora. Ela responde 'em quantos estágios " +
      "o cliente está hoje', não 'em que ordem ele os percorreu' — o histórico de " +
      "transição de estágio não é gravado em lugar nenhum.",
  },
] as const;

/**
 * Mede a jornada, de verdade, no banco. UMA consulta de leitura.
 *
 * O laço roda em memória sobre a base do restaurante (milhares de linhas, não
 * milhões). Fazer isso em SQL exigiria repetir os predicados numa segunda
 * linguagem — e duas escritas da mesma regra é como elas passam a discordar.
 */
export async function medirJornadaDeEstagios(
  db: LeitorDeClientes,
  restaurantId: string,
  opcoes: { segCfg?: SegmentConfig; agora?: Date } = {},
): Promise<JornadaDeEstagios> {
  const segCfg = opcoes.segCfg ?? DEFAULT_SEGMENT_CONFIG;
  const agora = opcoes.agora ?? new Date();
  const cutoffs = buildCutoffs(segCfg, agora);

  const clientes = await db.customer.findMany({
    where: { restaurantId },
    select: {
      id: true, totalOrders: true, importedOrderCount: true,
      lastOrderAt: true, importedLastOrderAt: true,
      isGuest: true, isActive: true, crmContactable: true, phone: true,
    },
  });

  const distribuicao = { zero: 0, um: 0, dois: 0, tres: 0, quatroOuMais: 0 };
  const porEstagio = new Map<EstagioDoFluxo, number>();
  const pares = new Map<string, number>();
  let clientesElegiveis = 0;
  let compradoresAindaEmConversao = 0;
  let somaDasAudiencias = 0;

  for (const bruto of clientes) {
    const c = bruto as ClienteParaClassificar;
    if (!podeReceber(c)) continue;
    clientesElegiveis += 1;

    const estagios = estagiosDoCliente(c, cutoffs, segCfg, agora);
    somaDasAudiencias += estagios.length;

    if (estagios.includes("cadastro-sem-compra") && jaComprou(c)) {
      compradoresAindaEmConversao += 1;
    }

    for (const e of estagios) porEstagio.set(e, (porEstagio.get(e) ?? 0) + 1);
    for (let i = 0; i < estagios.length; i++) {
      for (let j = i + 1; j < estagios.length; j++) {
        const chave = `${estagios[i]}|${estagios[j]}`;
        pares.set(chave, (pares.get(chave) ?? 0) + 1);
      }
    }

    if (estagios.length === 0) distribuicao.zero += 1;
    else if (estagios.length === 1) distribuicao.um += 1;
    else if (estagios.length === 2) distribuicao.dois += 1;
    else if (estagios.length === 3) distribuicao.tres += 1;
    else distribuicao.quatroOuMais += 1;
  }

  return {
    clientesElegiveis,
    distribuicao,
    porEstagio: ESTAGIOS_DO_FLUXO_PRINCIPAL
      .map((estagio) => ({ estagio, clientes: porEstagio.get(estagio) ?? 0 }))
      .sort((a, b) => b.clientes - a.clientes),
    paresQueColidem: [...pares.entries()]
      .map(([chave, clientes]) => {
        const [a, b] = chave.split("|") as [EstagioDoFluxo, EstagioDoFluxo];
        return { a, b, clientes };
      })
      .sort((x, y) => y.clientes - x.clientes),
    compradoresAindaEmConversao,
    somaDasAudiencias,
    cortes: {
      quenteDias: segCfg.hotMaxDays,
      mornoDias: segCfg.warmMaxDays,
      perdidoDias: segCfg.lostMinDays,
    },
  };
}
