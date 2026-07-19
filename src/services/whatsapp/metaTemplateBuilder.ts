/**
 * metaTemplateBuilder — converts a FOOCCI CRM message (named placeholders like
 * {nome}, {cupom}, {link_cardapio}) into a Meta WhatsApp message-template spec
 * (POST /{waba}/message_templates), where variables MUST be sequential integers
 * ({{1}}, {{2}}, …) each with an accompanying example value.
 *
 * The token ORDER produced here (paramTokens) is the contract the send layer uses
 * to fill body params per-customer: metaCrmSend renders each token against the same
 * canonical CRM context, so the delivered message matches the freeform version.
 *
 * Pure module — no DB, no network.
 */

/** Canonical CRM variables the renderer knows (mirrors KNOWN_CRM_VARIABLES). */
const KNOWN_TOKENS = [
  "nome",
  "restaurante",
  "ultimo_pedido",
  "nivel",
  "dias_sem_pedir",
  "produto_favorito",
  "link_cardapio",
  "link_avaliacao_google",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "cupom",
  "validade",
] as const;

export type KnownToken = (typeof KNOWN_TOKENS)[number];

/** Matches a known token with optional double braces and inner spaces: {nome} · {{ nome }}. */
const TOKEN_RE = new RegExp(`\\{\\{?\\s*(${KNOWN_TOKENS.join("|")})\\s*\\}?\\}`, "g");

export interface MetaTemplateBuildInput {
  /** Meta template name (lowercase, digits, underscore). */
  name:      string;
  /** FOOCCI message body with {token} placeholders. */
  message:   string;
  category:  "MARKETING" | "UTILITY";
  language?: string;
  /** Optional footer (e.g. opt-out line). */
  footer?:   string | null;
  /** token name (no braces) → example value shown to Meta's reviewer. */
  examples:  Partial<Record<KnownToken, string>>;
}

export interface MetaTemplateBuildResult {
  /** Ready to POST as the request body. */
  payload: {
    name:       string;
    language:   string;
    category:   string;
    components: Array<Record<string, unknown>>;
  };
  /** Canonical tokens in body order, e.g. ["{nome}","{cupom}","{link_cardapio}"]. */
  paramTokens:   string[];
  /** Body text with {{1}}…{{n}} substituted. */
  bodyText:      string;
  bodyVariables: number;
}

/** Fallback example when the caller didn't supply one for a token. */
const DEFAULT_EXAMPLES: Record<KnownToken, string> = {
  nome:                  "Maria",
  restaurante:           "nossa loja",
  ultimo_pedido:         "combinado 20 peças",
  nivel:                 "Ouro",
  dias_sem_pedir:        "30",
  produto_favorito:      "temaki",
  link_cardapio:         "https://foocci.com.br",
  link_avaliacao_google: "https://g.page/r/avaliar",
  instagram:             "https://instagram.com",
  tiktok:                "https://tiktok.com",
  facebook:              "https://facebook.com",
  youtube:               "https://youtube.com",
  cupom:                 "10% de desconto",
  validade:              "31/12",
};

/**
 * Builds the Meta template payload. Each placeholder occurrence (in reading order)
 * becomes the next {{n}}; paramTokens records the canonical token for each position
 * so the send layer can fill them consistently.
 */
export function buildMetaTemplate(input: MetaTemplateBuildInput): MetaTemplateBuildResult {
  const language = input.language ?? "pt_BR";
  const paramTokens: string[] = [];
  const exampleValues: string[] = [];

  let counter = 0;
  let bodyText = input.message.trim().replace(TOKEN_RE, (_match, token: string) => {
    counter += 1;
    const t = token as KnownToken;
    paramTokens.push(`{${t}}`);
    const ex = (input.examples[t] ?? DEFAULT_EXAMPLES[t] ?? "exemplo").trim() || "exemplo";
    exampleValues.push(ex);
    return `{{${counter}}}`;
  });

  // Meta rejects a BODY whose text begins or ends with a variable ("Variables
  // can't be at the start or end of the template"). Nearly every CRM phrase ends
  // with {link_cardapio}, so pad with a neutral greeting/closer instead of
  // bouncing the submission back to the owner.
  if (/^\{\{\d+\}\}/.test(bodyText)) bodyText = `👋 ${bodyText}`;
  if (/\{\{\d+\}\}$/.test(bodyText)) bodyText = `${bodyText} 🧡`;

  const bodyComponent: Record<string, unknown> = { type: "BODY", text: bodyText };
  if (exampleValues.length > 0) {
    bodyComponent.example = { body_text: [exampleValues] };
  }

  const components: Array<Record<string, unknown>> = [bodyComponent];
  const footer = input.footer?.trim();
  if (footer) components.push({ type: "FOOTER", text: footer });

  return {
    payload: {
      name:     input.name,
      language,
      category: input.category,
      components,
    },
    paramTokens,
    bodyText,
    bodyVariables: paramTokens.length,
  };
}
