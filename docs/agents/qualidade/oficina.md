# Oficina — qualidade (corrente)

> Append-only. O agente escreve aqui; quem promove para a vitrine é o Diretor.

---

## 2026-08-04 · Auditoria de refutação: "a Evolution foi eliminada?"

**Pedido:** o Diretor pediu para tentar provar que a extração total da Evolution
(4 frentes, commits `f27b255..11aa618`) NÃO está pronta, antes de dizer ao CEO
"eliminada".

**Método:** li o código, não os relatórios. Recuperei o processador do webhook da
Evolution apagado (`git show f27b255~1:src/services/evolution/WebhookProcessorService.ts`)
e comparei linha a linha com o caminho novo da Meta. Rodei `npx tsc --noEmit`
(limpo, exit 0) e `npx vitest run` (1 falha / 4755 testes — apenas
`src/services/quality/noSideEffects.test.ts`, timeout de 5s, pré-existente e
declarada no briefing; **não** é regressão).

### Veredito global
**Código vivo da Evolution dentro do app Next: ZERO.** Confirmado — diretórios
`src/app/api/evolution`, `src/app/api/webhooks/evolution` e `src/services/evolution`
não existem; nenhum import, nenhuma chamada. **Mas a extração NÃO está encerrada:**
um caminho dos cinco tem buraco de paridade real, dois portões agendados passaram
a reprovar por campo fantasma, dois scripts de operação leem tabela dropada, e
quatro telas/manuais mentem para o lojista.

### Achados por gravidade

**P0-1 · Opt-out (LGPD) engolido em silêncio quando a conversa não tem cliente.**
`src/services/whatsapp/inbound/InboundGuardsService.ts:107` só aplica o opt-out
quando `input.customerId` existe. O webhook passa `conv.customerId`
(`src/app/api/webhooks/meta/whatsapp/route.ts:247`), e o ramo de conversa
JÁ EXISTENTE (`:298-311`) devolve o `customerId` gravado — que pode ser `null`,
porque a versão anterior deste mesmo arquivo criava conversa com
`customerId: customer?.id ?? null` a partir de um `findFirst`. O caminho da
Evolution NUNCA teve esse buraco: fazia `customer.upsert` antes de tudo
(`WebhookProcessorService.ts:193`) e chamava `applyInboundOptOut` sem condição
(`:244`). O próprio comentário em `route.ts:316` descreve o mecanismo exato — mas
a correção (upsert) foi aplicada só no ramo de CRIAÇÃO. Não há log, não há
contador. E `InboundGuardsService.test.ts:110-114` **certifica o buraco como
correto** (`applyInboundOptOut` não chamado + `aiMayRespond: true`).

**P0-2 · Dois portões agendados passaram a reprovar por campo que não existe.**
`.github/workflows/whatsapp-full-agent-diagnostic.yml:68,71` e
`whatsapp-live-learning-review.yml:71,73` leem `.safety.noEvolution`. O campo foi
renomeado para `noWhatsAppSend` (`fullAgentDiagnostic.ts:283`,
`liveLearningReview.ts:71`) — `jq` devolve `null`, o gate é `!= "true"` → `exit 1`
"safety violada", sempre. Falha fechada (satisfaz a lei 1 formalmente), mas vira
vermelho permanente por motivo falso: o time se acostuma e para de ler os sinais
reais (p0, Pix, pedido) que estão no mesmo bloco. **Bônus pré-existente:** o campo
sempre foi literal `true` hard-coded, e `LiveMonitor.test.ts:57` compara a
constante com ela mesma. O portão nunca provou nada nem quando estava verde.

**P1-3 · `metaCrmEnabled` virou porta de saída assimétrica.** Saiu da trava de
envio de propósito (`ScheduledCampaignRunnerService.ts:165-167`) mas continua
gateando o que faz o envio funcionar: submissão automática de modelos
(`api/cron/run-scheduled-campaigns/route.ts:88`), o ramo de modelo do resgate de
carrinho (`OrderDraftRecoverySendService.ts:569`) e a criação de campanha
(`api/cron/crm/create-custom-campaign/route.ts:39`). Loja que nunca clicou o
interruptor agora ENVIA, mas nunca ganha modelo aprovado — e audiência fria está
fora da janela de 24h, então tudo volta `BLOCKED`.

