# CRM FOUNDATION AUDIT

> Auditoria completa da fundação do CRM Foocci — Fase 0 do workstream "HEAD de CRM".
> Data: 2026-07-09 · Branch: `claude/remove-legacy-runner-q8iXa` · Somente leitura (nenhuma mudança de comportamento foi feita para produzir este documento).
>
> Fontes: 4 varreduras paralelas do código (modelo de cliente/import, campanhas/atribuição/cupons, CRM Agent/segmentação/UI, provedores/observabilidade) + trabalho recente desta sessão (orçamento de segurança, renderizador canônico, reprocessamento).

---

## 1. Current CRM modules found

**Páginas/abas visíveis** (`src/app/(dashboard)/crm/CRMClient.tsx:5878-5886`): Visão Geral, Campanhas, Conversões, Clientes, Programa de Relacionamento, Avaliações, Configurações.

**Aba oculta mas ativa**: Automações (`?tab=automacoes`) — removida da navegação (`CRMClient.tsx:5875-5877`), backend continua rodando via cron.

**Fora do CRM**: `/settings/marketing` (orçamento de envio WhatsApp), `/integracoes/whatsapp` (Evolution + card Meta), `/marca` e `/settings/store` (links de avaliação), Admin → Agents (perfil do CRM Agent), Central de Conversas (Atendimento).

**Serviços principais** (`src/services/crm/`): ScheduledCampaignRunnerService (runner + orquestração de orçamento), CrmCampaignService (envio manual + personalização), AutomationSchedulerService, CRMWhatsAppBudgetPlanner, renderCrmMessage, crmExecutionClassification, recoverableReprocessPlan, ContactSafetyService, CrmAudienceService, CustomerSegmentService, CustomerMetricsSyncService, CRMAttributionService + CampaignAttributionService, CampaignCouponMetricsService, ReviewRequestService + ReviewRequestSendService, CrmActionCenterService, AdaptiveCRMService, CustomerIntelligenceSnapshotService, MessageVariationService, CrmAgentProfile, ImportService/UniversalFieldMapper/SaiposNemoImportService, CRMPreflightDiagnosisService, RelationshipProgramService.

---

## 2. Customer data model

**Existe** (`prisma/schema.prisma:150-198`):
- Identidade: id, restaurantId, name, `phone?` (E.164/GUEST-uuid/null), email, birthDate, `document` (CPF **ou** CNPJ num campo só), isGuest, importExternalId, sourceSystem. Único: `@@unique([phone, restaurantId])`.
- Contactabilidade/LGPD: hasOptedOut, optOutAt, crmContactable, `contactStatus` (CONTACTABLE|SEM_TELEFONE|TELEFONE_INVALIDO|OPT_OUT|NEEDS_REVIEW).
- Histórico: totalOrders, totalSpend, lastOrderAt + importedOrderCount/importedTotalSpent/importedLastOrderAt, averageTicket (só import), financialBalance.
- Relacionamento: `tier` (BRONZE|PRATA|OURO|DIAMANTE), `segment` (QUENTE|MORNO|FRIO|PERDIDO|SEM_PEDIDOS).
- Endereço: modelo `Address` separado (`:200-221`). Preferências: modelo `CustomerPreference` (dietary[], allergies[], favoriteDish, notes).
- Enriquecimento: dataEnrichmentStatus, dataCompletenessScore, lastEnrichmentAt.

**Falta**: firstOrderAt; averageTicket nativo; flag VIP explícita (derivada de tier OURO/DIAMANTE em `CrmAudienceService.ts:238`); campo de risco/churn; favoriteProducts no cliente; flags operacionais de duplicata/merge-confidence (não existem em lugar nenhum); optOutReason.

