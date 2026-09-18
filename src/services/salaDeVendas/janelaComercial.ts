/**
 * ⭐⭐ A JANELA COMERCIAL DE ABORDAGEM — UM LUGAR SÓ, e este é o lugar.
 *
 * ── A ORDEM DO CEO, 18/09/2026 ──────────────────────────────────────────────
 *
 * *"A abordagem é a partir das nove, das nove às oito, segunda a sexta. E ao
 * sábado das nove às quatorze horas. E domingo a gente não aborda cliente."*
 *
 *   · segunda a sexta ..... 09:00–20:00
 *   · sábado .............. 09:00–14:00
 *   · domingo ............. não aborda, em hora nenhuma
 *
 * Tudo no fuso **America/Sao_Paulo**, e o fuso é EXPLÍCITO em toda leitura de
 * relógio deste arquivo. O servidor roda em UTC: `getHours()` daria 20h em
 * Londres às 17h em São Paulo, e a máquina começaria a calar três horas cedo —
 * ou, na direção contrária, bateria na porta de alguém às 23h achando que eram
 * 20h. Nunca `getHours()`, nunca o fuso da máquina.
 *
 * ── ⛔ ISTO VALE PARA ABORDAGEM. NÃO VALE PARA CONVERSA. ────────────────────
 *
 * A janela barra **NÓS INICIARMOS** uma conversa. Ela não barra, e não pode
 * barrar, **NÓS RESPONDERMOS** a quem nos escreveu.
 *
 * Quem manda mensagem para a casa às 22h de um domingo está com o celular na
 * mão, esperando. Calar com essa pessoa em nome do "horário comercial" seria
 * usar contra ela a proteção que existe para proteger quem NÃO nos chamou — e
 * do lado de fora não parece cuidado, parece abandono.
 *
 * Por isso este módulo NÃO é chamado por nenhum caminho de resposta:
 * `salaDeVendas/ta/atender.ts` (o atendimento a quem escreveu) continua com a
 * janela configurável dele, e `reabordagem/portaDeEnvio.naJanela` só é
 * alcançada depois que esta função já liberou o ATO DE INICIAR.
 *
 * Quem for ligar esta função em algum lugar novo, a pergunta é uma só:
 * **quem começou a conversa?** Se foi a casa, passa por aqui. Se foi a pessoa,
 * não passa — nunca.
 *
 * ── ⛔ FAIL-CLOSED ──────────────────────────────────────────────────────────
 *
 * Não conseguir determinar a hora, o dia ou o fuso = **NÃO ABORDA**. Fuso
 * inválido, relógio ilegível, variável de ambiente malformada: todos caem na
 * mesma recusa, com o detalhe escrito. Ausência de informação não é informação,
 * e na dúvida a casa fica calada em vez de bater na porta de um estranho na
 * madrugada.
 *
 * ⛔ Função PURA: sem banco, sem rede, sem relógio próprio (o `agora` entra por
 * parâmetro). É por isso que ela pode ser provada hora a hora, nas bordas.
 */

/** O fuso da ordem. Trocável por variável, mas este é o padrão da casa. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** O nome da recusa. Enumerado: motivo em texto livre não vira conta. */
export const MOTIVO_FORA_DA_JANELA = "foraDaJanelaComercial" as const;
export type MotivoForaDaJanela = typeof MOTIVO_FORA_DA_JANELA;

/** Um intervalo do dia, em minutos desde a meia-noite local. `null` = dia fechado. */
export interface FaixaDoDia {
  inicioMin: number;
  fimMin: number;
}

/** A janela inteira: uma faixa (ou `null`) para cada dia, 0=domingo … 6=sábado. */
export type JanelaComercial = readonly (FaixaDoDia | null)[];

function faixa(inicio: string, fim: string): FaixaDoDia {
  return { inicioMin: emMinutos(inicio), fimMin: emMinutos(fim) };
}

