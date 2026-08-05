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

---

## 2026-08-05 — CRM da Foocci: funil, origem de verdade e base para o SDR

Pedido do CEO, ampliado no meio da execução: não era "uma tela de métricas de
leads", era **o CRM da própria Foocci** — a base de prospects de onde o agente
SDR (outra frente) vai trabalhar.

### a) O que existia

- `SiteLead`: 11 colunas, nenhuma de estado. `/admin/leads` era uma tabela de
  leitura, 129 linhas, sem nada além de listar.
- **`origem` era `window.location.pathname`** (`DemoForm.tsx:68`). Ou seja: todo
  contato tinha origem `/site/demonstracao`. Uma resposta constante não é
  resposta — não havia como saber qual anúncio funcionava, e o CEO já estava
  rodando campanha de Facebook contra isso.
- O e-mail (Resend) era o destino de fato; a tela era arquivo morto.

### b) O que reaproveitei do CRM do produto (em vez de inventar)

1. **`computePeriodRange`** de `src/lib/dashboard-periods.ts` — o motor canônico,
   ancorado em 03:00 UTC. A vitrine já registra que existem 3+ réguas de período
   independentes neste repo; não criei a quarta.
2. **A régua de amostra mínima do `CrmPhraseConfidence`** — o CRM do produto já
   se recusa a julgar frase com pouca amostra. Copiei o raciocínio (não o código,
   que é de outro domínio) para `MIN_LEADS_PARA_TAXA = 10`.
3. **O `CRMContactLedger` como forma** — `SiteLeadInteraction` é o mesmo desenho:
   append-only, quem tocou / quando / em que direção. Mudança de etapa é UM tipo
   de interação, não uma tabela separada, para o SDR ler **uma** linha do tempo.

### c) As três decisões que mudam número e ficaram documentadas

1. **Coorte de chegada**, não data de fechamento. O período filtra `createdAt` do
   contato. A outra leitura daria crédito ao anúncio errado.
2. **PERDIDO fora da sequência do funil**, mas contando na etapa mais alta que
   alcançou. Sem isso, um mês de propostas recusadas apareceria como um mês sem
   propostas — e a conclusão seria consertar a etapa errada.
3. **Primeiro toque, não último**, com uma exceção nomeada: "direto" guardado é
   substituído se depois aparecer sinal de campanha.

### d) Uma armadilha nova, achada na tela

`src/app/globals.css` (linha ~23) tem uma regra `@layer base` que pinta
`input/select/textarea` com `border-[#E5E5E5]`. O seletor tem sete `:not()` e
**vence qualquer `border-gray-800` por especificidade**. No admin (tema escuro)
isso desenha borda branca em todo campo. Corrigi com `!border-*` só nos campos da
tela que toquei — não ampliei o drift, mas ele continua lá para as outras telas
escuras do admin.

### e) O que NÃO fiz, de propósito

- **Não construí o agente SDR.** O pedido era preparar o terreno.
- **Não liguei proteção de canal nesta base.** O CRM do produto tem horário de
  silêncio, teto diário e dedupe; nada disso existe aqui, porque hoje quem manda
  mensagem é gente. Registrei em `docs/crm-foocci.md` que **isso é bloqueador
  antes de o agente enviar em volume**, e que decidir quais proteções valem para
  prospect é do CEO.
- **Não liguei `SiteLead` a `Restaurant`.** Seria a primeira ponte entre a base
  sem tenant e a base com tenant, e ninguém pediu.
- **Não inventei conversão.** Com a base zerada de hoje, a tela mostra contagens e
  escreve "ainda não dá para dizer" onde a razão não fecha.

### f) Verificação

`npx tsc --noEmit` limpo · `npx vitest run` 406 arquivos / 5165 testes verdes.
Testes novos: 89 (funil, origem, serviço, performance, guarda de rota).
Screenshots em 375/768/1280 nos quatro estados (vazio real, funil, base, dossiê).

### Proposta de vitrine (promoção é do Diretor)

1. **"CRM" neste repositório é ambíguo, e a ambiguidade é cara.**
   `src/services/crm/` é do RESTAURANTE para os clientes dele (multi-tenant);
   `src/services/foocci-crm/` é da FOOCCI para os prospects dela (sem tenant).
   Regra prática: se você está escrevendo `restaurantId` em `foocci-crm/`, está no
   diretório errado; se está lendo `SiteLead` em `crm/`, também.
   Origem: criação do CRM da Foocci, 2026-08-05.

2. **"A origem do lead" era sempre a mesma resposta, e ninguém tinha percebido.**
   `origem = window.location.pathname` grava `/site/demonstracao` em 100% dos
   contatos. Métrica constante parece dado e não é. A regra que fica: **antes de
   confiar num campo de atribuição, olhe a DISTRIBUIÇÃO dele** — um campo com um
   único valor distinto está quebrado, não concentrado.
   Origem: leitura do `DemoForm.tsx:68` contra as campanhas de Facebook no ar,
   2026-08-05.

3. **A trava de amostra tem que valer por LINHA, não só no total.**
   O funil inteiro respeitar `MIN_LEADS_PARA_TAXA` e a tabela por origem não
   respeitar é o caminho natural do bug: uma campanha com 2 contatos e 1
   fechamento aparece como "50% de conversão" no topo do relatório de mídia — e é
   exatamente a linha que decide orçamento. Vale para qualquer quebra por
   dimensão (origem, campanha, criativo), não só para esta tela.
   Origem: `FoocciCrmPerformanceService.test.ts`, 2026-08-05.

