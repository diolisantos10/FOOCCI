# Oficina — canais

> Append-only. Escrita pelo especialista. O Diretor promove o que virar vitrine.

---

## 2026-08-04 · Extração total da Evolution — o resto do sistema

**Ordem:** CEO, repetida três vezes — "EXTRAÇÃO TOTAL, NÃO QUERO UM CÓDIGO DESSA
EVOLUTION DENTRO DO FOOCCI". Não questionei; executei.

**Escopo meu:** `src/services/ai/**`, `src/services/whatsapp/ordering/**` e o resto
de `src/services/whatsapp/**`, `src/services/buildos/**`, as rotas
`/api/evolution/*` e `/api/webhooks/evolution`, `src/lib/evolution/**`,
`src/services/evolution/**`, `src/validators/evolution.ts` e as telas de QR.
Outros especialistas já tinham portado envio, `activeProvider`, `order/**`,
`integrations/` e `whatsapp/brain/**`.

### A checagem de paridade do webhook (o ponto que mais importava)

`docs/decisoes.md` registrava que os dois webhooks **não eram simétricos**.
Confiri item por item antes de apagar o da Evolution:

| Item do webhook da Evolution | Já existia na Meta? | O que fiz |
|---|---|---|
| dedupe por id de mensagem | sim | nada |
| status de entrega (delivered/read/failed) | sim | nada |
| criar/reaproveitar conversa | sim | nada |
| **upsert de Customer** | **NÃO** — só `findFirst` | **portei.** Sem `customerId` o opt-out era pulado |
| opt-out (PARAR/SAIR/STOP) | sim (`InboundGuardsService`) | nada — mas dependia do item acima |
| atribuição de receita do CRM | sim (`InboundGuardsService`) | nada |
| resgate de carrinho → humano | sim (`InboundGuardsService`) | nada |
| política central de IA (trava Staff/Fornecedor) | sim (`InboundGuardsService`) | nada |
| **pedido por texto (roteamento + motor + fallback)** | **NÃO** | **portei** → `InboundAgentDispatch` |
| **`agentMode` (AI_ORDERING_EXPERIMENTAL / MENU_ONLY)** | **NÃO** | **portei** → `InboundAgentDispatch` |
| **recepcionista para mídia/áudio** | **NÃO** (só Cérebro, só texto) | **portei** |
| **rastro `[WA-TextOrdering]`** | **NÃO** | **portei** |
| **comandos do Build OS** | **NÃO** | **portei** → `interceptBuildOsCommand` + `BuildOsMetaChannel` |
| reabrir conversa RESOLVED < 24h | NÃO | **não portei** — a Meta cria conversa nova. Diferença aceita, registrada |
| **eco `fromMe` (atendente responde do celular) → HUMAN_EXTERNAL + `handoffAlarmAckAt`** | **NÃO** | **NÃO PORTADO — ver abaixo** |
| `connection_update` → desativar instância | n/a | não existe na Meta (não há instância) |

### O único item sem paridade, dito sem maquiagem

O eco de coexistência (`smb_message_echoes`). Na Evolution, resposta dada pelo
celular do atendente entrava na Central como `HUMAN_EXTERNAL` **e** carimbava
`handoffAlarmAckAt` — foi assim que se matou o crônico "apita e não para".

Não portei porque **o formato do payload da Meta nunca foi validado contra um
evento ao vivo** (o próprio comentário no código dizia isso). Escrever no banco a
partir de formato adivinhado cria mensagem fantasma na conversa do cliente e
silencia alarme que deveria tocar — guardrail 5: a proteção não pode ser mais
destrutiva que o problema.

O que fiz em vez disso: o webhook **reconhece e loga o evento com as chaves do
payload** (guardrail 6 — a evidência necessária para implementar depois), e
`src/lib/alarm-contract.test.ts:43` trava o estado honesto em vez de o teste ser
apagado. Custo real, para o CEO decidir: resposta dada pelo celular não aparece na
Central e não silencia o alarme.

### O que apaguei

