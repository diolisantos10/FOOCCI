# OS — O plano de entrada não tem cardápio que venda

> **Aberta em:** 02/08/2026 · pelo **Diretor Geral do Cérebro**, a partir de achado
> do CEO.
> **Para:** Diretor do Foocci.
> **Prioridade:** P0 comercial — **trava a tabela de preços publicada hoje.**

---

## 1. O achado do CEO, em uma frase

Se o plano de entrada **não inclui o Garçom de IA**, o restaurante desse plano
**não tem hoje nenhuma tela capaz de receber um pedido.** Ele vende nada.

---

## 2. O que foi medido — e o buraco é menor do que a frase sugere

### 2.1 O cardápio do QR realmente não vende. Confirmado.

`src/app/qr/[slug]/page.tsx`, linha 2, escrito pelo próprio código:

> `/qr/[slug] — Public read-only dine-in menu`

`QRMenuClient.tsx` tem **949 linhas e zero ocorrências** de carrinho, checkout,
finalizar ou adicionar item. É vitrine. O CEO está certo.

### 2.2 Mas o checkout **já existe, e não passa pela IA.** Este é o ponto.

`src/app/pedido/[slug]/PedidoClient.tsx` — 6.253 linhas — declara o funil no
cabeçalho:

```
BROWSE → DELIVERY_TYPE → ADDRESS_INPUT → ADDRESS_DETAILS →
ADDRESS_CONFIRM → ASK_NAME → PAYMENT → PAYMENT_METHOD →
REVIEW_ORDER → DONE
```

Três medições que importam:

| Medição | Resultado | O que significa |
|---|---|---|
| A tela **abre em `BROWSE`** | catálogo navegável é o estado inicial | o cliente já entra vendo o cardápio, não um chat |
| **39 chamadas de `setStage`** | todas em handler de clique ou retorno de pagamento | **quem move o funil é o dedo do cliente**, não a resposta da IA |
| ~25 chamadas de rede, **2 vão à IA** | `finalize`, `pix-payment`, `card/charge`, `card/confirm`, `coupons`, `delivery-quote`, `customer-address` são rotas próprias | **o dinheiro não passa pela IA** |

**Conclusão:** carrinho, endereço, cupom, frete, PIX, cartão, revisão e confirmação
já estão construídos e são independentes do Garçom. A IA é **uma camada por cima**
de uma loja que funciona sem ela.

> ⚠️ **O que NÃO foi medido, e é o primeiro passo desta OS:** ninguém rodou a tela
> com a IA desligada para ver o funil completar. Que as etapas sejam disparadas por
> clique é forte indício, não prova. **Não escreva uma linha antes do passo 1.**

---

## 3. A decisão que precisa ser tomada antes de codar

O CEO descreveu **"o cardápio do QR Code, com finalização igual a do com IA"**.
Isso mistura duas coisas que são **produtos diferentes, com funis diferentes**:

| | **A · Loja sem IA** | **B · Pedido na mesa** |
|---|---|---|
| Quem usa | cliente em casa, pelo link | cliente sentado, pelo QR da mesa |
| Funil | o que já existe: endereço, frete, pagamento online | **outro**: número da mesa, sem endereço, sem frete |
| Preço | preço de delivery | **preço de salão** (`priceDineIn` já existe no modelo) |
| Saída | pedido de entrega | **comanda na cozinha** |
| Custo | pequeno — a máquina existe | **construção real** — funil novo |

### ✅ DECIDIDO PELO CEO — 02/08/2026

> *"para o plano de entrada é o cardápio sem IA, como tínhamos combinado."*

**É a opção A.** O plano de entrada entrega a **loja sem IA** — catálogo navegável,
carrinho e checkout, pelo link. **Não é o pedido na mesa.**

A opção B (mesa, preço de salão, comanda) continua sendo produto desejável, mas
**não entra neste bloco** e não bloqueia o lançamento. Só volta à mesa depois que A
estiver no ar e verificado.

Isto é decisão de dono tomada — **não reabra**. Se a execução mostrar que A é
inviável, isso é fato novo: escreva o fato em
`docs/perguntas-ao-diretor-geral.md` e leve ao CEO. Não troque para B por conta
própria.

---

**Recomendação original do Diretor Geral (confirmada pelo CEO): fazer A primeiro, e
fazer A agora.**

Motivo: A é quase só desligar e arrumar. B é produto novo. E o restaurante do plano
de entrada precisa **vender** — o link que ele manda no WhatsApp e coloca na bio
resolve isso hoje; o pedido na mesa é conforto de salão, não é o que trava a venda.

> **Isto é recomendação, não ordem.** Se o Diretor discordar — por exemplo, se a
> maioria dos restaurantes do plano de entrada for salão puro — a decisão é do CEO,
> e a objeção vai escrita em `docs/perguntas-ao-diretor-geral.md`.

---

## 4. Os passos, na ordem

### Passo 1 — Provar antes de construir (não pule)

Rodar `/pedido/[slug]` com a camada de IA neutralizada e **tentar comprar de
verdade**: navegar o catálogo → carrinho → endereço → PIX → confirmação.

Entregar **onde exatamente trava**, se travar. Três resultados possíveis:

- **Completa o pedido** → o trabalho é de acabamento (passo 2), não de construção.
- **Trava em um ou dois pontos** → conserte esses pontos. Continua sendo acabamento.
- **Não completa** → a hipótese da §2.2 está errada. **Pare, escreva o que
  encontrou, e reabra a conversa.** Não saia reconstruindo por cima.

