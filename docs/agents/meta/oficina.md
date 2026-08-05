# Oficina — aplicativo Meta

> Append-only. O especialista escreve; o Diretor promove para a vitrine.

---

## 2026-08-03 — Token curto do Instagram: a troca já era correta; o buraco era a INVISIBILIDADE

**Contexto:** Sushi Cazza (Pedro Coelho) fora do ar desde 25/07, token morto
(erro 190). Reconexão iminente por `/integracoes/instagram` → "Entrar com Instagram".
Missão: garantir reconexão durável (60 dias) e que a próxima morte seja avisada.

**Qual fluxo a tela usa:** `instagramLoginOAuth.ts` (Instagram Business Login direto,
sem Facebook) — `INSTAGRAM_LOGIN_PLATFORM`. Confirmado por `docs/pendencias.md:632-633`
+ `instagramLoginRedirectUri` → `/api/integrations/instagram/login/callback`.

**Causa-raiz do token curto (com prova, sem inferir):**
- A troca short→long JÁ existe e está CORRETA: `instagramLoginOAuth.ts:142`
  (`grant_type=ig_exchange_token`), com **3 tentativas** (`:148`) e, se todas falharem,
  grava o token curto registrando expiração de ~1h (`:166`), sem fingir 60 dias.
- O outro fluxo (Facebook Login, `metaOAuth.ts:106`) usa `fb_exchange_token` —
  também correto. Endpoints/campos certos nos dois. Hipóteses (a)/(b)/(c) da ordem
  **NÃO** se confirmam no código atual.
- Logo, o token curto de 25/07 foi **ou** o fix ainda não deployado, **ou** as 3
  tentativas falharam transitoriamente. Não dá para provar qual pelo código — não
  inferi (guardrail 1).

**O buraco REAL que sobrava, e que consertei:** quando a troca cai no fallback curto,
a conexão **se forma mesmo assim** e o callback retornava `ok:true` sem marcar nada.
Resultado: selo verde "conectado" + token que morre em ~1h + silêncio na UI. Só o
`console.error` e o cron do dia seguinte pegavam. Era exatamente a morte silenciosa
de 25/07 ainda destravada no nível da tela.

E o `graph-check` — a ferramenta que a vitrine manda usar para "conferir a validade
do token novo" — **não expunha validade nenhuma**: só `tokenValid` (booleano de /me),
que responde igual para token de 1h e de 60 dias. A remediação documentada era
impossível de executar.

**O que mudei (arquivo:linha):**
- `instagramLoginOAuth.ts:241-259` — `CallbackResult` ganha `tokenExpiresInSeconds` +
  `shortLived`; const `DURABLE_TOKEN_MIN_SECONDS` (7 dias).
- `instagramLoginOAuth.ts` callback — detecta short-lived, grava `lastError` com a
  evidência (Diagnóstico + alerta diário passam a mostrar) e **limpa** `lastError` na
  reconexão durável (bug lateral: erro velho não era limpo em reconexão saudável).
- `InstagramConfigService.ts` — `lastError` no `InstagramConfigPatch` (mecanismo).
- `graph-check/route.ts` — passa a devolver `tokenExpiresAt`, `expiresInDays`,
  `tokenLooksShortLived`, `lastError`.
- `login/callback/route.ts` — `ig=connected_shortlived` quando o token nasce curto.
- Teste novo `InstagramLoginOAuth.exchange.test.ts` (4 casos): trava a troca
  short→long real (fetch mockado) E o portão de durabilidade. `tsc` limpo, 4694 verdes.

**Estado do alerta de morte:** o sweep diário (`instagramTokenRefresh.ts` +
`instagram-token-refresh.yml`) JÁ falha com `needsAttention`/`attention[]` carregando
a evidência (corrigido em 02/08, na vitrine). O que faltava era o **aviso no ATO da
conexão** — agora coberto pelo `lastError` + `graph-check`.