`src/app/api/evolution/**` (14 rotas) · `src/app/api/webhooks/evolution` ·
`src/lib/evolution/**` · `src/services/evolution/**` · `src/validators/evolution.ts` ·
`src/services/buildos/{AdminWhatsAppConfigService,BuildOSMasterChannelService,BuildOSInstanceHealthService}.ts` ·
`/api/admin/build-os/master-channel/{qr,sync,reset}` ·
`/api/admin/build-os/diagnostics/instance-health` ·
`WhatsAppIntegrationClient.tsx` (1.884 linhas, já não renderizado) ·
o `WhatsAppQRPanel` e o formulário de credenciais do Centro de Integrações ·
`getExpectedEvolutionWebhookUrl()` · a entrada do webhook morto no `middleware.ts` ·
**`POST /api/integracoes/whatsapp/meta/provider`**.

### Duas coisas que aprendi e quero na vitrine

**1 · Com um provedor só, o botão de "voltar" vira botão de emudecer.**
`/api/integracoes/whatsapp/meta/provider` deixava o lojista gravar
`whatsappProvider = "EVOLUTION"`. Depois da extração isso não é "voltar para o
canal anterior": é escolher *nenhum canal*, sem erro visível na tela. O mesmo vale
para a rota genérica `PUT/DELETE /api/integrations/whatsapp`, que gravava e
apagava credencial — agora recusa com mensagem que aponta o caminho certo, em vez
de 404 mudo. **Toda alternância de provedor tem que morrer junto com o segundo
provedor**, ou ela vira um interruptor de silêncio.

**2 · Quando a fonte de evidência morre, o painel não pode herdar o silêncio dela.**
O diagnóstico do Build OS respondia "meu /build chegou?" lendo
`EvolutionWebhookEventLog` — o log bruto de todo evento. A Meta **não grava log
bruto**, e não há tabela equivalente. Se eu simplesmente trocasse a fonte pelo
rastro do Build OS, "rastro vazio" passaria a ser lido como "a Meta parou de
entregar" — que é exatamente o guardrail 1 ao contrário. Deixei o campo dizer
explicitamente *o que ele não prova*, e as duas causas possíveis lado a lado, sem
escolher uma pelo silêncio da outra.

### Decisões que tomei e o CEO precisa saber

- **O canal Master do Build OS virou número dedicado da Meta**, por variável de
  ambiente (`BUILDOS_META_PHONE_NUMBER_ID` + `BUILDOS_META_ACCESS_TOKEN`), no mesmo
  molde do número de suporte. **Enquanto elas não forem definidas, `/build` por
  WhatsApp não funciona** — os scripts (`buildos:bootstrap`, `buildos:verify`,
  `buildos:test-command`) continuam valendo. Registrar o número dentro do
  aplicativo da Meta é trabalho do `meta` + decisão do CEO.
- **Mídia antiga recebida pela Evolution não abre mais.** Sem `metaMediaId` não há
  de onde baixar o blob. A rota devolve 404 declarado (não 500) e loga o caso; a
  mensagem continua visível na Central, só o anexo não abre.
- **Onde havia "existe config da Evolution?" agora é "existe config da Meta?"**, e
  ausência **falha fechado**: recepcionista e `AIOrderService` abortam o turno com
  log em vez de seguir. O `AIOrderService` devolve a conversa para `OPEN` — nada
  fica preso em `BOT`.

### O que NÃO toquei, de propósito

- `normalizePhoneForEvolution` / `isValidEvolutionPhone` (`src/lib/crm/normalizePhone.ts`)
  — é o normalizador de telefone BR do projeto inteiro, hoje no caminho de envio da
  META. O Diretor renomeia em passo separado.
- `cartEvolution` (`AISimulatorService`) — é "evolução do carrinho", não o provedor.
- Modelos `EvolutionConfig` e `EvolutionWebhookEventLog` no Prisma — apagar exige
  migração e destrói histórico. **Nenhum código lê mais essas tabelas.** Decisão de
  quando dropar é do CEO/Diretor.
