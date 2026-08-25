/**
 * QUEM CHEGOU ANTES DA SALA EXISTIR.
 *
 * ── O DEFEITO, E A CORREÇÃO DO CEO ──────────────────────────────────────────
 *
 * O backlog dizia, escrito por mim: *"a Sala abre vazia; quem já pediu
 * demonstração não aparece na tela nova"*. O CEO perguntou **"que contato
 * antigo?"** e a pergunta desmontou o item.
 *
 * Era falso. A Sala lê `SiteLead` — a MESMA tabela onde o formulário do site
 * sempre salvou. `atendidoPor` nasce `NINGUEM`, e a fila "Sem responsável"
 * filtra exatamente por isso. **Todo contato antigo aparece.** Bastava ler
 * `filtroDaFila` para ver, e eu escrevi sem ler.
 *
 * O que é verdade é menor, e é isto: o cartão abre **sem conversa e sem nota**,
 * porque nenhuma das duas existia quando a pessoa entrou. O vendedor vê nome,
 * cidade, e nada que diga se alguém já falou com ela.
 *
 * ── POR QUE NÃO EXISTE SCRIPT QUE PREENCHA ISSO ─────────────────────────────
 *
 * Pontuar retroativamente um lead cuja ficha ninguém respondeu é calcular sobre
 * o vazio — e o número sairia com a mesma cara de um número real, indistinguível
 * na tela de um score que alguém apurou. O runbook já proíbe isso por escrito.
 *
 * O que dá para fazer sem inventar nada é **dizer**: este contato é anterior à
 * Sala, entrou nesta data, veio daqui, e o silêncio dele não é abandono.
 *
 * ── A DIFERENÇA QUE ESTE ARQUIVO EXISTE PARA MANTER ─────────────────────────
 *
 * "Ninguém falou com ele" e "ele chegou antes de a gente ter onde falar" são
 * dois estados que produzem exatamente a mesma tela vazia — e cobram coisas
 * opostas do vendedor. O primeiro é uma falha de atendimento; o segundo é
 * história. Sem esta distinção, o time trata os dois igual, e vai tratar os dois
 * como o mais barato dos dois: ignorar.
 */

/**
 * Quando a Sala passou a registrar conversa.
 *
 * A data vem do nome da migração que criou `lead_mensagens`:
 * `20260825180000_sala_de_vendas_e_sdrs`. Não é um número escolhido — é o
 * instante em que a tabela passou a existir, e antes dele **nenhum lead podia
 * ter mensagem**, por impossibilidade e não por descuido.
 *
 * ⚠️ Se um dia a Sala for instalada num ambiente novo, esta data continua certa
 * pelo mesmo motivo: ela marca quando o CÓDIGO passou a gravar conversa, não
 * quando um banco específico foi criado.
 */
export const A_SALA_COMECOU_EM = new Date("2026-08-25T18:00:00.000Z");

export interface SinaisDoLead {
  criadoEm: Date;
  /** Quantas mensagens existem para este lead. */
  mensagens: number;
  /** A nota apurada, ou `null` quando ninguém pontuou. */
  score: number | null;
}

export type LeituraDoSilencio =
  /** Chegou antes de existir onde conversar. O vazio é história, não descuido. */
  | { tipo: "anteriorASala"; criadoEm: Date; diasNaBase: number }
  /** Chegou depois e ninguém falou com ele. Isso é fila parada. */
  | { tipo: "semAtendimento"; criadoEm: Date; diasNaBase: number }
  /** Já tem conversa: não há silêncio a explicar. */
  | { tipo: "temHistorico" };

/** Dias inteiros entre duas datas. Nunca negativo. */
function diasEntre(de: Date, ate: Date): number {
  return Math.max(0, Math.floor((ate.getTime() - de.getTime()) / 86_400_000));
}

/**
 * Por que este cartão está vazio.
 *
 * A ordem das perguntas é o desenho: **ter mensagem encerra o assunto**. Um lead
 * anterior à Sala com quem alguém já conversou depois não é mais um caso de
 * história — é um atendimento em andamento, e rotulá-lo de "antigo" mandaria o
 * vendedor tratar como arquivo o que está vivo.
 */
export function lerOSilencio(
  lead: SinaisDoLead,
  agora: Date,
  aSalaComecouEm: Date = A_SALA_COMECOU_EM,
): LeituraDoSilencio {
  if (lead.mensagens > 0) return { tipo: "temHistorico" };

  const diasNaBase = diasEntre(lead.criadoEm, agora);

  return lead.criadoEm < aSalaComecouEm
    ? { tipo: "anteriorASala", criadoEm: lead.criadoEm, diasNaBase }
    : { tipo: "semAtendimento", criadoEm: lead.criadoEm, diasNaBase };
}

/**
 * O aviso que a tela mostra, em português de vendedor.
 *
 * Devolve `null` quando não há nada a explicar — porque um aviso que aparece
 * sempre é um aviso que ninguém lê.
 */
export function avisoDoSilencio(leitura: LeituraDoSilencio): {
  titulo: string;
  texto: string;
  tom: "historico" | "alerta";
} | null {
  if (leitura.tipo === "temHistorico") return null;

  const entrou = leitura.criadoEm.toLocaleDateString("pt-BR");

  if (leitura.tipo === "anteriorASala") {
    return {
      tom: "historico",
      titulo: "Este contato é anterior à Sala",
      texto:
        `Entrou em ${entrou}, antes de existir conversa e nota por aqui. ` +
        "O vazio abaixo é história, não abandono — e não vai ser preenchido " +
        "com número inventado. O que se sabe dele está em Origem.",
    };
  }

  return {
    tom: "alerta",
    titulo: "Ninguém falou com este contato",
    texto:
      `Entrou em ${entrou} e está há ${leitura.diasNaBase} ` +
      `${leitura.diasNaBase === 1 ? "dia" : "dias"} na base sem nenhuma mensagem. ` +
      "Isto é fila parada, não histórico.",
  };
}
