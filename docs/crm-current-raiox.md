# CRM atual do Foocci — RAIO-X técnico-operacional

Diagnóstico **read-only** do CRM que já existe (o CRM **não** é um Department; o
único Department oficial é o Waiter). Nada foi alterado no runtime do CRM nesta
rodada — apenas mapeamento, diagnóstico e recomendação.

> ⚠️ Suspeita prática confirmada: a configuração de **quantidade de mensagens
> diárias** e de **campanhas recorrentes** é ambígua e tem armadilhas que fazem
> uma campanha enviar **menos do que o configurado** ou **competir** com outra.

---

## 1. Arquitetura atual

```
Settings globais (RestaurantCRMProfile.whatsAppSafetyConfig)
        │  dailyGlobalCap, cooldown, quietHours, weeklyCap, weekend
        ▼
Campanha (Campaign + scheduleConfig JSON) ──► CrmCampaignService.send (envio único)
        │                                       │
        │ recorrente                            ▼
        ▼                              ContactSafetyService.assertSendable (gate por cliente)
ScheduledCampaignRunnerService.runDueCampaigns ──► EvolutionClient.sendTextMessage
        ▲           ▲                                   │
        │           │                                   ▼
GitHub Actions cron (*/15)   In-process timer (10 min, prod)   CampaignExecution (log)
        │                                                   │
        ▼                                                   ▼
AutomationSchedulerService (REACTIVATION/BIRTHDAY/POST_ORDER, diário 11:00 UTC)
```

Dois agendadores rodam o **mesmo** runner: o **GitHub Actions** (`crm-cron.yml`,
a cada 15 min) e um **timer in-process** (`ScheduledCampaignScheduler`, a cada 10
min, só em produção). São idempotentes (dedupe + stuck-recovery), mas **somam
ticks** e tornam a vazão difícil de prever.

---

## 2. Modelos / tabelas (Prisma)

| Modelo | Papel | Campos-chave (CRM) |
| --- | --- | --- |
| **Campaign** | Campanha outbound | `status` (DRAFT/SCHEDULED/ACTIVE/SENDING/SENT/PAUSED/COMPLETED/CANCELLED), `scheduleConfig` JSON (`mode`, `weekdays`, `timeWindow`, **`dailyLimit`**, `endCondition`, `endDate`, `maxTotal`, `timezone`), `couponCode`, `promotionId`, totais |
| **CampaignExecution** | Log por destinatário | `status` (PENDING/SENT/DELIVERED/READ/FAILED), `sentAt`, `failedReason`, `converted`, `revenue`, `convertedOrderId` |
| **RestaurantCRMProfile** | Config global por restaurante | `whatsAppSafetyConfig` JSON (**`dailyGlobalCap`**=200, `customerCooldownHours`=24, `quietHours*`, `sendOnWeekends`, `maxPerWeekPerCustomer`=5, `randomDelay*`), `segmentConfig` |
| **CRMAutomation** | Fluxos automáticos | `trigger` (REACTIVATION/BIRTHDAY/POST_ORDER), `isEnabled`, `triggerAfterDays`, `scheduleConfig` |
| **CRMCustomAction** | Ação manual (rascunho) | `status` sempre DRAFT |
| **CRMActionLog** | Auditoria de ações CRM | `messageStyle`, `responded`, `converted`, `revenue`, `metadata` |
| **CustomerSegment** | Segmento salvo | `filters` JSON, `memberCount` |
| **Customer** | Cliente + enriquecimento | `hasOptedOut`/`optOutAt`, `crmContactable`, `contactStatus`, `tier`, `segment` |

**Migrations CRM principais:** `..._crm_campaign_v2`, `..._add_campaign_schedule_config`,
`..._add_campaign_status_recurring`, `..._add_crm_safety_config`, `..._add_segment_config`,
`..._customer_opt_out`, `..._add_campaign_coupon_link`.

---

## 3. Services

`src/services/crm/`:
- **CrmCampaignService** — cria campanha, resolve público por segmento, personaliza
  mensagem, **envio único** (manual) via Evolution com safety gates.
- **ScheduledCampaignRunnerService** — runner de recorrentes: `runDueCampaigns`,
  `runCampaignBatch`, `isCampaignDueNow`, `getNextRunAt`, `recoverStuckSendingCampaigns`.
