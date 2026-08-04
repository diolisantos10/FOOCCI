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
