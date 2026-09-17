# Histórico integral — Reestruturação da área comercial do FOOCCI

Este arquivo preserva, em ordem cronológica, o conteúdo textual e visual desenvolvido neste projeto.

---

## 1. Solicitação inicial

### USUÁRIO

Chat, baseado em tudo que você já viu no mercado, de todas as plataformas de atendimento de leads, WhatsApp, enfim. Qual que me monta e me traz aí uma estrutura visual do fluxo correto de uma plataforma de atendimento de WhatsApp com agente de atendimento que recebem o lead para poder vender produtos online.

### ASSISTENTE

**Eu montaria a plataforma em torno de um princípio: o lead entra, a IA atende imediatamente, qualifica e vende até onde consegue; o humano só entra quando aumenta a chance de conversão — e recebe o contexto inteiro, não uma conversa “zerada”.**

O padrão mais sólido hoje combina **inbox compartilhada + IA de primeira linha + qualificação + roteamento + CRM + follow-up + métricas**. É a direção que aparece nas plataformas mais maduras: Respond.io trabalha captura → qualificação por IA → roteamento/handoff → CRM; Intercom centraliza WhatsApp numa inbox com atribuição e workflows; SleekFlow adiciona coleta estruturada, origem da campanha e automações sobre os dados do lead. 

### Estrutura que eu considero correta

**1. ENTRADA DO LEAD**  
Meta Ads → Instagram → site → QR Code → link WhatsApp → campanha/CRM → contato recorrente.

Cada entrada já deve carregar **origem, campanha, anúncio, produto de interesse e timestamp** quando esses dados existirem. Esse contexto não pode se perder no momento em que a conversa começa. 

**2. CAMADA DE IDENTIFICAÇÃO**  
Antes de “atender”, o sistema resolve quem é aquela pessoa:

`telefone → contato existente? → histórico → compras → conversas → tags → estágio atual → origem`

Se já existe no CRM, **não cria outro lead**. Reabre o mesmo relacionamento.

**3. RECEPÇÃO POR IA**  
A IA assume em segundos e faz quatro coisas:

`entender intenção → identificar produto → responder dúvidas → coletar dados faltantes`

Ela não deve começar com interrogatório do tipo “nome / e-mail / cidade / CPF”. Primeiro conversa e entende o que a pessoa quer.

**4. QUALIFICAÇÃO COMERCIAL**  
Enquanto conversa, ela monta o lead silenciosamente:

`produto → necessidade → urgência → faixa de preço → objeções → probabilidade de compra → próxima ação`

Daí nasce um **Lead Score**, por exemplo:

`FRIO → MORNO → QUENTE → PRONTO PARA COMPRAR`

A IA pode continuar atendendo os leads frios e mornos. Os quentes passam a disputar atenção humana primeiro.

**5. MOTOR DE DECISÃO / ROTEAMENTO**  
Esse é o cérebro operacional.

Ele decide:

`IA continua?`  
`vai para vendedor?`  
`qual vendedor?`  
`qual fila?`  
`qual prioridade?`

Regras possíveis: produto, região, idioma, valor potencial, disponibilidade do agente, especialidade, carteira e distribuição round-robin. Plataformas atuais já usam esse tipo de atribuição automática. 

**6. SALA DO VENDEDOR — o coração da plataforma**

Eu faria a tela principal em **3 colunas**:

**Esquerda — Filas**
- Meus leads
- Novos
- Quentes
- Aguardando cliente
- Follow-up
- Pagamento pendente
- Fechados
- Perdidos

**Centro — Conversa WhatsApp**
- mensagens
- áudio
- imagem
- documentos
- produto
- oferta
- link de pagamento
- templates
- IA assistindo o vendedor

**Direita — Contexto comercial**
- nome
- origem
- campanha
- produto
- lead score
- resumo automático da IA
- necessidade
- objeções
- última compra
- valor potencial
- histórico
- tags
- próximo follow-up

O vendedor **não deveria precisar abrir cinco abas** para vender.

**7. IA COMO COPILOTO DO HUMANO**

Quando o humano assume, a IA não desaparece. Ela passa de **autopilot** para **copilot**:

`resumir conversa`  
`sugerir próxima resposta`  
`buscar produto`  
`identificar objeção`  
`recomendar oferta`  
`lembrar informação esquecida`  
`gerar link/checkout`  
`registrar CRM automaticamente`

