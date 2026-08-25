# ADR-006 — Três populações na mesma tabela, e o que impede a terceira de virar acidente

**Data:** 24/08/2026 · **Estado:** decidido na ausência do proprietário (ver ADR-005)
**Fase:** 1 · **Afeta:** `AgentProfile`, a Sala dos Agentes e o runtime do produto
**Emenda:** ADR-002

## Contexto

O ADR-002 decidiu que a ficha de agente **estende** `AgentProfile` em vez de nascer numa tabela paralela. A decisão continua certa: duas tabelas de ficha produziriam duas telas, dois lugares para procurar quem faz o quê, e a pergunta "esta ficha está atualizada?" passaria a ter duas respostas.

Ao construir, apareceu um fato que o ADR-002 não considerou. O comentário de cabeçalho de `defaultAgentProfiles.ts` diz, em letras claras:

> *Este array NÃO é o organograma da empresa. Os especialistas que CONSTROEM o Foocci moram em `.claude/agents/`; aqui só entram agentes de PRODUTO. **Quatro slots foram apagados em 07/08/2026 justamente por confundir as duas populações.***

Ou seja: essa casa já pagou, uma vez, o preço de misturar populações de agente. E o ADR-002 manda colocar uma **terceira** população — as funções da empresa — na mesma tabela onde o acidente aconteceu.

Havia um agravante que só apareceu lendo o código. `getActiveAgentProfiles()`, que alimenta o runtime do produto, filtrava assim:

```ts
where: { status: "ACTIVE" }
```

Isso era correto enquanto a tabela tinha uma população só. No dia em que o proprietário ativasse a ficha do Closer, o Closer entraria — calado — na lista de agentes que rodam dentro do restaurante do cliente.

## Decisão

Manter uma tabela só, e tornar a distinção **explícita e verificada**, em vez de implícita.

### 1. `population` é coluna, não convenção

Enum `AgentPopulation`: `PRODUTO` · `DESENVOLVIMENTO` · `EMPRESA`, com default `PRODUTO`.

A alternativa considerada era deduzir a população de `departmentId != null`. Foi rejeitada: uma regra que vive na cabeça de quem escreveu é a mesma coisa que não existir, e as três fichas de direção (CEO, Diretor, Gerente Geral) não têm departamento — a dedução já nasceria errada para elas.

O nome `PRODUTO`/`DESENVOLVIMENTO` não foi inventado aqui: é o vocabulário que `salaDosAgentes.types.ts` já usa. `EMPRESA` entra como o terceiro membro do mesmo conceito.

### 2. As leituras filtram, e há teste espiando a consulta

- `getActiveAgentProfiles` → `population: PRODUTO` (é o runtime do produto);
- `getAdminAgentProfiles` → `population: PRODUTO` (é a Sala dos Agentes de produto);
- `getFichasDaEmpresa` → `population: EMPRESA`, leitura nova.

Os testes de `separacaoDePopulacoes.test.ts` espionam o `where` que vai para o banco. É o único jeito de provar que o filtro existe: um teste que só olhasse o resultado passaria numa base de teste onde não há ficha de empresa nenhuma — e passaria exatamente até o dia em que houvesse.

### 3. O dono da ficha é um CARGO, não uma pessoa

O ADR-002 dizia `ownerInternalUserId` → `InternalUser`. Não dá, e por um motivo que só apareceu depois do PR 1.1: **não existe pessoa nenhuma cadastrada**, porque quem ocupa cada cargo é fato sobre a empresa e não decisão de engenharia.

Com dono apontando para pessoa, as 34 fichas nasceriam sem dono — e o critério de aceite do PR 1.2 é justamente "toda ficha nova tem dono humano".

Então o dono é `ownerPositionId` → `Position`. "Dono: Gerente de Vendas (vago)" é verdade, é acionável, e vira uma pessoa sozinho no dia em que alguém ocupar o cargo. É a mesma escolha do PR 1.1, pelo mesmo motivo.

Regra do dono: o dono de uma ficha é o gerente do departamento dela; o dono da ficha do **próprio gerente** é o Gerente Geral — senão quem cobra e quem é cobrado seriam a mesma pessoa.

### 4. O catálogo é o markdown; o código lê, não copia

O documento 11 diz na primeira linha: *"Nenhuma ficha nasce fora deste arquivo, e nenhuma ficha vive só neste arquivo."*

Transcrever as 34 fichas para um array de TypeScript cumpriria a segunda metade e quebraria a primeira: existiriam duas cópias, o proprietário aprovaria uma e o banco receberia a outra.

Então `fichasDaEmpresa.ts` **lê** o documento aprovado. O texto que o proprietário lê é o texto que vai para o banco. O mesmo padrão já vive nesta casa: `elencoObrigatorio.test.ts` lê os arquivos de `.claude/agents/` em vez de repetir o conteúdo deles.

### 5. Slug de ficha da empresa não pode colidir com Essencial nem com aposentado

Lista fechada e testada: `qualidade`, `cerebro`, `interface`, `experiencia`, `seguranca` (os cinco que constroem o sistema) e `orchestrator`, `security-governance`, `ui-ux`, `qa-test` (os quatro apagados em 07/08/2026).

É a trava para o acidente não acontecer uma terceira vez, agora ao contrário.

## Consequências

- Uma ficha só, uma tela só, um lugar para procurar — o ADR-002 continua de pé.
- O runtime do produto não enxerga ficha de empresa, nem se ela for ativada.
- A Sala dos Agentes não conta 34 funções da empresa como agentes de IA, e o cartão de custo não passa a somar gente.
- Fichas de empresa aparecem numa aba própria (`?aba=empresa`), agrupadas por departamento.
- O custo: uma coluna a mais e o dever de filtrar em toda leitura nova. Está aceito — o preço de não filtrar já foi pago uma vez.

## O que ficou em aberto, de propósito

**`suporte-tecnico` não foi amarrado a ficha nenhuma.** Ele se descreve como "engenheiro de plantão / assistência técnica 24h" e encosta em duas fichas do catálogo: a 4.2 (Suporte N1) e a 7.3 (Incidente e Runbook). Escolher uma no chute faria uma função da empresa herdar, calada, as permissões de um agente de produto em operação.

Pergunta ao proprietário: **o `suporte-tecnico` de hoje é a ficha 4.2, a 7.3, ou os dois nomes descrevem coisas diferentes?**
