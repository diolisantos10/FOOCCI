# O padrão financeiro da casa — contrato entre produto e companhia

> **Ordem do CEO, 28/08/2026:**
> *"Todo produto precisa ter o seu departamento financeiro, que vai cuidar dos
> gastos, de quanto qual projeto está gastando, em todos os sentidos. E aí,
> Railway, assinatura e tudo mais. E você tem que estar claro por produto. Esses
> departamentos precisam reportar pra um novo departamento, que é o departamento
> financeiro da empresa, que fica lá dentro da Control Room. É lá que é compilado
> todo o financeiro da empresa por produto."*

**Escrito pelo Diretor do Foocci em 28/08/2026** como proposta de padrão comum.
Não é doutrina até o Diretor Geral adotá-lo — o pedido está registrado em
`docs/perguntas-ao-diretor-geral.md`. Está aqui, e não só na pergunta, porque
**a arquiteta precisa de uma especificação para construir, não de um pedido.**

---

## 1. A escada do dinheiro

```
CEO
 └── Financeiro da Companhia          ← Control Room. Compila. NÃO mede nada sozinho.
      ├── financeiro (Foocci)         ← mede o próprio produto
      ├── financeiro (City Jobs)
      ├── financeiro (Dioli Digital)
      └── financeiro (…um por produto)
```

**Quem mede é o produto. Quem soma é a companhia.** Esta separação é o ponto
inteiro do desenho: só o departamento do produto sabe que um cron novo entrou no
ar e vai dobrar a conta de LLM. A Control Room nunca saberia disso olhando a
fatura — descobriria trinta dias depois, quando ela chegasse.

**A companhia não tem permissão de inventar o que o produto não mandou.** Produto
que não reportou aparece como **"não reportou"**, nunca como zero. Zero e silêncio
são coisas diferentes, e num painel financeiro confundi-los é como o portão que
aprova por esquecimento.

---

## 2. Os quatro bolsos — iguais em todo produto

Todo produto reporta nestes quatro, sempre nesta ordem. A padronização é o que
torna a compilação uma **soma**, e não uma tradução.

| # | Bolso | O que entra | Natureza |
|---|---|---|---|
| 1 | **Infraestrutura** | Railway (memória, CPU, volume, saída de rede), qualquer hospedagem | Escala com uso |
| 2 | **Uso de terceiros** | LLM por token, Meta por conversa, meio de pagamento por transação, geocodificação por chamada | **Escala com clientes** |
| 3 | **Assinaturas fixas** | Plano do Railway, domínio, ferramenta com mensalidade | Fixo |
| 4 | **Receita** | O que o produto arrecada | — |
| 5 | **Custo de construir** | As sessões de Claude Code que constroem o produto | **É o maior de todos** |

### ⚠️ O bolso 5 foi acrescentado em 28/08/2026, no mesmo dia — e o motivo importa

A primeira versão deste padrão tinha **quatro** bolsos. Ela estava errada, e o
erro era grande: eu contei o custo de **rodar** o produto e esqueci o custo de
**construí-lo**.

O número que me corrigiu, medido na mesma noite: o Railway dos **nove projetos
da casa** custa **US$ 40,99/mês**. As sessões de Claude Code visíveis de **um
único produto** (Dioli Digital, 24 sessões) somam **US$ 1.046,88** — e a
listagem devolve `has_more: true`, então é **piso, não total**. Uma sessão
sozinha custou **US$ 389,35**.

**As sessões de um produto equivalem a ~25 meses de servidor da empresa inteira.**

Isso não é acusação: sessão cara que entrega produto pago é investimento, não
desperdício. É um **fato de ordem de grandeza** — e um departamento financeiro
que mede o bolso de R$ 211 e ignora o de R$ 5.400 não está medindo, está
decorando.

**Como medir:** `list_sessions` do MCP `claude-code-remote` com `mine: true`,
somando `external_metadata.usage.cost_usd` por produto (a etiqueta do produto
está em `tags`). ⚠️ A listagem pagina — **quem não paginar reporta piso e chama
de total.** Diga sempre quantas sessões entraram na conta.

**O bolso 2 é o que mata margem quando o produto dá certo**, e por isso é o único
que se reporta com a unidade explícita: *por token*, *por conversa*, *por
transação*. "US$ 30 de OpenAI" não diz nada; "US$ 30 = 4 chamadas de LLM por
resposta × 4,3 respostas/dia" diz se o próximo cliente cabe.

---

## 3. Como cada número se apresenta

Três colunas obrigatórias em toda linha. **A terceira é a que dá valor ao
relatório inteiro:**

