# WhatsApp Live Learning — como o agente aprende com conversas reais

> Camada de **operação e aprendizado** do WhatsApp Agent em produção ativa.
> Lê conversas reais, transforma erros/oportunidades em **aprendizados claros**
> para um gestor aprovar, e nunca altera a produção sozinha.
> Branch: `claude/remove-legacy-runner-q8iXa`.

---

## 1. Visão geral

O WhatsApp já é canal de venda ativo. Esta camada faz três coisas:

1. **Lê** conversas reais recentes (últimas 24h / 3h) e classifica cada uma em
   linguagem de negócio.
2. **Transforma** cada erro/oportunidade em um **card de aprendizado** que um
   gestor de marketing/vendas entende (sem jargão técnico).
3. **Enfileira** os aprendizados para **aprovação humana**. Aprovar marca o
   aprendizado para a próxima rodada de treinamento — **não muda a produção
   automaticamente**.

Tudo é **read-only para produção**: nunca envia WhatsApp, nunca cria pedido/Pix,
nunca muda config/prompt do agente ao vivo. PII é mascarada.

---

## 2. Componentes

| Peça | Arquivo | Função |
|---|---|---|
| Classificação de conversa | `src/services/whatsapp/learning/conversationReview.ts` | `reviewConversation` → outcome + issues (puro) |
| Geração de card + dedup | `src/services/whatsapp/learning/learningAnalysis.ts` | `analyzeIssue`, `buildLearningQueue` (puro) |
| Rotina diária | `src/services/whatsapp/learning/liveLearningReview.ts` | `runLiveLearningReview` (lê DB, grava fila) |
| Monitor de saúde | `src/services/whatsapp/learning/liveMonitor.ts` | `getWhatsAppLiveMonitor` / `buildMonitorSnapshot` |
| Fila (aprovar/rejeitar) | `src/services/whatsapp/learning/WhatsAppLearningQueueService.ts` | `listLearnings`, `decideLearning` |
| Feed de conversas | `src/services/whatsapp/learning/conversationFeed.ts` | `listConversationReviews` |
| PII | `src/services/whatsapp/learning/pii.ts` | `maskPII` |

**Persistência:** a fila reutiliza a tabela `WaiterTrainingSuggestion`, isolada
por `agentSlug = "whatsapp-receptionist"` — **sem migração de schema**. Dedup via
a chave única `(agentSlug, sourceType, sourceId)` onde `sourceId = assinatura do
problema` (um card por tipo de problema).

---

## 3. Classificação de conversa (linguagem de negócio)

`ConversationOutcome`:

```
VENDA_CONCLUIDA · ATENDENTE_ASSUMIU · CLIENTE_ABANDONOU · ERRO_DE_RESPOSTA ·
ERRO_DE_PRODUTO · ERRO_DE_ENDERECO · ERRO_DE_PAGAMENTO · LOOP ·
PERGUNTA_NAO_RESPONDIDA · OPORTUNIDADE_DE_VENDA_PERDIDA · OK_SEM_ACAO
```

A detecção reutiliza os **mesmos detectores da produção** (`detectIntent`,
`classifyReplyText`, `looksLikeLooseAddress`, `isExplicitOrderMessage`) — então a
revisão nunca discorda do comportamento real. Erros detectados:

- pergunta de pagamento respondida com link → **ERRO_DE_PAGAMENTO**
- endereço do cliente respondido com a localização da loja → **ERRO_DE_ENDERECO**
- pedido explícito respondido com link → **ERRO_DE_RESPOSTA**
- dúvida de produto que virou handoff desnecessário → **ERRO_DE_PRODUTO**
- 2+ respostas idênticas seguidas da IA → **LOOP**
- pergunta no fim sem resposta → **PERGUNTA_NAO_RESPONDIDA**

---

## 4. Card de aprendizado

Cada erro vira um card (PART 2):

```
title · customerWanted · agentAnswered · problem · idealAnswer ·
learningRule · salesImpact · severity (P0/P1/P2) · suggestedAction
```

