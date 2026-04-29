# FICHA TÉCNICA — FOOCCI (CRM Restaurante)

> Documento de referência completo para qualquer IA ou desenvolvedor assumindo este projeto.
> Última atualização: 2026-04-29 — branch `claude/remove-legacy-runner-q8iXa`

---

## 1. VISÃO GERAL

**FOOCCI** é uma plataforma SaaS de CRM para restaurantes com atendimento automatizado via WhatsApp. O núcleo do produto é um agente de IA que:

1. Recebe mensagens de clientes via WhatsApp (Evolution API)
2. Conduz o pedido de forma conversacional em português brasileiro
3. Aplica uma estratégia de vendas configurável por restaurante (upsell de bebida, sobremesa etc.)
4. Cria e confirma `OrderDraft` no banco de dados
5. Registra logs de interação para análise

O sistema é multi-tenant: cada restaurante tem seus próprios clientes, cardápio, configuração de IA e histórico de pedidos.

---

## 2. STACK TECNOLÓGICA

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript |
| Banco de dados | PostgreSQL via Prisma ORM |
| IA | OpenAI (GPT-4o / GPT-4o-mini, configurável por restaurante) |
| WhatsApp | Evolution API (self-hosted) |
| Deploy | Railway (Nixpacks, Node 18) |
| Auth | NextAuth.js |
| Pagamentos | MercadoPago, Stone |

**Branch de desenvolvimento ativo:** `claude/remove-legacy-runner-q8iXa`
**Repositório:** `diolisantos10/CRM_RESTURANTE`

---

## 3. ESTRUTURA DE ARQUIVOS (partes relevantes)

```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/evolution/route.ts   ← entrada de mensagens WhatsApp
│   │   ├── whatsapp-agent/route.ts       ← processamento do agente IA
│   │   ├── chat-sim/                     ← simulador de chat (UI)
│   │   │   ├── session/route.ts
│   │   │   └── message/route.ts
│   │   ├── ai-simulator/                 ← simulador em lote (batches)
│   │   │   ├── run/route.ts
│   │   │   └── status/route.ts
│   │   ├── menu/                         ← CRUD de cardápio
│   │   ├── orders/                       ← CRUD de pedidos
│   │   ├── customers/                    ← CRUD de clientes
│   │   └── brand-config/route.ts         ← configuração de IA/marca
│   └── (dashboard)/                      ← interface admin
├── services/
│   └── ai/
│       ├── AIOrderService.ts             ← ORQUESTRADOR principal (WhatsApp)
│       ├── AITools.ts                    ← ferramentas OpenAI + executores server-side
│       ├── PromptBuilderService.ts       ← montagem do system prompt completo
│       ├── BehaviorEngine.ts             ← bloco de comportamento/vendas (por SalesProfile)
│       ├── UpsellEngine.ts               ← motor de sugestões goal-driven
│       ├── ConversationGuardrails.ts     ← filtros, anti-repetição, rastreio de bebidas
│       ├── SalesProfile.ts               ← perfil de vendas derivado de BrandConfig
│       ├── BrandConfigService.ts         ← leitura/cache de RestaurantBrandConfig
│       ├── ChatSimService.ts             ← sessão de simulação individual (UI)
│       ├── AISimulatorService.ts         ← simulador em lote (cenários)
│       ├── AIInteractionLogger.ts        ← persiste AIInteractionLog
│       └── ScenarioGenerator.ts         ← geração de cenários de teste
└── lib/
    ├── prisma.ts                         ← cliente Prisma singleton
    └── openai.ts                         ← cliente OpenAI singleton
```

---

## 4. MODELO DE DADOS (Prisma — modelos principais)

### Restaurant
Tenant raiz. Tem `slug` único (usado nas URLs públicas), `plan` (STARTER/GROWTH/PREMIUM), e relação 1:1 com `RestaurantBrandConfig`.