**Pendências para humano (CEO):**
1. Confirmar ao vivo, após a reconexão do Pedro, que `graph-check` mostra
   `expiresInDays ≈ 60` e `tokenLooksShortLived:false`. Se vier curto, a troca
   `ig_exchange_token` está falhando em produção — investigar credencial
   `INSTAGRAM_APP_SECRET` no Railway (fallback para `META_APP_SECRET` mascara isso).
2. Confirmar se o workflow `instagram-token-refresh` está na branch DEFAULT (o
   `on: schedule` só dispara de lá — o próprio YAML avisa nas linhas 8-9).
3. A UI (`interface`) precisa tratar `ig=connected_shortlived` com um aviso âmbar —
   proposto, não executado (fora do meu domínio).

---

## 2026-08-04 · A Evolution sai do envio: `WhatsAppMessagingService` vira canal único

**Ordem do CEO, via Diretor:** a Evolution era muleta enquanto a homologação da Meta
não saía. A homologação saiu, nenhum restaurante depende mais dela. Executar, não
questionar. Escopo meu: o serviço de envio + `providers/**` + as flags/políticas.

### O que mudou

- `src/services/whatsapp/WhatsAppMessagingService.ts` — **reescrito**. Sumiram
  `selectProvider`, `resolveProviderId`, `getProviderSettings`, `shouldAttemptFallback`,
  `sendVia`, `ProviderSettings`, o `fallbackProvider` e o objeto
  `providers: { evolution, meta }`. Restou uma instância `const meta` (linha 39) e
  quatro métodos com a **assinatura preservada**: `sendText`, `sendTemplate`,
  `sendConversationReply`, `getConnectionStatus`.
- `src/services/whatsapp/providers/EvolutionWhatsAppProvider.ts` — **apagado** (83 linhas).
- `src/services/whatsapp/providers/types.ts:26` — `WhatsAppProviderId` passa a ter **um
  valor**: `"META_CLOUD_API"`. Guardrail 4 aplicado: reintroduzir um segundo canal de
  envio agora é **erro de compilação**, não decisão de configuração. Conferido antes:
  o tipo só era consumido dentro do meu escopo; `Message.provider` no banco é `string`,
  então as linhas históricas com `"EVOLUTION"` continuam legíveis.
- `types.ts:80` — `sendTemplate` deixa de ser opcional. Era opcional *porque a Evolution
  não tinha template*; na Meta o template é o caminho **oficial** fora da janela de 24h.
- `WhatsAppMessagingService.sendTemplate` — sumiu o ramo que, na Evolution, juntava
  `bodyParams.join(" ")` e mandava como texto livre. Isso hoje seria mandar uma mensagem
  fora da janela por um caminho que a Meta não autoriza.
- `metaFlag.ts` e `metaSendPolicy.ts` — só cabeçalho: registram que a flag não governa
  mais o envio e que o bloqueio de política é reportado, nunca contornado.
- `providerSelection.test.ts` — **invertido**. Antes provava que a escolha entre dois
  provedores estava certa; agora prova que **não existe escolha nem caminho alternativo**
  (10 casos, verdes).

### As duas decisões que tomei sozinho, e o porquê

**1. `META_WHATSAPP_ENABLED` não é mais consultada no caminho de envio.**
Era o item 4 da ordem. Com dois provedores, flag off = "vai pela Evolution". Com canal
único, flag off viraria **sistema mudo, sem erro e sem log** — perigo maior que o que a
flag evitava. Não inventei flag nova: a `META_WHATSAPP_ENABLED` continua existindo e
continua sendo portão de **onboarding/UI** nas 8 rotas `integracoes/whatsapp/meta/*`
(connect, templates, test, simulate, provider, status, diagnostics,
integrations/whatsapp-business) — ali desligar impede *configurar algo novo*, não impede
o restaurante já conectado de responder. Registrado no cabeçalho de `metaFlag.ts` para
ninguém redescobrir isso do jeito caro.

