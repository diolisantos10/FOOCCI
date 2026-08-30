/**
 * ⭐⭐ O CONTRATO COMUM DO CONECTOR DE PRODUTO — Dioli Connect.
 *
 * ─── O QUE ESTE ARQUIVO É ───────────────────────────────────────────────────
 *
 * É **a interface exata entre um produto e o núcleo** do Dioli Connect, escrita
 * num lugar só, sem nada do Foocci dentro. Os quatro produtos (Foocci, FOOCCI
 * Manager, Dioli Digital, CityJobs) usam este arquivo **sem editar uma linha**.
 * O que muda de produto para produto é a *ligação local* — ver `ligacaoLocal.ts`.
 *
 * ⛔ **Não há memória de decisão nem circuito de escalada dentro do produto.**
 * O núcleo mora na Control Room. Este pacote é só o **conector**: ele pergunta,
 * ele recebe de volta, e ele entrega ao cliente. Se um dia aparecer aqui uma
 * tabela de políticas, alguém construiu a segunda verdade — que é exatamente o
 * que o CEO proibiu em 30/08/2026.
 *
 * ─── A JORNADA, E QUAIS PASSOS SÃO DESTE PACOTE ─────────────────────────────
 *
 *   1. o cliente pergunta ao agente de atendimento           ← produto (local)
 *   2. o agente consulta as políticas e decisões existentes   ← ⭐ AQUI (comum)
 *   3. havendo resposta válida, responde IMEDIATAMENTE        ← ⭐ AQUI (comum)
 *   4–7. consulta, escalada, decisão do gerente               ← núcleo
 *   8. o agente recebe a resposta DENTRO DA CONVERSA ORIGINAL ← ⭐ AQUI (comum)
 *   9. o cliente recebe sem o CEO servir de intermediário     ← ⭐ AQUI (comum)
 *   10–12. registro, alcance, reaproveitamento                ← núcleo
 *
 * ─── OS DOIS SENTIDOS DO FIO, E QUEM INICIA CADA UM ─────────────────────────
 *
 *   PRODUTO → NÚCLEO   `POST {DIOLI_CONNECT_URL}/api/connect/politicas/consulta`
 *                      "existe política válida para isto?" — síncrona, com teto
 *                      de espera. Quem inicia é o agente, no turno do cliente.
 *
 *   PRODUTO → NÚCLEO   `POST {DIOLI_CONNECT_URL}/api/connect/despacho`
 *                      a consulta ao gerente, quando não há política. Já existe
 *                      e não muda (`salaDeVendas/ta/consultarGerente.ts`).
 *
 *   NÚCLEO  → PRODUTO  `POST {URL_DO_PRODUTO}/api/connect/retorno`
 *                      ⭐ a resposta do gerente voltando. **Quem inicia é o
 *                      núcleo**, e é por isso que a resposta consegue chegar:
 *                      o produto não fica perguntando "já decidiram?".
 *
 * ─── ⛔ A REGRA QUE ATRAVESSA OS TRÊS ───────────────────────────────────────
 *
 * **Cliente externo NUNCA acessa comunicação interna.** Não é aviso: é trava, e
 * ela mora em `barreira.ts`. Só um campo do que vem do núcleo pode virar texto
 * para o cliente — `respostaAoCliente` — e existe uma função que **lança** se
 * qualquer valor interno aparecer no texto que ia sair.
 *
 * ─── AUTENTICAÇÃO, NOS DOIS SENTIDOS ────────────────────────────────────────
 *
 * O mesmo segredo da porta corporativa (`DIOLI_CONNECT_SECRET`), no cabeçalho
 * `x-dioli-connect-secret`, comparado em tempo constante, com piso de tamanho e
 * **fail-closed**: não configurado = fechado, nos dois sentidos. O produto não
 * consulta sem ele, e a rota de retorno não aceita sem ele.
 *
 * ⛔ Nenhum segredo aparece em log, em motivo de recusa ou em texto de cliente.
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS CAMINHOS. Um lugar só, para os quatro produtos e o núcleo não divergirem.
// ═══════════════════════════════════════════════════════════════════════════

/** No NÚCLEO: "existe política válida para isto?" */
export const CAMINHO_DA_CONSULTA_DE_POLITICA = "/api/connect/politicas/consulta";

/** No NÚCLEO: a consulta ao gerente (a porta que já existe). */
export const CAMINHO_DO_DESPACHO = "/api/connect/despacho";

/** ⭐ NO PRODUTO: por onde a resposta do gerente volta. É o passo 8. */
export const CAMINHO_DO_RETORNO = "/api/connect/retorno";

/** A variável que diz onde o núcleo atende. Igual nos quatro produtos. */
export const VARIAVEL_DA_URL_DO_NUCLEO = "DIOLI_CONNECT_URL";

