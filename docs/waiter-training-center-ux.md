# Centro de Treinamento do Waiter — Camada de UX/Produto

> Reorganização de **linguagem e narrativa** (apresentação) feita em 2026-06-10 no
> branch `claude/remove-legacy-runner-q8iXa`. **Nenhuma arquitetura, motor, engine,
> auditor ou runtime foi alterado.** Os subsistemas técnicos continuam idênticos por
> baixo; só a forma como o operador lê e decide mudou.

## Por que

A estrutura técnica é poderosa, mas a tela falava "linguagem de engenharia"
(`P2`, `MISSED_SALE`, `HUNGRY_BIG`, `seed`, `runtimeTouched`, `CRON`). Isso não
serve para o dono/operador aprovar melhorias com segurança. Agora a tela fala
**marketing, vendas e operação**, e a complexidade técnica vira "detalhe técnico"
colapsado.

## O conceito único

O Waiter tem um **Centro de Treinamento** que aprende de 3 fontes e gera 1 saída:

```
  Biblioteca ─┐
  Casos reais ─┼──►  Sugestões de treinamento  ──►  (você aprova)  ──►  Versão de teste
  Simulador  ─┘                                                          (Quality Gate)
```

| Nome de produto (operador) | Módulo técnico (por baixo) |
|---|---|
| **Biblioteca de Treinamento** | Agent Library (`src/services/agentLibrary`) |
| **Casos reais** | Conversation Examples (`src/services/simulation/examples`) |
| **Simulador / Laboratório automático** | Simulation Lab (`src/services/simulation`) |
| **Sugestões de treinamento** | Simulation Opportunities |
| **Aprovar treinamento** | `PATCH opportunities/[id] {status: APPROVED}` |
| **Versão de teste do Waiter** | Runtime Merge (`src/services/waiterRuntime`) |
| **Quality Gate (segurança)** | `qualityGate.ts` (bloqueia se P0 > 0) |

## O que "aprovar" significa (cristalino)

> **Aprovar não muda o atendimento real imediatamente.** A melhoria fica registrada
> como treinamento e só poderá entrar no Waiter em uma **versão de teste** aprovada
> no **Quality Gate**.

Aprovar uma sugestão apenas:
- registra a decisão humana (`status = APPROVED`);
- transforma em melhoria candidata;
- **não** altera o runtime real;
- **não** ativa Library-Assisted;
- **não** toca no cliente real.

Auditoria do comportamento atual: o `PATCH` de oportunidade só grava o `status` na
tabela `agent_simulation_opportunity` (via `SimulationStore.updateOpportunityStatus`).
Não há nenhum efeito sobre runtime/versão — confirmado nesta rodada.

## Tradução de linguagem técnica

Tudo concentrado em `src/services/simulation/waiterTrainingDisplayLabels.ts`
(camada pura, testada, sem efeito colateral):

**Severidade:** P0 → Crítico · P1 → Importante · P2 → Melhoria · INFO → Informação

**Tipo:** MISSED_SALE → Oportunidade de venda · POLICY_GAP → Regra de atendimento ·
UX_FRICTION → Atrito na conversa · BUG → Erro · LIBRARY_OPPORTUNITY/TRAINING_OPPORTUNITY
→ Pode virar treinamento · SAFETY_RISK → Risco de segurança

**Cenários:** HUNGRY_BIG → Cliente com muita fome · PAYMENT_QUESTION → Cliente
perguntou sobre pagamento · DIETARY_RESTRICTION → Cliente com restrição alimentar ·
BUDGET_CUSTOMER → Cliente preocupado com preço · GROUP_CUSTOMER → Pedido para grupo ·
INDECISIVE_CUSTOMER → Cliente indeciso · MAIN_THEN_DESSERT → Sugestão de sobremesa ·
REFUSING_DRINK → Sugestão de bebida (+ apelidos VEGAN_RESTRICTION, BUDGET_CONCERN,
GROUP_ORDER, DESSERT_UPSELL, DRINK_UPSELL).

**Origem:** CRON → Simulação automática · MANUAL → Simulação manual · EXAMPLE →
Conversa real sanitizada · LIBRARY → Material da Biblioteca.

**Ações:** Approve → Aprovar treinamento ("Quero que o Waiter aprenda isso.") ·
Reject → Rejeitar ("Isso não é útil ou não faz sentido.") · Backlog → Guardar para
depois ("Boa ideia, mas não agora.").

**Casos reais (status):** APPROVED → Usado como exemplo · PENDING → Aguardando sua
revisão · REJECTED → Não usar · BACKLOGGED → Revisar depois.

**Biblioteca (status):** READY/EXTRACTED → Pronta para treino · *processing* →
Processando · FAILED/PARTIAL → Precisa revisar · técnica ACTIVE → Pronta para treino ·
ARCHIVED/REJECTED → Desativada. Os códigos crus ficam disponíveis no `title`
(tooltip) e em "Detalhe técnico".

## A aba "Centro de Treinamento" (antes "Simulador")

Seções, na ordem:
1. **Status do treinamento** — automático ativo, última/próxima simulação, problemas
   críticos, "Seguro: não muda o atendimento real sozinho". (Sem P0/CRON/seed em destaque.)
2. **Fontes de aprendizado** — 3 cards: Biblioteca, Casos reais, Simulador.
3. **Sugestões de treinamento** — cada card: tipo, problema, o que o cliente disse,
   solução sugerida, impacto esperado, origem, decisão; "Detalhe técnico" colapsado
   (`HUNGRY_BIG · MISSED_SALE · Melhoria`).
4. **Treinamentos aprovados** — contadores do que você já aprovou/guardou/rejeitou.
5. **Casos reais** — conversas reais sanitizadas; status legível.
6. **Próxima versão de teste** — ponte para o Runtime Merge, explicando o Quality Gate.

Rótulos das abas (apresentação; chaves internas inalteradas):
`Library → Biblioteca de Treinamento`, `Simulador → Centro de Treinamento`,
`Runtime Merge → Versão de teste`.

## O que NÃO mudou (garantias)

- Motor do Waiter (`WaiterBrainV2`), `PromptBuilderService`, Simulation Engine,
  Quality Auditor e Runtime Merge: **intocados**.
- Nenhuma técnica ativada em produção; nenhuma versão Library-Assisted ativada.
- Nenhum envio de WhatsApp, pedido, Pix ou mudança em checkout/CRM/pagamento.
- Nenhum dado existente perdido; só apresentação.
- Arquivos alterados: `WaiterSimulationLab.tsx`, `AgentLibraryPanel.tsx`,
  `WaiterRoom.tsx` (rótulos) + novo helper puro `waiterTrainingDisplayLabels.ts`
  (+ teste).

## Testes

`src/services/simulation/waiterTrainingDisplayLabels.test.ts` cobre: MISSED_SALE →
"Oportunidade de venda"; HUNGRY_BIG → "Cliente com muita fome"; P2 → "Melhoria";
Approve → "Aprovar treinamento"; texto de aprovação deixa claro que não muda o
runtime; CRON → "Simulação automática"; status de Biblioteca/Casos reais legíveis;
card de sugestão gera problema + solução + impacto + origem + exemplo. Suítes
`simulation`, `quality`, `agentLibrary` verdes; `tsc` limpo; build verde.
