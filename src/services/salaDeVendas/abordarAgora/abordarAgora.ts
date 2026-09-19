/**
 * ⭐ ABORDAR AGORA — a ordem "tenta este lead, com estes modelos, nesta ordem".
 *
 * ── O PROBLEMA, MEDIDO EM PRODUÇÃO EM 18/09/2026 ────────────────────────────
 *
 * Três leads pagos entraram. Os três receberam `foocci_contato_inicial_03` às
 * 20:06 e a Meta recusou os três com `META_131042`. A recepção não os pega de
 * volta: ela só enxerga lead sem contato anterior, e para ela os três já
 * "receberam mensagem" — a linha PENDENTE existe, mesmo que ninguém tenha lido
 * nada. Não havia nenhum jeito de dizer *"tenta de novo neste lead, com este
 * modelo"*.
 *
 * Esta é a porta que diz isso. Ela **não é um segundo caminho de fala**: cada
 * tentativa é uma chamada a `abordarLead`, a mesma de sempre, com dois
 * parâmetros novos (`modeloForcado`, `ignorarJaContatado`). Se algum dia a
 * ordem das travas mudar lá, muda aqui junto — que é o ponto.
 *
 * ── O QUE ELA NÃO AFROUXA ───────────────────────────────────────────────────
 *
 *   · **opt-out** — quem pediu silêncio não recebe, nem com
 *     `ignorarJaContatado`. É lei, não configuração, e o portão a aplica antes
 *     de qualquer outra pergunta.
 *   · **telefone inválido / canal desligado** — continuam barrando.
 *   · **a trava de repetição** — continua no caminho. Se ela recusar por
 *     conteúdo idêntico, o resultado daquele modelo é "recusado pela trava" e
 *     passa-se ao PRÓXIMO modelo, que tem outro texto. Não se contorna.
 *   · **variável sem fonte** — modelo cujo `{{n}}` não tem dado é PULADO, com o
 *     motivo escrito. Nunca sai `{{1}}` vazio nem "undefined".
 *
 * ── ⚠️ O QUE VAI EM `{{1}}` PARA UM LEAD DE LEAD ADS — decisão registrada ───
 *
 * `foocci_contato_inicial_01/02` pedem `{{1}}` ("Este contato é do {{1}},
 * certo?" / "Falo com o {{1}} por aqui?"), e lead de Lead Ads **não traz o nome
 * do restaurante**. A escolha aqui é **usar o dado que existe**, que é o nome da
 * pessoa — e ela não é nova nem local: `saudacaoDoLead`, em `abordar.ts`, já é a
 * definição única da casa para "o que vai em {{1}}", e para lead que não é de
 * lista ela devolve o primeiro nome. "Falo com o Bruno por aqui?" é uma frase
 * certa; "Este contato é do Bruno, certo?" é uma frase que se entende. Uma
 * segunda definição de `{{1}}` aqui seria a fonte de um lead julgado de um jeito
 * na escolha e preenchido de outro no envio.
 *
 * E o caso em que nem isso existe (nome vazio, ou nome que é o próprio telefone)
 * **não vira envio**: `montarParametros` recusa, `abordarLead` devolve
 * `semDadoParaOModelo`, e este arquivo registra o modelo como PULADO e vai para
 * o próximo. Fail-closed: preencher com traço, "cliente" ou string vazia é
 * exatamente o que já custou ~10% dos disparos.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { abordarLead, type ResultadoDaAbordagem } from "../abordar";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Uma tentativa: qual modelo, o que aconteceu, e o erro cru quando houve. */
export interface TentativaDeModelo {
  modelo: string;
  enviou: boolean;
  /** O `motivo` de `ResultadoDaAbordagem` — `null` quando enviou. */
  motivo: string | null;
  /** O texto cru do motivo: quando a Meta recusa, é o erro dela, sem tradução. */
  detalhe: string | null;
  /** O id da linha da conversa, quando a mensagem saiu. */
  mensagemId?: string;
}

