/**
 * AS TRÊS TRAVAS CONTRA A TEMPESTADE DE WEBHOOKS — 19/09/2026.
 *
 * ── O QUE FOI MEDIDO ────────────────────────────────────────────────────────
 *
 * A rodada de prospecção de 19/09 às 13:12 UTC ficou 5 minutos sem resposta e
 * terminou em HTTP 502. O log de produção mostrava a linha
 * `WABA da Sala de Vendas visto no envelope: …` repetindo ~1x/s, sem intervalo.
 *
 * A causa não era a linha de log: era o que estava ACIMA dela no `route.ts`.
 * O POST fazia `await processMetaWebhook(payload)` **antes** de devolver 200.
 * Todo o trabalho — `updateMany` por status, `aplicarStatus` por status, leitura
 * de config, gravação de mensagem — acontecia com a Meta esperando.
 *
 * E aí o laço se fecha sozinho: a Meta reentrega o que não recebe 200 rápido.
 * Milhares de avisos `sent`/`delivered`/`read` da lista fria chegam → o servidor
 * demora → a Meta reentrega os mesmos → o servidor demora mais → a fila da Meta
 * cresce. O processo fica 100% ocupado e a rota do cron nunca é atendida.
 *
 * ── AS TRÊS TRAVAS ──────────────────────────────────────────────────────────
 *
 * 1. `enfileirarEnvelope` — o 200 sai ANTES do trabalho. É o conserto que quebra
 *    o laço. A fila é SERIAL de propósito: soltar `void` puro trocaria uma
 *    doença por outra (mil envelopes processando em paralelo derrubam o banco).
 *    Nada é descartado — a fila só ordena.
 * 2. `jaProcessado` — idempotência por id de evento. Uma reentrega da Meta não
 *    refaz o trabalho. É o que impede a fila de crescer para sempre quando a
 *    Meta repete o mesmo envelope dez vezes.
 * 3. `amostrar` — a linha por envelope vira primeira ocorrência + resumo com
 *    contagem. A informação NÃO se perde (o total aparece); o que some é a
 *    repetição. ⚠️ Vale só para linha informativa: erro nunca é amostrado.
 */

/* ────────────────────────── 1. A FILA SERIAL ────────────────────────────── */

let cauda: Promise<void> = Promise.resolve();
let profundidade = 0;

/**
 * Enfileira o processamento de um envelope para rodar FORA do caminho da
 * resposta, um de cada vez.
 *
 * Devolve a promessa da vez para quem quiser esperar (os testes esperam; o
 * handler NÃO espera — esse é o ponto). Nunca rejeita: uma falha de um envelope
 * não pode derrubar o processamento do próximo.
 */
export function enfileirarEnvelope(trabalho: () => Promise<void>): Promise<void> {
  profundidade += 1;
  const daVez = cauda.then(async () => {
    try {
      await trabalho();
    } catch (err) {
      console.error("[webhook/meta/whatsapp] falha ao processar envelope em segundo plano", err);
    } finally {
      profundidade -= 1;
    }
  });
  cauda = daVez;
  return daVez;
}

/** Quantos envelopes ainda esperam. Existe para o log de saturação e os testes. */
export function profundidadeDaFila(): number {
  return profundidade;
}

/* ───────────────────────── 2. A IDEMPOTÊNCIA ────────────────────────────── */

/** Seis horas: cobre com folga a janela de reentrega da Meta. */
export const JANELA_DE_REENTREGA_MS = 6 * 60 * 60 * 1000;
/** Teto de memória: ~50k chaves curtas é alguns MB, e o corte é o mais antigo. */
const TETO_DE_CHAVES = 50_000;

const vistos = new Map<string, number>();

/**
 * `true` quando esta chave de evento já foi processada dentro da janela.
 *
 * A chave tem de identificar o EVENTO, não a mensagem: `sent`, `delivered` e
 * `read` do mesmo `wamid` são três eventos distintos e os três têm de passar.
 * Por isso quem chama monta `status:<wamid>:<status>` e `msg:<wamid>`.
 */
export function jaProcessado(chave: string, agora: number = Date.now()): boolean {
  const quando = vistos.get(chave);
  if (quando !== undefined && agora - quando < JANELA_DE_REENTREGA_MS) {
    // Reinsere para o evento repetido não ser o primeiro a ser despejado.
    vistos.delete(chave);
    vistos.set(chave, quando);
    return true;
  }
  vistos.set(chave, agora);
  if (vistos.size > TETO_DE_CHAVES) {
    const maisAntiga = vistos.keys().next();
    if (!maisAntiga.done) vistos.delete(maisAntiga.value);
  }
  return false;
}

/* ─────────────────────────── 3. A AMOSTRAGEM ────────────────────────────── */

/** Uma linha por assunto a cada minuto, no máximo — com a contagem do período. */
export const INTERVALO_DE_AMOSTRA_MS = 60_000;

const contagens = new Map<string, { desde: number; ocorrencias: number }>();

/**
 * Decide se esta ocorrência vira linha de log.
 *
 * Devolve `{ logar: true, ocorrencias: n }` na primeira vez e depois no máximo
 * uma vez por minuto, com **quantas** ocorrências houve desde a última linha —
 * a informação continua no log, sem a repetição que ocupa o arquivo inteiro.
 */
export function amostrar(assunto: string, agora: number = Date.now()): { logar: boolean; ocorrencias: number } {
  const atual = contagens.get(assunto);
  if (atual === undefined) {
    contagens.set(assunto, { desde: agora, ocorrencias: 0 });
    return { logar: true, ocorrencias: 1 };
  }
  atual.ocorrencias += 1;
  if (agora - atual.desde < INTERVALO_DE_AMOSTRA_MS) return { logar: false, ocorrencias: atual.ocorrencias };
  const ocorrencias = atual.ocorrencias;
  atual.desde = agora;
  atual.ocorrencias = 0;
  return { logar: true, ocorrencias };
}

/** Só para os testes: zera o estado de processo entre casos. */
export function zerarEstadoDaTempestade(): void {
  vistos.clear();
  contagens.clear();
}
