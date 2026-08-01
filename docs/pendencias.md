# Pendências — o que está aberto

> Última atualização: 01/08/2026.

---

## 🔴 ACONTECENDO AGORA — cliente perdendo mensagem em silêncio

### O Instagram do restaurante de sushi está fora do ar desde 23/07
`tokenValid: false` (erro 190, *"Session expired 25-Jul"*), e o
`lastWebhookAt` parado em 23/07. **O cliente perde 100% das DMs do Instagram** — e
não há aviso nenhum.

**A tela mente:** a UI de integração mostra **"Conectado / Ativo"** com o token
morto. O sinal real está no card **Diagnóstico**: *"Conta conectada: pendente"* e o
"Último Direct recebido" parado.

**Só o dono resolve** — exige login pessoal do Instagram:
`/integracoes/instagram` → **Desconectar** → **"Entrar com Instagram"** → login.

> ⚠️ **E logo depois, confira uma coisa.** A conexão de 25/07 nasceu com token
> **curto** (~1h40 em vez de 60 dias). Ao reconectar, rode `graph-check` e veja a
> validade do novo token: se vier ~60 dias, ótimo. **Se vier curto de novo, o bug
> real é a troca para long-lived falhando em produção** — não a expiração. É aí
> que se deve investigar.

---

## 🔴 Prioridade — erro aqui chega no cliente

### 1. Garçom: o P1 dietético (mais 3 P1 da mesma varredura)
O Garçom pode dar informação errada sobre restrição alimentar. É o único item
desta lista em que o defeito não custa dinheiro nem reputação — custa a saúde
de quem pediu. Os outros três P1 saíram na mesma varredura e são menos graves.

### 2. O painel de WhatsApp em Integrações escreve "Conectado" quando NÃO está

`src/app/(dashboard)/integracoes/IntegrationsCenterClient.tsx:337-345`

Quando a Evolution devolve **código de pareamento** em vez de imagem de QR, a
resposta é `{ pairingCode, code }` — sem `base64` e sem `error`. O painel só sabe
tratar `base64`; sem ele, cai na última linha:

```ts
setQrState(qr.error === "not_configured" ? "error" : "connected");
```

**Resultado:** a tela diz **"Conectado"** para um lojista que não conectou nada.
Ele fecha a tela achando que terminou, e o WhatsApp nunca funciona.

Não trava, não dá erro, não gera log — mente e some. É o guardrail 1 ao contrário:
o painel infere sucesso do silêncio.

**O conserto já existe no repositório.** O outro painel de WhatsApp
(`integracoes/whatsapp/WhatsAppIntegrationClient.tsx:210`) trata `pairingCode`
corretamente, com o mesmo formato de resposta. É copiar o ramo que já funciona.

> ⚠️ **São dois painéis de QR vivos ao mesmo tempo** — só um está certo. Ver a
> vitrine do `canais`.

Verificado em 01/08 na branch de produção · origem: `HANDOFF-railway-build-e-ui-promocoes.md`

---

## 📱 Canais Meta — o número novo do WhatsApp está travado

Minerado de `HANDOFF-canais-meta.md` (commit `18a5ed7`), em 01/08/2026.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Número novo preso no `request-code` (erro `136024`)** | O número nunca verifica, nunca registra, e o CRM não atende por ele |
| **Cron de refresh do token do IG — não confirmado se roda** | Todo token de IG expira em ~60 dias **sem aviso**, e a queda de julho se repete |
| **PIN de 2FA do WhatsApp foi colado em texto num chat** | Rotacionar depois do registro |

> **A mensagem do `136024` mente.** Ela diz *"servidores temporariamente
> indisponíveis, espere 1 hora"*, mas vem com `is_transient: false` — ou seja,
> **é permanente**. Repetir não resolve; foram várias tentativas idênticas.
> A causa mais provável é o **chip ainda ter uma conta WhatsApp ativa**:
> Config → Conta → Apagar minha conta, e esperar ~1h. *Não confirmado.*
> Método `VOICE` em vez de `SMS` **nunca foi testado**.

