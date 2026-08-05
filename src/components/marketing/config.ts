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
 * WhatsApp de VENDAS do Foocci — a chave única que acende todo o caminho novo.
 *
 * Enquanto for `null`, nada muda: o formulário salva o lead e mostra "recebemos,
 * entramos em contato", exatamente como antes. No instante em que existir número,
 * o mesmo formulário passa a levar a pessoa para o WhatsApp com a mensagem já
 * escrita — sem tocar em mais nenhum arquivo.
 *
 * POR QUE O CLIENTE É QUEM MANDA O "OI": abordar quem nunca falou com a gente é o
 * que queima número e, no WhatsApp oficial, exige modelo aprovado pela Meta. Se a
 * conversa nasce do lado dele, abre a janela de 24h de texto livre, o
 * consentimento fica evidente e o risco de banimento cai a quase zero
 * (`docs/sdr-foocci-desenho.md`).
 *
 * Duas formas de acender, nesta ordem de precedência:
 *   1. `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no Railway — não exige deploy de código.
 *   2. `HARDCODED_SALES_NUMBER` abaixo — para quem preferir fixar no repositório.
 *
 * Formato: só dígitos, com DDI. Ex.: `5511999998888`.
 */
const HARDCODED_SALES_NUMBER: string | null = null;

/** Tira tudo que não é dígito; devolve null se não sobrar número de verdade. */
function onlyDigits(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

export const WHATSAPP_SALES_NUMBER: string | null =
  onlyDigits(process.env.NEXT_PUBLIC_WHATSAPP_SALES_NUMBER) ?? onlyDigits(HARDCODED_SALES_NUMBER);

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
 * ⚑ O RÓTULO ÚNICO DE TODO CTA COMERCIAL. Escreva-o AQUI e em lugar nenhum mais.
 *
 * Caminho único de conversão (decisão do CEO, 04/08): TODO CTA comercial leva ao
 * FORMULÁRIO de `/site/demonstracao`, onde o cliente deixa os dados e uma pessoa do
 * Foocci entra em contato.
 *
 * TEXTO ÚNICO (decisão do Diretor, 05/08). O site tinha ONZE chamadas para este
 * mesmo destino com NOVE textos diferentes — "Pedir uma demonstração", "Ver
 * funcionando no meu restaurante", "Quero isso no meu restaurante — pedir uma
 * demonstração", "Peça uma demonstração"… Nove nomes para uma porta só é o
 * visitante tendo que descobrir, botão a botão, que todos levam ao mesmo lugar.
 *
 * "Ver no meu restaurante" e não "Pedir uma demonstração" porque o primeiro
 * descreve o que a pessoa GANHA e o segundo o que ela PEDE — e ele responde de
 * uma vez as duas perguntas do CEO: demonstração do quê (o Foocci) e para quem
 * (o restaurante dela). Curto o bastante para caber no header a 375px sem
 * quebrar linha.
 *
 * REGRA DE MANUTENÇÃO: nenhum componente escreve o rótulo à mão. Rótulo literal
 * em componente é exatamente como nasceram os nove textos.
 */
export const DEMO_CTA_LABEL = "Ver no meu restaurante";

/**
 * ⚑ QUANTOS CTAs COMERCIAIS CADA PÁGINA PODE TER (decisão do Diretor, 05/08).
 *
 * **No máximo UM por página**, além do botão do header e da barra fixa do celular.
 * Onde havia dois, ficou o que vem DEPOIS do argumento — a pessoa precisa ter lido
 * o motivo antes de ser convidada. Botão repetido não aumenta conversão: ensina o
 * visitante a ignorar a cor laranja, e aí o que importa perde força.
 *
 * NÃO conta como CTA comercial o botão que leva a uma FERRAMENTA ou a uma PROVA em
 * vez do formulário — a calculadora na home ("Calcular minha economia"), a
 * degustação, a âncora para as telas reais. Eles são o argumento, não o convite.
 *
 * As exceções vivem comentadas no ponto de uso, nunca aqui. Regra sem exceção
 * documentada vira lei burra.
 */

/** CTA copy. */
export const PRIMARY_CTA_LABEL = "Ver como o Foocci funciona";
export const SECONDARY_CTA_LABEL = "Conhecer a proposta";

/** Launch messaging. */
export const PRELAUNCH_BADGE = "Para restaurantes que querem ser donos dos próprios clientes";
export const PRELAUNCH_NOTE = "Fale com a gente e veja o Foocci no seu restaurante.";

const DEFAULT_WA_MESSAGE = "Olá! Quero saber mais sobre o Foocci.";

/**
 * Monta a URL `wa.me` quando existe número de vendas; `null` quando não existe.
 *
 * O segundo parâmetro existe só para o teste conseguir provar os DOIS cenários
 * (com e sem número) sem depender de variável de ambiente de build — em produção
 * ninguém passa esse argumento.
 */
export function whatsappUrl(
  message: string = DEFAULT_WA_MESSAGE,
  numero: string | null = WHATSAPP_SALES_NUMBER,
): string | null {
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

/**
 * A mensagem que a pessoa vai só apertar enviar.
 *
 * Escrita na PRIMEIRA PESSOA e com o que ela acabou de digitar, porque quem manda
 * é ela: "Oi! Sou João, do restaurante Pizzaria Nonna, e quero conhecer o Foocci.
 * #A7K2M".
 *
 * DUAS ARMADILHAS DE GÊNERO, e as duas estão resolvidas aqui porque a mensagem é
 * assinada por quem a envia — sair errada é constrangimento dela, não nosso:
 *
 *  1. **"Sou João", não "Sou o João".** O artigo exigiria saber o gênero de quem
 *     preencheu, e o formulário não pergunta. Adivinhar pelo nome erra com Andrea,
 *     Darci e todo nome estrangeiro. Sem artigo, vale para qualquer nome.
 *  2. **"do restaurante Pizzaria Nonna", não "do Pizzaria Nonna".** O nome do
 *     estabelecimento também tem gênero imprevisível ("a Pizzaria Nonna", "o Bar
 *     do Zé"). Pôr o substantivo masculino "restaurante" antes do nome faz a
 *     preposição concordar com ELE e não com o nome — fica certo sempre.
 *
 * Sem o nome do restaurante (campo opcional), a frase perde o trecho INTEIRO,
 * vírgulas incluídas: "Oi! Sou Ana e quero conhecer o Foocci."
 *
 * O `#código` no fim é o que liga esse "oi" ao lead que acabou de ser salvo. Sem
 * ele chega uma mensagem sem contexto e o atendimento pede de novo tudo que a
 * pessoa já preencheu. Sem código (falha na geração), a mensagem sai sem a marca:
 * é pior para o atendimento, mas nunca impede a conversa.
 */
