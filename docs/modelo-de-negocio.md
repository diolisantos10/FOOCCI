# Foocci — Modelo de Negócio

> **Para que este documento existe.** Diretor ou agente novo entra aqui e sai
> sabendo o que a Foocci vende, para quem, por quanto, e o que ela promete —
> sem precisar reconstruir isso lendo trinta arquivos.
>
> **A regra que mandou na escrita, e é o que dá valor ao documento:** nada aqui
> foi inventado. Cada afirmação aponta o arquivo (e a linha ou a data) de onde
> saiu. Onde não havia fonte, está escrito **NÃO DECIDIDO** ou **NÃO
> REGISTRADO** — com a pergunta exata que falta responder, na última seção.
>
> Um Canvas com lacuna honesta é útil. Um Canvas com chute é armadilha para o
> próximo Diretor, que é justamente quem este documento existe para proteger.

**Escrito em:** 14/08/2026 · **por:** Diretor do Foocci · **fontes:** `CLAUDE.md`,
`docs/foocci-resumo-executivo.md`, `docs/decisoes.md`, `docs/pendencias.md`,
`docs/sdr-foocci-desenho.md`, `docs/cronograma-sdr-e-crm-foocci.md`,
`docs/OS-fluxo-de-compra-do-plano.md`, `docs/dioli-briefing-foocci.md` e o código
de preço e de cobrança que está em produção.

**Como ler as marcações:**

| | Significa |
|---|---|
| ✅ | Decidido, com fonte no repositório. Não mexa sem falar com o CEO. |
| ⚠️ | Existe uma decisão, mas ela está incompleta ou o produto ainda não a cumpre. |
| ❌ | **Não decidido / não registrado.** Vira pergunta na última seção. |

---

# PARTE 1 — O modelo em texto

## 1. O que a Foocci é

A Foocci vende **assinatura de um sistema operacional para restaurantes**. O
restaurante monta o cardápio, recebe o pedido, cobra, imprime a comanda na
cozinha, emite a nota, guarda o cliente numa base própria e traz esse cliente de
volta — tudo no mesmo lugar, com agentes de IA atendendo por trás.

São duas superfícies: o **painel do lojista** (marca Foocci, laranja) e a **loja
do cliente final** (white-label — o cliente final vê o restaurante, nunca a
Foocci).
*Fonte: `CLAUDE.md` §"O que é o Foocci"; `docs/foocci-resumo-executivo.md` §3 e §16.*

**O diferencial declarado, na frase da casa:** a Foocci não tenta ser melhor que
o marketplace, o cardápio digital, o CRM genérico ou o PDV isoladamente — ela é
a única que faz os quatro conversarem entre si. **É isso que se cobra.**
*Fonte: `CLAUDE.md` §"O que é o Foocci"; `docs/foocci-resumo-executivo.md` §24.*

A frase aprovada para o mercado é outra, mais curta: *"chatbot responde — a
Foocci vende, relaciona e ajuda o cliente a voltar."*
*Fonte: `src/services/brain/sdr/pilotos/BriefingFoocci.ts`, campo `diferencial`.*

## 2. Para quem

**Dono de restaurante pequeno e médio no Brasil** que já vende por WhatsApp,
depende de marketplace e não tem nada próprio de relacionamento — o cliente
pede, some, e ele não sabe quem foi.
*Fonte: `BriefingFoocci.ts`, campo `publico`.*

É **B2B**. O site fala com o dono do restaurante, nunca com quem come. Virar B2C
quebra o funil — está registrado como decisão D1 do briefing do site.
*Fonte: `docs/pendencias.md:1391`.*

**Brasil inteiro.** É produto digital, não tem raio de entrega: tudo em português
do Brasil, com Pix, cartão e nota fiscal brasileira.
*Fonte: `BriefingFoocci.ts`, campo `regiao`.*

❌ **O que NÃO está registrado:** porte mínimo, faixa de faturamento-alvo, tipo
de cozinha ou região prioritária. O site usa faturamentos de **exemplo** por
plano (R$ 20 mil, R$ 40 mil e R$ 150 mil por mês) na conta de retorno — mas isso
é exemplo de página, não definição de segmento.
*Fonte: `src/app/site/(gated)/precos/page.tsx`, campo `roiRevenue` dos três planos.*

## 3. O problema que resolve

O restaurante médio brasileiro vive quatro problemas ao mesmo tempo, e a Foocci
ataca os quatro:

1. **Ele não é dono do próprio cliente.** Vende pelo marketplace, paga comissão,
   e no fim do mês não tem telefone, nome, histórico nem aniversário de ninguém.
2. **O WhatsApp virou um caos.** É onde o cliente quer falar e onde a venda se
   perde: mensagem sem resposta às 20h, pergunta repetida cinquenta vezes,
   pedido anotado errado.
3. **Ele não sabe quem sumiu.** A informação existe espalhada nos pedidos, e
   ninguém tem tempo de extrair — sem ela não há reativação nenhuma.
4. **Ele não sabe se ganha dinheiro no prato.** Preço no olho, sem custo por
   item, sem CMV, sem margem.

*Fonte: `docs/foocci-resumo-executivo.md` §2, integralmente.*

## 4. Como a Foocci cobra

### 4.1 A tabela — e ela está fechada