> 🚫 **NÃO mexer no número que está no ar hoje** enquanto o novo não estiver
> funcionando. É o número que está atendendo o restaurante agora.

---

## 🔌 Descontinuar a Evolution (#44) — é migração, não delete

**Travado em duas perguntas que só o CEO responde.** Minerado de
`HANDOFF-painel-e-evolution.md` (commit `cfc346c`), em 01/08/2026.

**O que quebra se alguém simplesmente apagar a Evolution hoje:** o WhatsApp perde
**pedido por texto, opt-out, recuperação de carrinho, atribuição de receita do CRM
e os comandos do BuildOS**. Tudo isso só existe no webhook da Evolution.

A razão, confirmada por leitura do código: **os dois webhooks de entrada não são
simétricos.** O da Meta (`api/webhooks/meta/whatsapp/route.ts`, ~225 linhas) importa
só o Brain e o suporte. O da Evolution (~274 linhas) é quem carrega todo o resto. O
comentário do código da Meta diz *"feed the same agent pipeline"* — mas hoje "the
same pipeline" é **só o Brain**.

**As duas perguntas travando:**
1. A Meta está conectada e ativa **para todos os restaurantes**, ou só alguns?
   *(este é o dado que falta)*
2. **BuildOS:** migrar para a Meta, manter só na Evolution, ou aposentar?

**Etapa 0, segura para começar já:** portar a paridade de entrada — o que o webhook
da Evolution faz e o da Meta não faz. É **aditivo**, não mexe em default de
produção, e não depende das respostas acima.

---

## 📣 CRM — a campanha "Almoço" não dispara, e falta um clique

Minerado de `HANDOFF-crm.md` (commit `3693a509`), em 01/08/2026.

**A causa não é bug de campanha.** É contactabilidade: a base importada entra com
`crmContactable=false` (fila de enriquecimento), a audiência fica **0** e nada sai
— sem erro nenhum aparecendo. Os clientes **têm** telefone; a primeira hipótese
("base sem telefone") estava errada e foi corrigida pelo dono.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **"Ativar base" — clique manual do dono** | Clientes → *Saúde da base de contatos* → **"Ativar base"**. Enquanto ninguém clicar, a campanha fica com audiência 0 **e nunca dispara** |
| **Redeploy dos merges #41 e #43** | Sem ele o painel mostra o cálculo velho (Frios 96%, "Mais de 60 dias"). **Sinal de que pegou:** o card "Frios" passa a dizer **"61–120 dias"** |
| **Número Meta oficial** | O teto de 900 só vale com `metaCrmEnabled=true` **e** `connectionStatus="CONNECTED"`. Sem os dois vale a rampa de aquecimento (máx 250) — e a expectativa de volume fica errada |

**O diagnóstico que decide a discussão antes dela começar** (auth admin):
`GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id>` → compare
`noPhone` × `notContactable` × `eligible`.

> **Regra de negócio do dono, que não estava no código:** a campanha "Almoço" é
> **perene, 1× por cliente**, pegando cliente novo automaticamente. **Isso já é
> suportado** pelo dedupe de "já recebeu esta campanha". Não reprojete — só ative
> a base.

---

## 📚 Manual e treinamentos

Minerado de `HANDOFF-manual.md` (commit `5b1c885c`), em 01/08/2026.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Export de produção nunca rodado** | Se existir capítulo digitado à mão no admin com slug `guia-*`, **cada deploy o sobrescreve** pelo código. *Não confirmado* se há conteúdo em risco — rodar `GET /api/admin/manual/export` antes de assumir que não há |
| **Bíblia interna no assistente — decisão de produto** | Os 14 capítulos internos têm `agentVisibility=false`. Se ninguém decidir, **nada quebra**: o assistente segue respondendo só pelos guias |
| **`Carteiro-Manual.txt` é estático** | Fica em `public/downloads/`, e **o robô noturno não cobre `public/`**. Se a tela de Impressoras mudar, esse arquivo precisa ser atualizado na mão |

### 🌿 Branches órfãs — veredito por branch

