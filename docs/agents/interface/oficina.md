# Oficina — interface (2026-08)

> Append-only. O especialista escreve aqui; a vitrine é do Diretor.

---

## 2026-08-03 — Terceiro cartão de QR (Loja) na tela Cardápio

**O que foi feito:** a Loja (catálogo + checkout, sem conversa) ganhou URL própria
(`/pedido/[slug]?modo=loja`) e um terceiro `QRCard` na tela Cardápio, entre Salão
e Delivery (ordem do mais simples ao mais completo). O parâmetro só REMOVE a IA,
nunca a liga — a trava por plano fica intocada.

**Aprendizado 1 — breakpoint de viewport não serve para componente que vive em
grid.** O corpo do `QRCard` virava linha (`sm:flex-row`) a partir de 640px de
*viewport*, mas dentro de um grid de 2 colunas o cartão tem ~350px a 768px de
tela — o conteúdo estourava e o `overflow-hidden` do cartão **cortava o input e o
texto de dica**. Isso já acontecia em produção com 2 cartões; ninguém tinha visto
porque o corte é silencioso. Sem container queries (Tailwind 3.4 sem plugin), a
saída foi uma prop `layout="stacked" | "row"` no `QRCard`: quem conhece a largura
do cartão é o *uso*, não o componente. O `web-menu` (cartão em largura cheia)
mantém `row`; o grid do Cardápio usa `stacked`.

**Aprendizado 2 — decisão de grid tomada por screenshot, não por conta de
cabeça.** Primeira tentativa: manter 2 colunas e o terceiro cartão embaixo →
screenshot em 1280 mostrou meio-vazio feio à direita. Segunda: `xl:grid-cols-3`
com corpo empilhado → três colunas de ~320px, botões acomodam em duas linhas,
nada espremido. A conta de cabeça dizia que 3 colunas não cabiam — cabiam, desde
que o corpo fosse empilhado.

**Drift corrigido de carona no `QRCard`:** `ring-gray-100` → `ring-line`,
`font-bold` → `font-semibold`, hex `#111827` → `#0B0B0B` (valor do token `ink`,
lib de QR exige hex), foco `brand-300` → `brand-400` (canônico).

**Prova do `?modo=loja`:** restaurante seed promovido a PRO localmente;
screenshot da rota normal (chat verde do PedidoClient) vs. com parâmetro
(catálogo laranja do LojaClient). Postgres local + seed + Playwright, receita
funcionou: `service postgresql start`, `prisma db push` (as migrations históricas
quebram com `migrate deploy` em banco virgem — erro "relation orders does not
exist"), `npm run db:seed` (rodar `prisma generate` antes, senão o client fica
dessincronizado do schema).

— interface, OS do terceiro cardápio (branch `claude/foocci-director-onboarding-lhindy`)

---

## 2026-08-03 — A casa do Agente de CRM (OS P0 §3): unificação em /admin/agentes/crm

**Decisão de rota.** A casa é `/admin/agentes/crm` — a família `/admin/agentes/*`
já existia (`waiter`, `analytics`, `training`) e a rota nem tinha página (só
`/testes`, do centro de qualidade, que ficou intocado). `/admin/crm-agente`
virou `redirect()` para a casa; o link único do AdminSidebar aponta para a rota
nova. Conteúdo da tela antiga (toggles por campanha, automações, frases campeãs)
preservado dentro da casa como seção "Campanhas e automações", recebendo o
restaurante do seletor único por prop.

**Achado 1 — a tela antiga já estava QUEBRADA para admin puro, e ninguém viu.**
`/admin/crm-agente` consumia as rotas tenant (`/api/crm/agent`,
`/api/crm/automations`), que ficam atrás do middleware de NextAuth. Cookie de
admin não passa por lá: o middleware devolve 401 **antes** de a rota rodar o
`resolverEscopoDoAgente` — exatamente o caminho "admin declara o restaurante"
que a rota implementa com cuidado. O comentário da rota prometia "duas plateias,
uma rota"; o middleware desmentia. Lição: **rota de plateia dupla
(tenant + admin) só funciona se o middleware souber disso** — no Foocci, admin
consome rota `/api/admin/*` (fora do matcher de NextAuth) chamando o MESMO
serviço. Foi o que a casa passou a fazer (`/api/admin/crm/agent/activation`
ganhou masterEnabled + filtro de ruído; nasceu `/api/admin/crm/automations`).

**Achado 2 — o shell do admin não tinha NENHUM comportamento mobile.** O
`aside w-52` fixo deixava 167px úteis num viewport de 375px e TODA página do
admin estourava na horizontal (`main.scrollWidth` 296 vs `clientWidth` 167,
medido). Correção contida: topbar mobile + drawer (backdrop `z-40`, aside
`z-50`, `lg:static` — mesmo padrão do painel do lojista), uma classe no
layout (`flex-col lg:flex-row`). Desktop intacto; conferido com o drawer
ABERTO (a lição da vitrine sobre camadas).

**Achado 3 — screenshot fullPage não enxerga scroll interno.** O admin rola
dentro do `<main>` (`h-screen overflow-hidden`), então `fullPage: true`
devolve só a altura do viewport. Para capturar a página inteira: soltar o
shell antes do shot (`height:auto; overflow:visible` no shell e no main) — e
medir overflow ANTES, no `main.scrollWidth`, não no documento.

**Achado 4 — meta longa no `SectionTitle` espreme o título no 375.** O kit põe
título e meta na mesma linha flex; meta comprida quebrou "O DEGRAU" e "PRÓXIMO
PASSO" no meio. Correção: informação que importa ("neste degrau desde …") vira
Pill no corpo do card; meta fica curta ou sai.

**Honestidade visual:** lift do A/B só ganha cor de resultado (verde/vermelho)
com veredito conclusivo; com `AMOSTRA_INSUFICIENTE`/`EMPATE` fica neutro ao
lado do pill azul "Ainda não conclui" — número sem cor de conclusão.

**Provas colhidas:** rollback via rota admin (ALLOWLIST→SHADOW_ONLY, success),
promoção recusada pelos gates no servidor (evidência de sombra 5/20 — a escada
não se força pela tela), redirect da rota antiga verificado com Playwright,
screenshots 375/768/1280 + estados vazios, `tsc` limpo, 4698 testes verdes.

**Propostas de vitrine** (promoção é do Diretor):
1. "Rota de plateia dupla precisa do middleware como cúmplice" (Achado 1 — já
   custou uma tela morta em produção sem erro visível).
2. "O admin agora tem drawer mobile; overlays novos conferem com ele aberto"
   (Achado 2, atualiza o mapa de camadas da vitrine).
3. "fullPage do Playwright não vê scroll interno de shell fixo" (Achado 3 —
   receita de screenshot do admin difere da do painel).

— interface, OS-crm-agente-ligar-e-dar-casa §3 (branch `claude/foocci-director-onboarding-lhindy`)

---

## 2026-08-04 — Rebuild da página pública de planos (/site/precos)

**O que foi feito:** `/site/(gated)/precos/page.tsx` reconstruída do zero para o
lançamento comercial. Saiu a página "planos em definição" e entrou a proposta
fechada: cabeçalho + 3 cards de plano (Crescimento em destaque "Mais vendido"),
tabela de ciclos (mensal/trimestral/anual), bloco "primeiro mês pela metade",
tabela "cobrado à parte" (add-ons), regra do limite e CTA final. Dados vindos do
spec do CEO ("Planos Foocci v3"); a camada interna de precificação NÃO foi
publicada. Palavra "contrato" evitada (usei "serviço/serviços").

