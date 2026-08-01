# HANDOFF — CRM & Dashboard (Foocci)

> Documento de transferência de sessão. Foco: trabalho de CRM/dashboard.
> Repositório: **diolisantos10/FOOCCI** (público). Branch deste commit:
> **`claude/gifted-sagan-FVm1u`** (recomeçada do topo da default
> `claude/remove-legacy-runner-q8iXa`). Última data de trabalho: **2026-08-01**.
>
> ⚠️ Repo PÚBLICO: nenhum segredo aqui. Onde algo sensível apareceria, está como
> `<credencial em variável de ambiente>`.

---

## a) O que é o projeto + stack REAL (lida do `package.json`)

Plataforma para restaurantes: **painel do lojista** (CRM, campanhas WhatsApp,
dashboard) + **loja white-label** do cliente. O produto se chama "Foocci"; o
`package.json` chama o pacote de **`crm-restaurante`** (mesmo projeto, não é erro).

Stack real (de `package.json`, não de memória):
- **Next.js `14.2.35`** (App Router) + **React `18.3`**
- **Prisma `^5.16` + `@prisma/client`** sobre **Postgres**
- **next-auth `^4.24`**
- **Tailwind `^3.4.6`**, **zod `^3.23`**, **date-fns / date-fns-tz** (timezone)
- SDKs de IA presentes: **`@anthropic-ai/sdk ^0.111`** E **`openai ^6.29`**
  (ambos nas deps — *não confirmado* qual é usado em cada fluxo)
- Outros: `@aws-sdk/client-s3`, `sharp`, `xlsx`, `pdf-parse`, `qrcode`, `bcryptjs`
- Testes: **vitest `^2.1.9`**, **@playwright/test `1.49`**; TS `^5.5.3`
- Scripts: `type-check` (`tsc --noEmit`), `test:unit` (`vitest run`), `build`
  (`prisma generate && next build`), `start` (`bash scripts/start-production.sh`)
- **Deploy:** Railway (*inferido* dos comentários do cron + `start-production.sh`;
  não 100% confirmado). **Cron via GitHub Actions** — `.github/workflows/crm-cron.yml`.

---

## b) DECISÕES (data + PORQUÊ + o que quebra se desfizer)

