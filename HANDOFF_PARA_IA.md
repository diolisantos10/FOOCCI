# BRIEFING DE HANDOFF — FOOCCI

> ## ⚠️ DOCUMENTO DESATUALIZADO — não cole isto numa sessão nova
>
> - **O repositório é `diolisantos10/FOOCCI`**, não `CRM_RESTURANTE`, e o diretório
>   não é `/home/user/CRM_RESTURANTE`.
> - **O escopo descrito aqui é muito mais estreito que o produto real.**
> - A branch padrão que ele cita **está certa** (`claude/remove-legacy-runner-q8iXa`).
>
> **O que colar numa sessão nova hoje:** nada. O `CLAUDE.md` carrega sozinho, e ele
> aponta para `docs/pendencias.md` e para as salas dos especialistas. Era essa a
> função deste arquivo, e ela foi substituída.
>
> — marcado em 2026-08-01 pelo Diretor · origem: `HANDOFF-site-comercial.md` (commit `79943f5`)

> Cole este documento no início da conversa com a nova IA.

---

## CONTEXTO DO PROJETO

Você está assumindo o desenvolvimento de **FOOCCI**, uma plataforma SaaS de CRM para restaurantes com agente de IA no WhatsApp. O sistema permite que restaurantes recebam pedidos automaticamente via WhatsApp, com um agente que conduz o cliente por um fluxo de vendas configurável.

**Stack:** Next.js 14 + TypeScript + Prisma + PostgreSQL + OpenAI + Evolution API
**Deploy:** Railway (Nixpacks, Node 18)
**Branch de trabalho:** `claude/remove-legacy-runner-q8iXa`
**Repositório:** `diolisantos10/CRM_RESTURANTE`
**Diretório local:** `/home/user/CRM_RESTURANTE`

---

## O QUE JÁ FOI IMPLEMENTADO (nesta branch)

Esta branch contém 7 commits além da base. Tudo abaixo já está **pronto e funcionando**:

### 1. Anti-repeat com nomes (`e4132e5`)
- `getAlreadySuggestedItems()` em `ConversationGuardrails.ts` — retorna IDs + nomes dos itens já sugeridos (lidos de `AIInteractionLog.toolCalls`)
- System prompt mostra nomes, não só IDs opacos
- Conceito de `rejectedIds` na Regra 8

### 2. Final Intent Lock (`1b0009f` + `025c716`)
- Quando cliente manda sinal de fechamento ("pode fechar", "finaliza", "é isso" etc.) → `state.stage = CHECKOUT`
- PROIBIDO qualquer nova sugestão de produto ou categoria
- **Única exceção:** bebida com 0 tentativas → 1 tentativa → `confirm_order`
- Sobremesa **nunca** é intercepção válida após sinal de fechamento
- Implementado em `PromptBuilderService.ts` (bloco FINAL INTENT LOCK) e `BehaviorEngine.ts`

### 3. Item Validation Hard Lock (`4fbfb54`)
- Antes de `add_item`: IA deve confirmar ID EXATO no cardápio
- Se não encontrado: NÃO chama `add_item`, informa o cliente
- Se `success:false`: sem retry, sem loop, sem ID alternativo
- Implementado no system prompt (Regra 14) e no server (`execAddItem` em `AITools.ts`)

### 4. Dietary Hard Rule (`5361db7`)
- Todos os itens sugeridos/adicionados devem passar pelo filtro de restrições alimentares
- Sysaddendum injeta `⚠️ RESTRIÇÕES ALIMENTARES ATIVAS` em cada turno quando o cliente tem preferências
- Fallback: "Hoje não temos opções compatíveis com essa restrição"
- `isBlockedByDietary()` filtra candidates no `UpsellEngine`

### 5. Drink Priority Engine (`9caebfd`)
Gate **server-side** em `confirm_order` (não depende da IA lembrar):
- Requer prato principal no carrinho
- Requer: bebida no carrinho OU ≥2 tentativas de bebida
- `totalDrinkAttempts = drinkAttemptsPriorTurns + drinkAttemptsThisTurn`
- `drinkAttemptsPriorTurns` carregado de `AIInteractionLog.toolCalls` no início de cada turno via `getDrinkAttemptCount()`
- Implementado em `execConfirmOrder` dentro de `AITools.ts`