**Três planos, três ciclos. Valor fixo, sem comissão sobre as vendas do lojista.**

| Plano (site) | Plano (banco) | Mensal | Trimestral | Anual |
|---|---|---|---|---|
| Essencial | `STARTER` | R$ 179 | R$ 483 | R$ 1.790 |
| Crescimento | `GROWTH` | R$ 429 | R$ 1.158 | R$ 4.290 |
| Performance | `PRO` | R$ 899 | R$ 2.427 | R$ 8.990 |

*Fonte: `src/lib/billing/pricing.ts`, constante `PLAN_CYCLE_CENTS` — "Tabela
aprovada pelo CEO". Regra do CEO de 04/08/2026 registrada no cabeçalho do mesmo
arquivo.*

Três regras que vêm junto com a tabela, e são do CEO:

- **O valor do ciclo É o valor cobrado.** O anual já embute os dois meses
  grátis; o trimestral já embute os 10%. Não há desconto adicional a calcular.
- **O único desconto é 50% no primeiro mês**, para todo cliente novo, em
  qualquer plano e qualquer ciclo. Do segundo mês em diante, valor cheio.
- **"Preço fundador" não existe** — saiu por não existir no motor de cobrança.

*Fonte: `src/lib/billing/pricing.ts`, cabeçalho; `docs/pendencias.md:1566`.*

⚠️ **Atenção de quem chega:** dois documentos deste repositório ainda dizem que
as faixas de preço estão "em stand by" — `CLAUDE.md` §"Decisões pendentes do CEO"
e `docs/pendencias.md:1489`. **Estão desatualizados**: os dois foram escritos
antes de 04/08, e a tabela foi fechada pelo CEO em 04/08 e está no ar cobrando.
O que continua em stand by é outra coisa — o **custo por restaurante** (§7.1) e o
**bloqueio por plano** (§4.4).

### 4.2 Preço mora num lugar só, de propósito

Tudo que fala em dinheiro de plano — a página pública `/site/precos`, o checkout
self-service, o motor de assinatura, o admin e o SDR — lê de
`src/lib/billing/pricing.ts`. Antes existiam **quatro tabelas de preço** soltas no
repositório; num checkout self-service, tabela duplicada vira cobrança diferente
do anunciado no primeiro cliente.
*Fonte: `src/lib/billing/pricing.ts`, cabeçalho; `src/lib/site/plans.ts`, cabeçalho.*

A mesma trava vale para o SDR: ele **passa o valor dos planos na hora**, lendo da
mesma fonte que o site publica — nunca de uma cópia no texto dele.
*Fonte: `docs/decisoes.md`, decisão de 2026-08-08 "O SDR passa o valor dos planos na hora".*

### 4.3 O que se cobra fora da mensalidade — e o que não se cobra

Sobraram **dois** serviços fora da mensalidade, os dois **sem preço publicado**:

| Serviço | Preço | Por quê |
|---|---|---|
| **Configuração** | Sob consulta | A Foocci sobe o cardápio e a base de clientes por você. Preço depende da quantidade de itens e de precisar importar clientes. Fazer sozinho pelo painel **não custa nada**. |
| **Gestão pela agência** | Sob consulta | É serviço com hora humana. |
| Nota fiscal (NFC-e) | *Com o emissor* | A integração vem incluída e a Foocci não cobra por ela. Certificado e custo por documento o lojista contrata direto com o emissor. |

*Fonte: `src/lib/site/servicosAParte.ts`, integralmente.*

**O que foi aposentado em 06/08/2026, por decisão do CEO** — e é a história mais
importante deste capítulo: a página de preços publicava **seis** itens cobrados à
parte (WhatsApp oficial R$ 149/mês, nota fiscal R$ 89/mês, pacote de 1.000
mensagens R$ 79, unidade adicional a 60% do plano, gestão sob consulta e
implantação por faixa). Eles citavam um documento — "Planos Foocci v3" — **que não
existe no repositório**, e o CEO, ao auditar, disse não reconhecer nenhum. Pior:
**nenhum dos seis era cobrado pelo sistema** — o checkout conhece três planos e
três ciclos, e nada mais.
*Fonte: `src/lib/site/servicosAParte.ts`, cabeçalho; `src/app/site/(gated)/precos/page.tsx`, cabeçalho.*

A regra que ficou disso: **preço publicado é promessa.** Enquanto não houver
valor decidido pelo CEO **e** motor que o cobre, o preço é "Sob consulta" — nunca
um número que pareceu razoável. Há teste que reprova a volta de qualquer um dos
valores aposentados (`precosSemValorSemLastro.test.ts`).

**Não existe cota de mensagem em plano nenhum.** O custo de WhatsApp entra na
mensalidade de quem usa CRM; o lojista não vê linha de WhatsApp na fatura.
*Fonte: `docs/decisoes.md`, decisão de 2026-08-06, palavras do CEO: "então vamos
transferir esse custo para mensalidade que usa o CRM. Simples."*

### 4.4 ⚠️ Os limites publicados que o sistema não cumpre

A página de preços publica um teto por plano:

| Plano | Teto publicado |
|---|---|
| Essencial | Até **300 pedidos/mês** (≈ 10 por dia) |
| Crescimento | Até **1.200 pedidos/mês** (≈ 40 por dia) · 3.000 mensagens |
| Performance | Até **4.000 pedidos/mês** (≈ 130 por dia) · 10.000 mensagens |