| Branch | Veredito |
|---|---|
| `eloquent-franklin` · `cmv-pricing-page` | **Ocas** — trabalho já re-landado. Reverificar antes de apagar |
| **`food-manager-kickoff`** | ⛔ **NÃO APAGAR** — 1.374 commits únicos do produto paralelo "Foocci Manager" |
| `sons-background-topbar` · `sound-topbar-chip` | Surgiram ~01/08, **conteúdo não avaliado** |

> **Como provar que uma branch é oca antes de apagar:** trabalho re-landado tem
> hash diferente, então `git cherry` **engana**. Compare os patches (`git show <a>`
> vs `git show <b>`) e os `--stat`.

---

## 🧮 CMV e precificação

Minerado de `HANDOFF-cmv-precificacao.md` (commits `36a36597` e `e8f01e90`), em
01/08/2026.

### 🔴 O importador de planilha pode apagar o cardápio inteiro

`src/app/api/menu/import/route.ts` (`PRECO_PREFIXES`, ~linha 56) trata a coluna
**"custo" como PREÇO DE VENDA**. É defeito pré-existente.

**Se um lojista importar planilha com coluna "custo" achando que está alimentando
o CMV, ele sobrescreve o preço de venda do cardápio todo.** Perda real, feita pelo
próprio cliente, sem aviso. O conserto é mapear para `MenuItem.cost`.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Analytics ainda nega que existe CMV** | `AnalyticsAgentService.ts:213` responde *"não temos CMV cadastrado"*. O dado **existe agora** — o agente nega um número que o lojista acabou de preencher. Para o cliente, parece bug |
| **Variações não têm custo** | A precificação usa só o custo base. Cardápio muito baseado em variação mostra CMV incompleto — **o número mente por omissão**, sem quebrar nada |
| **Leitura de nota nunca testada com nota real** | Sem chave de IA no ambiente daquela sessão. Se o primeiro teste em produção falhar com cupom amassado, o ajuste é `INVOICE_EXTRACT_MODEL=gpt-4o` (o default é o modelo do Brain, `gpt-4o-mini`) |
| **Imagem só funciona no piloto OPENAI** | Se o roteamento do Brain mover o `invoice-reader` para Claude ou Gemini, a leitura de nota falha — **com erro claro, de propósito** |
| **CMV do período é digitado à mão** | Estoque inicial, compras e estoque final. Sem integração com compras, o termômetro só vale quando o lojista atualiza. Risco de leitura velha, não de quebra |

---

## 🔵 Integração Google — funciona, mas o token morre a cada 7 dias

Minerado de `HANDOFF-google.md` (commit `06bfaf3`), em 01/08/2026. O OAuth, o GA4
e o Meu Negócio **já estavam construídos de verdade** — não eram mock. O CEO
confirmou o GA4 funcionando.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **⏳ Tela de consentimento OAuth ainda em "Testing"** | Só e-mails cadastrados como teste conseguem conectar, e **o token expira em 7 dias**. Todo restaurante real vai reconectar **toda semana**. Publicar dispara a verificação do Google para o escopo restrito `business.manage` — pode levar dias ou semanas, então **começar cedo** |
| **API v4 do Meu Negócio não liberada** | O código de ler e responder avaliação **não tem efeito nenhum** até a liberação. A tela mostra aviso âmbar e para aí. *Não confirmado se o pedido de acesso foi enviado.* |
| **`GOOGLE_INTEGRATION_ENABLED` não foi setada** | Hoje não importa (cai no fallback, que já é `true`). Mas se alguém setar como `"false"` por engano, o botão volta a "Em breve" **sem pista nenhuma do porquê** — essa variável tem prioridade sobre a presença das credenciais |

> **Presuma que as fases de publicar/verificar o app e liberar a API v4 estão do
> zero.** A última interação foi o CEO pedindo o passo a passo de novo — sinal de
> que ainda não executou.

### 🔑 Dois segredos ainda sem confirmação de rotação