**2. Falha de BANCO na consulta da janela de 24h agora é falha declarada, não exceção
solta nem envio.** `getLastInboundAt` consulta o banco para saber se estamos dentro da
janela. Se o banco cai, **não sabemos** — e guardrail 1 diz que ausência de informação
não é informação: não se deduz "pode mandar" do silêncio do banco. O envio devolve
`FAILED / WINDOW_LOOKUP_FAILED / retryable:true` com o caso concreto no log. Antes, esse
caminho estourava exceção crua para o chamador; e no `activeProvider` antigo o
equivalente **caía na Evolution** — que é exatamente o que não pode mais existir.

### O que NÃO era meu e ficou quebrado de propósito (tsc)

`npx tsc --noEmit` = **6 erros, nenhum em arquivo do meu escopo**:

| Arquivo:linha | Erro | Dono |
|---|---|---|
| `app/api/integracoes/whatsapp/meta/diagnostics/route.ts:31` | `providers.evolution` não existe mais | canais |
| `app/api/integracoes/whatsapp/meta/test/route.ts:42` | `providers.meta` não existe mais | canais |
| `services/whatsapp/brain/WhatsAppBrainRuntimeService.ts:30` | importa `resolveProviderId` | canais/brain |
| `services/crm/testing/crmScenarios.ts:132,366,367` | `evolutionAvailable` / `NO_EVOLUTION_CONFIG` | crm |

E **1 teste vermelho** que não é meu: `ordering/tests/WhatsAppFallbackGuard.test.ts:417`
— o `WhatsAppTextOrderingRuntimeService.ts:238` foi portado para `activeProvider` no
commit `f27b255` (não fui eu), mas o teste ainda mocka `EvolutionClient`; o envio real
vai para a Meta e `replySent` vem `false`. Meu diff não tem efeito de runtime nesse
caminho (mexi em tipo, que é compile-time, e em `WhatsAppMessagingService`, que
`ordering` não importa).

### Armadilha nova que fica registrada

`toMetaRecipient` (`providers/metaPayload.ts:43`) e a janela de 24h dependem de
**`normalizePhoneForEvolution`** (`lib/crm/normalizePhone.ts:18`) e de
`isValidEvolutionPhone`. **O nome mente**: é o normalizador de telefone BR do projeto
inteiro, hoje usado no caminho da Meta. Não apague nem renomeie achando que é sobra da
Evolution — quem fizer isso derruba a validação de telefone de TODO envio. Renomear é
trabalho de `lib/`, fora do meu escopo; registrei em vez de mexer.

**Verificação:** `npx vitest run src/services/whatsapp/` = 771 verdes, 1 vermelho
(o de `ordering`, acima). Não commitei nem dei push — o Diretor consolida. (O snapshot
`5b74a39` foi feito pelo próprio Diretor durante o trabalho e já carrega estes arquivos.)

---

## 2026-08-05 · RAIO-X: "existe um só aplicativo Meta?" — pedido do CEO

Varredura do lado do **aplicativo** (credenciais, permissões, tokens, números,
flags). Outro especialista varreu o resto do repositório em paralelo.

### Veredito

**Sim, um só aplicativo — mas o código SUPÕE isso, não GARANTE.** Não existe, em
lugar nenhum, uma verificação de que o `appId` do env, o do banco, o do build do
browser e o emissor do token guardado são o mesmo. Zero App ID embutido em código
(grep de `893641126399955`, `2198678317551576`, `1571394541276497` só bate em
`docs/`).

### 1 · As quatro identidades de credencial do mesmo app

| Fonte | Onde resolve | Quem lê |
|---|---|---|
| `META_APP_ID` / `META_APP_SECRET` (fallback `FACEBOOK_APP_*`) | `MetaAppCredentialsService.ts:118-119` | WhatsApp inteiro |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | `MetaAppCredentialsService.ts:124-125` **e** `instagramLoginOAuth.ts:44-45` | Instagram Login |
| `NEXT_PUBLIC_META_APP_ID` / `_CONFIG_ID` | `MetaProviderCard.tsx:84-85` | browser, Embedded Signup — **inlined no BUILD** |
| `SUPPORT_META_*` / `BUILDOS_META_*` | `SupportWhatsAppService.ts:21-26`, `BuildOsMetaChannel.ts:31-36` | dois números dedicados |