- `Restaurant.whatsappProvider` — a coluna existe com valores antigos e **não decide
  mais nada**. O `status` da tela devolve `META_CLOUD_API` fixo, porque ler do banco
  daria ao painel uma resposta que o envio não obedece.
- `src/services/crm/**` e `src/services/quality/**` — de outros especialistas. As
  4 ocorrências restantes de `EvolutionClient|EvolutionConfigService|EvolutionApiError`
  são 1 nota histórica deliberada + 3 asserções **negativas** em teste (`not.toMatch`),
  que são armadilhas anti-reintrodução — não sobra nenhum import vivo.

### Verificação

- `npx tsc --noEmit` — **limpo**.
- `npx vitest run src/services/whatsapp/ src/services/ai/ src/services/buildos/` —
  **78 arquivos, 1.514 testes, verde**. Os 2 vermelhos do início eram meus
  (`WhatsAppBrainRuntimeService.test.ts` e `WhatsAppFallbackGuard.test.ts`) e foram
  **reescritos para a Meta**, não deletados.
- Suíte inteira: **379/380 arquivos verdes**. O único vermelho
  (`src/services/quality/noSideEffects.test.ts`, timeout de 5s) **falha igual no
  baseline sem as minhas mudanças** — confirmado com `git stash`.
- `grep -rl "EvolutionClient\|EvolutionConfigService\|EvolutionApiError" src` → **4**
  (era 13 no meio do trabalho; nenhum é import vivo).

### Arquivos novos que criei

- `src/services/whatsapp/inbound/InboundAgentDispatch.ts` — a paridade de quem responde.
- `src/services/whatsapp/inbound/tests/InboundAgentDispatch.test.ts` — 12 travas.
- `src/services/buildos/BuildOsMetaChannel.ts` — o canal Master na Meta.
- `src/app/api/admin/build-os/master-channel/route.ts` — só leitura, substitui o provisionador.

---

## 2026-08-07 · A Central não sabe que o Instagram existe como canal vivo

Pedido do CEO: *"por que o Instagram não conecta com a central de atendimentos"*.
Recorte: **a tela**, não o token (esse é do `meta`, que apurou `lastWebhookAt`
congelado em 23/07/2026 12:23 UTC).

### O que li

- `src/app/(dashboard)/atendimento/AtendimentoClient.tsx` (2561 linhas)
- `src/app/(dashboard)/atendimento/page.tsx`
- `src/app/api/chat/conversations/route.ts`
- `src/services/conversation/conversationListFilter.ts`
- `src/services/conversation/MessageService.ts:114-146`
- `src/services/instagram/InstagramChannelService.ts:53-120, 365-409`
- `src/services/instagram/InstagramSendClient.ts:34-45`
- `src/services/instagram/InstagramConfigService.ts:110-224`
- `src/app/api/integrations/instagram/route.ts:54-96`
- `src/app/(dashboard)/integracoes/instagram/InstagramIntegrationClient.tsx:294-344`

### Achados

1. **A Central RENDERIZA Instagram corretamente.** `CHANNEL_META` cobre
   `INSTAGRAM_DIRECT`/`INSTAGRAM_COMMENT`/`MESSENGER` (linhas 163-173), a aba
   "📷 Instagram" existe (181) e `buildConversationWhere` **não filtra canal por
   padrão** — nenhum canal é excluído da consulta. Se um DM chegasse hoje, ele
   apareceria. **O defeito não é de renderização.**

2. **A janela é de 100 e não tem "carregar mais".** `fetchList` manda
   `limit: "100"`, sempre `page` 1 (AtendimentoClient:432). O backend busca 400,
   deduplica por cliente e corta em 100 (route.ts:133,167). **Busca e filtro de
   Instagram rodam client-side sobre essas 100** (699-708, 726-728). Conversa de
   Instagram de 23/07 ou antes só aparece se estiver entre as 100 mais recentes por
   `lastMessageAt`. Com 15 dias de WhatsApp em cima, ela cai fora — e a aba diz
   "Nenhuma conversa encontrada". **Isto é defeito de tela e é meu.**

