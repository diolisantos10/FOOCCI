# Vitrine — garçom

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---
## O Garçom não pode chamar de seguro o que ele não consegue ler

`isBlockedByDietary` casava a restrição do cliente contra **nome + ingredientes** do
item. Item **sem ingredientes cadastrados** não casava com nada — e "não casou" era
devolvido como **seguro**.

Resultado: um prato chamado *"Risoto do Chef"*, com a lista de ingredientes vazia,
era oferecido a quem declarou **"sem lactose"**.

É o guardrail 1 invertido: **ausência de informação virou informação**. E aqui o
erro não custa dinheiro nem reputação — custa a saúde de quem pediu.

**Como ficou:** `classifyDietarySafety` devolve **três** estados —
`safe` · `blocked` · `unknown`.

- `unknown` = o cliente declarou restrição **e** o item não tem ingredientes.
  Não dá para provar que conflita, e **não dá para provar que é seguro**.
- `isBlockedByDietary` exclui `blocked` **e** `unknown`. Ficar calado sobre um prato
  se corrige depois; garantir errado a um alérgico, não.
- Cliente **sem restrição declarada** continua vendo tudo — senão a proteção
  esconderia o cardápio inteiro e seria mais destrutiva que o problema (guardrail 5).

**A regra que fica:** filtro de segurança alimentar tem que distinguir *"verifiquei e
está limpo"* de *"não tive o que verificar"*. Um booleano não consegue — por
construção ele empurra o desconhecido para um dos dois lados, e o lado barato é
sempre o errado.

Travado por `src/services/ai/tests/ConversationGuardrails.dietary.test.ts` (9 testes).

— promovido em 2026-08-02 pelo Diretor · origem: P1 dietético de `docs/pendencias.md`,
verificado em `ConversationGuardrails.ts`

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
