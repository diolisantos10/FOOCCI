# Auditoria & Plano de Faxina — Simuladores e Treinadores de Agentes (FOOCCI)

> Documento de diagnóstico + plano de ação para consolidar a estrutura de
> simulação/treinamento dos agentes de IA. Objetivo: **autônomo, 1x/dia,
> alimentado por conversas reais, e o dono só aprova** — pronto pra virar produto.

---

## 1. Resumo executivo (leia isto primeiro)

**A boa notícia:** o sistema autônomo que você quer **já existe** — a *Central de
Treinamento IA (Arena)* já faz o ciclo completo: minera conversas reais → cria
cenário → simula em modo seguro → diagnostica → propõe melhoria → **você aprova**
→ sandbox. Produção está **travada** (nada vai ao ar sem você). Você **não precisa
construir** — precisa **consolidar**.

**O problema real:** existem **cópias paralelas** fazendo a mesma coisa:
- **9 sistemas de backend** de simulação/treino.
- **~15 telas** no admin (só **2 autônomas**; o resto é teste manual).
- **~6 filas de aprovação diferentes** (6 "caixas de entrada" pra você revisar).
- **4–5 mineradores de conversa real** jogando em **3 tabelas diferentes**.
- **~10 rotinas de cron** espalhadas por vários sistemas.

**A recomendação (a melhor opção):** eleger a **Central de Treinamento IA (Arena)**
como **HUB ÚNICO**. Tudo que é redundante vira **entrada** desse hub (uma fila de
aprovação só). Os simuladores manuais viram **ferramentas de debug** (1 por agente,
o resto aposentado). Resultado: **uma porta, uma fila, um cano**.

---

## 2. Inventário completo (o diagnóstico)

### 2a. Telas do admin (~15)

| Tela | Agente | Tipo | Aprova mudanças? |
|---|---|---|---|
| **Treinamento IA (Arena)** | Todos | 🟢 **Autônomo** (cron) | ✅ SIM (ciclo completo) |
| **Controle de Qualidade** | Todos | 🟢 **Autônomo** (cron) | ❌ só diagnostica |
| WA Pedido Texto (Test Center) | WhatsApp pedido | 🟡 Manual + config | presets de ativação |
| WA Simulador (chat debug) | WhatsApp pedido | 🟡 Manual | ❌ |
| WA Cockpit | WhatsApp pedido | 🟡 Manual | ❌ |
| WA Routing Lab | WhatsApp roteamento | 🟡 Manual | ❌ |
| QA Recovery (cart) | Recuperação carrinho | 🟡 Manual | ❌ |
| Waiter Testes | Garçom | 🟡 Manual | ❌ |
| CRM Testes | CRM | 🟡 Manual | ❌ |
| Analytics Testes | Analytics | 🟡 Manual | ❌ |
| WA Identity | WhatsApp identidade | 🟡 Manual | ❌ |
| Pré-piloto | Restaurante (prontidão) | 🟡 Manual | ❌ |
| Diagnóstico (restaurant-mismatch) | Dados do restaurante | 🟡 Manual | ❌ |
| Agentes (dashboard) | Todos | 🟡 Leitura | ❌ |
| Build OS | Infra | 🟡 Leitura | ❌ |

> **Leitura:** 13 de 15 são **teste manual**. Você não quer isso. A meta é o
> oposto: tudo roda sozinho, você só aprova.

### 2b. Sistemas de backend (9)