4. **Regra base de CSS vence utilitário do Tailwind por especificidade.**
   `globals.css` linha ~23 pinta `input/select/textarea` com a borda clara do
   painel do lojista, usando um seletor com sete `:not()`. Em qualquer tela escura
   do admin, `border-gray-800` **não** funciona — precisa de `!border-gray-800`.
   Já mordeu aqui; vai morder de novo em toda tela escura com campo.
   Origem: screenshot do CRM da Foocci em 1280, 2026-08-05.
## 2026-08-04 — A Evolution sai do CRM: um canal só, e ele tem que responder

**Ordem do CEO** (via Diretor): a Evolution sai do Foocci por completo — era muleta
enquanto a homologação da Meta não saía; a homologação saiu e nenhum restaurante
depende mais dela. Escopo desta oficina: `src/services/crm/**` (inclusive testes).
**Não questionei a decisão; executei.**

### a) A tradução que importa: de "qual provedor?" para "o canal está de pé?"

Todo caminho de envio do CRM fazia a própria pergunta, e a pergunta era sobre a
Evolution (`EvolutionConfigService.getSnapshot` + `EvolutionClient.getInstanceStatus`,
`state === "open"`). Com provedor único a pergunta vira uma só e mora em um lugar:
`src/services/crm/crmWhatsAppChannel.ts` → `isWhatsAppChannelConnected()`, que
pergunta ao `WhatsAppMessagingService.getConnectionStatus` e **falha fechado**:
erro de consulta = `false` + log com o restaurante concreto.

Por que um arquivo novo em vez de `catch(() => false)` em quatro lugares: a regra
"ausência de informação não é permissão de disparo" precisa de UM dono. Quatro
cópias viram três cópias na primeira refatoração distraída.

**O que NÃO fiz de propósito:** manter `metaCrmEnabled` como trava de envio. Aquele
campo existia para ESCOLHER provedor; mantê-lo como portão desligaria o CRM de todo
restaurante que nunca precisou ligar o interruptor — quebra silenciosa, o oposto do
pedido. A checagem de CONEXÃO ficou (era o pedido explícito do Diretor).

### b) Desconectado tem que APARECER — o pior resultado seria o lote sumir

`_sendBatch` antes devolvia `failed: customers.length` **sem gravar uma linha
sequer** quando não havia config. O lojista via "0 enviados" e nenhuma explicação.
Agora: `createMany` de uma linha **BLOCKED** por destinatário com
`errorMessage="NO_WHATSAPP_CONFIG"`, e o lote devolve `blocked`, não `failed` —
canal fora do ar não é culpa do destinatário. A janela de 24h de reattempt
(`BLOCK_RETRY_WINDOW_HOURS`) já existente impede que isso vire enxurrada a cada tick.
Travado em `tests/ScheduledCampaignRunnerBlocks.test.ts` (dois casos: desconectado
e "não deu para saber").

### c) Bloqueio de política ≠ falha de entrega

O `SendResult` da Meta tem três estados e eu passei a respeitar os três. `BLOCKED`
(fora da janela de 24h sem modelo aprovado → `META_TEMPLATE_REQUIRED`) vira linha
**BLOCKED** com o motivo, **não** alimenta o disjuntor e **não** manda ninguém para
a limpeza automática de números. Só `FAILED` conta como falha. Se eu tivesse
tratado bloqueio como falha, cinco recusas de política em sequência abortariam o
lote inteiro por "colapso de canal" que não existiu.

Para o `catch` continuar vendo código de máquina (`META_190`, `INVALID_PHONE`,
`HTTP_500`) criei `SendFailure extends Error` com `errorCode` — sem isso o código
virava texto livre e a classificação, que decide retentativa **e exclusão de
cliente**, perdia o pé.

### d) O que eu me RECUSEI a inferir

Códigos de erro da Meta que eu não conheço um a um caem em `FAILED_PROVIDER`
(retentar depois), **nunca** em `EVOLUTION_BAD_REQUEST`. Motivo: essa categoria
alimenta a limpeza automática que **APAGA lead sem histórico**. Mapear um código
desconhecido para "número morto" seria apagar cliente com base em palpite. Quando
um código merecer tratamento próprio, ele entra nomeado.

Pelo mesmo motivo mantive `NO_EVOLUTION_CONFIG` sendo LIDO na classificação: o
código saiu de circulação, mas as linhas antigas continuam no banco, e apagar o
`case` transformaria bloqueio explicado em "erro desconhecido" retroativo.

### e) O efeito colateral que quase passou batido: o agente e o rodízio de frases

`crmPilotActive` tinha `&& !metaProvider` — o agente de CRM só compunha no caminho
Evolution. Com Meta-only isso viraria `false` para sempre e **mataria o agente em
WIDE em silêncio**. E `selectorPool = metaProvider ? metaPhrases : activePhrases`
mataria junto o rodízio de frases e o bandit de quem não tem modelo por frase.

Troquei a pergunta certa: **`templateMode`** = existe modelo aprovado (por frase ou
da campanha)? Se sim, rodízio só sobre os aprovados e agente parado — porque com
modelo quem chega ao cliente é o TEXTO DO MODELO, e gravar `variantKey="agent:crm"`
numa mensagem que ninguém leu é número de conversão inventado. Se não há modelo, a
campanha sai em texto livre e tudo volta a valer como valia.