| Credencial | Situação |
|---|---|
| **Client secret do Google** (`GOCSPX-…`) | Colado em texto no chat. *Não confirmado se foi rotacionado.* ⚠️ **Se rotacionar e não atualizar o Railway, o OAuth quebra em silêncio na próxima renovação** — sem log óbvio do porquê |
| **Railway Project Token** | O CEO disse que ia revogar. *Não confirmado.* Enquanto não revogar, dá **acesso de escrita às variáveis de ambiente do projeto inteiro** — não só do serviço Foocci |

---

## ⛔ NÃO MERGEAR a branch `claude/fresh-debug-session-C3qhF` como está

Minerado de `HANDOFF-garcom-consolidacao-pipeline.md` (commit `8fb194f4`), em
01/08/2026. **Conferido pelo Diretor, não aceito por relato.**

Aquela sessão apagou **12 arquivos do pipeline legado** (−2.371 linhas), criou
`WebOrderService.ts` (+1.205) e concluiu: *"nenhum erro novo foi introduzido"*.

**Está errado.** O `tsc` roda naquela branch e **falha**:

```
src/services/ai/WebOrderService.ts(477,7):
  error TS2322: Type 'string | null' is not assignable to type 'string'.
```

O erro está **no arquivo que a própria sessão escreveu** — não é infraestrutura, e
não é pré-existente. A sessão viu erros de tipo, atribuiu todos ao ambiente e
seguiu.

✅ **Produção está limpa.** `tsc` na branch padrão sai com código 0, e
`WebOrderService.ts` **não existe lá** — a branch nunca foi mergeada. Nada quebrou.

**O que fazer antes de aproveitar aquele trabalho:**
1. Corrigir a linha 477
2. Rodar `npx tsc --noEmit` e `npx vitest run` — **os dois verdes**
3. Só então mergear

> **A lição, e ela vale além deste caso:** o kit registra que erro de tipo súbito
> costuma ser o `node_modules` sumindo no sandbox. **Isso é verdade e virou
> desculpa.** A regra correta é a que já estava escrita: rode
> `npm install && npx prisma generate` e **veja se o erro some**. Se não sumir, é
> real — mesmo que "pareça" ambiente.

### O que aquele trabalho descobriu, e vale guardar

- **O `runner.ts` era letra morta há vários commits.** A rota
  `/api/pedido/[slug]` já usava `AIOrderService.runWebTurn()` (WaiterBrainV2).
- **`WebOrderService.ts` não é chamado por ninguém.** Nasceu como backup limpo do
  pipeline stateless — **é código morto novo criado enquanto se apagava código
  morto velho**. Decidir se fica ou vai.
- **`OrderStage` mudou de casa** para dentro do `WebOrderService.ts`, e dois
  arquivos dependem disso. Cuidado antes de apagar.
- Substituir o `runner.ts` pelo `AIOrderService` direto **falhou**: as APIs são
  incompatíveis (stateful × stateless). Não repita.

---

## 🧍 Dependem do Dioli — ninguém mais consegue

| Item | O que quebra |
|---|---|
| **#36 · `MERCADO_PAGO_WEBHOOK_SECRET` não está no Railway** | `/api/health` mostra `mpWebhookSecret: false`. O webhook do Mercado Pago **não tem assinatura verificada** — confirmação de pagamento sem validação de origem |
| **#29 · Token + homologação fiscal (NFC-e via Focus NFe)** | **Nenhuma nota fiscal real é emitida.** A máquina inteira (etapas 0–5b) está pronta e desligada, esperando o token |
| **Lista `[PREENCHER]` do site comercial** | O web designer **não fecha o site** sem ela. Ver a seção do site comercial abaixo |

---

## 🌐 Site comercial — o briefing existe e não está em lugar nenhum

### ⚠️ RISCO IMEDIATO: o briefing só existe na conversa

A sessão que produziu o briefing do site **não salvou o texto no repositório** — foi
veto explícito do CEO na hora (ele quis mandar direto ao designer, sem versionar).

**A consequência mudou de tamanho quando esse chat entrou na fila de arquivamento:**
enquanto ele estava aberto, o texto estava a um scroll de distância. Fechado, some.

