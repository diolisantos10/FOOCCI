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