**Regra do "último pedido efetivo"**: implementada e consistente nos caminhos principais — `CustomerSegmentService.resolveCustomerSegment` (`:102-118`), `CrmAudienceService.effectiveLastOrderBefore/Between` (`:104-126`), snapshot (`:414-415`), SQL com COALESCE no overview. **Risco real**: o `segment`/`tier` **persistidos** só ficam "efetivos" quando `CustomerMetricsSyncService.rebuildCustomerMetrics` roda (evento de pedido). O import de CSV/Saipos **não chama o classificador** → cliente importado fica `SEM_PEDIDOS`/`BRONZE` na coluna até pedir de novo. Qualquer tela que leia a coluna direto classifica errado.

---

## 3. Campaign data model

**Existe** (`prisma/schema.prisma:749-794`): name, message, objective (string livre), channel, targetSegment, templateId, scheduledAt/sentAt, `status` (`CampaignStatus`: DRAFT|SCHEDULED|ACTIVE|SENDING|SENT|PAUSED|COMPLETED|CANCELLED), `couponCode` + `promotionId` (links suaves, sem FK), scheduleConfig Json, audienceConfig Json, campaignFamilyKey, messageFingerprint, dedupePolicy, lastRunAt, totais (totalAudience/Sent/Failed/Read/Responded/Converted/Revenue).

`CampaignExecution` (`:827-851`): status (`ExecutionStatus` com BLOCKED e SKIPPED distintos de FAILED — `:864-875`), converted/convertedAt/revenue/convertedOrderId, failedReason/errorMessage.

**Parcial**: `priority` vive dentro do `scheduleConfig` Json (setado pela UI em `CRMClient.tsx:865,938`), não é coluna. `messageFingerprint` declarado mas a UI de criação não envia (`:920-930`). `promotionId` nunca é escrito pela UI (só `couponCode`). Não existem estados "aguardando orçamento/ciclo/conexão" no enum — hoje são só `reason` textual no resultado do ciclo.

---

## 4. Automation data model

**Existe** (`prisma/schema.prisma:1863-1882`): `CRMAutomation` — trigger (REACTIVATION|BIRTHDAY|POST_ORDER), isEnabled, messageTemplate, triggerAfterDays, oncePerCustomerLifetime, discountType/discountValue, scheduleConfig `{sendTime, sendDays, timezone}`. Um registro por trigger (`@@unique`).

Runner: `AutomationSchedulerService` — respeita sendDays, quiet hours, cap global; despacha criando uma Campaign `auto:<TRIGGER>` e enviando via `CrmCampaignService.send`. Cron: `/api/cron/execute-crm-automations` (diário 11:00 UTC via GitHub Actions).

**Problemas**:
- **UI removida da navegação, backend rodando** — só acessível via `?tab=automacoes`. Isso já causou incidente real em produção (mensagem pós-venda duplicada: automação oculta + campanha ativa enviando juntas).
- `scheduleConfig.sendTime` **não é aplicado** (`AutomationSchedulerService.ts:95-102` — só sendDays); a hora de envio é a hora do cron.
- discountType/discountValue armazenados mas não usados no despacho.
- POST_ORDER depende exclusivamente de status DELIVERED.

---

## 5. WhatsApp sending architecture

**Abstração de provedor** (`src/services/whatsapp/providers/types.ts:67-80`): interface `WhatsAppProvider` (sendText, sendTemplate?, sendMedia?, getConnectionStatus, healthCheck, validateWebhook?, normalizeIncomingWebhook?). `MetaWhatsAppCloudProvider` implementa tudo; `EvolutionWhatsAppProvider` implementa parcial (sem sendTemplate/webhook — inbound Evolution vive no legado `WebhookProcessorService`).

**Achado central**: os caminhos de envio do CRM **não usam a abstração** — chamam `EvolutionClient.sendTextMessage` direto, com Meta acoplada via `metaCrmSend.ts` (gate `metaCrmEnabled && connectionStatus==="CONNECTED"`, fallback para Evolution em falha). Locais: `CrmCampaignService.ts:608-635`, `ScheduledCampaignRunnerService.ts:1201-1228`.