*Fonte: `src/app/site/(gated)/precos/page.tsx`, campos `limit` e `limitSub`.*

**Nada disso é medido nem bloqueado pelo produto.** O campo de plano existe no
banco (`enum Plan { STARTER, GROWTH, PRO }`) e a única leitura dele em todo o
código é para montar contexto de IA (`src/lib/ai-context/builder.ts:358`). Não há
contagem de pedidos por ciclo, aviso de aproximação de teto nem bloqueio.
*Fonte: varredura do repositório em 14/08/2026; `docs/foocci-resumo-executivo.md` §23
("o sistema não sabe cobrar por faixa… é bloqueador comercial"); `docs/pendencias.md:1489`.*

Há **uma** regra de limite já decidida pelo CEO e que precisa ser respeitada
quando a contagem existir: **pedido de salão pelo QR do cardápio NÃO conta no
limite** — *"QR code só pra ver cardápio, não gasta nada."* A isenção é por
ausência de custo, não por ser QR: se o QR do salão passar a ter IA, a decisão
volta ao CEO.
*Fonte: `docs/pendencias.md:712-733`, decisão do CEO de 02/08/2026.*

### 4.5 Como o dinheiro anda

```
INTERESSE        CONTRATO          COBRANÇA          REGISTRO        NOTA           ONBOARDING
site/preços  →   aceite dos    →   assinatura   →    tabela de   →   NFS-e via  →   conta criada
"Contratar"      termos             recorrente        assinantes      Focus NFe      sozinha
                 (com trilha)      (Mercado Pago)     + admin
```
*Fonte: `docs/OS-fluxo-de-compra-do-plano.md` §2.*

O **checkout self-service** está no ar desde 04/08: o lojista contrata, aceita o
contrato, paga e a conta nasce sozinha. A cobrança recorrente é do **Mercado
Pago** (produto Assinaturas/preapproval), com a conta da própria Foocci
(`MP_PLATFORM_ACCESS_TOKEN`), separada do Mercado Pago de cada restaurante.
*Fonte: `docs/pendencias.md:1551`; `src/services/billing/PlanSubscriptionService.ts`,
cabeçalho; `docs/cronograma-sdr-e-crm-foocci.md`, pendência 1.*

⚠️ **Um risco de receita ainda aberto, e ele é do dono:** o Mercado Pago aceita
só um valor na recorrência, então o sistema cria a assinatura com o valor
promocional e sobe para o cheio via `PUT /preapproval`. **Isso nunca rodou contra
a API real.** Se o Mercado Pago recusar, o cliente pagaria metade para sempre. A
prova só vem com uma venda de verdade.
*Fonte: `docs/pendencias.md:1559-1563`.*

❌ **Não há, em nenhum documento deste repositório, registro de uma contratação
real concluída.** O objetivo declarado pelo CEO em 30/07 era *"lançar dia 03/08 e
fechar os primeiros restaurantes pagantes em 90 dias"*. Quantos foram fechados
até hoje **não está registrado** — e ausência de informação não é informação
(guardrail 1).
*Fonte: `BriefingFoocci.ts`, campo `objetivo`.*

## 5. O que a Foocci promete

Os argumentos de venda aprovados são os que se checam no produto. Estão listados
um a um em `docs/foocci-resumo-executivo.md` §22:

1. **"Você deixa de pagar comissão no que vende direto"** — mensurável pelos
   links rastreáveis.
2. **"O cliente é seu"** — nome, telefone, histórico, aniversário, preferência,
   tudo na base do restaurante e exportável.
3. **"O sistema resgata o cliente antes dele sumir"** — a escada quente
   esfriando → morno → frio dispara enquanto ele ainda compra.
4. **"O agente não inventa"** — há um verificador que barra afirmação que não
   bate com o cardápio, e um simulador que testa isso toda madrugada.
5. **"Sua comanda não some"** — a fila de impressão devolve o trabalho e só
   desiste depois de 5 tentativas.
6. **"Seu número não queima"** — horário de silêncio 21h–8h, teto diário,
   descanso por cliente, atraso aleatório e memória de quem já foi contatado.
7. **"Você sabe se o prato dá lucro"** — CMV com ficha técnica e markup sobre
   despesa real.
8. **"Seu cliente vê você, não a gente"** — white-label de verdade.

E há dois números que a Foocci **declara como premissa, nunca como fato de
terceiro** — publicidade comparativa aqui é risco jurídico, porque a tabela de
ninguém é comprovável:

- **23%** de comissão de marketplace, editável pelo próprio dono na calculadora
  (`ASSUMED_RATE_PERCENT` em `src/lib/site/commissionRates.ts:65`);
- **R$ 700/mês** como o que os quatro serviços separados custariam comprados
  à parte (`SEPARATE_STACK_MONTHLY`, mesmo arquivo, linha 104);
- **20% a 35%** como a fatia do faturamento que o restaurante realmente migra
  para o canal próprio nos primeiros meses (`MIGRATION_RANGE`, linha 98) —
  deliberadamente conservador, "o argumento tem que sobreviver ao dono cortar
  pela metade".

## 6. O que a Foocci explicitamente NÃO é

Esta lista é regra de discurso aprovada, não opinião:

