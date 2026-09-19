/**
 * O ENVELOPE DO WEBHOOK `leadgen` DA META — só leitura, sem rede e sem banco.
 *
 * ── O QUE A META MANDA, E O QUE ELA NÃO MANDA ───────────────────────────────
 * A notificação de um formulário preenchido NÃO traz o nome, o telefone nem o
 * e-mail da pessoa. Ela traz um `leadgen_id` e o endereço de onde buscar:
 *
 *   entry[].changes[].field === "leadgen"
 *   entry[].changes[].value = { leadgen_id, page_id, form_id, adgroup_id,
 *                               ad_id, created_time, campaign_id, ... }
 *
 * Quem quiser os dados da pessoa precisa chamar a Graph API com um token de
 * página (`graphDoLead.ts`). Este arquivo só abre o envelope — e abre com
 * tolerância, porque a Meta acrescenta campos sem avisar e um envelope com um
 * campo a mais não pode derrubar a entrada do lead.
 *
 * ⚠️ `leadgen_id` aqui vem SEM o prefixo `l:` que a planilha carrega. O prefixo
 * é da exportação da planilha, não do id. A chave de idempotência gravada é a
 * que `importarMetaLead` recebe — e quem chama decide qual usar, com o cuidado
 * descrito em `importarMetaLead.ts`.
 */

export interface EventoLeadgen {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  /** `created_time` do evento — epoch em SEGUNDOS, como a Meta manda. */
  createdTime: string | null;
  adId: string | null;
  adgroupId: string | null;
}

function texto(valor: unknown): string | null {
  if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

/**
 * Todos os eventos `leadgen` do envelope, na ordem em que vieram.
 *
 * Um envelope sem nenhum `leadgen` devolve lista vazia — e isso é normal, não
 * erro: a mesma inscrição pode receber outros campos da Página.
 */
export function eventosLeadgen(payload: unknown): EventoLeadgen[] {
  const corpo = payload as {
    object?: unknown;
    entry?: Array<{ changes?: Array<{ field?: unknown; value?: unknown }> }>;
  } | null;

  if (!corpo || typeof corpo !== "object" || !Array.isArray(corpo.entry)) return [];

  const eventos: EventoLeadgen[] = [];
  for (const entrada of corpo.entry) {
    for (const mudanca of entrada?.changes ?? []) {
      if (mudanca?.field !== "leadgen") continue;
      const v = (mudanca.value ?? {}) as Record<string, unknown>;
      const leadgenId = texto(v.leadgen_id);
      if (!leadgenId) continue; // sem id não há o que buscar nem o que registrar
      eventos.push({
        leadgenId,
        pageId: texto(v.page_id),
        formId: texto(v.form_id),
        createdTime: texto(v.created_time),
        adId: texto(v.ad_id),
        adgroupId: texto(v.adgroup_id),
      });
    }
  }
  return eventos;
}
