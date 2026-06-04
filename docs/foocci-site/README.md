# Foocci — Documentação do Site Público

> Arquitetura oficial do site comercial da Foocci.
> Versão 1 · 2026-06-04 · Branch de trabalho: `claude/remove-legacy-runner-q8iXa`

Esta pasta concentra as decisões de arquitetura, backlog, roadmap e copy do
**site público de marketing** da Foocci. Ela **não** documenta o produto interno
(dashboard, CRM, agente de IA, pedido/QR) — apenas a vitrine comercial.

## Posicionamento oficial

> **Foocci é um sistema inteligente de vendas, relacionamento e fidelização para restaurantes.**

A Foocci **não** é chatbot, ferramenta genérica de IA, dashboard SaaS frio, ERP,
marketplace nem automação genérica de WhatsApp.

## Status atual

| Item | Estado |
|---|---|
| Rota | **`/site`** (isolada, pública, indexável) |
| Home V1 | ✅ Implementada (commit `c9ffa4a`) |
| Produto tocado | ❌ Nenhum fluxo de produto alterado |
| Assets reais (logo/favicon) | ❌ Pendentes — wordmark em texto como fallback |
| WhatsApp de vendas / backend de leads | ❌ Não configurados (sem fakes) |

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [`site-map-v1.md`](./site-map-v1.md) | Papel estratégico + mapa do site V1 → V4 |
| [`backlog-v1.md`](./backlog-v1.md) | Backlog priorizado (P0–P3) com critérios de aceite |
| [`implementation-roadmap-v1.md`](./implementation-roadmap-v1.md) | Roadmap em 6 fases, com riscos e validação |
| [`copy-decisions-v1.md`](./copy-decisions-v1.md) | Posicionamento, CTAs, palavras a usar/evitar, claims com cautela |

## Princípios inegociáveis

1. **Isolamento total** do produto: o site nunca altera pedido, QR, admin,
   dashboard, CRM, WhatsApp, checkout, API ou banco.
2. **Sem fakes**: nada de preços, métricas, depoimentos, logos de clientes ou
   integrações inventadas.
3. **Honestidade de capacidade**: o site comunica o que a Foocci faz, sem
   superpromessa (ver `copy-decisions-v1.md` → claims com cautela).
4. **Premium e humano**: minimalismo com hospitalidade — ~90% neutro + laranja
   `#F97316` apenas em CTA/destaques.