- **Não é um chatbot de WhatsApp.** Vender só a IA subvende o produto — e o
  material antigo dizia isso. *(`docs/pendencias.md:1405`)*
- **Não é um marketplace, nem um cardápio digital, nem só um CRM.**
  *(`docs/foocci-resumo-executivo.md` §1)*
- **Nunca se diz que substitui o atendente.** A Foocci apoia a equipe.
- **Proibido prometer número ou percentual de aumento.**
- **Nenhum depoimento, logo de cliente, caso ou métrica inventada** — só o que
  for real e autorizado.
- **Não se ataca o marketplace.** O posicionamento é fortalecer o canal direto.
- **Fora do vocabulário:** omnichannel, agentic, LLM, stack, pipeline, automação
  cognitiva, máquina de vendas.
- **Nunca vender como pronto o que está em piloto** — e, pelo mesmo motivo,
  **nunca anunciar como futuro o que já está à venda**. Mentira nas duas direções
  custa a mesma confiança.

*Fontes: `BriefingFoocci.ts`, campo `proibicoes`; `CLAUDE.md` guardrail 7;
`docs/decisoes.md`, decisões de 05/08 "O fecho da home passa a pedir" e "Calar o
que se entrega custa igual a prometer o que não se entrega".*

E o que ainda **não pode ser vendido como pronto**, hoje: pedido completo por
texto no WhatsApp (piloto por lista de telefones autorizados) e a impressão
física, corrigida no servidor mas nunca confirmada com alguém na loja vendo papel
sair.
*Fonte: `docs/foocci-resumo-executivo.md` §23; `docs/pendencias.md:1486`.*

## 7. Onde o modelo ainda não fecha

Três buracos, e nenhum deles é técnico. São de negócio.

### 7.1 Ninguém sabe quanto custa atender um restaurante

Está em **stand by por decisão do dono desde 31/07/2026**. O achado que não pode
se perder: a tabela `AIInteractionLog` já grava tokens, custo estimado e
`restaurantId` — mas **só o `AIOrderService` escreve nela**. Ficam de fora o
Cérebro, o recepcionista de WhatsApp, o assistente de ajuda, os embeddings, a
melhoria de foto, o suporte e **os crons noturnos** — estes últimos são custo que
cresce a cada restaurante novo, sem nenhum cliente conversando.
*Fonte: `docs/pendencias.md:1463-1481`.*

**Consequência direta:** a Estrutura de Custos do Canvas **não pode ser
preenchida com número**, e a margem de cada uma das três faixas é desconhecida.
O próprio resumo executivo diz isso com todas as letras: *"o documento não traz o
número porque ele ainda não foi apurado por restaurante — isso precisa ser
levantado antes de fechar preço, senão a faixa de entrada pode nascer com margem
negativa."*
*Fonte: `docs/foocci-resumo-executivo.md` §24.*

### 7.2 Em 01/10/2026 o custo de WhatsApp deixa de ser quase zero

A Meta passa a cobrar **mensagem de serviço** e **template de utilidade dentro da
janela de 24h** — exatamente o que o Foocci faz o dia inteiro. A parte que hoje é
grátis, e é a maior, vira paga de uma vez. As tarifas definitivas só saem até
**01/09/2026**; antes disso qualquer número é estimativa e não entra em preço de
plano.
*Fonte: `docs/decisoes.md`, decisão de 2026-08-06, seção "🔴 A data que muda tudo".*

O problema estrutural, escrito na própria decisão: **o custo é variável e a
mensalidade é fixa.** Um restaurante com 3.000 conversas/mês custa muitas vezes
mais que um com 200, e paga o mesmo. Ou o pequeno paga pelo grande, ou o grande
dá prejuízo. Hoje não dói porque o custo é ~zero; **em outubro passa a doer.**

### 7.3 O limite publicado não é cumprido pelo produto

Ver §4.4. É a mesma família do erro dos seis add-ons: número publicado sem motor
que o sustente.

---

# PARTE 2 — Canvas de Modelo de Negócio

> Cada célula carrega a fonte. Onde a fonte não existe, a célula diz **❌ NÃO
> DECIDIDO** ou **❌ NÃO REGISTRADO** e a pergunta correspondente está na última
> seção deste documento.