### f) Mudança de comportamento que o CEO precisa saber (não é minha para decidir)

O teto **por rodada** era `metaCrmEnabled ? 40 : 5`. Com canal único virou sempre
`META_CLOUD_MAX_PER_RUN = 40`. Para restaurante que já era Meta, nada muda; para
quem nunca ligou o interruptor, o lote por ciclo vai de 5 para 40. **Teto diário da
campanha e orçamento global continuam intactos** — mudou o ritmo, não o volume do
dia. Registro aqui porque teto e limite diário são coisas diferentes e já foram
confundidos nesta casa.

### g) Armadilha de teste que custou tempo (vitest 2.1.9)

Espião que já recebeu `mockResolvedValue` e depois passa a lançar faz o vitest
contabilizar o erro como **falha do arquivo**, mesmo com o `catch` funcionando e o
teste terminando (dá para ver o `console.error` do catch no stderr e a asserção
passar). Solução: atribuir um `vi.fn()` NOVO no teste que lança. Está comentado nos
dois lugares onde uso isso — quem "arrumar" de volta reintroduz o vermelho.

### h) Sujeira que não é minha, mas passou pelas minhas mãos

O commit `8a462b3` (consolidação do Diretor, `git add -A` durante meu trabalho)
levou junto um arquivo de depuração meu, `src/services/crm/tests/__dbg7.test.ts`.
Ele está **deletado na árvore de trabalho** e a deleção está por commitar. Não
commitei nada, conforme a ordem.

### Proposta de vitrine (promoção é do Diretor)

1. *"A pergunta do canal tem UM dono e ele falha fechado"* —
   `crmWhatsAppChannel.isWhatsAppChannelConnected` é o único lugar que decide se o
   CRM pode falar. Erro de consulta = não pode. Travado em
   `tests/CrmWhatsAppChannel.test.ts`. Origem: extração da Evolution, 2026-08-04.
2. *"Desconectado grava BLOCKED por destinatário, não some"* — o pior modo de
   falha do CRM sempre foi o silêncio; `_sendBatch` agora deixa rastro por pessoa.
   Travado em `tests/ScheduledCampaignRunnerBlocks.test.ts`. Origem: idem.
3. *"Bloqueio de política não é falha, e por isso não aciona disjuntor nem
   exclusão de cliente"* — `SendResult.status === "BLOCKED"` tem caminho próprio
   nos dois envios. Origem: idem.
4. **Corrige a entrada de vitrine de 2026-08-03 (item 1 da oficina anterior):**
   *"O agente de CRM não compõe no caminho Meta"* **caducou**. O gate não é mais o
   provedor (não há escolha), é `templateMode` — com modelo aprovado o agente fica
   parado; sem modelo, ele compõe. Promover a ALLOWLIST num restaurante que tem
   modelo aprovado para a campanha continua ligando um modo que não envia.
5. *"Categoria de execução com prefixo EVOLUTION_ é NOME, não provedor"* —
   `EVOLUTION_BAD_REQUEST` e irmãs são contadas por chave no `CRMClient.tsx`.
   Renomear zera os contadores da tela sem ninguém perceber. Mudou o que ENTRA em
   cada uma, não o nome. Origem: idem.

---

## 2026-08-05 — Carrinho abandonado: a campanha "Ativa" que enviou 4 mensagens em 2,5 meses

**Pedido do CEO** (via Diretor): a linha "🛒 Carrinho abandonado (FIXA)" aparece
**Ativa**, com botão *Pausar*, e **todos** os números em traço. "Essa campanha não
funciona há meses."

A ordem era explícita: **não concluir por leitura de código; provar com dado de
produção.** As três hipóteses (não dispara / dispara e não acha ninguém / envia e
não registra) levam a consertos opostos.

### a) Onde estava a evidência — e por que ela não custou nada

O job **Cart Recovery** do `crm-cron.yml` imprime, a cada execução, a resposta
crua de `POST /api/cron/send-cart-recovery`. Ou seja: **o histórico do motor já
estava gravado, datado e público** nos logs do GitHub Actions. Não precisei de
credencial de banco, nem de rota nova, nem de clique do CEO.

Varri **1.028 execuções do workflow (19/05 → 05/08)** e extraí **792 respostas do
motor**. Ferramenta preservada em `scripts/historico-cron-carrinho.mjs`.

**O veredito, com os números:**

| Janela | Ticks lidos | `checked` | `eligible` | `sent` | `failed` |
|---|---|---|---|---|---|
| 19/05 → 24/06 | 252 | 2.541 | 658 | **9** (6 em `dryRun`) | 21 |
| 24/06 → 25/07 | 393 | 12.547 | 580 | **1** | 17 |
| 25/07 → 05/08 | 147 | 2.868 | 10 | **0** | 10 |

**Mensagens reais entregues em 2,5 meses: 4.** Três em 28/05 (dia da estreia) e
**uma em 12/07 23:03 UTC** — a última. Nesse mesmo período o motor declarou
**1.248 vezes** que havia carrinho cobrável.

### b) Qual das três hipóteses — e por que as outras duas caem

