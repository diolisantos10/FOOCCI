# HANDOFF — Garçom: Consolidação do Pipeline de IA e Hub Testar IA

**Repositório:** diolisantos10/CRM_RESTURANTE (público)  
**Branch commitada:** `claude/fresh-debug-session-C3qhF`  
**Data:** 2026-08-01  
**PM que escreveu:** Claude (sessão fresh-debug-session-C3qhF)

---

## 1. O que é o projeto e a stack real

Sistema operacional para restaurantes com duas superfícies: painel do lojista (Foocci, laranja) e loja white-label do cliente final (/pedido/[slug]).

**Stack real (package.json):**
- Next.js 14.2.35 (App Router)
- React 18.3.1
- TypeScript 5.5.3
- Tailwind CSS 3.4.6
- Prisma 5.16.1 + PostgreSQL
- OpenAI SDK ^6.29.0
- next-auth 4.24.7
- deploy: Railway

---

## 2. Decisões tomadas nesta sessão

### 2a. Hub Testar IA (`/test-ai`) — reconstrução iterativa
**Data:** 2026-08-01  
**Decisão:** `/test-ai` é o único ponto de entrada para testar o Garçom. A rota `/chat-sim` existe mas é acessada pelo hub.  
**Porquê:** Antes havia duplicidade (/chat-sim e /test-ai), cada um com configuração diferente. Unificar evita que o lojista teste num ambiente diferente do que vai para o cliente.  
**Implementação:**
- `TestAIHubClient.tsx` — hub com top bar (título + toggle Mobile/Desktop + Nova sessão) + phone frame (390×700) no modo mobile + dois cards à direita (Teste externo com QR + Status da IA)
- `ChatSimClient.tsx` — mudado de `h-[calc(100vh-56px)]` para `h-full` para ser embutível
- `chat-sim/page.tsx` — wrapper adicionado com `h-[calc(100vh-56px)]` para manter comportamento standalone
- Sidebar: `extraActivePaths: ["/chat-sim"]` no item Testar IA → ambas as rotas ficam com o item ativo

**Tentativa que não funcionou:** iframe embutindo /chat-sim foi rejeitado pelo browser via X-Frame-Options. Removido e substituído por componente direto.

### 2b. Prioridade visual no Atendimento (`AtendimentoClient.tsx`)
**Data:** 2026-08-01  
**Decisão:** Cada conversa e pedido ativo recebe um nível de prioridade visual (critical/attention/ok) com borda colorida + dot animado.  
**Porquê:** O lojista precisa identificar imediatamente o que precisa de ação sem ler cada item.  
**Implementação:**
- `convPriorityLevel(conv)` → status OPEN+unread = critical, OPEN/HUMAN = attention, rest = ok
- `orderPriorityLevel(status, createdAt)` → pedido >20min sem READY/OUT_FOR_DELIVERY = critical
- Borda 2px (red/amber/gray) + banner colorido no `ActiveOrderPanel`

### 2c. Consolidação do pipeline legado de IA
**Data:** 2026-08-01  
**Decisão:** Eliminar os 13 arquivos do pipeline legado e centralizar em `WebOrderService.ts`.  
**Porquê:** O pipeline legado (`runner.ts` + 12 helpers) tinha temperatura 0.2 (inconsistente com AIOrderService que usa 0.3), max_tokens hard-coded em 200 (muito curto — respostas eram truncadas), e estava espalhado em 4 diretórios diferentes. Pior: o `runner.ts` estava sendo importado em `route.ts` mas o `route.ts` JÁ HAD sido migrado para `AIOrderService.runWebTurn()` — o import era letra morta.

**Arquivos deletados (13):**
```
src/lib/ai-context/runner.ts
src/lib/ai-context/builder.ts
src/lib/ai-context/filter.ts
src/lib/ai-context/types.ts
src/lib/agent/builder.ts
src/lib/agent/personality.ts
src/lib/agent/sales.ts
src/lib/agent/protocol.ts
src/lib/agent/types.ts
src/lib/sales/flow.ts
src/lib/sales/suggest.ts
src/lib/sales/opportunity.ts
src/lib/order/orchestrator.ts
```

