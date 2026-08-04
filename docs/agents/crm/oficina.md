# Oficina — crm

> Append-only. O especialista escreve aqui; a vitrine é do Diretor.

---

## 2026-08-03 — Preparação da promoção SHADOW_ONLY → ALLOWLIST do Agente de CRM

**Contexto:** OS `docs/OS-crm-agente-ligar-e-dar-casa.md` (§2 e §5). O CEO mandou
promover, mas a promoção está **bloqueada até ele fornecer a lista de telefones do
time e o restaurante alvo**. Este registro deixa tudo pronto para a promoção ser um
ato de minutos — **nada foi promovido**; nenhum `mode` foi alterado em produção;
nenhuma mensagem real saiu.

### a) Rollback provado ANTES da entrada (exercício local, banco real)

Exercitado em Postgres **local** (seed `prisma/seed.ts`, restaurante
`pizzaria-demo`, id local `cmsdtgcmu0000mcio2saj2hu9`), com as funções REAIS de
`src/services/crm/crmAgentGovernance.ts` — sem mock. Ciclo completo:

| Passo | Resultado |
|---|---|
| Estado antes | sem linha em `crm_agent_pilot_configs` → default `SHADOW_ONLY` |
| Promote com confirm errado | **negado** ("Confirmação inválida") |
| Promote sem evidência de sombra | **negado** — gate hermético PASS (diagnóstico 6/6 + probes 16/16), mas `shadowEvidence=false` (0/20 amostras LLM) |
| 25 amostras de sombra semeadas (agentId=`crm`, 92% PASS) + promote com confirm | **sucesso**: `SHADOW_ONLY → ALLOWLIST`, linha real no banco com `mode=ALLOWLIST`, telefones gravados, nota de auditoria `[AUDIT …] promote ALLOWLIST (3 tel, gates PASS, confirm explícito)` |
| Normalização de telefone na allowlist | 9/9 casos OK — entrada digitada como `+55 (11) 99999-0000`, `11 8888-7777` (sem 9º dígito) e `5521977776666` casou candidato em E.164 com/sem `+`, nacional, **com e sem o 9º dígito** nas duas direções |
| Rollback com confirm errado | **negado** |
| `rollbackCrmAgent` com `ROLLBACK_CRM_AGENT` | **sucesso em 6 ms**: `ALLOWLIST → SHADOW_ONLY`, `paused=false`, allowlist e trilha de auditoria **preservadas** |
| Sorteio A/B após rollback | **não parou**: `resolveCrmPilotAccess` volta a negar o agente ("modo shadow — só sorteio") com `paused=false` → o runner segue enviando o sorteio byte-a-byte; buckets `crmAbPicksAgent` idênticos antes/depois |
| Limpeza | 25 shadow logs + 1 config removidos; banco devolvido ao estado inicial |

**O que os testes automáticos cobrem vs. o que o exercício provou:**

- `crmAgentGovernance.test.ts` (8 testes) e `CrmAgentPilotService.test.ts`
  (12 testes) — rodados, **20/20 verdes**. Cobrem confirm exato, allowlist vazia,
  gate reprovado, evidência insuficiente, escada sem pular degrau,
  `acknowledgeRealCustomers` do WIDE, rollback, filtro da allowlist, determinismo
  do A/B e o piso da mensagem. **Mas o Prisma é mockado nos dois** — nenhum teste
  toca banco.
- Só o exercício manual provou: o **upsert real** (coluna JSON de telefones, merge
  da nota de auditoria com teto de 2000 chars), o gate hermético real
  (`runCrmGateForBrain`: 6/6 + 16/16 sem LLM e sem banco), a leitura real de
  `brain_shadow_logs` filtrada por `agentId="crm"` e janela de 7 dias, e o estado
  do banco antes/depois de cada transição.

### b) Roteiro de promoção em produção (executar SÓ com a lista do CEO em mãos)

> ALLOWLIST envia mensagem REAL aos telefones da lista. Todas as proteções de
> canal continuam valendo para o envio do agente — o branch do agente roda DEPOIS
> do `ContactSafetyService.assertSendable` (cooldown, teto semanal, dedupe
> cross-campanha) e dos portões de janela/teto diário do batch
> (`ScheduledCampaignRunnerService.ts:1508` e :1655). Nenhuma exceção de horário
> de silêncio ou teto é necessária nem permitida.

