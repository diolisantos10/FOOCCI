# Financeiro do Foocci — fechamento de 28/08/2026

> **O que é isto.** O primeiro fechamento do departamento financeiro do Foocci,
> criado por ordem do CEO em 28/08/2026. Segue o contrato de
> `docs/financeiro-padrao-da-casa.md`.
>
> **A regra que mandou na escrita:** todo número traz origem e grau de confiança.
> Onde não deu para medir, está escrito **NÃO MEDIDO** — nunca zero. *Ausência de
> informação não é informação.*

**Cotação usada:** 1 USD = **R$ 5,16** — [Investing.com](https://br.investing.com/currencies/usd-brl), lido em 28/08/2026.
**Tarifas Railway:** [docs.railway.com/pricing/plans](https://docs.railway.com/pricing/plans), lidas em 28/08/2026 —
RAM US$ 10/GB/mês · CPU US$ 20/vCPU/mês · Volume US$ 0,15/GB/mês · Saída de rede US$ 0,05/GB.

---

## 1. O fechamento, em uma tabela

| Bolso | Valor/mês | Origem | Confiança |
|---|---|---|---|
| **1 · Infraestrutura** (Railway, 2 projetos) | **US$ 20,65 · R$ 106,55** | métrica × tarifa, 28/08/2026 | 🟡 ESTIMADO |
| **2 · Uso de terceiros** (LLM, Meta, pagamento) | **NÃO MEDIDO** — e o medidor cobre 1 de ~10 caminhos (§4) | `AIOrderService.ts:1271` é o único escritor | 🔴 |
| **3 · Assinaturas fixas** (plano Railway, domínio) | **NÃO MEDIDO** | — | 🔴 |
| **4 · Receita** (assinatura dos restaurantes) | **NÃO MEDIDO** — preço conhecido, nº de assinantes só existe no banco (§5) | `pricing.ts:95-99` | 🔴 |

**Três dos quatro bolsos estão em branco, e isso é o resultado principal deste
fechamento.** O produto que fatura de verdade na casa não sabe quanto gasta nem
quanto arrecada. O que dava para medir sem gastar nada e sem credencial nova, foi
medido; o resto está nomeado em §8 com o que falta para fechar.

---

## 2. Bolso 1 — Infraestrutura (medido por mim)

**Método, para quem quiser refazer a conta:** `get-service-metrics` do MCP do
Railway, janela de 168 horas, 10.081 amostras de 1 minuto por serviço. Média de
memória e de CPU × tarifa mensal. Saída de rede: soma das amostras da janela,
extrapolada para 30 dias. Volume: média do disco × tarifa.

### O Foocci ocupa dois projetos no Railway

| Projeto | Serviço | RAM | CPU | Volume | Rede | **Total/mês** |
|---|---|---|---|---|---|---|
| Foocci | `FOOCCI` (o app) | 7,26 | 0,16 | — | 2,28 | **US$ 9,70** |
| Foocci | `Postgres` (o banco vivo) | 2,72 | 0,04 | 0,13 | 3,58 | **US$ 6,47** |
| Foocci | `Postgres-76OG` (órfão) | 0,44 | — | 0,05 | — | **US$ 0,50** |
| Foocci Manager | `Foocci_Manager` | 1,69 | — | — | — | **US$ 1,69** |
| Foocci Manager | `Foocci_Admin` | 1,26 | — | — | — | **US$ 1,26** |
| Foocci Manager | `Postgres` | 0,98 | 0,01 | 0,04 | — | **US$ 1,03** |
| | | | | | **TOTAL** | **US$ 20,65** |

**R$ 106,55/mês.** Menos que uma assinatura do plano Essencial (R$ 179).

**Duas leituras que importam mais que o total:**

1. **O gasto é quase todo memória** (US$ 15,35 de US$ 20,65 = 74%). CPU é
   irrelevante — US$ 0,21 nos seis serviços somados. Otimizar processamento aqui
   não economiza nada; o que move a conta é memória parada.
2. **A saída de rede do banco (US$ 3,58) é maior que a do aplicativo (US$ 2,28).**
   Isso é invertido para uma aplicação web normal, e não sei explicar — fica como
   pergunta aberta em §8. Pode ser cópia, replicação, consulta pesada ou artefato
   da medição.

### O órfão custa US$ 0,50/mês — e o problema dele não é o dinheiro

O `Postgres-76OG` tem **tráfego rigorosamente zero** em sete dias (10.081
amostras, `min = max = média = 0`) e disco constante em 0,349 GB. Custa US$ 6/ano,
o que é irrelevante. Ele entra neste relatório por outro motivo: é **serviço pago
que ninguém usa, exposto à internet e com CVE HIGH aberto** — detalhe em
`docs/diagnosticos/estado-do-foocci-28-08.md` §1.4. **Aqui ele é uma linha de
custo; lá ele é risco.** O padrão da casa chama isso de *órfão pago* e manda
reportar.

---

## 3. Onde o Foocci está no gasto da casa

Medi os **nove projetos** da conta Railway, porque a pergunta do CEO foi *"quanto
qual projeto está gastando"* e ela não para no Foocci:

| Projeto | US$/mês | R$/mês | Fatia |
|---|---|---|---|
| **Foocci** (produto: os dois projetos) | **20,65** | **106,55** | **50,4%** |
| ├ Foocci | 16,67 | 86,02 | 40,7% |
| └ Foocci Manager | 3,98 | 20,53 | 9,7% |
| City Jobs | 7,64 | 39,42 | 18,6% |
| Personal Assistent | 4,79 | 24,72 | 11,7% |
| Dioli Digital | 4,11 | 21,21 | 10,0% |
| Dioli Political | 1,56 | 8,05 | 3,8% |
| Control Room | 1,31 | 6,76 | 3,2% |
| Multi AI Council | 0,94 | 4,85 | 2,3% |
| Santioh | 0,00 | 0,00 | projeto vazio, sem serviço |
| **TOTAL DE USO** | **40,99** | **211,51** | 100% |

**O Foocci é metade do consumo de infraestrutura da casa** — o que é coerente:
é o único com cliente pagante e movimento real.

⚠️ **Isto é consumo, não é a fatura.** A conta do Railway = assinatura do plano +
o que exceder a franquia. No plano Pro (US$ 20/mês, franquia de US$ 20), US$ 40,99
de uso dariam **≈ US$ 41/mês ≈ R$ 212**. **Não sei em que plano a conta está** —
o MCP não expõe. Ver §8.

---

## 4. Bolso 2 — Uso de terceiros: **o maior buraco da casa**

### 4.1 O medidor existe, é bom, e está plugado em UM lugar

O Foocci tem contabilidade de IA de verdade: `src/services/ai/pricing/modelPricing.ts`
traz nove modelos com preço, unidade de cobrança, fonte e data; e
`costAggregation.ts:150` distingue PRICED / PARTIAL / UNPRICED / NO_USAGE — ou
seja, **"não gastou" e "não sabemos quanto gastou" são coisas diferentes ali.**
É honesto e bem construído.

**E cobre entre 1 e 2 dos cerca de 10 caminhos por onde a IA gasta.** Confirmei
pessoalmente: `AIInteractionLogger.log` é chamado de **um único lugar** —
`src/services/ai/AIOrderService.ts:1271`, sempre com `agentSlug: "waiter"`. O
próprio repositório sabe disso e trava a frase em teste
(`src/services/agents/sala/montagem.ts:64-83`).

**A causa-raiz, e ela é uma linha:** `callStructuredJson`
(`src/services/brain/engines/OpenAIEngineAdapter.ts:40-65`) é o gargalo por onde
passa o Brain inteiro — CRM, Cérebro, SDR, oficina, FAQ, extração de nota,
biblioteca de agentes. A OpenAI devolve o `usage` com a contagem de tokens **na
mesma resposta**, e a função lê `completion.choices[0]` e **descarta o `usage`**.
O número está na mão e é jogado fora.

→ **Ligar o logger ali cobre sete caminhos de uma vez.** É o ponto de maior
alavancagem do repositório para esta finalidade.

### 4.2 Não existe teto de gasto. Em lugar nenhum.

| Freio | Existe? |
|---|---|
| Teto de tokens **por chamada** | ✅ disperso (200 a 1.600) |
| Teto de iterações por turno | ✅ 6 (`AIOrderService.ts:112`) |
| Requisições por IP no chat | ✅ 60/min — **mas em memória, por instância** |
| **Teto de custo em R$/US$** (mensal, por restaurante, global) | ❌ **não existe** |
| **Teto de tokens acumulados** | ❌ **não existe** |
| **Alerta ou corte quando o gasto passa de um valor** | ❌ **não existe** |

Os freios que existem são todos **por chamada** — nenhum sabe quanto já foi gasto.
Um restaurante com tráfego alto não encontra nenhuma parede.

### 4.3 Oito robôs chamam LLM toda noite, sem cliente do outro lado

De 56 workflows, 17 são agendados. Os que gastam IA:

| Robô | Frequência | Consumo |
|---|---|---|
| Biblioteca de agentes | **a cada 5 min** | até 5 chamadas/rodada — ordem de mil/dia enquanto há fila |
| Treino noturno de agentes | diário | ~30 cenários × 3 chamadas, no **`gpt-4o`** (o caro) |
| Treino — lote pequeno | diário | ~10 cenários, `gpt-4o` no avaliador |
| Brain — shadow replay | diário | **até 500 conversas re-raciocinadas** |
| CRM — treino sombra | diário | 24 casos × 3 restaurantes |
| Garçom — simulação e mineração | diário (2 robôs) | LLM |
| WhatsApp — revisão ao vivo | diário | LLM |
| **Manual Sync Nightly** | diário | 🔴 **uma sessão inteira de Claude Code no CI** — fora de qualquer medidor do produto |

### 4.4 Quantas chamadas de LLM custa UMA mensagem de cliente

- **WhatsApp com resposta livre liberada: 2 chamadas + embeddings** — o raciocínio
  **e** o LLM-juiz.
- **WhatsApp com resposta livre bloqueada: 1 chamada mesmo assim.** O modo sombra
  raciocina em paralelo para gerar evidência; **o cliente é atendido por template
  e a chamada paga acontece igual.**
- **Garçom do cardápio: até 6 chamadas por mensagem** (`MAX_TOOL_ITERATIONS = 6`).

### 4.5 🔴 O relógio de 01/10/2026 — o prazo real

Hoje a Meta cobra **R$ 0** por conversa de serviço e utilidade **dentro da janela
de 24h** — que é a maior parte do volume do Foocci. Marketing custa R$ 0,3217
sempre. Registro em `docs/decisoes.md:330-383`.

**Em 01/10/2026 a Meta passa a cobrar serviço e utilidade dentro da janela** —
exatamente a parte hoje gratuita. As tarifas definitivas saem até 01/09.

A coleta de custo por restaurante leva cerca de uma semana
(`docs/modelo-de-negocio.md:415`). **Começar depois de 01/09 chega atrasado para
saber se a tabela de preço aguenta a mudança.**

### 4.6 A ordem de serviço que existe, está autorizada, e está parada

O Diretor Geral escreveu em **02/08** a OS do custo por restaurante
(`docs/pendencias.md:1615-1678`), com entrega definida: a tela **`/admin/margem`**,
critério de pronto *"o CEO abre a tela e diz, em menos de um minuto, quanto custa
o restaurante que está no ar hoje"*.

**`/admin/margem` não existe.** Está em stand by por decisão do dono desde 31/07.

---

## 5. Bolso 4 — Receita

### 5.1 A tabela de preço (conferida por mim em `src/lib/billing/pricing.ts:95-99`)

| Plano | Comercial | Mensal | Trimestral | Anual | **Mensal efetivo (anual)** |
|---|---|---|---|---|---|
| `STARTER` | Essencial | R$ 179 | R$ 483 | R$ 1.790 | R$ 149,17 |
| `GROWTH` | Crescimento | R$ 429 | R$ 1.158 | R$ 4.290 | R$ 357,50 |
| `PRO` | Performance | R$ 899 | R$ 2.427 | R$ 8.990 | R$ 749,17 |

Desconto único: **50% do primeiro mês**, todo plano e todo ciclo.

### 5.2 O motor de cobrança está VIVO — e tem chamador real

Mercado Pago Assinaturas (preapproval), recorrência automática, na conta da
Foocci (`MP_PLATFORM_ACCESS_TOKEN`). Chamador real:
`src/app/api/billing/checkout/route.ts:163`. O botão do site aponta para
`/contratar/novo` e há teste travando o par rótulo↔destino.

**Isto é a boa notícia do relatório:** ao contrário do padrão desta casa, o motor
de dinheiro **não** é mecanismo sem chamador.

### 5.3 🔴 Mas quem para de pagar continua sendo servido

Conferi pessoalmente:

- **Não existe cron de cobrança.** Listei `src/app/api/cron/`: são 16 pastas, e
  **nenhuma é de billing.** Sem régua de cobrança, sem aviso de vencimento, sem
  e-mail de cartão recusado, sem corte por prazo.
- **`INADIMPLENTE` não corta nada.** O estado é escrito em um lugar
  (`PlanSubscriptionService.ts:328`) e lido em dois: uma consulta do serviço de
  purga e **uma cor vermelha no admin**
  (`AssinaturasClient.tsx:59`). Mais nada.
- A loja pública não consulta status de assinatura: `api/pedido/[slug]/route.ts:67-70`
  busca por `slug` e segue.
- E a Foocci só fica sabendo da inadimplência **se o Mercado Pago mandar o
  evento** — não há reconciliação.

**Em uma linha: um cliente que para de pagar continua com a loja no ar por tempo
indeterminado, e ninguém é avisado.**

### 5.4 O teto de pedidos é promessa publicada sem motor

O site publica 300 / 1.200 / 4.000 pedidos por mês
(`src/app/site/(gated)/precos/page.tsx:169, 238, 313`). **Nenhum código conta
pedidos por restaurante contra o plano** — confirmei a varredura.

Pior: a mesma página diz *"nenhum pedido é recusado — você só recebe um aviso no
painel"* (`:1164`). **Esse aviso também não existe.**

Na prática, **todo cliente tem pedidos ilimitados em qualquer plano.**

> ⚠️ **Correção ao `CLAUDE.md`:** ele diz que *"a única leitura de `restaurant.plan`
> monta contexto de IA"*. **Deixou de ser verdade.** Existe hoje um gate por plano
> em `src/lib/plan-features.ts:30-33` (`aiWaiterIncluded`), aplicado em
> `api/pedido/[slug]/route.ts:146` com `403 ai_not_included`. A parte central da
> linha — o teto de pedidos não é medido — **continua verdadeira.** Corrigido no
> `CLAUDE.md` neste mesmo bloco.

### 5.5 Quantos clientes pagantes existem? O repositório não sabe

`docs/modelo-de-negocio.md:345` registra por escrito: *"❌ NÃO REGISTRADO: quantos
clientes pagantes existem hoje e qual a receita recorrente"*.

**O silêncio do repositório não significa zero clientes** — significa que o número
só existe no banco. As consultas que responderiam estão em §6.

---

## 6. As consultas que fechariam o relatório (não executadas)

**Receita de caixa, por mês — o número oficial:**
```sql
SELECT i."referenceMonth", COUNT(*) AS cobrancas, SUM(i."amountCents") AS entrou
FROM plan_invoices i GROUP BY 1 ORDER BY 1 DESC;
```

**Receita recorrente contratada (MRR):**
```sql
SELECT s.plan, s.cycle, COUNT(*),
       SUM(s."priceCents" / CASE s.cycle::text
             WHEN 'MENSAL' THEN 1 WHEN 'TRIMESTRAL' THEN 3 ELSE 12 END) AS mrr_centavos
FROM plan_subscriptions s WHERE s.status = 'ATIVA' GROUP BY ROLLUP (s.plan, s.cycle);
```

**Assinantes travados na METADE do preço** — vazamento silencioso de receita:
```sql
SELECT id, "customerName", plan, "priceCents", "firstChargeCents", "priceSyncError"
FROM plan_subscriptions
WHERE status = 'ATIVA' AND "firstChargeCents" < "priceCents"
  AND ("fullAmountSyncedAt" IS NULL OR "priceSyncError" IS NOT NULL);
```

⚠️ **Três armadilhas de leitura:** (1) caixa e MRR nunca batem — um anual cai
inteiro num mês só; (2) `status = 'ATIVA'` vale o quanto vale o último webhook
entregue, e não há reconciliação com o MP; (3) `PlanInvoice.status` é **fiscal**,
não de pagamento — e a emissão de NFS-e está desligada por configuração enquanto
o CNPJ for MEI de vestuário (`PlanNfseService.ts:8-13`).

---

## 7. As duas saídas (regra de ouro do CEO)

O problema, em uma linha: **o Foocci não sabe quanto gasta com IA nem quanto
arrecada — e em 01/10 a Meta começa a cobrar o que hoje é de graça.**

**Saída A — Ligar o medidor onde ele já quase está. ✅ RECOMENDADA.**
Uma mudança pequena: `callStructuredJson` já recebe o `usage` da OpenAI e o
descarta; passar a gravá-lo cobre sete caminhos de IA de uma vez. Com uma semana
de coleta, o custo por restaurante deixa de ser opinião. **Custa engenharia, não
dinheiro** — nenhum serviço novo, nenhuma assinatura. Risco quase nulo: é escrita
de log, não muda comportamento. **Destrava a decisão de 01/10 com número em vez
de palpite.**

**Saída B — Precificar por leitura de mercado e seguir sem medir.**
Custa zero agora. Destrava velocidade. **Arrisca o caro:** se a margem do
Essencial (R$ 179) for negativa depois de 01/10, cada cliente novo aumenta o
prejuízo — e o sinal só aparece na fatura, trinta dias depois.

**Recomendo A, e recomendo começar antes de 01/09**, porque a coleta leva uma
semana e a tarifa definitiva da Meta sai naquela data. É a única das duas em que
a decisão de preço chega antes da conta.

**Uma terceira, que descartei e por isso nomeio:** *desligar os robôs noturnos
para cortar custo já.* Descartada porque eles são o aparato de qualidade da casa —
desligá-los é trocar custo desconhecido por cegueira conhecida, e o guardrail 5
diz que a proteção não pode ser mais destrutiva que o problema. **Medir primeiro;
se algum robô se mostrar caro demais, aí sim ele vira decisão — com número.**

---

## 8. ⛔ O que NÃO consegui medir

| Não medi | Por quê | O que fecharia |
|---|---|---|
| **A fatura real do Railway** | O MCP não tem tool de custo, uso ou fatura. Só métrica de recurso. | Aba **Usage/Billing** do painel Railway |
| **Em que plano a conta está** (Free/Hobby/Pro) | Não exposto pela API | Mesma aba |
| **Consumo e custo de LLM** | Nenhum caminho, fora o Garçom, grava token (§4.1) | Painel da OpenAI |
| **Custo de conversa da Meta** | `Message` não guarda categoria de cobrança | Painel do WhatsApp Business |
| **Receita real** | Exige banco de produção | As consultas de §6 |
| **Custo do domínio `foocci.com.br`** | Não está no repositório nem no Railway | Registro.br / onde foi comprado |
| **Por que o banco gera mais saída de rede que o app** | Precisaria de log de conexão | Painel Railway |
| **Se os outros produtos medem LLM** | Não os auditei — e supor seria chute | Perguntar a cada Diretor |

**Nada disso é "está tudo bem".** É "não consigo ver daqui".