**Meta Cloud (estado)**: flag global `META_WHATSAPP_ENABLED` (dark por padrão) + por restaurante (`MetaWhatsAppConfig`: phoneNumberId, wabaId, token cifrado, qualityRating, messagingLimit). Templates espelhados da Meta (`MetaMessageTemplate` + `MetaTemplateService.syncFromMeta`) — **sem criação/submissão** de template pela Foocci. Embedded Signup pronto (`MetaProviderCard.tsx`). Webhook Meta com verificação de assinatura fail-closed.

**Lacunas críticas do lado Meta**:
1. `metaSendPolicy.decideMetaSend` (janela 24h → FREEFORM/TEMPLATE/bloqueio) existe, tem testes, **mas não está ligado ao envio CRM** — `metaCrmSend` resolve template ou cai em freeform sem consultar a política.
2. Webhook Meta **não aplica a guarda de contexto CRM** (`shouldAiRespond`/CRM_CONTEXT) — resposta de cliente a campanha via Meta seria respondida pela IA, diferente do caminho Evolution (`webhooks/meta/whatsapp/route.ts:120-124` vs `WebhookProcessorService.ts:276-281`).
3. Webhook Meta **não captura opt-out** (`applyInboundOptOut` só roda no webhook Evolution).

**Orçamento de segurança** (implementado nesta sessão, produção): `crmWhatsAppSafety` em `whatsAppSafetyConfig` — enabled, providerMode, globalDailyLimit (50), globalCycleLimit (5), minMinutesBetweenCycles (10, aplicado), distributionMode EQUAL/PRIORITY/MANUAL (todos funcionais), stopOnInstanceDisconnected, circuit breaker (taxa de falha + falhas consecutivas). Planner puro (`CRMWhatsAppBudgetPlanner`), ciclo sequencial com redistribuição de slots, reprocess respeita o orçamento.

**Crons**: GitHub Actions `crm-cron.yml` (campanhas */15min, automações diário, cart-recovery */5min; Bearer CRON_SECRET) + scheduler in-process de 10min (`ScheduledCampaignScheduler`, produção-only). **Sobreposição dupla** documentada e mitigada por idempotência, não eliminada. Atenção: `on: schedule` do GitHub só dispara da branch default.

---

## 6. Existing CRM Agent behavior

- **Constituição** pronta (`CrmAgentProfile.ts` — papel, missão, piso de segurança, tom) mas **dormant no runtime**: `isRuntimeEnabled=false` (seed `defaultAgentProfiles.ts:217`), teste trava isso.
- **Única chamada LLM em todo o CRM**: `MessageVariationService.generatePreview` (`:514`) — botão "✨ Gerar mensagem com IA" nos cards de oportunidade. Usa **OpenAI gpt-4o-mini** (não Anthropic), gated em `OPENAI_API_KEY`, fallback determinístico, sempre `requiresApproval:true`. **Nenhum LLM no fluxo de envio** — envio renderiza via `renderCrmMessage` determinístico.
- **ActionCenter** (`CrmActionCenterService`): vivo, determinístico, 11 tipos de oportunidade ranqueados, read-only.
- **AdaptiveCRM** ("cérebro adaptativo" de estilos): matemática pronta, mas o loop de envio aparentemente não alimenta `CRMActionLog` com outcomes → pesos computados sobre dados vazios.
- **Snapshot de inteligência do cliente**: determinístico, "no invented facts", alimenta o prompt do preview.

---

## 7. Current UI/UX issues

