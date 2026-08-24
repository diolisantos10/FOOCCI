# ADR-001 — Conversa de prospect ganha persistência própria (e a doutrina será corrigida)

**Data:** 24/08/2026 · **Estado:** proposto, aguardando aceite do proprietário
**Fase:** 0 · **Afeta:** Fase 2 (Vendas e Receita)

## Contexto

`05-DADOS-APIS-E-PERMISSOES.md` instrui, na seção de WhatsApp e segurança:

> *"Reutilizar `FoocciSalesInbound`, `FoocciSalesChannel`, `LeadContactSafety` e `LeadParaSondagem`."*

A auditoria da Fase 0 encontrou os quatro nomes — em `src/services/foocci-sdr/`, como **módulos TypeScript**. Nenhum deles é um model do Prisma: uma busca por `FoocciSales` em `schema.prisma` devolve zero resultados.

A mesma doutrina, na seção de modelo de dados, já pedia `FoocciSalesConversation`, `FoocciSalesMessage`, `FoocciSalesHandoff`, `FoocciSalesTask` e `FoocciSalesAuditEvent` como "modelo aditivo sugerido". Os dois trechos não se contradizem — mas o verbo "reutilizar" faz parecer que existe uma base pronta de conversas, e não existe.

Hoje as conversas comerciais não têm onde morar. `Conversation` e `Message` pertencem ao restaurante, e o comando proíbe misturar prospect com cliente.

## Decisão

1. Criar a persistência de conversa comercial **do zero**, aditiva, com as fronteiras que a doutrina exige.
2. Reaproveitar como **lógica**, não como armazenamento, os quatro módulos existentes de `foocci-sdr` — canal, inbound, safety e sondagem passam a gravar nas novas tabelas em vez de viver só em memória e log.
3. Não tocar em `Conversation`, `Message` ou `Customer`.
4. Corrigir o texto do documento 05 para dizer "reutilizar a lógica de `src/services/foocci-sdr/`", eliminando a ambiguidade para quem ler depois.

## Alternativas descartadas

**Estender `Conversation` com um discriminador de prospect.** Reaproveitaria tabela e UI, mas quebra a fronteira explícita do comando ("conversas de prospects usam armazenamento comercial próprio e não tabelas dos restaurantes") e cria um caminho por onde PII de lead vaza para consultas de restaurante. Descartada.

**Guardar conversa comercial em JSON dentro de `SiteLead`.** Barato hoje, impossível de indexar, paginar ou auditar depois. Descartada.

## Consequências

- A Fase 2 tem mais trabalho de banco do que a doutrina sugeria. O plano de fases já reflete isso.
- Ganha-se `providerMessageId` único (idempotência), append-only e trilha por mensagem — que a implementação atual não tem.
- Fica um débito honesto: o histórico de conversas anterior a esta fase não existe em lugar nenhum e **não será inventado**.