1. **"Nunca dispara" — FALSO.** 792 ticks com HTTP 200 e corpo completo. O cron
   roda (com ressalva: o GitHub entrega ~1 execução/hora, não os `*/5` do
   arquivo — throttling de repositório com 45 workflows).
2. **"Envia e não registra" — DESCARTADA COM PROVA, e é a que eu mais queria
   descartar.** `sent` somou 4 em 792 ticks. Além disso, `skippedTooOld` (que só
   conta rascunho com `recoveryAttempts=0`) subiu de 47 → 51 entre 30/07 e 05/08:
   são carrinhos que venceram **sem nunca terem sido carimbados**. Se o
   `CartRecoveryScheduler` in-process estivesse enviando por fora do cron, esses
   carimbos existiriam. **Não há enxurrada silenciosa acontecendo.**
3. **"Dispara e não acha ninguém" — VERDADEIRA**, mas por motivos que MUDARAM ao
   longo do período. É aqui que a leitura ingênua erra:

   - **até 17/07** — o portão de config ficava **depois** do `eligible++`
     (`git show 68ee165c`). Os "elegíveis" eram sempre os mesmos restaurantes
     **sem WhatsApp configurado**: contados como oportunidade, nunca tentados. Um
     mesmo punhado de rascunhos era recontado a cada tick por dias a fio, o que
     inflou `eligible` para 658/580 sem significar quase nada;
   - **de 17/07 em diante** — o portão subiu para antes do `eligible++` (correto).
     `eligible` despencou para ~0–1 e as poucas tentativas **falharam** (17 e 10);
   - **30/07 11:33** — a trava de validade de 6h entrou (commit `7e4d63f4`) e o
     estoque inteiro — 47 carrinhos — virou "vencido" **no mesmo tick**. Correto e
     desejável: eram carrinhos de semanas atrás;
   - **de 30/07 até hoje** — o volume real é de **~0,7 carrinho abandonado por
     dia**. Dos 4 que apareceram: 3 foram pulados porque **o cliente já tinha
     pedido** (pulo certo, não é bug) e **1 foi perdido por loja fechada**.

### c) O achado que ninguém tinha visto: a validade corre com a loja fechada

05/08, dois ticks seguidos (03:57 e 06:36): `checked=1`, `skippedRestaurantClosed=1`
— o motor adia porque a loja está fechada e, corretamente, **não carimba**. Às
09:23 o mesmo carrinho já aparece em `skippedTooOld=51`.

**O carrinho abandonado de madrugada vence antes de a loja abrir.** O adiamento
por horário promete uma segunda chance que o prazo de 6h nunca deixa acontecer.

**NÃO CONSERTEI ISSO, DE PROPÓSITO** — ver o aviso em (f).

### d) O que a tela faz, e que torna tudo pior

`CRMClient.tsx:3646-3697`: a linha do carrinho é **sintética e cega por
construção**. Os traços não são "zero": são **`<td>—</td>` literais no JSX**,
sete deles, com o comentário *"cart recovery grants without a Campaign row, so
these aren't attributable"*. Aconteça o que acontecer, aquela linha nunca mostra
número.

E o selo: `cartRecoveryActive` vem de `readyMadeConfig.cartRecoveryEnabled`
(`ReadyMadeCampaignService.ts:194`), que é **ligado por omissão**. Ou seja:
**"Ativa" significa "ninguém desligou"**, não "está funcionando".

Pior ainda: o motor **nunca gravava `campaign_executions`**. Achei o buraco
documentado numa linha de comentário em `src/lib/crm-safety.ts:330` — *"cart
recovery ... never created executions here anyway"* — sem que ninguém tivesse
notado que aquela frase **era a explicação dos traços**. Consequência tripla:
a tela não tinha o que somar, a atribuição de receita nunca creditou um centavo
ao carrinho (ela parte de `campaignExecution`) e envio bem-sucedido ficava
idêntico a "não aconteceu nada" no banco.

### e) O que consertei

1. **`src/services/order/CartRecoveryHealthService.ts` (novo)** — o alarme.
   Read-only. Distingue **DESLIGADA · SAUDAVEL · OCIOSA · SILENCIOSA**.
   A separação que importa: *ociosa* (calada porque não passou carrinho) nunca
   acusa; *silenciosa* só acusa quando existe a **prova da oportunidade perdida**
   — carrinho que venceu sem uma tentativa. Guardrail 1 aplicado: não se infere
   defeito do silêncio. O campo `evidencia` traz desde quando, quantos venceram,
   quantos esperam agora e qual o prazo — guardrail 6.
   `estaAtiva()` lê o interruptor com a **mesma regra do motor de envio** (linha
   de Campanha manda; na falta dela, a bandeira antiga, ligada por omissão) — duas
   leituras do mesmo interruptor divergem na primeira refatoração distraída.
2. **A medição** (`OrderDraftRecoverySendService`): envio, falha e bloqueio de
   política passam a gravar `campaign_executions` **quando existe a linha de
   Campanha do carrinho**, com `variantKey` da frase sorteada. Best-effort: se a
   gravação explodir, o envio continua valendo (medir é importante; entregar é
   mais). BLOCKED não conta como falha nem como envio.
