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

## 2026-08-13 · O alarme de pedido novo: veredito e conserto do eleitor de líder

**Despacho:** apurar se "pedido entra e não apita" acontece em produção. O achado
do agente de interface: em desenvolvimento, 20s de painel aberto → quatro buscas
a `/api/settings/sounds` e **zero** a `/api/orders`. Suspeita dele:
`sound-leader.ts` guarda `release` só dentro da callback do Web Lock; com o
duplo-mount do StrictMode o `dispose()` vem antes e o lock fica preso numa
instância morta.

### Veredito, em duas partes

**(a) O gatilho descrito é de desenvolvimento.** `next.config.js:13` liga
`reactStrictMode`, e o duplo-invoke de efeito do StrictMode é comportamento de
build de desenvolvimento do React — o build de produção monta uma vez só. Uma aba
sozinha em produção recebe o lock, `onBecomeLeader` chama `reevalRef.current()` e
o poll de `/api/orders` anda. **Não é este o defeito de produção.**

**(b) A causa que ele apontou não é do StrictMode — é do módulo, e vale em
produção.** O gatilho verdadeiro não é "montar duas vezes", é **"morrer enquanto
se está na fila"**. `dispose()` só sabia liberar quem já era líder; quem morria na
fila deixava o pedido lá, e a concessão futura ia parar numa instância morta que
segurava o lock **para sempre** — travando o alarme de **todas as abas daquele
navegador**, não só da aba culpada. Provado sem StrictMode nenhum, com um
`LockManager` falso que modela a fila: `src/lib/sound-leader.test.ts:141`
("aba que morre AINDA NA FILA não trava o lock para sempre") **reprova a versão
anterior** — restaurei o arquivo antigo e rodei: `expected false to be true`.

Hoje, em produção, esse gatilho é **latente**: procurei e não achei navegação que
desmonte o `GlobalAlertEngine` sem destruir o documento (o "Sair" do `TopBar.tsx:253`
usa `window.location.href`; os links do painel ficam todos dentro do grupo
`(dashboard)`). Não é conserto de problema imaginário: é uma armadilha a um
refactor de distância, cujo estrago é o alarme inteiro do navegador, e é o mesmo
"estado que prende para sempre" do guardrail da casa.

### O que eu achei e que ninguém tinha visto: o líder mudo

Duas verdades do código que se compõem mal:

1. `GlobalAlertEngine.tsx` trocou o portão de foco pelo portão de liderança —
   `canRing()` dá o direito **exclusivo** de apitar a UMA aba, escolhida por ordem
   de chegada no lock;
2. `audio-gate.ts` existe porque o navegador **só libera áudio para um documento
   que recebeu um gesto do usuário**, a cada carregamento.

Nada liga as duas. Uma aba aberta e **nunca clicada** — o padrão "abri e fui
trabalhar na outra" — pode ganhar a liderança e ficar **muda**, enquanto a aba
que o dono usa, essa sim armada, nem busca pedido (`canRing()` falso → `pollOrders`
retorna sem `fetch`). Pedido entra, nada apita, em lugar nenhum. E não havia
caminho de recuperação: quem morre o navegador substitui na hora; **quem fica vivo
e mudo não é substituído nunca**.

### O conserto

`src/lib/sound-leader.ts`, reescrito com uma invariante declarada: *enquanto não
houver `dispose()`, este cliente sempre tem **o lock ou um pedido na fila**.*

- **Pedido abortável** (`AbortSignal`) + geração que invalida pedido velho: uma
  concessão que chega depois do `dispose()` é devolvida no mesmo instante. Duas
  travas, porque a segunda cobre navegador sem `AbortController` (teste em
  `sound-leader.test.ts:172`).
- **`stepDownIfSomeoneIsWaiting()`**: o líder recusado pelo navegador devolve o
  lock **e volta para a fila no mesmo instante**. Só cede se `locks.query()`
  mostrar alguém esperando — largar sem substituto seria o pior dos mundos:
  ninguém buscando pedido e ninguém tocando. Com descanso de 30s, senão duas abas
  mudas ficariam jogando batata quente a cada toque do alarme.
- **`pagehide`/`pageshow` com `persisted`**: documento congelado no bfcache não
  segura mais o alarme das outras abas. (Elegibilidade real de bfcache com Web
  Lock: **NÃO VERIFICADO** — é defesa barata, não diagnóstico.)
