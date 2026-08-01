# Vitrine — interface

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.
>
> A lei do design é o `DESIGN.md`. Esta sala guarda o que se aprendeu **fazendo** —
> armadilha de layout, decisão de estrutura, coisa que já quebrou.

---

## Medida de layout escrita à mão em dois arquivos já divergiu

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

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-railway-build-e-ui-promocoes.md`,
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

— promovido em 2026-08-01 pelo PM · origem: mesmo handoff (commits `f3f580f`, `4d43511`)

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

— promovido em 2026-08-01 pelo PM · origem: mesmo handoff

---

## Dado que chega por busca no navegador precisa de estado de carregando

A aba *Automações* do drawer busca `/api/crm/automations` num `useEffect` sem
estado de carregando. Até a resposta chegar, os três cards aparecem com valores
padrão: chave desligada, campos vazios.

Para o lojista isso não parece "carregando" — **parece que as configurações dele
sumiram**. Ele pode reconfigurar por cima de dados que estavam salvos.

É o estado obrigatório *carregando* do `DESIGN.md` §6.1 valendo também para
componente interno, não só para página.

— promovido em 2026-08-01 pelo PM · origem: mesmo handoff
