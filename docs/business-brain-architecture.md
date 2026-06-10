# Business Brain Architecture

> O padrão replicável para QUALQUER empresa operar agentes de IA com segurança.
> Aplicação concreta no Foocci: `docs/foocci-brain-v1.md`.

## Tese central

**A IA não é o produto. O Brain é o produto.**

- A IA é o **motor** (intercambiável: OpenAI, Claude, Gemini, local…).
- O Brain é a **arquitetura** (contratos, fluxos, garantias).
- O Brain Director é o **guardião** (nenhuma mudança estrutural sem governança).
- A Knowledge Base é a **verdade** (o agente só afirma o que está cadastrado).
- Os agentes são os **executores** (departamentos especializados).
- O treinamento **melhora** (propostas → aprovação humana → pool de aprendizado).
- A qualidade **protege** (gate P0=0 antes de qualquer produção).
- As provas **validam** (evidência sanitizada, aprovada, só então comercial).

## As 9 camadas

| # | Camada | Papel |
|---|---|---|
| 1 | **CEO / Business Owner** | Decide. Única fonte de aprovação final. |
| 2 | **Brain Director / Architect** | Guardião: classifica risco, exige aprovação humana, registra decisões. Nunca executa. |
| 3 | **Business Brain** | A arquitetura cognitiva: contratos de raciocínio, segurança, fluxo obrigatório. |
| 4 | **AI Engine Router** | Escolhe o motor por agente. Trocar motor = mudança governada, nunca decisão do agente. |
| 5 | **Knowledge Base** | Snapshot da verdade do negócio (cadastros). O que falta vira `missingContext` — nunca invenção. |
| 6 | **Agent Departments** | Executores especializados (no Foocci: Waiter, CRM, WhatsApp, Analytics). |
| 7 | **Training Center** | Casos reais/simulações viram PROPOSTAS; humano aprova; nada muda sozinho. |
| 8 | **Quality & Simulation** | Auditores read-only + simulador dry-run + Quality Gate (P0=0). |
| 9 | **Evidence Layer** | Provas documentadas de resultado; uso comercial só com aprovação + flag pública. |

## Fluxo cognitivo obrigatório

```
entrada sanitizada (nunca PII bruta)
  → 1. entender a intenção real (guardrails determinísticos + semântica)
  → 2. buscar contexto na Knowledge Base (verdade; ausência ≠ invenção)
  → 3. raciocinar pelo motor roteado (ou fallback determinístico correto)
  → 4. validar coerência (responde a pergunta? não inventa? mantém objetivo?)
  → 5. registrar como proposta → humano aprova → versão de teste → Quality Gate
      → ativação manual → evidência de resultado
```

## Regras de ferro

1. **Nenhum agente altera o Brain diretamente** — toda mudança estrutural é um
   `BrainChangeRequest` decidido por um humano identificado.
2. **Risco alto/critical ⇒ aprovação humana obrigatória** (no v1, toda mudança).
3. **Impacto em produção ⇒ Quality Gate obrigatório** (P0 = 0).
4. **Contexto ausente nunca é inventado** — vira `missingContext` + "preciso confirmar".
5. **PII nunca entra no Brain** — só texto sanitizado e snapshots agregados.
6. **Aprovação não é execução** — aprovar registra; executar é outro fluxo governado.
7. **Fallback nunca é template errado** — sem motor, o raciocínio determinístico
   responde a intenção certa.

## Contratos (resumo)

- `BrainReasoningRequest/Result` — o contrato cognitivo único (intent, contexto
  usado/ausente, resposta ideal, regra de treinamento, coherence check,
  `runtimeTouched:false`).
- `BrainChangeRequest` — unidade de governança (target, risco, status, gate).
- `AIEngineSelection` — decisão de motor com fallback explícito.
- `BusinessKnowledgeSnapshot` — verdade agregada + `missingContext` + `safetyNotes`.
- `ApprovedLearning` — pool reutilizável de aprendizado aprovado.
- `BrainQualityGateResult` — pass/fail com contagem de P0.
- `BrainEvidence` — prova sanitizada com `canUseCommercially` (aprovado + flag).

## Replicação para outra empresa

Para aplicar a outro negócio (ex.: agência): implementar um
`BusinessKnowledgeAdapter` (a verdade daquele negócio), conectar os agentes ao
contrato cognitivo, manter Director/Router/Gate idênticos. O Brain não muda — só
a verdade e os executores.
