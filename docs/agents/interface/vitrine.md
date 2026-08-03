# Vitrine — interface

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
>
> A lei do design é o `DESIGN.md`. Esta sala guarda o que se aprendeu **fazendo** —
> armadilha de layout, decisão de estrutura, coisa que já quebrou.

---

## Breakpoint de viewport não serve para componente que vive em grid

O `sm:` olha a **viewport**, mas quem manda na quebra é a **largura do cartão**:
num grid de 2–3 colunas o cartão tem ~320–350px mesmo com a tela a 768px+, e um
corpo em linha estoura — com `overflow-hidden`, o corte é **silencioso**. Foi
assim que o `QRCard` cortou o input de link e o texto de dica em produção sem
ninguém ver. Sem container queries (Tailwind 3.4 sem plugin), a largura é
conhecimento do **uso**, não do componente: exponha uma prop de layout
(`"row" | "stacked"`) e deixe quem monta o grid decidir.

No mesmo bloco, a conta de cabeça errou duas vezes ("3 colunas não cabem a 1280";
"2 colunas + 1 embaixo fica bom") e o screenshot corrigiu as duas. Os screenshots
de 375/768/1280 são instrumento de **decisão** de layout, não só conferência final.

— promovido em 2026-08-03 pelo Diretor · origem: bloco do terceiro cartão de QR na
tela Cardápio (oficina de 2026-08-03, commit `eedee0c` + consolidação)

---

## Receita de ambiente local para screenshot do painel

`service postgresql start` → `.env` a partir do `.env.example` com DATABASE_URL
local → `npx prisma generate` → **`npx prisma db push`** (as migrations históricas
quebram com `migrate deploy` em banco virgem: "relation orders does not exist") →
seed de `prisma/seed.ts` (login `owner@pizzaria-demo.com` / `demo1234`, restaurante
`pizzaria-demo`) → `next dev` + Playwright pré-instalado (`/opt/pw-browsers/chromium`).

— promovido em 2026-08-03 pelo Diretor · origem: mesmo bloco, registrado na oficina

---

## O site comercial, medido (02/08) — o problema é comprimento, não qualidade

Auditoria com Playwright em 375 / 768 / 1280, com o gate de prévia aberto.

| Página | Altura no celular | Seções |
|---|---|---|
| `/site` (home) | **15.509px ≈ 19 telas** | 12 |
| `/site/precos` | 5.013px ≈ 6 telas | 5 |
| `/site/como-funciona` | 6.303px ≈ 8 telas | 5 |

**O que está certo e não deve ser mexido:**
- **Zero rolagem horizontal** nas três páginas (`scrollWidth` = 375, exato).
- **Acessibilidade limpa:** nenhuma imagem sem `alt`, nenhum botão ou link sem nome
  acessível. Isso é raro e foi feito de propósito.
- A marca segue o **90% neutro + 10% laranja**; o laranja aparece como acento.

**O único achado real: a home tem 19 telas de rolagem no celular.** Landing B2B
converte melhor entre 6 e 8. Com 12 seções e 11 `h2`, a página repete a mesma
estrutura de cards brancos várias vezes — a hierarquia achata e o visitante não
chega nos planos nem no CTA final.

> ⚠️ **Armadilha de auditoria, e ela quase virou defeito reportado:** um detector
> ingênuo de "elemento mais largo que a viewport" acusa **5 elementos** nessas
> páginas. Todos são **decoração de fundo** — `pointer-events-none absolute -z-10`
> com gradiente radial em blur, propositalmente maiores que a tela e **cortados
> pelo pai**. O sinal que vale é **`document.documentElement.scrollWidth`**, não o
> retângulo de cada elemento. Medir a peça isolada e ignorar o recorte do
> contêiner produz alarme falso.

— promovido em 2026-08-02 pelo Diretor · origem: auditoria com screenshots em três
tamanhos, na véspera do lançamento