/**
 * O teto de espera da consulta de política.
 *
 * ⚠️ É **menor** que o teto da consulta ao gerente (8 s) de propósito: a
 * consulta de política roda no turno do cliente, ANTES de qualquer outra coisa,
 * e o cliente está esperando uma resposta na tela. Estourar o teto nunca é o
 * cliente esperando mais — é o conector seguindo pelo caminho da escalada.
 */
export const TETO_DA_CONSULTA_MS = 3_000;

// ═══════════════════════════════════════════════════════════════════════════
// 1) PRODUTO → NÚCLEO: "existe política válida para isto?"
// ═══════════════════════════════════════════════════════════════════════════

/** Um assunto que o agente não pode decidir sozinho, com o motivo já escrito. */
export interface AssuntoForaDaAlcada {
  assunto: string;
  motivo: string;
}

/**
 * ⭐ A PERGUNTA. Assinatura estável para os quatro produtos.
 *
 * ⚠️ Repare no que NÃO vai aqui: nome, e-mail, telefone, endereço. A pergunta é
 * "existe política para este ASSUNTO", e o assunto não precisa saber quem
 * perguntou. O que vai é `referenciaDoCliente` — o identificador do cliente
 * **dentro do produto**, opaco fora dele —, e ele vai por um motivo específico e
 * único: sem ele o núcleo não consegue distinguir uma **exceção concedida
 * àquele cliente** de uma **regra da empresa**, e o corte "exceção não vira
 * regra" ficaria impossível de fazer.
 */
export interface PerguntaDePolitica {
  /**
   * ⭐ A versão do contrato comum que este produto fala (decisão C3).
   *
   * Vai em TODA mensagem, nos dois sentidos. É o que faz um produto que ficou
   * para trás **dizer** que ficou, na primeira conversa que tiver com o núcleo,
   * em vez de descobrir isso num cliente. Ver `versao.ts`.
   */
  versaoDoContrato: string;
  /** Qual produto pergunta. `foocci`, `foocci-manager`, `cityjobs`, … */
  produto: string;
  /** Qual agente pergunta. Ligação local — cada produto tem os seus. */
  agente: string;
  /** Correlaciona esta pergunta com tudo o que vier depois. Ver `protocolo()`. */
  protocolo: string;
  /** O identificador do cliente DENTRO do produto. Nunca nome ou telefone. */
  referenciaDoCliente: string;
  /** Os assuntos travados, classificados em código pelo produto. */
  assuntos: AssuntoForaDaAlcada[];
  /** A pergunta em português, para o núcleo casar por semântica também. */
  pergunta: string;
}

/**
 * Uma política, como o núcleo a devolve.
 *
 * ⚠️ **Os campos de vigência e de alcance não são decoração.** São eles que
 * fazem os dois cortes do produto — política revogada e exceção virando regra —
 * e por isso o conector os exige e os avalia **do lado dele também**. Confiar
 * que o núcleo já filtrou seria o mesmo defeito que o Dioli Connect existe para
 * matar, virado do avesso: acreditar no outro lado sem conferir.
 */
export interface PoliticaDoNucleo {
  politicaId: string;
  versao: number;
  /**
   * ⭐ `regra` vale para todo mundo. `excecao` vale para quem está em
   * `valeApenasPara`, e **para mais ninguém**.
   */
  escopo: "regra" | "excecao";
  /** Só faz sentido com `escopo: "excecao"`. Lista de referências de cliente. */
  valeApenasPara: string[] | null;
  /** ISO-8601. Antes disso a política ainda não vale. */
  vigenteDe: string;
  /** ISO-8601 ou `null` (sem prazo). Depois disso ela não vale mais. */
  vigenteAte: string | null;
  /** ISO-8601 quando revogada; `null` quando viva. Campo escrito, não omitido. */
  revogadaEm: string | null;
  /** ⭐ O ÚNICO campo desta estrutura que pode virar texto para o cliente. */
  respostaAoCliente: string;
  /** ⛔ Interno. Fundamentação, quem decidiu, discussão. NUNCA sai do produto. */
  fundamentacaoInterna?: string;
  decididaPor?: string;
}

/**
 * ⭐ OS TRÊS ESTADOS DA RESPOSTA, e por que são três e não dois.
 *
 *   `encontrada: true`  → achei uma política. **Não quer dizer que ela vale** —
 *                         quem decide isso é `avaliarPolitica`, no produto.
 *   `encontrada: false` → não existe política para isto. Escala.
 *   (erro de transporte) → não deu para perguntar. Escala, e o cliente é avisado.
 *
 * "Achei e está revogada" chega como `encontrada: true` com `revogadaEm`
 * preenchido, de propósito: o núcleo devolve o FATO, e o produto aplica a
 * REGRA. Se o núcleo devolvesse `encontrada: false` para uma política revogada,
 * o produto nunca conseguiria distinguir "não existe" de "existiu e caiu" — e
 * essa é uma distinção que muda o que o gerente precisa decidir.
 */
export type RespostaDeConsultaDePolitica =
  | { encontrada: true; politica: PoliticaDoNucleo }
  | { encontrada: false; motivo?: string };