Guardrail 2: registre o resultado com evidência. Verificação sem registro não
aconteceu.

### ✅ PASSO 1 EXECUTADO — 03/08, com evidência

**Método:** loja local com o código atual + banco Postgres local semeado
(restaurante `loja-teste-entrada`, plano STARTER, 4 itens), navegador real em
375px, e as **duas** chamadas de IA (`POST /api/pedido/{slug}`) **bloqueadas na
rede** — a simulação exata do plano sem Garçom.

**Resultado: o funil COMPLETA.** Identificação por WhatsApp → cadastro de nome →
catálogo → item no carrinho → Finalizar → Retirada → Confirmar pedido →
**`orders`: 1 linha, `status=CONFIRMED`, `total=28.90`**. Zero erros 5xx.

**Mas a hipótese da §2.2 estava errada num ponto, e era exatamente o que trava:**

> `PedidoClient.tsx:4213` — o botão **"Finalizar pedido" dispara um turno de IA**
> (`ON_CHECKOUT_STARTED`) e só avança quando o Garçom responde
> `CHECKOUT_SUPPORT` (linha ~3602). Com a IA fora: *"Ops! Tivemos um problema"* —
> **e a trava de clique-rápido ficava presa, matando o botão até recarregar a
> página.** O cliente montava o carrinho e não tinha como pagar.

**Conserto aplicado (mesmo dia):** no `catch` da chamada de IA, se havia checkout
pendente, a tela **pula o upsell e abre o checkout operacional direto**
(`proceedToCheckout()`). A IA vira o que sempre deveria ser ali: enfeite opcional
sobre um caminho de dinheiro que não depende dela. Todo o resto do funil já era
por clique, como a OS media.

**Estado após o passo 1:** a loja sem IA **vende**. Restam os passos 2 (acabamento
de vitrine — abertura sem conversa, upsell por regra) e 3 (trava por plano no
servidor).

---

### Passo 2 — O que a tela precisa quando ninguém está conversando

Hoje o Garçom faz três trabalhos invisíveis que somem junto com ele. Sem
substituto, a loja fica muda:

1. **A abertura.** Quem recebia o cliente era a IA. Sem ela, a primeira tela precisa
   se explicar sozinha — categorias visíveis, mais vendidos em destaque, e o caminho
   para o carrinho óbvio.
2. **O empurrão para o checkout.** Carrinho cheio sem um botão gordo e permanente de
   "Finalizar pedido" é carrinho abandonado.
3. **O upsell.** A IA sugeria. Sem IA, o lugar disso é a tela: "quem pediu isso
   levou também", que é **regra e consulta, não inteligência** — e o dado de mais
   vendidos **já existe** (`menuBestSellers`).

Design é lei aqui: tokens do `DESIGN.md`, três estados obrigatórios
(carregando/vazio/erro), e conferência em **375 / 768 / 1280** com screenshot de
cada. A maioria compra pelo celular.

### Passo 3 — O interruptor precisa ser código, não texto de contrato

Hoje **o sistema não bloqueia nada por plano** — o campo existe e não trava. Se o
plano de entrada "não tem IA" só porque está escrito no site, **um restaurante do
plano barato vai usar a IA e nós vamos pagar a conta de token dele.**

Guardrail 4 desta casa: *prompt é aviso; código é trava.* Precisa de uma verificação
no servidor, na entrada da rota de IA, que **negue** quando o plano não inclui. E
negar tem que ser silencioso para o cliente final — ele não pode ver "seu
restaurante não pagou".

> Esta é a mesma trava que faltava para publicar preço com segurança. **Ela paga
> duas dívidas de uma vez.**

### Passo 4 — Só então, se o CEO quiser, o pedido na mesa (opção B)

Funil próprio: mesa → catálogo com preço de salão → carrinho → envia para a comanda.
Sem endereço, sem frete, sem pagamento online obrigatório. Reaproveita o carrinho do
passo 1–2; **não reaproveita** o funil de entrega.

---

## 5. O que isto trava agora, e é o motivo do P0

A **tabela de preços foi publicada hoje**. Se o plano de entrada aparece vendendo
"cardápio digital" e esse cardápio não recebe pedido, estamos vendendo como pronto
o que não está — **guardrail 7**, o mais caro de furar, porque quem descobre é o
cliente pagante.

Enquanto o passo 1 não fechar, **duas frases não podem ir para o site** com o plano
de entrada: qualquer promessa de *receber pedidos* e qualquer promessa de
*pagamento online*.

Quando fechar, o Diretor avisa o CEO com a evidência, e aí sim a linha entra.

---

## 6. Registro

- Aberta por: Diretor Geral do Cérebro · 02/08/2026
- Origem: o CEO percebeu que o plano sem IA fica sem superfície de venda
- Evidência medida: cabeçalho de `qr/[slug]/page.tsx`; 0 ocorrências de carrinho em
  `QRMenuClient.tsx`; funil declarado em `PedidoClient.tsx`; 39 `setStage` em
  handler de cliente; 2 de ~25 chamadas de rede indo à IA
- **Fechar esta OS** = passo 1 com evidência + passo 2 verificado nas três telas +
  passo 3 com teste que prove que a negação por plano funciona
