/**
 * A BUSCA DO LEAD NA GRAPH API — o segundo passo do webhook `leadgen`.
 *
 * A Meta avisa que alguém preencheu o formulário e manda só o `leadgen_id`.
 * Os dados da pessoa moram na Graph e só saem de lá com um **token de Página**
 * (page access token) da Página dona do formulário.
 *
 * ── ⚠️ O TOKEN QUE A CASA AINDA NÃO TEM (medido em 19/09/2026) ──────────────
 * Não existe, hoje, nenhuma variável de ambiente com token de Página para Lead
 * Ads. O que existe é:
 *   · `META_APP_ID` / `META_APP_SECRET` — credencial do APLICATIVO. Um app
 *     token NÃO lê `/{leadgen_id}`: a Meta exige token de Página com
 *     `leads_retrieval`. Usar o app token aqui daria 190/200 e nada mais.
 *   · `InstagramChannelConfig.pageAccessTokenEncrypted` — token de Página, sim,
 *     mas POR RESTAURANTE e para o Direct do cliente. O Lead Ads que traz lead
 *     para a Foocci é da Página da própria Foocci, que não é restaurante
 *     nenhum. Pegar o token de um restaurante para buscar lead da Foocci seria
 *     usar credencial de terceiro — não se faz.
 *
 * Então a variável que FALTA tem nome e está escrita aqui:
 * **`META_LEADS_PAGE_ACCESS_TOKEN`** — token de Página, de longa duração, da
 * Página que roda os anúncios, com a permissão `leads_retrieval`.
 *
 * **Fail-closed e sem silêncio:** sem o token, esta função NÃO inventa e NÃO
 * desiste — devolve erro, e quem chama grava o `leadgen_id` como pendente. O
 * lead fica esperando o token, nunca some.
 */

import { META_GRAPH_VERSION } from "@/services/whatsapp/metaFlag";
import type { MetaLeadPayload } from "./importarMetaLead";

/** O nome EXATO da variável que falta. Uma constante porque a doc e o log a citam. */
export const VARIAVEL_DO_TOKEN_DE_PAGINA = "META_LEADS_PAGE_ACCESS_TOKEN";

export function tokenDePaginaDosLeads(): string | undefined {
  const bruto = process.env[VARIAVEL_DO_TOKEN_DE_PAGINA];
  const limpo = typeof bruto === "string" ? bruto.trim() : "";
  return limpo === "" ? undefined : limpo;
}

export type ResultadoDaBusca =
  | { ok: true; lead: MetaLeadPayload }
  | { ok: false; erro: string; semToken?: boolean };

interface CampoDoFormulario { name?: unknown; values?: unknown }

