/**
 * DiarioDoSdr — o que aconteceu em cada turno da entrevista, sem o que foi dito.
 *
 * ── Por que este arquivo vem ANTES de qualquer ligação de canal ──────────────
 * O `SdrDiagnostic` prova que as travas seguram: ele roda sem banco e sem IA e
 * responde "as regras estão de pé?". O que ele NÃO responde é "o que aconteceu
 * ontem com o dono de restaurante que escreveu?". São perguntas diferentes, e a
 * segunda não tinha nenhum instrumento nesta casa. Enquanto ela não tiver, ligar
 * o envio significa deixar a IA falar com um estranho em nome da empresa sem
 * ninguém do lado de cá conseguindo dizer, depois, se deu certo.
 *
 * Espelha o diário do piloto da casa irmã, com as mesmas quatro decisões:
 *   1. SOMENTE LEITURA — ele não muda nada, nunca, em lugar nenhum.
 *   2. CONTAGEM ANTES DA LISTA — quem lê precisa do tamanho do problema antes
 *      do caso a caso, senão lê dez linhas e acha que viu tudo.
 *   3. FAIL-CLOSED com segredo próprio — quem guarda a porta é a rota.
 *   4. CEGUEIRAS DECLARADAS — o diário diz, ele mesmo, o que não enxerga. Um
 *      painel que cala sobre o próprio limite é lido como se fosse completo, e
 *      aí a ausência de alarme vira "está tudo bem" (guardrail 1).
 *
 * ── O que este diário NUNCA guarda ──────────────────────────────────────────
 * Conteúdo de mensagem de cliente. Nem a pergunta redigida, nem a resposta, nem
 * o valor que entrou no campo. Guarda a FORMA e o DESFECHO: a IA respondeu ou
 * não e por quê, quantos campos o motor de regras preencheu no lugar dela, e se
 * a conversa andou. A identidade da conversa entra como impressão digital
 * (hash), porque o `clienteId` pode ser um telefone.
 */

import { createHash } from "crypto";
import type { MotivoDeFalhaDaIA } from "../engines/FalhaDeMotor";
import { explicarMotivo } from "../engines/FalhaDeMotor";

/** Quantos turnos ficam guardados. Passou disso, o mais antigo cai. */
export const TETO_DE_TURNOS = 300;

export interface TurnoDoDiario {
  /** Quando o turno aconteceu (ISO, UTC). */
  quando: string;
  /** Impressão digital da conversa — permite agrupar sem identificar ninguém. */
  conversa: string;
  /** A IA devolveu leitura utilizável neste turno? */
  iaRespondeu: boolean;
  /** Por que ela não respondeu. `null` quando respondeu. */
  motivoSemIA: MotivoDeFalhaDaIA | null;
  /** Quantos campos a IA preencheu. */
  camposPelaIA: number;
  /** Quantos campos o motor de regras preencheu no lugar dela. */
  camposPeloMotor: number;
  /** QUAIS campos o motor preencheu. Só o nome da chave — nunca o valor. */
  chavesPeloMotor: string[];
  /** Quantas perguntas estavam no ar quando o cliente respondeu. */
  perguntasNoAr: number;
  /** Quantas dessas continuaram sem resposta depois do turno. */
  seguemSemResposta: number;
  /** Havia pergunta no ar e nada foi entendido — a conversa não andou. */
  travou: boolean;
  /** Cobertura da sondagem depois do turno (0 a 1). */
  cobertura: number;
  podePropor: boolean;
}

export interface ResumoDoDiario {
  /** Sempre primeiro: o tamanho do que aconteceu. */
  contagens: {
    turnos: number;
    conversas: number;
    turnosComIA: number;
    turnosSemIA: number;
    turnosQueTravaram: number;
    camposPelaIA: number;
    camposPeloMotor: number;
    /** Quantas vezes cada motivo de falha apareceu. */
    porMotivo: Record<string, number>;
  };
  /** O motivo de falha em português, para quem lê sem abrir o código. */
  motivosExplicados: Record<string, string>;
  primeiroTurnoEm: string | null;
  ultimoTurnoEm: string | null;
  /** O que o diário NÃO consegue enxergar. Guardrail 1, escrito. */
  cegueiras: string[];
  /** Os turnos, do mais recente para o mais antigo. */
  turnos: TurnoDoDiario[];
}

/**
 * As cegueiras. Ficam no código, ao lado do que as causa, para saírem da lista
 * no dia em que deixarem de ser verdade — uma cegueira que já foi resolvida e
 * continua declarada é tão ruim quanto uma escondida.
 */