| Coluna | Valores possíveis |
|---|---|
| **Valor** | número, ou a palavra **"não medido"** |
| **Origem** | `fatura MM/AAAA` · `métrica × tarifa (data da leitura)` · `arquivo:linha` |
| **Confiança** | **MEDIDO** (fatura) · **ESTIMADO** (método reproduzível) · **NÃO MEDIDO** |

**MEDIDO e ESTIMADO não se somam num total só.** O fechamento traz os dois
subtotais separados, e o total diz quanto dele é estimativa. Um total de
"R$ 1.200" que é 80% chute é pior que "R$ 240 medidos + R$ 960 estimados",
porque o primeiro convida a decidir e o segundo avisa o que falta confirmar.

**Nunca zero por falta de informação.** Ausência de fatura não é ausência de
custo. O campo é "não medido", com a linha do que faltaria para medir.

### Moeda

Railway, OpenAI e Meta cobram em **dólar**; o CEO decide em **real**. Então:
medir em dólar, reportar nos dois, **e sempre com a cotação e a data**.

> Exemplo: `US$ 20,65 → R$ 106,55 (1 USD = R$ 5,16, 28/08/2026)`

Sem a cotação declarada, o número de real do mês passado não é comparável com o
deste mês — a diferença pode ser câmbio, não gasto.

---

## 4. Cadência

| Quando | O quê |
|---|---|
| **Todo mês, até o 5º dia útil** | Fechamento do produto → Diretor → Financeiro da Companhia |
| **Antes de ligar recurso pago** | Custo da decisão, com projeção a 3 e 12 meses |
| **Na hora** | Alerta de desvio: um bolso saiu da faixa do mês anterior |

O alerta **carrega a própria evidência**: o número velho, o número novo, a
inclinação e o que ela vira em três meses. Alerta sem caso concreto é ruído que
ninguém investiga.

---

## 5. O que a Control Room compila

Uma linha por produto, e nada além disto — a graça é caber numa tela:

| Produto | Gasto | Receita | Resultado | % estimado | Reportou? |
|---|---|---|---|---|---|

Mais **três leituras que só existem no nível da companhia** e que nenhum produto
consegue produzir sozinho:

1. **Custo compartilhado.** Uma conta do Railway serve nove projetos, mas a
   assinatura do plano é uma só. Ela não é de ninguém e é de todos — o rateio é
   decisão da companhia, não do produto.
2. **Produto que gasta e não arrecada.** É a leitura mais cara da casa e nenhum
   departamento de produto a enxerga: ele só vê a própria linha.
3. **Órfão pago.** Serviço no ar que ninguém usa. Se aparece em algum produto,
   aparece; se não é de produto nenhum, só a companhia vê. *(Existe um hoje —
   ver `docs/financeiro-foocci.md` §2.)*

---

## 6. O que este padrão proíbe

1. **Nenhum departamento financeiro gasta.** Nem o do produto, nem o da companhia.
   Eles medem, projetam e recomendam. Cadastrar cartão, subir plano, contratar
   terceiro e ligar recurso pago são atos do CEO — está no `CLAUDE.md` como
   decisão que sobe, e este padrão não abre exceção por urgência.
2. **Nenhum relatório carrega segredo.** Serviço se identifica pelo **nome da
   variável de ambiente**, nunca pelo valor. Chave de API, senha de banco e token
   não entram em documento, relatório ou commit.
3. **Nenhum número sem origem.** Número sem a coluna Origem não entra na
   compilação — a companhia devolve ao produto em vez de somar.

---

## 7. O primeiro fechamento, e o que ele já mostrou

O Foocci fechou primeiro, em 28/08/2026 (`docs/financeiro-foocci.md`). Duas
coisas que apareceram no primeiro dia e que valem para todo produto que for
montar o seu:

- **A infraestrutura não é o problema.** O Railway inteiro da casa — nove
  projetos, dezessete serviços — custa menos que uma assinatura do plano
  Essencial do Foocci. Quem começar o departamento financeiro caçando desperdício
  de servidor está olhando o bolso errado.
- **E o bolso certo é o de construir.** Ver o aviso do bolso 5 acima. Foi o
  achado que obrigou a corrigir este padrão poucas horas depois de escrevê-lo —
  e a lição que fica é de método: **um departamento financeiro que só olha para
  onde a fatura chega mede o que é fácil, não o que é grande.**
- **O bolso que ninguém mede é o bolso 2.** No Foocci não existe contabilidade
  de consumo de LLM: nenhuma tabela, nenhum log de custo, nenhum teto. **Não sei
  se os outros produtos estão iguais** — não os auditei, e supor que estão seria
  exatamente o chute que este padrão proíbe. Fica como a **primeira pergunta que
  a Control Room deve fazer a cada produto**, porque se a resposta for a mesma,
  é a maior lacuna da casa.