| Bloco | O que está estabelecido, com fonte |
|---|---|
| **1 · Segmentos de Clientes** | ✅ **B2B: dono de restaurante pequeno e médio no Brasil** que já vende por WhatsApp, depende de marketplace e não tem relacionamento próprio *(`BriefingFoocci.ts`, `publico`)*. ✅ Brasil inteiro — produto digital, sem raio de entrega *(idem, `regiao`)*. ✅ O site é B2B e virar B2C quebra o funil — decisão D1 *(`pendencias.md:1391`)*. ⚠️ Os três planos sugerem três subsegmentos por maturidade: quem está começando a vender direto (Essencial), quem já vende e quer recorrência (Crescimento), quem opera com margem apertada e muitos canais (Performance) *(`src/lib/site/plans.ts`, campo `forWho`)*. ❌ **NÃO REGISTRADO:** porte mínimo, faixa de faturamento-alvo, tipo de cozinha, região prioritária. |
| **2 · Proposta de Valor** | ✅ **O diferencial declarado:** ser o único que faz cardápio, pedido/PDV, atendimento por IA e CRM **conversarem entre si** — não ser melhor que cada um isolado *(`CLAUDE.md`; `resumo-executivo` §24)*. ✅ **Os quatro problemas atacados:** não ser dono do cliente, o caos do WhatsApp, não saber quem sumiu, não saber se o prato dá lucro *(`resumo-executivo` §2)*. ✅ **Os oito argumentos checáveis** *(`resumo-executivo` §22 — reproduzidos na Parte 1 §5)*. ✅ **Ancoragem:** quatro serviços comprados à parte custariam ~R$ 700/mês e não trocam dado entre si *(`commissionRates.ts:104`)*. ✅ **White-label:** o cliente final vê o restaurante, não a Foocci *(`resumo-executivo` §16)*. |
| **3 · Canais** | ✅ **Site comercial `foocci.com.br`**, com calculadora de comissão, página `/site/precos` e **checkout self-service** — o lojista contrata sozinho *(`pendencias.md:1551`; `precos/page.tsx`)*. ✅ **Formulário de demonstração**, hoje na própria página de preços (`id="demonstracao"`), destino de todo botão "Agende uma demonstração" do site *(`precos/page.tsx`, cabeçalho, decisão do CEO de 06/08)*. ✅ **Lead sempre salvo primeiro**, depois a pessoa vai ao WhatsApp com mensagem pronta e um código de ligação que amarra o "oi" ao formulário *(`cronograma-sdr-e-crm-foocci.md`, item 1.2)*. ✅ **O cliente é quem manda o "oi"** — virada de desenho do CEO em 05/08 que elimina risco de banimento e deixa o consentimento evidente *(idem, cabeçalho)*. ✅ **Anúncio "Click to WhatsApp"** no Facebook previsto, apontando direto para o número *(idem, item 2.4)*. ✅ **SDR** (agente que responde o lead no WhatsApp) desenhado, degrau a degrau, e **nada implementado** *(`sdr-foocci-desenho.md`)*. ⚠️ **O canal de WhatsApp de vendas dependia de um número que a Foocci não tinha** — "chega esta semana" em 05/08, ainda ausente em 06/08 *(`cronograma`, pendência 2; `pendencias.md:93`)*. ❌ **NÃO REGISTRADO:** o estado desse número hoje, 14/08. |
| **4 · Relacionamento com o Cliente** | ✅ **Autosserviço primeiro:** o lojista contrata, aceita o contrato, paga e a conta nasce sozinha; sobe o próprio cardápio pelo painel e pelo manual, e isso **não custa nada** *(`pendencias.md:1551`; `servicosAParte.ts`)*. ✅ **Ajuda por IA dentro do painel**, com escalada para humano e chamado numerado com e-mail ao time *(`resumo-executivo` §18; `pendencias.md:1553`)*. ✅ O agente de suporte **admite que não sabe** — pisos calibrados em corpus real *(`pendencias.md:1580`)*. ✅ **Serviço assistido pago, sob consulta:** Configuração (a Foocci sobe cardápio e base) e Gestão pela agência (hora humana) *(`servicosAParte.ts`)*. ✅ **Venda 1:1 pelo CEO** no WhatsApp continua existindo como caminho paralelo ao self-service *(`PlanSubscriptionService.ts`, cabeçalho)*. ⚠️ Cobertura medida do agente de suporte: ensinar 75%, diagnosticar ~30%, agir 0% *(`pendencias.md:1609`)*. |
| **5 · Fontes de Receita** | ✅ **Assinatura recorrente de software, valor fixo, sem comissão sobre a venda do lojista.** Três planos × três ciclos, tabela aprovada pelo CEO em 04/08 *(`src/lib/billing/pricing.ts`, `PLAN_CYCLE_CENTS`)*: Essencial 179/483/1.790 · Crescimento 429/1.158/4.290 · Performance 899/2.427/8.990. ✅ **Desconto único: 50% no primeiro mês**, todo plano e todo ciclo; do segundo em diante, cheio *(idem, cabeçalho)*. ✅ **Cobrança:** Mercado Pago Assinaturas, cartão, conta da própria Foocci *(`PlanSubscriptionService.ts`)*. ✅ **Dois serviços fora da mensalidade, ambos "Sob consulta" e sem motor de cobrança:** Configuração e Gestão pela agência *(`servicosAParte.ts`)*. ✅ **Não existe** add-on, taxa de setup, pacote de mensagem, unidade adicional nem cota — os seis add-ons publicados foram aposentados pelo CEO em 06/08 *(idem, cabeçalho)*. ✅ Nota fiscal: a Foocci **não cobra** pela integração; certificado e custo por documento são do lojista, com o emissor *(idem)*. ⚠️ **Os tetos de pedidos por plano estão publicados e não são medidos nem cobrados** (§4.4). ❌ **NÃO REGISTRADO:** quantos clientes pagantes existem hoje e qual a receita recorrente. ⚠️ A subida do valor promocional para o cheio via `PUT /preapproval` **nunca rodou contra a API real** *(`pendencias.md:1559`)*. |
| **6 · Recursos-Chave** | ✅ **O produto no ar**, cobrindo o ciclo inteiro — loja, cardápio, QR, pedidos, som, impressão por estação, entrega, pagamentos, CRM com 16 campanhas, cupons, fidelidade por níveis, CMV/precificação, analytics, API externa *(`resumo-executivo` §4–§18 e §23)*. ✅ **A arquitetura de agentes com portão de verdade** — o agente responde a partir de um retrato dos fatos do restaurante e um verificador determinístico barra o que não bate; um simulador roda toda madrugada e classifica falha em P0/P1/P2 *(`resumo-executivo` §15)*. ✅ **O cofre de experiências entre restaurantes** — o que um ensina melhora o atendimento de todos, sem vazar dado de ninguém *(idem)*. ✅ **A base de clientes de cada restaurante** — é ela, junto com cupons na carteira, nível conquistado, número aquecido e cardápio configurado, que forma o custo de saída *(`resumo-executivo` §24)*. ✅ **Marca e identidade fechadas** — brand book, laranja `#F97316` só em CTA, dois pesos de fonte, `DESIGN.md` como lei *(`BriefingFoocci.ts`, `identidade_visual`)*. ✅ **Suíte de testes automatizados rodando a cada alteração** — 4.523 em 30/07 *(`resumo-executivo` §18)*, 6.128 em 07/08 *(`pendencias.md:24`)*; o número cresce, a prática é a mesma. ✅ **A estrutura de Diretor + agentes especialistas** com memória versionada no repositório *(`CLAUDE.md`)*. |
| **7 · Atividades-Chave** | ✅ **Construir e operar o produto** (Next.js 14 · Tailwind · Prisma/Postgres · deploy Railway) *(`CLAUDE.md`)*. ✅ **Governança dos agentes de IA:** escada de promoção (sombra → evidência → portão → ao vivo), esteira de treino noturna com destinatário sintético, e a régua de 20 amostras/70% no primeiro degrau e 100/85% no segundo *(`sdr-foocci-desenho.md`; `cronograma-sdr-e-crm-foocci.md`)*. ✅ **Segurança de envio do CRM** — teto diário, silêncio 21h–8h, descanso por cliente, memória imutável de impacto *(`resumo-executivo` §13.3)*. ✅ **Aquisição:** site, formulário, anúncio Click-to-WhatsApp e o SDR quando existir *(`cronograma-sdr-e-crm-foocci.md`)*. ✅ **Venda e fechamento pelo CEO** *(`PlanSubscriptionService.ts`)*. ✅ **Onboarding do lojista** — importação de cardápio por planilha, importação de base antiga, manual versionado, robô noturno de sync *(`resumo-executivo` §6 e §13.1; `CLAUDE.md`, agente `manual`)*. ⚠️ **Medir custo por restaurante** — atividade nomeada em ordem de serviço e **parada** (§7.1). |
| **8 · Parcerias-Chave** | ✅ **Meta (WhatsApp Cloud API + Instagram)** — provedor **único** de WhatsApp por decisão do CEO de 02/08, com extração total da Evolution executada em 04/08. Existe **um único aplicativo** da Foocci dentro da Meta e ele serve os dois canais: permissão negada ou segredo rotacionado derruba os dois juntos *(`decisoes.md`, "O WhatsApp da Foocci passa a ser SÓ a Meta"; `CLAUDE.md`)*. ✅ **Mercado Pago** — duplo papel: assinatura da Foocci (conta-plataforma) e pagamento dos pedidos de cada restaurante *(`PlanSubscriptionService.ts`; `resumo-executivo` §8)*. ✅ **SumUp e Stone** — pagamento, dependem da credencial do lojista *(`resumo-executivo` §8 e §23)*. ✅ **Focus NFe** — emissor fiscal; conta-mãe já existe para a NFC-e dos lojistas e o mesmo provedor emite a NFS-e da Foocci *(`OS-fluxo-de-compra-do-plano.md` §1)*. ✅ **Saipos (PDV)** — integração pronta, depende de credenciamento *(`resumo-executivo` §17)*. ✅ **Google (Meu Negócio + GA4)** — OAuth pronto *(idem)*. ✅ **Railway** — infraestrutura e deploy *(`CLAUDE.md`)*. ✅ **Dioli Digital** — a agência atende a Foocci como cliente fixo (8 reels, 8 carrosséis, 20 stories no primeiro ciclo), proposta **à espera do aceite** *(`docs/dioli-briefing-foocci.md` §4 e §5)*. ⚠️ **Fornecedor de IA:** o roteador tem Claude e Gemini prontos, mas uma trava só deixa passar dois modelos da OpenAI *(`pendencias.md:29-38`)*. |
| **9 · Estrutura de Custos** | ⚠️ **A natureza dos custos está mapeada; nenhum valor está apurado.** Custos **variáveis**: mensagens de WhatsApp (por conversa, cresce com base e campanha), tokens de IA (por uso, cresce com pedidos e conversas), melhoria de foto por IA (por foto), emissão de NFC-e (por documento), armazenamento de imagem, **suporte humano (variável e alto)**. **Semi-fixo:** banco e infraestrutura *(`resumo-executivo` §19)*. ✅ **Tarifa da Meta hoje, em fonte oficial:** serviço dentro da janela de 24h R$ 0 e ilimitado · utilidade na janela R$ 0 · utilidade fora da janela R$ 0,035 · **marketing R$ 0,3217 sempre** · autenticação R$ 0,035 · janela de 72h por anúncio Click-to-WhatsApp R$ 0 · mensagem que o cliente envia nunca é cobrada. **Não existe cota gratuita mensal** *(`decisoes.md`, 2026-08-06)*. 🔴 **Em 01/10/2026 a Meta passa a cobrar mensagem de serviço e template de utilidade dentro da janela** — a parte hoje grátis, e é a maior. Tarifas definitivas até 01/09 *(idem)*. ❌ **NÃO APURADO — e é o buraco central deste Canvas:** custo de IA por pedido, infraestrutura por restaurante ativo e horas de suporte. Em **stand by por decisão do dono desde 31/07**; o logger de custo só cobre um dos caminhos de IA *(`pendencias.md:1463-1481`)*. **Consequência: a margem de cada uma das três faixas é desconhecida** *(`resumo-executivo` §24)*. |

