# Vitrine — crm

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---

## "Manda pouco" pode ser SEGMENTO CONGELADO, não teto de envio

Em 02/08 o CEO reportou que saía cupom de menos. A leitura óbvia — subir o teto
diário — estava errada, e teria aumentado risco de bloqueio sem resolver nada.

**O que o `audience-breakdown` mostrou:**

| Segmento | Armazenado | Ao vivo |
|---|---|---|
| PERDIDO | **0** | **3.035** |
| FRIO | 0 | 166 |
| MORNO | 0 | 57 |
| SEM_PEDIDOS | 4.926 | 1.739 |

**Campanha segmenta pelo valor ARMAZENADO.** Com ele congelado, quase toda a base
aparecia como *"sem pedidos"* e as campanhas de reativação encontravam **zero
gente** — sem erro nenhum, exatamente como a armadilha de contactabilidade.

**A causa:** `rebuildRestaurantCustomerMetrics` existia e **nenhuma rota o chamava.**
Não havia como disparar em produção. Criado `POST /api/admin/crm/rebuild-metrics`
(admin, escopado a um restaurante). Rodado: **5.093 clientes recalculados**, drift
zerado, **3.228 clientes voltaram a ser alcançáveis**.

**A regra que fica:** antes de mexer em teto de envio, rode o
`audience-breakdown` e compare **`storedSegments` × `liveSegments`**. São **três**
causas diferentes de "não sai mensagem", e elas se parecem:

1. **`notContactable`** — base importada esperando enriquecimento
2. **`storedSegments` congelado** — a segmentação não acompanha o tempo passando
3. **teto diário** — o único que realmente tem a ver com limite

Só a terceira se resolve mexendo em limite. As duas primeiras se resolvem sem
tocar em uma única proteção do número.

— promovido em 2026-08-02 pelo Diretor · origem: diagnóstico ao vivo em produção,
com o rebuild executado e conferido depois

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

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §e (commit `cfc346c`)

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

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §e e §f (commit `cfc346c`)

---

## Atribuição de receita cruza cinco fontes — suspeite delas antes do gráfico

`RevenueAttributionService.getRevenueSources` classifica cada pedido cruzando:

`campaignExecution` · `cRMActionLog` · `customerCoupon.sourceCampaignId` ·
`referral` · `orderItem.isUpsell`

**Se a atribuição do CRM "sumir", o problema quase sempre está numa dessas cinco** —
não na tela que mostra o número.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §f (commit `cfc346c`)

---

## Warning pré-existente no `CRMClient.tsx` — não conserte às cegas

Há um `react-hooks/exhaustive-deps` por volta da linha 2078. **Não foi introduzido
por trabalho recente.**

Mexer na dep array desse `useEffect` pode **reintroduzir um bug de aba inicial** já
corrigido. Se for consertar, confirme o comportamento da aba antes e depois.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §e (commit `cfc346c`)

---

## O limite exibido não é o limite aplicado — leia `effective`, nunca o cru

`DEFAULT_SAFETY_CONFIG.dailyGlobalCap = 200` e `globalDailyLimit = 50` **não são o
teto aplicado** no modo seguro: `applyEffectiveSafety` sobrescreve (900 com Meta
oficial, ou a rampa de aquecimento).

`GET /api/settings/crm-safety` devolve o `dailyGlobalCap` **cru no topo** e também
os blocos `effective` e `warmup`. **Ler o cru é a armadilha** — foi exatamente o
bug do "900 que não aparecia".

Para exibir o teto real: **`effective.dailyGlobalCap`**.