**Arquivo criado:**
`src/services/ai/WebOrderService.ts` — consolida toda a lógica dos 13 arquivos em um único arquivo (~800 linhas), com temperatura 0.3 e sem max_tokens hard-coded.

**Exports públicos:** `runTurn(input: TurnInput): Promise<TurnOutput>` e o tipo `OrderStage`.

**Importações atualizadas:**
- `AIOrderService.ts`: `OrderStage` agora vem de `@/services/ai/WebOrderService`
- `route.ts` de `/api/pedido/[slug]`: mesmo `OrderStage`

---

## 3. O que foi tentado e NÃO funcionou

### Substituir runner.ts por AIOrderService.processTurn() diretamente
**Motivo de abandono:** APIs incompatíveis. `AIOrderService` é stateful (requer `conversationId` no DB, usa tools, pipeline de WhatsApp). O `/pedido/[slug]` é stateless (cart e histórico são client-side, sem DB de conversa). A tentativa de unificação forçada quebraria o fluxo de pedidos externos.

**Conclusão:** Dois pipelines de IA coexistirão permanentemente — um para WhatsApp (stateful, tools) e outro para web ordering (stateless, stage-based). O `WebOrderService.ts` é o segundo.

### Iframe embutindo /chat-sim no hub Testar IA
**Motivo de abandono:** X-Frame-Options bloqueia iframes de mesma origem no browser. Descoberto só ao testar — Next.js 14 adiciona o header por padrão. Substituído por componente React direto (`ChatSimClient` embutido).

---

## 4. O que ficou aberto

### 4a. `WebOrderService.ts` existe mas não é chamado por ninguém
**O que quebra se ninguém mexer:** Nada por enquanto — é código morto seguro. O `/api/pedido/[slug]/route.ts` já migrou para `AIOrderService.runWebTurn()` (pipeline WaiterBrainV2). O `WebOrderService.ts` foi criado como consolidação/limpeza do legado, mas a rota real usa outro serviço.  
**Próximo passo:** Avaliar se `WebOrderService.ts` serve como fallback ou pode ser deletado. Ou, se a versão do WaiterBrainV2 apresentar problemas, o `WebOrderService.ts` pode ser ativado em substituição.

### 4b. ChatSimService.ts — papel não confirmado
**Status:** não confirmado nesta sessão qual serviço o `ChatSimClient.tsx` chama para gerar respostas de IA no simulador.  
**Risco:** Se `ChatSimService.ts` ainda importa de `lib/ai-context/` (agora deletado), vai quebrar. Verificar antes de fazer deploy.

### 4c. max_tokens removido sem confirmação de custo
**Status:** O `WebOrderService.ts` não define `max_tokens` (usa o padrão do modelo — gpt-4o-mini = 16384). O runner.ts antigo tinha 200 tokens, que era muito curto. Sem max_tokens, o custo por request pode ser maior.  
**Próximo passo:** Definir um teto razoável (400–600 tokens) se o custo for um problema.

### 4d. Teste de responsivo não executado
**Status:** Mudanças no `TestAIHubClient.tsx` e `AtendimentoClient.tsx` não foram testadas nos 3 breakpoints obrigatórios (375px, 768px, 1280px).  
**O que quebra se ninguém mexer:** Pode haver problemas de layout em celular/tablet — principalmente o phone frame no modo mobile do hub.

---

## 5. Armadilhas deste repositório

### 5a. route.ts de `/api/pedido/[slug]` está mais avançado que qualquer sessão anterior sabia
O arquivo já usa `AIOrderService.runWebTurn()` com WaiterBrainV2, catálogo de produtos enriquecido com bestsellers, `ConversationLogService`, `RepeatOrderService`, e eventos V2 (ON_ENTRY, ON_ITEM_ADDED, ON_IDLE, ON_USER_MESSAGE). Qualquer sessão que leia apenas o summary do git log vai achar que route.ts ainda usa runner.ts — **leia o arquivo antes de agir**.