**P1-4 · Teto de envio subiu 18× para todo mundo, sem verificação.**
`src/lib/crm-safety.ts`: `applyEffectiveSafety` perdeu o parâmetro
`opts.metaOfficial`. Antes, 900/dia + 40/ciclo exigiam
`metaCrmEnabled === true && connectionStatus === "CONNECTED"`; sem isso valia a
rampa (20→250). Hoje é 900/dia e 40/ciclo incondicional. Justificável pelo canal
homologado, mas é uma mudança de risco de custo que ninguém decidiu explicitamente.

**P1-5 · Dois scripts de operação leem tabela dropada.**
`scripts/debug-cart-recovery.ts:91`, `scripts/diagnose-restaurant-mismatch.ts:86,304`
chamam `prisma.evolutionConfig.*`. O modelo saiu do schema e a tabela é dropada
pela migração. `tsconfig.json` exclui `scripts`, então `tsc --noEmit` passa limpo
— o portão de tipo é cego aqui por construção. Não quebra o deploy (não entram no
`next build`); quebram na primeira vez que alguém os rodar.

**P2 · Mentira em tela (guardrail 6: o alerta carrega a evidência — errada, aqui).**
- `crmExecutionClassification.ts:130` mapeia `META_190` (token da Meta expirado)
  para `EVOLUTION_AUTH_ERROR`; `CRMClient.tsx:1891` traduz isso em "🔑 Erro de
  autenticação da Evolution — verifique a chave/API da integração". O lojista é
  mandado procurar uma chave que não existe mais em lugar nenhum do produto.
- `CRMClient.tsx:3357`: "Modo seguro WhatsApp Web: até 5 envios por ciclo" — hoje
  são 40 (`META_CYCLE_LIMIT`).
- `SupportKnowledgeMap.ts:61,146-152`: o runbook do Agente de TI manda "Conferir
  /api/evolution/status" (404) e propõe `reconnect_evolution`.
- `manualV01Content.ts:569,927`: o manual diz que o endpoint único de webhook é
  `/api/webhooks/evolution`.

**P3 · Falsa confiança em relatório e comentário que descreve o que não existe.**
`WhatsAppAuditor.ts:127,243,248` e `registryMeta.ts:65` anunciam "0 chamada
Evolution" como garantia; `admin/agents/whatsapp/page.tsx:152,267` mostra "sem
Evolution". `MessageService.ts:184-187` afirma rotear "Meta Cloud API ou
Evolution" e "leaving Evolution-only restaurants untouched" — não é história, é
descrição errada do comportamento atual. `WhatsAppMessagingService.ts:2` se
declara "a porta ÚNICA de saída", mas 6 chamadores usam `activeProvider`
diretamente e pulam o portão de 24h.

### O que confirmei que FUNCIONA (tentei refutar e não consegui)
- **Comandos do Build OS:** interceptação antes do fluxo de cliente, com supressão
  dura mesmo quando o handler explode (`InboundAgentDispatch.ts:107-113`, travado
  em `InboundAgentDispatch.test.ts:128-137`).
- **Pedido por texto:** roteia pela Meta com o mesmo contrato do caminho antigo;
  `textOrderingHandled = handled && (replySent || handoffApplied)` preservado.
- **Resgate de carrinho:** `contextType === "CART_RECOVERY"` → handoff humano.
- **Atribuição de receita do CRM:** roda antes da decisão, inclusive quando a IA
  não vai responder.
- **Nenhum caminho alternativo de envio**, nem em erro de banco: falha de banco na
  janela de 24h devolve `WINDOW_LOOKUP_FAILED` sem enviar
  (`providerSelection.test.ts:84-91`) — isso é fail-closed de verdade, testado.
- **Todos os portões de canal do CRM falham fechados** (`crmWhatsAppChannel.ts:28-39`).
- **Nenhuma leitura das tabelas/colunas dropadas dentro de `src/`.**

### Não provado (não é achado; é o que eu não consigo verificar daqui)
- Se a janela de 24h passou a bloquear envios que antes saíam: depende de
  `META_WHATSAPP_ENABLED` e de `Restaurant.whatsappProvider` em produção — a coluna
  já foi dropada, então essa evidência não existe mais em lugar nenhum.
- Quantas conversas em produção têm `customerId = null` (tamanho do P0-1).

### Lição de método a propor
Renomear um campo que um portão de YAML lê por `jq` não quebra `tsc` nem `vitest`.
Foi o que aconteceu com `noEvolution` → `noWhatsAppSend`. Varredura de extração
tem que incluir `.github/workflows/` e `scripts/` — os dois diretórios que o
type-check exclui de propósito.