function emMinutos(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/**
 * ⭐ O PADRÃO, e ele vale SEM NENHUMA VARIÁVEL SETADA.
 *
 * Um padrão que só funciona depois que alguém configura o ambiente não é
 * padrão: é uma bomba-relógio esperando o primeiro deploy em que ninguém se
 * lembrou. A ordem do CEO está escrita aqui, em código, e o ambiente só serve
 * para ajustá-la.
 */
export const JANELA_PADRAO: JanelaComercial = [
  null,                      // 0 domingo — não aborda, em hora nenhuma
  faixa("09:00", "20:00"),   // 1 segunda
  faixa("09:00", "20:00"),   // 2 terça
  faixa("09:00", "20:00"),   // 3 quarta
  faixa("09:00", "20:00"),   // 4 quinta
  faixa("09:00", "20:00"),   // 5 sexta
  faixa("09:00", "14:00"),   // 6 sábado
];

export const VARIAVEL_SEMANA = "FOOCCI_JANELA_COMERCIAL_SEMANA";
export const VARIAVEL_SABADO = "FOOCCI_JANELA_COMERCIAL_SABADO";
export const VARIAVEL_DOMINGO = "FOOCCI_JANELA_COMERCIAL_DOMINGO";
export const VARIAVEL_FUSO = "FOOCCI_JANELA_COMERCIAL_FUSO";

/** `"HH:MM-HH:MM"`, ou `"fechado"`/vazio. Qualquer outra coisa é erro, não palpite. */
const FORMATO = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

type LeituraDaFaixa = { ok: true; faixa: FaixaDoDia | null } | { ok: false; erro: string };

/**
 * Lê uma faixa de uma variável de ambiente.
 *
 * ⚠️ Variável malformada **não cai no padrão**. Cair no padrão faria um erro de
 * digitação virar uma janela silenciosamente diferente da que alguém quis
 * configurar — e ninguém descobriria, porque o sistema continuaria mandando
 * mensagem. O erro sobe, e a janela fecha.
 */
function lerFaixa(bruto: string | undefined, variavel: string): LeituraDaFaixa {
  const v = (bruto ?? "").trim();
  if (v === "") return { ok: true, faixa: null }; // não setada: quem chama decide
  if (/^(fechado|nenhum|off)$/i.test(v)) return { ok: true, faixa: null };

  const m = FORMATO.exec(v);
  if (!m) {
    return { ok: false, erro: `${variavel}="${v}" não está no formato "HH:MM-HH:MM" (ou "fechado")` };
  }
  const inicioMin = parseInt(m[1] ?? "", 10) * 60 + parseInt(m[2] ?? "", 10);
  const fimMin = parseInt(m[3] ?? "", 10) * 60 + parseInt(m[4] ?? "", 10);
  if (!Number.isInteger(inicioMin) || !Number.isInteger(fimMin)) {
    return { ok: false, erro: `${variavel}="${v}" tem hora ilegível` };
  }
  if (inicioMin > 24 * 60 || fimMin > 24 * 60) {
    return { ok: false, erro: `${variavel}="${v}" tem hora fora de 00:00–24:00` };
  }
  if (fimMin <= inicioMin) {
    return { ok: false, erro: `${variavel}="${v}" termina antes de começar — janela vazia não é janela` };
  }
  return { ok: true, faixa: { inicioMin, fimMin } };
}

export type LeituraDaJanela =
  | { ok: true; janela: JanelaComercial; fuso: string }
  | { ok: false; erro: string };

/**
 * A janela que vale, lida do ambiente com o padrão da casa por baixo.
 *
 * Variável ausente = vale o padrão. Variável presente e malformada = a leitura
 * FALHA, e quem chama não aborda ninguém.
 */
export function janelaDoAmbiente(env: NodeJS.ProcessEnv = process.env): LeituraDaJanela {
  const fuso = (env[VARIAVEL_FUSO] ?? "").trim() || FUSO_PADRAO;

  const semana = lerFaixa(env[VARIAVEL_SEMANA], VARIAVEL_SEMANA);
  if (!semana.ok) return { ok: false, erro: semana.erro };
  const sabado = lerFaixa(env[VARIAVEL_SABADO], VARIAVEL_SABADO);
  if (!sabado.ok) return { ok: false, erro: sabado.erro };
  const domingo = lerFaixa(env[VARIAVEL_DOMINGO], VARIAVEL_DOMINGO);
  if (!domingo.ok) return { ok: false, erro: domingo.erro };

  const temSemana = (env[VARIAVEL_SEMANA] ?? "").trim() !== "";
  const temSabado = (env[VARIAVEL_SABADO] ?? "").trim() !== "";
  const temDomingo = (env[VARIAVEL_DOMINGO] ?? "").trim() !== "";

  const diaDeSemana = temSemana ? semana.faixa : (JANELA_PADRAO[1] ?? null);
  const janela: JanelaComercial = [
    temDomingo ? domingo.faixa : (JANELA_PADRAO[0] ?? null),
    diaDeSemana, diaDeSemana, diaDeSemana, diaDeSemana, diaDeSemana,
    temSabado ? sabado.faixa : (JANELA_PADRAO[6] ?? null),
  ];

  return { ok: true, janela, fuso };
}

/** O que o relógio da casa diz, no fuso pedido. `null` = não deu para ler. */
export interface AgoraEmSaoPaulo {
  /** 0=domingo … 6=sábado. */
  dia: number;
  hora: number;
  minuto: number;
  /** Minutos desde a meia-noite local. */
  minutosDoDia: number;
}

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Lê dia da semana e hora no fuso pedido, com `Intl`.
 *
 * `hourCycle: "h23"` e não `hour12: false`: o segundo NÃO fixa o ciclo, e o
 * mesmo código já devolveu `00` numa máquina e `24` noutra, conforme o ICU do
 * Node. A meia-noite é justamente onde isso estraga tudo.
 *
 * Devolve `null` quando o fuso é inválido ou a leitura sai ilegível — e `null`
 * vira recusa lá em cima, nunca um palpite.
 */
export function agoraNoFuso(agora: Date, fuso: string): AgoraEmSaoPaulo | null {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return null;
  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(agora);

    const nomeDoDia = partes.find((p) => p.type === "weekday")?.value;
    const hh = partes.find((p) => p.type === "hour")?.value;
    const mm = partes.find((p) => p.type === "minute")?.value;
    if (nomeDoDia === undefined || hh === undefined || mm === undefined) return null;

    const dia = DIAS[nomeDoDia];
    const hora = parseInt(hh, 10) % 24;
    const minuto = parseInt(mm, 10);
    if (dia === undefined || !Number.isInteger(hora) || !Number.isInteger(minuto)) return null;

    return { dia, hora, minuto, minutosDoDia: hora * 60 + minuto };
  } catch {
    // Fuso inválido faz `Intl` lançar. Fail-closed: quem não sabe a hora não fala.
    return null;
  }
}