### 6. Build Fix (`e9cda3f`)
- `ToolContext` ganhou dois campos: `drinkAttemptsThisTurn: number` e `drinkAttemptsPriorTurns: number`
- Todos os 3 lugares que inicializam `ToolContext` foram atualizados:
  - `AIOrderService.ts`
  - `AISimulatorService.ts` (linha ~716)
  - `ChatSimService.ts` (linha ~117)

---

## ARQUIVOS PRINCIPAIS QUE VOCÊ VAI MEXER

| Arquivo | Responsabilidade |
|---|---|
| `src/services/ai/AIOrderService.ts` | Orquestrador principal — começa aqui para entender o fluxo |
| `src/services/ai/PromptBuilderService.ts` | System prompt completo com todas as regras da IA |
| `src/services/ai/AITools.ts` | Ferramentas OpenAI + guardrails server-side |
| `src/services/ai/BehaviorEngine.ts` | Bloco de personalidade/vendas por SalesProfile |
| `src/services/ai/ConversationGuardrails.ts` | Anti-repeat, drink count, filtros dietéticos |
| `src/services/ai/UpsellEngine.ts` | Seleção goal-driven de produtos para sugerir |
| `src/services/ai/ChatSimService.ts` | Simulador de chat da UI (sandbox, sem WhatsApp) |
| `prisma/schema.prisma` | Modelo de dados completo |

---

## REGRAS CRÍTICAS DO PROJETO

1. **Nunca chamar Evolution API no simulador** — `ChatSimService` e `AISimulatorService` são sandbox
2. **Preços sempre vêm do banco** — `execAddItem` e `execSuggestUpsell` buscam preço do banco; IA nunca define
3. **IDs de menu são cuid()** — a IA nunca inventa IDs; valida contra o cardápio no prompt
4. **`AIInteractionLog.toolCalls`** é a única fonte de verdade para histórico de sugestões e contagem de bebidas
5. **TypeScript strict** — erros de tipo quebram o build no Railway. Sempre verifique com `npm run build` mentalmente antes de commitar
6. **Se adicionar campo ao `ToolContext`** — atualizar os 3 arquivos: `AIOrderService.ts`, `AISimulatorService.ts`, `ChatSimService.ts`
7. **Commits em inglês** no formato `feat/fix/chore(escopo): descrição`
8. **Push sempre para** `claude/remove-legacy-runner-q8iXa`

---

## ESTADO ATUAL DO BUILD

- Último commit: `025c716` — `feat(ai): final intent lock — state.stage = CHECKOUT on close signal`
- Build no Railway: o deploy `96eabf44` **falhou** porque foi disparado antes do fix `e9cda3f`. O próximo deploy com código atualizado deve passar limpo.
- Avisos conhecidos no build (não são erros): `EBADENGINE` do `@aws-sdk` e `pdf-parse` (requerem Node ≥20; Railway usa Node 18)
- Erros TypeScript pré-existentes em `AITools.ts` e `AIOrderService.ts` (parâmetros `any` implícitos) — não foram introduzidos agora e não bloqueiam o build

---

## COMO ENTENDER O FLUXO EM 5 MINUTOS

1. Leia `AIOrderService.ts` do início ao fim — é o orquestrador
2. Veja `PromptBuilderService.ts` — a função `buildSystemPrompt` monta tudo que a IA recebe
3. Olhe o bloco **FINAL INTENT LOCK** e os **ESTÁGIOS** no prompt — é a lógica de negócio
4. Veja `AITools.ts` — `execConfirmOrder` tem o DRINK GATE server-side
5. Veja `ConversationGuardrails.ts` — `getDrinkAttemptCount` e `getAlreadySuggestedItems`

---

## NOMENCLATURA USADA NAS CONVERSAS COM O DONO

O dono se refere ao projeto como **"FOOCCI"**. As funcionalidades são pedidas com esse prefixo:
- "FOOCCI — NOME DA FEATURE" = novo requisito a implementar
- As regras são sempre em português; o código é em inglês/TypeScript

---

## PARA COMEÇAR

1. `git checkout claude/remove-legacy-runner-q8iXa`
2. Leia `FICHA_TECNICA.md` para contexto completo do projeto
3. Aguarde o próximo pedido do dono
