# Raio-X do Foocci — o produto inteiro, lido do que existe

> **Auditoria de leitura pura.** Nenhuma linha de código foi escrita, nenhuma
> variável tocada, nenhuma mensagem enviada, nenhum dado alterado. Produção foi
> consultada **somente em rotas de diagnóstico de leitura**.
>
> Data: **24/08/2026** · Commit auditado: `abb2af5` (é o mesmo que está no ar —
> confirmado em `/api/health`) · Branch de deploy: `claude/remove-legacy-runner-q8iXa`
>
> **Por que este documento existe:** o CEO perguntou a um Diretor o que era o
> produto dele e a resposta honesta foi "não sei". A ordem foi um raio-X
> minucioso de cada produto. Este é o do Foocci.
>
> **Regra de leitura deste documento:** onde documento e código discordaram, o
> **código ganhou** — e a discordância virou achado na §8. Onde não havia prova,
> está escrito **"preciso confirmar"**, e a pergunta está na §10.

---

## Sumário de uma página (para quem só lê isto)

| | |
|---|---|
| **O que é** | O sistema que faz o restaurante vender direto ao próprio cliente — cardápio, pedido, cozinha, pagamento, WhatsApp e pós-venda num lugar só, com IA atendendo por trás. |
| **Para quem** | Restaurantes pequenos e médios que hoje pagam 12–30% de comissão a marketplace. E, do outro lado, o consumidor que pede comida — que **nunca vê a marca Foocci**. |
| **Quanto anda sozinho** | O atendimento e o relacionamento andam sozinhos; a **cozinha nunca**. Pedido nasce parado esperando o lojista aceitar. |
| **Tamanho real hoje** | **1 restaurante cliente**, 463 pedidos, 5.220 clientes na base, **0 assinaturas** — receita de plano ainda não começou. |
| **A contradição mais grave** | A escada de liberação da IA é um **catraca, não uma tranca**: o portão é conferido só na hora de promover e **nunca mais**. O único cliente real está com o raciocínio livre no topo da escada (`RESTAURANT_WIDE`) com os portões **reprovando hoje**. |

---

## 1. A promessa — na linguagem que o produto usa com o cliente

Não inventei posicionamento: isto é o que as telas de venda dizem hoje, no ar.

**A manchete do site** (`/site`, lida ao vivo em 24/08):

> *"Sistema completo para restaurantes. Chega de pagar comissão para entregar o
> seu cliente para outro. Cada pedido no marketplace leva uma fatia do seu
> faturamento — e o cliente continua sendo deles. No Foocci a taxa é fixa e o
> cliente é seu: nome, telefone e histórico no seu cadastro."*

A promessa tem **três pernas**, e as três aparecem escritas:

1. **Pare de pagar comissão.** O site abre com uma calculadora: o visitante põe
   quanto fatura no delivery e a taxa que paga hoje, e vê quanto sobraria.
   Premissa declarada na tela: *"No iFood você paga 23%"* — e o próprio texto se
   defende: *"Não afirmamos a tabela de nenhum aplicativo — confira a sua no
   extrato"* e *"não é promessa de resultado"*.
2. **Quatro serviços viram um, e conversam entre si.** A tabela comparativa do
   site põe lado a lado Cardápio digital, PDV/gestão, Atendimento por IA e CRM de
   fidelidade: *"~R$ 700 separado · R$ 429 no Foocci — 39% menos que a soma dos
   quatro"*. E declara que o diferencial não é o preço: *"a diferença que não cabe
   no preço: o dado atravessa"*.
3. **A IA não mente.** É o item nº 1 da seção *"O que só tem aqui"*:
   *"A IA é impedida de mentir — toda resposta é conferida contra o seu cardápio
   real antes de sair, e um simulador testa o agente [toda madrugada]"*.

**O que o restaurante recebe, concretamente:** uma loja de pedidos com a marca
dele (`/pedido/<slug>`), um cardápio de mesa por QR (`/qr/<slug>`), um painel de
pedidos com alarme, impressão de comanda, um CRM com 16 campanhas prontas, um
agente de IA que atende, e relatórios.

> **Prova:** `src/app/site/(gated)/page.tsx`, `src/app/site/(gated)/precos/page.tsx`,
> `docs/foocci-resumo-executivo.md` §1.

---

## 2. Quem é o cliente — e quem é o cliente do cliente

São **dois públicos**, e o produto serve os dois com superfícies diferentes. Isso
está codificado na estrutura de pastas, não é interpretação minha.

### 2.1 O cliente que paga: o lojista

- **Quem é:** o dono de restaurante pequeno/médio. O manual do produto o descreve
  como alguém que *"não é desenvolvedor"* e o próprio CEO se define como
  *"do marketing, não entendo de sistema"*.
- **Onde ele vive:** o painel `(dashboard)` — 60 telas. Marca **Foocci**, laranja
  (`brand-500`/`brand-600`).
- **A dor que o produto declara atacar** (`docs/foocci-resumo-executivo.md` §2):
  (1) não é dono do próprio cliente; (2) o WhatsApp virou um caos; (3) não sabe
  quem sumiu; (4) não sabe se está ganhando dinheiro no prato.

### 2.2 O cliente do cliente: o consumidor que pede comida

- **Quem é:** quem tem fome. Chega por WhatsApp, por QR na mesa ou por link.
- **Onde ele vive:** `/pedido/<slug>` e `/qr/<slug>` — **white-label**. Cor, logo
  e tom são do restaurante.
- **A regra dura:** *"O cliente final nunca vê 'Foocci' — vê o restaurante."*
  Isso não é só texto: existe `src/lib/public-url.ts`, cujo trabalho declarado é
  impedir que o domínio interno da Railway vaze em link de cliente.
  **⚠️ Essa trava tem um furo real — ver §8, achado C.**