export const CEGUEIRAS: string[] = [
  "Vive na memória do processo: reinício, deploy ou segunda instância zeram o diário. Turno que não está aqui NÃO significa turno que não aconteceu.",
  "Não guarda nada do que foi dito — nem pergunta, nem resposta, nem valor de campo. Serve para saber SE a conversa andou, nunca para julgar o que a IA escreveu.",
  "Não sabe se a mensagem chegou à pessoa: o envio está desligado e o diário só enxerga o turno da entrevista, não o WhatsApp.",
  "Não julga qualidade: um campo preenchido pela IA aparece como preenchido mesmo que tenha sido mal interpretado.",
  "Só registra turnos que passaram pelo SdrService. Qualquer chamada direta ao Entrevistador fica de fora.",
  "Não cobre o lead que chegou pelo formulário e nunca teve turno nenhum — para esse, o funil do CRM é a fonte.",
];

/** Impressão digital estável da conversa. Curta de propósito: serve para agrupar. */
export function impressaoDaConversa(chave: string): string {
  return createHash("sha256").update(`sdr-diario:${chave}`).digest("hex").slice(0, 12);
}

const turnos: TurnoDoDiario[] = [];

export interface RegistroDeTurno {
  chave: string;
  iaRespondeu: boolean;
  motivoSemIA?: MotivoDeFalhaDaIA | undefined;
  entendido: { chave: string; origem: "motor" | "ia" }[];
  perguntasNoAr: number;
  seguemSemResposta: number;
  travou: boolean;
  cobertura: number;
  podePropor: boolean;
  agora?: Date;
}

/**
 * Anota um turno. NUNCA lança: um diário que derruba a entrevista que ele
 * observa é pior que um diário vazio (guardrail 5 — a proteção não pode ser
 * mais destrutiva que o problema).
 */
export function registrarTurno(r: RegistroDeTurno): void {
  try {
    const pelaIA = r.entendido.filter((e) => e.origem === "ia");
    const peloMotor = r.entendido.filter((e) => e.origem === "motor");
    turnos.push({
      quando: (r.agora ?? new Date()).toISOString(),
      conversa: impressaoDaConversa(r.chave),
      iaRespondeu: r.iaRespondeu,
      motivoSemIA: r.iaRespondeu ? null : (r.motivoSemIA ?? "desconhecido"),
      camposPelaIA: pelaIA.length,
      camposPeloMotor: peloMotor.length,
      chavesPeloMotor: peloMotor.map((e) => e.chave),
      perguntasNoAr: r.perguntasNoAr,
      seguemSemResposta: r.seguemSemResposta,
      travou: r.travou,
      cobertura: r.cobertura,
      podePropor: r.podePropor,
    });
    while (turnos.length > TETO_DE_TURNOS) turnos.shift();
  } catch (e) {
    console.error("[sdr-diario] não consegui anotar o turno:", e);
  }
}

/** O diário inteiro: contagens primeiro, cegueiras declaradas, lista por último. */
export function lerDiario(limite = 50): ResumoDoDiario {
  const porMotivo: Record<string, number> = {};
  let camposPelaIA = 0;
  let camposPeloMotor = 0;
  let turnosComIA = 0;
  let turnosQueTravaram = 0;
  const conversas = new Set<string>();

  for (const t of turnos) {
    conversas.add(t.conversa);
    camposPelaIA += t.camposPelaIA;
    camposPeloMotor += t.camposPeloMotor;
    if (t.iaRespondeu) turnosComIA++;
    if (t.travou) turnosQueTravaram++;
    if (t.motivoSemIA) porMotivo[t.motivoSemIA] = (porMotivo[t.motivoSemIA] ?? 0) + 1;
  }

  const motivosExplicados: Record<string, string> = {};
  for (const m of Object.keys(porMotivo)) motivosExplicados[m] = explicarMotivo(m as MotivoDeFalhaDaIA);

  const teto = Math.max(1, Math.min(limite, TETO_DE_TURNOS));

  return {
    contagens: {
      turnos: turnos.length,
      conversas: conversas.size,
      turnosComIA,
      turnosSemIA: turnos.length - turnosComIA,
      turnosQueTravaram,
      camposPelaIA,
      camposPeloMotor,
      porMotivo,
    },
    motivosExplicados,
    primeiroTurnoEm: turnos[0]?.quando ?? null,
    ultimoTurnoEm: turnos[turnos.length - 1]?.quando ?? null,
    cegueiras: CEGUEIRAS,
    turnos: [...turnos].reverse().slice(0, teto),
  };
}

/** Zera o diário. Para teste — em produção ninguém apaga registro. */
export function limparDiario(): void {
  turnos.length = 0;
}