**2026-08-01 — Limite diário exibido = EFETIVO (900 Meta), não o cru 200.**
Porquê: o enforcement já calcula 900/dia para número Meta oficial via
`applyEffectiveSafety` (`src/lib/crm-safety.ts`). O painel lia o `dailyGlobalCap`
CRU (fallback 200) e mostrava "200", assustando o dono. Se desfizer: painel volta
a mostrar 200 e o compositor de envio manual volta a **travar** o número de
destinatários em 200 mesmo com o número Meta permitindo 900. (PR #41)

**2026-08-01 — `maxAgeHours=6` do carrinho MANTIDO (não alargar).**
Porquê: é **validade deliberada**, não atraso. Evita mandar "percebi que seu
pedido não foi finalizado 😊" sobre carrinho de horas/dias atrás (constrangimento).
O disparo real é `inactivityMinutes=2` + scheduler a cada 60s. Se desfizer
(alargar p/ 24h/48h): mensagens tardias e constrangedoras a clientes reais. Ver o
comentário em `src/services/order/OrderDraftRecoverySendService.ts` (~linha 92).

**2026-08-01 — Distribuição AUDIENCE: cota vira PESO, não teto.**
Porquê: a cota diária por campanha era teto rígido; se uma campanha reservava
fatia e não consumia, a campanha com **demanda** travava com
`CAMPAIGN_DAILY_QUOTA_REACHED` mesmo sobrando budget global. Se desfizer: volta a
travar. **EQUAL/PRIORITY/MANUAL mantêm o clamp de propósito** — a mudança é só no
AUDIENCE (default). (`src/services/crm/CRMWhatsAppBudgetPlanner.ts`, PR #41)

**2026-08-01 — Upsell credita SÓ o produto (split por valor), não o pedido.**
Porquê: regra do dono — mérito do garçom = o item específico recomendado; CRM/
indicação = a conversão do pedido inteiro. Antes, "Origem do faturamento"
creditava o pedido inteiro na fatia Garçom por qualquer item `isUpsell` (um refri
de R$5 num pedido de R$150 creditava R$150). Se desfizer: métrica de faturamento
por garçom volta a inflar. (`src/services/dashboard/RevenueAttributionService.ts`, PR #41)

**2026-08-01 — Classificação frio ≠ perdido (mutuamente exclusivos) + % sobre compradores.**
Porquê: regra do dono — cada cliente em UMA classificação; quem nunca comprou não
é perdido. Antes "Frio" (>60d) englobava "Perdido" (>120d) e as % passavam de
100%. Agora Frio = 61–120d, Perdido = 120d+ (e já comprou); % sobre quem já
comprou → somam 100%. Se desfizer: volta a sobrepor. (`CRMService.getOverviewStats`,
`OverviewTab.tsx`, `getCustomers`, PR #41)

**2026-08-01 — "Ativar base" com dry-run padrão + respeita opt-out/telefone.**
Porquê: base importada entra `crmContactable=false` → audiência 0; o dono precisa
ligar em massa, mas com trava de segurança (risco de ban WhatsApp / LGPD). Por
isso: dry-run por padrão, nunca toca opt-out nem quem não tem telefone,
reversível, e **ligar não envia nada**. Se desfizer: a campanha "avisar 100% da
base" fica sem audiência para sempre. (`CRMService.activateContactableBase`, PR #43)

---

## c) O QUE FOI TENTADO E NÃO FUNCIONOU (becos sem saída)

- **Consultar o banco direto desta sessão** para dar o número real da base:
  `DATABASE_URL` **não está setado** neste ambiente de execução. Não dá para rodar
  contagem/relatório de dados daqui — use o endpoint de diagnóstico (seção f).
- **Hipótese inicial errada sobre a campanha "Almoço":** foi diagnosticado "a base
  não tem telefone". O dono corrigiu: **tem** telefone, mas está
  `crmContactable=false` (fila de importação). A causa real é *contactabilidade*,
  não ausência de telefone. Lição: confirmar com `audience-breakdown` antes de
  afirmar a causa.
- **Agendar ação de produção com base em horário do dono:** as instruções de
  horário vieram **contraditórias/fragmentadas** ("14h" × "daqui a 2h" × "agora").
  Um cron chegou a ser criado e depois cancelado. Lição: confirmar antes de
  agendar/deployar por horário.
- **Mudar o default `dailyGlobalCap: 200`** para "consertar o 900": é beco sem
  saída — esse default é só fallback do modo manual; no modo seguro
  `applyEffectiveSafety` sobrescreve. O conserto certo foi na **exibição** (ler
  `effective`, não o cru).
- *(sessão anterior, do histórico Git — não revalidado aqui)* Alerta do simulador
  do Garçom dava `p0Count=1` sem motivo; formulou-se hipótese errada
  (falso-positivo de preço), consertou-se um falso-positivo real, e o contador
  continuou 1. Levou a adicionar **evidência ao alerta** (commit `fb748a39`).

---

## d) O QUE FICOU ABERTO (com "o que quebra se ninguém mexer")

- **Ativar a base (ação MANUAL do dono).** O botão foi entregue (Clientes →
  "Saúde da base de contatos" → "Ativar base"), mas **ninguém clicou ainda**. Se
  ninguém ativar: a campanha "Almoço" continua com **audiência 0 e nunca dispara**.
- **Redeploy.** #41 e #43 estão mergeados na default. Se o Railway não redeployar,
  o painel continua mostrando o cálculo VELHO (Frios 96%, "Mais de 60 dias").
  **Sinal de que o deploy pegou:** o card "Frios" passa a dizer **"61–120 dias"**.
- **Número Meta oficial.** O teto de 900 só vale com `metaCrmEnabled=true` E
  `connectionStatus="CONNECTED"`. Sem isso, vale a rampa de aquecimento (máx 250) —
  e o dono vai achar que "o 900 não pegou". Quebra: expectativa de volume errada.
- **Tetos no painel (Settings).** Se o dono quiser mais volume manual, precisa
  mexer lá; mas no modo seguro o efetivo manda. Quebra: confusão entre valor
  editado e valor aplicado.

---

## e) ARMADILHAS deste repositório (parece certo e não é)

- **`DEFAULT_SAFETY_CONFIG.dailyGlobalCap = 200` e `globalDailyLimit = 50` NÃO são
  o limite aplicado** no modo seguro — `applyEffectiveSafety` sobrescreve (900 Meta
  / rampa). Mudar esses defaults quase nunca faz o que parece.
- **`GET /api/settings/crm-safety` devolve o `dailyGlobalCap` CRU no topo** + também
  `effective` e `warmup`. Ler o cru é a armadilha (foi exatamente o bug do 900).
  Para exibir o teto real, use **`effective.dailyGlobalCap`**.
- **`maxAgeHours=6` (carrinho) é VALIDADE, não atraso.** O atraso é
  `inactivityMinutes=2`. Confundir leva a "consertar" a coisa errada.
- **`CartRecoveryScheduler` só roda com `NODE_ENV=production`** (`CartRecoveryScheduler.ts`
  ~linha 72). Em dev/staging parece "quebrado". Backup: GitHub Actions a cada 5 min.
- **Distribuição AUDIENCE:** o dashboard ainda exibe a cota como "Limite/dia", mas
  ela **não é mais teto** (virou peso). Não trate o número exibido como limite rígido.
- **Lista de clientes vs cards:** `getCustomers` foi alinhado a `getSegmentConfig`
  (antes usava 30/60 hardcoded). Se alguém reintroduzir números fixos, a **lista
  deixa de bater com os cards** do overview.
- **A branch default do repo é `claude/remove-legacy-runner-q8iXa`** — NÃO é
  main/master. PRs vão contra ela. (*Não confirmado* se é permanente.)
- **NUNCA usar nome genérico `HANDOFF.md`.** Várias sessões escrevem neste mesmo
  repo; segundo o dono, uma chegou a **apagar 248 linhas** de outra sem ninguém
  perceber. Sempre `HANDOFF-<assunto>.md`.

---

## f) O QUE EU SEI E NÃO ESTÁ ESCRITO EM LUGAR NENHUM

- **"Campanha nunca envia" ≈ audiência 0 por contactabilidade**, não bug de
  campanha. A base importada entra `crmContactable=false` (fila de enriquecimento —
  ver `MasterDatasetV2Service.ts` ~linha 801: "crmContactable=false. NÃO entram em
  campanhas WhatsApp"). Diagnóstico decisivo (auth admin):
  `GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id>` → olhar
  `noPhone` vs `notContactable` vs `eligible`. O importador Saipos/Nemo grava
  `phone=null, crmContactable=false, contactStatus="SEM_TELEFONE"` para quem não
  tem telefone (`SaiposNemoImportService.ts` ~1261).
- **Regra de negócio do dono (não está no código):** a campanha "Almoço" deve ser
  **perene, 1× por cliente**, pegando novos automaticamente. Isso **já é suportado**
  pelo dedupe "já recebeu esta campanha" (`ScheduledCampaignRunnerService` ~493 /
  `ContactSafetyService` ~238). O dono **não quer reprojetar** — só ativar a base.
- **Raciocínio da atribuição de receita (do dono):** garçom = o produto específico
  do upsell; CRM = conversão pós-mensagem (pedido inteiro); indicação = pedido
  inteiro; espontânea = o resto. Está no código agora, mas o *porquê* é do dono.
- **Como o dono opera:** acompanha por voz, manda mensagens fragmentadas, muda de
  ideia sobre horário. Confirme antes de agendar/deployar por tempo.
- **Segredos:** nesta sessão **nenhuma chave/token foi colada** — só nomes de
  GitHub Secrets (`CRON_SECRET`, `FOOCCI_BASE_URL`) referenciados no workflow.
  Esses secrets vivem em Railway/GitHub, como `<credencial em variável de ambiente>`.

---

## Referência rápida de arquivos
- `src/lib/crm-safety.ts` — teto/limites, `applyEffectiveSafety`, `META_SAFE_DAILY_LIMIT=900`, rampa
- `src/services/crm/CRMWhatsAppBudgetPlanner.ts` — distribuição por campanha
- `src/services/crm/CRMService.ts` — `getOverviewStats`, `getCustomers`, `activateContactableBase`
- `src/services/dashboard/RevenueAttributionService.ts` — atribuição de receita (upsell/CRM/indicação)
- `src/app/(dashboard)/crm/{CRMClient,OverviewTab,ContactBaseHealthPanel}.tsx` — UI CRM
- `src/services/order/{OrderDraftRecoverySendService,CartRecoveryScheduler}.ts` — recuperação de carrinho
- `src/app/api/settings/crm-safety/route.ts` — GET(cru+effective+warmup)/PATCH
- `src/app/api/crm/customers/activate-contactable/route.ts` — ação "Ativar base"
- `src/app/api/admin/diagnostics/audience-breakdown/route.ts` — diagnóstico de audiência
- `.github/workflows/crm-cron.yml` — crons (campanhas /15min, automações diária, carrinho /5min)

*PRs desta rodada: #41 (4 fixes) e #43 (Ativar base) — ambos mergeados na default.*