- `ehRecusaDeAutoplay()` saiu de dentro de `refletirTentativaDeAlerta` e virou
  função exportada de `audio-gate.ts`: o aviso da barra e a cessão de liderança
  passaram a depender do **mesmo** juízo, em vez de duas cópias do regex.

Ligação no motor: 3 linhas em `GlobalAlertEngine.tsx` (`passarAVezSeEstaMuda` nos
dois `onDiagnostics`). Travado por fonte em `alarm-contract.test.ts` — o padrão
que a casa já usa ali.

### As duas metades, provadas

13 testes em `src/lib/sound-leader.test.ts`, sobre uma fila de verdade (FIFO,
titular único, `AbortSignal`, `query()`):

- **líder morto é substituído** — líder que fecha entrega na hora; aba que morre
  na fila não trava; concessão atrasada é devolvida;
- **líder vivo não é duplicado** — com 4 abas, `filter(isLeader).length === 1`
  antes e depois da troca; quem cede deixa de ser líder **antes** de o próximo
  assumir; quem não é líder não cede; sem ninguém na fila, não larga.

`npx tsc --noEmit` limpo · `npx vitest run` **492 arquivos / 6.433 verdes**.

### As respostas que o Diretor pediu

- **Líder morre → quanto tempo até outra assumir?** Aba fechada, recarregada ou
  travada: **imediato**, sem tempo de espera — o navegador concede ao próximo da
  fila, e toda aba viva mantém um pedido lá. Não há timeout nem heartbeat no
  caminho da aba. Líder **vivo e mudo**: antes, nunca; agora, no primeiro alerta
  recusado.
- **Sem Web Locks?** `supported=false` e o motor cai no portão antigo
  (`isVisibleRef`): apita na aba em primeiro plano. Perde-se o toque em segundo
  plano; não se perde o alarme. `stepDown` vira no-op.
- **Onde o lojista descobre?** No que está no ar hoje (`6c9ff23`), **em lugar
  nenhum** — o `SoundStatusChip` ainda diz "Som ativo" com base em `localStorage`.
  Nesta branch já existe o `SoundBlockedChip` (evidência, não status). Fica um
  buraco declarado: **o aviso aparece na aba que tentou tocar, que é justamente a
  que ninguém está olhando.** Cross-tab desse aviso: não fiz, não é deste bloco.

### Não fiz

Nada em `whatsapp/`, `crm/`, `order/`, `webhooks/meta/` ou `payments/`. Não subi
push. Commit por caminho explícito (5 arquivos + este registro) — a árvore tem
trabalho de outros dois agentes e não encostei neles.

**Achado de brinde, para o Diretor decidir depois:** `AlarmLeaderService` +
`POST/DELETE /api/settings/sounds/claim-leader` + duas colunas no banco existem e
**não têm nenhum chamador no cliente** — e `alarm-contract.test.ts:114` proíbe o
motor de chamá-los. É a coordenação entre APARELHOS diferentes (balcão, tablet,
celular), desligada de propósito num commit antigo. Consequência hoje: dois
computadores apitam juntos. Pelo critério do CEO ("na dúvida, toque demais") isso
está do lado certo — mas é código morto se passando por recurso.

### Proposta de vitrine

1. **"O eleito por lock precisa provar que consegue fazer o trabalho — e devolver
   o cargo quando não consegue."** Eleição por ordem de chegada não olha
   capacidade. Aqui, a aba escolhida podia ser a única sem permissão de áudio.
   Todo portão exclusivo precisa de um caminho de renúncia. Origem: apuração do
   alarme mudo, 2026-08-13.
2. **"`dispose()` que só sabe soltar o que já pegou deixa órfão na fila."** Todo
   pedido assíncrono a um recurso exclusivo nasce com cancelamento, ou o desmonte
   vira vazamento permanente. Mesmo formato da comanda presa em `CLAIMED`. Origem:
   `sound-leader.ts`, 2026-08-13.
3. **"Sintoma de desenvolvimento pode ter causa de produção."** O StrictMode não
   inventou o defeito: ele o **acelerou**. Fechar em "é só dev" teria arquivado
   uma armadilha viva. Origem: este veredito, 2026-08-13.

— canais, bloco do alarme de pedido novo, 13/08/2026