- **ScheduledCampaignScheduler** — timer in-process (10 min, só produção) que chama o runner (backup do cron).
- **AutomationSchedulerService** — REACTIVATION/BIRTHDAY/POST_ORDER (diário).
- **ContactSafetyService** — gate unificado por cliente (opt-out, telefone, cooldown, weekly cap, dedupe 24h cross-campaign, dedupe same-campaign, quiet hours, weekend, cap global).
- **CampaignAttributionService** — COUPON_PROVEN / CAMPAIGN_COUPON / ASSISTED / NONE.
- **ReviewRequestService** — só rascunho (requer aprovação humana).
- `lib/crm-safety.ts` — `DEFAULT_SAFETY_CONFIG`, `getSafetyConfig`, `getTodayGlobalSendCount`.

---

## 4. APIs

**Campanhas (tenant `x-restaurant-id`):** `POST/GET /api/crm/campaigns`,
`GET/PATCH/DELETE /api/crm/campaigns/[id]`, `POST /api/crm/campaigns/[id]/send`
(envio único, retorna `422 {blocked, code: QUIET_HOURS|WEEKEND_BLOCK|DAILY_CAP}`).
**Automações:** `GET /api/crm/automations`, `PATCH /api/crm/automations/[trigger]`.
**Settings:** `GET/PATCH /api/settings/crm-safety`, `GET/PATCH /api/settings/crm-segments`.
**Público/clientes:** `GET /api/crm/customers`, `GET /api/crm/audience`,
`GET /api/crm/campaign-metrics`.
**Cron (Bearer CRON_SECRET):** `POST /api/cron/run-scheduled-campaigns`,
`POST /api/cron/execute-crm-automations`.
**Admin (ADMIN_SECRET):** `POST /api/admin/ai/crm-tests/run` (Test Center),
`GET /api/admin/diagnostics/crm-campaigns` (por que está/não-está “due”),
`GET /api/admin/diagnostics/crm-performance`.

---

## 5. UI

- `/(dashboard)/crm` (`CRMClient.tsx`): abas visão-geral, **campanhas** (lista/detalhe/envio),
  **automações**, clientes, programa, avaliações, configurações.
- `/(dashboard)/settings/crm`: **Safety** (cap global, cooldown, weekly, quiet hours, weekend, delay) + **Segmentação** (hot/warm/lost dias).
- `/admin/agentes/crm/testes`: Test Center (dry-run, quick/group/full).
- Form de campanha recorrente expõe: dias da semana, janela início/fim, **“Limite diário” (1–200, default 20)**, condição de término (audiência/data/máx total).

---

## 6. Configurações — global vs campanha

| Configuração | Onde fica | Quem usa | Regra atual | Problema/Risco |
| --- | --- | --- | --- | --- |
| **Cap diário global** | `RestaurantCRMProfile.whatsAppSafetyConfig.dailyGlobalCap` (default 200) | Runner + Automations (pré-batch) | `0` = ilimitado; `>0` = hard stop; janela **rolante de 24h** sobre `CampaignExecution.sentAt` | Compartilhado por **todas** as campanhas+automações: primeira a rodar consome o orçamento; concorrência pode **exceder** o cap dentro de um tick |
| **Limite diário por campanha** | `Campaign.scheduleConfig.dailyLimit` (default 20) | Runner (pré-batch) | Normalizado `max(1, min(x,200))` → **0 vira 1**; janela rolante 24h por campanha | UI diz “0 = ilimitado” no global, mas por-campanha **nunca** é ilimitado (mín. 1) → **semântica do 0 inconsistente** |
| **Batch por tick** | `limit` do cron (default **5**) | Runner (`runCampaignBatch`) | `batchCap = min(restanteDiário, limit)` por campanha por tick | `limit=5` é o **gargalo real** da vazão, não o `dailyLimit`. `dailyLimit` alto numa janela curta é **inalcançável** |
| **Cooldown por cliente** | `customerCooldownHours` (24) | ContactSafety (por mensagem) | bloqueia 2ª msg em 24h (exceto aniversário) | ok |
| **Máx/semana por cliente** | `maxPerWeekPerCustomer` (5) | ContactSafety | hard cap 7 dias | UI diz “0 = sem limite” |
| **Quiet hours / weekend** | safety config | send + runner | bloqueia janelas | ok |
| **Recorrência** | `scheduleConfig` JSON | runner | sem `nextRunAt` persistido; reavaliado a cada tick | depende do cron rodar de fato |

---

## 7. Limites diários — como funcionam de fato

1. **Global primeiro:** se `getTodayGlobalSendCount(restaurantId) >= dailyGlobalCap`,
   **toda** campanha do restaurante é pulada (“Cap global diário atingido”).
2. **Por campanha depois:** `dailyLimit` (default 20, clamp [1,200]); conta
   `CampaignExecution` da campanha com `sentAt` nas últimas 24h.