3. **`carrinho-abandonado` entrou em `BUDGET_EXEMPT_TEMPLATE_IDS`.** Sem isso, o
   registro novo começaria a **comer a cota diária das outras campanhas** — uma
   mudança de comportamento que ninguém pediu, disfarçada de melhoria de medição.
   Conferi que a isenção **não** liga o carrinho no runner recorrente: a campanha
   dele tem `scheduleConfig.mode = "CART_RECOVERY"` e o runner filtra `RECURRING`
   (`ScheduledCampaignRunnerService.ts:676`). Não há duplo motor.
4. **Exposição**: `/api/crm/ready-made` devolve `cartRecoveryHealth` (é lá que a
   tela decide mostrar "Ativa" — quem exibe o selo precisa do desmentido na mesma
   resposta), e `/api/admin/diagnostics/recovery-scheduler` ganhou o bloco
   `health` (com `varredura()` global quando não há slug). Reaproveitei a rota que
   já existia em vez de criar outra.
5. **A bomba armada do `mark-abandoned-drafts`.** Rota órfã: a única ocorrência da
   string no repo é o próprio arquivo. Parece "faltou ligar" — e **ligar seria o
   erro**: o motor de envio só lê `status: "OPEN"`, e o marcador vira
   `OPEN → ABANDONED` aos 60 min, dentro da janela cobrável de 2 min a 6 h.
   Ligá-lo encolheria a janela de 6h para 1h e mandaria o resto para um estado que
   o motor não enxerga. **Ligar a "Fase 2" desligaria a Fase 3.** Documentado no
   cabeçalho da rota e travado em teste.

### f) ⚠️ O QUE EU **NÃO** FIZ — E POR QUÊ (decisão do CEO)

> **NÃO MEXI NA REGRA DE ELEGIBILIDADE. NENHUMA MENSAGEM NOVA PASSA A SAIR POR
> CAUSA DESTE BLOCO.**
>
> O conserto óbvio do achado (c) seria **parar o relógio da validade enquanto a
> loja está fechada**. Ele é defensável — mas é mudança de QUEM RECEBE MENSAGEM,
> e mora a 51 carrinhos de distância de uma enxurrada. Um erro de sinal no cálculo
> de "idade em horário útil" e o Foocci dispara, de uma vez, mensagens sobre
> carrinhos de semanas atrás: queima o número do lojista e assusta o cliente
> final. A proteção não pode ser pior que o problema (guardrail 5).
>
> **Decisão do CEO, não minha.** Se aprovada, deve vir com teto explícito
> (ex.: no máximo 2h de loja aberta, e nunca sobre carrinho de outro dia) e com
> o backlog atual **excluído por data de corte**.

Também não toquei em pixel: a linha sintética do `CRMClient.tsx` é do
`interface`/`experiencia`. Descrevi em (g) o que ela deveria dizer.

### g) A honestidade da tela — proposta, para o Diretor despachar

Enquanto a causa não fechar, "Ativa + tudo em traço" é promessa que o código não
cumpre. O dado já está pronto em `cartRecoveryHealth`. O que a linha deveria dizer:

| Veredito | Selo | Linha de apoio |
|---|---|---|
| `SAUDAVEL` | **Ativa** (verde) | números reais de `campaign_executions` |
| `OCIOSA` | **Ativa · sem carrinho** (neutro) | "nenhum carrinho abandonado no período" |
| `SILENCIOSA` | **Ativa, mas sem enviar** (âmbar) | o texto de `evidencia`, inteiro |
| `DESLIGADA` | **Pausada** | — |

E o traço só pode significar "zero neste período" — nunca "não sabemos".

### h) Verificação

`npx tsc --noEmit` limpo · `npx vitest run` **421 arquivos / 5.381 testes verdes**.
Testes novos: 21, em três arquivos, com as duas metades em cada um —
`CartRecoveryHealth.test.ts` (o `describe("o silêncio de antes")` **recria o
estado exato da produção em 05/08**: ativa, zero envios, 51 vencidos, e exige
SILENCIOSA), `CartRecoveryMedicao.test.ts` (`describe("o rastro que não
existia")`) e `CartRecoveryCronOrfao.test.ts`.

### i) Sobre a honestidade da própria prova

Os logs do Actions provam **o que o cron viu** (~1 tick/hora), não o universo. A
prova independente de que o `CartRecoveryScheduler` in-process também não enviou
é o `skippedTooOld` subindo com `recoveryAttempts=0`. Ainda assim, a leitura
definitiva é `max(lastRecoveryAt)` no banco — que é exatamente o que o
`CartRecoveryHealthService` passa a expor. **Enquanto ninguém rodar o
`/api/admin/diagnostics/recovery-scheduler` em produção, o "4 mensagens" é a
melhor evidência disponível, não a leitura final.**

### Proposta de vitrine (promoção é do Diretor)

1. **"Ativa" no carrinho abandonado significa "ninguém desligou", não "está
   funcionando".** O selo vem de `readyMadeConfig.cartRecoveryEnabled`, ligado por
   omissão, e a linha da tabela tem sete `<td>—</td>` **literais** no JSX
   (`CRMClient.tsx:3646-3697`). Regra que fica: **antes de ler um traço como
   "zero", confira se ele não é texto fixo.** Origem: print do CEO conferido
   contra 792 respostas do cron em produção, 2026-08-05.

2. **O histórico de qualquer cron desta casa já está gravado e é público.** O job
   do `crm-cron.yml` imprime a resposta crua do endpoint a cada execução — dá para
   reconstruir meses de comportamento do motor sem tocar no banco e sem pedir
   clique. Ferramenta: `scripts/historico-cron-carrinho.mjs`. **Antes de pedir
   credencial de produção, olhe os logs do Actions.** Origem: este diagnóstico.

