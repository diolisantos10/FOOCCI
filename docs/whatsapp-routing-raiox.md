# WhatsApp — Raio-X de Roteamento (pedido real caindo no recepcionista/link)

> Rodada de **diagnóstico**, não de remendo. Objetivo: descobrir exatamente
> onde a arquitetura real quebra antes de abrir o WhatsApp para clientes reais.
>
> Data: 2026-06-14 · Branch: `claude/remove-legacy-runner-q8iXa` · Restaurante
> de referência: **Sushi Cazza** (`sushi-cazza`).

---

## 1. O que aconteceu no teste real (o print)

| Mensagem do cliente | Resposta da IA (errada) | Esperado |
|---|---|---|
| `Quero 1 rodízio completo por favor` / `Temakis grelhados` | "Temos Temakis sim 😊 … faça seu pedido pelo cardápio:" **+ link gigante** | Anotar pedido por texto (allowlist) **ou** menu numerado seguro (fora da allowlist) |
| `Rua Araraquara 60` / `Cidade Kemel Poá` | Falou da **localização do restaurante** + **encaminhou para humano** | Orientar a iniciar o pedido / CEP, sem localização e sem handoff |

O número do teste **não estava na allowlist** do Text Order.

---

## 2. Arquitetura real do WhatsApp (estado atual)

```
Evolution (webhook)
        │  POST /api/evolution/webhook
        ▼
WebhookProcessorService.process()
        │  (idempotência, lock staff/supplier, opt-out, cart-recovery)
        ▼
shouldAiRespond(conversation)  ── não ──▶ IGNORA / HUMANO
        │ sim + messageType === TEXT
        ▼
getMessageAwareRoutingDecision({ restaurantId, phone, messageText, conversationId })
        │   routingEligible = config habilitada + telefone na allowlist (PHONE_ALLOWLIST)
        │   messageHasOrderIntent = detectIntent(text) === ORDER_REQUEST   (parser.ts)
        │   hasActiveSession = sessão de pedido aberta
        │   wouldRouteToTextOrdering = routingEligible && (hasActiveSession || messageHasOrderIntent)
        ▼
   ┌────────────────────────────┬──────────────────────────────────────────┐
   │ wouldRouteToTextOrdering    │  caso contrário                          │
   ▼                            ▼                                            
WhatsAppTextOrderingRuntime   WhatsAppReceptionistService (agente ANTIGO = HOST padrão)
 (anotador por texto)          - intenção própria (GREETING/ORDER/MENU/…)
 - máquina de estados          - opção numerada selecionada
 - CEP-first + frete           - knowledge base
 - WOULD_/REAL conforme mode   - findCatalogMatch (link)  ◀── origem do "link gigante"
                               - GPT (UNKNOWN)            ◀── origem da "localização + handoff"
```

**Contrato de roteamento:** o recepcionista antigo é o **host padrão** da conversa.
O Text Order é uma **ferramenta de anotação** que só entra quando o cliente está
de fato pedindo **e** está habilitado para aquele telefone.

### 2.1 Onde entra cada peça

- **Recepcionista** (`src/services/ai/WhatsAppReceptionistService.ts`): host padrão;
  saudação, FAQ, link do cardápio, handoff. **Nunca** cria pedido/Pix.
- **Text Order** (`src/services/whatsapp/ordering/*`): anotador por texto. Só roda
  para telefone elegível (allowlist) com intenção/sessão. Cria pedido/Pix **apenas**
  em `ALLOWLIST_FULL_TEST` (ver §3).
- **Link `/pedido`**: cardápio web identificado (waToken). Enviado pelo recepcionista
  (opção "ver cardápio"/menu) e como fallback. Era enviado **erroneamente** como
  corpo primário para pedidos explícitos — corrigido (ver §6).
- **Handoff humano** (`markConversationNeedsHuman`): disparado em COMPLAINT,
  HUMAN_REQUEST, ORDER_STATUS e (HUMAN_ASSISTED) UNKNOWN. Era disparado
  **indevidamente** por endereço solto via GPT — corrigido.

---

## 3. Estado real de produção (Sushi Cazza)

