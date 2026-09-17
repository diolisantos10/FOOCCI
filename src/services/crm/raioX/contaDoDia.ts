/**
 * A CONTA DO DIA — de quantos eu podia, quantos mandei, e quem barrou o resto.
 *
 * ⚠️ CRM **do restaurante** (o restaurante falando com os clientes DELE). Não
 * confundir com `src/services/salaDeVendas/`, que é a área comercial da Foocci.
 *
 * ── POR QUE ISTO EXISTE (D-0E3) ─────────────────────────────────────────────
 * O sistema sempre soube dizer o que FEZ. Nunca soube dizer o que DEIXOU de
 * fazer. Em 4 ciclos seguidos de produção ele encontrou 2.396 clientes
 * elegíveis e enviou ZERO, com o teto de 900/dia intocado — e isso não virou
 * número em lugar nenhum, porque ninguém pergunta ao sistema quanto ele PODERIA
 * ter enviado.
 *
 * O teto diário é limite de segurança, não meta de conforto. Ficar em 60 quando
 * se podia mandar 900 não é prudência: é capacidade jogada fora sem ninguém
 * saber. A pergunta certa nunca é "posso mandar mais?" — é "por que não mandei
 * o que já podia?".
 *
 * ── A INVARIANTE, QUE É O CORAÇÃO DISTO ─────────────────────────────────────
 *
 *     enviados + barrados + cortados-antes-do-banco  ===  elegíveis
 *
 * Se não fecha, há um degrau ESCONDIDO — e degrau escondido é exatamente onde
 * os 2.396 morreram. Aqui ela é uma função que devolve a diferença, provada por
 * teste (`contaDoDia.test.ts`), não uma frase de comentário.
 *
 * ── E QUANDO NÃO DÁ PARA FECHAR ─────────────────────────────────────────────
 * Ausência de informação NÃO é informação. Sem o total de elegíveis medido, a
 * conta devolve `fecha: false` com a lacuna escrita — nunca `fecha: true` por
 * falta de contra-prova, e nunca um zero inventado no lugar do que não se sabe.
 *
 * MÓDULO PURO: nenhuma consulta, nenhum envio, nenhuma escrita. Só aritmética.
 */

/** Um degrau contado: o nome da regra que barrou, e quantas pessoas ela barrou. */
export interface DegrauContado {
  /** Código de máquina da regra (ex.: CUSTOMER_OPTED_OUT, TETO_DA_RODADA). */
  degrau: string;
  quantidade: number;
}

/** O que esta conta NÃO consegue responder, com o motivo escrito. */
export interface LacunaDaConta {
  degrau: string;
  motivo: string;
}

export interface EntradaDaConta {
  restaurantId: string;
  /**
   * Teto EFETIVO do dia (`dailyGlobalCap` já passado por `applyEffectiveSafety`).
   * 0 significa "sem teto configurado" — e aí não existe sobra a cobrar.
   */
  tetoDiario: number;
  /**
   * Mensagens que de fato saíram na janela, do restaurante INTEIRO — inclusive
   * carrinho abandonado e automações. É este número que consome o teto do dia,
   * então é ele que responde "quantos mandei" e alimenta o alarme de sobra.
   */
  enviadasHoje: number;
  /**
   * ⚠️ ESCOPO DA INVARIANTE, e ele é diferente do de cima de propósito.
   *
   * A invariante fecha sobre as RODADAS DE CAMPANHA MEDIDAS (as que gravaram
   * `crm_ciclo_funil`). Envio de carrinho abandonado não nasce de um elegível de
   * campanha: jogá-lo na mesma conta faria a soma estourar o elegível e gritar
   * "contagem duplicada" toda vez, um alarme falso que ninguém leria depois da
   * terceira vez. Enviados e barrados aqui são só os das campanhas medidas.
   */
  enviadasNoCiclo: number;
  /** Degraus GRAVADOS em campaign_executions das campanhas medidas. */
  barrados: readonly DegrauContado[];
  /**
   * Degraus cortados ANTES de virar linha no banco — o grupo que não deixava
   * rastro nenhum até agora. Vem de `crm_ciclo_funil`, gravado pelo runner.
   */
  cortadosAntesDoBanco: readonly DegrauContado[];
  /**
   * Total de elegíveis medido no ciclo. `null` = não medido nesta janela (não
   * houve rodada registrada), e aí a invariante não é declarada fechada.
   */
  elegiveisMedidos: number | null;
}