### RestaurantBrandConfig
Configuração completa do agente de IA para o restaurante:
- `aiModel` — modelo OpenAI a usar
- `personality` — preset de personalidade: `traditional | fast | premium | young | aggressive`
- `upsellStyle` — intensidade: `none | gentle | moderate | proactive`
- `tone`, `formality`, `emojiUsage`, `communicationStyle`
- `targetTicket` (Decimal) — meta de valor por pedido
- `targetItems` (Int) — meta de itens por pedido
- `salesPriority` — `bestsellers | high_margin | promotions`
- `brandPersona` (JSON) — dados de persona da marca
- `maxHistoryMessages` — quantas mensagens anteriores incluir no prompt
- `systemPromptOverride` — prompt completo customizado (substitui o padrão)

### Customer
- `phone` — único por restaurante (identificador WhatsApp)
- `totalOrders`, `totalSpend`, `lastOrderAt` — métricas CRM
- Relação 1:1 com `CustomerPreference` (dietary[], allergies[], notes)

### Conversation
- `status`: `BOT | HUMAN | CLOSED`
- `customerId`, `restaurantId`
- Ligada a `Message[]` e `AIInteractionLog[]`

### Message
- `direction`: `INBOUND | OUTBOUND`
- `type`: `TEXT | IMAGE | AUDIO | ...`
- `content`, `sentAt`

### OrderDraft
- `status`: `OPEN | CONFIRMED | CANCELLED`
- `fulfillmentType`: `DELIVERY | PICKUP | DINE_IN`
- `subtotal`, `totalAmount` (Decimal)
- Tem `OrderDraftItem[]` com `menuItemId`, `quantity`, `unitPrice`

### Order
Pedido confirmado. Criado a partir de `OrderDraft` por `confirm_order`.

### AIInteractionLog
Registro de cada turno da IA:
- `conversationId`, `restaurantId`, `customerId`
- `userMessage`, `aiResponse`
- `toolCalls` (JSON) — array de `{ name, args, result }` — **crítico para rastreio de bebidas e anti-repetição**
- `turnNumber`, `estimatedCostUsd`

### MenuCategory / MenuItem
- `MenuCategory`: `restaurantId`, `name`, `isActive`, `sortOrder`
- `MenuItem`: `categoryId`, `id` (cuid), `name`, `description`, `ingredients`, `price`, `isActive`

---

## 5. PIPELINE DO AGENTE DE IA

### Fluxo principal (WhatsApp → resposta)

```
Evolution API webhook
        ↓
/api/webhooks/evolution/route.ts
        ↓
AIOrderService.processMessage(conversationId, restaurantId, customerId, messageText)
        ↓
  1. Persiste mensagem INBOUND no banco
  2. Carrega BrandConfig, CustomerPrefs, SalesProfile
  3. getDrinkAttemptCount() — conta tentativas de bebida de turnos anteriores
  4. getAlreadySuggestedItems() — itens já sugeridos (com nomes)
  5. UpsellEngine.suggest() — calcula sugestões goal-driven para este turno
  6. PromptBuilderService.build() — monta [systemMessage, ...history]
  7. Injeta sysAddendum: upsell candidates + metas + dietary + anti-repeat
  8. Loop tool-call OpenAI (máx 6 iterações):
       → chat.completions.create()
       → Se tool_calls → executeTool() → loop
       → Se stop/length → finalResponse
  9. Persiste mensagem OUTBOUND
 10. AIInteractionLogger.log() — salva toolCalls no AIInteractionLog
 11. Envia resposta via Evolution API (WhatsApp)
```

### ChatSimService (simulador UI — sem WhatsApp)
Mesmo pipeline acima, mas:
- Cria Customer/Conversation temporários no banco (`[CHATSIM]`)
- Não chama Evolution API
- `deleteSession()` limpa todos os registros temporários ao final

---

## 6. FERRAMENTAS DO AGENTE (AITools.ts)

Todas as ferramentas são executadas server-side. A IA nunca define preços — todos vêm do banco.

| Ferramenta | O que faz | Validações server-side |
|---|---|---|
| `add_item` | Adiciona item ao OrderDraft | menuItemId validado contra cardápio do restaurante |
| `remove_item` | Remove item do draft | localizado por menuItemId dentro do draft |
| `update_quantity` | Atualiza quantidade | idem |
| `suggest_upsell` | Exibe card de produto com imagem/preço/botão | menuItemId validado; incrementa `drinkAttemptsThisTurn` se for bebida |
| `confirm_order` | Converte draft em Order | DRINK GATE (ver §8); draft não pode estar vazio |
| `handoff_to_human` | Transfere para atendente humano | muda `Conversation.status` → HUMAN |