/** O primeiro valor não vazio de um campo do formulário. */
function primeiroValor(campo: CampoDoFormulario): string | null {
  if (!Array.isArray(campo.values)) return null;
  for (const v of campo.values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/**
 * Mapeia a resposta da Graph para o payload da porta única.
 *
 * ⚠️ NOMES DE CAMPO SÃO ESCOLHIDOS PELO ANUNCIANTE. `full_name` é o padrão da
 * Meta, mas um formulário pode ter `nome`, `first_name`+`last_name`, ou um
 * rótulo em português. Por isso a leitura é por LISTA de apelidos e, no fim,
 * por heurística — perder o lead porque o formulário chamou o campo de "nome
 * completo" seria o mesmo defeito da planilha, com outra roupa.
 */
export function leadDaGraphParaPayload(bruto: unknown): ResultadoDaBusca {
  const r = (bruto ?? {}) as Record<string, unknown>;
  const id = texto(r.id);
  if (!id) return { ok: false, erro: "resposta da Graph sem `id`" };

  const campos = Array.isArray(r.field_data) ? (r.field_data as CampoDoFormulario[]) : [];
  const porNome = new Map<string, string>();
  for (const campo of campos) {
    const nome = typeof campo.name === "string" ? campo.name.trim().toLowerCase() : "";
    const valor = primeiroValor(campo);
    if (nome && valor && !porNome.has(nome)) porNome.set(nome, valor);
  }

  const pegar = (apelidos: string[]): string | null => {
    for (const a of apelidos) {
      const v = porNome.get(a);
      if (v) return v;
    }
    return null;
  };

  const nomeCompleto =
    pegar(["full_name", "nome_completo", "nome", "name", "seu_nome"]) ??
    [pegar(["first_name", "primeiro_nome"]), pegar(["last_name", "sobrenome"])]
      .filter(Boolean)
      .join(" ")
      .trim() ??
    null;

  const telefone = pegar(["phone_number", "telefone", "whatsapp", "celular", "phone"]);
  const email = pegar(["email", "e_mail", "e-mail", "work_email"]);

  if (!telefone) {
    return { ok: false, erro: `lead ${id} veio da Graph sem telefone (campos: ${[...porNome.keys()].join(",") || "nenhum"})` };
  }
  if (!nomeCompleto || nomeCompleto.length < 2) {
    return { ok: false, erro: `lead ${id} veio da Graph sem nome (campos: ${[...porNome.keys()].join(",") || "nenhum"})` };
  }

  return {
    ok: true,
    lead: {
      metaLeadId: id,
      createdTime: texto(r.created_time),
      adId: texto(r.ad_id),
      adName: texto(r.ad_name),
      adsetId: texto(r.adset_id),
      adsetName: texto(r.adset_name),
      campaignId: texto(r.campaign_id),
      campaignName: texto(r.campaign_name),
      formId: texto(r.form_id),
      formName: texto((r.form as { name?: unknown } | undefined)?.name),
      isOrganic: typeof r.is_organic === "boolean" ? r.is_organic : undefined,
      platform: texto(r.platform),
      fullName: nomeCompleto,
      phone: telefone,
      email: email ?? "",
      leadStatus: "",
    },
  };
}

const CAMPOS = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "is_organic", "platform", "field_data",
].join(",");

/**
 * Busca um lead na Graph API pelo `leadgen_id`.
 *
 * Nunca lança: todo caminho de erro vira `{ ok: false }` com o motivo escrito,
 * porque quem chama é um webhook que precisa responder 200 rápido para a Meta
 * e registrar o pendente em vez de estourar.
 */
export async function buscarLeadNaGraph(
  leadgenId: string,
  opcoes: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<ResultadoDaBusca> {
  const token = opcoes.token ?? tokenDePaginaDosLeads();
  if (!token) {
    return {
      ok: false,
      semToken: true,
      erro: `${VARIAVEL_DO_TOKEN_DE_PAGINA} não configurada — sem token de Página a Meta não entrega os dados do lead ${leadgenId}`,
    };
  }

  const url =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}` +
    `?fields=${CAMPOS}&access_token=${encodeURIComponent(token)}`;

  const chamar = opcoes.fetchImpl ?? fetch;
  let resposta: Response;
  try {
    resposta = await chamar(url, { method: "GET" });
  } catch (err) {
    return { ok: false, erro: `falha de rede ao buscar o lead ${leadgenId}: ${String(err)}` };
  }

  const corpo = await resposta.text().catch(() => "");
  if (!resposta.ok) {
    /* ⚠️ O corpo de erro da Meta NUNCA carrega o token (ele vai na query), mas
     * carrega o motivo — e é o motivo que diz se falta permissão ou se o token
     * expirou. Sem ele, o pendente viraria "falhou" e ninguém saberia o quê. */
    return { ok: false, erro: `Graph respondeu ${resposta.status} para o lead ${leadgenId}: ${corpo.slice(0, 400)}` };
  }

  try {
    return leadDaGraphParaPayload(JSON.parse(corpo));
  } catch {
    return { ok: false, erro: `resposta ilegível da Graph para o lead ${leadgenId}` };
  }
}