1. **Aba Automações oculta mas ativa** (risco operacional real, já causou incidente).
2. **Rotas mortas**: botões do ProgramaTab e ações por nível apontam para `?tab=acoes` que não existe (`ProgramaTab.tsx:500,728`) — caem na Visão Geral.
3. **Dados falsos**: aba Avaliações renderiza `MOCK_REVIEWS` hardcoded (`CRMClient.tsx:4669`) que parecem reais — viola "never fake data".
4. **Configurações espalhadas em 4 lugares**: Configurações do CRM (segmentação, safety básico), `/settings/marketing` (orçamento — mesma API, campos diferentes!), ProgramaTab (tiers), `/marca`+`/settings/store` (links de avaliação).
5. **Legendas de KPI hardcoded** (30/60/120 dias) na Visão Geral, ignorando limiares customizados (`OverviewTab.tsx:890-892`); card "Perdidos" clica para filtro "frio".
6. **Nomes de campanha fracos**: fallback "Campanha sem nome — DD/MM HH:MM" acumula lixo de baixa legibilidade.
7. **Jargão técnico no copy do dono**: "fingerprint", "governança", "cap", "opt-out", "Evolution" em telas não-diagnósticas.
8. **Dois sistemas de rótulo de tier** (PRATA/OURO vs SILVER/GOLD na constituição do agente).
9. `CRMClient.tsx` com ~6.000 linhas — monólito de UI difícil de evoluir com segurança.

---

## 8. Current safety rules

Pilha completa e majoritariamente **production-ready**:
- **Por cliente** (`ContactSafetyService`): opt-out inviolável (primeira porta, NEVER_RETRY), cooldown 24h, cap semanal por cliente, dedupe cross-campanha 24h, exceção de aniversário (bypassa frequência, nunca opt-out/telefone/cap global).
- **Global**: dailyGlobalCap (legado, 200) + **orçamento novo** (50/dia, 5/ciclo compartilhado, intervalo mínimo, distribuição justa/prioridade/manual, breaker de falhas, stop se instância cair). Quiet hours + fim de semana + timezone.
- **Renderização**: renderizador canônico único (preview = envio, `{nome}`/`{{nome}}`, links preservados, variáveis desconhecidas sinalizadas).
- **Reprocesso**: plano server-side, dedupe, revalidação de cadastro, gate de instância open, cap min(5, ciclo, diário restante), confirmação explícita, abort em colapso de instância.
- **Classificação**: skips/blocks nunca contam como falha; erros de sessão Evolution mascarados como HTTP 400 reclassificados como transientes.
- **Opt-out por palavra-chave**: detecção em inbound Evolution (`ContactSafetyService.ts:282-326`), silencioso, idempotente. **Lacuna**: não roda no webhook Meta nem Instagram; sem fluxo de re-opt-in.

---

## 9. Current attribution model

**Dois sistemas desconectados**:
- **Escrita** — `CRMAttributionService.attributeOrderToRecentCrmAction`: janela de 7 dias antes do pedido, escada de prioridade (ação respondida > ação > execução READ > SENT/DELIVERED), grava `converted/revenue` na execução e incrementa `Campaign.totalConverted/totalRevenue`. Disparado fire-and-forget no sync de pedido (`CustomerMetricsSyncService.ts:158-166`) — **não é cron; pedido que não passa pelo sync nunca é atribuído; sem backfill**. É atribuição **assistida** (tempo), ignora cupom.
- **Leitura** — `CampaignAttributionService.getAttribution`: classifica qualidade (COUPON_PROVEN/CAMPAIGN_COUPON/ASSISTED/NONE), liga pedidos com cupom à campanha via `couponCode`/`promotionId`, exclui cancelados/não pagos. **Nunca grava de volta** — `Campaign.totalRevenue` só reflete o assistido.

---

## 10. Current coupon/promotion metric model

- **Não existe modelo `Coupon` nem ledger `CouponUsage`** — cupom é faceta de `Promotion` (`schema:1808-1851`, usedCount desnormalizado com risco de drift).
- Métricas calculadas ao vivo em `CampaignCouponMetricsService` (`:135-243`): orderCount (fonte da verdade), revenue, discount, ticket médio, clientes únicos. **Exclusão correta** de cancelados e Pix não pago (`VALID_ORDER_STATUSES`/payment PAID|PAY_ON_DELIVERY|PAY_ON_PICKUP).
- **Conflito**: `CampaignCouponMetricsService` declara vínculo campanha↔cupom "unavailable" (`:294`) — **desatualizado** desde que o schema ganhou `couponCode`/`promotionId` e o `CampaignAttributionService` passou a usá-los. Dois serviços com premissas contraditórias.
- `conversion` por cupom sempre `null` (sem denominador).

