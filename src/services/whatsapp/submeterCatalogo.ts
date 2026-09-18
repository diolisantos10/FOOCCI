/**
 * ⭐ O ÚNICO CAMINHO DE ESCRITA DO CATÁLOGO PARA A META — e dois porteiros.
 *
 * ── O PROBLEMA (18/09/2026) ─────────────────────────────────────────────────
 *
 * A submissão morava dentro de `POST /api/admin/sala-de-vendas/whatsapp/
 * templates-frios`, atrás do cookie `foocci-internal-session`. Nenhuma sala de
 * agente tem login — e por isso os quatro modelos do estágio 2 estavam com
 * situação `null`: escritos, nunca submetidos. O gargalo nunca foi o texto; era
 * a credencial.
 *
 * ── A CORREÇÃO, E O QUE ELA NÃO FAZ ─────────────────────────────────────────
 *
 * A montagem do catálogo e o laço de submissão saem da rota e vêm para cá. A
 * rota logada passa a CHAMAR esta função; a rota de chave própria chama a MESMA.
 * **Não há um segundo caminho de montagem** — é assim que um modelo nasce com
 * `example.body_text` num lado e sem ele no outro, e a Meta só conta isso na
 * hora do disparo.
 *
 * Um caminho de escrita. Dois porteiros: sessão humana, ou chave dedicada.
 */

import { COLD_GREETING_TEMPLATES } from "@/services/sales/coldContactDiscovery";
import { ESTAGIO_2_TEMPLATES, exemplosNaOrdem } from "@/services/sales/estagio2Templates";
import { LEAD_FORMULARIO_TEMPLATES } from "@/services/sales/leadFormularioTemplates";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

export type MetaTemplate = {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
};

export interface CredenciaisDaMeta {
  wabaId: string;
  accessToken: string;
}

/** ⛔ Fail-closed: sem as duas variáveis, não há credencial — e não há chamada. */
export function credenciaisDaMeta(): CredenciaisDaMeta | null {
  const wabaId = process.env.FOOCCI_SALES_WABA_ID?.trim();
  const accessToken = process.env.FOOCCI_SALES_ACCESS_TOKEN?.trim();
  return wabaId && accessToken ? { wabaId, accessToken } : null;
}

export async function listarModelosNaMeta(cfg: CredenciaisDaMeta): Promise<MetaTemplate[]> {
  const url = `${metaGraphUrl(`${cfg.wabaId}/message_templates`)}?fields=id,name,status,category,language,rejected_reason&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { data?: MetaTemplate[]; error?: { message?: string } };
  if (!res.ok) throw new Error(maskGraphResponse(json.error?.message ?? "Falha ao consultar modelos na Meta."));
  return json.data ?? [];
}

export type EstagioDoModelo = 1 | "1B" | 2;

export interface ModeloDoCatalogo {
  estagio: EstagioDoModelo;
  name: string;
  language: string;
  category: string;
  body: string;
  variaveis: number;
  /** Os exemplos na ordem das posições — o que a Meta exige em `body_text`. */
  examples: string[];
}

/**
 * ⭐ O CATÁLOGO DA CASA, INTEIRO, EM UM LUGAR SÓ.
 *
 * Estágio 1 — o número frio. 1B — o lead que preencheu formulário (morno).
 * Estágio 2 — a conversa nova com quem decide.
 */
export function catalogoDaCasa(): ModeloDoCatalogo[] {
  return [
    ...COLD_GREETING_TEMPLATES.map((t) => ({
      estagio: 1 as const,
      name: t.name,
      language: t.language,
      category: t.category as string,
      body: t.body,
      variaveis: t.restaurantNameParam ? 1 : 0,
      examples: t.restaurantNameParam ? ["Restaurante Exemplo"] : [],
    })),
    ...LEAD_FORMULARIO_TEMPLATES.map((m) => ({
      estagio: "1B" as const,
      name: m.name,
      language: m.language,
      category: m.category as string,
      body: m.body,
      variaveis: m.variaveis.length,
      examples: exemplosNaOrdem(m),
    })),
    ...ESTAGIO_2_TEMPLATES.map((m) => ({
      estagio: 2 as const,
      name: m.name,
      language: m.language,
      category: m.category as string,
      body: m.body,
      variaveis: m.variaveis.length,
      examples: exemplosNaOrdem(m),
    })),
  ];
}

/** O catálogo cruzado com o que a Meta tem. `NOT_SUBMITTED` é "nunca enviado",
 *  e isso NÃO é "reprovado". */
export function catalogoCruzadoComAMeta(meta: MetaTemplate[]) {
  const byName = new Map(meta.map((t) => [t.name, t]));
  return catalogoDaCasa().map((m) => ({
    estagio: m.estagio,
    name: m.name,
    body: m.body,
    language: m.language,
    category: m.category,
    variaveis: m.variaveis,
    status: byName.get(m.name)?.status ?? "NOT_SUBMITTED",
    id: byName.get(m.name)?.id,
    rejected_reason: byName.get(m.name)?.rejected_reason,
  }));
}

export interface ResultadoDaSubmissao {
  name: string;
  action: "submitted" | "existing" | "failed";
  id?: string;
  status?: string;
  /** O motivo DA META, quando ela recusou — não uma paráfrase da casa. */
  error?: string;
}

/**
 * Submete o que a Meta ainda não tem. Idempotente de propósito: o que já existe
 * volta como `existing`, com a situação atual, e não é reenviado.
 */
export async function submeterCatalogoNaMeta(cfg: CredenciaisDaMeta): Promise<ResultadoDaSubmissao[]> {
  const existing = await listarModelosNaMeta(cfg);
  const byName = new Map(existing.map((t) => [t.name, t]));
  const results: ResultadoDaSubmissao[] = [];

  for (const template of catalogoDaCasa()) {
    const current = byName.get(template.name);
    if (current) {
      results.push({ name: template.name, action: "existing", id: current.id, status: current.status });
      continue;
    }
    const components: Array<Record<string, unknown>> = [
      {
        type: "BODY",
        text: template.body,
        ...(template.examples.length ? { example: { body_text: [template.examples] } } : {}),
      },
    ];
    const res = await fetch(metaGraphUrl(`${cfg.wabaId}/message_templates`), {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: template.name, language: template.language, category: template.category, components }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      error?: { message?: string; error_user_msg?: string };
    };
    if (res.ok) {
      results.push({
        name: template.name,
        action: "submitted",
        id: json.id == null ? undefined : String(json.id),
        status: json.status == null ? "PENDING" : String(json.status),
      });
    } else {
      results.push({
        name: template.name,
        action: "failed",
        error: maskGraphResponse(json.error?.error_user_msg ?? json.error?.message ?? "Falha ao submeter modelo."),
      });
    }
  }
  return results;
}
