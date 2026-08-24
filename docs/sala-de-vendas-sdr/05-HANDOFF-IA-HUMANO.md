# 05 — Handoff IA ↔ humano

## Os onze gatilhos

A IA passa para gente quando:

| # | Gatilho | Por quê |
|---|---|---|
| 1 | O lead pediu humano | ignorar pedido explícito é o pior defeito de uma conversa de venda |
| 2 | Pediu desconto | negociar é fora da alçada dela, por decisão e não por capacidade |
| 3 | Pediu proposta | |
| 4 | Risco jurídico, financeiro ou reputacional | |
| 5 | Sentimento negativo | |
| 6 | A resposta exigiria informação não confirmada | a IA não afirma o que não sabe |
| 7 | A IA falhou (repetiu, travou, errou) | |
| 8 | A própria IA declarou baixa confiança | |
| 9 | Objeção não resolvida | |
| 10 | Sinal forte de intenção de compra | |
| 11 | O score bateu o limite | |

## A ordem importa, e é essa

O motivo **gravado** é o primeiro da lista, e é a primeira coisa que quem pega o
lead lê. Por isso:

1. o que o **lead pediu** vem antes de tudo;
2. depois risco e sentimento;
3. depois os limites técnicos da IA;
4. por último o que **nós calculamos**.

"Pediu desconto" explica a conversa. "Score atingiu limite" não explica nada —
mesmo quando os dois são verdade ao mesmo tempo.

## O dossiê

Vai junto com a passagem, e é **congelado** no registro:

resumo · dor identificada · objeções · próxima ação recomendada · score no
momento · etapa no momento · motivo.

### Por que congelado, e não recalculado na leitura

O dossiê é o estado da conversa **naquele instante**. Recalculá-lo depois
mostraria o que se sabe hoje, e não o que a pessoa que pegou o lead tinha em
mãos — o que torna impossível avaliar se a decisão dela foi boa com a informação
que ela tinha.

Auditoria que julga com informação futura não é auditoria.

## A exigência é assimétrica

| Sentido | Exige | Por quê |
|---|---|---|
| IA → humano | **resumo** | sem ele, quem pega relê a conversa inteira — e no dia movimentado não relê: pergunta de novo tudo que a pessoa já respondeu |
| humano → IA | **objetivo** | devolver sem dizer para quê é abandonar o lead com um passo extra |
| distribuição operacional | nada | não houve conversa para resumir |

## Aceitar um handoff

Duas escritas condicionais, **nesta ordem**:

1. o lead troca de dono (atômico, em `responsavel.ts`);
2. só então o handoff é marcado como aceito.

Marcar o handoff primeiro criaria o estado mais confuso possível: o registro diz
que Fulano pegou, e o lead está com outra pessoa.

## A espera por gente

`esperaPorGente` devolve **"não medido"** quando não há handoff aberto — e não
zero minutos.

Zero minutos de espera é uma afirmação forte: "estamos atendendo na hora". "Não
há ninguém esperando" é outra coisa. O painel precisa distinguir as duas, senão o
dia parado e o dia perfeito viram o mesmo número verde.

## Nada é enviado no handoff

Passar o bastão é mudar de responsável e registrar contexto. Falar com o lead é
outra coisa, com outro portão.
