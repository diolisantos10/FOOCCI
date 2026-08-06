/**
 * EstadoDaLoja — o estado operacional da loja como FATO da ficha de verdade.
 *
 * ─── O caso que originou este arquivo ────────────────────────────────────────
 * 05/08/2026, 23:49, cardápio do Sushi Cazza. A loja estava FECHADA (horário
 * 06:00–20:00) e a tarja amarela na tela dizia, com todas as letras, "pedidos
 * ficam pausados até reabrirmos". Logo abaixo, o agente insistia:
 *
 *     "Pra fechar o pedido preciso do seu WhatsApp"
 *
 * Ele conduzia a cliente a entregar o telefone para uma ação que o sistema já
 * tinha bloqueado. O agente não mentiu sobre o restaurante — mentiu sobre SI
 * MESMO, encenando uma capacidade (fechar pedido) que ele não tinha naquele
 * momento. É o mesmo modo de falha de `promessaDePedido`, e verificador de fato
 * não pega (`docs/decisoes.md` — "Mentir sobre si mesmo é uma categoria de erro
 * separada").
 *
 * A causa: o estado da loja NUNCA chegou à ficha. A tarja sabia; o agente não.
 *
 * ─── Por que este módulo é puro e por que ele NÃO recalcula nada ─────────────
 * A tarja amarela já calcula esse estado em `src/app/pedido/[slug]/page.tsx`
 * (linhas 287–311) usando `src/lib/business-hours.ts`. Duas fontes divergem em
 * três meses — então aqui NÃO existe régua de horário nova: `isOpenFromRow`,
 * `getPeriodsForRow`, `getNextOpenAt` e `buildClosedMessage` são importados da
 * MESMA biblioteca que a tela usa. Este módulo só traduz o resultado para o
 * vocabulário da ficha.
 *
 * Puro: sem banco, sem I/O, sem `new Date()` escondido (o `agora` entra por
 * parâmetro). Testável em qualquer horário do dia — que é o mínimo para um
 * módulo cujo defeito só aparecia às 23:49.
 */

import {
  buildClosedMessage,
  getNextOpenAt,
  getPeriodsForRow,
  isOpenFromRow,
} from "@/lib/business-hours";

/** Uma linha de `BusinessHours`, exatamente como o banco devolve. */
export interface LinhaDeHorario {
  dayOfWeek:   number;
  isOpen:      boolean;
  openTime:    string;
  closeTime:   string;
  periodsJson: unknown;
}

/** A pausa de emergência, como está no `Restaurant`. */
export interface PausaDePedidos {
  isOrderingPaused:     boolean;
  orderingPausedUntil:  Date | null;
  orderingPausedReason: string | null;
}

/**
 * O estado da loja do jeito que o agente precisa ler.
 *
 * `aberta` e `aceitandoPedidos` são coisas DIFERENTES de propósito: a loja pode
 * estar dentro do horário e mesmo assim com os pedidos pausados pelo lojista. O
 * que governa "posso pedir o telefone do cliente?" é `aceitandoPedidos`.
 */
export interface EstadoDaLoja {
  /** Dentro do horário de funcionamento de hoje. */
  aberta: boolean;
  /** Aberta E sem pausa de emergência. É ISTO que autoriza fechar pedido. */
  aceitandoPedidos: boolean;
  /** O horário de hoje, legível: "06:00–20:00", "11:00–15:00 e 18:00–23:00", "fechado hoje". */
  horarioDeHoje: string;
  /** Quando reabre: "hoje às 18:00", "amanhã às 06:00", "segunda-feira às 11:00". */
  reabreEm: string | null;
  /** Pausa de emergência do lojista (independe do horário). */
  pedidosPausados: boolean;
  /** O motivo que o lojista escreveu, quando escreveu. */
  motivoDaPausa: string | null;
  /** Até quando a pausa vale (ISO). `null` = por tempo indeterminado. */
  pausadoAte: string | null;
  /**
   * A frase pronta, montada pela MESMA função da tarja amarela
   * (`buildClosedMessage`). `null` quando a loja aceita pedidos — não existe
   * frase de loja fechada para uma loja aberta.
   */
  mensagem: string | null;
  /**
   * O lojista cadastrou horário para hoje?
   *
   * Guardrail 1 aplicado ao próprio módulo: sem linha de `BusinessHours`, o
   * sistema TRATA a loja como aberta (`isOpenFromRow` devolve `true` sem row) —
   * mas isso é uma decisão do sistema, não um fato do restaurante. Quem lê a
   * ficha precisa saber a diferença, senão "aberta: true" vira afirmação forte
   * apoiada em silêncio de cadastro.
   */
  horarioCadastrado: boolean;
}

