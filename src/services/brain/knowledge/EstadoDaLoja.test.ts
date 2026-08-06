/**
 * EstadoDaLoja — as duas metades.
 *
 * Metade 1: com a loja fechada, o estado diz que não se aceita pedido e o aviso
 * proíbe pedir dado do cliente. É o caso do print de 05/08 às 23:49.
 *
 * Metade 2: com a loja aberta, NADA muda — sem mensagem de fechada, sem aviso
 * extra, sem nota de segurança. Detector que dispara sempre vira carimbo e o
 * agente para de conversar (guardrail 5).
 */

import { describe, it, expect } from "vitest";
import { avisosDoEstadoDaLoja, calcularEstadoDaLoja, type LinhaDeHorario } from "./EstadoDaLoja";

const TZ = "America/Sao_Paulo";

/** Semana inteira 06:00–20:00 — o horário real do restaurante do print. */
function semana(open = "06:00", close = "20:00"): LinhaDeHorario[] {
  return Array.from({ length: 7 }, (_, d) => ({
    dayOfWeek: d, isOpen: true, openTime: open, closeTime: close, periodsJson: null,
  }));
}

/** Um instante em São Paulo (UTC-3) — sem depender do fuso da máquina de teste. */
function emSaoPaulo(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

const semPausa = { isOrderingPaused: false, orderingPausedUntil: null, orderingPausedReason: null };

describe("EstadoDaLoja — a metade que BARRA (o print das 23:49)", () => {
  it("23:49 com horário 06:00–20:00: não aceita pedido e sabe quando reabre", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa:    semPausa,
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T23:49:00"),
    });

    expect(estado.aberta).toBe(false);
    expect(estado.aceitandoPedidos).toBe(false);
    expect(estado.horarioDeHoje).toBe("06:00–20:00");
    expect(estado.reabreEm).toBe("amanhã às 06:00");
    expect(estado.horarioCadastrado).toBe(true);
    // A frase é a MESMA que a tarja amarela mostra — vem de buildClosedMessage.
    expect(estado.mensagem).toContain("Estamos fechados no momento");
    expect(estado.mensagem).toContain("06:00–20:00");
  });

  it("o aviso nomeia a ação proibida — não basta dizer 'está fechada'", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa:    semPausa,
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T23:49:00"),
    });
    const avisos = avisosDoEstadoDaLoja(estado).join(" ");

    expect(avisos).toMatch(/PROIBIDO/);
    expect(avisos).toMatch(/telefone/i);
    expect(avisos).toMatch(/endereço/i);
    expect(avisos).toMatch(/pagamento/i);
    // E diz o que fazer no lugar — proteção que só proíbe deixa o agente mudo.
    expect(avisos).toMatch(/carrinho/i);
    expect(avisos).toMatch(/amanhã às 06:00/);
  });

  it("turno partido: 16:00 entre 11–15 e 18–23 está fechado e reabre HOJE", () => {
    const horarios: LinhaDeHorario[] = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d, isOpen: true, openTime: "11:00", closeTime: "23:00",
      periodsJson: [{ open: "11:00", close: "15:00" }, { open: "18:00", close: "23:00" }],
    }));
    const estado = calcularEstadoDaLoja({
      horarios, pausa: semPausa, timezone: TZ, agora: emSaoPaulo("2026-08-05T16:00:00"),
    });

    expect(estado.aberta).toBe(false);
    expect(estado.horarioDeHoje).toBe("11:00–15:00 e 18:00–23:00");
    expect(estado.reabreEm).toBe("hoje às 18:00");
  });

  it("dentro do horário mas com pedidos pausados: NÃO aceita, e a frase fala da pausa", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa: {
        isOrderingPaused:     true,
        orderingPausedUntil:  emSaoPaulo("2026-08-05T15:00:00"),
        orderingPausedReason: "Cozinha em manutenção",
      },
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T12:00:00"),
    });

    expect(estado.aberta).toBe(true);            // o horário permite
    expect(estado.pedidosPausados).toBe(true);   // o lojista bloqueou
    expect(estado.aceitandoPedidos).toBe(false); // e é isto que governa
    expect(estado.motivoDaPausa).toBe("Cozinha em manutenção");
    expect(estado.mensagem).toContain("pausados");
    expect(estado.mensagem).toContain("Cozinha em manutenção");
    // Não pode dizer "estamos fechados": a loja está aberta, quem parou foi o pedido.
    expect(estado.mensagem).not.toContain("Estamos fechados");
    expect(avisosDoEstadoDaLoja(estado)).toHaveLength(1);
  });

  it("dia marcado como fechado: horário de hoje é 'fechado hoje'", () => {
    const horarios = semana();
    horarios[3] = { dayOfWeek: 3, isOpen: false, openTime: "06:00", closeTime: "20:00", periodsJson: null };
    const estado = calcularEstadoDaLoja({
      horarios, pausa: semPausa, timezone: TZ, agora: emSaoPaulo("2026-08-05T12:00:00"), // 05/08 é quarta
    });

    expect(estado.aberta).toBe(false);
    expect(estado.horarioDeHoje).toBe("fechado hoje");
    expect(estado.reabreEm).toBe("amanhã às 06:00");
  });
});