---

# O que só o CEO responde

> Sete perguntas. Cada uma é fechada — dá para responder em uma frase. Cada uma
> vem com no mínimo duas saídas, o que custa, o que arrisca, e a recomendação do
> Diretor, como manda a regra de ouro de 14/08/2026.

---

### 1. Os tetos de pedidos publicados nos planos valem como cobrança?

**Por que a pergunta existe:** o site anuncia 300, 1.200 e 4.000 pedidos/mês por
plano *(`precos/page.tsx`)*, e o produto **não mede nem bloqueia nada**
*(`pendencias.md:1489`)*. É promessa publicada sem motor — a mesma família do
erro dos seis add-ons que você aposentou em 06/08.

| Saída | Custo | Risco |
|---|---|---|
| **A · Valem.** Engenharia constrói contagem por ciclo, aviso ao lojista antes do teto e caminho de upgrade. | Um bloco de engenharia. | Cliente que estoura sem ter sido avisado vira atrito na renovação. |
| **B · Não valem.** O teto sai do site e vira orientação ("indicado para até ~300 pedidos"). | Uma mudança de texto. | Perde-se a alavanca natural de upgrade, e o preço deixa de acompanhar o consumo — logo depois de outubro, quando o consumo passa a custar. |

**Recomendação: A, em duas etapas.** Primeiro **só medir e mostrar** ao lojista,
sem bloquear nada; depois decidir se bloqueia. Medir é barato, e é o mesmo número
que falta para saber o custo (pergunta 3). Bloquear de saída, sem histórico, cria
briga no primeiro mês de um cliente novo.