**Furo na precedência banco-sobre-env:** a vitrine manda ler sempre
`MetaAppCredentialsService.getResolved()`. Três consumidores leem `process.env`
direto: `metaOAuth.ts:36-37`, `instagramLoginOAuth.ts:44-45` e
`webhooks/instagram/route.ts:44-48`. Se alguém salvar credencial em `/admin/meta`,
o WhatsApp passa a usar a nova e **o Instagram continua com a do Railway**. Dois
valores em vigor ao mesmo tempo, para o mesmo app, sem erro.

`NEXT_PUBLIC_*` é build-time: mudar a tela não muda o browser até redeploy.

### 2 · Caminhos de envio e recebimento

**Três caminhos de envio**, todos `POST graph.facebook.com/{phone_number_id}/messages`:

| Caminho | Credencial | Arquivo:linha |
|---|---|---|
| Restaurante (texto/template/mídia) | token por restaurante, AES-256-GCM no banco | `MetaWhatsAppCloudProvider.ts:71` ← `WhatsAppMessagingService.ts:104,114` ← `activeProvider.ts:26` |
| Número de suporte (Agente de TI) | `SUPPORT_META_ACCESS_TOKEN` (env, texto puro) | `SupportWhatsAppService.ts:72` |
| Canal Master do Build OS | `BUILDOS_META_ACCESS_TOKEN` (env, texto puro) | `BuildOsMetaChannel.ts:91` |

**Uma porta de entrada só:** `api/webhooks/meta/whatsapp/route.ts`. Assinatura
X-Hub-Signature-256 **fail-closed** (linhas 52-60: sem segredo → 401, não aceita
não-assinado). Roteamento: suporte (141) → Build OS (151) → restaurante por
`phone_number_id` (167).

**Evolution: eliminada de fato.** Sobrou só o nome numa categoria de erro do CRM
(`crmExecutionClassification.ts:91,129`) — rótulo, não caminho.

**Renovação de token do WhatsApp: NÃO EXISTE.** Só um aviso de UI a ≤30 dias
(`MetaConfigService.ts:106`). Nenhum cron. É o mesmo desenho que derrubou o
Instagram em julho, sem nem o cron que o Instagram tem.

### 3 · Números

- Restaurante: `MetaWhatsAppConfig.phoneNumberId` é `@unique` (`schema.prisma:1345`)
  — um número nunca serve dois restaurantes.
- Suporte e Build OS: número **e** token por env, fora do inventário de `/admin/meta`
  e fora do `admin/meta/diag` (que varre só `metaWhatsAppConfig`).
- `META_TEST_PHONE` não é canal: é o único destino permitido do teste
  (`meta/test/route.ts:30,38`).

**O Build OS é o mesmo aplicativo? NÃO PROVADO DAQUI.** O código só usa o
`phone_number_id` e o token do env; não sabe de qual app vieram. Prova:
`GET /v21.0/debug_token?input_token={BUILDOS_META_ACCESS_TOKEN}&access_token={appId}|{appSecret}`
→ `data.app_id` tem de ser o do `Foocci Whats`. Idem para `SUPPORT_META_ACCESS_TOKEN`.

### 4 · Flags

`META_WHATSAPP_ENABLED` (`metaFlag.ts:26`) **não governa mais o envio** —
`WhatsAppMessagingService.ts:24-28` explica por quê: com canal único, flag falsa
seria sistema mudo sem log. Hoje ela é portão de onboarding/UI em 6 rotas
`integracoes/whatsapp/meta/*`; desligada, **falha visível** com mensagem ao lojista.

