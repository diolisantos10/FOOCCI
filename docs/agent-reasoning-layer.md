# Agent Reasoning Layer (v1)

> Camada cognitiva dos agentes do Foocci — começando pelo Waiter. Atualizada em
> 2026-06-10. **Não toca o atendimento real**: por enquanto alimenta apenas as
> propostas de treinamento (Centro de Treinamento). Aprovar não muda o runtime.

## O problema que resolve

A API da OpenAI estava sendo usada como "gerador de texto" / classificador por
palavra-chave + template. Resultado real:

> Cliente: **"Aceita Alelo Refeição?"**
> Sistema: classificação = *cliente indeciso*; sugestão = *recomendar pratos mais
> pedidos*. ❌

Isso é uma **pergunta de pagamento/benefício refeição**. O agente precisa
**entender a intenção real** e **responder à pergunta** antes de sugerir qualquer
aprendizado.

## Princípio

A API conectada **não basta**. Um agente de verdade precisa de:

1. **Entendimento semântico** (intenção real, não keyword solta);
2. **Recuperação de contexto** (formas de pagamento, delivery, tom — read-only);
3. **Resposta ideal contextual** (responde a pergunta, não troca de assunto);
4. **Regra de treinamento**;
5. **Validação de coerência**;
6. **Saída estruturada**;
7. **Fallback seguro**.

## Como funciona (fluxo)

```
fala real sanitizada
  → guardrails determinísticos de intenção (waiterIntentGuardrails)
  → contexto seguro do restaurante (WaiterReasoningContextService, read-only)
  → raciocínio: LLM estruturado (WaiterReasoningLLMService) OU fallback determinístico
  → validação de coerência (AgentReasoningCoherenceValidator)
  → AgentReasoningResult (contrato genérico) → proposta de treinamento
```

### 1. Guardrails de intenção (determinísticos, vencem o modelo)
`waiterIntentGuardrails.ts`. Termos como **alelo, vr, sodexo, ticket refeição,
vale-refeição, cartão, crédito, débito, pix, dinheiro, pagamento** forçam
`PAYMENT_BENEFIT_QUESTION`/`PAYMENT_QUESTION` — **nunca** INDECISIVE/HUNGRY/MENU.
Também: entrega/taxa/frete/prazo → `DELIVERY_QUESTION`; vegano/alergia/sem
camarão → `DIETARY_RESTRICTION`; "quero pedir/manda/vou querer" → `ORDER_BY_TEXT`.
O guardrail **força** a intenção mesmo quando o LLM discorda.

### 2. Contexto seguro (nunca inventa)
`WaiterReasoningContextService.ts` lê, read-only: nome, **formas de pagamento
cadastradas** (`PaymentSettings`: PIX/Cartão/Dinheiro/Link), delivery/retirada
(`DeliveryConfig`), tom (`brandConfig`). **Não existe campo de vale-refeição** no
schema → `knowsMealVoucher=false` e isso entra em `missingContext`. Logo, para
"Aceita Alelo?", a resposta correta é **confirmar sem inventar**.

### 3. Raciocínio: LLM ou fallback
- **LLM** (`WaiterReasoningLLMService`): `gpt-4o-mini`, `response_format
  json_object`, system prompt de especialista (atendimento, venda consultiva,
  anti-alucinação). Respeita a intenção forçada e o contexto; **se faltar
  contexto, não inventa**.
- **Fallback** (`waiterReasoningFallback`): quando `OPENAI_API_KEY` ausente ou
  falha — respostas determinísticas **corretas por intenção** (não template
  genérico). Marca `reasoningMode="FALLBACK"`.

### 4. Validação de coerência
`AgentReasoningCoherenceValidator.ts`: se a intenção é pagamento, a resposta ideal
**precisa** falar de pagamento; entrega→entrega; restrição→restrição/segurança;
pergunta objetiva é respondida antes de vender; contexto ausente não pode ser
inventado; mudar de assunto = **FAIL**; regra de treinamento incoerente = FAIL. No
FAIL, a proposta fica com **risco ALTO** + alerta *"Possível classificação errada.
Revisar antes de aprovar."* (não é descartada — vai para revisão).

## Contrato genérico (reutilizável)

`AgentReasoningResult` (em `src/services/agents/reasoning/AgentReasoningTypes.ts`)
inclui: `primaryIntent`, `secondaryIntents`, `confidence`, `customerNeed`,
`contextNeeded/availableContextUsed/missingContext`, `directAnswerStrategy`,
`idealResponse`, `trainingRule`, `expectedImpact`, `safetyNotes`,
`shouldEscalate`, `coherenceCheck{verdict…}`, `reasoningMode`. O mesmo contrato
será replicado para **CRM / WhatsApp / Analytics** no futuro.

## O caso Alelo (resolvido)

Entrada: "Aceita Alelo Refeição?" (resposta atual: `[handoff:AI_ESCALATION]`).
Saída da Reasoning Layer:
- `primaryIntent = PAYMENT_BENEFIT_QUESTION` (nunca indecisão);
- problema: pergunta objetiva de pagamento — e o Waiter escalou em vez de responder;
- resposta ideal: *"Boa pergunta! Preciso confirmar essa forma de pagamento para
  não te passar informação errada. Hoje aceitamos PIX, Cartão, Dinheiro. Enquanto
  isso, posso te ajudar a montar o pedido?"* (não recomenda prato; não inventa
  Alelo);
- regra: usar só formas cadastradas; se não houver, confirmar sem inventar e
  manter o cliente no fluxo;
- `coherenceCheck.verdict = PASS`.

## Segurança / o que NÃO muda

- Aprovar uma proposta **não** altera o prompt real, o WaiterBrainV2, nem ativa
  Library-Assisted — só registra o aprendizado aprovado (`runtimeTouched=false`).
- Read-only: nunca envia WhatsApp, cria pedido, gera Pix, toca checkout/CRM.
- Sem PII / sem transcript bruto (a Reasoning Layer recebe apenas texto já
  sanitizado).
- Sem alucinação de forma de pagamento (guardrail + contexto + coherence).

## Arquivos

`src/services/agents/reasoning/`: `AgentReasoningTypes.ts`,
`waiterIntentGuardrails.ts`, `WaiterReasoningContextService.ts`,
`waiterReasoningFallback.ts`, `WaiterReasoningLLMService.ts`,
`WaiterReasoningService.ts`, `AgentReasoningCoherenceValidator.ts`.
Mapeamento → proposta: `src/services/waiterTraining/reasoningSuggestionMapping.ts`
(consumido por `WaiterTrainingSuggestionStore.generatePendingTrainingSuggestions`).