| Item | Valor |
|---|---|
| Text Ordering habilitado | **Sim** (config no DB) |
| `mode` | **`ALLOWLIST_FULL_TEST`** |
| `scope` | **`PHONE_ALLOWLIST`** |
| allowlist | **1 número** (`…223`) |
| riskLevel | MEDIUM |
| `RESTAURANT_WIDE` | **não** (proibido nesta fase) |

**WhatsApp está aberto só para a allowlist.** Todo número fora dela cai no
recepcionista antigo.

**Pode criar pedido/Pix agora?**
- Para `…223` (allowlist) → **SIM**: `ALLOWLIST_FULL_TEST` cria **pedido real** e
  **Pix real** (`WhatsAppOrderCreationService`: FULL_TEST → cria de verdade;
  DRY_RUN/REPLY_ONLY → só `WOULD_*`).
- Para qualquer outro número → **NÃO**: recepcionista nunca cria pedido/Pix.

---

## 4. Causa raiz (por que o cliente real caiu no recepcionista/link)

**Não foi rota errada, nem status de conversa, nem classificador do Text Order.**
Foi uma combinação de **allowlist + comportamento do recepcionista**:

1. **Allowlist:** o número do teste estava **fora** da `PHONE_ALLOWLIST`, então
   `routingEligible = false` e `wouldRouteToTextOrdering = false`. Pelo contrato,
   isso **corretamente** roteia para o recepcionista. (O `detectIntent` do parser
   **já** classificava "Quero 1 rodízio…" como `ORDER_REQUEST` — não era o gargalo.)
2. **Recepcionista — pedido explícito:** o `ORDER_RE` do recepcionista é estreito
   (`quero (pedir|comprar)`), então "quero 1 rodízio" virava `UNKNOWN`; o
   `findCatalogMatch` encontrava a categoria "temakis" e respondia
   **"Temos Temakis sim 😊 … cardápio: {link gigante}"**.
3. **Recepcionista — endereço solto:** nenhum `ADDRESS_RE` batia em "Rua Araraquara
   60", virava `UNKNOWN` → GPT → **localização do restaurante + handoff**.

> Diagnóstico de uma frase: *o roteamento estava certo; o host de fallback
> (recepcionista) tratava pedido explícito e endereço solto de forma ruim.*

---

## 5. Os diagnósticos testam o mesmo caminho do webhook real?

**Parcialmente — esta é a divergência mais importante.**

| Ferramenta | Usa o gate real do webhook? | Testa resposta do recepcionista? | Mensagem testada |
|---|---|---|---|
| Routing Diagnostic (`/api/cron/.../text-order-routing-diagnostic`) | **Sim** — chama o mesmo `getMessageAwareRoutingDecision` | **Não** | fixa: `"quero fazer um pedido"` |
| Simulador (`runTextOrderSimulator`) | **Não** — chama a máquina de estados direto, catálogo sintético | **Não** | cenários canônicos |
| Full-Test Readiness | config/segurança | **Não** | — |
| Testes unitários do recepcionista | **N/A** (funções puras) | **Sim** | os casos reais do print |

**Conclusão:** simulador e diagnósticos de produção cobrem o **Text Order** (caminho
da allowlist), mas **nenhum exercita a resposta do recepcionista** a um número fora
da allowlist — exatamente o caminho que o cliente real percorreu. Essa é a lacuna
que mascarou o bug em todos os "verdes" anteriores.

---

## 6. O que foi corrigido (commit `de14b42`, rodada anterior)

- **`parser.ts`** (`detectIntent` compartilhado): reforço de `pode mandar|pode ser`
  para `quero/manda/Nx/quantidade+item → ORDER_REQUEST`; `tem X?`/`qual…?` seguem
  pergunta.
- **Recepcionista — pedido explícito fora da allowlist:** curto-circuito que
  responde com caminho numerado limpo (sem URL crua, sem "temos X sim").
- **Recepcionista — endereço solto sem sessão:** `looksLikeLooseAddress`; orienta a
  iniciar pedido/CEP, **sem** localização e **sem** handoff automático.
- ~40 testes unitários novos (115/115 no arquivo do recepcionista; 427/427 ordering).

