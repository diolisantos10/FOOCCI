# WhatsApp Agent — Raio-X da Arquitetura Atual

> Auditoria **read-only** (diagnóstico, sem correções) — 2026-06-14, branch
> `claude/remove-legacy-runner-q8iXa`. Atualiza a fotografia de 2026-06-10
> incorporando o incidente real de atendimento e o hotfix `de14b42`.
> Pergunta-guia: **por que o WhatsApp não está vendendo sozinho de forma confiável?**
>
> Doc complementar (mergulho no roteamento): `docs/whatsapp-routing-raiox.md`.

---

## 1. Resumo executivo

O WhatsApp é hoje **dois sub-fluxos sob o mesmo webhook**: o **Recepcionista**
(host padrão — recepciona, não conduz venda) e o **Pedido por Texto** (anotador,
só para a allowlist). No teste real, o cliente **não estava na allowlist**, então
caiu — **corretamente** — no recepcionista; o problema foi o **comportamento do
recepcionista**: tratou pedido explícito como pergunta de catálogo (respondeu com
link gigante) e endereço solto como dúvida genérica (respondeu localização do
restaurante + handoff). O hotfix `de14b42` corrigiu esses dois comportamentos e
está em produção (runtime `64b928b`). A lacuna estrutural que escondeu o bug:
**nenhum diagnóstico/simulador exercita o caminho do recepcionista** — eles cobrem
só o Text Order. Recomendação: **manter FULL_TEST só para `…223` e não abrir** para
clientes reais até validar o caminho fora-da-allowlist em campo e fechar essa lacuna.

---

## 2. Estado de produção (Parte 0)

| Item | Valor | Fonte |
|---|---|---|
| enabled | **Sim** (config no DB) | resolveWaConfig |
| mode | **`ALLOWLIST_FULL_TEST`** | config-diagnostic / routing |
| scope | **`PHONE_ALLOWLIST`** | idem |
| paused | **não** | idem |
| allowlist | **1 número** (`…223`) | routing self-test |
| RESTAURANT_WIDE | **não** | proibido nesta fase |
| kill-switch global | **não** | `WHATSAPP_TEXT_ORDERING_ENABLED` |
| riskLevel | **MEDIUM** | configDiagnostic |

**Respostas de segurança (Parte 0):**
1. **Ativo para todos ou só allowlist?** → **Só allowlist** (`PHONE_ALLOWLIST`).
2. **Pode criar pedido real agora?** → **Sim, só para `…223`** (`ALLOWLIST_FULL_TEST`
   cria pedido real; DRY_RUN/REPLY_ONLY não). Qualquer outro número → recepcionista
   → **nunca** cria pedido.
3. **Pode gerar Pix real agora?** → **Sim, só para `…223`**, e só após confirmação final.
4. **Pode enviar mensagem real agora?** → Sim, é um canal de produção (Evolution).
   Mas os **diagnósticos** usados aqui são read-only (`noEvolution=true`).
5. **Risco de impactar cliente real durante o diagnóstico?** → **Não.** Esta rodada
   não tocou runtime/config, não chamou Evolution, não criou pedido/Pix. Todos os
   diagnósticos são herméticos/mascarados.

> Risco aberto: enquanto `…223` estiver em FULL_TEST, qualquer engano gera **cobrança
> real**. Aceitável só por ser o número de teste do time. **Não** abrir RESTAURANT_WIDE.

---

## 3. Arquitetura real (mapa de serviços — Parte 1)

### Entrada
- `Evolution webhook` → `WebhookParserService` → `WebhookProcessorService.process()`
- Build OS channel gate (admin) · `EvolutionConfigService.findRestaurantByInstance`
- Idempotência (`externalMessageId`) · `Customer.upsert` · `resolveConversation`
  (reuso OPEN/HUMAN, reabre RESOLVED < 24h)
- Persistência da `Message` INBOUND · `markCrmReplyIfApplicable` ·
  `ContactSafetyService.applyInboundOptOut` (LGPD) · cart-recovery → handoff

### Decisão
- `shouldAiRespond(conversation)` (`ConversationAiPolicyService`) — lock staff/
  supplier, aiEnabled, status HUMAN/RESOLVED, cart-recovery, opt-out
