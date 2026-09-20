# 90 — Pendências e lacunas

Este arquivo impede que vendedor, agente ou arquiteta preencha silêncio com uma resposta plausível.

## Resolvido nesta retomada

### Desconto além da tabela
**Resolvido:** não existe caminho atual para conceder desconto adicional. O único abatimento é 50% do primeiro mês, já embutido na primeira cobrança.

Fonte: `src/services/salaDeVendas/precos.ts` e `src/lib/billing/pricing.ts`.

### Quem fecha
**Resolvido:** o vendedor entrega o caminho; o cliente fecha no próprio checkout.

### Forma de pagamento da assinatura
**Resolvido:** cartão de crédito em assinatura recorrente Mercado Pago. Pix/boleto recorrente não são oferecidos no checkout atual.

---

## Ainda depende de decisão ou validação

### 1. Prazo de implantação
**Estado:** NÃO DEFINIDO.  
O site/material histórico usa linguagem ampla, mas a Sala de Vendas atual registra que não existe prazo prometível aprovado.

**Regra:** vendedor não inventa “24h”, “48h”, “esta semana” ou qualquer outro SLA.

### 2. Escopo acima do que os planos entregam
**Estado:** NÃO DEFINIDO.  
Quando um prospect pede volume/entrega fora da oferta, não existe preço/prazo/capacidade aprovada para solução sob medida.

### 3. Permuta/parceria fora do checkout
**Estado:** NÃO DEFINIDO.  
Não confundir com forma de pagamento. É uma decisão comercial fora do mecanismo normal de assinatura.

### 4. Uso de Sushi Cazza como case
**Estado:** AUTORIZAÇÃO NECESSÁRIA.  
O treinamento pode usar o restaurante como ambiente/piloto interno quando isso estiver autorizado; não publicar case, número ou depoimento sem autorização explícita.

### 5. Concorrentes por nome dentro do treinamento
**Estado:** DECIDIR POLÍTICA INTERNA.  
Battlecards podem começar por categoria de alternativa. Nome próprio só entra com fonte atual e autorização de uso no material interno.

### 6. Painel do lojista para demonstração
**Estado:** REVALIDAR.  
A Foocci Bakery prova a experiência do cliente final, mas o roteiro de demo precisa confirmar qual ambiente o vendedor pode abrir para mostrar pedidos, CRM, analytics e operação do lojista.

### 7. Pedido completo por texto no WhatsApp
**Estado:** REVALIDAR GATING ATUAL.  
O handoff tratava como piloto/allowlist. Não promover para “pronto” sem conferir o estado atual.

### 8. Impressão física
**Estado:** REVALIDAR EM CAMPO.  
O software tem mecanismos de fila/retry no material histórico; isso não autoriza afirmar que a impressão está “100% garantida” sem prova operacional atual.

### 9. Limites por plano
**Estado:** REVALIDAR.  
O handoff registrava divergência entre tetos publicados e bloqueio real do produto. Até auditoria atual, o vendedor repete somente o que a oferta pública autorizada diz e não inventa mecanismo técnico de bloqueio.

---

## Perguntas de CEO que continuam úteis

1. O Sushi Cazza pode ser citado nominalmente no treinamento? Quais números estão autorizados?
2. Concorrentes podem ser nomeados em battlecards internos?
3. Qual prazo de implantação, se algum, pode ser prometido?
4. Existe política para permuta/parceria?
5. Qual ambiente oficial de demonstração do painel do lojista deve ser usado?
6. Quem é o primeiro público humano da certificação: SDR, closer/consultor, ou ambos?

A ausência de resposta aqui não bloqueia a investigação. **Bloqueia apenas a criação de promessa.**