Gates que continuam: `isSupportWhatsAppEnabled()` e `isBuildOsMetaChannelEnabled()`
(meio-configurado = desligado, de propósito) e a ausência de `appSecret`, que rejeita
o webhook com 401 — **visível no log, invisível na tela**.

### 5 · Saúde e o Instagram caído

O `admin/meta/diag` já faz a verificação certa: compara
`subscribed_apps[].whatsapp_business_api_data.id === ourAppId`
(`diag/route.ts:66`). É a consulta que prova ao vivo que só o nosso app está
assinado na WABA.

**O Instagram fora do ar NÃO derruba o WhatsApp.** Credenciais em tabelas
diferentes (`metaWhatsAppConfig.accessToken` × `instagramChannelConfig.pageAccessTokenEncrypted`),
webhooks diferentes, e o erro 190 é do token do usuário — não do app. O que é
comum aos dois e portanto perigoso de verdade: o `META_APP_SECRET` (assina os
DOIS webhooks — `whatsapp/route.ts:52` e `instagram/route.ts:46`), o App Review e
a verificação de negócio.

### Sete achados para o Diretor decidir

1. **Instagram não lê `MetaAppCredentialsService`** — `metaOAuth.ts:36`,
   `instagramLoginOAuth.ts:44`, `webhooks/instagram/route.ts:44`. Divergência silenciosa.
2. **`connect` aceita `accessToken` cru sem provar que é do nosso app**
   (`meta/connect/route.ts:35`). `inspectTokenExpiry` chama `debug_token` e
   **descarta `data.app_id`** (`MetaOnboardingService.ts:48`). Guardrail 4: "um só
   app" é combinado, não trava. Uma linha resolveria.
3. **`systemUserToken` é salvo, criptografado, mascarado e NUNCA consumido**
   (`MetaAppCredentialsService.ts:127` — nenhum leitor). Custódia sem benefício.
4. **Suporte e Build OS fora do inventário**: token em texto puro no Railway, não
   aparecem em `/admin/meta` nem no `diag`.
5. **Zero renovação automática do token de WhatsApp.**
6. **`.env.example` ainda ensina Evolution como padrão** (linhas 18-21, 50-58) e
   `META_WHATSAPP_ENABLED="false"` (linha 63). Único lugar do repo que diria a um
   operador novo que existe um segundo caminho.
7. **Fallback `INSTAGRAM_APP_SECRET → META_APP_SECRET`** (`instagramLoginOAuth.ts:45`)
   — já registrado como M7 em `docs/CR-seguranca-cibernetica-2026-08-03.md:121`.

**Método:** só leitura de código. Nada foi executado contra a Meta, nada foi
commitado. Os itens marcados "não provado daqui" exigem `debug_token` ao vivo.

---

## 2026-08-05 · O Instagram mudo desde 23/07: o diagnóstico anterior estava errado em dois pontos

**Pedido:** o CEO cobrou treze dias de canal parado com campanha paga no ar. A ordem
foi confirmar o diagnóstico, não repeti-lo — e separar o que é meu do que é dele
**com prova, tentando, não achando**.

### O que eu derrubei do diagnóstico anterior

A leitura herdada era *"token expirado + Página do Facebook não vinculada; DM de
Instagram trafega pela Página, sem ela a Meta nem entrega"*. **Os dois pedaços da
segunda metade estão errados**, e mandariam o CEO a uma tarefa inútil:

1. **`facebookPageId: AUSENTE` é o estado CORRETO, escrito pelo próprio código.**
   `instagramLoginOAuth.ts:297` grava `facebookPageId: null` de propósito: a conexão
   usa Instagram Business Login, que existe justamente para quem não tem Facebook.
   O roteamento do webhook casa por `instagramBusinessAccountId` **OU** `facebookPageId`
   (`InstagramConfigService.ts:141`) — e o primeiro está presente (`27899980922965770`).
2. **`verifyTokenConfigured: false` não é problema.** É o hash por restaurante; o
   handshake aceita o token de ambiente (`InstagramConfigService.ts:238`), e
   `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` **existe** em produção. Além disso o verify token
   só vale no GET de verificação, não na entrega das mensagens.