---

## 11. Current import/merge/dedupe model

**Import**: pipeline forte de mapeamento (auto-detect com aliases fuzzy, templates de mapeamento persistidos) e normalização (telefone, nome, datas BR, dinheiro BR, e-mail). Dedupe intra-arquivo + por telefone no banco, merge "preenche vazio" (nunca sobrescreve dado bom com import). `ImportJob` rastreia lotes — **mas o caminho de CSV de clientes (`ImportService.process`) não cria ImportJob**. **Sem rollback de import** (nenhum caminho de desfazer).

**Merge/"Super Match"**: **não existe**. Único match é telefone exato (constraint + skipDuplicates). Sem match por CPF/e-mail/nome+endereço, sem score de confiança, sem preview de merge, sem operação de fusão de clientes.

**Divergência de normalizadores**: 3 normalizadores de telefone independentes (`crm/normalizePhone` Evolution-only 55…, `ImportService.normalizePhone` +E.164 internacional, `lib/phone.ts`).

**Higiene**: painel "Saúde da base" (contactáveis/sem e-mail/não contactáveis) + limpeza bulk permanente (preserva quem tem histórico) + transparência de exclusões por segmento. **Sem tela de revisão** por registro (inválidos/duplicatas/NEEDS_REVIEW); `TELEFONE_INVALIDO` definido no enum mas nenhum código o escreve. Sem telefone = inelegível/skip, **nunca falha** (correto).

---

## 12. Current bugs and risks

**P0 (ativos)**
1. **Automações invisíveis rodando** — dono não vê nem gerencia; incidente real de duplicação já ocorreu. Precisa decisão de produto: reintegrar UI ou migrar/desligar de vez.

**P0 (latentes — explodem quando Meta ligar)**
2. Webhook Meta **sem guarda CRM_CONTEXT** → IA responderia respostas de campanha.
3. Webhook Meta **sem captura de opt-out** → LGPD/risco de bloqueio.
4. `metaSendPolicy` (janela 24h/template) **não ligado** ao envio CRM → risco de freeform fora da janela (violação de política Meta).

**P1**
5. `CampaignExecution` nunca vira DELIVERED; READ só via resposta do cliente — telemetria de entrega por destinatário não existe (webhooks atualizam só `Message`).
6. Import não classifica segment/tier persistidos → importados presos em SEM_PEDIDOS/BRONZE nas colunas.
7. Scheduler duplo (in-process 10min + GH Actions 15min) — mitigado por idempotência, não eliminado; histórico de ciclo é in-memory (perde no restart).
8. Atribuição sem backfill; pedidos fora do sync nunca atribuídos.
9. Opt-out só no canal Evolution.

**P2**
10. MOCK_REVIEWS falsos na aba Avaliações. 11. Rotas mortas `?tab=acoes`. 12. `sendTime` de automação ignorado. 13. Import de clientes sem ImportJob/rollback. 14. `messageFingerprint`/`promotionId` não escritos pela UI. 15. Legendas de KPI hardcoded. 16. Sem rastreio de clique em avaliação (mostrado honestamente como ausente — ok manter, documentar).

---

## 13. What is production-ready

