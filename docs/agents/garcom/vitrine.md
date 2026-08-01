# Vitrine — garçom

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---

## `ToolContext` tem TRÊS inicializadores — esquecer um silencia um bug

Ao adicionar campo ao `ToolContext`, atualize os três:

| Arquivo | Onde |
|---|---|
| `AIOrderService.ts` | o caminho de produção |
| `AISimulatorService.ts` | ~linha 716 |
| `ChatSimService.ts` | ~linha 117 |

**Esquecer um quebra o build — ou, pior, silencia um bug**: o simulador passa a
rodar com contexto diferente do de produção, e aprova comportamento que em
produção falha.

Isso conversa direto com a pendência do **ponto cego do simulador** (que aprova
resposta vazia quando cai na IA): são duas formas do mesmo problema — o simulador
não sendo fiel ao que roda de verdade.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-visibilidade-categorias.md` §3
(commit `a66a7554`)
