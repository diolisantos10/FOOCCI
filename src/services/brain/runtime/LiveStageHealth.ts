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
 * O SEGUNDO BURACO, E ELE ERA DO DESENHO (25/08/2026)
 * ---------------------------------------------------
 * A primeira versão herdou a janela de 7 dias da evidência de sombra. Em sombra
 * a amostra é barata e abundante; no topo cada amostra é um turno de cliente
 * real que saiu do menu. São ordens de grandeza diferentes, e ninguém tinha
 * medido a diferença antes de escolher os números.
 *
 * A MEDIÇÃO (produção, 25/08/2026, carteira inteira — um restaurante no topo):
 *   • turnos de cliente no WhatsApp .......... 5.866 em 90 dias ≈ 65/dia
 *     por dia da semana: sex 1492 · dom 1021 · sáb 1014 · qui 782 · ter 558 ·
 *     seg 502 · qua 497 — a sexta pesa 3x a quarta
 *     por faixa de hora: jantar (18-24h) 5.012 · almoço (11-15h) 491 ·
 *     tarde 257 · manhã 68 · madrugada 38 — 85% do movimento é no jantar
 *   • turnos que CHEGAM ao raciocínio livre ... 273 respostas do Brain
 *     (`messages.metadata->>'source' = 'WHATSAPP_BRAIN'`) em 64 dias corridos,
 *     de 20/06 a 23/08 ≈ **4,3/dia**
 *
 * A distância entre 65 e 4,3 não é erro: é o desenho. O turno só chega ao Brain
 * quando NÃO é interação de menu e está DENTRO de uma sessão já aberta pelo
 * menu (`WhatsAppBrainRuntimeService`). Saudação, "cardápio", "0" e escolha
 * numerada são do recepcionista determinístico e nunca viram amostra do topo:
 * no mesmo período o menu respondeu 3.955 vezes, o Brain 273. É 1 turno em 21.
 *
 * A conta que condenava a janela de 7 dias: 4,3/dia × 7 = ~30 amostras, contra
 * um piso de 30. O restaurante de MAIOR movimento da carteira ficaria EMPATADO
 * com o piso — cara ou coroa toda semana, e qualquer semana fraca (o volume
 * medido varia 3x entre sexta e quarta) apaga a medição. A primeira leitura em
 * produção mostrou o empate perdido: 1 amostra em 16 horas.
 *
 * Régua que só decide quando o calendário ajuda é régua que não decide. O
 * degrau mais alto ficaria em SEM_AMOSTRA a maior parte do tempo, aberto a
 * cliente real e sem régua nenhuma — era trocar uma cegueira por outra.
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
 * PISO DE AMOSTRA — 30. NÃO foi afrouxado, e o motivo é medido.
 *
 * Com menos de 30 amostras na janela, a taxa NÃO derruba ninguém: um
 * restaurante de baixo movimento não pode ser punido por ser pequeno. Com 10
 * atendimentos, uma única falha vira 10% e derrubaria o degrau por ruído
 * estatístico, não por qualidade.
 *
 * Era tentador baixar de 30 para 5 e fazer a régua "decidir" logo. Seria pior
 * que o defeito: decidir com 5 amostras é decidir com estatística que não
 * existe — uma falha em cinco é 20%, e derrubaria por azar de uma noite. O
 * conserto certo foi esticar a JANELA DE TEMPO até caber o piso, não encolher o
 * piso até caber a janela. Afrouxar o piso é comprar a decisão fiado.
 *
 * E — isto a doutrina da casa não deixa negociar — amostra insuficiente NÃO é
 * aprovação. O estado é SEM_AMOSTRA, e ele se diz por escrito na tela: "sem
 * amostra suficiente para medir o topo". Nunca "ok". Ausência de medição não
 * vira verde aqui, como não vira em lugar nenhum.
 */
export const MINIMO_AMOSTRAS_AO_VIVO = 30;