/** "06:00–20:00" · "11:00–15:00 e 18:00–23:00" · "fechado hoje". */
function descreverHorario(periodos: Array<{ open: string; close: string }>): string {
  if (periodos.length === 0) return "fechado hoje";
  return periodos.map((p) => `${p.open}–${p.close}`).join(" e ");
}

/** "hoje às 18:00" · "amanhã às 06:00" · "segunda-feira às 11:00". */
function descreverReabertura(proxima: { dayLabel: string; time: string } | null): string | null {
  if (!proxima) return null;
  return `${proxima.dayLabel} às ${proxima.time}`;
}

/**
 * Calcula o estado da loja no instante `agora`.
 *
 * A pausa de emergência segue a MESMA regra da tela e da API de pausa
 * (`src/app/pedido/[slug]/page.tsx:307-310`,
 * `src/app/api/settings/store/pause/route.ts:80`): pausa com prazo vencido não
 * é pausa. Um estado sem prazo é um vazamento — e um prazo vencido que continua
 * valendo é o mesmo vazamento pelo outro lado.
 */
export function calcularEstadoDaLoja(params: {
  horarios: readonly LinhaDeHorario[];
  pausa:    PausaDePedidos | null;
  timezone: string;
  agora:    Date;
}): EstadoDaLoja {
  const { horarios, pausa, timezone, agora } = params;

  const local     = new Date(agora.toLocaleString("en-US", { timeZone: timezone }));
  const diaDeHoje = local.getDay();
  const minutoDeAgora = local.getHours() * 60 + local.getMinutes();

  const linhaDeHoje = horarios.find((h) => h.dayOfWeek === diaDeHoje) ?? null;
  const aberta      = isOpenFromRow(linhaDeHoje, timezone, agora);
  const periodos    = linhaDeHoje ? getPeriodsForRow(linhaDeHoje) : [];
  const proxima     = aberta ? null : getNextOpenAt([...horarios], diaDeHoje, minutoDeAgora);

  const pausadoAteData = pausa?.orderingPausedUntil ?? null;
  const pedidosPausados =
    (pausa?.isOrderingPaused ?? false) &&
    (pausadoAteData === null || pausadoAteData > agora);

  const aceitandoPedidos = aberta && !pedidosPausados;

  // A frase da tarja amarela, da MESMA função. Quando o bloqueio é a pausa (e
  // não o horário), a frase de horário seria enganosa — aí a mensagem descreve
  // a pausa, com o motivo que o lojista escreveu e o prazo que ele deu.
  let mensagem: string | null = null;
  if (pedidosPausados) {
    const motivo = pausa?.orderingPausedReason?.trim();
    const ate = pausadoAteData
      ? ` Previsão de voltar: ${pausadoAteData.toLocaleTimeString("pt-BR", {
          hour: "2-digit", minute: "2-digit", timeZone: timezone,
        })}.`
      : "";
    mensagem = `Os pedidos estão pausados no momento.${motivo ? ` ${motivo}.` : ""}${ate}`;
  } else if (!aberta) {
    mensagem = buildClosedMessage(periodos, proxima);
  }

  return {
    aberta,
    aceitandoPedidos,
    horarioDeHoje:     linhaDeHoje ? descreverHorario(periodos) : "não cadastrado",
    reabreEm:          descreverReabertura(proxima),
    pedidosPausados,
    motivoDaPausa:     pedidosPausados ? (pausa?.orderingPausedReason ?? null) : null,
    pausadoAte:        pedidosPausados && pausadoAteData ? pausadoAteData.toISOString() : null,
    mensagem,
    horarioCadastrado: linhaDeHoje !== null,
  };
}

/**
 * O que o agente NÃO pode fazer com a loja neste estado.
 *
 * Prompt é aviso, não trava — a trava de verdade mora em quem executa o
 * checkout. Mas o aviso precisa existir e precisa ser específico: "a loja está
 * fechada" sozinho não impede ninguém de pedir o telefone. O que impede é dizer
 * qual ação está proibida e qual é a ação certa no lugar dela.
 *
 * Devolve `[]` quando a loja aceita pedidos — nota de segurança que aparece
 * sempre é ruído que ninguém lê.
 */
export function avisosDoEstadoDaLoja(estado: EstadoDaLoja): string[] {
  if (estado.aceitandoPedidos) return [];

  const quando = estado.reabreEm ? ` Reabre ${estado.reabreEm}.` : "";
  return [
    `A loja NÃO está aceitando pedidos agora.${quando} ` +
      "PROIBIDO pedir telefone, endereço, forma de pagamento ou qualquer dado para fechar pedido — " +
      "a ação está bloqueada pelo sistema e o cliente entregaria o dado à toa. " +
      "OBRIGATÓRIO: convidar a montar o carrinho à vontade e dizer quando reabre.",
  ];
}