---

### 2. Em 01/10, quando a Meta passar a cobrar a mensagem de serviço, o custo continua embutido na mensalidade?

**Por que a pergunta existe:** você decidiu em 06/08 que o custo de WhatsApp
entra na mensalidade de quem usa CRM, e essa decisão vale. Só que ela foi tomada
quando esse custo era ~zero. Em **01/10** ele deixa de ser.

| Saída | Custo | Risco |
|---|---|---|
| **A · Continua embutido**, e o preço dos planos é revisado quando a Meta publicar a tarifa (até 01/09). | Uma revisão de tabela, com data marcada. | Restaurante que conversa muito passa a dar prejuízo dentro do mesmo plano. |
| **B · Continua embutido até um teto de mensagens por plano**, e o excedente vira cobrança. | Motor de cobrança de excedente — obra de verdade, e hoje não existe. | Fatura variável é exatamente o que o lojista de restaurante odeia; e o teto de mensagens já foi publicado uma vez sem motor. |

**Recomendação: A, com a revisão agendada para 01/09.** Não dá para precificar o
que a Meta ainda não publicou, e o B exige construir cobrança de excedente antes
de saber o tamanho do problema. Se depois da tarifa a conta não fechar, o B
continua disponível.

---

### 3. Posso retomar o levantamento do custo por restaurante, que está em stand by desde 31/07?

**Por que a pergunta existe:** sem esse número, **três coisas ficam no escuro** —
a margem de cada plano, o teto certo de cada faixa e o efeito de outubro. O
resumo executivo diz, textualmente, que sem ele *"a faixa de entrada pode nascer
com margem negativa"*.

| Saída | Custo | Risco |
|---|---|---|
| **A · Retomar agora.** Ligar o medidor de custo em todos os caminhos de IA, corrigir a tabela de preços de modelo, e uma semana de coleta em produção. Entrega uma tela `/admin/margem`, não uma planilha. | Um bloco de engenharia + uma semana de espera. | Ocupa uma frente que poderia ir para venda. |
| **B · Seguir em stand by** e tratar preço por leitura de mercado. | Zero agora. | Em outubro o custo aparece de uma vez, e a primeira conversa sobre margem acontece com o cliente já dentro. |

**Recomendação: A.** É o mesmo número que responde as perguntas 1 e 2, e a
coleta leva uma semana — se começar depois de 01/09, chega atrasada para
outubro. Nada aqui é manual: a tela lê sozinha o que o sistema já grava.

---

### 4. Configuração e Gestão pela agência: dar preço ou manter "sob consulta"?

**Por que a pergunta existe:** são os dois únicos serviços fora da mensalidade, e
os dois estão como "Sob consulta" porque **você não deu faixa** — e as faixas
antigas vinham do documento inexistente *(`servicosAParte.ts`)*.

