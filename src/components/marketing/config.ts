/**
 * Shared config for the public marketing site (/site and /site/*).
 *
 * LAUNCH MODE (2026-08-03): Foocci is commercially open. The pre-launch gate is
 * off, the CTAs invite a real demo request, and `DemoForm` posts to a real
 * lead-capture endpoint (`/api/site/leads`).
 *
 * PREÇO: PUBLICADO desde 04/08/2026. Este cabeçalho dizia o contrário — "prices
 * are NOT published yet", "presents the plans qualitatively" — e continuou
 * dizendo por três semanas depois de os três valores serem fechados e o checkout
 * self-service entrar no ar. Em 25/08/2026 o CEO corrigiu um relatório que eu
 * havia montado em cima deste comentário: *"o já tem o preço no site."*
 *
 * Os valores mensais vigentes são Essencial R$ 179, Crescimento R$ 429 e
 * Performance R$ 899 — e ESTA LINHA É INFORMATIVA, não fonte. A fonte única é
 * `PLAN_CYCLE_CENTS` em `@/lib/billing/pricing`, a mesma função que decide o que
 * sai do cartão. Se os números acima divergirem de lá, quem está errado é este
 * comentário; foi assim que o erro anterior nasceu.
 *
 * A decisão D3 continua valendo e não é sobre isto: ela proíbe **inventar** preço
 * que o CEO não fechou. Preço fechado e publicado, o site mostra.
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
 * ── ACESO EM 25/08/2026, POR DECISÃO DO CEO ─────────────────────────────────
 *
 * O número existe: **11 94372-3316**, o WhatsApp comercial do Foocci, informado
 * pelo CEO ao ser perguntado qual era. Ele fica FIXO NO REPOSITÓRIO, e não como
 * variável no Railway, por um motivo prático: `NEXT_PUBLIC_*` é congelada no
 * build (ver a armadilha logo abaixo), então a variável exigiria dois atos — salvar
 * e refazer o deploy — e o segundo é justamente o que se esquece. Fixo aqui, o
 * número sobe junto com o código que o usa.
 *
 * Não é segredo: é o número que vai ficar ESTAMPADO no site público, para
 * estranhos ligarem. Segredo do canal (token e `phone_number_id` da Meta) continua
 * fora do repositório, onde sempre esteve.
 *
 * ⚠️ **ISTO NÃO LIGA A RECEPÇÃO.** Aceso, o site leva a pessoa ao WhatsApp com a
 * mensagem pronta — e a conversa cai no aparelho, para uma pessoa ler e responder
 * à mão. Para o "oi" ser reconhecido, ligado ao lead pelo `#código` e registrado
 * na Sala de Vendas, faltam as chaves da Meta (`FOOCCI_SALES_PHONE_NUMBER_ID` e
 * `FOOCCI_SALES_ACCESS_TOKEN`) — ver `FoocciSalesChannel.ts`. São coisas separadas
 * de propósito, e confundir as duas seria dar por automático o que hoje é manual.
 *
 * Duas formas de acender, nesta ordem de precedência:
 *   1. `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no Railway — troca o número sem mexer
 *      no código, e vence o valor fixo abaixo. É o caminho para TROCAR de número.
 *   2. `HARDCODED_SALES_NUMBER` abaixo — o valor de hoje.
 *
 * ⚠️ ARMADILHA REAL, e ela já mordeu neste projeto: variável `NEXT_PUBLIC_*` é
 * **congelada no BUILD**, não lida em tempo de execução. Este arquivo é importado
 * por `DemoForm.tsx`, que é `"use client"`. Salvar a variável no Railway **e não
 * refazer o build** deixa o site exatamente como estava — sem erro, sem log, sem
 * pista. Quem estiver esperando o botão acender vai concluir que o número está
 * quebrado. Depois de salvar, **Redeploy**. O mesmo aviso já existe em
 * `docs/setup-meta-passo-a-passo.md` para `NEXT_PUBLIC_META_APP_ID`.
 *
 * Formato: só dígitos, com DDI. `55` + `11` + `94372-3316`.
 */
const HARDCODED_SALES_NUMBER: string | null = "5511943723316";

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
 * em quatro páginas, sempre como TEXTO MORTO, sem link. E não existia telefone,
 * WhatsApp nem e-mail em lugar nenhum do site (`WHATSAPP_SALES_NUMBER` estava
 * desligado). O visitante que JÁ tinha decidido falar com a gente lia "fale com a
 * gente" e não tinha com quem falar.
 *
 * Convite sem porta é a forma mais barata de perder quem já estava convencido. O
 * texto novo não convida: DESCREVE o que acontece depois do clique no botão que
 * está logo acima dele. É a mesma informação, no tempo verbal certo.
 *
 * ── 25/08/2026: A FRASE PASSOU A DEPENDER DO NÚMERO ─────────────────────────
 *
 * Com o número aceso, o percurso INVERTEU de direção: a pessoa não espera ser
 * chamada, ela é levada ao WhatsApp para mandar o "oi". "Uma pessoa do Foocci
 * chama você" virou promessa errada — e errada do jeito pior, porque o visitante
 * fecha a aba e fica esperando um telefonema que não vai acontecer.
 *
 * Por isso a frase é derivada do número, e não escrita duas vezes: `DemoForm` já
 * troca a microcopy dele pelo mesmo critério, e duas frases sobre o mesmo percurso
 * que mudam por critérios diferentes é como uma delas fica para trás.
 */
export const CONTATO_NOTE = WHATSAPP_SALES_NUMBER
  ? "Você deixa nome e WhatsApp, e a gente abre a conversa com a mensagem já escrita."
  : "Você deixa nome e WhatsApp; uma pessoa do Foocci chama você.";

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
