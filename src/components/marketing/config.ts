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
 *   1. `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no Railway — não exige mudar código.
 *   2. `HARDCODED_SALES_NUMBER` abaixo — para quem preferir fixar no repositório.
 *
 * ⚠️ ARMADILHA REAL, e ela já mordeu neste projeto: variável `NEXT_PUBLIC_*` é
 * **congelada no BUILD**, não lida em tempo de execução. Este arquivo é importado
 * por `DemoForm.tsx`, que é `"use client"`. Salvar a variável no Railway **e não
 * refazer o build** deixa o site exatamente como estava — sem erro, sem log, sem
 * pista. Quem estiver esperando o botão acender vai concluir que o número está
 * quebrado. Depois de salvar, **Redeploy**. O mesmo aviso já existe em
 * `docs/setup-meta-passo-a-passo.md` para `NEXT_PUBLIC_META_APP_ID`.
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
 * ⚑ ONDE MORA O FORMULÁRIO — a porta única do SDR.
 *
 * DECISÃO DO CEO (06/08, confirmada duas vezes): a página `/site/demonstracao`
 * foi ELIMINADA e o formulário virou a ÚLTIMA SEÇÃO de `/site/precos`. Uma página
 * a menos, o mesmo lead — e quem clica em "agende uma demonstração" chega com o
 * preço na frente, que é a informação que ele ia perguntar na ligação de qualquer
 * jeito.
 *
 * A rota velha NÃO sumiu: `/site/demonstracao` (e `/site/agendar`, que já
 * apontava para ela) respondem 308 para cá. Ela foi divulgada e está em índice de
 * busca; 404 em porta de lead é lead perdido sem ninguém ver.
 *
 * ESTA CONSTANTE É A FONTE ÚNICA. Nenhuma página escreve o caminho à mão — é uma
 * linha justamente para que mudar o endereço do formulário seja mudar uma linha.
 * Foi o que aconteceu aqui: onze CTAs mudaram de destino sem tocar em onze
 * arquivos.
 */
export const DEMO_URL = `${PRECOS_URL}#demonstracao`;

/**
 * O caminho SEM a âncora. Existe para quem precisa comparar com `usePathname()`,
 * que nunca devolve o `#` — a barra fixa do celular usa isso para não se oferecer
 * a levar a pessoa para a página em que ela já está (ver `StickyMobileCta`).
 *
 * Derivado, e não digitado de novo: duas cópias do mesmo endereço é como a
 * comparação silenciosamente para de bater no dia em que o formulário se mudar.
 */
export const DEMO_PAGE_PATH = DEMO_URL.split("#")[0]!;

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
 * FORMULÁRIO — que desde 06/08 é a última seção de `/site/precos` (`DEMO_URL`),
 * onde o cliente deixa os dados e uma pessoa do Foocci entra em contato.
 *
 * TEXTO ÚNICO (decisão do Diretor, 05/08). O site tinha ONZE chamadas para este
 * mesmo destino com NOVE textos diferentes — "Pedir uma demonstração", "Ver
 * funcionando no meu restaurante", "Quero isso no meu restaurante — pedir uma
 * demonstração", "Peça uma demonstração"… Nove nomes para uma porta só é o
 * visitante tendo que descobrir, botão a botão, que todos levam ao mesmo lugar.
 *
 * DECISÃO DO CEO (05/08, à noite): **"Agende uma demonstração"**, e é ele quem
 * está certo sobre o próprio funil. Eu tinha escolhido "Ver no meu restaurante"
 * por descrever o que a pessoa GANHA em vez do que ela PEDE — bom princípio de
 * copy, e errado aqui: este botão é a porta do SDR. Quem clica está marcando
 * conversa com uma pessoa, e o rótulo tem que dizer isso, porque a promessa do
 * botão vira a expectativa da ligação. "Ver no meu restaurante" prometia uma
 * tela; do outro lado atende um humano.
 *
 * Quem mostra o produto sem intermediário é a DEGUSTAÇÃO (`EXPERIMENTE_URL`), com
 * outro botão e outra promessa. Duas portas, duas frases honestas.
 *
 * REGRA DE MANUTENÇÃO: nenhum componente escreve o rótulo à mão. Rótulo literal
 * em componente é exatamente como nasceram os nove textos.
 */
export const DEMO_CTA_LABEL = "Agende uma demonstração";

/**
 * ⚑ A PORTA NOVA — o agente no WhatsApp (decisão do CEO, 24/08/2026).
 *
 * Palavras dele: *"Esse botão laranja, 'Agende uma demonstração', não existe.
 * (…) ali ele vai ser direcionado pro WhatsApp [do] Foocci. (…) 'tire as dúvidas
 * com os nossos agentes'."*
 *
 * O endereço é INTERNO de propósito. Se cada botão apontasse direto para o
 * `wa.me`, o link ficaria assado no HTML de cada página e acender ou apagar o
 * canal viraria um build novo — a mesma armadilha do `NEXT_PUBLIC_` que já mordeu
 * esta casa. Apontando para cá, quem decide o destino é o servidor, a cada
 * clique: WhatsApp quando o canal está no ar, formulário enquanto não está.
 *
 * Ver `src/app/site/(gated)/falar-com-agente/route.ts` e `@/lib/site/canalDeVendas`.
 */
