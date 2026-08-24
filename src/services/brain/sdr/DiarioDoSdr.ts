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

/** Quantos turnos a memória em processo segura (reserva). O banco não tem teto. */
export const TETO_DE_TURNOS = 300;

/** Janela padrão que as contagens cobrem. Além dela, o turno segue guardado. */
export const JANELA_PADRAO_DIAS = 14;

/** Depois disto o turno é descartado. Diário não é arquivo eterno. */
export const RETENCAO_EM_DIAS = 90;

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
  /** Onde este diário está guardado — banco (sobrevive ao deploy) ou memória. */
  onde: "banco" | "memoria";
  /** Quantos dias para trás as contagens cobrem. */
  janelaDias: number;
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
  "Não guarda nada do que foi dito — nem pergunta, nem resposta, nem valor de campo. Serve para saber SE a conversa andou, nunca para julgar o que a IA escreveu.",
  "Não sabe se a mensagem chegou à pessoa: o envio está desligado e o diário só enxerga o turno da entrevista, não o WhatsApp.",
  "Não julga qualidade: um campo preenchido pela IA aparece como preenchido mesmo que tenha sido mal interpretado.",
  "Só registra turnos que passaram pelo SdrService. Qualquer chamada direta ao Entrevistador fica de fora.",
  "Não cobre o lead que chegou pelo formulário e nunca teve turno nenhum — para esse, o funil do CRM é a fonte.",
  "As contagens cobrem a janela pedida e no máximo 5.000 turnos dela. Passando disso, elas subestimam — e não avisam sozinhas.",
];

/** A cegueira que só existe quando o diário NÃO está no banco. */
export const CEGUEIRA_DA_MEMORIA =
  "Este diário está na MEMÓRIA DO PROCESSO, não no banco: reinício, deploy ou segunda instância zeram tudo. Turno que não está aqui NÃO significa turno que não aconteceu.";

/** A cegueira que existe mesmo com banco: o que não foi gravado se perde. */
export const CEGUEIRA_DA_GRAVACAO =
  "Turno cuja gravação falhou não aparece aqui — a falha vai para o log do servidor, com a palavra sdr-diario.";