E mudar os defaults para "consertar" o número é beco sem saída: eles são só
fallback do modo manual.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-crm.md` §c e §e (commit `3693a509`)

---

## "Campanha nunca envia" quase sempre é contactabilidade, não bug

A base importada entra com **`crmContactable=false`** (fila de enriquecimento) —
`MasterDatasetV2Service.ts` ~801 diz literalmente *"crmContactable=false. NÃO
entram em campanhas WhatsApp"*. Audiência 0, nada sai, nenhum erro.

**Antes de afirmar a causa, rode o diagnóstico** (auth admin):

```
GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id>
```

Compare **`noPhone` × `notContactable` × `eligible`** — são três coisas diferentes
e já foram confundidas: houve diagnóstico de "a base não tem telefone" quando o
telefone existia e faltava contactabilidade.

O importador Saipos/Nemo grava `phone=null`, `crmContactable=false`,
`contactStatus="SEM_TELEFONE"` para quem realmente não tem telefone
(`SaiposNemoImportService.ts` ~1261).

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-crm.md` §c e §f (commit `3693a509`)

---

## Três coisas do CRM que parecem uma e são outra

- **`maxAgeHours=6` do carrinho é VALIDADE, não atraso.** O atraso é
  `inactivityMinutes=2`. Confundir leva a consertar a coisa errada.
- **`CartRecoveryScheduler` só roda com `NODE_ENV=production`**
  (`CartRecoveryScheduler.ts` ~72). Em dev ou staging **parece quebrado** e não
  está. O backup é um GitHub Actions a cada 5 min.
- **A cota de distribuição AUDIENCE virou peso, não teto** — mas o dashboard ainda
  a exibe como "Limite/dia". Não trate o número exibido como limite rígido.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-crm.md` §e (commit `3693a509`)

---

## A lista de clientes e os cards do overview têm que usar a mesma régua

`getCustomers` foi alinhado a `getSegmentConfig` — antes usava **30/60 hardcoded**.

**Se alguém reintroduzir número fixo em qualquer um dos dois, a lista deixa de
bater com os cards** — e ninguém sabe qual dos dois está certo.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-crm.md` §e (commit `3693a509`)

---

## A atribuição de receita é assimétrica de propósito

- **Garçom** → o **produto específico** do upsell, não o pedido inteiro
- **CRM** → conversão pós-mensagem, **pedido inteiro**
- **Indicação** → pedido inteiro
- **Espontânea** → o resto

Está no código, mas o raciocínio é do CEO. Quem for mexer precisa saber que a
assimetria (garçom = item, CRM = pedido) é **intencional**, não inconsistência a
ser "corrigida".

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-crm.md` §f (commit `3693a509`)

---

## O motor antigo de automações está aposentado **por teste**, não por combinado

`services/crm/tests/AutomationRetired.test.ts` alimenta o
`AutomationSchedulerService` com automações **ligadas** (`isEnabled: true`,
gatilhos `BIRTHDAY` e `POST_ORDER`) e exige que o resultado seja
`automationsRun: 0`, `totalSent: 0`, `results: []`.

Ou seja: **se alguém religar o motor legado, o CI cai.** As campanhas prontas
recorrentes substituíram esse caminho — a tabela `cRMAutomation` continua sendo
lida em vários lugares, mas o agendador não envia mais nada por ela.

É o guardrail *"prompt é aviso; código é trava"* aplicado a uma remoção: matar um
caminho sem trava é convite para ele voltar sozinho num merge distraído.

— promovido em 2026-08-01 pelo Diretor · origem: verificação da branch de produção
durante a mineração do `HANDOFF-railway-build-e-ui-promocoes.md`

---

## As automações de WhatsApp mudaram de endereço — e a busca mudou de lado

A aba *Automações* saiu do CRM. Hoje elas vivem como aba
**🤖 Automações WhatsApp** dentro do drawer de Promoções.

Junto veio uma troca de arquitetura que engana quem lê só um arquivo: o
`crm/page.tsx` **não busca mais** `cRMAutomation` no servidor. O dado agora é
puxado pelo navegador, em `/api/crm/automations`, pela tela de Promoções.

**A ausência no `crm/page.tsx` é intencional, não esquecimento.** O manual já
descreve o caminho novo (`services/manual/howToGuidesContent.ts:599`).

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff (commit `f3f580f`)