E o vendedor pode apertar **“Devolver para IA”** em partes repetitivas.

**8. CONVERSÃO**

O atendimento precisa terminar em uma ação comercial concreta:

`produto escolhido → oferta → checkout/link de pagamento → pagamento → pedido`

Depois:

`CRM = GANHO`

ou

`CRM = PERDIDO + motivo`

Nunca simplesmente “arquivar conversa”.

**9. FOLLOW-UP AUTOMÁTICO**

Se não comprou:

`30 min / 2 h / 24 h / X dias`

dependendo do negócio e das regras do WhatsApp.

O sistema precisa saber diferenciar:

- cliente pensando;
- cliente que sumiu;
- carrinho abandonado;
- pagamento abandonado;
- lead sem perfil;
- venda perdida;
- oportunidade futura.

Respond.io, por exemplo, já trata follow-up baseado em tempo ou comportamento como parte do gerenciamento de leads. 

**10. PÓS-VENDA E RECORRÊNCIA**

Depois da compra, o contato não volta para o começo.

Ele muda para:

`CLIENTE`

E abre outra jornada:

`confirmação → acompanhamento → suporte → satisfação → recompra → cross-sell → reativação`

---

### O fluxo completo

**CAPTAÇÃO**  
↓  
**IDENTIFICAÇÃO DO CONTATO**  
↓  
**IA RECEPCIONA**  
↓  
**ENTENDE INTENÇÃO + PRODUTO**  
↓  
**RESPONDE / RECOMENDA / QUALIFICA**  
↓  
**LEAD SCORE**  
↓  

**Se IA consegue fechar** → Oferta → Checkout → Pagamento → Venda

**Se precisa humano** → Roteamento → Vendedor → Negociação → Checkout → Venda

**Se cliente não responde** → Follow-up automático

**Se perdido** → Motivo da perda + nutrição/reativação

**Se vendido** → Pós-venda + CRM + recompra

---

E há uma peça que eu colocaria **por cima de tudo**: uma **Sala do Supervisor**, mostrando em tempo real:

`Leads entrando → atendidos pela IA → aguardando vendedor → SLA estourado → quentes sem dono → conversão por agente → conversão IA → receita → perdas → motivos`

Essa camada é o que transforma um “WhatsApp com vários atendentes” em **uma operação comercial de verdade**.

Vou transformar exatamente essa arquitetura agora em um **fluxograma visual de plataforma**, com as telas e passagens principais.

### IMAGEM GERADA — fluxo completo

![Fluxo completo de atendimento e vendas via WhatsApp](./imagens/01_fluxo_completo_atendimento_vendas_whatsapp.webp)

---

## 2. Telas separadas do sistema

### USUÁRIO

me manda todoas as telas separadas de como funcionaria esse sistema

### IMAGENS GERADAS

#### Sala do Supervisor / Control Tower

![Sala do Supervisor](./imagens/02_sala_supervisor_control_tower.webp)

#### Central de Atendimento

![Central de Atendimento](./imagens/03_central_atendimento.webp)

#### Perfil do Lead / CRM 360

![Perfil do Lead CRM 360](./imagens/04_perfil_lead_crm_360.webp)

#### Atendimento com IA / Copiloto do Vendedor

![Copiloto do Vendedor](./imagens/05_atendimento_ia_copiloto_vendedor.webp)

#### Qualificação e Lead Score

![Qualificação e Lead Score](./imagens/06_qualificacao_lead_score.webp)

#### Motor de Decisão / Roteamento

![Motor de Decisão](./imagens/07_motor_decisao_roteamento.webp)

#### Catálogo, Oferta e Checkout

![Catálogo Oferta e Checkout](./imagens/08_catalogo_oferta_checkout.webp)

#### Follow-up Automático

![Follow-up Automático](./imagens/09_follow_up_automatico.webp)

#### Pós-venda e Relacionamento

![Pós-venda e Relacionamento](./imagens/10_pos_venda_relacionamento.webp)

---

## 3. Expansão: Hunter IA + SDR IA + CRM IA

### USUÁRIO