export interface Fechamento {
  /** A soma das partes bate com o total elegível? */
  fecha: boolean;
  elegivel: number | null;
  somaDasPartes: number;
  /** elegivel − somaDasPartes. `null` quando não há elegível medido. */
  diferenca: number | null;
  /** Explicação em português do resultado — é o que sobe ao relatório. */
  explicacao: string;
}

export type NivelDeAlarme = "GRAVE" | "ATENCAO";

export interface AlarmeDeOciosidade {
  nivel: NivelDeAlarme;
  sobra: number;
  podia: number;
  enviou: number;
  mensagem: string;
}

export interface ContaDoDia {
  restaurantId: string;
  /** Quantos eu PODIA hoje. `null` = sem teto configurado. */
  podiaHoje: number | null;
  enviouHoje: number;
  /** Capacidade permitida que ficou no chão. `null` quando não há teto. */
  sobraDoDia: number | null;
  /** 0–100. `null` quando não há teto. */
  aproveitamentoPercent: number | null;
  barrados: DegrauContado[];
  totalBarrado: number;
  cortadosAntesDoBanco: DegrauContado[];
  totalCortadoAntesDoBanco: number;
  /** Enviados das rodadas MEDIDAS — o escopo da invariante (ver EntradaDaConta). */
  enviouNoCiclo: number;
  fechamento: Fechamento;
  alarme: AlarmeDeOciosidade | null;
  lacunas: LacunaDaConta[];
}

/**
 * A lacuna que SOBREVIVE mesmo com `crm_ciclo_funil` gravando.
 *
 * `resolveAudience` corta a audiência em 500 por consulta (MAX_AUDIENCE), e o
 * corte acontece DENTRO do banco, no `take`. Quem fica fora desse 500 nunca
 * chega a ser contado como elegível por ninguém — então não entra nem no total
 * elegível nem em degrau nenhum. A invariante fecha sobre o que foi OFERECIDO ao
 * ciclo; ela não promete falar da base inteira.
 */
export const LACUNA_CORTE_DE_AUDIENCIA: LacunaDaConta = {
  degrau: "candidato cortado pelo teto de audiência (500 por consulta)",
  motivo:
    "`resolveAudience` aplica `take: 500` dentro da própria consulta. Quem fica " +
    "fora desse corte não é devolvido a ninguém, então não vira elegível nem " +
    "degrau — a conta fecha sobre o que foi OFERECIDO ao ciclo, não sobre a base " +
    "inteira. Medir isso exige uma segunda consulta de contagem do segmento, que " +
    "é outra pergunta e tem outro custo.",
};

export const LACUNA_SEM_RODADA: LacunaDaConta = {
  degrau: "total de elegíveis da janela",
  motivo:
    "Nenhuma rodada de campanha registrou funil nesta janela (`crm_ciclo_funil` " +
    "vazio). Sem o total elegível medido, a invariante NÃO é declarada fechada — " +
    "ausência de informação não é informação.",
};

function somar(degraus: readonly DegrauContado[]): number {
  return degraus.reduce((s, d) => s + Math.max(0, d.quantidade), 0);
}

/** Cópia ordenada do maior para o menor — o degrau que mais barrou vem primeiro. */
function ordenar(degraus: readonly DegrauContado[]): DegrauContado[] {
  return [...degraus]
    .map((d) => ({ degrau: d.degrau, quantidade: Math.max(0, d.quantidade) }))
    .sort((a, b) => b.quantidade - a.quantidade || a.degrau.localeCompare(b.degrau));
}

/**
 * A INVARIANTE, isolada, para poder ser provada sozinha.
 *
 * `fecha` só é `true` quando existe um elegível MEDIDO e a soma bate exatamente.
 * Faltando o elegível, devolve `fecha: false` — nunca o contrário.
 */