3. **`eligible` muito maior que `sent`, sem `failed` correspondente, é o pior modo
   de falha do CRM** — o motor declara que havia quem cobrar e nada sai, nem erro.
   Aconteceu por 2 meses porque o portão de config ficava **depois** do
   `eligible++`. Regra: **contador de oportunidade tem que vir DEPOIS de todos os
   portões**; antes deles, ele mede intenção, não oportunidade. E cuidado com a
   recontagem: sem carimbo, o mesmo rascunho vira "elegível" a cada tick e infla o
   total. Origem: `git show 68ee165c` cruzado com a série do cron, 2026-08-05.

4. **Ligar a "Fase 2" do carrinho (`mark-abandoned-drafts`) DESLIGA a Fase 3.**
   O motor de envio só lê `OPEN`; o marcador vira `ABANDONED` aos 60 min, dentro
   da janela cobrável de 2 min–6 h. Rota órfã que parece esquecimento e é
   armadilha. Travado em `CartRecoveryCronOrfao.test.ts`. Origem: idem.

5. **O relógio da validade do carrinho corre com a loja fechada.** Carrinho
   abandonado de madrugada é adiado por horário comercial e vence pelas 6h antes
   de a loja abrir — o adiamento promete uma segunda chance que nunca chega.
   Provado em produção em 05/08 (dois ticks com `skippedRestaurantClosed=1`,
   seguidos de `skippedTooOld` +1). **Conserto pendente de decisão do CEO por
   risco de enxurrada.** Origem: idem.

6. **Medir não pode custar envio.** Ao passar a gravar `campaign_executions` no
   carrinho, ele entraria automaticamente na cota diária global das outras
   campanhas (`getTodayGlobalSendCount`). Entrou em `BUDGET_EXEMPT_TEMPLATE_IDS`
   no mesmo commit. Regra: **ao começar a registrar o que antes não se registrava,
   procure quem CONTA aquele registro.** Origem: `src/lib/crm-safety.ts:333`,
   2026-08-05.
## 2026-08-05 — O CRM inteiro dispara quanto? 4.462 em 30 dias — em UMA casa

**Pergunta do CEO:** o site vende *"dispara as campanhas certas no automático"*. O
diagnóstico do carrinho (fechado hoje, mesma sala) achou 4 mensagens em 2,5 meses
naquela campanha. O CRM inteiro dispara pouco, ou era só o carrinho?

**Resposta curta: era só o carrinho.** O CRM disparou **4.462 mensagens em 30
dias** e **5.295 em 90** — 4.456 delas de campanhas prontas, automáticas. Está
enviando hoje (43 até as 14h20 de 05/08). A frase do site é verdade **onde o
produto está ligado**, e o produto está ligado em **um** restaurante.

### a) Por que os logs do cron não bastavam (e por que quase virou número errado)

O bloco do carrinho reconstruiu a série pelos logs públicos do Actions. Repeti o
molde e ele deu **434 envios em 30 dias**. Se eu tivesse parado ali, teria
entregado ao CEO um número **10× menor que o real**.

A causa: além do cron do GitHub existe o `ScheduledCampaignScheduler`, um
temporizador **dentro do processo do Railway**, a cada 10 min
(`ScheduledCampaignScheduler.ts:27`), que envia sem passar pelo Actions. Ele fez
4.028 dos 4.462. O log do Actions é limite inferior; só o banco é total.

Ficou assim, e é a divisão que recomendo manter:

| Coletor | Fonte | Serve para |
|---|---|---|
| `scripts/raio-x-crm-producao.mjs` | banco + rotas admin (credencial do Railway) | o **total** e o estado de agora |
| `scripts/raio-x-envios-crm.mjs` | logs públicos do Actions | os **motivos**, tick a tick |

Workflow: `.github/workflows/raio-x-crm-envios.yml`. Somente leitura nas duas
metades; o log é público, então só saem contagens, slug e código de máquina.

### b) O número, campanha a campanha (banco, sushi-cazza — a única casa com campanha)

| campanha | 30d | 90d | bloq 90d | novos elegíveis agora | prateleira real |
|---|---|---|---|---|---|
| recuperar-perdidos | 948 | 948 | 731 | **0** | **2.963** |
| cupom-vencendo | 780 | 780 | 64 | 64 | 272 |
| siga-redes | 678 | 678 | 513 | 12 | **5.050** |
| cadastro-sem-compra | 582 | 582 | 102 | 10 | **1.742** |
| indique-amigo | 573 | 573 | 248 | 1 | — |
| recuperar-frios | 476 | 636 | 32 | **0** | 150 |
| segunda-compra | 131 | 131 | 13 | 55 | 162 |
| reativar-mornos | 93 | 271 | 1 | 23 | 88 |
| carrinho-abandonado | 89 | 280 | 0 | **338** | — (calada desde 20/07) |
| quente-esfriando | 67 | 67 | 8 | 10 | 107 |
| aniversariantes | 39 | 63 | 0 | 0 | 22 |
| TODOS (manual) | 0 | 0 | 0 | 500 | — |
| clientes-vip | 0 | 0 | 0 | — | PAUSED pelo lojista |