Chat, chat, eu também preciso de uma IA SDR que aborde, enfim, diferentes plataformas. Eu preciso de uma IA CRM que cuide do departamento de CRM. Por exemplo, tem uma IA SDR ou IA Hunter, não sei como a gente pode falar, que ela busca pela internet o contato de todos os restaurantes do Brasil. Então eu preciso dela dentro desse sistema. Então ela usa o Google Maps, usa o Google e pega o contato dos restaurantes. Quando o SDR vai falar com os restaurantes, geralmente é um bot, porque é o número de contato do cliente. Então vai ser aquele agente virtual: Você quer fazer pedido? Você quer falar com humano? E aí precisa de um approach para conseguir o número dos responsáveis administrativos e comerciais do restaurante. Então tem essa ideia também que tá rolando. Só aí a gente já pegou vários contatos. Então eu preciso de expertise disso também. Faz sentido?

### ASSISTENTE

**Faz muito sentido — e eu separaria isso em três IAs diferentes, não em uma só.** A “IA Hunter” encontra e enriquece empresas, a **IA SDR** conquista o contato certo e abre a conversa comercial, e a **IA CRM** governa relacionamento, cadência e reativação depois que o lead entra no funil.

### ASSISTENTE

**Faz sentido — mas eu mudaria uma coisa importante: isso não é só “mais uma IA dentro do atendimento”; é um segundo motor do sistema, o motor de aquisição.** Eu estruturaria a plataforma com **IA Hunter + IA SDR + IA CRM + Supervisor de Receita**, cada uma com responsabilidade muito bem separada.