**O consumidor final não paga nada ao Foocci.** Quem paga assinatura é o lojista.
O consumidor paga a comida ao restaurante.

---

## 3. O que o produto faz de fato — módulo por módulo

Inventário conferido contra o código. As marcas de maturidade são as do próprio
projeto e são conservadoras de propósito.

| Módulo | O que entrega | Estado |
|---|---|---|
| **Canal de venda próprio** | Loja `/pedido` white-label, QR de salão `/qr`, **três preços por prato** (delivery/salão/iFood), visibilidade por canal, pausa de emergência, horários com almoço e jantar separados, links rastreáveis com funil até faturamento | pronto |
| **Operação do pedido** | Fila ao vivo (7 status), 3 tipos (delivery/retirada/salão), **alarme que repete até alguém aceitar** (volume até 400%), trava para só um aparelho tocar, impressão por estação (caixa/cozinha 1-5/copa), **fila de impressão com 5 tentativas** | pronto |
| **Cardápio** | Categorias, variantes, adicionais com mín/máx, esgotado no clique, carrossel de fotos, importação por planilha, melhoria de foto por IA com aprovação humana, campos de enriquecimento para a IA | pronto |
| **CMV e Precificação** | Custo por item, ficha técnica com insumos, markup calculado sobre despesa real, reprecificação automática até um teto (padrão 15%), arredondamento comercial, CMV do período, histórico de preço | pronto |
| **Pagamentos** | Pix, dinheiro, cartão, link; pagar agora/na entrega/na retirada; troco. Provedores: Mercado Pago, SumUp (cartão), **Stone** (link/Pix) | pronto, **sem provedor ligado em produção** |
| **Nota fiscal (NFC-e)** | Emissão modelo 65, cadastro fiscal completo, numeração atômica, CSC cifrado, começa sempre em homologação, defaults em 3 níveis, aviso de validade do certificado | depende do certificado A1 do lojista |
| **Entrega** | Taxa simples / por zonas / por distância (base + km, piso e teto), pedido mínimo, frete grátis acima de X, tempo por zona, retirada independente | pronto |
| **WhatsApp e canais** | Agente recepcionista, personalidade configurável, menu de entrada, passagem para humano, identidade do cliente entre canais. **Provedor único: Meta Cloud API** | pronto (ver §8-B) |
| **Pedido por texto no WhatsApp** | O cliente pede por mensagem e o agente monta o carrinho | **pausado e em DRY_RUN — não envia nada** (§9) |
| **Central de Conversas** | Caixa única (WhatsApp, cardápio, QR, Instagram), humano assume do agente, estados, histórico, alarme de "precisa de gente" | pronto |
| **CRM** | Ficha por cliente, segmentação automática (quente/morno/frio/perdido), **16 campanhas prontas**, importação de base, limpeza automática | pronto |
| **Segurança de envio do CRM** | Teto diário (200), **silêncio das 21h às 8h**, descanso de 24h por cliente, máx. 5/semana, atraso aleatório 5-45s, distribuição justa, fila de prioridade, **livro imutável de quem já foi contatado**, parada automática se a falha passar de 50% | pronto |
| **Cupons, fidelidade, indicação** | 6 tipos de cupom, carteira do cliente, 4 níveis (Bronze→Diamante) com janela móvel e rebaixamento diário, brinde físico com estoque real, link de indicação | pronto, desligado por padrão |
| **Analytics** | Visão geral, curva de produtos, **produtos com zero venda**, attach rate, retenção por safra (cohort), eficiência operacional, **diagnóstico automático de causa em português** | pronto |
| **Agentes de IA** | Garçom (vende no cardápio), Recepcionista de WhatsApp, Agente de CRM (escreve a campanha), Agente de Analytics, Assistente de ajuda do lojista | pronto |
| **Integrações** | Saipos (PDV), Mercado Pago, SumUp, Stone, Google Meu Negócio + GA4, Meta, **API externa própria** com chave revogável | dependem de credencial |
| **Esteira de agência** | SDR → PM de mídia → Oficina de peças. **Produto separado no mesmo repositório** | ver §9 |

> **Nota de escala:** 540 rotas de API e ~124 páginas. Este não é um produto
> pequeno com nome grande.

---

## 4. Quanto é máquina e quanto é gente — e quem clica

Esta seção responde "onde o sistema para esperando um humano", e **diz qual
humano**.

### 4.1 Onde a máquina anda sozinha (ninguém clica)

| O que | Quem faz |
|---|---|
| Responder o consumidor no cardápio e no WhatsApp | Agente de IA, 24h |
| Classificar cliente em quente/morno/frio/perdido | Rotina diária |
| Reclassificar nível de fidelidade (inclusive **rebaixar** quem parou de comprar) | Rotina diária |
| Escolher quem recebe cada campanha, escrever a mensagem e respeitar os tetos | Motor de CRM |
| Recalcular custo de prato quando o insumo sobe | Motor de CMV |
| Reprecificar até o teto de variação configurado | Motor de CMV (acima do teto **vira sugestão** — aí é o lojista) |
| Enfileirar e reimprimir comanda que falhou (5 tentativas) | Fila de impressão |
| Provisionar a conta do restaurante quando o pagamento é confirmado | Webhook do Mercado Pago → `PlanProvisioningService` |

### 4.2 Onde o sistema PARA e espera um clique — e de quem