**Antes de arquivar aquele chat:** mandar o briefing ao designer **ou** colar o texto
aqui para virar arquivo. É a regra do `docs/arquivo/README.md` — nenhum chat é
fechado antes de minerado, e o entregável daquele chat é justamente o que não
desceu.

### O que o CEO precisa preencher

Preço e escopo dos 3 planos · CTA principal (demo × teste grátis × WhatsApp) ·
URL de login · domínio · depoimentos e casos reais · logos de clientes · contato
comercial · CNPJ/razão social · IDs de Analytics/Pixel · arquivos de logotipo.

Nada disso pode ser preenchido com número de exemplo que vaze como real — o
produto está em piloto (guardrail 7).

### As quatro decisões do briefing, que ninguém deve desfazer sem falar com o CEO

| # | Decisão | Por que existe |
|---|---|---|
| D1 | O site é **B2B**, para donos de restaurante | O ângulo é *"pare de pagar comissão de marketplace e seja dono dos seus clientes"*. Virar B2C quebra o funil |
| D2 | O briefing não é versionado | Escolha do CEO. Não reabrir sem pedido — mas ver o risco acima |
| D3 | Preço, depoimento e métrica ficam `[PREENCHER]` | Número inventado em site é passivo comercial |
| D4 | Três pilares: **Venda mais · Fidelize e reative · Decida com dados** | É a espinha da home. Mudar os pilares muda o site inteiro |

### ⛔ O 3º plano chama `PRO`, não "PREMIUM"

`prisma/schema.prisma:155-159` → `enum Plan { STARTER, GROWTH, PRO }`. Confirmado
também na migração inicial.

O "PREMIUM" que aparece numa busca ampla é de **outro** enum (`CRMMessageStyle`).
Se a página de preços disser PREMIUM, o cliente escolhe um rótulo que o sistema
não reconhece.

### A Foocci não é um "chatbot de WhatsApp" — e o material antigo diz que é

Vender só a IA subvende o produto. A superfície real, levantada das rotas: loja de
delivery e cardápio de mesa, painel com cardápio/pedidos/impressão, CRM inteiro
(campanhas, fidelidade, atribuição, carrinho abandonado), analytics, inbox de
atendimento, marca, canais, integrações, admin global — **mais** a esteira de
agência como segundo produto.

Origem: `HANDOFF-site-comercial.md` (commit `79943f5`) · verificado em 01/08

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Garçom: "tem lasanha?" casa com yakisoba | O matcher difuso aproxima demais e o cliente recebe outro prato |
| Garçom: ponto cego do simulador | Quando cai na IA, resposta vazia passa batida — o simulador aprova o silêncio |
| Foocci: saudação com nome + menu colado por código | Hoje depende do modelo lembrar; tem que ser garantido por código |
| Brain Fase 5 (parcial) | Falta consolidar as 6 filas, avaliar candidato e o LLM-judge online |
| **O drawer de Promoções cobre 16px do menu lateral** | Já está acontecendo em produção, no desktop. Ver abaixo |
| Aba Automações do drawer abre com os campos zerados | Os dados chegam por busca no navegador, sem estado de carregando. Por um instante parecem configurações perdidas |

### O drawer de Promoções cobre 16px do menu lateral (desktop)

O menu lateral tem **240px** (`Sidebar.tsx:102`, `w-60`). O drawer de Promoções
começa em **224px** (`PromotionsClient.tsx:521,526,1012,1015`, `lg:left-56`).

Os dois números foram escritos à mão, em arquivos diferentes, e **já divergiram**:
o drawer entra 16px por cima da borda do menu. O handoff que registrou isso ainda
descrevia como risco futuro — não é, já aconteceu.

O conserto certo não é trocar `56` por `60`: é a largura virar **um valor só**,
lido dos dois lados. Enquanto forem dois números soltos, eles divergem de novo.

**Dono:** `interface`.

---

## 🚚 Mudou de casa — eram daqui e não eram

