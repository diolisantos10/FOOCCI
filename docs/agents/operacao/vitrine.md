# Vitrine — operacao

> Curta e curada. Só o Diretor escreve aqui. O agente propõe na oficina.

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