| O que para | **Quem clica** | Por quê |
|---|---|---|
| **Todo pedido novo** — nasce `PENDING` | **o lojista** | O alarme repete até alguém aceitar. A cozinha nunca é automática, de propósito. |
| Conversa que a IA não resolve | **o lojista** (atendente) | O agente sinaliza "precisa de gente" com som próprio; o humano assume a conversa. |
| Foto melhorada por IA | **o lojista** | Aprova ou rejeita cada uma. |
| Reprecificação acima do teto | **o lojista** | Vira sugestão, não aplica sozinha. |
| Nota fiscal ir de homologação para produção | **o lojista** | Nunca sobe sozinha. |
| Ligar o programa de fidelidade | **o lojista** | Nasce inerte. |
| Finalizar o pedido no carrinho | **o consumidor** | (o único clique que é dele) |
| **Promover a IA na escada de liberação** | **a nossa casa** | Ato humano, por doutrina. **É exatamente aqui que está o problema da §8-A.** |
| Ligar o canal de vendas por WhatsApp do site | **a nossa casa (o CEO)** | Uma variável no Railway. Hoje **desligada** (§9). |
| Ligar o envio do SDR | **a nossa casa (o CEO)** | Hoje **desligada** (§9). |
| Cadastrar credencial de pagamento do restaurante | **o lojista** | Hoje **não há nenhuma** em produção (§6). |

**Resumo honesto:** o produto é muito automático **do lado do relacionamento** e
deliberadamente manual **do lado da cozinha**. O ponto de dependência humana que
mais pesa hoje não é do lojista — é **da nossa casa**: quase tudo que está
desligado depende de alguém aqui apertar um botão.

---

## 5. O modelo de dinheiro

### 5.1 Existe UMA tabela de preço viva — e isso foi conquistado

Perguntei explicitamente se havia duas tabelas (foi o que aconteceu na Dioli).
**Não há.** Existe uma fonte única: `src/lib/billing/pricing.ts`, cujo cabeçalho
registra o motivo:

> *"Antes deste arquivo havia **quatro tabelas de preço separadas** no repositório
> e nenhuma garantia de que o valor anunciado era o valor cobrado; num checkout
> self-service isso vira cobrança diferente do anunciado no primeiro cliente."*

A página pública, o checkout, o motor de assinatura e o admin leem todos daqui.

**A tabela (aprovada pelo CEO em 04/08/2026), em centavos, no código:**

| Plano | Banco | Mensal | Trimestral | Anual |
|---|---|---|---|---|
| **Essencial** | `STARTER` | R$ 179 | R$ 483 | R$ 1.790 |
| **Crescimento** | `GROWTH` | R$ 429 | R$ 1.158 | R$ 4.290 |
| **Performance** | `PRO` | R$ 899 | R$ 2.427 | R$ 8.990 |

**Regras de desconto, à risca:** o valor do ciclo **é** o valor cobrado (o anual
já embute os dois meses grátis; o trimestral já embute os 10%). O **único**
desconto é **50% no primeiro mês**, para todo cliente novo, em qualquer plano e
ciclo. Não existe "preço fundador" no motor. E o arquivo recusa arredondar:
metade de R$ 179,00 é R$ 89,50, e é isso que a página imprime.

### 5.2 Os limites anunciados

| Plano | Anunciado no site |
|---|---|
| Essencial | Até **300 pedidos/mês** (≈10/dia) |
| Crescimento | Até **1.200 pedidos/mês** (≈40/dia) · 3.000 mensagens |
| Performance | Até **4.000 pedidos/mês** (≈130/dia) · 10.000 mensagens |

### 5.3 O que acontece ao estourar o limite

**Nada.** Nenhum código mede pedidos por mês, nenhum código mede mensagens por
mês, e nenhum código barra ninguém por ter estourado. Detalhe na §8-B.

### 5.4 Como a Foocci cobra, e o que falta

- **Cobrança:** Mercado Pago como gateway de plataforma (`mpConfigured: true`
  em produção). Checkout self-service em `/contratar/novo`.
- **Emissão de nota da Foocci ao lojista:** **desligada**. Produção responde:
  *"Emissão desligada (`FOOCCI_NFSE_ENABLED`≠true) — aguardando SLU-ME/CNAE de
  software."* Ou seja: mesmo que alguém assine hoje, **a Foocci não consegue
  emitir a nota fiscal dela**.
- **Custo por restaurante:** **em stand by desde 31/07/2026.** Não foi apurado.
  O próprio resumo executivo alerta: *"sem isso a faixa de entrada pode nascer
  com margem negativa."*

---

## 6. O estado real em produção, hoje (24/08/2026)

Números lidos ao vivo em rotas de diagnóstico, não estimados.

### 6.1 O tamanho

| Medida | Valor |
|---|---|
| Restaurantes cadastrados | **2** — sendo **1 cliente real** e 1 vitrine de demonstração |
| Cliente real | **Sushi Cazza**, plano `STARTER`, ativo desde **12/05/2026**, marcado `PRONTO_PARA_PILOTO` |
| Demo | **Foocci Bakery**, plano `PRO`, `isDemo: true`, criada em 04/08/2026 |
| Pedidos no sistema | **466** (463 do Sushi Cazza) |
| Clientes na base | **5.245** (5.220 do Sushi Cazza — a maioria veio de importação) |
| Cardápio do cliente real | 19 categorias, **133 itens** |
| Campanhas de CRM criadas | **76** |
| Migrações de banco aplicadas | 201, nenhuma com falha |
| **Assinaturas de plano** | **0 (zero)** |

### 6.2 Faturamento que passou pela plataforma

**Preciso confirmar o valor em reais dos 463 pedidos** — não há rota de
diagnóstico admin que devolva faturamento agregado, e eu não escrevo consulta
nova numa auditoria de leitura. O que **posso** afirmar com prova:

- **Receita de assinatura da Foocci: R$ 0.** Não há uma assinatura sequer, e a
  fila de notas da Foocci está zerada ("0 nota(s) aguardando emissão, somando
  R$ 0,00").
- **Pagamento online do restaurante: não funciona hoje.** O preflight de produção
  responde: *"Nenhum provedor online configurado — `pay_now` bloqueado; pagamento
  na entrega/retirada funciona."* O único cliente real recebe **na entrega**.
- O raio-x noturno mediu, na última coleta que conseguiu rodar: **139 carrinhos
  abertos há mais de 24h somando R$ 15.217,40 que nunca viraram pedido** — uma
  boa medida da ordem de grandeza do ticket (≈ R$ 109 por carrinho).

### 6.3 O elo faltante entre o cliente real e o modelo de cobrança

O Sushi Cazza **é anterior ao checkout** (12/05 vs. o fluxo de contratação criado
em 05/08). Ele não tem assinatura vinculada. Está em `STARTER`, o plano que a
tabela diz **não incluir o Garçom de IA** — e roda o Garçom mesmo assim, por um
"grandfather" explícito e documentado no código. Isso está **certo** (derrubar a
IA de um cliente vivo no dia do deploy seria um incidente), mas significa que
**a cobrança por plano nunca foi exercida contra ninguém.**

---

## 7. A arquitetura em uma página (para quem não lê código)

### Por onde entra um restaurante, e o que acontece em que ordem

```
 1. DESCOBERTA        O dono cai no site (foocci.com.br/site).
                      Usa a calculadora: "quanto eu economizo?"
                          │
 2. CONTRATAÇÃO       /contratar/novo → escolhe plano e ciclo, paga.
                      (hoje: 0 pessoas passaram por aqui)
                          │
 3. PROVISIONAMENTO   Webhook do Mercado Pago confirma o pagamento.
    (automático)      Nasce, numa ÚNICA transação: o restaurante,
                      o usuário dono e os ajustes padrão.
                      Trava contra duplicidade = índice UNIQUE no banco,
                      não um "if" — porque o gateway reenvia o evento.
                          │
 4. ONBOARDING        O lojista preenche: endereço, horários, cardápio,
    (o lojista clica)  entrega, pagamento. Uma tela mede o que falta e
                      entrega os dois links dele: a loja e o QR.
                          │
 5. CANAIS            Conecta o WhatsApp (Meta), opcionalmente Instagram,
    (o lojista clica)  Google, o PDV Saipos, a impressora (agente
                      "Carteiro" num PC Windows da loja).
                          │
 ═══════════════ daqui pra frente é o dia a dia, em loop ═══════════════
                          │
 6. O CONSUMIDOR      Chega por WhatsApp, QR da mesa ou link rastreável.
    CHEGA             O agente de IA atende: sugere, monta combo,
                      respeita alergia. Um verificador confere cada
                      resposta contra o cardápio real antes de sair.
                          │
 7. PEDIDO            Carrinho → checkout → o pedido nasce PENDING.
                          │
 8. A COZINHA         ⏸ O ALARME TOCA E REPETE ATÉ ALGUÉM ACEITAR.
    ACEITA            Só um aparelho toca. Aceito → imprime a comanda
    (o lojista clica)  na estação certa; se não imprimiu, volta pra fila
                      até 5 vezes.
                          │
 9. ENTREGA           Status andam até Entregue. Nota fiscal, se ligada.
                          │
10. PÓS-VENDA         O pedido vira histórico. O cliente é classificado.
    (automático)      As campanhas prontas disparam na hora certa,
                      respeitando silêncio 21h-8h, teto diário e o livro
                      de quem já foi contatado.
                          │
11. O CLIENTE VOLTA   ──→ volta ao passo 6.
```

**Onde termina:** não termina — o valor do produto está no laço 6→11 girando. É
por isso que o próprio material de venda diz que o custo de sair cresce com o
tempo de uso.

**As três peças que sustentam tudo por baixo:**
- **O Cérebro** — a máquina de raciocínio: retrato dos fatos do restaurante,
  verificador que barra o que não bate, escada de liberação, cofre de
  experiências entre restaurantes.
- **A frota noturna** — dezenas de rotinas agendadas que testam os agentes,
  reclassificam clientes, disparam campanhas e auditam o sistema. **É o que
  quebrou — §8-A.**
- **O isolamento entre restaurantes** — toda consulta é presa ao inquilino.

---

## 8. As contradições — o que se promete contra o que se faz

Esta é a seção que o Diretor Geral pediu como a mais valiosa. Ordenei por
gravidade.

---

### 🔴 A — A escada de liberação da IA é uma catraca, não uma tranca

**Esta é a contradição mais grave do produto.** É a irmã direta da "etiqueta com
carimbo que nunca expira" que a casa achou na Dioli.

**O que se promete.** É o argumento nº 1 do site, na seção "O que só tem aqui":

> *"A IA é impedida de mentir — toda resposta é conferida contra o seu cardápio
> real antes de sair, e um simulador testa o agente toda madrugada."*

E o resumo executivo detalha a escada:

> *"Uma mudança de comportamento roda primeiro em sombra (calcula mas não envia),
> acumula evidência, **passa por um portão de qualidade** e só então vai ao vivo."*

**O que o código faz.** O portão (`gates.allPass`) é conferido em **exatamente
dois lugares**: dentro de `promoteFreeFormToAllowlist` e dentro da abertura para
`RESTAURANT_WIDE` (`src/services/brain/runtime/freeFormGovernance.ts:171` e
`:198`). **Nada reavalia o portão depois.** Existe um `rollbackFreeForm` — mas é
um **kill manual**, alguém precisa apertar. Não há um só caminho de código que
rebaixe a IA sozinho quando a evidência que a promoveu deixa de existir.

**O que produção responde HOJE**, para o único cliente real (Sushi Cazza):

```
mode: "RESTAURANT_WIDE"      ← o topo da escada. Vale para TODOS os clientes dele.
paused: false                ← ligado.
gates.allPass: false         ← OS PORTÕES ESTÃO REPROVANDO.
gates.shadowEvidence: false
gates.shadowSamples: 0       ← exigido: 20
gates.shadowPassRate: 0      ← exigido: 70%
notes: "evidência de sombra insuficiente para ALLOWLIST
        (amostras LLM 0/20, coerência PASS 0%/70%)"
```

Leia de novo o campo `notes`: a máquina está dizendo que a evidência é
insuficiente **até para o degrau de baixo** (`ALLOWLIST`) — e o restaurante está
dois degraus acima disso, ao vivo, atendendo gente de verdade.

**Como chegou aqui.** As próprias notas de auditoria contam:
`[AUDIT 2026-07-11] promote ALLOWLIST (gates PASS)` → `[RW_OPENED 2026-07-12]
free-form → RESTAURANT_WIDE (gates PASS)`. Em julho os portões passavam. Passaram
**uma vez**, a catraca girou, e ninguém nunca mais perguntou.

**Por que é grave e não acadêmico:** o guardrail 2 do projeto diz *"sem portão =
reprovado; esquecer um gate nunca pode significar aprovado"*. Aqui é pior que
esquecer: o portão está **ativamente reprovando**, por escrito, e a IA continua
no ar. O produto vende a trava como diferencial nº 1.

**E o manual não sabe.** O `CLAUDE.md` do Foocci ainda lista, entre as decisões
pendentes do CEO: *"**Promover** o raciocínio livre do Cérebro de `SHADOW_ONLY`
para `ALLOWLIST`. A máquina está construída e **desligada**; a promoção é ato
humano."* Isso foi promovido **dois degraus acima disso, há seis semanas**. O
manual descreve um sistema desligado que está ligado no máximo.

---

### 🔴 B — A frota noturna inteira caiu por **um** segredo, e ficou 9 dias fora sem ninguém notar

**O que se promete.** O site, no presente do indicativo: *"um simulador testa o
agente toda madrugada"*. O resumo executivo: *"O agente é testado toda madrugada
(...) se aparecer um P0, o sistema falha o processo e avisa."*

**O que aconteceu.** As rotinas noturnas são workflows do GitHub Actions e
**todas leem o mesmo segredo, `FOOCCI_BASE_URL`**, para montar a URL de produção
(o raio-x, a auditoria de qualidade e o cron de CRM — conferido nos três
arquivos). Esse segredo passou a apontar para um endereço da Railway que não
existe mais.

**A prova, do log da execução de hoje 06:56 UTC:**

```
→ Endpoint: ***/api/cron/raiox/run
← HTTP 404 (curl exit 0)
{ "status": "error", "code": 404, "message": "Application not found" }
##[error]endpoint devolveu 404
```

**O rastro completo:**

| | |
|---|---|
| Raio-x noturno | Última execução **bem-sucedida: 15/08**. Desde 16/08, **9 noites seguidas de falha**, incluindo hoje. |
| Auditoria de qualidade (o "simulador da madrugada") | Última execução registrada: **14/08**. **10 dias.** |
| CRM Cron (a cada 15 min) | Falhando o dia inteiro de hoje; voltou a passar por volta das **13:09 UTC de hoje**. |

**A cascata — o dano não foi só "o relatório não saiu":**

O CRM Cron é quem dispara as campanhas. Com ele fora, a última coleta do raio-x
que conseguiu rodar já mostrava o entulho se acumulando:

- **1.949 envios de campanha pendentes** parados na fila;
- **9 sessões de pedido por texto vencidas e ainda abertas** — o próprio raio-x
  diagnosticou: *"o relógio que fecha essas sessões pode ter parado"*;
- **139 carrinhos abertos há mais de 24h, R$ 15.217,40**, que a campanha de
  carrinho abandonado existia justamente para recuperar — e que não rodou;
- 4 importações travadas há mais de 2.000 horas.

**A camada de alarme falhou em três níveis ao mesmo tempo, e vale nomear os três:**

1. O raio-x devolveu `globalStatus: FAIL` **todos os dias de 06/08 a 15/08** — dez
   dias de FAIL consecutivo — e ninguém agiu.
2. Depois disso ele parou de rodar, e o "parou de rodar" **não avisa ninguém**:
   um relatório que não chega não faz barulho. O guardrail 6 do projeto diz que
   *"o alerta carrega a própria evidência"* — mas não há alerta para a **ausência**
   de alerta.
3. O item do raio-x que teria pego o achado 8-A existe e é justamente
   *"Cérebro · Raciocínio livre fora de SHADOW_ONLY — este item existe para que a
   promoção nunca seja silenciosa"* — classificado **P2**, e emitido por um
   sistema que estava morto.

**Estado agora:** o CRM Cron voltou a passar hoje por volta das 13:09 UTC, o que
sugere que o segredo foi corrigido durante o dia de hoje. **O raio-x e a
auditoria de qualidade ainda não tiveram uma execução bem-sucedida** — a próxima
tentativa é 06:00/06:30 UTC de amanhã. **Preciso confirmar** se a correção pega
os três.

---

### 🟠 C — O lojista recebe o link da Railway, não o da marca, na tela do onboarding

**O que se promete.** O produto é white-label: *"o cliente final vê o
restaurante, não a gente"*. Existe um arquivo inteiro para garantir isso,
`src/lib/public-url.ts`, cujo cabeçalho é explícito:

> *"`NEXT_PUBLIC_APP_URL` — tipicamente a URL interna do proxy da Railway e
> **NUNCA deve aparecer** em mensagens de WhatsApp, QR codes ou links voltados ao
> cliente. **Todos os serviços que geram links voltados ao cliente devem importar
> daqui.**"*

Ele até bloqueia, em produção, qualquer candidato que contenha `.railway.app`.

**O que o código faz.** A rota do onboarding **não importa daqui**. Ela monta os
links à mão, da variável crua:

```
src/app/api/onboarding/status/route.ts:80
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
...:252   delivery: `${appUrl}/pedido/${restaurant.slug}`
...:253   qr:       `${appUrl}/qr/${restaurant.slug}`
```

**A prova de que isso morde em produção.** `NEXT_PUBLIC_APP_URL` vale hoje
`https://crmresturante-production.up.railway.app` — o preflight devolveu
literalmente:

```
deliveryUrl: "https://crmresturante-production.up.railway.app/pedido/sushi-cazza"
qrUrl:       "https://crmresturante-production.up.railway.app/qr/sushi-cazza"
```

Esses dois valores são renderizados em `OnboardingClient.tsx` (linhas 320, 321 e
411) como **"Delivery"**, **"QR Salão"** e um botão que abre a loja.

**Por que importa.** Essa é exatamente a tela onde o lojista **copia o link** para
colar na bio do Instagram, mandar no grupo e mandar imprimir no QR da mesa. A
trava contra o vazamento existe, funciona, e a única tela que mais precisa dela
não a usa. Nota: o nome do host ainda diz `crmresturante` — o nome antigo do
projeto, com um erro de digitação, exposto ao cliente.

---

### 🟠 D — A página de preços gate**ia** um catálogo inteiro; o código gate**ia** uma coisa só

**O que se promete.** `/site/precos` publica três planos com listas longas e
exclusivas. O Essencial **não** tem IA; o Crescimento ganha *"16 campanhas
prontas"*, Central de Conversas, Garçom de IA, carrinho abandonado, entrega por
zona; o Performance ganha CMV e ficha técnica, fidelidade por níveis, indicação,
Agente de CRM, diagnóstico automático, nota fiscal, API externa. Mais os tetos de
pedidos e mensagens da §5.2.

**O que o código faz.** Existe **um único portão de plano em todo o repositório**,
e ele responde **uma única pergunta**. O arquivo admite isso no próprio cabeçalho:

> `src/lib/plan-features.ts` — *"Hoje ele responde a uma única pergunta, o Garçom
> de IA, porque é o portão de que a tabela de preços precisa."*

`aiWaiterIncluded()` é chamada em exatamente dois lugares (a loja `/pedido` e sua
API). **Todo o resto da tabela não é barrado por nada.** Um cliente no Essencial
tem hoje, na prática: as 16 campanhas, o CMV com ficha técnica, a fidelidade por
níveis, a API externa e a nota fiscal.

**E os tetos não são medidos.** Procurei por qualquer medição de pedidos por mês
ou mensagens por mês: **não existe**. Nenhum `orderLimit`, nenhum
`ordersThisMonth`, nenhuma quota de plano. Os únicos tetos que existem no sistema
são os de **segurança de envio do CRM** (o teto diário de 200 que protege o número
do lojista de queimar) — que são outra coisa, e funcionam.

**A parte justa:** este furo é **conhecido e está registrado** — o resumo
executivo o marca como *"não existe ainda — e é bloqueador comercial"* e o
`CLAUDE.md` o lista como decisão pendente. Mas o `CLAUDE.md` afirma que *"a única
leitura de `restaurant.plan` no repositório monta contexto de IA"*, e isso
**envelheceu**: `plan-features.ts` nasceu depois e o manual não foi atualizado.
É o padrão que o Diretor Geral mandou procurar — a afirmação medida com prazo de
validade vencido.

**Risco real hoje:** baixo, porque há um cliente e zero assinaturas. **Risco no
dia da primeira venda:** alto — quem pagar R$ 899 recebe o mesmo que quem pagar
R$ 179, e não há como o produto saber.

---

### 🟡 E — O resumo executivo vende um WhatsApp que não existe mais

**O que o documento de precificação diz** (`docs/foocci-resumo-executivo.md` §11,
de 30/07 — o documento que sustentou a decisão de preço):

| Recurso | Estado declarado |
|---|---|
| ✅ WhatsApp conectado (**Evolution**) | *"Conexão por **QR Code, sem burocracia**."* |
| 🔒 WhatsApp Business oficial (Meta) | *"Provedor **alternativo**, atrás de chave de ativação."* |

**O que é verdade hoje.** A Evolution **foi removida em 04/08/2026**. O preflight
registra a troca por escrito:

> *"Credenciais do aplicativo Meta — é por ele que **TODO** WhatsApp sai desde
> 04/08/2026. Substituiu a checagem de EVOLUTION_*, que continuava lendo variáveis
> de um provedor que não existe mais: **o preflight dizia 'PASS' por achar uma URL
> órfã no ambiente**."*

Os papéis **se inverteram**: o que era "alternativo, atrás de chave" virou o único
caminho, e o caminho fácil ("QR Code, sem burocracia") deixou de existir.

**Por que importa comercialmente:** a diferença não é técnica, é de **fricção de
venda e de custo**. Meta Cloud API exige aplicativo aprovado, registro de número,
App Review e templates — e **cobra por conversa**. Quem prometer a um lojista
"conecta lendo um QR Code" está prometendo um produto que foi desligado há 20
dias. O resumo executivo continua sendo o documento que descreve o produto para
quem precifica, e nesse ponto ele mente sem querer.

*(Observação de crédito: o parágrafo do preflight acima é a casa **consertando**
exatamente a família de defeito que estou catalogando — um portão que dizia PASS
lendo uma variável órfã. O conserto foi feito; o documento de venda é que ficou
para trás.)*

---

### 🟡 F — "PDV, comanda, caixa e nota fiscal ✓" na tabela do site

A tabela comparativa da home lista **"PDV / gestão — comanda, caixa e nota
fiscal"** com ✓ na coluna Foocci, contra "serviço à parte" nos concorrentes.

**Comanda:** verdade, e é forte (impressão por estação com fila garantida).
**Nota fiscal:** existe e é completa, mas depende do lojista subir um certificado
A1 e do registro no gateway — o próprio resumo executivo a classifica como
add-on, *"não faixa"*, por ter custo por documento. **Caixa:** **preciso
confirmar** — não encontrei módulo de fechamento de caixa; o que existe é o
registro de forma de pagamento por pedido *"para fechar o caixa certo"*, que é
outra coisa.

Um ✓ sem asterisco ao lado de "nota fiscal" cria a expectativa de que ela vem
ligada. Ela não vem, e não pode vir — depende de um documento que só o lojista
tem.

---

### 🟡 G — Duas rotas públicas aceitam um id sem provar quem é o dono

Achado do próprio raio-x, classificado **P1**, e confirmei lendo o código:

> *"2 de 75 rotas que recebem id não mostram nenhuma prova de posse. Trocar o id
> na URL pode devolver dado de outro cliente."*
> — `/api/pedido/payment-status` e `/api/pedido/pix-payment`

`src/app/api/pedido/payment-status/route.ts` declara-se *"Public polling
endpoint — no auth required"* e busca o pagamento só pelo `orderId` da query.

**Sendo justo com a gravidade:** o que vaza é o **status** de um pagamento
(`PENDING`/`EXPIRED`/…), não valor, nem nome, nem telefone. E o `orderId` é um
cuid, que não se adivinha por força bruta. É um defeito real de isolamento, mas
**não é um incidente** — registro para não sumir, não para acordar ninguém.

---

### 🟡 H — Um campo de veredito que recebe valor fixo, em 6 lugares

Também do raio-x, e é a irmã exata do *"comentário dizendo 'medido' sobre coisa
envelhecida"*:

> *"6 lugar(es) onde um campo de veredito recebe valor fixo. Alguns são o ramo
> legítimo de sucesso, outros são portão que aprova por omissão — e portão que
> não registrou resultado tem que reprovar, não passar."*
> Exemplo citado: `AISimulatorService.ts:1887 — passed: true, detail: "Resposta
> com comprimento e estrutura adequados"`.

**Preciso confirmar** quais dos seis são ramo legítimo e quais aprovam por
omissão — exige leitura caso a caso, e cai no guardrail 2.

---

### ✅ O que NÃO é contradição — e merece ser dito

Auditoria que só acha defeito treina a casa a não ler auditoria. Estas eu fui
procurar desconfiado e encontrei **certas**:

- **Uma tabela de preço, não duas.** Era a suspeita explícita do pedido (na Dioli
  havia duas). Aqui foram **quatro** um dia, e alguém fez o trabalho de unificar
  em `pricing.ts`, com trava de compilação contra os enums do banco e teste.
- **A marca imitada no checkout já foi consertada** — hoje, 24/08. As três telas
  de contratação desenhavam `f<span>oo</span>cci` com CSS em vez de usar o
  logotipo oficial, desde 05/08. O conserto foi um componente único **mais um
  teste que reprova se o padrão reaparecer em qualquer arquivo**. Trava, não
  aviso — guardrail 4 aplicado corretamente.
- **A promessa de demonstração que não existia já saiu do ar** — `/site/demonstracao`
  virou redirecionamento 308 para o formulário, de propósito e com o motivo
  escrito ("um 404 numa porta de lead não aparece em relatório nenhum").
- **Pedido importado não entra no faturamento.** O histórico antigo aparece na
  ficha do cliente mas não infla o resultado. Com 5.220 clientes importados
  contra 463 pedidos, essa honestidade vale dinheiro.
- **O provisionamento pós-pagamento é idempotente por índice UNIQUE**, não por
  `if` — a trava certa para um webhook que reenvia.
- **Stone em modo mock é bloqueado no checkout**, explicitamente, para não gerar
  URL de teste para cliente real.

---

## 9. O que está desligado, dormente ou pela metade

| O quê | Estado | Desde | Quem liga |
|---|---|---|---|
| **Pedido por texto no WhatsApp** | `enabled: true` mas **`paused: true` + `mode: DRY_RUN_ONLY`** — não envia nada | **23/06/2026** | a nossa casa |
| **SDR de vendas do Foocci** | Recebe conversa, **não envia** (`FOOCCI_SDR_SEND_ENABLED` ≠ true) | nunca ligado | o CEO |
| **Canal de vendas por WhatsApp do site** | Número **decidido pelo CEO em 23/08** e no código; o botão **não aparece** no site (`FOOCCI_SALES_WHATSAPP_ATIVO` ≠ true) | 23/08 | o CEO — uma variável no Railway, sem build |
| **Emissão de nota fiscal da Foocci** | Desligada — *"aguardando SLU-ME/CNAE de software"* | — | o CEO (é burocracia da empresa) |
| **Pagamento online do restaurante** | Nenhum provedor configurado; `pay_now` bloqueado | — | o lojista (credencial dele) |
| **Bloqueio por plano** | Não existe, exceto o Garçom de IA | sempre | engenharia, após decisão do CEO |
| **Raio-x noturno e auditoria de qualidade** | Quebrados por segredo apontando para host morto | **16/08** e **15/08** | a nossa casa (§8-B) |
| **Vídeos de demonstração** (`/admin/demo-videos`) | **Órfão**: a tela de admin de publicar vídeo existe, e a página que os exibia foi aposentada. Publicar um vídeo hoje **não o mostra em lugar nenhum** | 06/08/2026 | decisão de produto — registrada, não resolvida |
| **BuildOS** | Atrás de `BUILDOS_ENABLED`, padrão `false` | — | a nossa casa |
| **Perfis de agente no banco** | `AGENT_PROFILE_DB_ENABLED`, padrão `false` | — | a nossa casa |
| **Instagram, Google, Saipos, NFC-e** | Prontos, dependem de OAuth/credenciamento/certificado | — | o lojista |
| **A "escada de liberação" como mecanismo vivo** | Construída, promove, **nunca rebaixa sozinha** | sempre | §8-A |

**Um detalhe que merece nome próprio:** o pedido por texto no WhatsApp foi
promovido até `RESTAURANT_WIDE` em 17/06 e **revertido em 23/06** — as notas
guardam o rastro: `[RW_OPENED ...] scope→RESTAURANT_WIDE (confirm + ack real
customers/orders/Pix, gates PASS)` seguido de `[AUDIT ...] ROLLBACK → paused +
DRY_RUN_ONLY`. Ou seja: **o rollback existe, funciona e já foi usado de verdade.**
A máquina de segurança não é fictícia — ela só não age sozinha. Isso torna o
achado 8-A mais tratável do que parece: a peça que falta é o gatilho automático,
não a peça inteira.

**Também vale registrar:** o `CLAUDE.md` do Foocci lista como decisão pendente
*"Ampliar o pedido por texto no WhatsApp **além da lista de telefones
autorizados**"*. Isso descreve um recurso rodando para uma lista restrita. Ele
não está rodando para lista nenhuma — está pausado em modo seco há dois meses.

---

## 10. Perguntas que só o CEO responde

Curtas, uma frase cada.

**Sobre a IA no ar (§8-A) — é a que tem pressa:**
1. Quando os portões de qualidade da IA reprovarem, o sistema deve **rebaixar
   sozinho** para modo sombra, ou só avisar e esperar decisão humana?
2. Enquanto isso não existe, o Garçom do Sushi Cazza continua ao vivo, ou volta
   para sombra até os portões passarem de novo?

**Sobre a frota noturna (§8-B):**
3. Quando uma rotina noturna **deixa de rodar**, quem deve ser avisado e por qual
   canal — hoje o silêncio não avisa ninguém?
4. Dez dias seguidos de `FAIL` no raio-x não geraram ação: o relatório da manhã
   deve ir para você, ou o Diretor decide sozinho o que fazer com ele?

**Sobre dinheiro (§5, §8-D):**
5. O bloqueio por plano precisa existir **antes** da primeira venda self-service,
   ou você aceita vender os três planos entregando o produto inteiro por enquanto?
6. Os tetos anunciados (300 / 1.200 / 4.000 pedidos por mês) são **compromisso a
   cumprir** ou **orientação comercial** — o que deve acontecer com quem estourar?
7. O custo por restaurante segue em stand by desde 31/07: podemos vender sem ele,
   sabendo que a faixa de entrada pode nascer com margem negativa?
8. A nota fiscal da própria Foocci está travada aguardando SLU-ME/CNAE de
   software — isso está em andamento, ou é bloqueio para a primeira cobrança?

**Sobre a mensagem ao mercado (§8-E, §8-F):**
9. O material que descreve o produto ainda promete WhatsApp "por QR Code, sem
   burocracia", que não existe desde 04/08 — posso mandar corrigir o documento de
   precificação?
10. A tabela do site marca "PDV / gestão — comanda, caixa e nota fiscal" com ✓:
    "caixa" quer dizer fechamento de caixa (que não encontrei) ou registro de
    forma de pagamento?

**Sobre o que está desligado (§9):**
11. O canal de vendas por WhatsApp do site depende só de você ligar uma variável —
    ligo o pedido ao Diretor, ou está esperando a verificação da Meta?
12. O SDR nunca foi ligado e o pedido por texto no WhatsApp está pausado desde
    23/06: algum dos dois entra na fila agora, ou os dois seguem dormindo?
13. Os vídeos de demonstração ficaram sem tela onde aparecer — eles voltam a
    algum lugar, ou a tela de admin sai?

---

## 11. O que este raio-X NÃO conseguiu ver

Guardrail 1 aplicado a mim mesmo: **ausência de informação não é informação.**

- **Faturamento em reais dos 463 pedidos.** Não há rota de diagnóstico admin que
  devolva o agregado, e uma auditoria de leitura não escreve consulta nova. O que
  sei é a ordem de grandeza do ticket (≈R$ 109), inferida dos carrinhos abertos.
- **Quantos dos 463 pedidos são reais e quantos vieram de importação.** O schema
  tem `importedOrderCount`, mas não o consultei por restaurante.
- **Se a correção do `FOOCCI_BASE_URL` de hoje conserta o raio-x e a auditoria de
  qualidade.** O CRM Cron voltou; os outros dois só têm nova tentativa amanhã de
  madrugada. **Verificar em 25/08.**
- **Quais dos 6 vereditos fixos (§8-H) são portão que aprova por omissão.**
- **Se existe módulo de fechamento de caixa** (§8-F).
- **A impressão física em restaurante** — o próprio projeto marca isso como *"não
  verificado no mundo real: corrigido no servidor, mas ninguém viu papel sair"*.
- **Não li as 540 rotas de API uma a uma.** Li o desenho, os pontos de dinheiro,
  os portões, os fluxos de entrada e tudo que produção contradisse. Onde afirmo,
  tem prova; onde não tenho, está aqui nesta lista.

---

*Raio-X produzido por leitura de código, telas, textos de venda, doutrina e
consulta de diagnóstico a produção em 24/08/2026. Nenhuma escrita, em lugar
nenhum. Nenhum segredo neste documento.*