Automáticas 30d: **4.456** · manuais/agendadas pelo lojista: **5**.
Motor legado de automações: **0 rodadas em 79 execuções de 90 dias** — o zero
está provado, não suposto (bate com `AutomationRetired.test.ts`).

### c) As três famílias, e a quarta que precisei separar

Das 1.904 avaliações campanha×tick de 30 dias no log do cron:

| família | ocorrências | o que é |
|---|---|---|
| **RITMO** | 902 | "Aguardando intervalo mínimo entre ciclos" — ciclo ADIADO para o próximo tick |
| **SEM AUDIÊNCIA** | 386 | "No new eligible recipients" + "Sem clientes elegíveis no momento" |
| **BLOQUEADO** | 267 | pausa por falhas (120), canal desconectado (93), teto diário (59), silêncio (18), saldo de contatos (6), cap global (4) |
| **ENVIOU** | 130 | — |
| nunca dispara | ~0 | nenhuma campanha ativa que jamais fique de vez |

**RITMO teve que sair das três.** Somar "aguardando 10 minutos" a "nunca dispara"
transformaria espaçamento funcionando na maior avaria do relatório — e eram 902
de 1.904. É o oposto do padrão do carrinho: lá o motor era mudo; aqui ele fala o
tempo todo e o que atrasa é o compasso.

Bloqueios por destinatário, 90 dias: **1.702 × `RECENT_CRM_MESSAGE_24H`** (o
cooldown fazendo o trabalho dele) e 47 × `INVALID_PHONE_FORMAT`. Das 844 falhas,
**744 são da Evolution** — provedor aposentado em 04/08; é histórico, não fila.

### d) O achado que muda a pergunta: o teto de 500 mora no meio da fila

`resolveAudience` resolve **no máximo 500 por segmento** (`MAX_AUDIENCE`,
`CrmCampaignService.ts:110`) e ordena por `lastOrderAt` **ASC** — sempre os
mesmos primeiros. Contra a prateleira real, medida sem o teto:

- `recuperar-perdidos`: prateleira **2.963**, enxerga 500, reporta **0 novos** →
  ~2.463 pessoas que a campanha nunca vai ver;
- `cadastro-sem-compra`: prateleira **1.742**, enxerga 500, reporta 10 novos;
- `siga-redes` (TODOS): prateleira **5.050**, enxerga 500, reporta 12 novos.

Ou seja: **"sem novos elegíveis" não quer dizer base esgotada.** A casa tocou
1.879 pessoas distintas em 30 dias — 37% dos 5.050 contactáveis. Os outros 63%
não são inalcançáveis: são invisíveis para o resolvedor.

**PAREI AQUI DE PROPÓSITO.** Elevar ou paginar o teto destrava ~8 mil pessoas de
uma vez no sushi-cazza, e o ritmo pularia de ~70/dia para o teto de 420/dia
(soma dos limites das campanhas; o teto global aplicado é 900). Isso é enxurrada
sobre gente com 120+ dias sem pedir. Guardrail 5: a correção seria mais
destrutiva que o problema. **É decisão do CEO, não minha.**

### e) O que é volume real e o que é defeito — a separação honesta

- **pizzaria-testando**: 8.613 clientes, **4.440 contactáveis**, prateleira de
  3.066 perdidos + 1.182 sem pedido — e **zero campanha, nem rascunho**. O
  `contact-safety` responde **canal INDISPONÍVEL**. Não é defeito do CRM: é
  onboarding incompleto. Ligar campanha sem canal não produz uma mensagem.
- **sushi-cazza**: 147 pedidos e 103 rascunhos de carrinho em 30 dias. Há volume
  real, e o CRM está em cima dele.
- **foocci-bakery**: 1 cliente. Vitrine. Nada a enviar, e isso não é bug.

Das 16 campanhas prontas, o sushi-cazza ligou **11**. Desligadas:
`pedido-avaliacao`, `clientes-vip`, `subiu-de-nivel`, `quase-no-proximo-nivel`,
`mimo-mensal-nivel` — as três últimas dependem do programa de níveis, que tem
interruptor próprio (`RELATIONSHIP_PROGRAM_TEMPLATE_IDS`,
`ScheduledCampaignRunnerService.ts:684`).

### f) O único conserto que fiz, e por que ele não move volume nenhum

`/api/admin/diagnostics/crm-campaigns` respondia **`lastExecutionAt: null`** —
"nunca" — para `recuperar-perdidos`, que tem **948 envios em 30 dias**. Todas as
11 campanhas ativas apareciam como "último envio: nunca".

A causa não é o dado, é o `ORDER BY`: no Postgres `ORDER BY "sentAt" DESC`
devolve **NULLS FIRST**, e BLOCKED/FAILED/PENDING nascem com `sentAt` nulo — a
casa tinha 1.702 bloqueios de cooldown. O `findFirst` sem filtro pegava um deles.

O irmão desta leitura já fazia certo: `diagnostics/crm-performance` usa `groupBy`
com `sentAt: { not: null }` + `_max`. **Duas rotas, duas respostas para a mesma
pergunta, e a errada é a que o diagnóstico lê.**

Conserto: `where: { campaignId, sentAt: { not: null } }`
(`crm-campaigns/route.ts:181`). Trava com as duas metades em
`CrmDiagnosticoUltimoEnvio.test.ts` — reproduz a regra NULLS FIRST em 8 linhas,
roda a consulta de antes (devolve "nunca") e a de agora (devolve 02/08), garante
que campanha que realmente nunca enviou continua nula, e prende a rota ao filtro.

