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