/**
 * JANELA DE TEMPO — 28 dias. Quatro semanas cheias.
 *
 * O MOTIVO, MEDIDO (ver o cabeçalho deste arquivo):
 *   • ritmo real de amostra no topo: ≈4,3/dia no restaurante de maior movimento
 *     da carteira — 273 respostas do Brain ao vivo em 64 dias corridos;
 *   • 7 dias × 4,3 = ~30 — EMPATE exato com o piso de 30. Era a janela antiga,
 *     e empatar com o piso significa depender do calendário: o volume medido
 *     varia 3x entre sexta (1.492 turnos) e quarta (497), e uma semana fraca
 *     apagava a medição. Não é margem, é sorteio;
 *   • 28 dias × 4,3 = ~120 amostras — 4x o piso. Aguenta um restaurante quatro
 *     vezes menor que o Sushi Cazza ainda ser medido, e é isso que a folga
 *     compra: a régua vale para a carteira, não só para o maior cliente.
 *
 * POR QUE 28 E NÃO 30: quatro semanas CHEIAS. O movimento medido é fortemente
 * semanal (sexta 3x quarta; 85% no jantar). Uma janela que não é múltiplo de 7
 * pega um número diferente de sextas conforme o dia em que é lida, e a taxa
 * oscilaria pelo calendário em vez de pela qualidade.
 *
 * O PREÇO, DITO EM VOZ ALTA: janela de tempo mais longa demoraria mais para
 * enxergar uma piora recente — se ela mandasse. Ela não manda quando há volume:
 * ao ritmo medido, as 50 amostras mais recentes cabem em ~12 dias, e é o TETO
 * DE 50 que decide. A janela de 28 dias é a rede de baixo, para quem tem pouco
 * movimento; o teto de 50 continua sendo a régua de recência de quem tem muito.
 * No topo a amostra é rara; a alternativa a esperar não era medir mais rápido —
 * era não medir nunca.
 */
export const JANELA_DIAS_AO_VIVO = 28;

/**
 * QUANTO OBSERVAR ANTES DE DECLARAR QUE UM AGENTE NÃO É MENSURÁVEL — 14 dias.
 *
 * Metade da janela. Abaixo disso o ritmo ainda é palpite: uma madrugada de
 * segunda-feira num restaurante de sushi (85% do movimento é no jantar) daria
 * um ritmo perto de zero e acusaria de "não mensurável" quem só estava dormindo.
 * Duas semanas cheias já contêm dois fins de semana, que são o pico medido.
 *
 * Antes desse prazo o veredito é AINDA_NAO_SEI — e AINDA_NAO_SEI é dito com
 * essas palavras, nunca calado e nunca confundido com "está tudo bem".
 */
export const MINIMO_DIAS_OBSERVACAO = 14;

/**
 * DESDE QUANDO EXISTE AMOSTRA DO TOPO NO BANCO — 24/08/2026, o deploy da marca
 * `stage='LIVE'`.
 *
 * Sem esta data o alarme de "não mensurável" seria injusto por construção: o
 * Sushi Cazza está no degrau alto desde 12/07, mas nenhum turno antes de 24/08
 * foi gravado como amostra do topo — o código não gravava. Contar esse tempo
 * como "tempo sem juntar amostra" acusaria o agente de um silêncio que era do
 * instrumento, não dele.
 */
export const AMOSTRA_DO_TOPO_EXISTE_DESDE = Date.UTC(2026, 7, 24);

export type SaudeDoTopo = "SAUDAVEL" | "DEGRADADO" | "SEM_AMOSTRA";

/**
 * O agente no topo CONSEGUE ser medido?
 *   SIM          — há amostra suficiente, ou o ritmo projeta que haverá.
 *   NAO          — observado tempo bastante, e no ritmo medido ele nunca
 *                  alcançará o piso dentro da janela. Risco declarado.
 *   AINDA_NAO_SEI— pouco tempo de observação, ou não se sabe desde quando ele
 *                  está no degrau alto. Ausência de informação não é informação.
 */
export type Mensurabilidade = "SIM" | "NAO" | "AINDA_NAO_SEI";

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

  // ── A segunda verdade: dá para medir este agente aqui em cima? ────────────
  janelaDias: number;
  /** Dias em que a medição do topo esteve de fato ligada para este agente. */
  coberturaDias: number | null;
  /** Amostras por dia observadas na cobertura. */
  ritmoPorDia: number | null;
  /** Quantas amostras esse ritmo entrega numa janela cheia. */
  projecaoNaJanela: number | null;
  mensuravel: Mensurabilidade;
  /**
   * true quando `mensuravel === "NAO"`: estar no topo sem conseguir ser medido
   * é, por si, um risco — e ele tem que aparecer. NUNCA muda `derruba`.
   */
  riscoDeclarado: boolean;
  /** O grito. Null quando não há risco declarado. */
  alerta: string | null;
  /** A instrução gêmea da proibição: o que fazer. Null quando não há risco. */
  proximaAcao: string | null;
}

export interface AmostraAoVivo {
  /** Veredito do TURNO inteiro no topo: passou pelos portões e respondeu? */
  coherence: string;
}

export interface ContextoDoTopo {
  /**
   * Desde quando este agente está no degrau alto (config.updatedAt serve).
   * Ausente ⇒ a mensurabilidade fica em AINDA_NAO_SEI: sem saber há quanto
   * tempo ele está lá, "não juntou amostra" não quer dizer nada.
   */
  noTopoDesde?: Date | number | null;
  /** Injetável para teste. */
  agora?: number;
}

/**
 * A régua, pura. Recebe as amostras mais recentes primeiro; usa até a janela.
 * Nunca lança — quem chama decide o que fazer com SEM_AMOSTRA.
 */