// ═══════════════════════════════════════════════════════════════════════════
// 2) NÚCLEO → PRODUTO: a resposta do gerente voltando (passo 8)
// ═══════════════════════════════════════════════════════════════════════════

/** O que o gerente decidiu. Lista fechada — texto livre não se conta. */
export const DECISOES_DO_GERENTE = ["respondida", "recusada", "encerrada"] as const;
export type DecisaoDoGerente = (typeof DECISOES_DO_GERENTE)[number];

/**
 * ⭐ O RETORNO. O núcleo faz `POST {produto}/api/connect/retorno` com isto.
 *
 * ⚠️ `protocolo` é a chave inteira do passo 8: é ele que diz **em qual conversa
 * de qual cliente** esta resposta entra. Sem ele a resposta chegaria ao produto
 * e não teria onde pousar — que é exatamente o buraco que o PR #178 deixou.
 */
export interface RetornoDoNucleo {
  /**
   * ⭐ A versão do contrato que o NÚCLEO fala (decisão C3). Ausente é aceito —
   * ausência não é informação —, mas MAIOR diferente é **recusa**, não aviso.
   */
  versaoDoContrato?: string | null;
  /** O mesmo `protocolo` que saiu na pergunta. Chave de correlação. */
  protocolo: string;
  /** O fio da conversa interna, para o rastro. ⛔ Nunca chega ao cliente. */
  fio?: string | null;
  decisao: DecisaoDoGerente;
  /** ⭐ O ÚNICO campo que vira texto para o cliente. */
  respostaAoCliente: string;
  /** ⛔ Interno. NUNCA sai do produto. */
  notaInterna?: string | null;
  decididaPor?: string | null;
  /**
   * ⭐ O ALCANCE, classificado pelo gerente (passo 10–12, do lado do núcleo).
   *
   * O produto **não guarda isto** — ele nem precisa. Vem escrito no retorno só
   * para o rastro local dizer a verdade sobre o que aconteceu. Quem passa a
   * responder a próxima pergunta equivalente é o núcleo, na consulta do passo 2.
   */
  virouPolitica?: { politicaId: string; escopo: "regra" | "excecao" } | null;
  /** ISO-8601. */
  em?: string;
}

/** O que a rota de retorno do produto devolve ao núcleo. */
export type RespostaAoRetorno =
  | { estado: "entregue"; protocolo: string; conversa: string; entregueAoCliente: boolean }
  | { estado: "duplicado"; protocolo: string; motivo: string }
  | { estado: "recusado"; protocolo: string | null; motivo: string };

// ═══════════════════════════════════════════════════════════════════════════
// O PROTOCOLO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O formato do protocolo: `produto:conversa:uuid`.
 *
 * Os três pedaços existem por motivos diferentes. `produto` porque o núcleo
 * atende quatro. `conversa` porque um retorno que chegue com o protocolo de
 * outra conversa tem que ser recusável **sem ida ao banco** — é o corte "dois
 * clientes ao mesmo tempo, e eles não se misturam". `uuid` porque o mesmo
 * cliente pergunta mais de uma vez.
 *
 * ⚠️ `conversa` é identificador interno do produto, e sai daqui para o núcleo.
 * Por isso ele nunca pode ser o telefone ou o e-mail do cliente: nos quatro
 * produtos é o id da linha, e é assim que continua.
 */
export const SEPARADOR_DO_PROTOCOLO = ":";

export function protocolo(produto: string, conversa: string, sufixo: string): string {
  return [produto, conversa, sufixo].join(SEPARADOR_DO_PROTOCOLO);
}

export type ProtocoloLido =
  | { ok: true; produto: string; conversa: string; sufixo: string }
  | { ok: false; motivo: string };

/** Teto do protocolo. Ele vira coluna e vira chave de busca. */
export const MAX_PROTOCOLO = 200;

/**
 * Lê um protocolo que chegou de fora. Fail-closed, e sem citar o valor inteiro.
 */
export function lerProtocolo(bruto: unknown): ProtocoloLido {
  if (typeof bruto !== "string" || !bruto.trim()) {
    return { ok: false, motivo: "protocolo ausente ou não é texto" };
  }
  const texto = bruto.trim();
  if (texto.length > MAX_PROTOCOLO) {
    return { ok: false, motivo: `protocolo com ${texto.length} caracteres; o teto é ${MAX_PROTOCOLO}` };
  }
  const partes = texto.split(SEPARADOR_DO_PROTOCOLO);
  if (partes.length !== 3 || partes.some((p) => !p.trim())) {
    return {
      ok: false,
      motivo: `protocolo fora do formato produto${SEPARADOR_DO_PROTOCOLO}conversa${SEPARADOR_DO_PROTOCOLO}sufixo`,
    };
  }
  const [produto, conversa, sufixo] = partes as [string, string, string];
  return { ok: true, produto, conversa, sufixo };
}