**Aprendizado 1 — o `/site` tem DUAS linguagens de token convivendo, e é de
propósito não unificar na marra.** Os primitivos de marketing compartilhados
(`PageHero`, `CtaBand`, `PrimaryCta`, `VisualStepCard`, `premium.tsx`) usam
`gray-*` e `#0B0B0B` literal internamente. O DESIGN.md manda usar
`ink/ink2/muted/paper/canvas/line/line2`. Resolvi assim: **meu markup novo é
100% token; os componentes reaproveitados ficam como estão.** `canvas` (#F6F6F4)
e `gray-50` (#F9FAFB) são visualmente quase idênticos, então a alternância de
seções (paper ↔ canvas) casa com o `gray-50` que os componentes trazem sem
costura visível. Trocar o `gray-*` dos componentes compartilhados no dia do
lançamento seria sweep de risco em página que roda o site inteiro — fica como
drift conhecido pra migração gradual, não pra véspera de release.

**Aprendizado 2 — card de pricing denso pede zonas, não paredão.** O card tem
~10 blocos (nome, tagline, preço, descontos, limite, CTA, "Só aqui você tem",
ROI, "Substitui", grupos de recursos). O que salvou a legibilidade: (a) preço +
CTA no topo, antes da rolagem do card; (b) diferenciais num box brand-tint
("Só aqui você tem") separado do ROI num box neutro ("Faz a conta"); (c) recursos
em grupos com label `uppercase tracking text-muted` + itens `text-[13px]` com
check. `items-start` no grid deixa o rodapé dos 3 cards irregular (conteúdo
diferente) — aceitável; o card destacado é o mais alto e central, vira o ápice.

**Aprendizado 3 — CTA da página x CTA global do site divergem hoje.** O
`config.ts` documenta decisão do CEO (03/08): a conversão comercial do site é
AGENDAR (`/site/agendar`, "Agendar demonstração") — e o header/sticky global
seguem isso. A ordem deste bloco foi explícita: nesta página, CTA é "Peça uma
demonstração" → `/site/demonstracao`, nunca "agendar". Cumpri na página; a chrome
global (header, sticky, footer) continua "Agendar". **Fica a divergência pro
Diretor decidir** se a página deve destoar do resto do site ou se o site inteiro
migra — não resolvi em silêncio.

**Verificação:** `npx tsc --noEmit` limpo. `npx vitest run`: 4687 testes verdes;
1 suíte (`AnalyticsAgentService.test.ts`) falha no import por
"PrismaClient is not a constructor" — problema de ambiente/prisma-client, sem
relação com a página (precos não importa nada de analytics). Screenshots 375/768/
1280 com Playwright, `scrollWidth` = clientWidth nos três (zero rolagem
horizontal). Auto-avaliação: hierarquia 9, tipografia 9, espaçamento 8,5,
consistência 9.

— interface, rebuild /site/precos (worktree `worktree-agent-a3c588a3f037f1b3a`,
commit `a81bd46b`)

---

## 2026-08-04 — Retrabalho da Loja sem IA: o cardápio do QR que compra

**Ordem do CEO (04/08):** a Loja (`/pedido/[slug]` no plano de entrada ou
`?modo=loja`) deve ser IGUAL ao cardápio da mesa (`/qr/[slug]`) — mesma cara,
mesma experiência — com uma única diferença: ela compra. A casca genérica de
e-commerce do LojaClient anterior estava errada e foi refeita.

**O que foi feito:** o visual do QRMenuClient foi EXTRAÍDO verbatim para
`src/components/menu/*` (types, format, WelcomeModal, ProductModal, cards,
MenuHero, CategoryNav, CategorySections) e os dois clientes agora compõem o
mesmo módulo — os cardápios não podem mais divergir por construção. O
ProductModal ganhou um modo `commerce` opcional: sem ele, é o modal do QR
pixel-idêntico; com ele, variantes viram selecionáveis (escolher define o
preço), grupos de opções e adicionais pagos ganham seletores, e o rodapé vira
observação + quantidade + "Adicionar · R$ X". Payload do carrinho espelha o
PedidoClient (baseItemId, variantName, selectedOptions, selectedExtras).

**Achado 1 — prova de pixel-idêntico com o próprio git.** Como verificar que a
extração não mudou o QR: `git stash` → screenshot baseline → `git stash pop` →
screenshot novo → `cmp` byte a byte (mesmo dev server, hot reload). 375/768 e
o modal deram idênticos; o 1280 "divergiu" numa caixa de 160×160 — era um
thumbnail `loading="lazy"` que não tinha pintado no baseline. Diff de pixel com
bbox (via sharp) desmascarou o falso positivo em segundos. Screenshot fullPage
com imagens lazy é não-determinístico; o sinal é o bbox do diff, não o `cmp`.

**Achado 2 — dois elementos fixos no rodapé não se empilham por offset.** A
barra de carrinho e a nav de categorias são ambas fixas embaixo. Offset
(`bottom: <altura da nav>`) quebraria com safe-area e com o wrap dos chips. A
solução foi um `topSlot` no CategoryNav: a barra entra DENTRO do mesmo
contêiner fixo, acima dos chips — um único `fixed`, zero conta de altura, e no
QR o slot vazio mantém o markup byte-idêntico.

**Achado 3 — BUG PRÉ-EXISTENTE de preço de variante no finalize (não corrigido
aqui, fora do escopo; REPORTAR).** O
`/api/pedido/[slug]/finalize` recalcula o preço no servidor a partir do preço
BASE do item (`channelPrice`) + opções + extras, e só grava `variantName` — o
preço da variante NUNCA é usado. E2E real: Quatro Queijos Grande (R$ 64,90 na
tela, base R$ 52,90) → cliente viu total R$ 190,70 na revisão; o pedido foi
gravado com R$ 166,70. Afeta igualmente o PedidoClient (mesmo payload, mesma
rota) desde antes deste retrabalho. Restaurante cobra a menos em toda venda de
variante com preço acima do base. Precisa de correção server-side (resolver
`variantId` → `resolveVariantPrice`), decisão do Diretor.

**Provas colhidas:** QR pixel-idêntico (cmp + diff bbox nos 3 tamanhos),
pedido real #1 CONFIRMED no banco local com variante + observação + opções +
extras no `addonsJson` canônico, screenshots 375/768/1280 das duas superfícies
e do fluxo de compra, `tsc` limpo, vitest 4697 verdes (1 falha pré-existente
em `quality/noSideEffects` por ambiente sem serviços — falha igual sem o diff).

**Propostas de vitrine** (promoção é do Diretor):
1. "Prova de pixel-idêntico em refactor visual: stash → baseline → pop → diff
   com bbox; imagem lazy gera falso positivo no cmp" (Achado 1).
2. "Elemento fixo novo no rodapé da loja entra como slot do contêiner da nav,
   não como segundo fixed com offset" (Achado 2).
3. O Achado 3 é pendência de produto/engenharia, não de vitrine — sugere-se
   registrar em docs/pendencias.md como P1 de cobrança incorreta.

— interface, retrabalho aprovado pelo CEO em 04/08 (branch
`claude/foocci-director-onboarding-lhindy`, sem commit — Diretor revisa)

---

## 2026-08-04 (tarde) — Topo de app do Cardápio sem IA: StoreHeader + Minha conta

**Ordem do CEO:** topo estilo marketplace — logomarca no superior esquerdo,
redes sociais, ícone do carrinho (faltava) e a identificação do cliente com o
"menuzinho" de cupons e endereços. Emenda explícita à regra "igual por
construção" de 04/08: o CORPO segue compartilhado com o QR; o TOPO da Loja é
composição própria.

**O que foi feito:** `StoreHeader` (barra sticky: logo+nome+status
aberto/fechado+modalidades à esquerda; avatar da conta com badge de cupons e
sacola com badge de quantidade à direita), `StoreAccountDrawer` (identidade +
Meus cupons + Meus endereços), `lojaWallet` (tipos + fetch das rotas read-only
já existentes), faixa fina de sociais + "Avaliar" no lugar do hero centralizado,
e o passo "Sua sacola" no fluxo (ícone abre a sacola; a barra inferior segue
direto pro fechamento — a combinação do iFood, que tem os dois). Do MenuHero
foram EXTRAÍDOS `MenuSocialLinks` e `MenuShowcase` (exportados e recompostos no
mesmo lugar — DOM do QR idêntico, provado por pixel-diff nos 3 tamanhos).

**Achado 1 — a carteira do cliente já existia inteira no backend; o trabalho
era honestidade, não tela.** `/api/pedido/[slug]/coupons` e `/customer-profile`
são read-only e gated por prova de posse do telefone (waToken — CR C1/LGPD), e
o `finalize` JÁ aceita `customerCouponId` com revalidação e recálculo no
servidor. Resultado: o cupom escolhido no drawer É aplicado de verdade (E2E
local: pedido #4 CONFIRMED, subtotal 52,90 → desconto 5,29 → total 47,61,
cupom vira USED). Sem token (telefone digitado no WelcomeModal), o drawer NÃO
finge: mostra a nota honesta "cupons e endereços aparecem entrando pelo link do
WhatsApp". Quando nascer o OTP (domínio canais), ele cunha o MESMO token e o
drawer destrava sem mudança.

**Achado 2 — ler sessionStorage no inicializador do useState quebra a
hidratação.** O LojaClient inicializava a identidade com
`readStoredIdentity(slug)` dentro do `useState` — o servidor renderiza sem
identidade, o cliente com, e o React descarta a árvore inteira ("Text content
does not match"). Com o avatar de iniciais no topo o mismatch ficou VISÍVEL
(overlay "1 error" no dev). Correção: estado inicial só com props do servidor;
o storage entra num `useEffect` de mount. Vale para qualquer componente novo
que renderize identidade de sessão.

**Achado 3 — o lookup de cliente por telefone tem pegadinha de formato no seed
local.** O banco tinha `+5511988887777` (com "+") e o seed da carteira criou
`5511988887777` — `resolvePedidoIdentity` usa `phoneCandidates` +
`CUSTOMER_LOOKUP_ORDER` e resolveu o cadastro RICO antigo, deixando a carteira
recém-semeada invisível. Em teste local, semear dados de cliente exige conferir
QUAL cadastro o lookup resolve, não assumir que o upsert criou o que será lido.

**Provas colhidas:** QR pixel-idêntico (diff bbox 375/768/1280, "IDENTICAL"),
E2E de cupom no banco, screenshots 375/768/1280 do topo + drawer (com dados /
vazio / travado) + sacola (vazia / com item) + revisão com desconto, `tsc`
limpo, vitest 4746 verdes (380 arquivos, incluindo a suíte nova do finalize).

**Propostas de vitrine** (promoção é do Diretor):
1. "Identidade de sessão renderizada no SSR: sessionStorage nunca entra no
   useState inicial — entra em efeito de mount" (Achado 2, custou um hydration
   mismatch visível no topo).
2. "Antes de desenhar tela de dados do cliente, procurar a rota gated que já
   existe: a carteira (cupons/endereços/aplicação no finalize) já estava
   pronta no backend — e o estado 'sem prova' é uma nota honesta, não um vazio"
   (Achado 1).

— interface, topo de app da Loja (branch `claude/foocci-director-onboarding-lhindy`,
sem commit — Diretor revisa)

---

## 2026-08-04 (fim de tarde) — Faixa social da Loja: saudação "Olá, {nome}" no espaço vazio

**Ajuste pedido pelo CEO** (print da Sushi Cazza em produção): o espaço à direita
dos ícones sociais, vazio quando o restaurante não tem `googleReviewUrl`, agora
mostra a identidade — cliente identificado vê o chip "Olá, {primeiro nome}" na
tinta da marca (mesma linguagem da faixa de identidade do cardápio da mesa);
tocar abre o drawer Minha conta. **Escolha para o não identificado:** convite
discreto "Identificar-se" (cinza, linguagem dos ícones) que abre o WelcomeModal —
padrão marketplace (o iFood mantém "Entrar" no topo quando deslogado), e dá
segunda chance a quem pulou o modal de entrada sem reexibi-lo à força.

**Escopo:** só `LojaClient.tsx` — a faixa é composição própria da Loja; nenhum
arquivo de `src/components/menu/` foi tocado, então o `/qr` não muda por
construção (zero diff fora do LojaClient).

**Aprendizado — chip com rótulo FIXO não pode depender de truncate; a conta se
fecha medindo o DOM, não de cabeça.** A 375px com o pill "Avaliar" presente,
"Identificar-se" truncava ("Identificar…"). Medição via Playwright
(`span.scrollWidth` 78 × `clientWidth` 73): faltavam 5px. Primeira correção
(px-3.5→px-3) ganhou só **4px** — 0.5 de padding Tailwind são 2px POR LADO, não
4 — e ficou 1px curto; `gap-3`→`gap-2.5` no grupo fechou a conta (+4px). Rótulo
fixo cabe inteiro; só o NOME trunca com ellipsis (combinado da direção).
Reforça a entrada da vitrine "screenshot como instrumento de decisão": aqui o
instrumento foi `scrollWidth` do span, em pixels, antes de escolher o ajuste.

**Provas:** screenshots 375/768/1280 × 3 estados (identificado sem Avaliar — o
caso do print; identificado com Avaliar; não identificado), zero overflow
horizontal (`scrollWidth == clientWidth` nos 9), toque no chip abre o drawer e
o convite abre o WelcomeModal (screenshots), `tsc` limpo, vitest dirigido do
domínio pedido 104 arquivos / 1878 verdes. Autoavaliação: hierarquia 9,
tipografia 9, espaçamento 8, consistência 9.

— interface, ajuste da faixa social da Loja (branch
`claude/foocci-director-onboarding-lhindy`, sem commit — Diretor revisa)

---

## 04/08 — A aba de degustação, o risco jurídico de /precos e o destino de /como-funciona

**Contexto:** site aberto com campanha paga rodando. Três frentes numa passagem,
branch `claude/foocci-brain-vaamrx`.

### 1. `/site/experimente` — a degustação (nova)

Página nova + `loading.tsx` + `src/lib/site/demoTasting.ts` (leitura do estado da
vitrine) + teste da parte pura. Entrou no menu entre "Soluções" e "Planos e
preços", no rodapé e no sitemap.

**Decisão: ABA NOVA, não iframe.** Quatro motivos, na ordem em que pesam:
(1) a loja é `fixed inset-0` e os dois modos rendem componentes DIFERENTES —
catálogo com barra fixa × conversa que cresce sem fim —, então não existe uma
altura de iframe certa para os dois; (2) a 375px a loja já é a tela inteira,
e um app de tela cheia dentro de uma faixa de 335px demonstra o produto na pior
versão dele; (3) a loja guarda carrinho e carteira em local/sessionStorage e abre
links de WhatsApp — em iframe de outra origem o navegador particiona esse
armazenamento e a degustação quebra em silêncio; (4) moldura em página de vendas
lê-se como vídeo, aba nova lê-se como "está rodando". O custo (perder o visitante
para outra aba) é pago com `rel="noopener"` e com esta página viva atrás, com os
botões de contratar.

**Aprendizado — "link para o produto" numa página de campanha exige portão de
existência, não confiança no slug.** A primeira versão escrevia os três endereços
da vitrine e acendia os botões sempre. Com o restaurante fora do ar (`isDemo`
ausente ou zero item), os três CTAs viravam 404 pago. O screenshot do estado
`empty` foi o que denunciou: o aviso "está sendo preparada" aparecia no cartão
lateral E os três botões continuavam clicáveis logo abaixo — o texto dizia uma
coisa e a interface oferecia outra. Agora `getTastingState()` confere tenant +
`isDemo` + contagem de itens, e o CTA vira um `CtaEmPreparo` de mesma silhueta.
**Aviso em texto não é portão; o portão é o botão não existir.**

**Aprendizado — o estado `error` não pode apagar os botões.** Consulta que falha
não é prova de que a loja caiu (guardrail 1). Só o VAZIO comprovado apaga; no
erro os links continuam (são endereços públicos estáveis) com a nota honesta
"não conseguimos conferir agora" + "Tentar de novo".

**Horário da padaria, resolvido do lado da página.** A vitrine abre 6h e fecha
20h/21h (13h no domingo) — quem visita às 22h bate numa loja com envio pausado.
Sem tocar no dado do restaurante: o estado real é lido do banco com as MESMAS
funções de `@/lib/business-hours` que a loja usa (o aviso nunca diverge do que a
loja mostra), a página mostra a semana agrupada ("Segunda a quinta · 06:00–20:00")
e, quando fechada, empurra para o cardápio de mesa (QR), que **não consulta
horário** e funciona 24h. Recomendação de abrir a vitrine 24h subiu ao Diretor.

**Fotos.** `photoCount` é lido; enquanto for 0 a página declara "as fotos estão em
produção" e vende o que está em teste (o atendimento). Com fotos, a linha some
sozinha — nada a reescrever.

**Aprendizado — breakpoint de comparação é `md`, não `lg`.** Os dois cartões
"sem IA × com IA" nasceram `lg:grid-cols-2`: a 768px empilhavam, e comparação
empilhada deixa de ser comparação. `md:grid-cols-2` põe os dois lado a lado já no
tablet. Na tabela de contraste, a virada certa foi outra: 2 colunas com rótulo
ACIMA no celular (comparar exige lado a lado, mesmo a 375px) e 3 colunas de
tabela de verdade a partir de `sm`, com a coluna do Garçom tingida por uma faixa
`absolute` decorativa — tingir célula a célula com `divide` produz emenda.

### 2. `/site/precos` — risco jurídico

A página afirmava três vezes a comissão do concorrente como fato ("R$ 20 mil no
iFood paga R$ 3.040" = 15,2%), sem fonte. Adotado o padrão da calculadora da home:
`ASSUMED_RATE_PERCENT = 23` em `commissionRates.ts` (fonte única, agora lida
também pela calculadora, que antes tinha o "23" próprio), e o bloco "Faz a conta"
passou de string escrita a **conta calculada** da premissa + do preço real do
plano. Nenhum número comparativo é mais digitado. Nota de origem junto dos
cartões (não escondida no rodapé) e link "Fazer a conta com os meus números" →
`/site#calculadora`. As faixas de "Substitui" viraram estimativa de mercado
declarada. O nome do marketplace sobreviveu só onde ele é **canal de venda do
lojista** (preço por canal) — uso descritivo, não comparativo.

**Aprendizado — premissa duplicada é premissa divergente.** O "23" existia solto
na calculadora; se a página de planos ganhasse o seu, o mesmo site teria duas
suposições diferentes para a mesma coisa. Número comparativo mora em constante.

### 3. `/site/como-funciona` — enxugada, não aposentada

Ela carregava `WaiterRealShowcase` e `CrmRealShowcase`, que viraram o coração de
`/site/atendimento-com-ia` e `/site/crm`. Os dois saíram; ficou o que é só dela
(jornada, bastidor, ciclo — o argumento de INTEGRAÇÃO) e entrou um índice de três
cartões para as páginas dedicadas + a degustação. Aposentar por redirect foi
recusado: URL indexada com conteúdo próprio, linkada no rodapé, no `StickyMobileCta`
e em dois pontos de `/site/sobre` — trocar isso por um 308 com campanha rodando é
perder posição de busca e um passo do funil. Drift corrigido de passagem:
`bg-gray-50`→`canvas`, `text-gray-500`→`muted`, `#0B0B0B` literal→`ink`. O import
morto de `COMO_FUNCIONA_URL` em `/precos` saiu.

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` 395 arquivos / **4948 verdes**.
Screenshots 375/768/1280 das três páginas + os estados **fechado**, **vazio** e
**carregando** da degustação. Zero rolagem horizontal nos nove
(`scrollWidth == viewport` exato), zero imagem sem `alt`, zero interativo sem nome
acessível. Alturas no celular: experimente **5.079px (~6,3 telas)**, como-funciona
7.024px, precos 11.993px (esta última já era longa — fica registrada como dívida,
não foi escopo).

**Nota de bancada:** um `git stash -u` para medir a linha de base pegou junto o
trabalho EM ANDAMENTO de outra frente no mesmo working tree (`src/components/help/**`,
`src/services/**`). O `pop` restaurou tudo, mas foi sorte. **Com duas frentes na
mesma árvore, não se usa stash** — a linha de base se mede pelo `git show HEAD:arquivo`
ou num worktree separado.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, bloco da degustação + trava jurídica de /precos + enxugada de
/como-funciona (branch `claude/foocci-brain-vaamrx`)

---

## 04/08 — O assistente sai do balãozinho e vira barra no topo do painel

Pedido direto do CEO, referência de interface aprovada: HostGator "Gator 2.0".
O cérebro já estava pronto e no ar (Brain + manual + snapshot + runbook +
chamado numerado); faltava a cara. `HelpWidget.tsx` (795 linhas, balão de canto)
foi **apagado** e substituído por seis peças pequenas em `src/components/help/`:
`AssistantBar` (a barra + orquestração), `AssistantPanel` (sugestões),
`AssistantChat` (a conversa), `AssistantNotifications` (avisos),
`assistantCatalog.ts` (dados), `useHelpThread` / `useVoiceInput` (estado) e
`icons.tsx`.

### 1. A barra no topo é elemento de SHELL — e shell mexe com quem mede em `vh`

A barra entra em `(dashboard)/layout.tsx` **acima do `<main>`**, não dentro de
página nenhuma: é o único lugar em que ela existe uma vez e vale para as 20 telas.
Só que cinco telas do painel têm altura fixa calculada na mão —
`calc(100vh - 56px)` (Pedidos, Central de Conversas, Chat, chat-sim, test-ai),
onde 56 é a `TopBar` que cada página desenha. Somar 52px de barra sem tocar nelas
empurraria cinco telas para fora da janela.

**A regra que ficou:** altura de shell não é número repetido, é token.
`--assistant-bar: 3.25rem` nasceu em `globals.css` e as cinco telas passaram a
descontar `calc(100vh - 56px - var(--assistant-bar, 0px))`. O `, 0px` importa: se
a barra sumir amanhã, as telas voltam sozinhas ao que eram. Medido depois:
`document.scrollHeight == innerHeight` nas duas telas críticas, a 375 e a 1280.

### 2. No celular, a barra do topo não pode ser onde se digita

O primeiro desenho abria um painel suspenso e deixava o foco no campo da barra.
No celular isso põe o teclado por cima da lista de sugestões e o dedo a 700px do
que ele quer tocar. O que ficou: `onPointerDown` **detecta o telefone dentro do
handler** (`matchMedia`, nunca no render — hidratação), dá `preventDefault()` para
o teclado não subir, e abre uma **folha de tela cheia com composer no rodapé**.
Mesma árvore de componentes, comportamento diferente por interação, zero
`useState` de breakpoint e zero mismatch de hidratação.

### 3. As três abas viraram três modos — e ganharam duas portas cada

Ajuda / Ajuda técnica / Avisos não podiam sumir. Viraram um seletor segmentado
dentro da conversa (Assistente · Diagnóstico · Avisos), e cada um ganhou um
segundo caminho: o **sino** da barra abre direto em Avisos; a ação rápida
"🛠️ Algo não funciona" e um link no estado vazio abrem direto o Diagnóstico. O
`HELP_OPEN_EVENT` antigo continua funcionando (mapeia `tecnica`→diagnóstico).

### 4. Microfone: o botão só existe quando ele grava — e o header proibia gravar

`next.config.js` mandava `Permissions-Policy: microphone=()`. Isso desliga
`getUserMedia` no app inteiro: o microfone que a Ajuda técnica JÁ tinha estava
morto em produção havia meses, falhando com "não consegui acessar o microfone".
Virou `microphone=(self)` (câmera e geolocalização continuam desligadas). Além
disso, `supported` é resolvido **depois do mount** e o botão só é desenhado quando
o navegador tem `MediaRecorder` + `mediaDevices`. Rota nova mínima
(`/api/help/transcribe`) reusando o `TranscriptionAdapter` que já existia; sem
chave, ela devolve 422 com recado em português em vez de engolir o áudio.

### 5. GET velho não pode passar por cima de POST novo

`useHelpThread` carrega o histórico e envia mensagem. Se o lojista perguntasse
enquanto o GET inicial ainda estava no ar, a resposta atrasada do GET repunha a
lista **sem** o que ele acabou de mandar. Um contador de mutações (`mutationsRef`)
incrementado por enviar/escalar/recomeçar e comparado ao voltar do `fetch`
resolve: resposta que começou antes de uma escrita é descartada.

### 6. Detalhes que os screenshots decidiram (e a conta de cabeça errou)

- "Como posso te ajudar, **Proprietário**?" no placeholder era cortado a 375px.
  O nome foi para a **saudação da conversa** — que é onde o CEO pediu.
- Grade de ações rápidas em 3 colunas quebrava rótulo em duas linhas a 576px de
  painel. Virou 2 colunas com rótulos curtos.
- A janela encaixada começava em `inset-y-4` e cobria o terceiro atalho da própria
  barra. Passou a começar em `calc(var(--assistant-bar) + 0.75rem)`.
- Trilha de primeiros passos **fechada** por padrão: aberta, o painel terminava
  cortado no meio de uma linha a 70vh.

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` **396 arquivos / 4955 testes verdes**
(inclui `assistantCatalog.test.ts`, novo: trava a ordem "primeiro prefixo que casa
vence" — mover `/menu` acima de `/menu-enhancement` passaria a oferecer as dúvidas
erradas em silêncio). Screenshots 375/768/1280 de: barra fechada, sugestões,
conversa encaixada, conversa expandida, estado vazio com saudação, diagnóstico,
avisos e **erro de carregamento** (rota abortada de propósito). `scrollWidth ==
viewport` exato nos três tamanhos. Verificado também com o menu mobile aberto: o
menu fica por cima (correto) e abrir o assistente fecha o menu.

**Nota de bancada:** o working tree tinha outras duas frentes rodando ao mesmo
tempo. Dois `next dev` no mesmo `.next` corrompem o roteamento (tudo vira 404) —
a saída foi `NEXT_DIST_DIR` (suporte novo e opcional em `next.config.js`) + porta
própria + `NEXTAUTH_URL` por variável de ambiente do processo, sem tocar no `.env`
compartilhado.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, bloco do Agente de Suporte (Frente 2, cara do assistente),
branch `claude/foocci-brain-vaamrx`

---

## 2026-08-04 — QR nas TRÊS experiências de `/site/experimente`, só no desktop

**Pedido do CEO:** as três experiências da degustação (mesa/QR, loja sem IA, loja
com o Garçom) precisam de QR para o visitante experimentar no celular — mas **só
quando ele está no computador**; no celular, o botão direto.

**O que foi feito:** um `QrPanel` local à página, com duas formas (`side` para o
cartão largo de mesa, `footer` para os dois cartões do comparativo), servido em
`hidden lg:…`. Os três QR carregam a **URL absoluta de produção** vinda de
`@/lib/public-url` (`getPublicQrUrl` / `getPublicMenuUrl` + a MESMA const
`LOJA_QUERY` que monta o href do botão). Rótulo por cartão dizendo o que aquele
código abre + "aponte a câmera do celular". O botão continua em toda largura: o QR
é caminho a mais, nunca substituto.

**Aprendizado 1 — "só no desktop" numa página cacheável é decisão de CSS, e a
alternativa não é opinião, é bug.** As duas saídas "óbvias" quebram: user-agent no
servidor produz HTML por aparelho e o primeiro cache compartilhado entrega a versão
errada; `window`/`matchMedia` no render diverge na hidratação (o servidor não tem
janela). `hidden lg:block` decide na hora de pintar, no aparelho certo, sempre — e
é a única das três que sobrevive a `output: static` e a CDN.

**Aprendizado 2 — o QR herda a condição do BOTÃO, não do "deu tudo certo".** A
página distingue `ok` / `empty` / `error`. A tentação era gerar o QR só no `ok`;
o certo é `live` (`status !== "empty"`), exatamente o que acende o botão. Motivo:
QR e botão levam ao MESMO endereço — se um leva a 404 e o outro não, a página está
mentindo em um dos dois. E o QR erra pior: o 404 aparece no celular do visitante,
longe desta tela, sem ninguém para socorrer. Provado invertendo `isDemo` da
vitrine no banco local: zero QR, zero link de loja, três "Em preparação".

**Aprendizado 3 — a prova de que o QR carrega a URL certa é mecânica, não visual.**
Screenshot não lê QR. O que provou foi gerar o SVG esperado para cada URL de
produção com a mesma lib e procurar o traçado (`d="…"`) no HTML servido — com um
**controle negativo** (`http://localhost:3300/qr/foocci-bakery`) que precisa estar
**ausente**. Sem o controle negativo, o teste só diz "tem um QR", não "não vazou o
endereço local". Os três presentes, o vazamento ausente.

**Aprendizado 4 — a mesma prop de layout do `QRCard`, de novo.** O cartão de mesa
tem 1024px de largura útil e comporta o QR na coluna lateral; os cartões 2 e 3
vivem num grid de 2 colunas e sobram ~414px de conteúdo — ali o QR só cabe numa
faixa no rodapé. Quem conhece a largura real é o **uso**, não o componente (mesma
lição já promovida à vitrine em 03/08).

**Detalhes que o screenshot decidiu:** o rótulo lateral quebrava com "celular"
órfão (`text-balance` resolveu) e o recado do rodapé terminava com "telefone."
sozinho (`text-pretty`). A frase de apoio antiga do cartão 1 ("aponte a câmera
para o código") aparecia **no celular**, onde não há código — foi reescrita e o
recado passou a viver dentro do painel de QR, que é `lg`-only.

**Drift corrigido de passagem:** o esqueleto de `loading.tsx` prometia `lg:grid-cols-2`
onde a página real usa `md:grid-cols-2` (pulo de layout no tablet) e não tinha
lugar para os QR; agora espelha os dois.

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` **396 arquivos / 4958 testes verdes**
(3 novos em `src/lib/public-url.test.ts`, prendendo `/qr/<slug>` e `/pedido/<slug>`
absolutos e sem `localhost`/`.railway.app` — se alguém mudar o caminho público, o
botão e a câmera passariam a abrir telas diferentes em silêncio).
Screenshots 375 / 768 / 1280 com `scrollWidth == viewport` exato nos três:
a **375 e 768 nenhum rótulo de QR está visível** e os três botões estão lá;
a **1280 os três QR aparecem**. Estado VAZIO capturado com `isDemo=false` no banco
local (restaurado depois).

**Nota de bancada:** o worktree não tem `node_modules` próprio — ele foi apontado
para o do repositório principal. O `tsc` acusou um erro em `BrandConfigService`
que **não é do código desta branch**: outro worktree tinha gerado o Prisma Client
a partir de um schema mais novo dentro do `node_modules` compartilhado. `npx prisma
generate` no worktree devolveu o cliente ao schema desta branch e o `tsc` ficou
limpo. Client compartilhado entre worktrees é armadilha de verificação: o erro
aparece no código de quem não mexeu nele.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, bloco "QR nas três experiências da degustação",
branch `claude/foocci-brain-vaamrx` (worktree isolado)

---

## 2026-08-05 · A barra dupla morre: a pílula entra DENTRO do cabeçalho

**Reprovado pelo CEO.** A entrega anterior deu ao assistente uma **faixa própria**
(`--assistant-bar`, 52px) logo acima do conteúdo. Como quase toda tela do painel já
renderiza o `TopBar` (56px), o lojista via **duas réguas horizontais empilhadas**.
Palavra dele: *"eu não gostei de duas barras… é uma barra só com tudo que está junto
ali, fazer bem minimalista e discreto."*

### O que mudou

- **`AssistantBar.tsx` morreu.** Nasceram dois arquivos com responsabilidades
  separadas:
  - `AssistantProvider.tsx` — o **estado** (conversa, rascunho, trilha, avisos,
    voz) + a conversa em tela cheia. Vive no `layout.tsx` do painel.
  - `AssistantPill.tsx` — o **desenho**: a pílula e o painel ancorado. Vive dentro
    do `TopBar`.
- **Por que separar:** o `TopBar` é renderizado por *página*, então ele é
  **remontado a cada rota**. Se o estado morasse nele, minimizar a conversa e
  navegar (que é exatamente o que `onNavigate` faz) apagaria a conversa. O estado
  sobe para o layout; só a âncora remonta.
- **A pílula:** ícone + "Como posso te ajudar?" + microfone + **um** atalho
  ("Suporte"). A fileira de três chips ao lado dela — a verdadeira culpada pela
  sensação de segunda barra — foi embora; `BAR_QUICK_ACTION_IDS` virou
  `PILL_SHORTCUT_ID`/`_LABEL`, com teste travando "um atalho, rótulo de uma palavra".
- **As ações rápidas migraram para dentro do painel**, junto com a caixa de
  escrever **no topo** (o CEO: *"quando ele clica ali na tela de escrever, abre a
  tela pra baixo"*). O painel abre a 8px abaixo da régua, centrado na pílula.
- **`--assistant-bar` → `--topbar: 3.5rem`.** As cinco telas de altura fixa passaram
  de `calc(100vh - 56px - var(--assistant-bar,0px))` para `calc(100vh - var(--topbar))`.
  O `56px` cravado na mão em cinco arquivos era o mesmo drift que o token anterior
  tinha vindo consertar.
- **Telas sem `TopBar` ganharam um** (`/agente-ia`, `/marca`, `/menu-enhancement`,
  `/test-ai`, `/chat-sim`). Sem isso elas ficariam **sem assistente nenhum** — e
  `/test-ai` e `/chat-sim` já descontavam 56px de um cabeçalho que não existia
  (sobra silenciosa em produção).

### Três armadilhas que só o screenshot pegou

1. **`scrollWidth` não enxerga transbordo para a ESQUERDA.** O cluster de conta
   (`justify-end` com filhos `shrink-0`) media 442px de caixa e 442 de `scrollWidth`
   — e mesmo assim o botão "Pausar pedidos" aparecia **por baixo da pílula**. O
   conteúdo real era ~513px e vazava para a esquerda; `scrollWidth` só conta
   transbordo no fim. **A prova é o `getBoundingClientRect` do filho, não o
   `scrollWidth` do pai.**
2. **Centralizar com `flex-1 / shrink-0 / flex-1` só funciona se cada lado couber na
   metade livre.** A conta é: `centro exato ⇔ conteúdo do lado mais gordo ≤
   (largura − pílula − gaps) / 2`. Com nome do restaurante + nome do usuário + cargo
   + "Pausar pedidos" + "Sair" por extenso, o lado direito só cabia acima de ~1620px
   de viewport. Enxugar (nome do usuário e rótulos longos a partir de `2xl`, com
   `title` no avatar) foi o que devolveu o centro — e é mais Linear/Stripe do que a
   versão anterior.
3. **`@layer base` com `@apply` vence utilitário por ESPECIFICIDADE, não por camada.**
   `globals.css` estiliza `input:not([type=…]):…:focus { @apply focus:ring-2
   focus:ring-orange-200 }` — um seletor com ~8 `:not()`. Nenhum `focus:ring-0` de
   classe ganha dele. Resultado: **todo campo com moldura `focus-within` ganha um
   anel laranja duplo**, e isso estava em produção nas caixas de escrever do
   assistente. A saída pontual foi `focus:!ring-0`. A saída definitiva é baixar a
   especificidade do seletor global — fica anotado, é conserto de projeto.

### Fora do pedido, mas do mesmo pano

- **`TopBar` virou `sticky top-0 z-30`.** A faixa antiga vivia FORA do `main` e
  nunca sumia; agora que o assistente mora no cabeçalho, sem `sticky` ele rolaria
  para fora da tela em toda página comprida. Conferido a 375 e 1280 com `scrollTop`
  de ~680px.
- **Avisos ganharam carregando e erro.** A superfície dizia *"Tudo em ordem por
  aqui"* tanto para lista vazia quanto para busca que falhou — ausência de
  informação virando informação (guardrail 1). Agora: esqueleto enquanto busca;
  *"Não consegui buscar os avisos… quer dizer que eu ainda não sei"* + "Tentar de
  novo" quando falha. Polling que falha **não** derruba uma lista boa para erro.
- **O ponto de não lido saiu do meio da pílula e foi para cima do ícone.** Solto
  entre o texto e o microfone parecia sujeira na tela — badge só se lê grudado.
- **Emoji `⏸` sem rótulo virava um risquinho cinza de 4px.** Controle de emergência
  não pode parecer poeira: virou SVG de 15px.
- Hierarquia invertida no cabeçalho: o título da página era `text-muted` (o mais
  fraco) e o nome do restaurante `font-bold text-ink` (o mais forte). Inverteu-se.
- Drift do `DESIGN.md` corrigido no arquivo tocado: `bg-white`→`bg-paper`,
  `bg-[#E5E5E5]`→`bg-line2`, `text-gray-300`→token, `font-medium/bold`→`semibold`,
  `hover:orange-*`→`amber` no botão de pausa.

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` **396 arquivos / 4956 testes verdes**.
Screenshots 375/768/1280 de: barra fechada (com recorte ampliado do cabeçalho),
painel aberto ancorado, conversa, pílula com aviso não lido, painel com a chamada
de avisos, pílula minimizada ("Retomar conversa"), avisos carregando/vazio/erro e
cabeçalho grudado depois de rolar 680px.

Medido no navegador, `/orders`: **um único `<header>` de 56px** nos três tamanhos;
`scrollWidth == viewport` exato; painel a `top: 64` (8px abaixo da régua) a 768 e
1280 e tela cheia a 375. Varredura em `/atendimento`, `/marca`, `/agente-ia`,
`/menu`, `/settings`, `/dashboard`: **um header cada, pílula presente em todos**, e
o contêiner de altura fixa do `/atendimento` terminando exatamente em 850 de 850 —
sem buraco nem sobra.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, refação da barra do assistente (reprovada pelo CEO em 04/08),
worktree `agent-ab1c4bec24dce0fe6` a partir de `claude/foocci-brain-vaamrx`

---

## 2026-08-05 — O formulário passa a ter dois destinos: salvar o lead e mandar o "oi"

Ideia do CEO. Quem aborda estranho no WhatsApp queima número e, no oficial, precisa
de modelo aprovado pela Meta. **Se quem manda o "oi" é o cliente**, abre a janela de
24h de texto livre e o consentimento fica evidente. O formulário de
`/site/demonstracao` continua salvando o lead — isso é inegociável — e, depois,
entrega a pessoa no WhatsApp com a mensagem já escrita.

### A trava de ordem não está no cliente, está no que a rota devolve

Escrever "salva primeiro, redireciona depois" no componente seria prompt, não trava.
O que impede o pulo é que a mensagem carrega um `#código` **que só existe na resposta
do servidor**: `POST /api/site/leads` devolve `{ ok, codigo }` e o `codigo` nasce
dentro do `create`. Sem gravação não há código; sem código não há tela de WhatsApp.
O teste da rota prova os dois lados — 200 com código depois de gravar, 500 sem
código nenhum quando a gravação falha.

### Não redirecionamos sozinhos, e isso foi decisão, não preguiça

Abrir o WhatsApp depois de um `fetch` exige `window.open` fora do gesto do usuário
(bloqueado por padrão no celular) ou uma navegação de topo que leva a pessoa embora
da página — e junto vai o plano B, que existe justamente para quando o WhatsApp
**não** abre. Ficou um botão grande, explícito, com a mensagem à vista antes de
enviar. Funciona em todo navegador e respeita quem vai assinar aquele texto.

### Duas armadilhas de gênero na frase que a pessoa assina

1. `Sou o João` exigiria saber o gênero de quem preencheu — erra com Andrea, Darci
   e nome estrangeiro. Virou `Sou João`.
2. `do Pizzaria Nonna` estava errado no primeiro screenshot. O nome do
   estabelecimento também tem gênero imprevisível (`a Pizzaria`, `o Bar do Zé`).
   Solução: `do restaurante Pizzaria Nonna` — a preposição concorda com
   "restaurante", que é sempre masculino. Foi **o screenshot que pegou**, não a
   leitura do código.

### O código curto é lido por gente, e isso muda o alfabeto

Nem `generateWaMenuCode` (7 chars misturando caixa) nem `generateUniqueShortCode`
(preso ao `trackingLink`) serviam: os dois nasceram para caber em URL, onde ninguém
lê o código. Aqui são 5 MAIÚSCULAS sem `O 0 I 1 L S 5`, com amostragem por rejeição
(módulo cru sobre um byte faria as 8 primeiras letras saírem ~14% mais).
`extractLeadCode` **exige o `#`**: sem ele, `TARDE` casa com o alfabeto e o
atendimento gruda no lead errado — pior que não achar.

O teste "2.000 códigos, zero colisão" **piscou de primeira** (29⁵ ≈ 20,5 milhões dá
~9% de chance de uma colisão nesse volume). Virou `> 1995` com o motivo escrito: a
garantia de verdade é o UNIQUE do banco + o retry, não a sorte. Cravar um número que
falha 9% das vezes ensina o time a ignorar teste vermelho.

### O que aconteceu com os outros CTAs — nada, e por escolha

Todo CTA comercial do site já leva ao formulário (decisão do CEO de 04/08). Como o
formulário agora termina no WhatsApp, **todos herdaram o caminho novo sem tocar em
nenhum**. Pendurar `wa.me` direto num CTA produziria um "oi" sem lead e sem código —
exatamente o problema que este bloco resolve. O `WhatsAppCta` continua reservado e
não importado.

### Dois defeitos achados de raspão, corrigidos porque a tela foi tocada

- **A barra fixa do celular competia com o formulário.** Dois botões laranja de
  largura cheia na mesma dobra, e o da barra levava a pessoa PARA LONGE da conversão
  que ela já tinha começado. Agora a `StickyMobileCta` se cala quando
  `[data-demo-form]` está na dobra — marca posta pelo próprio formulário, então vale
  para qualquer página que o carregue, sem a barra conhecer rota nenhuma.
- **O título de `/admin/leads` era invisível.** `text-gray-900` sobre o shell
  `bg-gray-950`: preto sobre quase-preto desde que a página nasceu. Só se enxergou
  no screenshot. Virou `text-paper`.

### Drift do DESIGN.md corrigido nos arquivos tocados

`gray-*` → `ink/ink2/muted/line/line2`; `bg-white` → `bg-paper`; `#0B0B0B` →
`text-ink`; `font-medium` → `font-semibold`; input `rounded-lg` → `rounded-xl`;
`text-orange-600` → `text-brand-600`.

**Não** mexi no `rounded-full` dos botões do site comercial: é a linguagem de CTA de
todas as páginas, e trocar só neste formulário criaria uma inconsistência nova
dentro do mesmo cartão. Fica anotado como decisão, não esquecimento.

**A cor do botão do WhatsApp é laranja, não verde.** Verde é cor de status no
`DESIGN.md`; usá-la como cor de ação abriria drift novo. O reconhecimento fica por
conta do glifo do WhatsApp em branco sobre o `brand-500`.

### Provas

`npx tsc --noEmit` limpo. Testes novos: `leadCode.test.ts` (9), `config.test.ts`
(13), rota `/api/site/leads` (5) e 5 casos novos no `SiteLeadService` — incluindo
"colidiu 4 vezes: grava o lead SEM código" e "erro que não é colisão sobe na hora"
(insistir num banco caído atrasa o erro e arrisca duplicata).

Screenshots 375/768/1280 do formulário e da tela pós-envio nos **dois cenários**
(sem número — o de hoje — e com número simulado via
`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`), mais carregando e erro a 375, mais
`/admin/leads` nos três tamanhos com a coluna Código.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 8, consistência 9.

— interface, worktree `agent-a6275215662ae39c4` a partir de `claude/foocci-brain-vaamrx`

---

## 2026-08-05 · Toda página de `/site` passou a abrir com imagem própria

**O pedido, do CEO:** *"o site está só com texto, botão e detalhes gráficos. A
gente só tem uma imagem do Foocci, na primeira página."* Ele estava certo: seis
das oito páginas abriam com `PageHero`, que é texto centralizado sobre uma cena
de restaurante a 30% de opacidade sob um véu branco — ou seja, **nenhuma imagem
própria**. Só `/como-funciona` e `/demonstracao` tinham visual, e ainda assim um
mockup desenhado em CSS, não uma imagem.

### A decisão: um cartão, três conteúdos

Oito aberturas diferentes seriam oito soluções, não um sistema. O novo
`components/marketing/HeroShot.tsx` define **um** cartão — mesmo raio, mesmo
anel, mesma sombra quente e o mesmo halo âmbar que a home já usa atrás da cena do
mascote — e três conteúdos que vivem dentro dele:

| peça | o que é | onde |
|---|---|---|
| `phone` | captura real de celular, dentro do aparelho, com a base cortada pela borda do cartão | atendimento-com-ia, experimente, como-funciona, demonstração |
| `browser` | captura real do painel, numa janela de navegador (aqui a janela **é** o cartão — moldura dentro de moldura é ruído) | crm, soluções, preços, demonstração |
| `photo` | fotografia da cena, cheia ou em medalhão | sobre, e o degrau de baixo de crm/soluções/preços |

A prova de que virou sistema é numérica: no desktop **os oito heros medem
exatamente 609px de altura**. Não foi ajustado à mão — caiu igual porque a peça é
a mesma.

### `pickShot`: a cadeia de degradação é o produto, não o remendo

As capturas do produto (`PRODUCT_SHOTS`) estavam sendo geradas por outra frente e
**não existiam** na minha árvore. Em vez de esperar, cada página declara uma
**cadeia de candidatos**, do melhor para o mais garantido, e `heroShot()` entrega
o primeiro arquivo que existir. Duas regras que valem para a próxima vez:

1. **O último candidato da cadeia é sempre um arquivo versionado.** Assim a
   ausência de asset nunca vira buraco de layout. As cinco capturas do Garçom
   (`public/site/waiter/passo-*.png`) e as cinco fotos de `SITE_ASSETS.journey`
   deram degrau para todas as oito páginas — nenhuma depende da outra frente.
2. **`heroShot` é FUNÇÃO, não componente.** Quem chama precisa saber se sobrou
   algo para desenhar, porque `PageHero` troca de layout (duas colunas ×
   centralizado) conforme exista visual. Um componente que retorna `null`
   deixaria uma coluna vazia no grid — exatamente o buraco que o arquivo existe
   para evitar.

### Dois heros viraram um (drift #8 pago, não ampliado)

`PageHero` e `InternalVisualHero` faziam quase a mesma coisa, com a cena de fundo
copiada nos dois arquivos. Quando o pedido chegou, havia **dois lugares para
consertar e duas chances de ficarem diferentes**. `PageHero` ganhou `visual?` e
`InternalVisualHero` foi apagado. Nenhuma página perdeu comportamento.

### O que os screenshots decidiram (de novo: eles são instrumento, não conferência)

- **Ordem no celular.** Com a imagem depois dos botões ela começava a ~630px em
  375px — fora da primeira tela de um iPhone SE. Movida para entre o subtítulo e
  os botões, entra a ~470px. E os botões passaram a vir DEPOIS da prova, que é a
  ordem que converte. Feito com `row-start`/`col-start` explícitos e **sem
  duplicar os CTAs em dois blocos com `hidden`**: dois links de mesmo nome
  acessível é ruído para leitor de tela e mentira para quem mede clique.
- **Captura de celular em retrato não cabe num hero de celular.** Um telefone
  inteiro tem ~450px de altura a 375px de largura. A saída foi o cartão 4:3 com
  `overflow-hidden`: o aparelho entra por cima e a base é cortada pela borda. O
  corte lê como intenção, e a altura fica sob controle.
- **Foto quadrada em cartão 4:3 corta cabeça.** As fotos do repositório são
  quadradas; `object-cover` centralizado decapitava quem está sentado à mesa. Daí
  a prop `focus` (um `object-position`): quem **escolhe** a foto é quem conhece o
  enquadramento, não o componente.
- **`journey-4` e `journey-5` são recortes REDONDOS com cantos brancos.** Em
  retângulo aparecia o branco. Viraram medalhão sobre o fundo quente — mesmo
  cartão, conteúdo diferente. Quem for reusar essas duas: nunca em `object-cover`
  retangular.
- **Título de 2.9rem numa coluna de 560px vira parede.** O h1 de `/sobre` (16
  palavras) virava cinco linhas coladas. `2.7rem` + `leading-[1.13]` resolveu sem
  tocar na copy — que não é minha.

### Um defeito real encontrado de raspão

`/site/sobre` tinha **22px de rolagem horizontal a 768px**. A causa não estava no
hero: `RelationshipRevenuePanel` virava linha no `sm:`, e quatro cartões de 168px
+ setas + respiro somam ~832px num contêiner de 728. Virou `lg:`. Vale a regra:
*a linha horizontal é o luxo de quem tem largura; empilhado é a forma segura.*
E a nota da vitrine se confirmou de novo — o sinal que vale é
`document.documentElement.scrollWidth`, e um detector de elemento isolado não
achava nada, porque o estouro nascia do somatório de irmãos, não de uma peça.

### Peso da página

O véu de restaurante do hero **perdeu o `priority`** e ganhou `quality={45}`: é um
PNG de 1,35 MB desfocado a 25% de opacidade sob um gradiente branco. Quem carrega
significado é a abertura visual, e num 4G a fila importa. `sizes` de cada peça é
a largura real que ela ocupa em cada breakpoint, não `100vw` preguiçoso.

### Fronteira respeitada, e como testei mesmo assim

`public/brand/foocci/produto/` e `scripts/site/` são da outra frente e **não
foram tocados** — o diretório não existe no commit. Para conferir a moldura de
navegador (o único formato sem asset disponível) gerei três capturas falsas
naquele caminho, tirei os screenshots de layout nos três tamanhos e **apaguei o
diretório antes de commitar**, com `git status public/` limpo como prova. Os
screenshots que subiram para o CEO são do estado real (degradado), não do
simulado — mostrar a foto de mentira como se fosse entrega seria vender piloto
como pronto.

### Páginas legais

`/termos-de-uso` e `/politica-de-privacidade` **não** ganharam imagem, por
decisão: são documento, e foto ali é peso sem argumento. Ganharam só os tokens
(`LegalShell` estava em `gray-*` e `#0B0B0B` literais).

### Provas

`npx tsc --noEmit` limpo. `npx vitest run`: 5.209 de 5.210 verdes — a única falha
é o timeout ambiental conhecido de `noSideEffects.test.ts`, que passa isolado com
`--testTimeout=60000` (confirmado). O portão `brandName.test.ts` está verde,
inclusive com os três deslizes de "a Foocci" corrigidos em `HeroSection` e
`CommissionCalculator`.

Screenshots das **oito** páginas em 375/768/1280 (24 capturas), mais a rodada com
capturas simuladas para validar a janela de navegador. Zero rolagem horizontal nos
três tamanhos, zero imagem sem `alt`.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

**Proposta de vitrine** (quem promove é o Diretor): *"Asset que ainda não existe
não é motivo para adiar tela — é motivo para declarar a cadeia de degradação. O
último degrau tem de ser um arquivo versionado, e a escolha tem de ser função e
não componente, para quem chama saber se sobrou algo para desenhar."*

— interface, worktree `agent-a938cdf774d29b496`
## 2026-08-05 · Fotografar o produto para o site comercial (5 slots de `PRODUCT_SHOTS`)

O CEO viu o site "só com texto, botão e detalhe gráfico". A resposta acordada não
foi banco de imagens: foi capturar as telas reais da padaria de demonstração
(`foocci-bakery`). Entregues os cinco slots de `src/components/marketing/siteAssets.ts`
e o roteiro que os refaz: `scripts/site/capturar-produto.mjs` (+ `dados-demonstracao.mjs`
e `fotos-do-cardapio.mjs`). Nada em `src/`.

### O que a noite ensinou

**1. Foto de produto é foto de DADO, e dado velho aparece na imagem.**
A primeira leva saiu com "Atrasados 50%" em vermelho no painel de pedidos: os
pedidos ativos tinham sido semeados minutos antes e cruzaram o `DELAY_THRESHOLD`
de 20 min durante a própria captura (login + compilação em dev custam tempo). A
fila viva agora cabe em 8 minutos, com folga deliberada. Fila colada no limite
chega vermelha.

**2. O relógio é o inimigo silencioso.** Três descobertas encadeadas:
- `DashboardClient.tsx:588` fixa `timeZone: "America/Sao_Paulo"` e **nunca lê**
  `Restaurant.timezone`. Alinhar a coluna ao fuso da máquina não muda nada —
  perdi uma volta nisso. Quem se ajusta é o dado.
- O painel de pedidos formata a hora com `date.getHours()`, ou seja, o fuso do
  **processo**. Duas telas do mesmo produto, dois fusos.
- A hora das bolhas de conversa é escrita pelo **navegador**. Sem
  `context.clock.install()`, a foto do atendimento marcava 04:46 (hora real do
  runner) enquanto o painel marcava 13:20.

A saída foi ancorar tudo numa hora de parede de São Paulo (10h20, ou o agora se
já for mais tarde) e dar ao navegador o mesmo relógio. **Regra que fica: numa
captura, o instante tem que ser o mesmo em todas as telas — e ele não é, por
padrão.**

**3. Período "hoje" não serve para captura em servidor.** Runner roda de
madrugada no Brasil; o dia corrente é sempre parcial. Em "7 dias" a última barra
virava um toco e os comparativos ficavam negativos — a foto diria que a padaria
despencou. O painel de resultado é fotografado em **"Ontem"**: único recorte
completo a qualquer hora, e é de fato o que o dono abre de manhã.

**4. Número inflado é tão perigoso quanto número falso.** Com uma só semana de
histórico o painel comparava semana cheia contra vazio e estampava **"+375%
acima"**. Duas semanas de histórico e um **ritmo semanal** (mesmo multiplicador
para o mesmo dia da semana) fazem a comparação medir tendência, não ruído.

**5. A vitrine "Mais vendidos" é montada a partir das vendas reais.** Com sorteio
uniforme de itens, "Água Mineral" subia a 2º mais vendido e a loja abria com foto
de garrafa d'água; e o ticket médio dava R$ 70 — número de restaurante, não de
padaria. Peso por preço **e** por categoria resolveu os dois de uma vez. Ticket
final R$ 38–40.

**6. Sem `OPENAI_API_KEY` o cardápio local fica com 40 retângulos cinza.** As
fotos nascem de chamada paga (`npm run bakery:imagens`). Em vez de inventar
imagem, `fotos-do-cardapio.mjs` **espelha as que a padaria já serve em produção**
(`/api/media/<id>`, públicas, geradas pelo próprio produto), casando por nome de
item e reduzindo com `sharp`. Item sem par continua sem foto.

**7. `loading="lazy"` + barra de categorias fixa.** Rolar até o fim para acordar
as imagens fazia a barra de categorias acompanhar, e a foto saía com "Da Nossa
Despensa" aceso sobre a seção "Padaria". Duas telas de rolagem bastam.

**8. Peso.** Captura de interface é quase toda cor chapada: `png({ palette: true })`
corta o arquivo à metade sem borrar texto. Escada de degraus (paleta → escala) com
teto de 400 KB e saída não-zero se estourar. As cinco ficaram entre 110 e 174 KB.

### Dois defeitos do painel de pedidos, encontrados e NÃO propagados

Estão em `src/`, que eu não podia tocar. Sobem para o Diretor:

1. **`OrdersClient.tsx:649` — "Total hoje" mente.** O KPI mostra `orders.length`,
   que é o total CARREGADO (`/api/orders?limit=100`, sem filtro de data), não o
   total do dia. `OrderService.list` só filtra por data se `from`/`to` vierem, e
   a tela nunca os envia.
2. **`OrdersClient.tsx:530-533` — o filtro de data é decorativo.** `dateFrom` /
   `dateTo` existem em estado, são renderizados nos dois `input[type=date]` e
   **não aparecem em lugar nenhum** da consulta; o botão "Filtrar" não tem
   `onClick`. Cheguei a usá-lo na captura para tornar o KPI verdadeiro — não
   funciona, e preencher aquelas datas só encenaria um filtro inexistente.

Como a captura contornou sem maquiar: a padaria de demonstração passou a ter
movimento de padaria movimentada de verdade (~104 pedidos/dia). Com isso o "Total
hoje 100" que a tela exibe é verdade sobre o dia — e deixa de brigar com o
"Pedidos" da foto do resultado.

### Provas

Nenhum arquivo `.ts/.tsx` alterado (`git status` só acusa os dois diretórios
novos), então não há superfície para `tsc`/`vitest`; os três roteiros passam em
`node --check`. Execução completa de ponta a ponta (`--dados --fotos --auditoria`)
refez os cinco slots e a conferência de responsivo do cardápio: **375 / 768 /
1280 px sem rolagem horizontal** (`scrollWidth` = largura da janela nos três).

Autoavaliação das cinco imagens: hierarquia 9, tipografia 9, espaçamento 9,
consistência 9.

— interface, worktree `agent-ad7ca2b138d044884`

---

## 2026-08-05 · Um rótulo, um botão por página: a limpeza dos CTAs do site

**Pedido do CEO:** "tem um monte de botão 'pedir uma demonstração', espalhado em
todos os cantos; é o SDR que faz a demonstração, então tem que ir pro formulário".
Duas decisões já tomadas pelo Diretor e executadas aqui: **texto único** (`Ver no
meu restaurante`) e **no máximo um CTA comercial por página**, além do header e da
barra fixa do celular.

### O inventário, medido no DOM (não no grep)

Antes: **17 chamadas** para `/site/demonstracao` com **10 textos diferentes** —
onze eram botão laranja, e o décimo texto morava fora de `/site`, no checkout
(`/contratar/novo`). Depois: **1 no header + 1 por página + a barra fixa**, todos
lendo `DEMO_CTA_LABEL`.

Removidos: `FourContractsSection` (home), `WaiterRealShowcase`, `CrmRealShowcase`,
o botão de demonstração dos três cartões de `/precos`, a `CtaBand` de
`/site/demonstracao` (ela ficava logo ABAIXO do formulário) e o link duplicado
"Demonstração" do rodapé (ele e "Contato" apontavam para a mesma página).
Convertidos em passo não-comercial: o CTA do hero de `/atendimento-com-ia`, `/crm`
e `/solucoes` — viraram âncora para a prova da própria página.

### O que só apareceu porque o rótulo virou um só

Enquanto a barra fixa do celular dizia outra coisa e ia para outro lugar
(`/site/como-funciona`), ela e o CTA da página ainda se distinguiam. Com o texto e
o destino unificados, **as duas viram o mesmo botão duplicado na mesma dobra** —
laranja, largura cheia, a poucos pixels. Foi preciso generalizar a regra que a
barra já tinha para o formulário (`[data-demo-form]`) e criar `[data-demo-cta]`,
posto pela `CtaBand`, pela calculadora e por quem for o CTA único da página.

**A lição que vale além deste bloco:** unificar rótulo e destino **cria colisões
que a variação escondia**. Dois botões com textos diferentes parecem duas ofertas;
com o mesmo texto, parecem um defeito. Quem unifica copy tem que reconferir a
sobreposição, não só a semântica.

Dois defeitos apareceram por tabela e foram corrigidos:
1. a barra fixa em `/site/como-funciona` linkava para a **própria página** — botão
   fixo que não faz nada. Ela agora aponta para o formulário e **não renderiza** na
   página do formulário (`usePathname`).
2. `/precos` tinha quatro CTAs comerciais: três cartões + a faixa. Cartão de plano
   com dois botões faz o "Contratar agora" disputar com o "ver antes" logo abaixo.

### As exceções, todas comentadas no ponto de uso

- **Home:** ficou o CTA da **calculadora**, não o da tabela de quatro serviços —
  ele só existe depois que o dono vê a economia **dele** na tela; é a conclusão do
  argumento, não uma faixa. O "Calcular minha economia" do hero não conta (leva à
  ferramenta).
- **`/site/demonstracao`:** os botões que sobraram são **âncora para o formulário
  da própria página** — rotulados "Ir para o formulário", não com o rótulo único.
  Quem já está na porta precisa da maçaneta, não de um convite.
- **`/experimente`:** o CTA do **estado vazio** (padaria fora do ar) fica — sem ele
  a página que a campanha paga aponta não tem saída nenhuma.
- **`/precos`:** o link de texto "Fale com a gente" acima de 4.000 pedidos fica —
  é frase, não botão, e atende quem não cabe na tabela.

### A promessa do formulário

`/site/demonstracao` não dizia o que acontece depois de enviar. Agora diz, em três
passos numerados acima do formulário, e **sem prazo** (não temos compromisso de
"em até X horas" — guardrail 7): os dados vão para **uma pessoa** do Foocci, ela
chama no WhatsApp informado e mostra o sistema com o cardápio do restaurante. A
mesma promessa foi repetida na tela de confirmação do envio.

### Drift do DESIGN.md corrigido de passagem

`CtaBand` (`bg-white`/`gray-*`/hex → tokens; card `rounded-3xl` → `rounded-2xl`),
`MarketingFooter` (`gray-*` → `muted`/`ink2`/`line`/`paper`, `font-medium` fora) e
`SecondaryCta` (`gray-300/800/50` → `line2`/`ink`/`canvas`).

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` 5.359/5.360 (só o
`noSideEffects.test.ts`, que estoura o timeout de 5s sob carga e passa isolado com
`--testTimeout=60000` — ambiental, confirmado). O teste de marca passou sem
ajuste: "Ver no meu restaurante" não toca no gênero de "Foocci".

Playwright em **375 / 768 / 1280** nas nove páginas de `/site` (27 capturas):
`documentElement.scrollWidth` igual à largura da janela nas 27 — **zero rolagem
lateral**. Conferência mecânica extra: com a dobra posicionada sobre cada CTA
(calculadora da home, faixa de fechamento de `/crm`, `/precos` e
`/atendimento-com-ia`, e o meio de página com a barra fixa), a contagem de botões
laranja para o formulário **visíveis na dobra é exatamente 1** em todos os casos.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, worktree `agent-af6737050c07de929`

---

## 2026-08-05 · Microfone em TODO chat do painel — um gancho só

**Pedido do CEO (P0):** "coloque microfone no chat do suporte. Na verdade isso
tem que virar padrão: TODO chat tem que ter microfone."

### O achado que mudou o desenho: eram TRÊS implementações, não duas

A varredura por `MediaRecorder`/`getUserMedia` acusou o gancho oficial
(`components/help/useVoiceInput.ts`) mais **duas** cópias artesanais — e cada
uma tinha um defeito diferente, o que prova o argumento de "corrigir num lugar
tem que valer para todos":

| Cópia | Defeito que só ela tinha |
|---|---|
| `SupportTechChat.tsx` (Ajuda técnica) | mandava o **áudio direto** para `/api/support/tech`; o relato virava chamado sem o lojista ler o que a máquina entendeu |
| `crm/CrmCampaignAI.tsx` (Campanha por IA) | desenhava o botão **sempre**, sem checar `supported` — em navegador sem microfone o botão existia e não gravava |

As duas morreram. Hoje existe **uma** porta: `@/components/voice`.

### O que passou a existir

`src/components/voice/` — `useVoiceInput.ts` (movido de `help/`, agora com
`endpoint` configurável e erros traduzidos por causa: `NotAllowedError` vira
"toque no cadeado ao lado do endereço e permita o microfone"; 401 vira "sua
sessão expirou, atualize a página") + `VoiceButton.tsx`, que traz o botão E o
`VoiceStatus`. Os dois andam **em par**: o botão mostra o estado, o status conta
o que está acontecendo dentro de `role="status" aria-live="polite"` — quem usa
leitor de tela não vê a bolinha vermelha piscar.

`appendTranscript(previous, incoming)` é o helper que garante a regra "acrescenta,
não substitui" em todos os pontos de uma vez.

### Onde o microfone existe agora (9 pontos, 6 telas)

Novos: Atendimento (composer), Central de Conversas (`conversations/[id]`),
`chat/ChatClient`, Analista de Dados (Analytics), disparo de WhatsApp do CRM.
Unificados: Ajuda técnica, Campanha por IA. Já existiam e migraram para a peça:
Assistente (chat) e os três campos da pílula do topo.

### Onde NÃO entrou, e o motivo está escrito no código

- **Loja do cliente final** (`pedido/[slug]/PedidoClient.tsx`): superfície
  pública. `/api/help/transcribe` custa por chamada e exige contexto de tenant —
  ligar ali seria abrir rota paga para a internet. Comentário no arquivo.
- **`/admin/support-inbox`**: a área admin **não** passa pelo middleware que
  injeta `x-restaurant-id`; o botão apareceria e tomaria 401 em silêncio. Para
  ligar, criar `/api/admin/transcribe` — o gancho já aceita `endpoint`.
- **Simuladores** (chat-sim, waiter-lab, aprendizado-whatsapp, diagnostics): ali
  se digita fingindo ser o cliente, e o valor está em repetir a **mesma** frase
  palavra por palavra. Transcrição introduz variação e gasta chamada paga por
  teste.

### A armadilha que quase passou

`microphone=(self)` continua em `next.config.js:82` — conferido, não foi
revertido. Se alguém voltar para `microphone=()`, os nove botões aparecem e
**nenhum** grava, em produção, sem erro visível. Vale um teste de configuração.

### Drift do DESIGN.md corrigido de passagem

Botões de envio da pílula `rounded-lg` → `rounded-xl`; foco `ring-brand-500`/
`ring-1 ring-brand-400` do composer de Conversas e do `chat` → padrão canônico
`focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`;
`font-medium`/`font-bold` dos botões tocados → `font-semibold` (400/600 são os
únicos pesos embarcados).

### Provas

`npx tsc --noEmit` limpo · `npx vitest run` **418 arquivos / 5.360 testes,
todos verdes** (desta vez o `noSideEffects.test.ts` passou junto).

Playwright em **375 / 768 / 1280** com `--use-fake-device-for-media-stream`:
`documentElement.scrollWidth` igual à janela nos três. Os **quatro** estados
foram capturados clicando no botão de verdade, não simulados: parado, gravando
("Gravando… fale e toque no microfone para parar"), transcrevendo ("Transcrevendo
o que você falou…") e erro — que no ambiente local veio do servidor como
"Falhou ao transcrever. Tente de novo ou digite.", sem código de erro na cara de
ninguém.

**Ajuste que só o screenshot pegou:** a 375px o placeholder "Digite ou fale sua
mensagem…" era **cortado no meio** ("Digite ou fale sua") porque o mic e o botão
Enviar comem a largura. Encurtado para "Digite ou fale…". Conta de cabeça não
teria pegado — é a mesma lição do `QRCard`: a largura é conhecimento do uso.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, worktree `agent-ae1e1e13fe82206cb`

---

## 2026-08-05 — Seis defeitos do site comercial (varredura de percurso, celular)

**O que foi feito:** os seis achados da varredura em produção, todos reproduzidos
antes de mexer. Worktree `agent-a344cbc90aaf550b7`, sem commit (ordem do Diretor).

**1 · P0 — o botão de pagar que ficava mudo (`/contratar/novo`).** Com tudo
preenchido menos o Termo, "Aceitar e pagar R$ 214,50" seguia apagado e nenhuma
mensagem aparecia. **A escolha: botão habilitado, validação no toque.** Botão
desabilitado é uma resposta que ninguém consegue ouvir — ele não tem estado de
"por quê", e no celular não há hover nem foco para insinuar. Habilitado, o toque
vira pergunta e a tela responde em três lugares: resumo âmbar colado no botão
(cada item leva ao campo), frase vermelha no campo, e foco no primeiro pendente.
A trava do dinheiro nunca foi o `disabled` — é o servidor, que revalida tudo.
O mesmo desenho, peça por peça, foi para o `DemoForm` (achado 2): dois
formulários do mesmo site não podem responder diferente ao mesmo toque.

**2 · A armadilha que quase engoliu a correção: `globals.css` vence utilitário
de borda em input.** A regra base é
`input:not([type=checkbox]):not(…)` com **sete `:not`** — especificidade (0,7,1).
Qualquer `border-red-400` (0,1,0) perde, em qualquer camada. A borda de erro
simplesmente não pintava: cor computada seguia `rgb(229,229,229)`, e só o
`getComputedStyle` no navegador mostrou — no screenshot a 375px dava para
acreditar que era o laranja do foco. Correção: `!border-red-400`. Corolário que
vale para o projeto inteiro: **todo `focus:border-brand-500` escrito em input
neste repositório também é decorativo** — quem pinta é a regra base.

**3 · O número conservador mentia, e mentia em dois lugares.** `savingsLow =
comissão × 20%` era anunciado como "no seu caixa" sem descontar a mensalidade —
R$ 920 onde o certo é R$ 491. A conta virou `@/lib/site/savings.ts`, pura e com
teste (`savings.test.ts`, 7 casos, incluindo os dois pedidos: 20.000/23% e
2.000/23%). O bloco "Faz a conta" de `/site/precos` tinha o **mesmo** vício nos
três planos e passou a ler o mesmo módulo. Duas cópias da mesma conta foi como o
erro nasceu; a terceira não deve existir.

**Aprendizado que passa do número: tamanho também afirma.** Com R$ 2.000/mês a
23%, "Você economiza **R$ 31**" a 3rem em laranja é aritmeticamente verdadeiro
(migração total) e mesmo assim é mentira de hierarquia — é o melhor caso vestido
de resultado, e a linha de baixo o desmente. Nesse faturamento a manchete passou
a ser o ponto de equilíbrio, no cartão calmo. Guardrail 7 não se cumpre só no
valor: cumpre-se no corpo tipográfico que se dá a ele.

**4 · Trava para cima.** Havia trava embaixo e na taxa, não em cima:
999.999.999 produzia "R$ 229.999.571 por mês". `MAX_PLAUSIBLE_REVENUE = 5 mi`,
com o tom das outras duas (desconfiar do número, não repetir com convicção).

**5 · Resultado fora da tela no celular.** Medido: bloco "Você economiza" a
1.033px, dobra a 812px. Duas medidas, e a estrutural vem primeiro — miolo
comprimido no celular (parágrafo `text-[15px]`, ajuda da taxa encurtada, divisor
`mt-6/pt-6`) devolveu 56px, o suficiente para o topo do comparativo espiar acima
da dobra. A segunda é a rolagem até o resultado, **condicionada a ele estar mesmo
fora de vista** (`caixa.top < innerHeight − 160`): por isso ela **nunca dispara no
desktop** — conferido, a 1280px a página fica exatamente onde estava. Depois do
toque no chip, "Você economiza" nasce a **296px** do topo. A animação é opcional
(`prefers-reduced-motion` → `auto`); a rolagem, não.

**6 · O 404 em inglês.** `app/site/not-found.tsx` **não teria funcionado**:
`not-found.tsx` de segmento só atende a `notFound()` chamado DENTRO dele; endereço
que não casa com rota nenhuma cai sempre na RAIZ. O arquivo é `app/not-found.tsx`,
com moldura de marketing montada à mão (ele não vive sob `site/layout.tsx`).
Consequência que veio junto e teve de ser tratada: virando o 404 de todo endereço
solto, ele passaria a vestir a marca Foocci para quem digita errado o link de uma
**loja** — daí `app/pedido/not-found.tsx` e `app/qr/not-found.tsx`, neutros, sem
marca nenhuma (não há `--brand-primary` de uma loja que não existe). Sem CTA
comercial laranja no corpo: quem chega ali errou de endereço, não de produto.

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` **429 arquivos /
5.495 testes, todos verdes**. Playwright em 375/768/1280 nas cinco telas
(`scrollWidth` igual à janela nos três tamanhos, em todas).

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 9, consistência 9.

— interface, worktree `agent-a344cbc90aaf550b7`

---

## 2026-08-05 · A hierarquia dos cartões de plano em `/site/precos`

Ordem do CEO: o desenho do cartão está aprovado, muda **o que vem depois do
botão e em que ordem**. Nada de moldura, cor, selo "Mais vendido", bloco de
ciclos ou botão foi tocado.

**O que mudou.** Depois do CTA, o cartão passou a ter dois blocos:

1. **Três vantagens em 16px semibold** (`plan.benefits`), com apoio em 13px.
   Antes o primeiro conteúdo pós-botão era o "Só aqui você tem" — bullets de
   13px com **prova técnica** ("a comanda volta pra fila 5×"). Prova excelente,
   primeira linha péssima: prova antes de a pessoa ter entendido o que ganha.
2. **"Tudo que está incluído"** — rótulo de bloco + herança ("Tudo do
   Essencial, mais:") na mesma linha, e aí sim `onlyHere`, os grupos e o
   "Substitui". Lista completa preservada, nada escondido, nada colapsado.

**A regra que ficou: benefício sobe, prova desce.** E a ordem das vantagens
segue a dor-chefe do plano, não a força do recurso — a primeira vantagem de cada
cartão entrega a manchete daquele cartão, e nenhuma se repete entre os três.

**Escala é o que separa os dois blocos, não moldura.** 16px (vantagem) contra
12,5px (lista) — os itens de lista caíram de 13px para 12,5px e o check ficou
`brand-500/70`. Com os dois em 13px, o cartão lia como uma lista longa só.

**Teto de três.** A quarta vantagem foi escrita e cortada nos três planos
(Performance perdia "Bronze a Diamante", que continua no `onlyHere`): com quatro,
nenhuma é grande.

**Medido** com Playwright em 375/768/1280: `scrollWidth` igual à janela nos três;
a 1280 os três cartões alinhados no topo (`top` 217 nos três) e o do meio segue
sendo o mais alto pelo próprio conteúdo, como já era.

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` 435 arquivos /
5.618 testes verdes. Sem commit, por ordem do Diretor.

Autoavaliação: hierarquia 9, tipografia 9, espaçamento 8, consistência 9.

— interface, worktree `agent-a478e73f658b2abd5`, branch `work-precos` (de
`origin/claude/foocci-site-hero`)