Exemplo (pagamento):

```
Título: Pergunta sobre pagamento virou link de cardápio
O que o cliente queria: saber a forma de pagamento.
O que a IA respondeu: o link do cardápio.
Problema: não respondeu a pergunta e criou atrito antes da venda.
Resposta ideal: "Sim, aceitamos Pix 😊 Quer fazer seu pedido agora?"
Aprendizado: responder a forma de pagamento primeiro e depois conduzir o pedido.
Impacto: reduz abandono e aumenta a chance de fechamento.
```

Os campos do card são **sempre em linguagem de negócio**; termos técnicos ficam
em `technicalDetails` (mostrados num "Detalhes técnicos" recolhido na tela).

---

## 5. Rotina diária

Workflow `whatsapp-live-learning-review.yml` (cron diário 09:00 UTC + manual).
Chama `POST /api/cron/whatsapp/live-learning-review` (Bearer `CRON_SECRET`):

```jsonc
{ "restaurantSlug": "sushi-cazza", "windowHours": 24, "dryRun": false }
```

- **dryRun=true** → análise completa, **nada gravado** (para diagnóstico seguro).
- **dryRun=false** → grava/atualiza a fila, **respeitando decisões humanas**:
  um aprendizado já `APPROVED`/`REJECTED` **não é ressuscitado**.
- Dedup: muitas conversas com o mesmo problema viram **1 card** com
  `occurrences = N` e até 5 ids de exemplo.

---

## 6. Aprovação (o que faz e o que NÃO faz)

Tela **Central de Aprendizado WhatsApp** → aba **Aprendizados pendentes**.
Botões por card: **Aprovar aprendizado**, **Rejeitar**, **Guardar para depois**.

- **Aprovar** (`APPROVE` → status `APPROVED`): este aprendizado entra na base de
  treinamento do WhatsApp Agent e será usado **na próxima rodada/versão de
  melhoria** do agente.
- **Rejeitar** (`REJECT` → `REJECTED`): descarta o aprendizado.
- **Guardar para depois** (`BACKLOG` → `BACKLOG`): tira da fila ativa sem decidir.

> **Aprovar NÃO altera a produção automaticamente.** `decideLearning` só muda
> `status` + `reviewedAt` + `reviewedBy`. Nenhum prompt, config, rota ou
> comportamento ao vivo é tocado. A aplicação em produção continua passando pelos
> gates existentes (Brain Director / treinamento), sempre com decisão humana.

API (dashboard, tenant-scoped):
- `GET  /api/whatsapp/learning?status=PENDING_REVIEW`
- `POST /api/whatsapp/learning/{id}` `{ "decision": "APPROVE|REJECT|BACKLOG" }`
- `GET  /api/whatsapp/learning/conversations?window=24`
- `GET  /api/whatsapp/learning/health?period=24h`

---

## 7. Monitoramento de erros

Aba **Saúde do WhatsApp** e endpoint admin
`GET /api/admin/whatsapp/live-monitor?restaurantSlug=sushi-cazza&period=24h`:
conversas, pedidos gerados, receita, conversa→pedido, handoffs, abandonos,
erros por categoria (+ top 5), aprendizados pendentes. Sem PII, sem envio.

---

## 8. Regras de segurança (invariantes)

Toda a camada garante e reporta:

```
noEvolution = true   (nunca chama Evolution)
noRealOrder = true   (nunca cria pedido)
noRealPix   = true   (nunca cria Pix)
noMessageSent = true (nunca envia mensagem)
```

- PII (telefone, CPF, número de rua, sequências longas) é mascarada antes de
  qualquer resumo/persistência/exibição.
- A rotina e o monitor são **read-only** para a produção; só escrevem na **fila**
  de aprendizados (que é interna e exige aprovação).
- O WhatsApp **continua ativo** o tempo todo — esta camada não pausa, não fecha
  allowlist, não remove RESTAURANT_WIDE e não desliga FULL_TEST.