export function buildLeadWhatsAppMessage(lead: {
  nome: string;
  restaurante?: string | null;
  codigo?: string | null;
}): string {
  const nome = lead.nome.trim();
  const restaurante = (lead.restaurante ?? "").trim();
  const codigo = (lead.codigo ?? "").trim();

  const quem = restaurante
    ? `Sou ${nome}, do restaurante ${restaurante}, e`
    : `Sou ${nome} e`;
  const marca = codigo ? ` #${codigo}` : "";
  return `Oi! ${quem} quero conhecer o Foocci.${marca}`;
}

/**
 * Número de vendas em formato legível — `+55 (11) 99999-8888`.
 *
 * É o plano B da tela: se o WhatsApp não abrir, a pessoa precisa conseguir LER e
 * copiar o número. Formata o padrão brasileiro (DDI 55 + DDU + 8 ou 9 dígitos) e,
 * para qualquer outro formato, devolve o número com `+` na frente em vez de
 * inventar uma máscara errada.
 */
export function formatSalesNumber(numero: string | null = WHATSAPP_SALES_NUMBER): string | null {
  if (!numero) return null;
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : `+${numero}`;
}

/** Props for a link that is external when configured, else internal. */
export function ctaTarget(href: string): { href: string } & Record<string, string> {
  const external = href.startsWith("http");
  return external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

/**
 * Menu do site. Cinco destinos, nesta ordem — os dois carros-chefe primeiro, depois
 * o resto, depois EXPERIMENTAR e só então o preço: é o funil (o que faz → veja tudo →
 * teste → compre). O CTA comercial (`DEMO_CTA_LABEL`) NÃO entra aqui: ele é o botão
 * de ação laranja do header (mais limpo do que repetir o CTA como item de menu). Ver
 * `MarketingHeader`.
 */
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: ATENDIMENTO_IA_URL, label: "Atendimento com IA" },
  { href: CRM_URL, label: "CRM" },
  { href: SOLUCOES_URL, label: "Soluções" },
  { href: EXPERIMENTE_URL, label: "Experimente" },
  { href: PRECOS_URL, label: "Planos e preços" },
];