export type DecisaoDaJanela =
  | { pode: true; detalhe: string }
  | { pode: false; motivo: MotivoForaDaJanela; detalhe: string };

const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function doisDigitos(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function comoHora(min: number): string {
  return `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;
}

/**
 * ⭐ A PERGUNTA, e a única resposta: **a casa pode ABORDAR agora?**
 *
 * A borda é `inicio <= agora < fim`, e isso é regra, não detalhe: às 20:00 em
 * ponto a janela FECHA. Tratar `<= fim` faria a máquina mandar mensagem às
 * 20h59 alegando "até as vinte", que é exatamente o que o CEO proibiu.
 */
export function podeAbordarAgora(
  agora: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): DecisaoDaJanela {
  const lida = janelaDoAmbiente(env);
  if (!lida.ok) {
    return {
      pode: false,
      motivo: MOTIVO_FORA_DA_JANELA,
      detalhe: `não foi possível determinar a janela comercial (${lida.erro}) — fail-closed: não aborda.`,
    };
  }

  const local = agoraNoFuso(agora, lida.fuso);
  if (!local) {
    return {
      pode: false,
      motivo: MOTIVO_FORA_DA_JANELA,
      detalhe:
        `não foi possível ler a hora no fuso "${lida.fuso}" — fail-closed: sem saber que horas são ` +
        "na casa das pessoas, não se aborda ninguém.",
    };
  }

  const doDia = lida.janela[local.dia] ?? null;
  const agoraEscrito = `${NOME_DO_DIA[local.dia] ?? "?"} ${doisDigitos(local.hora)}:${doisDigitos(local.minuto)}`;

  if (!doDia) {
    return {
      pode: false,
      motivo: MOTIVO_FORA_DA_JANELA,
      detalhe: `${agoraEscrito} (${lida.fuso}): a casa não aborda cliente neste dia.`,
    };
  }

  if (local.minutosDoDia < doDia.inicioMin || local.minutosDoDia >= doDia.fimMin) {
    return {
      pode: false,
      motivo: MOTIVO_FORA_DA_JANELA,
      detalhe:
        `${agoraEscrito} (${lida.fuso}) está fora da janela de abordagem deste dia ` +
        `(${comoHora(doDia.inicioMin)}–${comoHora(doDia.fimMin)}).`,
    };
  }

  return {
    pode: true,
    detalhe:
      `${agoraEscrito} (${lida.fuso}) está dentro da janela de abordagem ` +
      `(${comoHora(doDia.inicioMin)}–${comoHora(doDia.fimMin)}).`,
  };
}

/** Açúcar para quem só quer o booleano invertido, no molde do resto da casa. */
export function foraDaJanelaComercial(
  agora: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !podeAbordarAgora(agora, env).pode;
}