3. **A Central é cega para saúde de canal.** Zero referências a
   `/api/integrations/*`, `lastWebhookAt`, `lastError` ou status de conexão em
   AtendimentoClient. O vazio genérico está em 1142-1152. Um canal morto e um
   canal sem movimento são **a mesma tela**. É o mesmo defeito que segurou isto 15
   dias sem ninguém ver.

4. **O selo verde não tem prazo de validade.**
   `src/app/api/integrations/instagram/route.ts:58` —
   `status = "active"` exige apenas `view.lastWebhookAt` **não-nulo**. Carimbo de
   15 dias vale igual a carimbo de 1 minuto. A Central não consome esse selo (ver
   3), então ela não mente junto — ela simplesmente não olha.

5. **Bônus fora do token: responder pelo Instagram vem DESLIGADO de fábrica.**
   `instagramLoginOAuth.ts:378` grava `mode: "RECEIVE_ONLY"` na conexão;
   `InstagramChannelService.ts:378-380` recusa qualquer resposta manual nesse modo
   ("Modo somente recebimento", 502 em `MessageService.ts:129`). Mesmo com token
   saudável, o lojista **não responde da Central** até apertar "Ativar resposta
   manual" em Integrações. A Central não avisa isso em lugar nenhum.

6. **Guardrail 2 (nada preso para sempre):**
   `InstagramChannelService.ts:398` e `:467` persistem o outbound com
   `externalStatus: "pending"` quando `send.dryRun` — inclusive no caso "token
   ausente" (`InstagramSendClient.ts:38-40`), que é **permanente**, não transitório.
   Não há retentativa nem prazo: a mensagem fica `pending` eternamente. Deveria ser
   `failed`. Não corrigi (não foi pedido); fica registrado.

### O que NÃO consegui medir

- **Não há Instagram conversation contável.** `DATABASE_URL` local aponta para
  `localhost:5432` (fora do ar) e o `ADMIN_SECRET` desta caixa devolve **401** em
  `https://foocci.com.br/api/admin/restaurants`. Produção responde
  (`commitSha ccc621a`), mas eu não tenho chave. **Não consegui medir** quantas
  conversas de Instagram existem no banco nem a posição delas na janela de 100.

### Não fiz

Nenhuma mensagem enviada. Nada tocado em token, segredo, permissão ou App Review.
Nenhum arquivo de código alterado, nenhum commit, nenhum push.

### Proposta de vitrine

**"A Central de Atendimento não tem noção de canal morto"** — ela consulta todos os
canais sem filtro, mas a janela é de 100 conversas sem paginação, o filtro de
Instagram é client-side sobre essa janela, e não existe nenhum aviso de saúde de
canal. Canal desconectado e canal parado produzem a **mesma tela vazia**.
Corolário: **"aba de canal vazia na Central nunca é evidência de que o canal está
bem"** — é a versão forte da entrada de 01/08 sobre o filtro client-side.
Proveniência: apuração 2026-08-07, código em `ccc621a`, arquivos acima.

---

## 2026-08-07 (2) · A Central passa a saber que existe canal morto

CEO autorizou os três consertos que propus. Executados na ordem.

### 1. Faixa de canal fora do ar (`/atendimento`)

- `src/services/channels/channelHealth.ts` — avaliador **puro**.
- `src/app/api/atendimento/channel-health/route.ts` — leitura, tenant-scoped.
- `src/components/atendimento/ChannelHealthBanner.tsx` — a faixa.
- `AtendimentoClient.tsx:508-537` (sondagem, 5 min) e `:1009-1013` (render).

Quatro decisões que valem mais que o código:

- **Silêncio nunca fica vermelho.** Vermelho exige fato positivo (`lastError`).
  Ficar mudo, por 15 dias ou por um ano, é sempre âmbar — restaurante de baixo
  movimento passa dias sem Direct legitimamente. Guardrail 5: a proteção não pode
  ser pior que o problema. Trocaria um selo que mente "tudo bem" por um alarme que
  mente "quebrou".