describe("EstadoDaLoja — a metade que DEIXA PASSAR (senão o detector vira carimbo)", () => {
  it("12:00 dentro do horário: aceita pedido, sem mensagem e sem aviso nenhum", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa:    semPausa,
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T12:00:00"),
    });

    expect(estado.aberta).toBe(true);
    expect(estado.aceitandoPedidos).toBe(true);
    expect(estado.pedidosPausados).toBe(false);
    expect(estado.mensagem).toBeNull();
    expect(estado.reabreEm).toBeNull();
    expect(avisosDoEstadoDaLoja(estado)).toEqual([]);
  });

  it("pausa com prazo VENCIDO não é pausa — o estado sem prazo é que vazaria", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa: {
        isOrderingPaused:     true,
        orderingPausedUntil:  emSaoPaulo("2026-08-05T10:00:00"), // já passou
        orderingPausedReason: "Fila cheia",
      },
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T12:00:00"),
    });

    expect(estado.pedidosPausados).toBe(false);
    expect(estado.aceitandoPedidos).toBe(true);
    expect(estado.motivoDaPausa).toBeNull();
    expect(avisosDoEstadoDaLoja(estado)).toEqual([]);
  });

  it("borda de abertura: às 06:00 em ponto já está aberta", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(), pausa: semPausa, timezone: TZ, agora: emSaoPaulo("2026-08-05T06:00:00"),
    });
    expect(estado.aceitandoPedidos).toBe(true);
  });

  it("borda de fechamento: às 20:00 em ponto já está fechada", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(), pausa: semPausa, timezone: TZ, agora: emSaoPaulo("2026-08-05T20:00:00"),
    });
    expect(estado.aceitandoPedidos).toBe(false);
  });
});

describe("EstadoDaLoja — ausência de cadastro não vira fato", () => {
  it("sem horário cadastrado o sistema trata como aberta, mas a ficha marca que é suposição", () => {
    const estado = calcularEstadoDaLoja({
      horarios: [], pausa: semPausa, timezone: TZ, agora: emSaoPaulo("2026-08-05T23:49:00"),
    });

    // Comportamento do sistema (isOpenFromRow sem row = sem restrição) — preservado.
    expect(estado.aberta).toBe(true);
    expect(estado.aceitandoPedidos).toBe(true);
    // Mas quem lê a ficha precisa saber que "aberta" aqui não veio de cadastro.
    expect(estado.horarioCadastrado).toBe(false);
    expect(estado.horarioDeHoje).toBe("não cadastrado");
  });

  it("pausa sem prazo é pausa por tempo indeterminado, não pausa vencida", () => {
    const estado = calcularEstadoDaLoja({
      horarios: semana(),
      pausa: { isOrderingPaused: true, orderingPausedUntil: null, orderingPausedReason: null },
      timezone: TZ,
      agora:    emSaoPaulo("2026-08-05T12:00:00"),
    });
    expect(estado.pedidosPausados).toBe(true);
    expect(estado.pausadoAte).toBeNull();
    expect(estado.aceitandoPedidos).toBe(false);
  });
});

describe("EstadoDaLoja — o fuso é o do restaurante, não o da máquina", () => {
  it("mesmo instante: fechado em São Paulo, aberto em Manaus (uma hora atrás)", () => {
    // 06:30 em São Paulo = 05:30 em Manaus. Horário 06:00–20:00.
    const instante = emSaoPaulo("2026-08-05T06:30:00");
    const sp = calcularEstadoDaLoja({ horarios: semana(), pausa: semPausa, timezone: TZ, agora: instante });
    const manaus = calcularEstadoDaLoja({ horarios: semana(), pausa: semPausa, timezone: "America/Manaus", agora: instante });

    expect(sp.aberta).toBe(true);
    expect(manaus.aberta).toBe(false);
    expect(manaus.reabreEm).toBe("hoje às 06:00");
  });
});
