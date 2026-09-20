# 01 — Raio-X Comercial V0

**Data:** 20/09/2026  
**Status:** BASELINE DE TRABALHO — ainda não é conteúdo final de aula.

## Conclusão de partida

A Foocci deve ser vendida como uma camada comercial e operacional para restaurantes: **canal próprio de venda + relacionamento/CRM + atendimento inteligente + gestão comercial**, conectados entre si.

O argumento forte não é “tem muitas funções”. É que um pedido pode virar histórico, relacionamento, recompra e inteligência sem o restaurante depender de quatro ferramentas desconectadas.

O reconhecimento anterior identificou quatro problemas centrais:

1. o restaurante vende, mas não constrói uma base própria de relacionamento;
2. o WhatsApp pode virar operação desorganizada;
3. o restaurante não sabe claramente quem deixou de comprar;
4. preço e margem podem ser definidos sem visão de CMV.

Esse enquadramento continua sendo a hipótese comercial principal, mas os módulos de produto abaixo ainda serão revalidados no código atual antes de virar aula.

---

## O que foi revalidado nesta retomada

### 1. A área Comercial existe fora do Admin — CONFIRMADO

A área de quem vende Foocci mora em `/comercial`, com autenticação e moldura próprias.

Evidência atual:
- `src/app/comercial/(area)/layout.tsx`
- `src/lib/sala/rotas.ts`

O próprio código registra a distinção: `/comercial` é para quem **vende** Foocci; não é a área do restaurante atendendo o próprio cliente.

### 2. O Comercial evoluiu depois do handoff — CONFIRMADO

O dossiê anterior descrevia a Sala de Vendas em estágio mais simples. O código atual já contém, entre outros, Painel/Torre, Prospecção, Base Fria, Hunter, SDR, Conversas/Central de Atendimento, Carteira/Funil/Qualificação, CRM, CRM IA, Follow-up automático, Oferta, Relacionamento, Supervisora, agentes, preços e métricas.

O comentário de `src/lib/sala/rotas.ts` registra que o menu havia chegado a 24 itens e, em 18/09/2026, foi reorganizado em **10 grupos** sem apagar as telas. Em 19/09/2026 também foi adicionada uma porta de **cadastro manual de lead** como fallback para falha de integração.

Impacto na University: o treinamento comercial não pode ensinar somente “produto Foocci”; ele também precisa ensinar **como o vendedor trabalha dentro do Comercial Foocci**.

### 3. Preço atual — CONFIRMADO

Fonte única:
`src/lib/billing/pricing.ts`

| Plano | Mensal | Trimestral | Anual |
|---|---:|---:|---:|
| Essencial | R$ 179 | R$ 483 | R$ 1.790 |
| Crescimento | R$ 429 | R$ 1.158 | R$ 4.290 |
| Performance | R$ 899 | R$ 2.427 | R$ 8.990 |

O trimestral já embute 10%. O anual já embute dois meses grátis.

**Único desconto:** 50% do primeiro mês para cliente novo, em qualquer plano/ciclo; o abatimento já é calculado pelo checkout. Não existe “preço fundador” no motor.

### 4. Fechamento e negociação — CONFIRMADO no Comercial atual

Fonte:
`src/services/salaDeVendas/precos.ts`

- vendedor pode informar a tabela pública;
- vendedor **não negocia valor fora da tabela**;
- quem fecha é o próprio cliente no checkout;
- forma de pagamento da assinatura: **cartão de crédito em recorrência Mercado Pago**;
- não há caminho atual de checkout para boleto ou Pix recorrente;
- desconto extra não é uma alçada escondida: **não existe mecanismo para concedê-lo**.

Permanecem em aberto:
- prazo prometível de implantação;
- escopo fora do que a tabela entrega;
- permuta/parceria fora do checkout.

---

## Baseline dos 14 domínios

A tabela abaixo indica o que a investigação anterior encontrou. “REVALIDAR” significa que há material forte e arquivos-pista, mas a University ainda não o tratará como fato final sem conferir o código atual.

| Domínio | Baseline herdado | Estado desta retomada |
|---|---|---|
| Canal de venda próprio | /pedido, /qr, white-label, preço/visibilidade por canal, horários, pausa, links rastreáveis | REVALIDAR |
| Operação do pedido | status, som, impressão, estações, retentativa, edição | REVALIDAR |
| Cardápio e produto | categorias, variantes, adicionais, importação, fotos, enriquecimento | REVALIDAR |
| CMV e precificação | custo, ficha técnica, markup, reprecificação, histórico | REVALIDAR |
| Pagamentos, entrega e fiscal | métodos, entrega por regra, NFC-e e terceiros | REVALIDAR |
| WhatsApp e canais | Meta, recepção, humano, personalidade, canais adicionais | REVALIDAR |
| CRM e relacionamento | base, segmentos, campanhas, cupons, fidelidade, segurança de contato | REVALIDAR |
| Garçom IA | sugestão, venda guiada e limites de verdade | REVALIDAR |
| Cérebro/verdade/qualidade | verificação, simulação e promoção de comportamento | REVALIDAR |
| Analytics e integrações | visão comercial, retenção, operação e integrações | REVALIDAR |
| Onboarding/ajuda/manual | implantação, ajuda e operação assistida | REVALIDAR |
| Segurança/LGPD | isolamento, segredo, papéis, portabilidade | REVALIDAR |
| Planos/cobrança/contrato/site | preço e checkout | **PARCIALMENTE REVALIDADO** |
| Infraestrutura comercial | área /comercial e ferramentas do time | **PARCIALMENTE REVALIDADO EM 20/09** |

---

## Promessas comerciais que NÃO entram como fato até revalidação

- “a impressão nunca falha”;
- “o pedido completo por texto no WhatsApp está liberado para todos”;
- “a IA nunca erra”;
- “o restaurante implanta em X dias”;
- “o plano bloqueia automaticamente quando passa do limite”;
- qualquer percentual garantido de migração do marketplace;
- qualquer percentual garantido de economia, aumento de venda ou recompra;
- qualquer comparação nominal com concorrente sem fonte atual;
- qualquer case ou número de cliente sem autorização.

---

## Tese comercial a ser testada no restante do trabalho

A conversa não deve começar por módulo. Deve começar pela operação do restaurante.

Exemplo:

**Pergunta:** “De cada 100 pedidos que você recebe hoje, quantos chegam por um canal em que você consegue identificar o cliente e falar com ele depois?”

A resposta abre quatro caminhos possíveis:
- dependência de canal;
- propriedade da base;
- CRM/recorrência;
- economia do pedido direto.

Só depois disso o vendedor decide o que demonstrar.

---

## Critério para promover este V0 a Raio-X oficial

Este arquivo deixa de ser “V0” somente quando:

1. os 14 domínios forem lidos no código atual;
2. cada funcionalidade tiver evidência;
3. duas lentes adversariais forem aplicadas:
   - **existe e está ligado?**
   - **a promessa é honesta?**
4. divergências com site/documentos forem registradas;
5. itens de piloto, terceiro e desligado por padrão estiverem separados de “pronto”.

Até lá, este documento é um mapa de trabalho — não um roteiro para vendedor decorar.