- **Canal ausente ≠ canal caído.** Sem config, sem `enabled`, `DISABLED` ou
  pausado → devolve vazio. Faixa que acende para quem não usa Instagram é
  ignorada no primeiro dia e não serve para o dia em que importa.
- **Falha de leitura zera a faixa.** Não conseguir ler saúde não autoriza a tela
  a dizer que está tudo bem — ela cala (guardrail 1). Está no comentário da rota
  e no do `useEffect`, porque é o tipo de coisa que alguém "conserta" errado.
- **Uma faixa por vez.** O recado de `RECEIVE_ONLY` só aparece quando não há
  problema de saúde. Empilhar duas comia metade da tela a 375px — medido.

**A ação é curta de propósito** (≤32 caracteres, travado por teste). Na primeira
versão era "Se você espera Directs, confira a conexão em Integrações → Instagram"
e a 375px a faixa ocupava um terço da tela. A ressalva foi para o `headline`; o
botão virou "Abrir Integrações". Screenshot me obrigou a isso — não teria visto no
código.

**WhatsApp ficou de fora, de propósito.** `MetaWhatsAppConfig` não tem carimbo de
último evento recebido, e `connectionStatus: "ERROR"` na Meta **não** significa
WhatsApp fora do ar — a Evolution é o padrão E o fallback, então o número pode
estar atendendo normalmente. Avisar "WhatsApp caiu" ali é alarme falso no canal
que carrega todo o movimento. Documentado no cabeçalho do serviço.

### 2. A aba de canal busca no servidor

`conversationListFilter.ts:75-78` + `chat/conversations/route.ts:130` +
`AtendimentoClient.tsx:449-458`. Parâmetro `instagram=1`, no mesmo formato de
`staff=1` e `crm=1` (booleano, não `channel`, porque a aba precisa de dois canais).

**A busca por texto foi junto.** Ela tinha o mesmo defeito. Mandar `search` ao
servidor é alargamento puro: o back casa nome/telefone inclusive fora da janela, e
o filtro do cliente (um OU que inclui o conteúdo da última mensagem) deixa passar
tudo que o servidor casou. Nada some.

### 3. Selo com prazo de validade

`instagramCardStatus()` em `channelHealth.ts` (função pura, para ter portão) usado
por `api/integrations/instagram/route.ts:54-67`. Novo estado **`attention`** →
badge âmbar **"Sem receber"**, distinto de "Erro" no texto e na cor.
`IntegrationsCenterClient.tsx`: tipo, `StatusBadge`, `mergeStatus` (com `attention`
rankeado ACIMA de `active`, para um "ativo" nunca apagar um sinal de silêncio) e
chip próprio no resumo — somar em "Conectado" era exatamente a mentira antiga.

Levei junto duas mentiras menores da tela do Instagram: a data do último Direct
agora vem com ressalva quando velha, e o item de checklist "mensagens chegando"
deixou de ficar marcado com um carimbo de 15 dias.

### Portões — e a sabotagem que passou verde

`tsc --noEmit` limpo. `vitest run` **6068/6068**, 0 suítes vermelhas (JSON).
39 testes novos.

Sete sabotagens aplicadas, **cada uma confirmada no arquivo antes de julgar**:

| # | O que quebrei | Pegou |
|---|---|---|
| A | silêncio vira `down` | 4 |
| B | guardas de `configured`/`enabled` | 2 → **5** |
| C | guarda de `paused` | 1 |
| D | filtro do Instagram sai do banco | 3 |
| E | filtro do Instagram sempre ligado | 4 |
| F | selo volta a não ter prazo | 3 |
| G | tudo vira `attention` | 2 |