**Passo 0 — Pré-cheque (leitura, sem efeito):**

```bash
curl -s -H "x-admin-secret: $ADMIN_SECRET" \
  "https://foocci.com.br/api/admin/crm/agent/pilot-status?restaurantId=<ID_DO_RESTAURANTE>" | jq
```

Conferir no relatório (`observarPiloto`, read-only por construção):
- `modo` = `SHADOW_ONLY` e `pausado` = `false`;
- `gates.gatePass` = `true` e `gates.shadowEvidence` = `true` (≥20 amostras LLM,
  ≥70% coerência, **últimos 7 dias**). Se `shadowSamples` = 0, ver o risco (1) no
  item (c) — a promoção vai reprovar no gate e está certo reprovar;
- `bloqueios` vazio / `prontoParaPromover` = `true`.

**Passo 1 — Garantir que os telefones do time existem como CLIENTES do
restaurante alvo.** A allowlist só decide QUEM recebe a mensagem composta pelo
agente; quem entra no disparo continua sendo a audiência da campanha. Telefone do
time que não é `Customer` contactável (`crmContactable=true`) dentro do segmento
da campanha **nunca vai receber nada** — o modo vira ALLOWLIST e não acontece
nada observável. Conferir com o `audience-breakdown`
(`GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id>`).

**Passo 2 — Formato dos telefones.** A allowlist é tolerante a formato:
`isPhoneInList` (`src/lib/wa-text-ordering-flag.ts:190`) normaliza os DOIS lados
com o normalizador BR — remove não-dígitos, corta o `55`, e **insere o 9º dígito
quando faltar** (linha 263–279; provado no exercício local nas duas direções).
Ainda assim, gravar em **E.164 sem `+` (`5511999990000`)**, que é o formato que o
runner vê — formato canônico evita depender da tolerância.

**Passo 3 — Promover.** Não existe (ainda) rota de API de promoção — os controles
estão sendo construídos na casa do agente (Tarefa B da OS). Enquanto ela não
chega, o caminho executável é um script one-off com as funções governadas
(NUNCA SQL direto para promover — SQL pula gates e auditoria):

```ts
// promote-allowlist.ts — rodar com o DATABASE_URL de produção (railway run)
import { promoteCrmAgentToAllowlist, PROMOTE_CRM_ALLOWLIST_CONFIRM } from "@/services/crm/crmAgentGovernance";

const r = await promoteCrmAgentToAllowlist({
  restaurantId: "<ID_DO_RESTAURANTE>",          // aguardando CEO
  phones: ["5511999990000", "..."],             // aguardando CEO — E.164 sem '+'
  abTestPercent: 100,                            // 100 = todo elegível DA LISTA recebe o agente
  confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM,        // "PROMOTE_CRM_AGENT_ALLOWLIST"
});
console.log(JSON.stringify(r, null, 2));         // esperado: success:true, newMode:"ALLOWLIST"
```

Execução local equivalente (provada em 03/08):
`npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","baseUrl":".","paths":{"@/*":["./src/*"]}}' -r tsconfig-paths/register <script>`

**Passo 4 — Conferir que o modo virou.** Repetir o Passo 0: `modo` =
`ALLOWLIST`, `telefonesNaAllowlist` = N. No banco, a linha de
`crm_agent_pilot_configs` ganha nota `[AUDIT …] promote ALLOWLIST (N tel, gates
PASS, confirm explícito)`.

**Passo 5 — Provar o primeiro envio real.** A marca do agente é
`variantKey = "agent:crm"` (`ScheduledCampaignRunnerService.ts:1669`; constante
`CHAVE_DO_AGENTE` em `CrmPilotObservability.ts:28`). Duas leituras:

- `pilot-status` (Passo 0): `ab.agente.envios` ≥ 1 — o braço do agente conta
  `campaign_executions` com `variantKey='agent:crm'` e status SENT/DELIVERED/READ;
- SQL de conferência:
  `SELECT id, "customerPhone", status, "sentAt", "messageText" FROM campaign_executions WHERE "variantKey" = 'agent:crm' AND "restaurantId" = '<id>' ORDER BY "createdAt" DESC LIMIT 5;`
- E a prova de carne e osso: alguém do time mostra a mensagem recebida no
  WhatsApp.

