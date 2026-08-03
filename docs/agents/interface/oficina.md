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