- `getMessageAwareRoutingDecision({restaurantId, phone, messageText, conversationId})`
  - `routingEligible = config.shouldUseTextOrdering` (enabled + !killswitch + !paused
    + telefone na allowlist quando `PHONE_ALLOWLIST`)
  - `messageHasOrderIntent = detectIntent(text) === "ORDER_REQUEST"` (`ordering/parser.ts`)
  - `hasActiveSession` = sessão de pedido aberta
  - **`wouldRouteToTextOrdering = routingEligible && (hasActiveSession || messageHasOrderIntent)`**
  - `effectiveFinalHandler` rebaixa p/ OLD agent em DRY_RUN

### Agentes/fluxos
- **Recepcionista:** `services/ai/WhatsAppReceptionistService.ts` (host padrão)
- **Text Order runtime:** `services/whatsapp/ordering/WhatsAppTextOrderingRuntimeService.ts`
- **State machine:** `WhatsAppOrderStateMachine.ts` (`advanceSession` puro) +
  `WhatsAppTextOrderService.processCustomerMessage` (gate de horário, LOOKUP_CEP)
- **Brain adapter:** `WhatsAppBrainReasoningAdapter.ts` (flip p/ ORDER_BY_TEXT) — não
  conectado ao Foocci Brain ainda
- Diagnósticos: Config / Routing / Flow / Full-Test Readiness / Simulator (Cockpit)

### Saída
- `EvolutionClient.sendTextMessage` · persistência OUTBOUND · system events
- `markConversationNeedsHuman` (handoff) · `WhatsAppOrderCreationService` (pedido) ·
  Pix · checkout bridge · freight quote · `lib/cep.ts` (ViaCEP)

### Fluxo em uma frase
```
inbound TEXT → WebhookProcessor → shouldAiRespond → getMessageAwareRoutingDecision
   ├─ wouldRouteToTextOrdering = true  → Text Order runtime (anota pedido)
   └─ caso contrário                   → Recepcionista (host: FAQ/menu/link/handoff)
```

---

## 4. Fluxo inbound → decisão → resposta (onde cada peça entra)

- **Recepcionista** entra quando o telefone **não** é elegível (fora da allowlist) ou
  a mensagem não é pedido e não há sessão. Nunca cria pedido/Pix.
- **Text Order** entra quando `routingEligible && (sessão || intenção de pedido)`.
- **Link `/pedido`** é enviado pelo recepcionista (opção cardápio/menu, FAQ de
  existência) e como fallback — **não** deve liderar resposta a pedido explícito
  (corrigido).
- **Handoff humano** dispara em COMPLAINT/HUMAN_REQUEST/ORDER_STATUS e (HUMAN_ASSISTED)
  UNKNOWN — **não** deve disparar por endereço solto (corrigido).

---

## 5. Casos reais reproduzidos (Parte 3 — herméticos)

Arquivo: `src/services/ai/tests/WhatsAppRealCaseDiagnostics.test.ts` (12 testes, sem
Evolution/pedido/Pix/DB). Resultado por caso:

| # | Mensagem | Esperado | Provado aqui | Catálogo/runtime |
|---|---|---|---|---|
| 1 | `ola` | menu/GREETING, rodapé `0. menu` | classifica GREETING ✅ | reset novo-dia em `run()` |
| 2 | `quero 1 yakisoba e 1 coca cola` | Text Order (allowlist), sem link | ORDER_REQUEST ✅; sem link ✅ | comanda/Coca-tie → matcher/SM |
| 3 | `quero yaksoba e coca` | entende Yakisoba | ORDER_REQUEST ✅ | typo → menuMatcher |
| 4 | `Quero 1 rodízio…\nTemakis grelhados` | pedido explícito, menu seguro | ORDER_REQUEST ✅; sem link/"temos" ✅ | conduzir temaki → campo |
| 5 | `tem temaki?` | pergunta, não inicia pedido | não-ORDER ✅ | — |
| 6 | `Rua Araraquara 60\nCidade…` | sem sessão: orienta; não localização/handoff | looseAddress ✅; sem localização/link ✅ | com sessão → CEP-first (SM) |
| 7 | entrega | CEP→endereço→número→frete→pagamento | — | `WhatsAppTextOrderFlow` |
| 8 | fora do horário | bloqueia antes da comanda | — | `WhatsAppLiveHotfix` |
| 9 | Pix | só após resumo; nunca real no simulador | — | `WhatsAppTextOrderFlow` |
| 10 | `falar com atendente` | handoff claro | HUMAN_REQUEST ✅ | — |