Enquanto `ab.agente.envios` = 0, o agente **não está ligado de verdade** —
guardrail 2: sem evidência do envio, não declarar "ligado".

**Passo 6 — Rollback de 30 segundos (a saída, testada antes da entrada):**

```ts
import { rollbackCrmAgent, ROLLBACK_CRM_CONFIRM } from "@/services/crm/crmAgentGovernance";
await rollbackCrmAgent({ restaurantId: "<id>", confirm: ROLLBACK_CRM_CONFIRM }); // "ROLLBACK_CRM_AGENT"
```

Volta para `SHADOW_ONLY` com `paused=false` — **o sorteio das campanhas não
para** (provado localmente: transição levou 6 ms; allowlist e auditoria
preservadas; buckets A/B intactos). Quebra-vidro (se nada de Node estiver à mão):
`UPDATE crm_agent_pilot_configs SET mode='SHADOW_ONLY', paused=false WHERE "restaurantId"='<id>';`
— e registrar a auditoria manualmente depois, porque o SQL cru não escreve a nota.

### c) Riscos mapeados (nenhum bloqueia a preparação; dois condicionam a prova)

1. **A evidência de sombra de produção depende de `CRM_BRAIN_SHADOW_ENABLED=true`
   no Railway** (`ScheduledCampaignRunnerService.ts:1503` — "OFF por padrão") e de
   campanhas Evolution rodando nos **últimos 7 dias** (janela do
   `getShadowStats`). Se o env estiver desligado ou o restaurante alvo não tiver
   disparado, `shadowSamples=0` e o gate reprova a promoção — **corretamente**.
   O Passo 0 detecta; não inferi do silêncio se o env está ligado em produção:
   **precisa conferir no Railway antes do dia da promoção.**
2. **O agente NÃO compõe no caminho Meta oficial.**
   `crmPilotActive = … && !metaProvider` (`ScheduledCampaignRunnerService.ts:1455`)
   — de propósito: audiência fria na Meta exige template aprovado, e o agente
   compõe freeform. Se o restaurante alvo estiver com `metaCrmEnabled=true` +
   `connectionStatus=CONNECTED` (linhas 1287–1292), a promoção vira o modo e
   **nenhum envio do agente jamais acontece** — "ligado" sem evidência. Conferir o
   provider do restaurante alvo ANTES de prometer prazo do primeiro envio.
3. **Telefone do time fora da base de clientes = silêncio total** (Passo 1). Não é
   bug, é o desenho: a allowlist filtra dentro da audiência, não cria audiência.
4. O filtro em si está sólido: normalização com 9º dígito provada nas duas
   direções, telefone fora da lista degrada para sorteio, telefone vazio nega. E o
   confirm token + gates seguraram todas as tentativas erradas no exercício.

### d) O que fica aguardando o CEO (bloqueia o Passo 3, nada antes)

- **A lista de telefones do time** (qualquer formato BR serve; gravaremos em
  E.164 sem `+`).
- **Qual restaurante liga primeiro** (provável Sushi Cazza — a confirmar; ao
  confirmar, rodar Passos 0–2 nele no mesmo dia).

### Proposta de vitrine (promoção é do Diretor)

1. *"O agente de CRM não compõe no caminho Meta"* — `!metaProvider` em
   `ScheduledCampaignRunnerService.ts:1455` é intencional (Meta fria exige
   template aprovado). Promover a ALLOWLIST num restaurante Meta-first liga um
   modo que nunca envia. Origem: leitura do runner nesta preparação, 2026-08-03.
2. *"A evidência de sombra do gate de promoção tem duas torneiras"* —
   `CRM_BRAIN_SHADOW_ENABLED` (OFF por padrão, linha 1503) e a janela de 7 dias do
   `getShadowStats`. Sem as duas, `promoteCrmAgentToAllowlist` reprova mesmo com
   lista e confirm em mãos. Origem: exercício local + leitura do runner,
   2026-08-03.
3. *"Os testes de governança são todos mockados"* — 20/20 verdes em
   `crmAgentGovernance.test.ts` + `CrmAgentPilotService.test.ts`, mas nenhum toca
   banco; o ciclo real promover→rollback contra Postgres foi provado à mão em
   2026-08-03 (este registro). Quem mexer no `writeCrmPilotConfig` (upsert, JSON,
   merge de notas com teto de 2000 chars) não tem rede automática de banco real.
