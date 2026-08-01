# Vitrine — crm

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.

---

## "A régua de período" não é um componente — são 3+ implementações independentes

Para adicionar **um botão** de período você toca todas:

1. **Dashboard/Início** — `src/lib/dashboard-periods.ts` (`computePeriodRange`, o
   motor canônico) + `src/app/api/dashboard/route.ts` (array de validação) +
   `DashboardClient.tsx` (`PERIOD_OPTIONS`)
2. **Analytics** — `AnalyticsClient.tsx` tem o **próprio** `presetRange`, que não
   usa o motor canônico
3. **CRM** — tem **duas**: `crmPeriodRange` **e** o `OverviewTab.DateFilterPreset`
   + `handleDateChange` no `CRMClient.tsx`

⚠️ **A pegadinha do `handleDateChange`:** o default seta `toIso = now`. Um preset de
mês fechado precisa **sobrescrever `from` E `to`** — senão o fim do período vaza
para hoje, silenciosamente.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-painel-e-evolution.md` §e (commit `cfc346c`)

---

## Tudo é ancorado à meia-noite de Brasília = 03:00 UTC

`brtNow = now - 3h`. **Qualquer cálculo de período feito em UTC puro erra "hoje"
por três horas** — e o erro só aparece na virada, quando ninguém está olhando.

O motor canônico `computePeriodRange` devolve `prevStart`/`prevEnd` e um
`prevLabel` em português **com gênero certo** ("vs. quinta passada", "vs. domingo
passado"). Comparações de hoje/ontem batem contra **o mesmo dia da semana
anterior**, não contra ontem.

Ao adicionar um período novo, **decida conscientemente qual é o `prev`** — não
herde por acidente.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-painel-e-evolution.md` §e e §f (commit `cfc346c`)

---

## Atribuição de receita cruza cinco fontes — suspeite delas antes do gráfico

`RevenueAttributionService.getRevenueSources` classifica cada pedido cruzando:

`campaignExecution` · `cRMActionLog` · `customerCoupon.sourceCampaignId` ·
`referral` · `orderItem.isUpsell`

**Se a atribuição do CRM "sumir", o problema quase sempre está numa dessas cinco** —
não na tela que mostra o número.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-painel-e-evolution.md` §f (commit `cfc346c`)

---

## Warning pré-existente no `CRMClient.tsx` — não conserte às cegas

Há um `react-hooks/exhaustive-deps` por volta da linha 2078. **Não foi introduzido
por trabalho recente.**

Mexer na dep array desse `useEffect` pode **reintroduzir um bug de aba inicial** já
corrigido. Se for consertar, confirme o comportamento da aba antes e depois.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF-painel-e-evolution.md` §e (commit `cfc346c`)