**A sabotagem B pegou só 2 na primeira rodada — e foi o achado do dia.** Os
portões de "canal ausente" passavam **vazios**: eu testava `configured: false` com
um estado que não acenderia de qualquer jeito. Teste que devolve `[]` porque não
havia nada a dizer não prova guarda nenhuma. Reescrevi com um estado `LOUD` (erro
+ 15 dias de silêncio + RECEIVE_ONLY) que **acende comprovadamente** quando o canal
está ligado — com um teste de controle explícito para isso — e aí a mesma
sabotagem passou a ser pega por 5 portões. Fica a regra:

> **Portão de "não deve acontecer" precisa provar que o caso ACONTECERIA sem a
> guarda.** Senão ele passa verde para sempre e você acha que está protegido.

### Screenshots — 375 / 768 / 1280

Postgres 16 descartável + `next dev` na porta 3100, banco semeado com **120
conversas de WhatsApp mais recentes que a única do Instagram** (posição 121, fora
da janela de 100). Tudo derrubado e apagado no fim.

- **Faixa acesa:** âmbar, "Instagram sem receber mensagem há 15 dias", com
  "Abrir Integrações". Nos três tamanhos.
- **Faixa apagada:** mesmo restaurante, `lastWebhookAt` de 10 min atrás. Nada.
- **Aba Instagram, o antes e o depois no MESMO banco:** com o filtro só no
  navegador → *"0 conversas · Nenhuma conversa encontrada"*; com `instagram=1` →
  *"1 conversa"*, a DM de 22/07 de volta. É a prova do defeito que o CEO estava
  vendo.
- **Integrações:** mudo → `Sem receber` âmbar, resumo `0 Conectado / 1 Sem
  receber`; saudável → `Ativo` verde, `1 Conectado`.
- **Sem empilhar:** `RECEIVE_ONLY` + mudo a 375px → **uma** faixa.

### Não fiz

Nenhuma mensagem enviada. Nada tocado em token, segredo, permissão, App Review ou
no fluxo de conexão. `RECEIVE_ONLY` continua o padrão — a faixa informa, não
altera. O `externalStatus: "pending"` eterno ficou para o próximo bloco. Sem
commit, sem push.

### Proposta de vitrine

1. **"Portão de 'não deve acontecer' precisa provar que o caso aconteceria sem a
   guarda."** Vale para qualquer agente, não só canais. Origem: sabotagem B desta
   sessão, 2026-08-07.
2. **"Silêncio nunca é prova de defeito — no máximo é atenção."** Só um fato
   positivo (erro registrado) autoriza vermelho. Vale para todo alerta de canal.
   Origem: `channelHealth.ts`, 2026-08-07.
3. **"Aba de canal vazia na Central nunca é evidência de que o canal está bem"** —
   proposta na apuração da manhã, agora **com o conserto junto**: o filtro é do
   servidor e existe faixa de saúde. A entrada de 01/08 sobre o filtro
   client-side pode ser aposentada.

---

## 2026-08-14 (madrugada) — o SDR fica pronto para ligar: os dois P0 e a porta que não existia

Despacho do Diretor: deixar o SDR pronto para o dia em que o CEO responder duas
perguntas, de modo que a resposta dele seja **escolher**, não construir.

### O que o desenho de 05/08 dizia — e o que envelheceu

Conferi `docs/sdr-foocci-desenho.md` linha a linha contra o código de hoje.

| Afirmação do desenho | Hoje |
|---|---|
| número de vendas é `null` (`config.ts:24`) | **verdade** — `HARDCODED_SALES_NUMBER` null em `config.ts:39`; a chave real é `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` |
| envio é sempre por restaurante | **verdade** — `WhatsAppMessagingService` exige `restaurantId` |
| portão do CRM aprova por omissão (`:420`) | **verdade, e pior que o descrito** (ver abaixo) |
| `BuildNotifier` envia sem freio (`:24-45`) | **verdade** |
| "Meta oficial × Evolution" é escolha do CEO | ❌ **CADUCOU** |

