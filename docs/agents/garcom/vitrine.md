# Vitrine — garçom

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---
## Bônus de venda é desempate, nunca passaporte — e o fim de funil mostra a categoria inteira

Regra do CEO (2026-08-03, "Isso é regra"), nascida de teste real no sushi-cazza:

1. **"Tem sushi?" mostra TODOS os sushis e SÓ sushis.** O bug: na
   `searchMenuByQuery`, os bônus de best-seller/prioridade/popularidade eram
   somados **antes** do filtro `score > 0` — um item sem nenhuma relação textual
   com a pergunta entrava na resposta só por ser best-seller. Agora métrica de
   venda **só desempata a ordem** entre itens já relevantes; nunca qualifica.
2. **Bebidas, sobremesas e extras no fechamento do pedido mostram 100% dos cards
   da categoria.** O escopo `"upsell"` (teto de 6) foi aposentado; as três etapas
   do `handleCheckoutStarted` usam escopo `"category"`. O teto técnico da
   categoria é 200 — proteção contra catálogo patológico, não limite de produto.

Travado por `tests/WaiterBrainV2.card-policy.test.ts` (blocos "Regra CEO ①/②").
Registro completo em `docs/decisoes.md`.

— promovido em 2026-08-03 pelo Diretor · origem: teste do CEO no sushi-cazza

---
## Lookup de cliente por telefone sem `orderBy` é loteria

`phoneCandidates()` casa vários formatos do mesmo número — e o bug histórico do
9º dígito deixou **cadastros duplicados** (um rico com nome e pedidos, um vazio).
Um `findFirst` sem `orderBy` devolve um row **arbitrário**: resolver a duplicata
vazia fez o CEO ser reconhecido pelo número mas perder o nome e o "Comprar
novamente" — dois sintomas, uma causa.

**A regra que fica:** todo lookup sobre `phone: { in: phoneCandidates(...) }`
usa `CUSTOMER_LOOKUP_ORDER` (`totalOrders desc`, depois `createdAt asc`) — o
cadastro com histórico vence sempre. E **nome-fantasma não é nome**: cadastro
com `name` = o próprio telefone (upserts antigos) é tratado como sem nome
(`customerFirstName`), o app pede o nome uma vez e corrige o cadastro.

Travado por `src/lib/phone.test.ts`. Duplicatas antigas seguem no banco —
mesclá-las é migração de dados, decisão à parte.

— promovido em 2026-08-03 pelo Diretor · origem: investigação do especialista
garcom sobre o teste do CEO no sushi-cazza

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

## O agente pode dizer que não achou um PRATO; nunca que o restaurante não OFERECE

**Promovido por:** Diretor do Foocci · **Data:** 2026-08-05 ·
**Origem:** P0 com cliente real no Sushi Cazza · **Commits:** #103, #104

Uma cliente perguntou duas vezes *"vocês tem rodízio"* e o agente respondeu *"não
encontrei rodízios no nosso cardápio"* nas duas. **O restaurante tem rodízio** —
R$ 119 por pessoa, ativo no cadastro, marcado como serviço de salão. O catálogo
do Garçom só enxerga `showInDelivery: true`, então o produto nunca entrou na
busca, e busca vazia virava negação.

**A distinção que precisa morar em código:** busca vazia é fato sobre o RECORTE
do catálogo daquele canal, e o recorte de delivery esconde por construção tudo
que é do salão. Negar um prato é permitido; negar que a casa oferece um serviço,
não. A trava tem que ser **regra de validador de saída** — toda resposta
determinística passa por lá — e nunca instrução de prompt: a frase que a cliente
leu estava escrita no código, e a instrução equivalente no prompt **mandava** o
modelo fazer o mesmo (`AIOrderService:382`).

**Existe é diferente de vendível, e o cadastro sabe a diferença.** O canal governa
o que pode ir ao carrinho; não governa o que o agente pode CONTAR. Tratar os dois
como a mesma coisa produz ou negar o que a casa vende, ou vender o que ela não
entrega. E a lista que vira pedido tem que ser validada **no servidor, na hora de
criar o pedido** — o `finalize` conferia `isActive` e `isAvailable` e não olhava o
canal.

**Teste de "achou → responde certo" nunca cobre "não achou → cala a boca".** Já
existia um caso de rodízio no conjunto e ele estava verde: cobria outro agente e
testava a verdade PRESENTE. O que custa cliente é o contrário.

**O plural mata o casamento.** "rodízio**s**" (o que o cliente digita) não casava
com "rodízio" (o que o lojista cadastra). O Q&A podia existir e não ser
encontrado.