> Casos 7/8/9 dependem de catálogo/sessão → cobertos pelas suites de ordering citadas;
> não são hermeticamente assertáveis neste nível (registrado, não fingido).

---

## 6. Resultados dos diagnósticos (Parte 2)

Na runtime de produção atual (`64b928b`, que **inclui** o hotfix `de14b42`):

| Diagnóstico | Run | Resultado |
|---|---|---|
| Routing (self-test `…223`, mascarado) | 27504910586 | ✅ success → `TEXT_ORDER_FULL_TEST` |
| Simulator (hermético) | 27504911457 | ✅ success (`p0=0`, `runtimeTouched=false`, `noEvolution/noRealOrder/noRealPix=true`) |
| Full-Test Readiness (rodada anterior, mesmo runtime) | 27447729972 | ✅ success |

- `…223` → entra no Text Order (FULL_TEST). Qualquer outro telefone → recepcionista.
- `p0=0`, sem blockers; `runtimeTouched=false`; nenhum envio real.

---

## 7. Divergência simulador × produção (Parte 4/5)

**A divergência crítica:** os diagnósticos cobrem o **Text Order**, mas **não** o
**Recepcionista** — exatamente o caminho do cliente real.

| Ferramenta | Mesmo gate do webhook? | Testa resposta do recepcionista? | Mensagem |
|---|---|---|---|
| Routing Diagnostic | **Sim** (`getMessageAwareRoutingDecision`) | **Não** | fixa `"quero fazer um pedido"` |
| Simulador | Não (state machine direta, catálogo sintético) | **Não** | cenários canônicos |
| Full-Test Readiness | config/segurança | **Não** | — |
| Unit recepcionista + real-case | N/A (funções puras) | **Sim** | casos reais |

**Hotfix está em produção?** Sim — runtime `64b928b` ⊇ `de14b42`; 3 diagnósticos
verdes no mesmo SHA. A conversa que falhou aconteceu **antes** do hotfix.

---

## 8. Causa raiz (Parte 5)

| Hipótese | Veredito |
|---|---|
| Classificador do Text Order | **Não** — `detectIntent` já marcava "Quero 1 rodízio…" como ORDER_REQUEST |
| **Allowlist** | **SIM (parcial)** — número fora da allowlist → recepcionista (rota correta) |
| Roteamento para recepcionista | Correto pelo contrato; não é bug de rota |
| Sessão/conversa travada | Não evidenciado |
| **Recepcionista antigo ainda ativo** | **SIM** — é o host padrão e tratava pedido/endereço mal |
| Divergência simulador × runtime | **SIM (estrutural)** — diagnósticos não cobrem o recepcionista |
| Cardápio/fonte de dados | Não foi a causa do print |
| Horário | Bug anterior já corrigido (gate antes da comanda) |
| Fluxo endereço/frete | CEP-first já implementado; endereço solto sem sessão era o defeito |
| **Falta de testes com casos reais** | **SIM** — agora coberto por `WhatsAppRealCaseDiagnostics` |

**Raiz em uma frase:** roteamento correto + **host de fallback (recepcionista) com
comportamento ruim** para pedido explícito e endereço solto, **mascarado** por
diagnósticos que nunca exercitam o recepcionista.

---

## 9. Riscos P0/P1/P2

**P0 (quebra venda / impacta cliente real)**
- Correção fora-da-allowlist validada só em unit, **não em campo**.
- FULL_TEST cria **pedido + Pix reais** para `…223`.
- Diagnósticos **não cobrem** o caminho do recepcionista (cego ao caminho real).

**P1 (experiência ruim / fallback errado)**
- Opções numeradas literais do recepcionista (`1️⃣ Fazer pedido…`) não mapeiam 1:1 nas
  `menuOptions` configuradas — o "1" do cliente cai na 1ª opção configurada.
- `findCatalogMatch` ainda lidera com link em perguntas de existência.

**P2 (copy/clareza/polimento)**
- Dois `detectIntent` distintos (recepcionista vs parser) — risco de divergência.
- Brain adapter presente mas desconectado do Foocci Brain.

---

## 10. Matriz de decisão (Parte 6)