**A Evolution não existe mais.** Saiu em 04/08/2026 por ordem do CEO, um dia
ANTES de o desenho ser escrito — `activeProvider.ts:1-15`,
`WhatsAppMessagingService.ts:1-29`, `metaSendPolicy.ts:9-11`,
`BuildOsMetaChannel.ts:5-13`. Não há diretório `src/services/evolution/`, não há
segundo provedor em `src/services/whatsapp/providers/`. O desenho e o cronograma
(`docs/cronograma-sdr-e-crm-foocci.md:30`) descrevem uma escolha que o código já
não oferece. **Isto muda a pergunta 1 do CEO** e está no relatório ao Diretor.

Lição de forma, para mim: documento de investigação escrito no dia seguinte a uma
remoção grande cita o mundo de anteontem. Conferir a data do documento contra o
`git log` do módulo deveria ser o primeiro passo, não o último.

### P0-A — o portão aprovava por omissão. E não era só hipótese.

`ContactSafetyService.assertSendable` (hoje `:419`) só entra no bloco que conta
mensagens recentes **se houver `customerId`** (`:442`). Sem ele, os quatro
contadores ficam em zero e o avaliador lê "nunca mandei nada" → libera. Um lead
do site nunca tem `customerId`.

O desenho dizia "não é bug ativo (ninguém chama assim)". **Chama:**
`CrmCampaignService.ts:677` passa `customerId: exec.customerId ?? null`. Só não
dispara porque `CampaignExecution.customerId` é `String` não-nulo no schema
(`schema.prisma:1123`) — ou seja, o que segura o furo hoje é uma coluna, não uma
decisão. Coluna muda.

Conserto: campo **obrigatório** `contactHistoryKnown` no avaliador puro, e bloqueio
`UNKNOWN_CONTACT_HISTORY` antes das travas de frequência. Obrigatório de propósito
— assim toda construção de entrada tem que declarar o que sabe, e o compilador
cobra. Ficou fora do `if (!isBirthday)`: aniversário isenta de frequência, não de
identidade.

Cuidado que tomei (guardrail 5): conferi os 4 chamadores antes. Todos passam
`customerId` real → **zero mudança de comportamento em produção**.

### P0-B — o caminho de envio sem freio

`BuildOsMetaChannel.sendBuildOsMetaText` era o único envio **sem restaurante** e
sem trava nenhuma. O que existia contra o abuso era um comentário dizendo "é
interno".

Freio: janela deslizante de 1h com dois tetos — 40 mensagens (mata laço de
retentativa) e 5 destinos distintos (mata lista de leads na 6ª pessoa). Recusa
**antes da rede**, com a evidência no motivo.

Honestidade sobre o que ele NÃO é, e escrevi isso no cabeçalho do arquivo: é
**por processo, em memória**. Não é teto global. É para-choque contra as duas
formas de acidente que já aconteceram nesta casa, não substituto de portão.

Descoberta lateral: `instagramAttentionAlert.ts:68` também usa esse canal. Um
destino fixo, poucas mensagens — passa folgado no freio. Confirmado por leitura,
não por suposição.

### O que o desenho NÃO viu, e era o buraco principal

`api/webhooks/meta/whatsapp/route.ts:168` (antes do meu bloco): `phone_number_id`
que não casa com restaurante → `console.warn` e **descarte**. O número de vendas
não tem restaurante.

Ou seja: o site inteiro já está pronto para mandar a pessoa dizer "oi"
(`config.ts` monta a mensagem com `#código`), e **não havia ninguém do outro
lado**. Ligar o número sem isso seria a pior combinação possível — o CEO paga
anúncio, a pessoa escreve, e a mensagem morre num log.

Construí a recepção: `FoocciSalesInbound.receberMensagemDeVendas` — reconhece pelo
`#código` (`extractLeadCode`, que já existia), cai no telefone quando não acha,
cria contato `WHATSAPP_DIRETO` para quem vem de anúncio, aplica opt-out e grava a
linha do tempo. **Não redige e não envia**: redigir é do Cérebro e a escada de
liberação não autorizou.

