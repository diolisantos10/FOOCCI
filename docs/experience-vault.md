# Cofre de Experiências (Experience Vault)

> "isso vai ser um insumo pra cada vez mais melhorar a comunicação dos agentes...
> pra ficar cada vez mais experiente sobre cada restaurante."

O cofre é um **arquivo protegido de conversas reais, sanitizado (sem PII)**, por
restaurante e por agente. Ele grava o que os clientes realmente perguntam e o que
cada IA respondeu, e devolve isso como **contexto de padrões** para deixar todas as
IAs cada vez mais "veteranas" sobre cada restaurante — **sem nunca virar fonte de
verdade** (isso continua sendo o snapshot/banco).

## As duas metades

| Metade | Arquivo | O que faz |
| --- | --- | --- |
| **Depósito** (grava) | `ExperienceVaultService.ts` → `ingestExperiences()` | Lê mensagens OUTBOUND de IA + a pergunta que as disparou, **sanitiza** (`sanitizeText`), deriva o agente e grava em `restaurant_experiences`. Idempotente. |
| **Consumo** (lê) | `ExperienceBriefService.ts` → `getExperienceBrief(restaurantId, agentId?)` | Agrega os últimos 30 dias, extrai os top-10 padrões e devolve um bloco de texto curto para o system prompt. Cache TTL 6h. Retorna `""` se houver menos de 15 registros. |

- **Ingestão diária:** `POST /api/cron/brain/ingest-experiences` (workflow `.github/workflows/brain-ingest-experiences.yml`, 06:40 UTC).
- **Insights / backfill / reset:** `GET|POST /api/admin/brain/vault`.
- **Disciplina:** SEM PII, idempotente (`unique(restaurantId, agentId, conversationId, sourceAt)`), best-effort, nunca envia nada, nunca toca runtime.

## Regra para TODO agente — atual e futuro

O cofre precisa cobrir **todos os agentes que existem e todo agente novo**. São
dois caminhos, e um deles é automático:

1. **Agente construído sobre o Brain (`reasonAsAgent`)** — herda o brief
   **automaticamente**. `BrainReasoner.reasonAsAgent` já injeta
   `getExperienceBrief(req.businessId)` no system prompt. Nada a fazer.

2. **Agente LLM standalone** (não passa pelo `reasonAsAgent`) — injete o brief
   **explicitamente**, uma linha, logo antes de montar o system prompt:

   ```ts
   import { getExperienceBrief } from "@/services/brain/experience/ExperienceBriefService";
   // ...
   const experienceBrief = await getExperienceBrief(restaurantId).catch(() => "");
   // ...anexe `experienceBrief` ao final do system prompt (depois da verdade/base).
   ```

   Já wired assim: **garçom** (`AIOrderService`), **CRM** (`MessageVariationService`).

3. **Ingestão de um agente novo** — mapeie o agente em `agentFor()` dentro de
   `ExperienceVaultService.ts` (por `channel`, `metadata.source` ou `contextType`).
   Sem isso ele cai em `"unknown"` e não é rotulado.

### Checklist ao criar um agente novo
- [ ] Passa pelo `reasonAsAgent`? Então o consumo já está garantido. Senão, injete `getExperienceBrief` (caminho 2).
- [ ] Adicione o mapeamento dele em `agentFor()` (caminho 3).
- [ ] O brief entra **depois** da fonte de verdade no prompt, e é rotulado como padrão/antecipação — **nunca** como fato.

## Por que é seguro (regressão verificada)

O brief é sempre subordinado à verdade: ele antecipa padrões, não afirma fatos. A
verificação de regressão (probe pelo caminho de decisão ao vivo) confirmou que, com
o brief restaurant-wide ligado, o Brain **manteve honestidade total** — negou
itens inexistentes ("não temos brigadeiro belga importado", "não aceitamos cheque"),
não inventou preços e **não empurrou** padrões populares do cofre onde o cliente não
pediu. O cofre otimiza a antecipação sem contaminar a fonte de verdade.