export interface ResultadoPorLead {
  leadId: string | null;
  /** O código curto pedido, quando a entrada veio por código. */
  codigo: string | null;
  /** `false` quando nenhum modelo da ordem passou — ou quando o lead não existe. */
  abordou: boolean;
  /** O modelo que saiu, quando saiu. */
  modeloQueSaiu: string | null;
  tentativas: TentativaDeModelo[];
  /** Preenchido só quando nem se chegou a tentar modelo nenhum. */
  erro?: string;
}

export interface PedidoDeAbordagemAgora {
  leadIds?: string[];
  /** Códigos curtos do lead (`SiteLead.codigo`), ex.: "337AN". */
  codigos?: string[];
  /** A ORDEM de tentativa. Primeiro que passar encerra o lead. */
  modelos: string[];
  ignorarJaContatado?: boolean;
  autorUserId: string;
  agora?: Date;
}

export type ResultadoDaAbordagemAgora =
  | { ok: false; erro: string }
  | { ok: true; ignorouJaContatado: boolean; leads: ResultadoPorLead[] };

/**
 * Traduz um `ResultadoDaAbordagem` em linha de relatório.
 *
 * ⚠️ O `detalhe` vai CRU. Quem chama esta porta está depurando uma recusa da
 * Meta (`META_131042` e parentes) — resumir o erro aqui é apagar a única
 * informação pela qual a porta existe.
 */
function comoTentativa(modelo: string, r: ResultadoDaAbordagem): TentativaDeModelo {
  return r.abordou
    ? { modelo, enviou: true, motivo: null, detalhe: null, mensagemId: r.mensagemId }
    : { modelo, enviou: false, motivo: r.motivo, detalhe: r.detalhe };
}

/**
 * ⛔⛔ A REGRA DA FILA, VIRADA DO AVESSO EM 19/09/2026 — E É O CONSERTO.
 *
 * ── O DEFEITO, MEDIDO NO LEAD JONES SARTORI ─────────────────────────────────
 *
 * Ele recebeu `foocci_contato_inicial_01` **e** `_02`, duas vezes cada (18:39 e
 * 20:24). Quatro mensagens onde deviam existir duas.
 *
 * A causa era esta constante, e o fato de ela ser uma lista de **EXCLUSÃO**:
 * *"se o motivo não está aqui, tenta o próximo modelo"*. `aMetaRecusou` não
 * estava. E `aMetaRecusou` é o que `abordarLead` devolve **também quando a
 * chamada se perdeu depois de a Meta a ter aceitado** — o `fetch` estoura, não
 * há código de erro, a mensagem sai assim mesmo e a fila, sem saber, manda a
 * segunda. A distinção que faltava:
 *
 *   · a Meta **aceita** e devolve `wamid` → é SUCESSO, a fila ENCERRA. (O
 *     `failed` só chegaria depois, por webhook; ele não é assunto desta fila.)
 *   · a Meta **recusa a chamada com erro DO MODELO** → o texto está errado, a
 *     conta está boa: desce a fila.
 *   · qualquer outra coisa — erro de conta, de destinatário, de limite, de
 *     credencial, **ou desconhecido** → PARA.
 *
 * ── AGORA É UMA LISTA DE INCLUSÃO, e por isso ela é uma trava ───────────────
 *
 * Só três motivos deixam a fila descer, e os três têm a mesma prova por trás:
 * **nenhuma mensagem saiu**.
 *
 *   · `semDadoParaOModelo` / `modeloNaoLiberado` — nem chegou a bater na Meta.
 *   · `aMetaRecusou` **com `familiaDoErroDaMeta === "doModelo"`** — a Meta
 *     recusou olhando o TEXTO, que é exatamente o que o próximo modelo muda.
 *
 * O que SAIU da lista, e por quê:
 *
 *   · `aMetaRecusou` de qualquer outra família (inclusive `desconhecido`) —
 *     fail-closed, a mesma régua de `familiasDeErroDaMeta.ts`. Era esta a porta
 *     por onde a repetição entrava.
 *   · `travaDeRepeticao` — ela fala do NÚMERO ("já saiu isto", "saiu algo há
 *     pouco"), nunca do texto. Descer a fila aqui é mandar outra mensagem
 *     dentro do intervalo que a trava acabou de proibir: a repetição voltando
 *     com outra roupa. `abordar.ts` já parava por isso lá dentro; faltava
 *     parar aqui.
 *   · `supervisoraRecusou` — ela julgou o MOMENTO desta abordagem, não o
 *     texto. Trocar de modelo seria contornar o veredito dela em silêncio.
 *
 * Motivo novo que apareça amanhã nasce PARANDO. O lado errado da dúvida aqui
 * é mandar mensagem a mais para quem já recebeu uma.
 */