O menu lateral tem `w-60` (**240px**) em `components/layout/Sidebar.tsx:102`.
O drawer de Promoções começa em `lg:left-56` (**224px**), em quatro pontos de
`app/(dashboard)/promotions/PromotionsClient.tsx` (linhas 521, 526, 1012, 1015).

**Os dois números deveriam ser o mesmo e não são.** O drawer entra 16px por cima
da borda do menu, no desktop, em produção. O handoff que registrou o risco ainda
falava no futuro (*"se o sidebar mudar de largura…"*) — quando foi verificado, já
tinha acontecido.

**A regra:** medida que uma tela precisa saber de **outra** tela não pode ser
literal repetido. Ou vira token/constante lida pelos dois lados, ou o layout se
resolve por fluxo (grid/flex) em vez de deslocamento fixo.

Corrigir só o número deixa a armadilha armada para a próxima mudança.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-railway-build-e-ui-promocoes.md`,
verificado na branch de produção

---

## O drawer de Promoções não é painel lateral — é a área de conteúdo inteira

Pedido explícito do CEO. Ele é `fixed inset-y-0 left-0 lg:left-56 right-0 z-50`:
começa onde o menu acaba e vai até a borda direita, como se fosse página. O
backdrop cobre a mesma área.

Dentro dele, **duas abas**: *Nova promoção* e *🤖 Automações WhatsApp*. O conteúdo
do formulário fica centrado com `max-w-3xl mx-auto` — largura total é do
contêiner, não do texto.

Se alguém propuser "voltar para um painel lateral estreito", isso desfaz uma
decisão do dono, não um acidente.

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff (commits `f3f580f`, `4d43511`)

---

## No mobile, o menu e o drawer disputam a mesma camada

O menu aberto no celular é `z-50`; o backdrop do drawer é `z-40`; o painel do
drawer também é `z-50`. Abrir o drawer com o menu aberto sobrepõe os dois de forma
estranha.

No desktop não acontece: ali o menu é `lg:static lg:z-auto` — sai da pilha de
`z-index` e entra no fluxo normal.

**O que fica:** ao criar qualquer sobreposição nova, confira o comportamento
**com o menu mobile aberto**. É o estado que ninguém testa, e é justamente onde os
`z-index` colidem.

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff

---

## Dado que chega por busca no navegador precisa de estado de carregando

A aba *Automações* do drawer busca `/api/crm/automations` num `useEffect` sem
estado de carregando. Até a resposta chegar, os três cards aparecem com valores
padrão: chave desligada, campos vazios.

Para o lojista isso não parece "carregando" — **parece que as configurações dele
sumiram**. Ele pode reconfigurar por cima de dados que estavam salvos.

É o estado obrigatório *carregando* do `DESIGN.md` §6.1 valendo também para
componente interno, não só para página.

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff

---

## A marca é 90% neutro + 10% laranja — e isso está escrito no código

`tailwind.config.ts:26` carrega a filosofia do Brand Book em comentário:
**"minimalismo premium — 90% neutro + 10% laranja"**.

O laranja **`#F97316`** (`brand-500`) é **acento**, não protagonista. Hover é
`#EA580C` (`brand-600`). O que domina a tela são os neutros:

| Token | Valor | Papel |
|---|---|---|
| `ink` | `#0B0B0B` | títulos |
| `ink2` | `#5C5C58` | corpo de texto |
| `paper` | `#FFFFFF` | superfícies e cards |
| `canvas` | `#F6F6F4` | fundo do app (off-white quente) |
| `line` / `line2` | `#E9E9E6` / `#E5E5E5` | bordas |
| `muted` | `#8A8A86` | texto secundário |

Fonte **Inter**. Referências declaradas: Linear/Stripe/Vercel no painel,
iFood/Rappi na loja.

**Vale também para material de fora do produto** — site comercial, peça, apresentação.
Uma sessão quase entregou briefing de site com "laranja protagonista"; teria
produzido um site que não parece o app.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-site-comercial.md` (commit `79943f5`)