### ToolContext (estado por turno)
```typescript
interface ToolContext {
  restaurantId: string;
  conversationId: string;
  customerId: string;
  draftId: string | null;
  setDraftId: (id: string) => void;
  requestHandoff: (reason: string) => void;
  upsellSuggestedThisTurn: boolean;      // evita 2 suggest_upsell no mesmo turno
  drinkAttemptsThisTurn: number;         // incrementado em execSuggestUpsell
  drinkAttemptsPriorTurns: number;       // carregado de AIInteractionLog ao início do turno
}
```

---

## 7. MOTOR DE VENDAS — ESTÁGIOS

O system prompt instrui a IA a seguir um fluxo de estágios por conversa:

| Estágio | Quando | Ação |
|---|---|---|
| 1 — ENTRADA | Primeira mensagem | Cumprimentar, perguntar o que deseja |
| 2 — SELEÇÃO PRINCIPAL | Sem prato no carrinho | Ajudar a escolher prato principal |
| 3 — UPSELL BEBIDA | Prato no carrinho, sem bebida | Obrigatório ≥2 tentativas de bebida |
| 4 — UPSELL SOBREMESA | Bebida tentada, sem sobremesa | 1 tentativa de sobremesa |
| 5 — REVISÃO | Cobertura completa | Resumo do pedido → `confirm_order` |
| 6 — CONFIRMADO | `confirm_order` executado | Mensagem de conclusão |

**Classificação do cliente:**
- `BROWSING` — silencioso; IA não interrompe até seleção
- `GUIDED` — pediu ajuda; IA conduz ativamente

---

## 8. GUARDRAILS E REGRAS SERVER-SIDE

### 8.1 FINAL INTENT LOCK (prompt)
Quando cliente envia sinal de fechamento ("pode fechar", "finaliza", "tá bom assim" etc.):
- `state.stage = CHECKOUT` — transição permanente
- PROIBIDO: sugerir qualquer produto, abrir nova categoria
- **Única exceção:** se bebida com 0 tentativas → 1 tentativa de bebida → `confirm_order`
- Em qualquer outro caso → `confirm_order` imediato

### 8.2 DRINK PRIORITY ENGINE (server-side — AITools.ts `execConfirmOrder`)
Gate hard no servidor — não depende da IA lembrar:
```
Se cart não tem prato principal → bloqueia com mensagem
Se (sem bebida no carrinho) E (totalDrinkAttempts < 2) → bloqueia:
   retorna success:false + instrução para chamar suggest_upsell(bebida)
totalDrinkAttempts = drinkAttemptsPriorTurns + drinkAttemptsThisTurn
```

### 8.3 ITEM VALIDATION HARD LOCK (prompt + server)
- Prompt: "antes de add_item, confirme ID EXATO no cardápio; se não encontrado, NÃO chame add_item"
- Server: `execAddItem` valida `menuItemId` contra `MenuItem` do restaurante antes de qualquer operação
- `success:false` → IA não pode retry com outro ID

### 8.4 DIETARY HARD RULE (prompt + sysAddendum)
- Sysaddendum injeta por turno: `⚠️ RESTRIÇÕES ALIMENTARES ATIVAS` quando cliente tem preferências
- Regra 15 no prompt: todos os itens sugeridos/adicionados devem ser compatíveis
- `isBlockedByDietary()` em `ConversationGuardrails.ts` — filtro no UpsellEngine

### 8.5 ANTI-REPETIÇÃO (prompt + ConversationGuardrails)
- `getAlreadySuggestedItems(conversationId)` — lê `AIInteractionLog.toolCalls` de turnos anteriores, extrai todos os `suggest_upsell.menuItemId`, enriquece com nomes do cardápio
- Sysaddendum injeta lista de itens já sugeridos com nome (não só ID)
- Regra 8 no prompt: itens em `alreadySuggestedIds`/`rejectedIds` → PROIBIDO repetir

