/**
 * LiveStageHealth — a régua do TOPO da escada.
 *
 * O BURACO QUE ESTE ARQUIVO FECHA (24/08/2026)
 * --------------------------------------------
 * A escada media só embaixo. Os gates de subida contam evidência de SOMBRA — o
 * que o agente TERIA dito — e a sombra só é gravada quando ele NÃO está
 * respondendo. Quem sobe para o degrau alto, portanto, para de produzir a prova
 * que o degrau alto exige: sete dias depois da subida a janela esvazia e o gate
 * marca zero para sempre. Foi o caso medido do Sushi Cazza: 0/20 desde julho,
 * não por ter piorado, mas por ter subido.
 *
 * Doutrina que saiu daí: **portão que mede só embaixo transforma subir em ficar
 * cego.** Reconferir o gate de subida continuamente seria trocar o defeito por
 * um pior — derruba, volta a acumular sombra, sobe, para de acumular, derruba:
 * um oscilador com cliente real balançando junto.
 *
 * A saída é medir ONDE O AGENTE ESTÁ. Cada turno atendido no degrau alto vira
 * amostra, e a taxa de acerto ao vivo decide se o degrau se sustenta.
 *
 * O QUE CONTA COMO ACERTO
 * -----------------------
 * A amostra é gravada em TODO desfecho do caminho ao vivo, não só quando o
 * agente responde. Se só os turnos respondidos fossem contados, a taxa seria
 * 100% por construção — o crítico só deixa passar o que já é PASS — e a régua
 * seria enfeite. O que se mede é: das vezes em que o agente esteve no topo,
 * quantas ele resolveu por si, e quantas precisaram de trava ou do
 * recepcionista determinístico.
 */

/**
 * PISO DE COERÊNCIA — 90%.
 *
 * É o ponto onde uma resposta ruim em cada dez ainda é visível ao dono do
 * restaurante ANTES de virar reclamação de cliente. Acima disso, o problema
 * aparece como impressão ("achei que ele errou uma vez"); abaixo, vira padrão
 * que o cliente sente. Não é um número redondo escolhido por gosto: é o limite
 * entre falha percebida como exceção e falha percebida como comportamento.
 *
 * Quem for mexer aqui está mexendo em quanto erro chega ao cliente final.
 */
export const PISO_COERENCIA_AO_VIVO = 0.9;

/**
 * JANELA DE AMOSTRAS — as 50 mais recentes.
 *
 * Grande o bastante para que UMA resposta ruim isolada não derrube ninguém
 * (1/50 = 2%, longe do piso de 10%), e pequena o bastante para que uma
 * degradação real apareça no mesmo dia em vez de ficar diluída num histórico
 * longo. Janela maior esconde piora recente; menor transforma azar em queda.
 */
export const JANELA_AMOSTRAS_AO_VIVO = 50;

/**
 * PISO DE AMOSTRA — 30.
 *
 * Com menos de 30 amostras na janela, a taxa NÃO derruba ninguém: um
 * restaurante de baixo movimento não pode ser punido por ser pequeno. Com 10
 * atendimentos, uma única falha vira 10% e derrubaria o degrau por ruído
 * estatístico, não por qualidade.
 *
 * Mas — e isto é o ponto que a doutrina da casa não deixa negociar — amostra
 * insuficiente NÃO é aprovação. O estado é SEM_AMOSTRA, e ele se diz por
 * escrito na tela: "sem amostra suficiente para medir o topo". Nunca "ok".
 * Ausência de medição não vira verde aqui, como não vira em lugar nenhum.
 */
export const MINIMO_AMOSTRAS_AO_VIVO = 30;

/** Janela de tempo das amostras — a mesma dos gates de sombra. */
export const JANELA_DIAS_AO_VIVO = 7;

export type SaudeDoTopo = "SAUDAVEL" | "DEGRADADO" | "SEM_AMOSTRA";

export interface AvaliacaoDoTopo {
  saude: SaudeDoTopo;
  /** true SÓ em DEGRADADO — SEM_AMOSTRA nunca derruba. */
  derruba: boolean;
  amostras: number;
  acertos: number;
  taxa: number | null;
  piso: number;
  minimoAmostras: number;
  motivo: string;
}

export interface AmostraAoVivo {
  /** Veredito do TURNO inteiro no topo: passou pelos portões e respondeu? */
  coherence: string;
}

/**
 * A régua, pura. Recebe as amostras mais recentes primeiro; usa até a janela.
 * Nunca lança — quem chama decide o que fazer com SEM_AMOSTRA.
 */
export function avaliarTopo(amostrasRecentes: readonly AmostraAoVivo[]): AvaliacaoDoTopo {
  const janela = amostrasRecentes.slice(0, JANELA_AMOSTRAS_AO_VIVO);
  const amostras = janela.length;
  const acertos = janela.filter((a) => a.coherence === "PASS").length;

  const base = {
    amostras,
    acertos,
    piso: PISO_COERENCIA_AO_VIVO,
    minimoAmostras: MINIMO_AMOSTRAS_AO_VIVO,
  };

  if (amostras < MINIMO_AMOSTRAS_AO_VIVO) {
    return {
      ...base,
      saude: "SEM_AMOSTRA",
      derruba: false,
      taxa: amostras ? acertos / amostras : null,
      motivo:
        `sem amostra suficiente para medir o topo (${amostras}/${MINIMO_AMOSTRAS_AO_VIVO} atendimentos ao vivo ` +
        `nos últimos ${JANELA_DIAS_AO_VIVO} dias) — a taxa não derruba ninguém aqui, e isto NÃO quer dizer "ok"`,
    };
  }

  const taxa = acertos / amostras;
  if (taxa < PISO_COERENCIA_AO_VIVO) {
    return {
      ...base,
      saude: "DEGRADADO",
      derruba: true,
      taxa,
      motivo:
        `TOPO DEGRADADO: coerência ao vivo ${(taxa * 100).toFixed(1)}% em ${amostras} atendimentos ` +
        `(piso ${PISO_COERENCIA_AO_VIVO * 100}%) — o agente está errando mais de uma vez a cada dez no degrau alto`,
    };
  }

  return {
    ...base,
    saude: "SAUDAVEL",
    derruba: false,
    taxa,
    motivo: `topo saudável: coerência ao vivo ${(taxa * 100).toFixed(1)}% em ${amostras} atendimentos (piso ${PISO_COERENCIA_AO_VIVO * 100}%)`,
  };
}