| # | Sistema | Pra que serve | Autônomo? | Aprova? | Aplica? |
|---|---|---|---|---|---|
| 1 | **Central de Treinamento (Arena)** | Treino contínuo: conversa real/sintética → cenário → avalia (GPT-4o) → propõe → aprova → sandbox | 🟢 cron | ✅ formal | ✅ via versão de cérebro (sandbox) |
| 2 | **Auto Simulator (Garçom)** | Roda cenários sintéticos no garçom a cada 60s; mede conversão/upsell | 🟢 60s | ❌ só "insight" | ❌ |
| 3 | **WhatsApp Simuladores** (Text Order + Master) | Valida o fluxo de pedido em dry-run | 🟡 manual+cron | ❌ | ❌ |
| 4 | **Quality Audit** | Auditores checam config/estado, geram achados P0/P1/P2 | 🟢 cron | ❌ | ❌ |
| 5 | **Agent Library** | "Universidade": fontes → técnicas extraídas → injeção opcional no runtime | 🟡 sob demanda | fraco | opcional (desligado) |
| 6 | **Agent Simulation Lab** | Framework genérico de simulação → "oportunidades" | 🟡 manual+cron | fraco | ❌ |
| 7 | **Simulation Example Library** | Repositório de exemplos reais (sanitizados) p/ inspirar cenários | ❌ sob demanda | ✅ | ❌ |
| 8 | **Waiter Evidence + Suggestions** | Provas comerciais + propostas de treino do garçom | ❌ sob demanda | ✅ | ❌ |
| 9 | **Brain Change Request** | Governança/auditoria de mudanças estruturais no Brain | ❌ manual | ✅ formal | condicional |

### 2c. Autonomia hoje (o que já roda sozinho)

| Rotina | Frequência | Status |
|---|---|---|
| Treino — lote pequeno | 30 min | 🟢 ativo |
| Treino — minera conversas reais | 30 min | 🟢 ativo |
| Treino — processa backlog | 30 min | 🟢 ativo |
| Treino — lote noturno | diário 04h (BRT) | 🟢 ativo |
| WhatsApp — revisão de aprendizado ao vivo | diário 06h | 🟢 ativo |
| Garçom — intake de conversas reais | diário 03h | 🟢 ativo |
| Auto Simulator (garçom) | 60s | 🟢 ativo |
| Quality Audit | cron | 🟢 ativo |
| WhatsApp text/master simulator | cron | 🟡 parcial |

> **Conclusão:** a autonomia **já existe e é forte**. O problema é que está
> **fragmentada** em vários sistemas que não conversam.

### 2d. O cano de conversa real (a maior redundância)

Existem **4–5 mineradores de conversa real** rodando em paralelo, cada um
jogando numa **tabela diferente**:

| Minerador | Vai pra tabela |
|---|---|
| `AgentTrainingConversationMiner` (Arena) | `AgentTrainingScenario` |
| `liveLearningReview` (WhatsApp) | `WaiterTrainingSuggestion` |
| `WaiterTrainingSuggestionStore` | `WaiterTrainingSuggestion` |
| `realConversationIntake` (garçom) | `AgentSimulationExample` |

→ A **mesma conversa** pode ser processada **3–4 vezes** e gerar registros em
**3 lugares**. Pura redundância.

---

## 3. O retrato da bagunça (3 famílias de redundância)

1. **4 simuladores de cenário** fazem quase o mesmo: gerar cenário → rodar no
   agente → dar nota (Arena, Auto Simulator, WhatsApp Sim, Simulation Lab).
2. **4–5 mineradores de conversa real** → 3 tabelas (acima).
3. **~6 filas de aprovação** (6 caixas de entrada pra você): `AgentImprovementProposal`,
   `AgentSimulationOpportunity`, `WaiterTrainingSuggestion`, `WaiterResultEvidence`,
   `BrainChangeRequest`, `AgentLibraryTechnique`.

> O sintoma nº 1 que VOCÊ sente: **não dá pra saber onde aprovar as coisas** —
> estão espalhadas em 6 lugares.

---

## 4. A arquitetura-alvo (o que vamos ter)

```
            CONVERSAS REAIS (de cada conta/restaurante)
                          │   (1 minerador, PII mascarado)
                          ▼
                ┌──────────────────────────┐
                │  CENTRAL DE TREINAMENTO   │   ← roda sozinha, 1x/dia (+ contínuo)
                │        (o HUB)            │
                │  cenário → simula → nota  │
                │  → diagnostica → propõe   │
                └────────────┬─────────────┘
                             ▼
                ┌──────────────────────────┐
                │   UMA fila de aprovação   │   ← VOCÊ só aprova/rejeita aqui
                │     ("sua caixa única")   │
                └────────────┬─────────────┘
                  aprovado ▼  (nada vai pra produção sem isto)
                ┌──────────────────────────┐
                │  Sandbox → versão ativa   │
                └──────────────────────────┘
```