- Pilha de segurança de envio completa (por cliente + global + orçamento + breaker + reprocesso) — testada (819+ testes CRM verdes no total da suíte).
- Renderizador canônico de mensagens (preview = envio).
- Classificação de falhas/skips e diagnóstico de campanha (funil de elegibilidade).
- Runner de campanhas recorrentes com orquestração de orçamento.
- Segmentação configurável (Quente/Morno/Frio/Perdido) + tiers configuráveis + Programa de Relacionamento.
- ActionCenter (oportunidades determinísticas) e Visão Geral.
- Import: mapeamento universal + normalização BR.
- Review request com aprovação humana (fluxo manual seguro).
- Central de Conversas: rótulos "Campanha/Automação enviada", guarda anti-IA em resposta de CRM (canal Evolution).
- Embedded Signup + webhook Meta (infra), dark.

## 14. What is partial

- Meta Cloud: infra pronta, política de template não ligada, guarda/opt-out ausentes no webhook, sem submissão de template.
- Atribuição: duas metades não reconciliadas.
- Métricas de cupom: dois serviços com premissas conflitantes.
- Automações: backend ok, sem UI, sendTime ignorado, campos de desconto órfãos.
- CRM Agent: constituição + preview OpenAI; dormant no resto; AdaptiveCRM sem dados.
- Higiene de dados: painel resumo sim, fila de revisão não.
- Aba Avaliações: placeholder com mocks.

## 15. What should be rebuilt

1. **Adoção da abstração de provedor nos senders do CRM** (hoje Evolution direto + Meta acoplada) — pré-requisito da Fase 6.
2. **Unificação das configurações** num só lar (CRM → Configurações) — hoje 4 lugares, 2 telas editando a mesma API com campos diferentes.
3. **Unificação da atribuição** (assistida + cupom num modelo só, com write-back e backfill).
4. **Governança de automações** (decisão: reintegrar UI vs migrar para campanhas recorrentes e aposentar o runner legado — não deixar como está).
5. **Merge de clientes / Super Match** (construir do zero: match multi-chave + confiança + preview).
6. **Log persistente de ciclo** (tabela de run history: quais campanhas, alocações, skips por ciclo).
7. **Join de status de entrega** (webhook → CampaignExecution via externalMessageId).
8. **Quebra do monólito CRMClient.tsx** (6k linhas) em módulos por aba — oportunista, junto das fases.

## 16. Recommended implementation phases

Mapeando as fases do master prompt para a realidade encontrada:

- **FASE 0 — Estabilização** · *quase concluída nesta sessão*. Restam os P0: (a) decisão + execução da governança de automações (incidente real); (b) paridade do webhook Meta (guarda CRM + opt-out) — barato agora, caro depois.
- **FASE 1 — Fundação core** · classificar segment/tier no import; unificar configurações; ImportJob + nome obrigatório de campanha; corrigir rotas mortas e legendas de KPI; remover mocks da aba Avaliações (estado vazio honesto).
- **FASE 2 — Segurança WhatsApp** · ✅ **entregue** (orçamento, ciclo, distribuição, breaker, reprocesso, intervalo). Complemento: log persistente de ciclo.
- **FASE 3 — Integridade de mensagem** · ✅ **entregue** (renderizador, preview=envio, links, rótulos na Central). Complemento: ligar `metaSendPolicy` no envio CRM.
- **FASE 4 — Métricas e atribuição** · unificar atribuição (write-back de cupom + backfill), join de DELIVERED/READ nas execuções, reconciliar serviços de cupom, métricas de review honestas.
- **FASE 5 — Inteligência do CRM Agent** · ligar o loop do AdaptiveCRM (alimentar CRMActionLog no envio), anti-repetição via ledger, avaliar migração do preview de OpenAI→Anthropic, scoring de oportunidades.
- **FASE 6 — Meta Cloud API** · adotar abstração de provedor nos senders, ligar política 24h/template, submissão de templates, UX de conexão, caminho de migração Evolution→Meta por restaurante.
- **FASE 7 — Higiene e Super Match** · fila de revisão de dados, merge multi-chave com confiança, rollback de import, unificar normalizadores de telefone.

**Próximo passo recomendado**: Fase 0 restante — (1) governança de automações e (2) paridade do webhook Meta. Ambos pequenos, ambos evitam incidentes; depois Fase 1.