### A peça que ninguém tinha consultado, e que decide tudo

**A assinatura de webhook do APLICATIVO** — `GET /{app-id}/subscriptions` com
`{appId}|{appSecret}`. Ela se lê com a chave do app e **não depende do token morto do
cliente**, que é o motivo de todo diagnóstico anterior ter parado na parede. Ao vivo:

```
object=instagram · active=true · callback=https://foocci.com.br/api/webhooks/instagram
    fields: comments, message_reactions, messages, messaging_postbacks, messaging_handover
object=whatsapp_business_account · active=true · callback=.../webhooks/meta/whatsapp
```

**A Meta está entregando.** Não há nada a corrigir na configuração do aplicativo, e a
confirmação lateral é boa: o WhatsApp está assinado e intacto — o Instagram caído
**não** o afeta, como a sala já dizia. Continua verdade.

### A causa real, com prova aritmética

`connectedAt: 2026-08-04T00:06:02Z` e `tokenExpiresAt: 2026-08-04T01:06:02Z`.
**Exatamente uma hora.** O código só grava 3600 num único lugar: o fallback de
`instagramLoginOAuth.ts:165`, quando toda tentativa de `ig_exchange_token` falhou.
Logo, **alguém já reconectou em 04/08 e a conexão nasceu morta** — e a queda de julho
nunca foi "token de 60 dias que venceu": é a troca short→long falhando em produção,
pela segunda vez (25/07 e 04/08). Mandar reconectar de novo sem mexer nisso repete o
resultado.

**Por que a troca falha: NÃO PROVADO.** Tentei e registro o método para quem vier:
- `INSTAGRAM_APP_SECRET` ≠ `META_APP_SECRET` (comparados sem imprimir) — o fallback
  silencioso da linha 45 **não** está em vigor. Essa hipótese cai.
- Chamar os dois endpoints da troca com code/token inválido de propósito **não
  discrimina**: a Meta valida o token antes do `client_secret`, e as duas credenciais
  devolvem a mesma mensagem. Teste inconclusivo, não negativo (guardrail 1).
- Os logs `[ig-oauth]` daquela noite **já não existem**: o deploy é de 05/08 14:23 e a
  retenção do Railway é por deploy. O motivo morreu com o deploy — que é exatamente o
  buraco que consertei abaixo.
- `INSTAGRAM_APP_ID|INSTAGRAM_APP_SECRET` é recusado como app token do Graph do
  Facebook ("Cannot get application info"). **Não concluí nada disso**: o Instagram App
  ID não é um app do Graph, então a recusa é esperada e não prova credencial ruim.

### O buraco maior, que ninguém tinha visto: a conta nunca era inscrita

A assinatura no nível do APP é necessária e **não suficiente** — a Meta só entrega
quando a **conta** também está inscrita em `messages`. O fluxo de conexão nunca fez
isso: dependia de alguém lembrar de chamar `graph-check?subscribe=true` à mão. Isso
explica como um canal pode ficar mudo **com o token vivo**, que é o intervalo de 23/07
a 25/07 que o diagnóstico do token nunca explicou.

### O que consertei (arquivo:linha)