3. **Batch por tick:** `min(dailyLimit - jáEnviadoHoje, limitDoCron=5)`.
4. **Por cliente sempre:** cooldown 24h, máx 5/semana, dedupe 24h entre campanhas,
   dedupe vitalício na mesma campanha (aniversário isenta frequência).

> Consequência prática: uma campanha recorrente com `dailyLimit=100` mas janela
> de 1 hora e cron `*/15` envia **no máximo ~4 ticks × 5 = 20** mensagens —
> bem menos que 100. O operador configura 100 e recebe 20. **Esse é o cerne da
> confusão.**

---

## 8. Cron / scheduler / recorrência

- **GitHub Actions** `crm-cron.yml`: campanhas `*/15`, automações `0 11 * * *`,
  cart-recovery `*/5`. Bearer `CRON_SECRET`. Body `{dryRun:false, limit:5}`.
- **In-process** `ScheduledCampaignScheduler`: tick 10 min, **só produção**, backup.
- **Recorrência:** sem `nextRunAt` — `isCampaignDueNow` reavalia weekday + janela +
  fim (audiência/data/máx) a cada tick. Stuck-recovery reanima campanhas presas em SENDING.
- **Gotcha de infra:** Actions só registra workflow do **branch default**. Se
  `crm-cron.yml` não estiver no default real de produção, os envios agendados
  dependem **apenas** do timer in-process. O diagnóstico `crm-campaigns` já alerta sobre isso.

---

## 9. Fluxo real de envio (por etapa)

| Etapa | Status |
| --- | --- |
| Campanha ativa | ✅ implementado |
| Scheduler/cron | ✅ (duplo: Actions + in-process) |
| Seleção de público | ✅ (resolvido na execução p/ recorrente) |
| Limites/dedupe | ✅ (global + campanha + por-cliente) — porém **confuso** |
| Mensagem/template | ✅ personalização com variáveis |
| Cupom | ⚠️ parcial (link cupom↔campanha é “soft”: `couponCode` string + `promotionId`) |
| Envio WhatsApp (Evolution) | ✅ real; **dry-run** suportado em toda a stack |
| Log | ✅ `CampaignExecution` + `failedReason`; ⚠️ motivos de **skip** não persistidos |
| Resposta cliente | ⚠️ parcial (`totalResponded`, sem tracking robusto) |
| Pedido/cupom | ✅ atribuição por janela 7d + cupom |
| Atribuição | ⚠️ COUPON_PROVEN/ASSISTED ok; sem clique/abertura de link |
| Métrica | ⚠️ ver §10 |

---

## 10. Métricas

**Existentes:** enviados (`totalSent`), falhas (`totalFailed`), lidos (`totalRead`),
respostas (`totalResponded`), convertidos (`totalConverted`), receita
(`totalRevenue`), conversão/receita por execução, atribuição (cupom/assistida 7d),
métricas de cupom via `Order.promotionId/couponCode`.

**Ausentes / fracas:** clique/abertura de link; vínculo **canônico** cupom↔campanha
(hoje ambíguo entre `couponCode` e `promotionId`); métricas por **template**;
**cap consumido/restante** persistido; contagem de **“elegível mas pulado”** e o
**motivo do não-envio** (só transitam na resposta do cron, não ficam salvos);
diferença confiável entre entregue vs lido.

---

## 11. Test Center / Auditor

- **CrmAuditor** (`src/services/quality/auditors/CrmAuditor.ts`): **46 cenários** em
  7 grupos — contact_safety (9), segmentation (7), intelligence (6), action_center (5),
  message_variation (7), attribution (5), review_request (7). **100% dry-run, puro**,
  garante “nenhum envio/mutação” (`evaluateSendSafety`).
- **Cobre:** opt-out, telefone, cooldown, weekly cap, quiet hours, disponibilidade
  Evolution, segmentação, próxima ação, atribuição, elegibilidade de review.
- **NÃO cobre (ponto cego):** a **precedência de limite diário global vs campanha**,
  o **gargalo `limit:5`**, a **competição** entre campanhas pelo cap global, a
  **lógica de “due”** da recorrência, e o motivo de “campanha não disparou”. Ou
  seja, **o problema suspeito está fora do alcance do auditor atual.**

---

## 12. Riscos P0 / P1 / P2

### P0 (pode quebrar operação real / envio indevido)
- **Nenhum P0 confirmado** no fluxo de envio: opt-out é respeitado, dedupe existe,
  quiet hours/weekend existem, cron é protegido por `CRON_SECRET`, falhas são logadas.