Ordem que discuti comigo mesmo e ficou: **o pedido de silêncio vem antes de
"contato novo"**. Um desconhecido que manda "PARE" é GRAVADO, justamente para
poder honrar o silêncio — base que não sabe quem pediu para parar volta a
incomodar a mesma pessoa na semana seguinte.

### LGPD do lead: o que faltava era prova e freio

`SiteLead` não guardava aceite, versão nem opt-out (o detector de "PARE" grava em
`Customer`, que o lead não tem). Quatro colunas aditivas + índice. Contato antigo
fica com `consentAt` nulo e o portão usa `createdAt` — que É o instante do envio
do formulário. **Não preenchi consentimento por migração**: inventar aceite que
ninguém deu é pior que não ter o campo.

### A costura do provedor — e o que ela não é

`resolverProvedorDeVendas()` lê `FOOCCI_SALES_PROVIDER`. Só `META_CLOUD_API` é
implementado; qualquer outro valor **falha declarando**, nunca cai na Meta em
silêncio. Isto **não** é a Evolution voltando — é a diferença entre trocar de
canal mexendo num arquivo e caçar envio espalhado.

### Não fiz

Nenhuma mensagem enviada. Nenhum número cadastrado, nada contratado, nada gasto.
Não toquei em credencial nem em configuração do app Meta (é do `meta`). Não
registrei agente nem escrevi persona — isso é do Cérebro, com portão de qualidade.
Não escrevi o que o SDR responde sobre preço: é decisão do CEO e está em stand by.
Sem deploy, sem merge, sem push para a padrão.

### Proposta de vitrine

1. **"A Evolution saiu em 04/08/2026 — e os documentos de 05/08 ainda falam dela."**
   Entrada da vitrine "A Evolution é o default E o fallback" está **caduca** e
   precisa de tarja. Fonte: `activeProvider.ts:1-15`.
2. **"Mensagem para `phone_number_id` sem restaurante é DESCARTADA, com aviso que
   ninguém lê."** Todo número novo sem restaurante precisa de desvio explícito no
   webhook ANTES do lookup — hoje são três (suporte, Build OS, vendas).
   Fonte: `api/webhooks/meta/whatsapp/route.ts`.
3. **"Portão que busca dado por chave opcional aprova por omissão quando a chave
   falta."** O padrão, não o caso: `if (id) { …conta… }` seguido de avaliação dos
   contadores é sempre esta armadilha. A correção é um booleano obrigatório de
   "eu apurei", nunca um comentário.
4. **"Canal interno sem teto vira canal de massa no primeiro reaproveitamento."**
   Todo canal sem restaurante precisa de teto de destinos distintos — é o que
   separa "responde ao operador" de "manda para uma lista".

### Nota de procedência deste bloco — leia antes de procurar o commit

Os arquivos acima **não estão num commit meu**. Ao terminar, encontrei a árvore
limpa e o meu commit inexistente: uma sessão paralela, trabalhando no MESMO
diretório de trabalho, rodou um `git add -A`/`commit` e varreu tudo o que eu
tinha em `stage` para dentro do commit dela — **`2b43543f`**, cuja mensagem fala
de outra coisa ("Manual: o aviso de branch esgotada…").

Conteúdo íntegro e conferido depois do fato: `npx tsc --noEmit` exit 0, `vitest`
6356 verdes / 0 falhas / 2 pendentes deliberados, já **com** o bloco do `meta`
(`67d0cff6`) misturado na mesma árvore. Nada se perdeu; o que se perdeu foi a
mensagem de commit, que é onde mora o porquê.

**NÃO reescrevi a história**: reescrever branch compartilhada com sessões ativas
é destruir trabalho de terceiro para consertar um rótulo meu — a proteção seria
pior que o problema (guardrail 5).

Lição para a casa, e ela não é minha de resolver: **agentes em paralelo no mesmo
`working tree` compartilham o índice do git.** `git add -A` de qualquer um
sequestra o trabalho de todos. Ou cada sessão paralela usa `git commit -- <paths>`
com caminho explícito, ou usa árvore separada. Vale escalar ao Diretor.