Três pendências estavam listadas aqui como "Agência" e **pertencem ao Dioli
Digital**, não ao Foocci. Verificado em 01/08: o Foocci não tem nenhuma ocorrência
de `autoCheckable` no código; as 31 checagens com 28 desligadas estão em
`diolidigital/lib/dioli-brain/quality-gates.ts`.

| O que | Foi para |
|---|---|
| 28 de 31 portões são decoração (**P0**) | pendências do Dioli Digital |
| Verdade do cliente montada no cliente | pendências do Dioli Digital |
| Escada por departamento | pendências do Dioli Digital |

O Foocci tem a sua própria esteira de agência (`src/services/brain/sdr`,
`src/services/brain/oficina`) — o que confundiu. São coisas diferentes com nome
parecido, e é exatamente o tipo de erro que a camada de Diretor existe para pegar.

---

## 🅿️ Stand by — por decisão do dono (31/07)

### Custo por restaurante
Adiado. **O achado não pode se perder:** `AIInteractionLog` já tem
`restaurantId`, contagem de tokens e `estimatedCostUsd` — mas **só o
`AIOrderService` escreve nela**. Ficam de fora o Cérebro
(`OpenAIEngineAdapter`), o recepcionista de WhatsApp, o `helpAssistant`, os
embeddings, o `imageEnhancement`, o suporte e **os crons noturnos** — estes
últimos são custo que cresce a cada restaurante novo sem nenhum cliente
conversando. Além disso, `PRICING_USD_PER_1K` só conhece `gpt-4o` e
`gpt-4o-mini`, e modelo desconhecido cai no preço do `gpt-4o` em silêncio.

Quando voltar: ligar o logger em todos os caminhos, atualizar a tabela de
preços e fazer modelo desconhecido gritar, marcar origem (conversa × cron),
endpoint de soma mensal, e **uma semana de coleta em produção** antes de ler
qualquer número.

Isso bloqueia a definição das faixas de preço e o bloqueio por plano.

---

## 🧍 Fora do código — depende de gente, não de commit

- **Impressão física nunca confirmada numa loja.** Foi corrigida no servidor e
  ninguém ainda viu papel sair com alguém presente. Até isso acontecer, é
  conserto no papel.
- **Faixas de preço + bloqueio por plano.** O campo de plano existe e não
  bloqueia nada. Bloqueador comercial, travado no stand by acima.
- **`mpWebhookSecret` não configurado.** Aparece como `false` em `/api/health`.
  Se um pagamento por Mercado Pago não confirmar sozinho, é o primeiro lugar
  para olhar.

---

## ✅ Fechado recentemente

- **B1 — chave `ANTHROPIC_API_KEY`** (30/07). O robô noturno do manual saiu do
  papel: manual de 30/07 verde, agendada de 31/07 idem, com o passo da IA
  levando 4min07s. Toda agendada anterior falhava.
- **Os dois consertos do incidente da Nicole** (31/07, PR #40, em produção). A
  queda do Cérebro parou de apagar a conversa no meio do pedido, e o agente
  parou de prometer pedido que não pode criar.
- **A branch de trabalho estava 42 commits atrás** da padrão, e as duas travas
  acima estavam paradas nela sem chegar em produção. Resolvido no mesmo PR.
- **O build do Railway (01/08)** — uma sessão encerrou sem saber se o deploy
  tinha voltado, deixando aberto *"se o build ainda falha, produção está parada"*.
  **Está no ar.** `/api/health` responde com o `commitSha` do merge mais recente e
  `db: ok`. O `nixpacks.toml` com `npm ci --include=dev` está na branch padrão, e
  `tailwindcss`, `postcss`, `autoprefixer` e o CLI do `prisma` estão todos em
  `dependencies`. Nenhuma ação pendente.
- **As automações de WhatsApp saíram do CRM** e viraram a aba
  *🤖 Automações WhatsApp* dentro de Promoções. Está em produção, o manual já
  descreve o caminho novo (`howToGuidesContent.ts:599`), e o motor antigo está
  aposentado **por teste** (`AutomationRetired.test.ts`), não por combinado.