> Ainda **não** validado em campo para número fora da allowlist (precisa de uma
> mensagem real de um número não-allowlisted). A prova hoje é unitária.

---

## 7. Casos reais — status

| Caso | Allowlist (`…223`) | Fora da allowlist |
|---|---|---|
| "Quero 1 rodízio… temakis grelhados" | Entra no Text Order (anota) ✅ provado por unit+routing | Menu numerado seguro ✅ provado por unit / ⚠️ não validado em campo |
| "Rua Araraquara 60 / Cidade…" | Sessão ativa → CEP-first ✅ | Orientação sem localização/handoff ✅ unit / ⚠️ não validado em campo |
| Horário fechado | Bloqueia antes da comanda ✅ (hotfix anterior) | Recepcionista responde fechado ✅ |
| Pix | Só após resumo/confirmação ✅ (FULL_TEST) | N/A (recepcionista não gera) |

---

## 8. Riscos

| Sev | Risco | Observação |
|---|---|---|
| **P0** | Correção do recepcionista para número fora da allowlist **não validada em campo** | Cobertura só unitária; o caminho real nunca foi exercitado por diagnóstico de produção |
| **P0** | `ALLOWLIST_FULL_TEST` cria **pedido + Pix reais** para `…223` | Aceitável só enquanto for o número de teste do time; qualquer engano vira cobrança real |
| **P1** | Diagnósticos não cobrem o caminho do recepcionista | Bugs do host de fallback passam despercebidos nos "verdes" |
| **P1** | Resposta numerada do recepcionista usa rótulos literais ("1️⃣ Fazer pedido pelo cardápio") que **não** mapeiam 1:1 nas `menuOptions` configuradas | "1" do cliente cai na 1ª opção configurada; geralmente é cardápio, mas não garantido |
| **P2** | `findCatalogMatch` ainda envia link para perguntas de existência ("tem combos?") | Comportamento aceitável, mas é a mesma fonte do link gigante |
| **P2** | Dois `detectIntent` distintos (recepcionista vs parser) | Risco de divergência futura de classificação |

---

## 9. Matriz de decisão

| Pergunta | Resposta |
|---|---|
| Por que o cliente caiu no recepcionista/link? | Número fora da allowlist (rota correta) + recepcionista tratava pedido/endereço mal |
| Foi allowlist, classificador, status ou rota? | **Allowlist** (elegibilidade) + **comportamento do host**. Não foi classificador do Text Order, status nem rota errada |
| Diagnósticos testam o caminho real? | Só o do Text Order; **não** o do recepcionista (lacuna) |
| O hotfix anterior estava em produção? | Sim — `de14b42` deployado; 3 diagnósticos verdes no mesmo SHA |
| Quais casos reais ainda falham? | Nenhum provado falhando; mas o caminho fora-da-allowlist **não foi validado em campo** |
| Manter FULL_TEST allowlist ou pausar? | **Manter FULL_TEST só para `…223`**; **não** abrir para clientes reais ainda |

---

## 10. Backlog objetivo de reconstrução (priorizado)

**P0 — antes de abrir para qualquer cliente real**
1. Validar em campo o caminho **fora da allowlist** (pedido explícito → menu seguro;
   endereço solto → orientação) com um número real não-allowlisted.
2. Estender o **Routing Diagnostic** para avaliar (read-only, hermético) as
   mensagens reais do print, incluindo a previsão de qual host responderia e qual
   seria o **tipo** de resposta (menu seguro vs link) — fechar a lacuna do §5.
3. Decidir explicitamente a política de `FULL_TEST` (pedido/Pix real) e quem está na
   allowlist.

**P1**
4. Diagnóstico/golden-test que cubra o **recepcionista** nos cenários críticos
   (pedido explícito, endereço solto, fechado, FAQ) — paridade com o simulador.
5. Alinhar a resposta numerada do recepcionista às `menuOptions` reais (ou tornar
   as opções literais selecionáveis de verdade).

**P2**
6. Unificar os dois `detectIntent` (uma fonte de verdade de intenção).
7. Revisar `findCatalogMatch` para nunca liderar com URL crua.

---

## 11. O que precisa ser P0 antes de abrir para qualquer cliente real