| Área | Status | Risco | Evidência | Próxima ação |
|---|---|---|---|---|
| Recepcionista | Corrigido (hotfix) | P0 | unit 115/115; sem validação em campo | validar fora-da-allowlist em campo |
| Text Order | Saudável (allowlist) | P1 | routing=FULL_TEST; simulador verde | golden-tests de catálogo real |
| Roteamento | Correto | P1 | gate único `getMessageAware…` | diagnóstico cobrir recepcionista |
| Allowlist | Restrito a `…223` | P0 | routing self-test | decidir política de abertura |
| Horário | Corrigido | P1 | LiveHotfix tests | manter cobertura |
| Cardápio | Funcional | P2 | matcher tipo-tolerante | dados reais no diagnóstico |
| CEP/Frete | Implementado (CEP-first) | P1 | TextOrderFlow tests | validar frete oficial em campo |
| Pix | Após confirmação | P0 | FULL_TEST = real p/ `…223` | revisar política de Pix real |
| Handoff | Seguro | P1 | HUMAN_REQUEST → handoff | confirmar IA cala pós-handoff |
| Simulador | Verde, mas incompleto | P0 | não testa recepcionista | adicionar cenários do host |

---

## 11. Bateria de testes recomendada (Parte 7)

- **Smoke:** `ola`, `0`, `cardápio`, `falar com atendente`.
- **Pedido:** yakisoba+coca, temaki, rodízio+item delivery, inexistente, typo, bebida ambígua.
- **Fechamento:** entrega, CEP, endereço salvo, retirada, dinheiro, cartão, Pix, confirmação final.
- **Exceções:** fora do horário, fora da área, telefone fora da allowlist, conversa em HUMAN,
  item indisponível, endereço cedo demais.

Status atual: smoke + classificação + recepcionista (pedido/endereço/handoff) já cobertos
hermeticamente; **falta** golden-test de catálogo real e cenários do recepcionista nos
diagnósticos de produção (P0/P1).

---

## 12. Backlog de reconstrução (Parte 8)

**P0 — antes de abrir para qualquer cliente real**
1. **Validar em campo** o caminho fora-da-allowlist (pedido→menu seguro; endereço→orientação).
   - causa: cobertura só unit · solução: teste de campo com número não-allowlisted ·
     serviço: WhatsAppReceptionistService · risco: baixo · aceite: print mostra menu seguro, sem link/handoff.
2. **Diagnóstico cobre recepcionista**: estender Routing/Flow Diagnostic para prever
   **host + tipo de resposta** (menu seguro vs link vs handoff) por mensagem.
   - serviço: `routingDiagnostic.ts` · teste: real-case via gate real · aceite: print do incidente reproduzido read-only.
3. **Política FULL_TEST/Pix real** decidida e allowlist conferida.

**P1 — esta semana**
4. Alinhar opções numeradas do recepcionista às `menuOptions` reais (ou torná-las selecionáveis).
5. Golden-tests do recepcionista nos cenários críticos (paridade com simulador).
6. `findCatalogMatch` nunca liderar com URL crua.

**P2 — depois**
7. Unificar os dois `detectIntent` (uma fonte de verdade).
8. Conectar Brain adapter ao Foocci Brain (fora do escopo de venda imediata).

---

## 13. Critério de "pronto" + próximo prompt recomendado

**Pronto só quando, em produção:** pedido explícito não cai no recepcionista com link;
cliente fora da allowlist recebe resposta segura; endereço solto não vira localização;
horário bloqueia cedo; entrega CEP→frete oficial; Pix só após confirmação; handoff
seguro; **simulador e produção passam pelos mesmos cenários críticos** (hoje **não**).

**Próximo prompt recomendado:**
> *P0 — Observabilidade do caminho do recepcionista + validação em campo fora da
> allowlist.* Estender o Routing/Flow Diagnostic (read-only, hermético) para, dado um
> telefone e uma mensagem, prever **qual host responde** e **o tipo de resposta**
> usando o mesmo gate do webhook; adicionar golden-tests do recepcionista; definir o
> roteiro de validação em campo com um número real **não-allowlisted** antes de abrir.

---

## Validações desta rodada (Parte 10)

`prisma generate` ok · `prisma validate` válido · `tsc --noEmit` limpo ·
`vitest src/services/{whatsapp,quality,brain,order}` **684/684** ·
`WhatsAppRealCaseDiagnostics` **12/12** · `npm run build` verde ·
produção: routing ✅ / simulator ✅ (runtime `64b928b`).
WaiterBrainV2 (19 falhas) **pré-existente** e fora de escopo — não tocado.