export function conferirFechamento(entrada: EntradaDaConta): Fechamento {
  const somaDasPartes =
    Math.max(0, entrada.enviadasNoCiclo) +
    somar(entrada.barrados) +
    somar(entrada.cortadosAntesDoBanco);

  if (entrada.elegiveisMedidos === null) {
    return {
      fecha: false,
      elegivel: null,
      somaDasPartes,
      diferenca: null,
      explicacao:
        "Não há total de elegíveis medido nesta janela — a conta não é declarada " +
        "fechada por falta de contra-prova.",
    };
  }

  const elegivel = Math.max(0, entrada.elegiveisMedidos);
  const diferenca = elegivel - somaDasPartes;
  if (diferenca === 0) {
    return {
      fecha: true,
      elegivel,
      somaDasPartes,
      diferenca: 0,
      explicacao: `A conta fecha: ${elegivel} elegíveis = ${entrada.enviadasNoCiclo} enviados + ${somar(entrada.barrados)} barrados + ${somar(entrada.cortadosAntesDoBanco)} cortados antes do banco.`,
    };
  }

  return {
    fecha: false,
    elegivel,
    somaDasPartes,
    diferenca,
    explicacao:
      diferenca > 0
        ? `DEGRAU ESCONDIDO: ${diferenca} pessoa(s) sumiram entre o elegível (${elegivel}) e a soma das partes (${somaDasPartes}). Alguém está sendo descartado sem deixar motivo.`
        : `CONTAGEM DUPLICADA: a soma das partes (${somaDasPartes}) passa do elegível (${elegivel}) em ${-diferenca}. Alguma pessoa está sendo contada em dois degraus.`,
  };
}

/**
 * ── O ALARME, e por que estes cortes ────────────────────────────────────────
 *
 * Sobra é capacidade PERMITIDA que ficou no chão. Ela só vira alarme quando é
 * grande o bastante para não ser ruído de fim de dia:
 *
 *  - GRAVE   — sobrou metade ou mais do teto E pelo menos 100 mensagens. É o
 *              caso "podia 900, mandou 60": não há leitura inocente disso.
 *  - ATENÇÃO — sobrou um quarto ou mais do teto E pelo menos 50 mensagens.
 *
 * Os pisos absolutos (100/50) existem para que restaurante de teto pequeno não
 * grite por sobra de 3 mensagens. Sem teto configurado não há sobra a cobrar, e
 * o alarme fica calado — silêncio honesto, não silêncio por defeito.
 */
export const PISO_ALARME_GRAVE = 100;
export const PISO_ALARME_ATENCAO = 50;
export const FRACAO_ALARME_GRAVE = 0.5;
export const FRACAO_ALARME_ATENCAO = 0.25;

export function avaliarOciosidade(
  podia: number | null,
  enviou: number,
): AlarmeDeOciosidade | null {
  if (podia === null || podia <= 0) return null;
  const sobra = Math.max(0, podia - Math.max(0, enviou));
  if (sobra <= 0) return null;

  const fracao = sobra / podia;
  const base = { sobra, podia, enviou: Math.max(0, enviou) };

  if (fracao >= FRACAO_ALARME_GRAVE && sobra >= PISO_ALARME_GRAVE) {
    return {
      ...base,
      nivel: "GRAVE",
      mensagem: `Capacidade ociosa GRAVE: podia enviar ${podia} hoje e enviou ${enviou}. ${sobra} envios permitidos ficaram no chão.`,
    };
  }
  if (fracao >= FRACAO_ALARME_ATENCAO && sobra >= PISO_ALARME_ATENCAO) {
    return {
      ...base,
      nivel: "ATENCAO",
      mensagem: `Capacidade ociosa: podia enviar ${podia} hoje e enviou ${enviou}. ${sobra} envios permitidos ficaram no chão.`,
    };
  }
  return null;
}

/** Monta a conta do dia inteira a partir das contagens já levantadas. */
export function montarContaDoDia(entrada: EntradaDaConta): ContaDoDia {
  const podiaHoje = entrada.tetoDiario > 0 ? entrada.tetoDiario : null;
  const enviouHoje = Math.max(0, entrada.enviadasHoje);
  const sobraDoDia = podiaHoje === null ? null : Math.max(0, podiaHoje - enviouHoje);

  const lacunas: LacunaDaConta[] = [LACUNA_CORTE_DE_AUDIENCIA];
  if (entrada.elegiveisMedidos === null) lacunas.push(LACUNA_SEM_RODADA);

  return {
    restaurantId: entrada.restaurantId,
    podiaHoje,
    enviouHoje,
    sobraDoDia,
    aproveitamentoPercent:
      podiaHoje === null ? null : Math.round((Math.min(enviouHoje, podiaHoje) / podiaHoje) * 100),
    barrados: ordenar(entrada.barrados),
    totalBarrado: somar(entrada.barrados),
    cortadosAntesDoBanco: ordenar(entrada.cortadosAntesDoBanco),
    enviouNoCiclo: Math.max(0, entrada.enviadasNoCiclo),
    totalCortadoAntesDoBanco: somar(entrada.cortadosAntesDoBanco),
    fechamento: conferirFechamento(entrada),
    alarme: avaliarOciosidade(podiaHoje, enviouHoje),
    lacunas,
  };
}