function podeDescerAFila(r: ResultadoDaAbordagem): boolean {
  if (r.abordou) return false;
  if (r.motivo === "semDadoParaOModelo" || r.motivo === "modeloNaoLiberado") return true;
  if (r.motivo === "aMetaRecusou") return r.familiaDoErroDaMeta === "doModelo";
  return false;
}

export async function abordarAgora(
  db: Cliente,
  pedido: PedidoDeAbordagemAgora,
): Promise<ResultadoDaAbordagemAgora> {
  const modelos = (pedido.modelos ?? []).map((m) => m.trim()).filter(Boolean);
  if (modelos.length === 0) {
    return { ok: false, erro: "`modelos` vazio: esta porta existe para escolher o texto — sem ordem de modelos não há o que tentar." };
  }

  const ids = (pedido.leadIds ?? []).map((v) => v.trim()).filter(Boolean);
  const codigos = (pedido.codigos ?? []).map((v) => v.trim()).filter(Boolean);
  if (ids.length === 0 && codigos.length === 0) {
    return { ok: false, erro: "informe `leadIds` ou `codigos` — esta porta nunca varre a base por conta própria." };
  }

  // ⚠️ Os códigos viram ids ANTES de qualquer envio. Código que não existe é
  // uma linha de erro no relatório, e não um lead a menos em silêncio.
  const alvos: Array<{ leadId: string | null; codigo: string | null }> = ids.map((id) => ({ leadId: id, codigo: null }));

  if (codigos.length > 0) {
    const achados = await db.siteLead.findMany({
      where: { codigo: { in: codigos } },
      select: { id: true, codigo: true },
    });
    const porCodigo = new Map(achados.map((l) => [l.codigo ?? "", l.id]));
    for (const codigo of codigos) {
      alvos.push({ leadId: porCodigo.get(codigo) ?? null, codigo });
    }
  }

  const ignorarJaContatado = pedido.ignorarJaContatado === true;
  const leads: ResultadoPorLead[] = [];

  for (const alvo of alvos) {
    if (!alvo.leadId) {
      leads.push({
        leadId: null,
        codigo: alvo.codigo,
        abordou: false,
        modeloQueSaiu: null,
        tentativas: [],
        erro: `nenhum lead com o código "${alvo.codigo}"`,
      });
      continue;
    }

    const tentativas: TentativaDeModelo[] = [];
    let modeloQueSaiu: string | null = null;

    for (const modelo of modelos) {
      const r = await abordarLead(db, {
        leadId: alvo.leadId,
        autor: "HUMANO",
        autorUserId: pedido.autorUserId,
        agora: pedido.agora,
        modeloForcado: modelo,
        ignorarJaContatado,
      });

      tentativas.push(comoTentativa(modelo, r));

      if (r.abordou) {
        // ⛔ ACEITO PELA META = FILA ENCERRADA. Nenhum segundo modelo sai para
        // quem já recebeu o primeiro, aconteça o que acontecer no webhook.
        modeloQueSaiu = modelo;
        break;
      }
      if (!podeDescerAFila(r)) break;
    }

    leads.push({
      leadId: alvo.leadId,
      codigo: alvo.codigo,
      abordou: modeloQueSaiu !== null,
      modeloQueSaiu,
      tentativas,
    });
  }

  return { ok: true, ignorouJaContatado: ignorarJaContatado, leads };
}
