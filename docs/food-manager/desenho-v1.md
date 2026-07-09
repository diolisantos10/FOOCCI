# FOOD MANAGER — Desenho V1 (Pontapé Inicial)

> Documento de kickoff do produto **Food Manager**, o administrador de restaurante da família FOOCCI.
> Inspiração de esqueleto: **Saipos** (sistema brasileiro de gestão/POS para restaurantes).
> Status: rascunho aprovado em conversa — serve de blueprint para o início do desenvolvimento.

---

## 1. O que é o Food Manager

O **Food Manager** é um produto **independente** de gestão de restaurante (ERP/POS):
frente de caixa, gestor de pedidos, cozinha, mesas/comandas, estoque, financeiro e relatórios.

Ele é **diferente do FOOCCI Vendas** (o CRM + agente de IA no WhatsApp que já existe neste
repositório) e será **vendido separadamente**:

- O cliente pode assinar **só o Vendas**;
- **só o Food Manager**;
- ou **os dois** — e aí ganha a operação integrada de ponta a ponta.

## 2. Decisão de arquitetura: HUB DE CANAIS (não atrelado ao Vendas)

**Decisão do dono (09/07/2026):** o Food Manager não pode nascer amarrado ao Vendas.
Ele será preparado para receber pedidos de **qualquer canal** — iFood, 99Food, Keeta,
cardápio digital, balcão, mesas — e o **FOOCCI Vendas é apenas mais um canal**, integrado
pela mesma porta que os demais.

```
                         ┌──────────────────────────┐
   FOOCCI Vendas ───────▶│                          │
   iFood ───────────────▶│       FOOD MANAGER       │──▶ Cozinha (KDS / impressão)
   99Food ──────────────▶│    (hub da operação)     │──▶ Caixa / Financeiro
   Cardápio digital ────▶│                          │──▶ Estoque / Ficha técnica
   Balcão / Mesas ──────▶│   Gestor de Pedidos      │──▶ Relatórios
                         └──────────────────────────┘
```

Consequências práticas:

1. **Separado em todas as plataformas (decisão do dono, 09/07/2026).** Repositório
   GitHub próprio (`diolisantos10/food-manager`), projeto **Railway próprio** (deploy
   independente) e **banco de dados próprio**. Nada de acessar o banco do Vendas
   diretamente.
2. **Integração por API + webhooks, nunca por acoplamento.** O Vendas envia pedido ao
   Food Manager exatamente como já envia ao Saipos hoje (`SaiposIntegrationService`):
   `POST /orders` autenticado + webhooks de status na volta. Esse contrato já validado
   em produção vira o **modelo da API pública** do Food Manager.
3. **O Vendas continua funcionando sozinho** para quem não assina o Food Manager, e
   vice-versa.

### Contrato de integração (v0 — espelhado no padrão Saipos que já usamos)

| Direção | Mecanismo | Conteúdo |
|---|---|---|
| Canal → Food Manager | `POST /api/v1/orders` (token por loja/canal) | Pedido completo: itens, complementos, cliente, endereço, pagamento, taxa de entrega |
| Food Manager → Canal | Webhook | Status do pedido: `RECEBIDO → ACEITO → EM_PRODUCAO → PRONTO → SAIU_PARA_ENTREGA → CONCLUIDO / CANCELADO` |
| Canal → Food Manager | `GET /api/v1/menu` (fase 2) | Sincronização de cardápio — Food Manager como fonte da verdade |

## 3. Esqueleto de módulos (inspiração Saipos)

| # | Módulo | O que faz | Referência Saipos |
|---|---|---|---|
| 1 | **Gestor de Pedidos** | Central única de pedidos de todos os canais: aceitar, recusar, acompanhar, despachar | Gestor de Pedidos |
| 2 | **PDV (frente de caixa)** | Venda balcão, retirada e delivery digitado no caixa; teclado rápido por categoria | PDV |
| 3 | **Mesas & Comandas** | Mapa de mesas, abertura/transferência/junção de comanda, divisão de conta | Módulo de mesas |
| 4 | **Cozinha (KDS) + Impressão** | Painel de produção por praça (chapa, fritadeira, bar…) e/ou impressão de comanda por estação | KDS / impressoras |
| 5 | **Cardápio** | Produtos, variações, complementos, disponibilidade e preço **por canal** | Cadastro de produtos |
| 6 | **Estoque & Ficha Técnica** | Insumos, ficha técnica por produto, baixa automática na venda, CMV, alerta de estoque mínimo | Estoque/ficha técnica |
| 7 | **Caixa & Financeiro** | Abertura/fechamento de caixa, sangria/suprimento, contas a pagar/receber, fluxo de caixa | Financeiro |
| 8 | **Cadastros** | Clientes, fornecedores, funcionários com perfis de permissão | Cadastros |
| 9 | **Relatórios** | Vendas por canal/produto/hora, ticket médio, curva ABC, CMV, desempenho de entregadores | Relatórios |
| 10 | **Integrações** | iFood, 99Food, FOOCCI Vendas, futuros marketplaces; fiscal (NFC-e/SAT) em fase posterior | Integrações |

## 4. Stack proposta

Mesma base tecnológica do Vendas — para reaproveitar conhecimento, componentes de UI e
padrões já maduros — porém em app e banco próprios:

- **Next.js 14 + TypeScript + Prisma + PostgreSQL**
- Deploy: **Railway**
- Reaproveitar como *referência* (não cópia cega): `OrderService`, `PrintQueueService`,
  `ticketText` (formatação de comanda), modelos Prisma de `Order*`/`Menu*`/`Payment`,
  design system do dashboard.

## 5. Roteiro de fases

| Fase | Entrega | Observação |
|---|---|---|
| **F0 — Fundação** | Repo novo, auth multi-restaurante, layout base, cadastros (restaurante, usuários/permissões) | |
| **F1 — Cardápio + PDV balcão** | Cadastro de cardápio, venda no balcão, impressão de comanda | Primeiro valor vendável |
| **F2 — Gestor de Pedidos + canal FOOCCI Vendas** | API pública de pedidos + webhooks; Vendas passa a enviar pedido pro Food Manager (mesmo padrão da integração Saipos atual) | Primeiro canal integrado |
| **F3 — Mesas & Comandas + KDS** | Operação de salão e painel de cozinha | |
| **F4 — Estoque/Ficha técnica + Caixa/Financeiro** | CMV, baixa automática, fechamento de caixa | |
| **F5 — Marketplaces + Fiscal** | iFood, 99Food, Keeta; NFC-e/SAT | Exige credenciamento nos parceiros |

## 6. Próximos passos

1. Criar o repositório `food-manager` (aguardando OK do dono).
2. F0: bootstrap do projeto (Next.js + Prisma + auth) no repo novo.
3. Especificar em detalhe a API pública de pedidos (v1), usando o payload da integração
   Saipos do Vendas como ponto de partida.

---

*Este documento vive no repositório do FOOCCI Vendas apenas como registro do kickoff;
quando o repositório do Food Manager for criado, ele migra para lá.*