E tem um limite técnico importante: eu **não construiria um robô que simplesmente raspa Google Maps e transforma os resultados numa lista de disparo de WhatsApp**. O Google restringe scraping/uso do conteúdo do Maps para criar bases próprias de business listings, mailing ou telemarketing, e o WhatsApp exige que o destinatário tenha fornecido o número e consentido em receber mensagens iniciadas pela empresa. ([developers.google.com](https://developers.google.com/maps/documentation/javascript/policies?hl=pt-br&utm_source=chatgpt.com))

## Eu redesenharia o sistema assim

```text
                    ┌─────────────────────────────┐
                    │   INTELIGÊNCIA COMERCIAL    │
                    │        / HUNTER IA          │
                    └──────────────┬──────────────┘
                                   │
             Descobre empresas + enriquece informações
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │       BASE DE PROSPECTS     │
                    │ Empresas ainda não são leads│
                    └──────────────┬──────────────┘
                                   │
                           priorização / ICP
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │           SDR IA            │
                    │ Abordagem + gatekeeper      │
                    │ + descoberta do decisor     │
                    └──────────────┬──────────────┘
                                   │
                     conseguiu contato/opt-in?
                         ┌─────────┴─────────┐
                       NÃO                  SIM
                        │                    │
                 nova tentativa             ▼
                 outro canal       ┌───────────────────┐
                 ou descarta       │ LEAD QUALIFICADO  │
                                   └─────────┬─────────┘
                                             │
                                    atendimento/venda
                                             ▼
                              ┌─────────────────────────┐
                              │ IA COMERCIAL + VENDEDOR │
                              └─────────────┬───────────┘
                                            │
                                      GANHO / PERDIDO
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │          CRM IA         │
                              │ Follow-up / relacionamento│
                              │ reativação / recompra   │
                              └─────────────────────────┘
```

### 1. **Hunter IA — Inteligência Comercial**

Eu chamaria de **Hunter IA** mesmo. É mais preciso que SDR.

Ela não vende. **Ela encontra oportunidades.**

Fontes possíveis:

- Google Search;
- diretórios empresariais;
- sites dos próprios restaurantes;
- Instagram;
- Facebook;
- associações;
- bases comerciais licenciadas;
- marketplaces;
- dados públicos empresariais;
- provedores de enriquecimento;
- fontes via API autorizada.

No caso de Google Maps/Places, a arquitetura precisa respeitar as regras de armazenamento e reutilização dos dados da plataforma; a própria documentação da Places API restringe armazenamento de conteúdo além das exceções previstas. ([developers.google.com](https://developers.google.com/maps/documentation/places/web-service/policies?authuser=804924846&utm_source=chatgpt.com))

A ficha criada pelo Hunter poderia ser:

```text
RESTAURANTE
Sushi House

Categoria: Japonês
Cidade: São Paulo
Bairro: Moema

Site: ✓
Instagram: ✓
Telefone comercial: ✓
WhatsApp publicado: ✓
E-mail: ✓

Delivery próprio: ?
iFood: ✓
Cardápio próprio: ✓
Sistema identificado: ?
Unidades: 2

Nome responsável: não encontrado
Cargo: não encontrado

ICP Foocci: 87/100
Prioridade: ALTA

Fonte:
Website + Instagram + diretório empresarial

Status:
PRONTO PARA PESQUISA DE DECISOR
```

E aqui tem uma distinção **fundamental**:

> **Prospect ≠ Lead.**

O Hunter encontrou uma empresa.

Isso ainda não significa que aquela empresa entrou no seu CRM comercial como lead ativo.

---

# 2. SDR IA — aqui entra a inteligência que você descreveu

Essa é outra IA.

Objetivo:

> **chegar ao decisor.**

Ela recebe:

```text
Empresa
↓
Canais encontrados
↓
Contexto do negócio
↓
Possíveis dores
↓
Quem precisamos encontrar
```

E começa a trabalhar.

### Exemplo

Ela encontra:

**Restaurante X — WhatsApp geral**

Manda uma mensagem apropriada **quando houver base permitida para aquele contato/canal**.

E recebe:

> 🤖 Olá! Bem-vindo ao Restaurante X.  
> 1 — Fazer pedido  
> 2 — Acompanhar pedido  
> 3 — Falar com atendente

A IA precisa reconhecer:

### GATEKEEPER DETECTADO

E muda de estratégia.

```text
BOT DETECTADO
        ↓
Não iniciar pitch
        ↓
Buscar rota para atendimento humano/comercial
        ↓
Identificar administrativo / proprietário / marketing
        ↓
Conseguir canal adequado para contato
```

Isso é uma habilidade própria da SDR.

---

## E eu colocaria um módulo específico:

# **Gatekeeper Intelligence**

Porque isso vai acontecer **milhares de vezes**.

Ele identifica:

- bot;
- recepcionista;
- atendente;
- caixa;
- SAC;
- central telefônica;
- formulário;
- WhatsApp de pedidos.

E entende:

> **“Essa pessoa não é o cliente; ela é o caminho até o cliente.”**

### Exemplo de comportamento

Não faria:

> Quero pedir um sushi.

só para enganar o bot.

Eu faria algo transparente:

> Olá! Tudo bem? Preciso falar com a pessoa responsável pela operação comercial ou pelos canais de venda do restaurante. Você consegue me orientar, por favor?

Se responder:

> É com a Juliana.

SDR:

> Obrigado! Consigo falar com ela por este número ou existe outro contato comercial?

Resultado:

```text
DECISOR DESCOBERTO

Juliana Ribeiro
Cargo: Gerente / Comercial
Origem: fornecido pelo atendimento
Canal indicado: ...
Confiança: alta
```

Isso passa a ser **um ativo do CRM**.

---

# 3. Tela própria: **Central de Prospecção**

Eu não misturaria isso com o Inbox de quem já é cliente.

Teríamos:

```text
CENTRAL DE PROSPECÇÃO
────────────────────────────────────────────────────────

EMPRESAS ENCONTRADAS            PIPELINE HUNTER

12.482  empresas encontradas    Descoberta       4.812
 8.321  enriquecidas            Enriquecendo     1.203
 5.723  ICP adequado            Pronto SDR       3.411
 3.411  prontas SDR             Gatekeeper         783
 1.027  decisores encontrados   Decisor encontrado  921
   428  qualificadas            Qualificado         428
```

Filtros:

**Estado | Cidade | Segmento | ticket estimado | número de unidades | canal | prioridade | origem**

---

# 4. SDR precisa ter sua própria fila

Algo parecido com:

```text
SDR COMMAND CENTER

🔥 Prioridade alta                      386
🤖 Bot/Gatekeeper                       172
👤 Falando com atendente                 89
🎯 Decisor identificado                 143
📱 Contato do decisor obtido             62
💬 Conversa comercial iniciada           48
📅 Reunião agendada                      17
⏳ Follow-up                             93
❌ Sem contato                           41
```

Então a SDR sabe exatamente **onde trabalhar**.

---

# 5. Quando o decisor aparece, muda completamente a IA

Antes:

**Objetivo = descobrir quem decide.**

Depois:

**Objetivo = gerar oportunidade.**

Exemplo:

```text
DECISOR ENCONTRADO
      ↓
Enriquecimento
      ↓
IA estuda restaurante
      ↓
Hipótese de dor
      ↓
Abordagem personalizada
      ↓
Descoberta
      ↓
Qualificação
```

Agora entram perguntas de venda.

Exemplo para Foocci:

> Hoje vocês concentram os pedidos mais no iFood ou já têm um canal próprio forte?

Dependendo da resposta:

```text
80% IFood
↓
dor provável: dependência de marketplace
↓
SDR aprofunda
```

---

# 6. A IA CRM é OUTRA coisa

Aqui eu separaria radicalmente.

A **CRM IA não caça cliente**.

Ela é a responsável pela **saúde da base**.

Imagine ela como a **Diretora de CRM digital**.

Ela monitora:

### Prospects

```text
contactado
não respondeu
respondeu
qualificado
reunião
negociação
perdido
```

### Clientes

```text
comprou
ativou
engajou
parou de usar
risco de churn
oportunidade de upsell
oportunidade de recompra
```

---

# IA CRM

Ela decide automaticamente:

> Quem precisa receber alguma ação hoje?

Exemplo:

```text
CRM IA — PLANO DO DIA

2.481 contatos analisados

143 precisam de follow-up
 72 estão esfriando
 38 oportunidades abandonadas
 21 propostas sem retorno
 67 clientes com chance de upsell
 44 clientes para reativar
 18 clientes em risco de churn

Receita potencial identificada:
R$ 184.300
```

Isso é CRM inteligente de verdade.

Não é só:

> “disparar campanha”.

---

# 7. A CRM IA também deveria comandar campanhas

Ela poderia dizer:

```text
SEGMENTO IDENTIFICADO

183 restaurantes

Características:
• abriram proposta
• não contrataram
• interesse em CRM
• objeção principal: preço

AÇÃO RECOMENDADA

Campanha:
"Quanto você perde quando seu cliente
compra novamente pelo iFood?"

Canal:
E-mail + retargeting + WhatsApp para contatos elegíveis

Prazo:
3 dias

Objetivo:
Retomar negociação
```

Ela cria o público.

O Marketing cria/valida a comunicação.

A automação executa.

A CRM mede.

---

# 8. E acima delas eu colocaria uma quarta IA

## **Revenue Supervisor**

Ela supervisionaria:

```text
HUNTER
     ↓
SDR
     ↓
VENDAS
     ↓
CRM
     ↓
CLIENTE
```

E responderia coisas como:

> Por que as vendas caíram ontem?

Ela poderia devolver:

```text
DIAGNÓSTICO

↓ 18% oportunidades criadas

Principal causa:
SDR conseguiu chegar a apenas 12% dos decisores.

Problema:
34% dos contatos encontrados são canais de pedidos.

Ação recomendada:
priorizar enriquecimento de decisores nos 813 prospects
de maior ICP antes de ampliar aquisição.
```

Isso é tremendamente mais valioso do que simplesmente olhar dashboards.

---

# No sistema inteiro, eu deixaria estas áreas

```text
🏠 VISÃO GERAL

🔎 PROSPECÇÃO
   ├─ Hunter IA
   ├─ Empresas encontradas
   ├─ Enriquecimento
   └─ ICP

🎯 SDR
   ├─ Central SDR
   ├─ Gatekeepers
   ├─ Decisores
   ├─ Qualificação
   └─ Agenda

💬 ATENDIMENTO
   ├─ IA atendendo
   ├─ Atendimento humano
   └─ Copiloto

👥 CRM
   ├─ Leads
   ├─ Clientes
   ├─ Segmentos
   ├─ Follow-ups
   ├─ Jornadas
   └─ CRM IA

💰 VENDAS
   ├─ Pipeline
   ├─ Propostas
   ├─ Checkout
   └─ Receita

📣 CAMPANHAS

🤖 AUTOMAÇÕES

📊 INTELIGÊNCIA
   ├─ Funil
   ├─ SDR
   ├─ Conversão
   ├─ Receita
   ├─ CRM
   └─ Revenue Supervisor

⚙️ CONFIGURAÇÕES
```

## E tem uma decisão arquitetural que eu considero **muito importante**

**Hunter → SDR → Vendedor → CRM não são quatro bancos de dados.**

É **um único registro evoluindo**:

```text
EMPRESA
   ↓
PROSPECT
   ↓
CONTATO
   ↓
DECISOR
   ↓
LEAD
   ↓
OPORTUNIDADE
   ↓
CLIENTE
```

Todo o histórico acompanha o registro.

Assim, quando o vendedor finalmente recebe:

> **João — proprietário do Restaurante X**

el já vê:

> Encontrado pelo Hunter em 17/09  
> Website analisado  
> 2 unidades  
> usa iFood  
> primeiro contato foi com bot  
> atendente Maria informou contato administrativo  
> SDR conversou com João  
> dor: dependência do iFood  
> interesse: CRM + cardápio próprio  
> objeção: preço  
> score: 91/100

**Esse é o sistema que eu construiria.** Não apenas uma plataforma de WhatsApp, mas um **Revenue Operating System**, em que a aquisição começa antes mesmo de existir um lead e o CRM continua trabalhando muito depois da primeira venda.

A ressalva prática é que o Hunter deve trabalhar com fontes e APIs cujo uso permita esse enriquecimento, e o WhatsApp precisa respeitar consentimento e políticas de contato; número publicado na internet, sozinho, não equivale ao opt-in exigido pelo WhatsApp. ([business.whatsapp.com](https://business.whatsapp.com/policy/preview?lang=pt_BR&utm_source=chatgpt.com))

**Próximo passo:** eu incorporaria agora ao desenho anterior **quatro telas novas — Hunter IA, Central SDR/Gatekeeper, CRM IA e Revenue Supervisor — porque são justamente as peças que estavam faltando na arquitetura visual.**

---

## 4. Novas telas solicitadas

### USUÁRIO

por favor faça isso

### IMAGENS GERADAS

#### CRM IA / Departamento de CRM

![CRM IA](./imagens/11_crm_ia_departamento_crm.webp)

#### Central SDR / Gatekeeper

![Central SDR Gatekeeper](./imagens/12_central_sdr_gatekeeper.webp)

#### Revenue Supervisor / Inteligência de Receita

![Revenue Supervisor](./imagens/13_revenue_supervisor.webp)

#### Hunter IA / Inteligência Comercial

![Hunter IA](./imagens/14_hunter_ia_inteligencia_comercial.webp)

---

## 5. Solicitação de preservação no GitHub

### USUÁRIO

Meu bem, eu vou pedir um favor pra você. Eu quero que você crie dentro do repositório Fute no GitHub uma nova pasta chamada reestruturação da área comercial do FOOCCI e coloque todo esse projeto dentro, inclusive as imagens. Na verdade, as imagens são os mais importantes, tá? Eu preciso que você coloque tudo lá como um projeto, na íntegra. Não tire uma palavra que você escreveu aqui. Tá claro isso?

### ASSISTENTE

Sim, ficou claro: **vou criar uma pasta nova dentro do repositório Fute, preservar integralmente o texto deste projeto e colocar as imagens junto — sem resumir, cortar ou reescrever nada.** Vou organizar isso como um projeto navegável, com o texto principal e uma pasta de imagens para que nada se perca.

### USUÁRIO

TUDOOOO QUE VC ESCREVEU E DESENHOU AQUI PORECISA ESTA NESSA PASTA

### ASSISTENTE

Sim — **TUDO mesmo**: cada texto que eu escrevi neste projeto, o fluxograma inicial e **todas as telas/imagens geradas**, sem substituir por resumo nem deixar só uma seleção. Estou tratando a pasta como um **registro integral do projeto**, não como documentação resumida.

### ASSISTENTE

Encontrei um ponto objetivo antes de gravar: **na sua conta conectada não existe repositório chamado “Fute”; o repositório do produto disponível é `diolisantos10/FOOCCI`, com permissão de escrita/admin.** Para não travar a entrega, vou registrar o projeto ali, na pasta **`reestruturação da área comercial do FOOCCI`**, preservando tudo integralmente.

### ASSISTENTE

Vou gravar isso **na branch padrão atual do FOOCCI**, sem mexer no código existente: uma pasta isolada com **histórico integral + galeria das telas + manifesto das imagens**. As imagens vão para o próprio repositório, não ficarão só como links externos.
