/**
 * Shared config for the public marketing site (/site and /site/*).
 *
 * LAUNCH MODE (2026-08-03): Foocci is commercially open. The pre-launch gate is
 * off, the CTAs invite a real demo request, and `DemoForm` posts to a real
 * lead-capture endpoint (`/api/site/leads`).
 *
 * Prices are NOT published yet — the CEO had not closed the three plan values by
 * launch day, and guardrail 7 ("nunca vender como pronto o que está em piloto")
 * plus decision D3 forbid inventing one. `/site/precos` therefore presents the
 * plans qualitatively and routes to the demo form. Publishing values later is a
 * content change on that page; nothing else here depends on it.
 *
 * History of the pre-launch posture: docs/foocci-site/pre-launch-mode-v1.md.
 */

export const LOGIN_URL = "/login";

/**
 * Sales WhatsApp. Still null: the launch conversion path is the demo form, which
 * persists every lead. Setting a number here lights up `whatsappUrl()` and the
 * WhatsApp CTAs without any other change.
 */
export const WHATSAPP_SALES_NUMBER: string | null = null;

/** Internal destinations used by the CTAs. */
export const COMO_FUNCIONA_URL = "/site/como-funciona";
export const PROPOSTA_URL = "/site/sobre";
export const DEMO_URL = "/site/demonstracao";

/**
 * MENU DE PRODUTO (decisão do CEO, 04/08): cada item vira PÁGINA própria — nada de
 * âncora que pula pro meio da home. Os dois carros-chefe (o atendimento por IA e o
 * CRM) têm página dedicada com os prints reais; "Soluções" reúne todo o resto
 * (cardápio, loja, cozinha, pagamento, entrega, nota fiscal, gestão/PDV). As antigas
 * âncoras `/site#solucoes` e `/site#crm` estavam órfãs desde a repaginação de 02/08 —
 * apontavam para seções que a home não renderiza mais.
 */
export const ATENDIMENTO_IA_URL = "/site/atendimento-com-ia";
export const CRM_URL = "/site/crm";
export const SOLUCOES_URL = "/site/solucoes";
export const PRECOS_URL = "/site/precos";
/**
 * A DEGUSTAÇÃO (04/08): a única página que não descreve o produto — leva o visitante
 * para dentro dele, na padaria de demonstração `foocci-bakery`. Fica entre "Soluções"
 * e "Planos e preços" no menu de propósito: é o último passo antes do preço.
 */
export const EXPERIMENTE_URL = "/site/experimente";
/**
 * A calculadora de comissão, na home. É o único lugar do site onde a taxa do
 * marketplace é EDITÁVEL — por isso todo número comparativo de outra página aponta
 * para cá ("faça a conta com os seus números") em vez de afirmar a taxa de alguém.
 */
export const CALCULADORA_URL = "/site#calculadora";
/**
 * Caminho único de conversão (decisão do CEO, 04/08): TODO CTA comercial leva ao
 * FORMULÁRIO de `/site/demonstracao`, onde o cliente deixa os dados e a gente entra
 * em contato. Não há mais agenda de horários nem "falar com o fundador" — o rótulo
 * é de PEDIDO, não de agendamento.
 */
export const DEMO_CTA_LABEL = "Pedir uma demonstração";

/** CTA copy. */
export const PRIMARY_CTA_LABEL = "Ver como o Foocci funciona";
export const SECONDARY_CTA_LABEL = "Conhecer a proposta";
/** Header CTA — the commercial conversion path (→ DEMO_URL). */
export const FOLLOW_LAUNCH_LABEL = "Pedir uma demonstração";

/** Launch messaging. */
export const PRELAUNCH_BADGE = "Para restaurantes que querem ser donos dos próprios clientes";
export const PRELAUNCH_NOTE = "Fale com a gente e veja o Foocci no seu restaurante.";

const DEFAULT_WA_MESSAGE = "Olá! Quero saber mais sobre o Foocci.";

/** Returns a wa.me URL when a sales number is configured. */
export function whatsappUrl(message: string = DEFAULT_WA_MESSAGE): string | null {
  if (!WHATSAPP_SALES_NUMBER) return null;
  return `https://wa.me/${WHATSAPP_SALES_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Props for a link that is external when configured, else internal. */
export function ctaTarget(href: string): { href: string } & Record<string, string> {
  const external = href.startsWith("http");
  return external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

/**
 * Menu do site. Cinco destinos, nesta ordem — os dois carros-chefe primeiro, depois
 * o resto, depois EXPERIMENTAR e só então o preço: é o funil (o que faz → veja tudo →
 * teste → compre). O "Pedir uma demonstração" NÃO entra aqui: ele é o botão de ação
 * laranja do header (mais limpo do que repetir o CTA como item de menu). Ver
 * `MarketingHeader`.
 */
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: ATENDIMENTO_IA_URL, label: "Atendimento com IA" },
  { href: CRM_URL, label: "CRM" },
  { href: SOLUCOES_URL, label: "Soluções" },
  { href: EXPERIMENTE_URL, label: "Experimente" },
  { href: PRECOS_URL, label: "Planos e preços" },
];