- Caminho fora-da-allowlist **validado em campo** (não só unit).
- Diagnóstico que exercite o **mesmo caminho do webhook** para o recepcionista.
- Política de FULL_TEST/Pix real decidida e allowlist conferida.
- Critérios do "Princípio Final" (§12) todos verdes em produção, não só no simulador.

---

## 12. Critério de "pronto" (Princípio Final)

O WhatsApp só volta a ser considerado pronto quando, **em produção**:
- pedido explícito **não** cai no recepcionista com link gigante;
- cliente fora da allowlist recebe resposta **segura** (menu numerado);
- endereço solto **não** vira localização do restaurante nem handoff;
- horário bloqueia **cedo** (antes da comanda);
- entrega segue **CEP → frete oficial**;
- **Pix só após** confirmação final;
- handoff é seguro;
- **simulador e produção passam pelos mesmos cenários críticos** (hoje **não** passam — §5).

---

## 13. Recomendação

Manter o WhatsApp em **`ALLOWLIST_FULL_TEST` apenas para `…223`**. **Não abrir**
para clientes reais até concluir os itens P0 do §10. A causa raiz está entendida e
o remendo já está em produção; o que falta é **fechar a lacuna de observabilidade**
(diagnóstico do caminho do recepcionista) e **validar em campo**.

---

## 14. Host Routing Diagnostic (fecha a lacuna do §5/§11)

Rota nova, read-only: **`POST /api/cron/whatsapp/host-routing-diagnostic`**
(`CRON_SECRET`). Para um `telefone + mensagem`, responde **qual host responderia**
e — quando é o recepcionista — **prevê e classifica a resposta**. É a primeira
ferramenta que exercita o **caminho do recepcionista** com o **mesmo gate do
webhook**.

### O que agora é coberto
- `decision.host`: `TEXT_ORDER` · `RECEPTIONIST` · `HUMAN_BLOCKED` · `IGNORED`,
  com `reason` (fora da allowlist / pausado / mode / scope / conversa em HUMAN /
  aiLocked / sem intenção).
- `receptionistPreview.responseType`: `SAFE_MENU` · `LINK_CARDAPIO` · `HANDOFF` ·
  `LOCATION` · `UNKNOWN`, mais flags `containsRawLink` / `containsHandoff` /
  `containsRestaurantLocation` / `endsWithMenuFooter` e o `preview` do texto.
- **Fonte única de verdade:** o recepcionista (`run()`) loga `responseType` via a
  MESMA `classifyReplyText`, e o diagnóstico classifica o `previewReceptionistResponse`
  com a mesma função → o diagnóstico **não diverge** da produção.

### Diferença Text Order × Recepcionista
- **Text Order** entra só com `routingEligible && (sessão || intenção de pedido)`
  (telefone na allowlist + modo que responde). Anota pedido.
- **Recepcionista** é o host padrão para todo o resto (fora da allowlist, saudação,
  FAQ, endereço solto). Nunca cria pedido/Pix.

### Como testar um telefone/mensagem
```bash
curl -X POST "$BASE/api/cron/whatsapp/host-routing-diagnostic" \
  -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"restaurantSlug":"sushi-cazza","phone":"+55...","message":"Quero 1 rodízio completo\nTemakis grelhados"}'
```
`phone` vazio = self-test do primeiro allowlisted (mascarado). Workflow:
`whatsapp-host-routing-diagnostic.yml` roda os 5 cenários canônicos.

### Limitações
- O **branch GPT/knowledge** do recepcionista é não-determinístico: o preview marca
  `deterministic=false` / `responseType=UNKNOWN` (não tenta adivinhar a resposta do
  GPT). O diagnóstico cobre com precisão os **branches determinísticos** (back-to-menu,
  opção selecionada, endereço solto, pedido explícito, handoff, template, catálogo).
- Não considera a base de conhecimento (`RestaurantKnowledgeService`) — uma resposta
  de KB apareceria como `UNKNOWN` no preview.
- Frete/Pix/horário do **Text Order** continuam cobertos pelas suites de ordering, não
  por este diagnóstico (que é do caminho do recepcionista).