### 5b. O `runner.ts` já era letra morta ANTES desta sessão
O import `runAITurn from "@/lib/ai-context/runner"` estava no route.ts há commits atrás, mas `runAITurn` nunca era chamado — a rota tinha migrado para AIOrderService. Ninguém havia percebido.

### 5c. `OrderStage` agora vem de `WebOrderService.ts`
Dois arquivos importantes importam este tipo: `AIOrderService.ts` e `route.ts` de `/api/pedido`. Se `WebOrderService.ts` for deletado futuramente, ambos quebram. Migre o tipo para um arquivo de tipos compartilhado antes de deletar.

### 5d. TypeScript check com `npx tsc --noEmit` mostra erros pré-existentes mascarados
A checagem retorna centenas de erros de `Cannot find module 'openai'`, `Cannot find module '@prisma/client'`, `Cannot find module 'next/server'`. Esses erros são pré-existentes (ambiente de CI sem node_modules instalados corretamente ou tsconfig excludes específicas). Para verificar se UMA mudança introduziu erros novos, filtre pelo arquivo específico:
```bash
npx tsc --noEmit 2>&1 | grep "nome-do-arquivo.ts"
```

### 5e. `lib/agent-admin-scope.ts` ainda existe — não confundir com `lib/agent/types.ts` (deletado)
Vários arquivos de CRM importam `resolverEscopoDoAgente` de `@/lib/agent-admin-scope`. Esse arquivo NÃO foi deletado. O grep por `lib/agent` vai pegar os dois — sempre verificar o path completo.

### 5f. O diary do branch de trabalho pode estar 42 commits atrás do branch padrão
Isso já aconteceu antes (dois P0 ficaram presos). Antes de codar, sempre: `git fetch origin && git log origin/claude/remove-legacy-runner-q8iXa..HEAD`.

---

## 6. O que eu sei e não está escrito em lugar nenhum

**O pipeline WaiterBrainV2 e o WebOrderService resolvem o mesmo problema de formas diferentes.** O WaiterBrainV2 (via AIOrderService.runWebTurn) é orientado a eventos (ON_ENTRY, ON_ITEM_ADDED, ON_IDLE) e retorna cards de produto além do reply. O WebOrderService é orientado a turnos (request/response simples). O primeiro é mais rico mas mais complexo; o segundo é mais simples mas menos capaz. O produto real usa o WaiterBrainV2 — o WebOrderService fica como fallback/alternativa simples.

**O simulador `/test-ai` e o simulador AI interno (`/ai-simulator`) são coisas diferentes.** O `/test-ai` é para o lojista testar o Garçom interativamente (modo mobile/desktop). O `/ai-simulator` é o simulador de cenários (AISimulatorService) que roda conversas automáticas para QA. Não confundir ao fazer manutenção.

**`ChatSimClient.tsx` recebe `restaurantSlug` como prop e faz chamadas diretas para `/api/pedido/[slug]`**. O chat simulado no dashboard é o mesmo pipeline do cliente final — não há sandbox separado. Uma mudança no pipeline de IA do `/pedido` afeta imediatamente o que o lojista vê no "Testar IA".

**A temperatura 0.2 do runner.ts antigo não era um bug, era uma escolha que ninguém documentou o porquê.** Pode ter sido escolhida para respostas mais determinísticas no checkout. O WebOrderService usa 0.3 (consistente com AIOrderService). Se o comportamento no checkout mudar de forma estranha, a temperatura pode ser uma causa.

**`opportunity.ts` (`lib/sales/opportunity.ts`) era dead code mesmo antes desta sessão.** O comment no `lib/sales/flow.ts` dizia explicitamente "Supersedes detectOpportunity's preamble role (opportunity.ts stays as a utility...)" — mas `detectOpportunity` não era chamado em lugar nenhum. Deletado sem impacto.