/**
 * ⚑ O TOPO DO SITE NÃO CONVIDA PARA CONVERSA — CONVIDA PARA ASSINAR.
 *
 * Decisão do CEO (24/08/2026), palavras dele: *"O botão laranja lá em cima,
 * 'fale com especialista' ou coisa do tipo, tem que ser banido do site. No lugar
 * disso, colocar pro cliente já assinar. Então é um botão pra entrar e um botão
 * pra já ir pra tela da assinatura. E o contato com dúvida ou qualquer coisa do
 * tipo é WhatsApp."*
 *
 * O destino é o checkout self-service, que **existe e cobra de verdade**: o
 * cliente escolhe plano e ciclo, aceita o Termo, paga e sai com a loja no ar, sem
 * humano no meio (`/contratar/novo` → `POST /api/billing/checkout`). Isto foi
 * CONFERIDO antes de o botão ser escrito — botão dizendo "Assinar" que caísse num
 * formulário de contato seria a mesma doença que a gente acabou de arrancar do
 * site: o texto prometendo o que o destino não entrega.
 *
 * Sem plano na URL de propósito: a tela abre no Crescimento mensal e o cliente
 * troca ali mesmo, vendo os três preços. Escolher por ele seria empurrar plano.
 */
export const ASSINAR_URL = "/contratar/novo";
export const ASSINAR_CTA_LABEL = "Assinar";

export const AGENTE_URL = "/site/falar-com-agente";

/** O rótulo do botão laranja quando o canal está no ar. */
export const AGENTE_CTA_LABEL = "Fale com nosso agente";

/** A chamada do botão flutuante — a fala do CEO, quase literal. */
export const AGENTE_FLUTUANTE_LABEL = "Tire suas dúvidas";

/**
 * A microcopy sob o botão quando o canal está no ar.
 *
 * Descreve o que acontece depois do clique, no tempo verbal certo — mesma regra
 * do `CONTATO_NOTE`. Sem prazo e sem promessa de resposta imediata: não existe
 * compromisso de "respondemos em X minutos", e prometer prazo que não se cumpre é
 * o contrário do que esta casa faz.
 */
export const AGENTE_NOTE = "Você fala com o nosso agente pelo WhatsApp e tira as dúvidas por lá.";

/**
 * ⚑ O RÓTULO DA DEGUSTAÇÃO — a outra porta, e ela NÃO é comercial.
 *
 * Era "Experimentar antes", e o CEO matou a expressão pelo motivo certo: *"dá a
 * entender que eu vou testar o sistema antes de pagar — isso pode gerar
 * confusão"*. O Foocci não oferece teste grátis do sistema; oferece uma padaria
 * de demonstração já montada, com QR Code, para a pessoa **ver funcionando**.
 * "Antes" sugeria um período de avaliação que não existe, e prometer degrau que
 * não existe é o guardrail 7 na direção do exagero.
 */
export const EXPERIMENTE_CTA_LABEL = "Veja como funciona";

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
 *
 * ⚠️ A HOME TEM DUAS, e é a única. A regra nasceu de manhã e a varredura de percurso
 * da tarde a corrigiu: quem rola a home inteira chega ao fecho e, sem convite ali,
 * sai de mãos vazias justamente o visitante que leu tudo. Ficaram o da calculadora
 * (pico emocional — logo depois de ver a economia DELE) e o do fecho (depois do
 * argumento inteiro). Estão separados por várias telas; não competem na mesma dobra.
 * A justificativa mora em `FinalCTASection.tsx` e a decisão em `docs/decisoes.md`.
 */

/** CTA copy. */
export const PRIMARY_CTA_LABEL = "Ver como o Foocci funciona";
export const SECONDARY_CTA_LABEL = "Conhecer a proposta";

/** Launch messaging. */
export const PRELAUNCH_BADGE = "Para restaurantes que querem ser donos dos próprios clientes";

/**
 * A microcopy sob o botão das páginas internas.
 *
 * ANTES ela dizia **"Fale com a gente e veja o Foocci no seu restaurante."** — e a
 * varredura de percurso de 05/08 mostrou o tamanho do problema: essa frase aparecia
 * em quatro páginas, sempre como TEXTO MORTO, sem link. E não existe telefone,
 * WhatsApp nem e-mail em lugar nenhum do site (`WHATSAPP_SALES_NUMBER` está
 * desligado em produção). O visitante que JÁ tinha decidido falar com a gente lia
 * "fale com a gente" e não tinha com quem falar.
 *
 * Convite sem porta é a forma mais barata de perder quem já estava convencido. O
 * texto novo não convida: DESCREVE o que acontece depois do clique no botão que
 * está logo acima dele. É a mesma informação, no tempo verbal certo.
 *
 * Quando `WHATSAPP_SALES_NUMBER` for ligado, o convite direto volta a fazer sentido
 * — e aí ele nasce com link de verdade, não como frase.
 */
export const CONTATO_NOTE = "Você deixa nome e WhatsApp; uma pessoa do Foocci chama você.";

/**
 * @deprecated Use `CONTATO_NOTE`. O nome antigo sobrevive só como apelido porque o
 * site saiu do pré-lançamento em 03/08 e "PRELAUNCH" descreve um estado que acabou.
 * Some quando as últimas páginas migrarem — não escreva código novo com ele.
 */
export const PRELAUNCH_NOTE = CONTATO_NOTE;

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
  /*
    "Ver funcionando" e não "Experimente": mesma correção do CEO aplicada ao menu,
    porque o problema é a PALAVRA e ela estava em três lugares (botão do fecho,
    título da página e aqui). Deixar o menu dizendo "Experimente" enquanto a página
    de destino diz "Veja como funciona" é o visitante clicando numa promessa e
    chegando noutra.

    "Ver funcionando" e não "Veja como funciona" só por caber: item de menu divide
    a barra com outros quatro, e a 1280px a frase inteira empurrava o botão laranja
    para fora. Mesmo verbo, mesma promessa, metade do comprimento.
  */
  { href: EXPERIMENTE_URL, label: "Ver funcionando" },
  { href: PRECOS_URL, label: "Planos e preços" },
];