- ⚠️ *A verificar com log de produção (não é possível afirmar P0 sem dados reais):*
  sob **alta concorrência** num único tick, várias campanhas leem o cap global
  **antes** de enviar e podem **exceder** o `dailyGlobalCap` por um tick (overrun
  limitado, não ilimitado). Tratar como **P1 forte**, elevar a P0 só se o log mostrar
  excesso relevante.

### P1 (importante — antes/durante operação)
- **Limite diário confuso:** `dailyLimit` (campanha) **não** controla a vazão real;
  quem controla é `limit:5` × frequência do cron × janela. Operador configura 100, recebe 20.
- **Cap global compartilhado sem prioridade:** uma campanha pode consumir os 200 e
  **starvar** as outras + as automações (que não têm limite próprio).
- **Semântica do `0` inconsistente:** global `0`=ilimitado; por-campanha `0`→1.
- **Dois agendadores** (Actions + in-process) somam ticks → vazão imprevisível;
  e dependência do **branch default** para o cron registrar.
- **Motivos de não-envio não persistidos:** “não disparou hoje” só aparece na
  resposta do cron, não fica auditável na campanha.
- **Atribuição/cupom fraca:** vínculo cupom↔campanha “soft”; sem clique de link.
- **“daily” = janela rolante de 24h**, não dia-calendário → contraintuitivo.

### P2 (melhorias)
- Métricas por template/segmento; UI mostrando público elegível, cap consumido e
  próximos envios; copy dos campos de limite; relatório de falhas recentes;
  segmentação avançada; unificar `contactStatus` vs `crmContactable` e
  `hasOptedOut` vs `optOutAt` (pares potencialmente redundantes).

---

## 13. Hipóteses para “mensagens diárias / campanhas recorrentes não disparam”

| Hipótese | Classificação |
| --- | --- |
| `dailyLimit` alto numa **janela curta** + cron `*/15` + `limit:5` → teto real ~20/tick-hora | **provável** |
| **Cap global (200)** já consumido por outra campanha/automação no dia | **provável** |
| Cron do GitHub **não registrado** no branch default → só timer in-process (e fora de produção, nada roda) | **provável** (precisa de log) |
| Campanha fora da **janela de horário/weekday** no momento do tick | **provável** |
| Público **vazio/elegibilidade**: sem telefone, `crmContactable=false`, opt-out, já-enviado (dedupe vitalício) | **possível** |
| `status` ≠ ACTIVE/SCHEDULED, ou `scheduleConfig.mode` ≠ RECURRING | **possível** |
| Cooldown 24h / weekly cap bloqueando os clientes | **possível** |
| `endCondition` (END_DATE/MAX_TOTAL) já atingida | **possível** |
| Evolution indisponível / erro de envio (logado como FAILED) | **precisa de log** |
| Campanha presa em SENDING (stuck) entre runs | **improvável** (há recovery) |
| Envio silenciado sem log | **improvável** (há `failedReason` + console) |

---

## 14. Recomendações (plano, sem implementar agora)

**Fase 1 — estabilizar configuração**
- Separar visualmente **cap global** (teto de segurança) de **ritmo da campanha**.
- Documentar precedência explícita: global → campanha → batch/tick → por-cliente.
- Padronizar semântica do `0` (ou proibir 0 com aviso claro).
- Renomear/explicar `dailyLimit` como “meta diária” e mostrar na UI o **teto real**
  estimado dado cron+janela.

**Fase 2 — estabilizar scheduler**
- **Persistir reason codes** de não-envio por campanha por dia (auditável na UI).
- Escolher **um** agendador como fonte da verdade (evitar Actions + in-process somando).
- Tornar o cap global **atômico** (transação/contador) para eliminar overrun sob concorrência; opcional: **prioridade/fairness** entre campanhas.
- “Cron health” visível (último run, due agora, próximos).

**Fase 3 — estabilizar métricas**
- Vínculo canônico cupom↔campanha; enviados/entregues/lidos/respostas/pedidos/receita
  por campanha **e** por template; cap consumido/restante.

**Fase 4 — melhorar UI**
- Tela de config simples; campanha mostrando público elegível, limite consumido/restante,
  próximos envios e falhas recentes; “por que não enviou hoje”.

**Auditoria:** evoluir o **CrmAuditor** (ou criar um diagnóstico cron-safe, nos
moldes do Waiter) que cubra precedência de limites, vazão real e “due-logic” —
hoje um ponto cego.

> Importante: **não** criar CRM Department / Simulation Lab / Library de CRM agora.
> Só evoluir a estrutura atual quando o modelo do Waiter Department se provar.