export function avaliarTopo(
  amostrasRecentes: readonly AmostraAoVivo[],
  ctx: ContextoDoTopo = {},
): AvaliacaoDoTopo {
  const janela = amostrasRecentes.slice(0, JANELA_AMOSTRAS_AO_VIVO);
  const amostras = janela.length;
  const acertos = janela.filter((a) => a.coherence === "PASS").length;
  const agora = ctx.agora ?? Date.now();

  /**
   * COBERTURA — há quantos dias esta medição existe para este agente.
   *
   * Duas datas limitam, e vale a MAIS NOVA das duas: desde quando ele está no
   * topo, e desde quando o banco grava amostra do topo. Um agente que subiu em
   * julho, com a marca nascida em agosto, tem a cobertura de agosto. E a
   * cobertura nunca passa da janela: o que caiu fora dela não conta mesmo.
   */
  const desde = ctx.noTopoDesde == null ? null : Math.max(Number(new Date(ctx.noTopoDesde)), AMOSTRA_DO_TOPO_EXISTE_DESDE);
  const coberturaDias =
    desde == null || !Number.isFinite(desde)
      ? null
      : Math.min(JANELA_DIAS_AO_VIVO, Math.max(0, (agora - desde) / 86_400_000));

  const ritmoPorDia = coberturaDias && coberturaDias > 0 ? amostras / coberturaDias : null;
  const projecaoNaJanela = ritmoPorDia == null ? null : ritmoPorDia * JANELA_DIAS_AO_VIVO;

  /**
   * MENSURÁVEL?
   * SIM quando já há amostra suficiente — nada a projetar, a régua já decide.
   * Senão, só se pronuncia depois de observar tempo bastante; antes disso o
   * ritmo é palpite e acusar seria inventar.
   */
  const mensuravel: Mensurabilidade =
    amostras >= MINIMO_AMOSTRAS_AO_VIVO
      ? "SIM"
      : coberturaDias == null || coberturaDias < MINIMO_DIAS_OBSERVACAO
        ? "AINDA_NAO_SEI"
        : (projecaoNaJanela ?? 0) >= MINIMO_AMOSTRAS_AO_VIVO
          ? "SIM"
          : "NAO";

  const riscoDeclarado = mensuravel === "NAO";
  const alerta = riscoDeclarado
    ? `TOPO SEM MEDIÇÃO POSSÍVEL: ${amostras} amostra(s) em ${coberturaDias!.toFixed(0)} dias no degrau alto ` +
      `(≈${ritmoPorDia!.toFixed(2)}/dia). Nesse ritmo, uma janela cheia de ${JANELA_DIAS_AO_VIVO} dias entrega ` +
      `~${Math.round(projecaoNaJanela!)} amostras — abaixo das ${MINIMO_AMOSTRAS_AO_VIVO} que a régua exige. ` +
      `Este agente está aberto a cliente real e NÃO CONSEGUE ser medido aqui em cima: o SEM_AMOSTRA dele não é ` +
      `espera, é permanente.`
    : null;
  const proximaAcao = riscoDeclarado
    ? `A régua não derruba por pouca amostra e continua não derrubando — o piso protege o restaurante pequeno. ` +
      `A decisão é humana, e há duas saídas honestas: (1) DESCER este agente para ALLOWLIST ou SHADOW_ONLY, ` +
      `onde ele volta a produzir evidência e o recepcionista determinístico segue atendendo sem calar ninguém; ` +
      `ou (2) manter no topo por decisão explícita, ciente e registrada de que ele fica SEM RÉGUA. ` +
      `Não decidir é escolher a (2) sem dizer.`
    : null;

  const base = {
    amostras,
    acertos,
    piso: PISO_COERENCIA_AO_VIVO,
    minimoAmostras: MINIMO_AMOSTRAS_AO_VIVO,
    janelaDias: JANELA_DIAS_AO_VIVO,
    coberturaDias,
    ritmoPorDia,
    projecaoNaJanela,
    mensuravel,
    riscoDeclarado,
    alerta,
    proximaAcao,
  };

  if (amostras < MINIMO_AMOSTRAS_AO_VIVO) {
    return {
      ...base,
      saude: "SEM_AMOSTRA",
      // NUNCA derruba — nem com risco declarado. A proibição de derrubar por
      // falta de amostra continua inteira; o que mudou é que ela deixou de ser
      // silenciosa.
      derruba: false,
      taxa: amostras ? acertos / amostras : null,
      motivo:
        `sem amostra suficiente para medir o topo (${amostras}/${MINIMO_AMOSTRAS_AO_VIVO} atendimentos ao vivo ` +
        `nos últimos ${JANELA_DIAS_AO_VIVO} dias) — a taxa não derruba ninguém aqui, e isto NÃO quer dizer "ok"` +
        (riscoDeclarado ? ` — ${alerta}` : ""),
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