---

## 9. UPSELL ENGINE (UpsellEngine.ts)

Scoring de candidatos (por categoria ainda não coberta no carrinho):

```
score = 0.60 × gapFit + 0.30 × popularity + 0.10 × marginProxy
```

Quando metas já atingidas:
```
score = 0.60 × popularity + 0.40 × marginProxy
```

Filtros aplicados antes do scoring:
1. `excludeIds` (alreadySuggestedIds) — anti-loop
2. `isBlockedByDietary()` — restrições alimentares
3. `isActive = true` no cardápio
4. Ordenação final: mains primeiro, desserts por último (`sortByCategory`)

---

## 10. BEHAVIOR ENGINE (BehaviorEngine.ts)

Transforma `SalesProfile` em bloco de texto injetado no system prompt.
Cada `personality` gera instruções completamente diferentes:

| Preset | Persona | Estilo |
|---|---|---|
| `traditional` | Sofia | Calorosa, acolhedora, usa nome do cliente |
| `fast` | Max | Objetiva, 2 frases, sem floreios |
| `premium` | Laurent | Formal, elegante, descreve ingredientes |
| `young` | Bea | Casual, emojis, "Boa!", "Arrasou!" |
| `aggressive` | Nico | Orientado a conversão, FOMO sutil |

---

## 11. CONFIGURAÇÃO DE DEPLOYMENT (Railway)

- **Plataforma:** Railway com builder Nixpacks
- **Node:** 18.x (nixpacks.toml)
- **Build:** `prisma generate && next build`
- **Start:** `npm run start`
- **Env vars críticas:** `DATABASE_URL`, `OPENAI_API_KEY`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **Aviso:** `@aws-sdk` e `pdf-parse` emitem `EBADENGINE` (Node 18 vs ≥20) — são `warn`, não erros; build não falha por isso

---

## 12. HISTÓRICO DE FUNCIONALIDADES IMPLEMENTADAS (nesta branch)

| Commit | Funcionalidade |
|---|---|
| `e4132e5` | Anti-repeat: `getAlreadySuggestedItems` com nomes, `rejectedIds` no prompt |
| `1b0009f` | Checkout Lock: `confirm_order` imediato em sinal de fechamento |
| `4fbfb54` | Item Validation Hard Lock: zero tolerância a IDs inventados |
| `5361db7` | Dietary Hard Rule: bloqueia itens incompatíveis em todos os caminhos |
| `9caebfd` | Drink Priority Engine: gate server-side em `confirm_order` |
| `e9cda3f` | Build Fix: `drinkAttemptsThisTurn/PriorTurns` em todos os `ToolContext` |
| `025c716` | Final Intent Lock: `state.stage = CHECKOUT` em sinal de fechamento |

---

## 13. ARQUIVOS MAIS IMPORTANTES PARA ENTENDER O PROJETO

1. `src/services/ai/AIOrderService.ts` — orquestrador; começa aqui
2. `src/services/ai/PromptBuilderService.ts` — todas as regras da IA (system prompt completo)
3. `src/services/ai/AITools.ts` — definições + executores das ferramentas; guardrails hard
4. `src/services/ai/BehaviorEngine.ts` — personalidade e estratégia de vendas
5. `src/services/ai/ConversationGuardrails.ts` — filtros, anti-repeat, drink count
6. `src/services/ai/UpsellEngine.ts` — seleção de produtos para sugerir
7. `prisma/schema.prisma` — modelo de dados completo

---

## 14. CONVENÇÕES DO PROJETO

- **Nunca chamar Evolution API no simulador** — `ChatSimService` e `AISimulatorService` são sandbox
- **Preços sempre vêm do banco** — IA nunca define preços
- **IDs de menu são cuid()** — gerados pelo Prisma, nunca inventados pela IA
- **`AIInteractionLog.toolCalls`** é a fonte de verdade para histórico de sugestões e tentativas de bebida — nenhuma outra tabela armazena isso
- **TypeScript strict** — Next.js type-check em build; erros de tipo quebram o deploy no Railway
- **Commits em inglês**, mensagens no formato `feat/fix/chore(escopo): descrição`