| Saída | Custo | Risco |
|---|---|---|
| **A · Manter sob consulta**, fechando caso a caso. | Zero. | Cada negociação toma seu tempo pessoalmente; não escala. |
| **B · Dar uma faixa pública** (ex.: Configuração por número de itens do cardápio) e construir a cobrança. | Faixa decidida por você + motor de cobrança que hoje não existe. | Publicar preço sem motor foi exatamente o erro de 06/08 — se for B, o preço só sobe ao site **depois** do motor. |

**Recomendação: A por enquanto.** Construir cobrança para um serviço de hora
humana não se paga com poucos clientes. Quando a Configuração for pedida por
volume, o B se justifica sozinho.

---

### 5. O número de WhatsApp de vendas da Foocci está ativo hoje?

**Por que a pergunta existe:** ele destrava, de uma vez, o botão de WhatsApp no
site, o anúncio Click-to-WhatsApp e o SDR inteiro. O repositório registra "chega
esta semana" em 05/08 e ainda ausente em 06/08 — **o estado de hoje não está
escrito em lugar nenhum**, e eu não invento o que não tenho fonte.

| Saída | Custo | Risco |
|---|---|---|
| **A · Existe.** Você me passa o número, eu ligo a variável e o caminho de WhatsApp acende sozinho no site — a infraestrutura já está pronta e desligada esperando. | Minutos. | Nenhum: a primeira mensagem é sempre do cliente, então não há risco de banimento nem de abordagem fria. |
| **B · Não existe.** Contratar um chip dedicado, na Meta Cloud API (Evolution está fora por decisão sua de 08/08). | Custo de linha + registro do número no aplicativo da Meta. | Enquanto não houver, o site continua convidando para uma conversa que não tem porta, e o SDR não sai do papel. |

**Recomendação: responder qual dos dois é**, porque o resto da fila de aquisição
depende disso e nada mais está bloqueando.

---

### 6. Como você vai medir se a Foocci deu certo?

**Por que a pergunta existe:** está registrado como pergunta **em aberto** desde
30/07 *(`BriefingFoocci.ts`, `PENDENTES`, campo `como_mede`)*, com a justificativa
de que supor a resposta geraria relatório sobre a métrica errada. O objetivo
declarado — *"fechar os primeiros restaurantes pagantes em 90 dias"* — diz o
destino, não o número que você olha.

| Saída | Custo | Risco |
|---|---|---|
| **A · Número de restaurantes pagantes.** | Já dá para contar hoje. | Não distingue um Essencial de um Performance, e trata cliente com 50% de desconto igual a cliente cheio. |
| **B · Receita recorrente mensal (a soma das mensalidades ativas).** | Já dá para contar hoje. | Cresce mesmo quando a margem encolhe — em outubro isso deixa de ser detalhe. |
| **C · Receita recorrente + margem por restaurante.** | Depende da pergunta 3. | Só existe depois do levantamento de custo. |

**Recomendação: B agora, C a partir de outubro.** B você consegue olhar desde a
primeira venda; C é o único que sobrevive à chegada do custo de WhatsApp.

---

### 7. Contra quem a Foocci se compara — e isso pode ir para o site?

**Por que a pergunta existe:** os documentos dizem o que a Foocci **não é**
(chatbot, ERP, marketplace) e as quatro categorias que ela substitui, mas
**nunca nomeiam um concorrente** — está registrado como pergunta aberta em
`BriefingFoocci.ts` (`PENDENTES`, campo `concorrentes`). Ao mesmo tempo, o site
já nomeia o iFood no gancho da home, por pedido seu de 04/08, e a página de
preços tem uma trava jurídica explícita: **nunca afirmar a taxa de um
concorrente**, só declarar uma premissa editável.

| Saída | Custo | Risco |
|---|---|---|
| **A · Manter como está:** só o marketplace é nomeado, como canal de venda do próprio lojista, e nenhuma taxa de terceiro é afirmada. | Zero. | Nenhum — é a posição mais segura, e já está no ar. |
| **B · Nomear concorrentes de software** (cardápio digital, CRM, PDV) numa tabela comparativa. | Levantamento de tabela de cada um. | Publicidade comparativa só é lícita com dado **verdadeiro e comprovável**; nenhuma dessas tabelas é comprovável, e o próprio site já recuou disso uma vez. |

**Recomendação: A.** A comparação forte já está feita sem nomear ninguém: quatro
serviços à parte custariam ~R$ 700/mês e não trocam dado entre si. Nomear
software concorrente traz risco jurídico e não acrescenta argumento.

---

## Nota de rodapé do Diretor — uma incoerência encontrada e não corrigida

Ao escrever este documento, apareceu um conflito entre arquivos que os agentes
leem como verdade:

- `CLAUDE.md` §"Decisões pendentes do CEO" e `docs/pendencias.md:1489` dizem que
  **"faixas de preço"** estão em stand by / pendentes;
- a tabela de preço foi **fechada pelo CEO em 04/08/2026**, está em
  `src/lib/billing/pricing.ts` e é a mesma fonte que o checkout usa para cobrar.

O que continua realmente aberto é o **custo por restaurante** e o **bloqueio por
plano** — não o preço. Pela hierarquia de conflito do `CLAUDE.md`, o item de menor
precedência deveria ser corrigido na mesma sessão; **não corrigi** porque o
despacho deste bloco restringe a escrita a este arquivo. Fica registrado aqui
para o Diretor fechar na próxima passagem.