/** Impressão digital estável da conversa. Curta de propósito: serve para agrupar. */
export function impressaoDaConversa(chave: string): string {
  return createHash("sha256").update(`sdr-diario:${chave}`).digest("hex").slice(0, 12);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Onde o diário fica guardado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A porta de armazenamento. Mesmo molde da `MemoriaDaEntrevista`: memória em
 * processo para teste, Prisma em produção, e um resolvedor que escolhe sozinho.
 *
 * ── Por que o diário saiu da memória e foi para o banco ─────────────────────
 * A primeira versão vivia só em memória, e isso estava declarado como cegueira.
 * Mas um instrumento que perde tudo a cada deploy responde "o que aconteceu no
 * último minuto?", e a pergunta que importa é "o que aconteceu na semana?" — é
 * ela que decide se o SDR pode falar com gente de verdade. O custo de persistir
 * foi uma tabela e uma migração; o custo de não persistir era o instrumento não
 * servir para a decisão que ele existe para sustentar.
 */
export interface ArquivoDoDiario {
  gravar(turno: TurnoDoDiario): Promise<void>;
  /** Os turnos da janela, do mais antigo para o mais recente. */
  ler(desde: Date): Promise<TurnoDoDiario[]>;
  onde: "banco" | "memoria";
}

/** Teto de turnos que uma leitura carrega. Vira cegueira declarada, não surpresa. */
export const TETO_DE_LEITURA = 5_000;

class ArquivoEmProcesso implements ArquivoDoDiario {
  readonly onde = "memoria" as const;
  private readonly turnos: TurnoDoDiario[] = [];

  async gravar(turno: TurnoDoDiario): Promise<void> {
    this.turnos.push(turno);
    while (this.turnos.length > TETO_DE_TURNOS) this.turnos.shift();
  }

  async ler(desde: Date): Promise<TurnoDoDiario[]> {
    const corte = desde.toISOString();
    return this.turnos.filter((t) => t.quando >= corte);
  }

  limpar(): void {
    this.turnos.length = 0;
  }
}

const emProcesso = new ArquivoEmProcesso();
let explicito: ArquivoDoDiario | null = null;

/** Override explícito — ganha de tudo. Para teste e wiring especial. */
export function setArquivoDoDiario(arquivo: ArquivoDoDiario): void {
  explicito = arquivo;
}

/** Volta para a memória em processo, zerada. Para testes. */
export function limparDiario(): void {
  emProcesso.limpar();
  explicito = null;
}

/** Override explícito > processo (em teste) > banco (produção). */
export async function resolverArquivoDoDiario(): Promise<ArquivoDoDiario> {
  if (explicito) return explicito;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return emProcesso;
  try {
    const { prismaArquivoDoDiario } = await import("./PrismaArquivoDoDiario");
    return prismaArquivoDoDiario;
  } catch (e) {
    // Banco indisponível NÃO pode derrubar a entrevista. Cai na memória e a
    // cegueira correspondente aparece na leitura, declarada.
    console.error("[sdr-diario] sem banco; caindo para memória do processo:", e);
    return emProcesso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Escrita
// ─────────────────────────────────────────────────────────────────────────────

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

/** O turno em forma de registro, sem nenhuma palavra do cliente. */
export function montarTurno(r: RegistroDeTurno): TurnoDoDiario {
  const entendido = Array.isArray(r.entendido) ? r.entendido : [];
  const pelaIA = entendido.filter((e) => e.origem === "ia");
  const peloMotor = entendido.filter((e) => e.origem === "motor");
  return {
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
  };
}

/**
 * Anota um turno. NUNCA lança: um diário que derruba a entrevista que ele
 * observa é pior que um diário vazio (guardrail 5 — a proteção não pode ser
 * mais destrutiva que o problema). A falha vai para o log, nunca para o silêncio.
 */
export async function registrarTurno(r: RegistroDeTurno): Promise<void> {
  try {
    const arquivo = await resolverArquivoDoDiario();
    await arquivo.gravar(montarTurno(r));
  } catch (e) {
    console.error("[sdr-diario] não consegui anotar o turno:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Leitura
// ─────────────────────────────────────────────────────────────────────────────

/** As contagens e a lista, a partir dos turnos já carregados. Pura, testável. */
export function resumir(
  todos: TurnoDoDiario[],
  limite: number,
  onde: "banco" | "memoria",
  janelaDias: number,
): ResumoDoDiario {
  const porMotivo: Record<string, number> = {};
  let camposPelaIA = 0;
  let camposPeloMotor = 0;
  let turnosComIA = 0;
  let turnosQueTravaram = 0;
  const conversas = new Set<string>();

  for (const t of todos) {
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
  const cegueiras = onde === "memoria" ? [CEGUEIRA_DA_MEMORIA, ...CEGUEIRAS] : [...CEGUEIRAS, CEGUEIRA_DA_GRAVACAO];

  return {
    onde,
    janelaDias,
    contagens: {
      turnos: todos.length,
      conversas: conversas.size,
      turnosComIA,
      turnosSemIA: todos.length - turnosComIA,
      turnosQueTravaram,
      camposPelaIA,
      camposPeloMotor,
      porMotivo,
    },
    motivosExplicados,
    primeiroTurnoEm: todos[0]?.quando ?? null,
    ultimoTurnoEm: todos[todos.length - 1]?.quando ?? null,
    cegueiras,
    turnos: [...todos].reverse().slice(0, teto),
  };
}

/**
 * O diário: contagens primeiro, cegueiras declaradas, lista por último.
 *
 * Nunca lança. Se o armazenamento cair, devolve um diário VAZIO com a cegueira
 * dizendo que ele não pôde ser lido — jamais um diário limpo que parece calmo.
 */
export async function lerDiario(limite = 50, janelaDias = JANELA_PADRAO_DIAS): Promise<ResumoDoDiario> {
  const dias = Math.max(1, Math.min(janelaDias, RETENCAO_EM_DIAS));
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  try {
    const arquivo = await resolverArquivoDoDiario();
    const todos = await arquivo.ler(desde);
    return resumir(todos, limite, arquivo.onde, dias);
  } catch (e) {
    console.error("[sdr-diario] não consegui ler o diário:", e);
    const vazio = resumir([], limite, "memoria", dias);
    return {
      ...vazio,
      cegueiras: [
        "O ARMAZENAMENTO DO DIÁRIO NÃO RESPONDEU nesta leitura. Esta resposta está vazia por falha, NÃO porque nada aconteceu.",
        ...vazio.cegueiras,
      ],
    };
  }
}
