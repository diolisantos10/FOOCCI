# OS CORRETIVA — A interface do plano de entrada é a do QR com checkout

> **Aberta em:** 03/08/2026 · pelo Diretor Geral, após correção direta do CEO.
> **Para:** Diretor do Foocci. **Prioridade: P0 — substitui a interpretação
> anterior da OS do cardápio sem IA.**

---

## 1 · O erro, e de quem foi

A OS anterior mandou construir a loja sem IA **sobre a tela do `/pedido`**
(a experiência de chat, com a IA neutralizada). O Diretor executou exatamente o
que estava escrito, com prova — **o erro não foi de execução, foi de tradução, e
foi do Diretor Geral**: as palavras originais do CEO (02/08) eram

> *"pegar a mesma interface que tem do QR e transformar numa interface com
> finalização de venda"*

e a OS as converteu no caminho mais barato de código em vez do que ele
descreveu visualmente. O CEO confirmou em 03/08:

> *"Essa é a interface com IA. A gente vai pegar aquela interface que os
> clientes utilizam na mesa, que é só pra observar, e fazer ela com ações de
> adicionar no carrinho — a mesma versão, só que para delivery, sem chat,
> só checkout, carrinho e tudo mais."*

## 2 · A especificação correta, sem ambiguidade

**Base visual: `/qr/[slug]` (QRMenuClient)** — o cardápio limpo de catálogo,
sem NENHUM elemento de conversa: sem bolhas, sem avatar, sem saudação de chat,
sem composer. Cor white-label do restaurante, como já é.

**Somar a ela o comércio, reaproveitando a máquina já PROVADA do funil:**

| O que entra | De onde vem |
|---|---|
| Tocar no prato → adicionar ao carrinho (com quantidade/observação) | novo na UI; estado de carrinho já existe no funil |
| Barra de carrinho fixa com total + "Finalizar pedido" | padrão iFood/Rappi |
| Identificação por WhatsApp → retirada/entrega → pagamento → confirmação | **as MESMAS rotas `/api/pedido/*` que o passo 1 provou funcionarem sem IA** (pedido #O2VKA1) |
| Preços do canal delivery | `channelPrice` já usado pelas duas telas |

**É para DELIVERY/retirada** — não é o pedido na mesa (comanda/nº da mesa
continua fora, como decidido).

**Modo de exibição:** o `/qr` atual (vitrine pura, para a mesa) continua
existindo como está. A loja nova é a experiência do plano de entrada — decidir
com 1 flag por restaurante qual experiência o link principal abre
(entrada = esta; planos com IA = `/pedido` com o Garçom).

## 3 · O que se aproveita do trabalho de hoje (quase tudo que doeu)

- ✅ **A prova de que o funil fecha sem IA** — as rotas de identificação,
  carrinho, finalize e pagamento são as mesmas; foi exatamente o que o passo 1
  validou com pedido real.
- ✅ **O conserto do "Finalizar" que dependia da IA** — vale para qualquer UI.
- ✅ **A trava por plano no servidor (403 sem o cliente ver)** — intacta.
- ✅ **O override por restaurante no admin** — intacto.
- ⚠️ O que se descarta é só o **acabamento visual** feito sobre a tela de chat
  (saudação nova etc.) — horas, não dias.

## 4 · Critérios de pronto

1. Primeira tela no celular (375px) mostra **categorias e pelo menos 2 pratos**
   — zero elemento de conversa em qualquer etapa.
2. Compra completa por clique: catálogo → carrinho → retirada E entrega →
   confirmação, nas mesmas rotas provadas, com screenshot 375/768/1280.
3. Estados carregando/vazio/erro; tokens do restaurante (white-label).
4. O `/qr` da mesa continua intocado (vitrine).
5. `tsc` + testes verdes; evidência registrada nesta OS.

## 5 · Lição registrada (para o Diretor Geral, não para o Diretor)

Quando o dono descreve uma interface apontando para uma tela que existe
("aquela da mesa"), **a especificação é o visual apontado, não a mecânica mais
barata de reaproveitar**. Reuso de código é decisão de engenharia; a cara do
produto é decisão do dono. A OS que traduziu o pedido otimizou a variável
errada.


---

## 6 · ✅ FECHADA — 03/08/2026, com evidência

| Critério | Evidência |
|---|---|
| 1 · Primeira tela: categorias + pratos, zero conversa | 375/768/1280: chips de categoria (incl. "Mais vendidos"), cards com preço, **zero elemento de conversa**, zero rolagem lateral |
| 2 · Compra por clique nas duas modalidades | Loja local real: **retirada CONFIRMADA** e **entrega CONFIRMADA**, nas rotas provadas (`identify-customer` → `finalize`), screenshots por etapa |
| 3 · Estados + white-label | vazio/erro/fechado tratados; cor da marca do restaurante em header, chips, preço e botões |
| 4 · `/qr` da mesa intocado | Conferido: segue vitrine, sem carrinho |
| 5 · Verificação | `tsc` 0 · lint 0 · 4669 testes verdes · **produção**: `pizzaria-testando` (entrada) renderiza a loja nova; `sushi-cazza` (IA) segue no chat |

**Como ficou o roteamento:** um link só (`/pedido/[slug]`). A MESMA flag do gate
de plano decide a experiência — plano com Garçom → chat; plano de entrada → loja
QR com checkout. Zero chamadas de IA disparadas pela loja nova.

Auto-revisão visual (DESIGN.md): hierarquia 9 · tipografia 8 · espaçamento 8 ·
consistência 9.
