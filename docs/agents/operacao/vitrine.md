# Vitrine — operacao

> Curta e curada. Só o Diretor escreve aqui. O agente propõe na oficina.

---

## Adiar um envio que vai expirar é prometer o que não se cumpre

O motor de carrinho abandonado **adiava** o envio para quando a loja abrisse — e o
carrinho expira em 6h, antes disso. O resultado não era "manda mais tarde": era
**nunca manda**, sem erro, sem log, sem ninguém saber.

**Antes de adiar qualquer coisa, compare o adiamento com a validade do que está
sendo adiado.** Se o prazo vence primeiro, adiar é mentir — e a recusa honesta e
imediata é melhor em todos os aspectos.

Decisão do CEO que resolveu o caso (ver o corredor): loja fechada **não manda e não
guarda para depois**. Como a regra é avaliada **no momento do abandono**, os ~51
carrinhos represados nunca viram mensagem — a proteção contra enxurrada veio da
forma da regra, não de uma trava de data.

— promovido em 2026-08-05 pelo Diretor · origem: bloco do carrinho abandonado, PR #101

---

## O guard de preço do finalize é a única verdade de cobrança — e variante se precifica pela VARIANTE do banco

O `/api/pedido/[slug]/finalize` recalcula TODO preço no servidor a partir do
banco (anti-adulteração) — o `price` do payload do cliente nunca é confiado.
Três regras aprendidas quando o guard cobrava variante pelo preço do item base:

1. **Linha de variante cobra `resolveVariantPrice(item, variante, canal)`**, com
   a variante resolvida no banco (pertence ao item? disponível?) e falha fechada
   em 400. Nunca o preço do item base, nunca o preço do payload.
2. **Zod descarta campo desconhecido em silêncio.** O cliente já enviava
   `variantId`; o schema não o declarava, então o servidor "não via" — um bug
   invisível sem erro em lugar nenhum. Quando o servidor precisa de um dado que
   o cliente envia, a ausência no schema É o bug.
3. **Promoção não se aplica a linha de variante porque o CLIENTE não aplica.**
   O servidor espelha o que foi mostrado na tela — não inventa regra de preço.
   (Se um dia o produto quiser promoção em variante, muda-se nos dois lados.)

Todo caminho que recalcula preço precisa da mesma resolução — o
`WhatsAppCheckoutAdapter` tinha o mesmo furo (registrado em pendências).

— promovido em 2026-08-04 pelo Diretor · origem: oficina 04/08, bloco P1 do
preço de variante (E2E real na pizzaria-demo, branch
`claude/foocci-director-onboarding-lhindy`)

---

## Canal de cobrança = canal de EXIBIÇÃO — e falha de checkout no WhatsApp sempre responde

1. **Todo caminho de checkout precifica no canal que a TELA usou.** O `/pedido`
   e a conversa de WhatsApp exibem tudo em DELIVERY; retirada cobra DELIVERY
   (decisão do CEO 04/08: "cobra-se o que a tela mostrou"). Caminho novo de
   checkout? Primeira pergunta: "que canal a superfície exibe?" — e cobre nele.
2. **No checkout do WhatsApp, toda falha de validação carrega `replyText`.**
   Falha sem `replyText` morria como "pedido anotado" falso — o cliente recebia
   confirmação sem pedido criado. O `replyText` viaja pelo `blockedReply` e
   escala para atendente com resposta honesta.

— promovido em 2026-08-04 pelo Diretor · origem: oficina 04/08, bloco cobrança
2/2 (branch `claude/foocci-director-onboarding-lhindy`)