| Onde | O quê |
|---|---|
| `instagramLoginOAuth.ts:~140` | `subscribe()` no cliente Graph; a inscrição da conta vira parte da conexão |
| `instagramLoginOAuth.ts` callback | chama o subscribe, e a falha vira `lastError` com o motivo da Meta |
| `instagramLoginOAuth.ts:30-33` | troca short→long passa de 3 tentativas em ~2s para **5 em ~30s** |
| `instagramLoginOAuth.ts` `InstagramProfile.longLivedError` | **o motivo sobrevive ao deploy** — antes só existia num `console.warn` |
| `login/callback/route.ts:33` | distingue `connected` × `connected_shortlived` × `connected_nosubscribe` |
| `InstagramIntegrationClient.tsx:88` | **`connected_shortlived` NÃO EXISTIA no mapa `IG_FLASH`** — o callback já mandava essa chave desde 03/08 e a tela não mostrava aviso NENHUM. Foi assim que a reconexão de 04/08 morreu em silêncio |
| `InstagramIntegrationClient.tsx:~296` | faixa vermelha com o `lastError` **dentro do card verde**, e botão "Reconectar agora" |
| `instagramTokenRefresh.ts` | alarme de **canal mudo** (`silent[]`, `SILENCE_ALERT_DAYS=3`), com evidência |
| `instagramAttentionAlert.ts` (novo) | o aviso sai do Actions e vai para o WhatsApp pelo canal **Master** |
| `scripts/instagram-sos*.mjs` + `.github/workflows/instagram-sos.yml` | o diagnóstico que faltava, reaproveitando o padrão Railway→ADMIN_SECRET |

**Verificação:** `npx tsc --noEmit` limpo · `npx vitest run` = 5375 verdes, 1 vermelho
(`quality/noSideEffects.test.ts`, timeout de 5s por contenção da máquina — **passa
isolado em 4,3s**, não é meu e não toquei em `quality/`).

### A armadilha de UI que quase impede a correção

Com o token morto, `isConnected` (`InstagramIntegrationClient.tsx:75`) devolve **true**
— basta `tokenConfigured` — então a tela some com o botão "Entrar com Instagram" e o
único caminho para reconectar era o botão **vermelho "Desconectar"**, com uma confirmação
que assusta. Um lojista não escolhe esse caminho quando a tela diz que está tudo verde.
Daí o botão "Reconectar Instagram" ficar sempre visível no card conectado.

### O que NÃO fiz de propósito

- **Não toquei em `/{app-id}/subscriptions`.** É a camada comum com o WhatsApp, o
  produto que está no ar. A leitura provou que está correta; reescrever por reescrever
  é arriscar o canal que funciona para consertar o que não está quebrado. Cheguei a
  escrever essa capacidade no script e **removi**.
- **Não rotacionei nada.** Nenhuma credencial foi alterada.

### Duas coisas que descobri e que são pendência de humano

1. **O cron de renovação falha, sozinho, desde 03/08** — verificado no histórico real:
   `2026-08-03/04/05 | schedule | claude/remove-legacy-runner-q8iXa | failure`. O alarme
   corrigido em 02/08 **funciona**. O problema é que ele toca dentro do GitHub Actions,
   onde ninguém entra. Alarme em sala vazia é alarme que não existe — daí o aviso por
   WhatsApp.
2. **Não existe canal de aviso configurado em produção.** Varri os nomes das variáveis:
   nenhuma com telefone (`BUILDOS_META_*`, `SUPPORT_META_*` e `META_TEST_PHONE`
   **ausentes**). O aviso está pronto e **desligado**: precisa de `INSTAGRAM_ALERT_PHONE`
   e do canal Master configurado. Não liguei sozinho porque escolher para onde vai o
   alerta e ativar um número na WABA é decisão do CEO.

### Para a vitrine (proposta — quem promove é o Diretor)

- **"Página do Facebook ausente" não é defeito no fluxo Instagram Login** — é o que o
  código grava de propósito. Proveniência: `instagramLoginOAuth.ts:297` +
  `/{app-id}/subscriptions` ao vivo em 05/08.
- **Quando o token do cliente morre, a chave do APP ainda responde.** `GET
  /{app-id}/subscriptions` com `{appId}|{appSecret}` diz se a Meta está entregando, sem
  depender do cliente. É por onde todo diagnóstico de canal mudo deve começar.
- **Assinatura do APP é necessária e não suficiente**: a CONTA também precisa estar
  inscrita em `messages`, e isso agora acontece na conexão.
- **`tokenExpiresAt − connectedAt == 1h` é assinatura digital do fallback** da troca
  short→long. Aritmética simples que dispensa log.
