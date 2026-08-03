# OS — Ligar o Agente de CRM (ALLOWLIST) e dar a ele uma casa na interface

> **Aberta em:** 03/08/2026 · Diretor Geral, por ordem direta do CEO:
> *"subir para ALLOWLIST · ele precisa começar imediatamente · e precisa de um
> lugar na interface dedicado a ele."*
> **Para:** Diretor do Foocci. **Prioridade: P0.** Enviada também pelo canal (PR #69).

---

## 1 · O estado, medido (para você não redescobrir)

O agente de CRM está **construído, testado e no ar em modo SOMBRA** —
`CrmAgentPilotConfig.mode @default("SHADOW_ONLY")`. Ele observa cada situação de
CRM, decide o que faria e **registra sem enviar** (monta a prova A/B contra o
sistema aleatório). A escada existe e é governada:

```
SHADOW_ONLY (observa) → ALLOWLIST (só telefones do time) → RESTAURANT_WIDE (todos)
```

- Fonte de dados READ-ONLY pronta: `CrmPilotObservability.ts` — dá o degrau
  atual, o veredito A/B (teste z, honesto: "não conclui" é resposta válida) e o
  próximo degrau.
- Promoção/rollback: `crmAgentGovernance.ts` — `promoteCrmAgentToAllowlist`
  (confirm `PROMOTE_CRM_AGENT_ALLOWLIST`), `rollbackCrmAgent` (kill de 30s → volta
  para sombra; o sorteio nunca para).

## 2 · Tarefa A — Promover para ALLOWLIST (o "começar imediatamente")

**Alvo inicial:** o restaurante que o CEO indicar (provável Sushi Cazza — confirmar).

1. Preencher `allowlistedPhones` com **os telefones do time** que o CEO fornecer
   (esperando lista do CEO — sem ela, NÃO promova; enviar mensagem real a número
   errado é o pior começo).
2. `promoteCrmAgentToAllowlist` com o confirm token.
3. Conferir em produção: o modo virou `ALLOWLIST`, e uma situação real de CRM com
   um telefone da lista **de fato disparou** a mensagem do agente. Guardrail 2 +
   doutrina 15: só está "ligado" com a evidência do envio real registrada.
4. Rollback à mão (kill 30s) documentado e testado ANTES de promover — a saída
   tem que existir antes da entrada.

> ⚠️ ALLOWLIST **envia mensagem de verdade** para os telefones da lista. É de
> propósito que comece pelo time: erro aparece para vocês, não para cliente.

## 3 · Tarefa B — A casa do agente na interface

Hoje o agente mora espalhado em telas de admin. O CEO quer **um lugar dedicado a
ele** — onde se vê o agente trabalhando, não configurações soltas. Uma página do
Agente de CRM que responde, à primeira olhada:

| Bloco | De onde vem |
|---|---|
| **Em que degrau ele está** (sombra/allowlist/wide) + desde quando | `CrmPilotObservability` |
| **O que ele está fazendo** — últimas decisões: situação → o que enviou (ou enviaria, em sombra) | log do runner (marca `agent:crm`) |
| **A prova** — A/B com o número na frente, e o veredito honesto ("ainda não conclui" quando for o caso) | `CrmPilotObservability` |
| **Os controles** — subir degrau (com confirm) e o botão de pânico (rollback 30s) | `crmAgentGovernance` |
| **Próximo passo** — o que falta para o próximo degrau | `CrmPilotObservability.proximoDegrau` |

Lei de design (obrigatória): tokens do `DESIGN.md`, ação primária `brand-500/600`,
três estados (carregando/vazio/erro), responsivo conferido em 375/768/1280 com
screenshot, auto-avaliação 8+ nos quatro critérios antes de mostrar ao CEO.

**Decisão de lugar** (sua, com um palpite meu): admin, unificando o que hoje está
em `/admin/crm-agente` e `/admin/agentes/crm` numa casa só — não criar a nona
tela solta. Se discordar, escreva o porquê em `perguntas-ao-diretor-geral.md`.

## 4 · Como saber que ficou bom

- Modo em produção = `ALLOWLIST` no restaurante alvo, com envio real provado.
- A casa do agente abre e mostra os cinco blocos com dado real, nas três telas.
- Rollback testado (30s → sombra).
- `tsc` limpo, testes verdes, **`commitSha` conferido no `/api/health`** (doutrina 15).

## 5 · O que depende do CEO (bloqueia a Tarefa A, não a B)
- **A lista de telefones do time** para a allowlist.
- **Qual restaurante** liga primeiro.
> A Tarefa B (a casa na interface) **não espera** por isso — pode começar já.