**Princípios:**
- **1 hub** (a Central de Treinamento) — não 9.
- **1 fila de aprovação** — não 6.
- **1 minerador de conversa real** — não 4.
- **Por agente** (WhatsApp, Garçom, CRM, Analytics) mas **1 framework só**.
- **Por conta/restaurante** — cada restaurante treina com as conversas dele
  (já é por restaurante; só precisa expor isso).
- Simuladores manuais → **1 ferramenta de debug por agente** (resto aposentado).

---

## 5. Plano de faxina (keep / merge / kill)

| Sistema / tela | Decisão | Ação |
|---|---|---|
| **Central de Treinamento (Arena)** | ⭐ **HUB** | Promover a casa única; tudo flui pra cá |
| **Quality Audit** | 🔀 **Merge** | Achados viram **propostas** na fila do hub |
| **Auto Simulator (garçom)** | 🔀 **Merge** | "Insights" viram cenários/propostas do hub |
| **Agent Simulation Lab** | 🔀 **Merge** | "Oportunidades" entram na fila única |
| **Waiter Suggestions/Evidence** | 🔀 **Merge** | Vão pra fila única (aba "garçom") |
| **WhatsApp Live Learning** | 🔀 **Merge** | Unificar no minerador único |
| **Example Library + realConversationIntake** | 🔀 **Merge** | Vira **o** minerador de conversa real |
| **Brain Change Request** | ✅ **Keep** | É a governança final; a fila única alimenta ele |
| **Agent Library** | ✅ **Keep** (separado) | É "conhecimento externo", não treino de falha — mantém, mas fora do hub |
| **WA Pedido Texto (Test Center)** | ✅ **Keep** (1 debug) | Único debug manual de WhatsApp (já tem o card do cérebro) |
| **WA Simulador + WA Cockpit** | 🗑️ **Kill/merge** | Viram abas do Test Center ou aposentam |
| **Waiter/CRM/Analytics Testes** | 🔀 **Merge** | Viram abas de "regressão" dentro do hub |
| **WA Routing Lab, QA Recovery, WA Identity, Pré-piloto, Diagnóstico** | ✅ **Keep** | São diagnósticos pontuais úteis — agrupar num menu "Diagnósticos" |

---

## 6. Roadmap por fases (do mais útil pro menos urgente)

**Fase 1 — Uma fila de aprovação (maior ganho pra você).**
Unificar as ~6 filas numa **caixa única** ("Melhorias para Aprovar"), com filtro
por agente. Você passa a ter **um lugar** pra aprovar tudo. *(Não muda motor —
só junta as listas.)*

**Fase 2 — Um minerador de conversa real.**
Eleger 1 minerador (o da Arena), aposentar os outros 3. Mesma conversa = 1
processamento. Garante PII mascarado num lugar só.

**Fase 3 — Consolidar simuladores.**
WhatsApp: 3 → 1 (Test Center). Waiter/CRM/Analytics: viram abas do hub. Resto
de simulador de cenário → entra na Arena.

**Fase 4 — Cron único e diário.**
Juntar as ~10 rotinas num **agendador central** com 1 corrida diária garantida
por agente + contínuo opcional. Painel mostra "última corrida / próxima corrida".

**Fase 5 — Vitrine de produto.**
Renomear/organizar como **"Central de Treinamento IA"** única, com:
"Visão Geral · Conversas Reais · Melhorias para Aprovar · Versões · Por Conta".
Pronto pra vender.

---

## 7. Riscos e cuidados

- ⚠️ **Não quebrar o trava de produção** (`autoApplyProduction` continua OFF).
- ⚠️ **Migrar dados** das 6 filas pra fila única (não perder propostas existentes).
- ⚠️ **Manter PII mascarado** em todo o cano.
- ⚠️ Fazer **aditivo** (não apagar tabelas de uma vez) — migrar, validar, só então aposentar.

---

## 8. Recomendação final (a melhor opção)

> **Consolidar tudo na Central de Treinamento IA (Arena) como hub único, começando
> pela FASE 1 (uma fila de aprovação só).** É o passo de maior impacto e menor risco:
> resolve imediatamente a dor de "não sei onde aprovar", sem tocar nos motores. As
> fases seguintes vão enxugando os mineradores e simuladores redundantes até sobrar
> **uma arquitetura limpa, autônoma, por conta, e vendável.**