Zero mensagens/dia de impacto. Impacto total em confiança: este é o número que
alguém lê para decidir se o CRM está calado, e um "nunca" falso não parece
defeito — parece diagnóstico.

### g) O que NÃO toquei, e o risco escrito

1. **`MAX_AUDIENCE = 500`** — item (d). ~8 mil pessoas de uma vez.
2. **1.949 execuções PENDING**, todas entre 23/05 e 24/06, nenhuma nos últimos 30
   dias. É resíduo de um motor que parou, não fila viva. Quem "reprocessar" isso
   dispara 1.949 mensagens sobre gente contatada há dois meses.
3. **`carrinho-abandonado` com 338 novos elegíveis, calada desde 20/07.** É o
   território do bloco irmão de hoje, que já registrou que o conserto óbvio passa
   a 51 carrinhos de uma enxurrada.
4. **Ligar campanha sozinho no restaurante sem canal.** Ativar as 16 prontas por
   padrão é o que faria a frase do site virar verdade para todo mundo — e é
   exatamente "envio em massa sem o lojista pedir". Decisão do CEO.

### h) Duas coisas que enganam quem lê a tela e não são bug

- **"audiência 500"** é o teto de resolução, não o tamanho do segmento. Lido como
  platô, parece que a base parou de crescer.
- **"agendador interno: inativo"** no `crm-campaigns` é estado de **memória de um
  processo**. A réplica que atende a requisição pode não ser a que roda o timer.
  Quem prova envio é a contagem do banco — e ela prova que ele roda.

### i) Verificação

`npx tsc --noEmit` limpo. `npx vitest run`: **420 arquivos / 5.386 testes
verdes** (4 novos). Quatro rodadas do workflow contra produção, somente leitura;
nenhuma mensagem enviada, nenhuma campanha criada, pausada ou promovida.

Duas armadilhas de coleta, para quem repetir: o `git config` sem `--global` não
alcança o repositório novo do `git init` (a publicação morre com "empty ident
name" — o molde `diagnostico-escada-crm.yml` tem o mesmo defeito); e
`/api/admin/restaurants` devolve `{ data: [...] }`, não a lista crua — um HTTP
200 com formato inesperado apareceu como "não há restaurante". A 4ª rodada
também bateu no **rate limit da API do GitHub** no coletor de logs; ele degrada
sem derrubar o resto.

Nota de branch: o trabalho do carrinho (commit `a2c03c56`, que põe
`carrinho-abandonado` em `BUDGET_EXEMPT_TEMPLATE_IDS`) vive noutra worktree e
ainda não está na padrão. Não há sobreposição de arquivos com este bloco.

### Proposta de vitrine (promoção é do Diretor)

1. **"Quanto o CRM enviou" não se responde pelo log do Actions.** Existem DOIS
   motores: o cron do GitHub e o `ScheduledCampaignScheduler`, dentro do processo
   do Railway, a cada 10 min (`ScheduledCampaignScheduler.ts:27`). O log viu 434
   envios em 30 dias; o banco tinha 4.462. Log serve para **motivo**; banco serve
   para **total**. Origem: raio-x do CRM, 2026-08-05.

2. **"Sem novos elegíveis" ≠ base esgotada.** `resolveAudience` resolve no máximo
   `MAX_AUDIENCE = 500` por segmento (`CrmCampaignService.ts:110`) ordenando por
   `lastOrderAt` ASC — sempre os mesmos 500. Contatados esses, a campanha reporta
   0 novos para sempre, com milhares atrás: `recuperar-perdidos` tem prateleira de
   2.963 e enxerga 500. Antes de concluir "acabaram os clientes", meça a
   prateleira SEM o teto. Origem: idem.

3. **`ORDER BY x DESC` no Postgres é NULLS FIRST — e em tabela de execução isso
   inverte o significado.** `campaign_executions` guarda BLOCKED/FAILED/PENDING
   com `sentAt` nulo; um `findFirst` ordenado por `sentAt` desc **sem filtro**
   devolve um bloqueio e a tela escreve "nunca enviou" para campanha com 948
   envios. Toda leitura de "último X" nessa tabela precisa de `{ not: null }`.
   Travado em `CrmDiagnosticoUltimoEnvio.test.ts`. Origem: idem.

4. **A quarta família: RITMO.** O diagnóstico do carrinho deixou três (nunca
   dispara / não acha ninguém / acha e é bloqueado). O CRM inteiro exigiu uma
   quarta: "aguardando intervalo mínimo entre ciclos" é o ciclo **adiado** para o
   próximo tick, não avaria — e eram 902 de 1.904 avaliações. Somá-la a "nunca
   dispara" faria espaçamento funcionando virar a maior falha do relatório.
   Origem: idem.

5. **O CRM tem UM cliente de verdade, e isso é o tamanho do buraco da promessa do
   site.** Não é o motor que dispara pouco: é que só uma casa ligou campanha. A
   outra, com 4.440 contactáveis, está com o canal INDISPONÍVEL — e campanha sem
   canal não produz uma mensagem. Antes de investigar o motor, pergunte quantas
   casas têm canal conectado E campanha ativa. Origem: idem.
