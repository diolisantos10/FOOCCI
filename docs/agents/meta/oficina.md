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

---

## 2026-08-06 · O que aconteceu em 23/07, o estado da chave hoje, e o inventário das proteções mudas

**Pedido do CEO (via Diretor):** o workflow `Instagram Token Refresh` (run `31087648136`,
06/08 09:05 UTC) falhou pelo 4º dia seguido com três linhas: token expirado em 05-Ago
16:00 PDT, canal LIGADO e MUDO desde 23/07 (13 dias), e o aviso por WhatsApp não saiu
porque `INSTAGRAM_ALERT_PHONE` não existe. Cinco perguntas: (1) o que houve em 23/07,
(2) o estado real da credencial, (3) o passo a passo do CEO, (4) `INSTAGRAM_ALERT_PHONE`
é a única faltando, (5) a trava para não repetir.

### 0 · O que consegui e o que NÃO consegui medir

- ✅ Produção responde: `GET /api/health` → `commitSha 1e368396`, `db:"ok"`,
  `mpWebhookSecret:true`, `mpPlatformToken:true`.
- ❌ **Não consegui medir a Graph API nem o banco.** O `.env` local tem 10 nomes e
  **nenhum** `META_*` / `INSTAGRAM_*` de credencial. Testei o `ADMIN_SECRET` local contra
  `…/instagram/env-diagnostic` em produção: **HTTP 401** — não é o segredo de produção.
  Sem `gh` CLI e sem `RAILWAY_TOKEN` no ambiente. Guardrail 1: onde não medi, digo que
  não medi.
- Caminho de medição que existe e que o Diretor alcança: `workflow_dispatch` de
  `.github/workflows/instagram-sos.yml` (lê o `ADMIN_SECRET` do Railway dentro do runner).

### 1 · 23/07 — a prova de que o silêncio NÃO é filtro nem falta de DM

**A peça que decide:** `InstagramChannelService.ts:191` chama `recordWebhookReceived`
**logo depois de resolver a config e ANTES de todos os filtros** — antes de
`mode/paused` (`:194`), antes do descarte de echo/delivery/read (`:199`), antes da
allowlist. Logo `lastWebhookAt` é *"a última vez que a Meta ENTREGOU qualquer evento
para esta conta"*, não "a última DM que virou conversa".

Consequência dura: `lastWebhookAt: 2026-07-23T12:23:20Z`
(`docs/passagem-de-bastao-foocci-2026-08-05.md:75`, apurado em produção) significa que a
**Meta parou de entregar**. Ficam derrubadas de uma vez: allowlist, `scope`, `paused`,
`mode`, e "ninguém mandou DM" — echo, delivery e read também marcariam.

**A linha do tempo de 23/07, do próprio git (UTC):**

| Hora | Commit | O quê |
|---|---|---|
| 11:06 | `71d0805c` | `fix(instagram): DMs somem — conexão nascia em "conta de teste"`. Muda o padrão para `RESTAURANT_WIDE` **no ato da conexão** (`instagramLoginOAuth.ts:382`) → **só pega quem reconectar** |
| **12:23:20** | — | **último evento que a Meta entregou. Nunca mais chegou nada.** |
| 12:26 | `644d3a56` | log temporário do webhook (3 min depois) |
| 17:23 | `8f93ad17` | nasce o `graph-check` — "the usual reason inbound DMs don't arrive" |
| 17:29 | `a24a21d1` | *"the OAuth flow silently falls back to the 1h short-lived token — which then expires in ~1h and **kills inbound DMs**"* |
| 20:03 | `115d3575` | *"**Root cause of the Instagram outage**: the OAuth flow silently fell back to the 1h short-lived token … so the token died and inbound DMs stopped"* |

**Leitura sustentada:** entre 11:06 e 12:23 alguém reconectou para pegar o fix das 11:06
(ele não tem efeito sem reconexão). A conexão nasceu com token de 1 hora; ~1h depois a
sessão morreu, a Meta revogou a inscrição da conta e a entrega parou. Às 17:29 e às 20:03
do mesmo dia quem estava olhando produção já escreveu exatamente isso nos commits.

**O que NÃO consigo provar:** o `metadata.connectedAt` daquela conexão foi **sobrescrito**
pelas reconexões de 04/08 e 05/08. A prova aritmética direta não existe mais. Não inferi
além disso.

**Hipótese alternativa que fica registrada, com o teste:** se o
`instagramBusinessAccountId` mudasse, os eventos chegariam e **não resolveriam**
(`InstagramChannelService.ts:186-187` sai antes do `recordWebhookReceived`), congelando
`lastWebhookAt` do mesmo jeito. Teste: linha `[ig-wh]` com `resolved:false` no log do
webhook, ou comparar o `id` do `/me` do `graph-check` com o campo guardado.

### 2 · O estado da chave hoje

**Expirou por prazo. Não foi revogação, não foi desautorização, não foi App Review.**
Quem classifica é a própria Meta: `"Session has expired on <data>"` é a mensagem de
expiração por tempo. Revogação diria *"Session has been invalidated because the user
changed their password…"*; permissão retirada diria *"The user has not authorized
application…"*; App Review reprovado não dá 190 — dá erro de permissão (#200) no uso do
escopo, e os escopos pedidos são `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`
(`instagramLoginOAuth.ts:38-41`).

**Mas o prazo era de UMA HORA, não de 60 dias — pela TERCEIRA vez.** Comparando as duas
leituras registradas:

| Quando lido | `lastError` da Meta | Expirou em (UTC) |
|---|---|---|
| 04/08 21:22 | `Session has expired on Monday, 03-Aug-26 19:00:00 PDT` | 04/08 02:00 |
| 06/08 09:05 | `Session has expired on Wednesday, 05-Aug-26 16:00:00 PDT` | **05/08 23:00** |

São tokens **diferentes** → houve **nova reconexão em 05/08**, e o token novo morreu no
mesmo dia. Como o token curto do Instagram dura exatamente 1h, ele foi emitido entre
22:00 e 23:00 UTC de 05/08 — **depois do deploy das 14:23 UTC** que subiu o retry 5×/30s
e o `subscribe()`. **O retry ampliado não resolveu.** A falha da troca `ig_exchange_token`
não é transitória; é sistemática.

**A evidência mais valiosa está no banco AGORA e ninguém lê.** Desde 05/08 o callback
grava `metadata.longLivedExchangeError`, `webhookSubscribedAt` e `webhookSubscribeError`
(`instagramLoginOAuth.ts:394-396`) — ou seja, **o motivo que a Meta deu para recusar a
troca sobreviveu ao deploy**. Só que:

- `graph-check/route.ts` devolve `tokenExpiresAt`, `expiresInDays`,
  `tokenLooksShortLived` e `lastError` — **nenhum dos três campos novos**;
- `InstagramConfigService.ts:123-126` (`toView`) projeta só `connectedVia`,
  `connectedAt`, `facebookPageName`, `instagramUsername`.

**Campo escrito sem caminho de leitura = evidência morta.** Correção de 4 linhas,
read-only, dentro do meu domínio — proposta, não executada.

### 3 · Proteções que se desligam sozinhas quando falta variável

**`INSTAGRAM_ALERT_PHONE` NÃO é a única — e definir só ela não faz o aviso sair.**
`instagramAttentionAlert.ts:58-68` exige **duas** condições: o telefone **E**
`isBuildOsMetaChannelEnabled()`, que por sua vez (`BuildOsMetaChannel.ts:31-43`) exige
`BUILDOS_META_PHONE_NUMBER_ID` **e** `BUILDOS_META_ACCESS_TOKEN`. São **3 variáveis**
para um aviso, e a oficina de 05/08 (linhas 380-384) registra `BUILDOS_META_*` ausentes.

| Proteção | Variáveis | Sem elas | Arquivo:linha | Medido? |
|---|---|---|---|---|
| Aviso de Instagram por WhatsApp | `INSTAGRAM_ALERT_PHONE` | `sent:false, reason:"desligado"` — **não conta como problema** | `instagramAttentionAlert.ts:33-35,59` | ❌ ausente (log de hoje) |
| Canal Master (transporte do aviso) | `BUILDOS_META_PHONE_NUMBER_ID` + `BUILDOS_META_ACCESS_TOKEN` | aviso não sai mesmo com o telefone definido | `BuildOsMetaChannel.ts:31,36,41-43` | ❓ registrado ausente em 05/08 |
| Suporte por WhatsApp | `SUPPORT_META_PHONE_NUMBER_ID` + `SUPPORT_META_ACCESS_TOKEN` | canal de suporte mudo | `SupportWhatsAppService.ts:21,25` | ❓ registrado ausente em 05/08 |
| E-mail de chamado de suporte | `RESEND_API_KEY` + (`SUPPORT_NOTIFY_EMAIL` \| `LEADS_NOTIFY_EMAIL`) | chamado **salvo e ninguém avisado** | `SupportTicketService.ts:38-40,145-150` | ❓ não medido |
| E-mail de lead do site | `RESEND_API_KEY` + `LEADS_NOTIFY_EMAIL` | lead entra e ninguém sabe | `SiteLeadService.ts:287-288` | ❓ não medido |
| Assinatura do webhook de pagamento | `MERCADO_PAGO_WEBHOOK_SECRET` | **verificação PULADA**, só `console.warn` | `payments/mercadopago/webhook/route.ts:182,190-192` | ✅ **presente** (`/api/health`) |

**Portões que conferi e estão fail-closed (não entram na lista):** `ADMIN_SECRET`
(`admin-auth.ts:63-64` — sem segredo, 401 sempre), assinatura dos dois webhooks da Meta
(`webhooks/instagram/route.ts:44-54` → 403 quando nenhum segredo casa, inclusive quando
não há segredo nenhum), `CRON_SECRET` (`cron/instagram/refresh-tokens/route.ts:19-23` —
cai no admin, não abre), `WHATSAPP_HANDOFF_ALERT_MINUTES` (default 10 min,
`check-timeouts/route.ts:29-32`).

**Não consigo enumerar o Railway daqui.** A tabela é o que o CÓDIGO permite estar
desligado; a coluna "medido" diz o que provei.

### 4 · Por que o buraco existe, em uma frase de mecanismo

`alertInstagramAttention` devolve `sent:false` com um `reason` **e o chamador trata isso
como estado normal** (`refresh-tokens/route.ts:38-39` só repassa). O workflow só imprime
o `::error::` do aviso **dentro de um `if` que já exige `needsAttention == true`**
(`instagram-token-refresh.yml:54-66`). Consequência: **num dia saudável o sistema nunca
diz "estou cego"** — a cegueira só aparece de carona num incidente que já está
acontecendo. É o guardrail 2 outra vez: esquecer o portão lê como "aprovado".

E existe um inventário de presença de variável já pronto no repositório —
`SupportSystemProbe.ts:57-68`, com `CRITICAL`/`OPTIONAL` — que lista **5** variáveis e
**nenhum canal de aviso**. O mecanismo existe e está incompleto.

### 5 · O que NÃO fiz, de propósito

- Não enviei mensagem nenhuma (nem canário, nem para número de time).
- Não rotacionei nem toquei em segredo. Nenhum valor foi impresso.
- Não mexi em `/{app-id}/subscriptions` — camada comum com o WhatsApp, que está no ar.
- Não escrevi código: o pedido do bloco 5 era **propor** o mecanismo.
- Não commitei e não dei push.

### 6 · Para a vitrine (proposta — quem promove é o Diretor)

- **`lastWebhookAt` é marcado ANTES de todo filtro** (`InstagramChannelService.ts:191`).
  Congelado = a Meta parou de entregar, ponto. Não é allowlist, não é `paused`, não é
  falta de DM. Proveniência: leitura de código em 06/08 + `lastWebhookAt:
  2026-07-23T12:23:20Z` apurado em produção em 04/08.
- **"Session has expired on <data>" é expiração por PRAZO** — a Meta usa textos
  diferentes para revogação e para desautorização, e App Review reprovado não dá 190.
  A mensagem já é a classificação; não é preciso adivinhar.
- **Um aviso exige TRÊS variáveis, não uma.** `INSTAGRAM_ALERT_PHONE` +
  `BUILDOS_META_PHONE_NUMBER_ID` + `BUILDOS_META_ACCESS_TOKEN`. Meio-configurado é
  desligado — e desligado hoje é silencioso.
- **Campo gravado sem caminho de leitura é evidência morta.**
  `metadata.longLivedExchangeError` existe desde 05/08 e nenhuma rota o devolve.

---

## 2026-08-08 — Pixel da Meta para foocci.com.br: levantamento antes da instrução

**Pedido:** o CEO não consegue criar o Pixel no Gerenciador de Eventos. Antes de
escrever o passo a passo, levantar o que já existe do nosso lado — porque temos
aplicativo dentro da Meta e o portfólio provavelmente já existe.

### 1 · O que CONFIRMEI

- **O site já sabe receber um Pixel. Não precisa de código nem de deploy.**
  `src/services/site/SiteSettingsService.ts:57-60` valida o id (`^\d{6,25}$`),
  `:98` resolve **banco → env `NEXT_PUBLIC_META_PIXEL_ID`** (sem default de
  lançamento, diferente do GA4), e `src/components/marketing/SiteAnalytics.tsx:45-71`
  monta `fbq('init')` + `<noscript>`. Ponto de montagem único:
  `src/app/site/layout.tsx:17`. Tela para colar: `/admin/site-analytics`
  (`AdminSidebar.tsx:77`, menu **Sistema → Analytics do site**), campo
  **"Meta Pixel — ID"** (`SiteAnalyticsClient.tsx:41-44`), com selo
  **ativo / formato inválido** (`:178`).

- **Nenhum Pixel está no ar hoje.** `GET https://foocci.com.br/site` (HTTP 200,
  77 KB): zero ocorrências de `connect.facebook.net`, zero `fbq('init'`. GA4 sim,
  `G-VERBSTGMDV` — que é o default de lançamento de `SiteSettingsService.ts:40`.
  Ou seja: campo vazio no banco **e** no env. Também não há Pixel guardado sem uso
  em lugar nenhum do repositório.

- **`foocci.com.br` não tem NENHUM registro TXT.** DoH em `dns.google` (controle
  com `google.com` funcionando): `Status 0`, sem `Answer`, SOA de
  `pixel.dns-parking.com`/`dns.hostinger.com` na Authority. Logo, **não há
  `facebook-domain-verification=` por DNS**. Também não há a meta tag no HTML
  servido, nem arquivo de verificação em `public/`.
  ⚠️ `dig`/`nslookup` **não existem neste ambiente** — a primeira consulta voltou
  vazia por falha de ferramenta, não por ausência de registro. Só o controle via
  DoH tornou a leitura válida. Registrando porque é armadilha de repetir.

### 2 · O que NÃO consegui confirmar (guardrail 1)

- **Qual portfólio empresarial hospeda o app `Foocci Whats` (893641126399955).**
  O ID do portfólio não existe em lugar nenhum do repositório — grep em `docs/`,
  `src/`, vitrines e oficinas de `meta` e `canais`. `admin/meta/diag/route.ts:51-58`
  lê WABA, número e templates; **não lê `business`**. Não consultei a Graph API:
  exigiria o `META_APP_SECRET`, que não está no `.env` local (só
  `META_WHATSAPP_ENABLED`) e cuja leitura não era necessária para responder.
- **Se o portfólio tem verificação de negócio concluída.** Não é observável de fora.
- **Se `foocci.com.br` está verificado no portfólio.** Os três métodos públicos
  (TXT, meta tag, arquivo) deram negativo, o que é forte — mas a resposta
  definitiva é uma tela do painel, não uma consulta.

### 3 · A única inferência estrutural que me permiti, e por quê

Um WABA **não pode existir fora de um portfólio empresarial** — é restrição da
plataforma, não silêncio da base. Como temos WABA com número LIVE atendendo
restaurante, **o portfólio existe necessariamente**. Isso autoriza dizer "não crie
um novo antes de olhar"; **não** autoriza dizer qual é nem quem o administra.

### 4 · O que NÃO fiz, de propósito

- Não toquei em credencial, permissão, token, webhook, App Review nem número.
- Não imprimi valor de segredo. Só nomes de variável.
- Não escrevi nem alterei código: o site já está pronto para receber o Pixel.
- Não chamei a Graph API. Só HTTP público e DNS público.

### 5 · Para a vitrine (proposta — quem promove é o Diretor)

- **O Pixel do nosso site é config, não deploy.** Banco vence env; id inválido é
  descartado em silêncio pela validação, e o selo da tela é o único aviso. Mesma
  forma de precedência da tela `/admin/meta` — e a mesma armadilha: valor colado
  errado não estoura, some. Proveniência: leitura de `SiteSettingsService.ts:57-98`
  + `SiteAnalyticsClient.tsx:41-44` em 08/08, com o HTML de produção conferido ao vivo.
- **O GA4 tem default embutido; o Pixel NÃO tem.** `SiteSettingsService.ts:40,98`.
  Ver GA4 no ar nunca é indício de que o Pixel também está — foi assim que confirmei
  que nenhum Pixel existe. Proveniência: `curl` em `foocci.com.br/site`, 08/08.
- **Neste ambiente `dig` não existe e devolve vazio como se fosse resposta.**
  Toda leitura de DNS aqui vai por DoH e **com consulta de controle**, senão
  ausência de ferramenta lê como ausência de registro — guardrail 1 mordendo pela
  ferramenta, não pelos dados. Proveniência: incidente da própria sessão, 08/08.

---

## 2026-08-14 (madrugada) · Meta é PRIORIDADE ZERO: o que travava, o que destravei, e o que só o CEO faz

**Pedido do Diretor, palavras do CEO:** *"o Foocci está parado… precisa receber os
clientes no WhatsApp via SDR, precisa da CRM, precisa receber clientes de WhatsApp, e
toda a Meta está parada."* Ordem: adiantar tudo que não depende dele e deixar só o
que é dele.

### 0 · O que eu consegui medir e o que NÃO consegui (guardrail 1, primeiro)

| Medi | Resultado |
|---|---|
| Produção responde | `GET /api/health` → `commitSha 6c9ff230`, `branch claude/remove-legacy-runner-q8iXa`, `db:"ok"` |
| Branch de trabalho × padrão | `git rev-list --left-right --count` = **0 0** — a branch atual É o head da padrão. O aviso do `CLAUDE.md` ("39 commits atrás") está **desatualizado** |
| `instagram-token-refresh.yml` está na branch PADRÃO | ✅ `git ls-tree origin/claude/remove-legacy-runner-q8iXa` confirma. Logo **`on: schedule` dispara** — a pendência "não confirmado se roda" fica respondida no nível do mecanismo |
| PIN de 2FA está no repositório? | **NÃO.** Grep em `docs/` e `*.md`: só menções ao fato do vazamento (`docs/decisoes.md:465`, `docs/pendencias.md:1105`), nunca o valor. A exposição foi no chat; a rotação continua pendente |

**O que NÃO consegui medir, e por quê — isto muda o que dá para afirmar:**

- **Não alcancei a Graph API nem o Railway.** O `.env` local tem 8 nomes
  (`DATABASE_URL`, `ENCRYPTION_KEY`, `META_WHATSAPP_ENABLED`, `NEXTAUTH_*`,
  `NEXT_PUBLIC_APP_URL`, `OPENAI_API_KEY`, `WHATSAPP_BRAIN_ENABLED`) e **nenhuma
  credencial `META_*`/`INSTAGRAM_*`**. Sem `RAILWAY_TOKEN` e sem `ADMIN_SECRET`.
- **A API de Actions do GitHub está BLOQUEADA neste ambiente.** `GH_TOKEN` existe, mas
  o proxy responde `403 {"message":"Access to this GitHub Actions path is not permitted
  through this proxy."}` para `/actions/secrets` e `/actions/**/runs`. Consequência
  dura: **não consigo listar segredos, não consigo ler histórico de execução e não
  consigo disparar workflow.** Todo diagnóstico ao vivo desta sessão teria de passar
  por lá. Registrando porque é armadilha de repetir — a oficina de 06/08 tentou o
  mesmo caminho por outra porta.
- Logo: **nada nesta entrada afirma estado ao vivo da Meta.** O que eu entrego é a
  máquina que mede, pronta para uma rodada de um clique.

### 1 · O que construí

#### a) Raio-X do aplicativo Meta — `scripts/meta-raiox.mjs` + `.github/workflows/meta-raiox.yml`

Uma rodada, somente leitura, responde tudo que a ficha pedia: presença de credencial
no Railway (nunca valor), o que a App Review cobra do app (termos, privacidade,
domínios, restrições), as **assinaturas de webhook do aplicativo** com conferência de
callback e do campo `messages`, o estado de cada WABA/número/template, a **credencial
viva ou morta** de cada restaurante, e o Instagram com validade real do token.

Reaproveita o padrão que já funcionava em `scripts/instagram-sos.mjs`: lê as variáveis
de produção com o `RAILWAY_TOKEN` **que já existe nos segredos do repositório**, mascara
todo segredo no instante da leitura, e imprime só campo escolhido a dedo (o log deste
repo é público). **Nenhuma credencial nova precisa ser pedida ao CEO para diagnosticar
a Meta** — este era o ponto da restrição do despacho, e ele se sustenta.

Três leituras que o script faz e que ninguém fazia:
- `META_CONFIG_ID == META_APP_ID` → grita. É a armadilha de 02/08 registrada na vitrine.
- `NEXT_PUBLIC_META_APP_ID` divergindo de `META_APP_ID` → grita. O navegador abriria o
  Embedded Signup com **outro aplicativo**, e isso falha calado.
- `META_WHATSAPP_ENABLED != "true"` → grita. Não governa mais o envio, mas continua
  sendo portão de ONBOARDING/UI: com ela desligada, ninguém **configura** nada novo na
  Meta pelo painel — e visto de fora isso se lê exatamente como *"a Meta está parada"*.

#### b) O buraco #5 do raio-x de 05/08, fechado: renovação/vigilância do token de WhatsApp

Era o achado mais grave em aberto e estava aberto havia nove dias: **o WhatsApp não
tinha varredura nenhuma de credencial.** O Instagram ganhou a dele em julho, depois de
13 dias mudo; o WhatsApp — o canal que atende o restaurante AGORA — só tinha um aviso
de tela a ≤30 dias (`MetaConfigService.ts:106`) alimentado por um `tokenExpiresAt`
gravado **uma vez, no onboarding**, e nunca reconferido.

| Arquivo | O quê |
|---|---|
| `src/services/whatsapp/metaTokenHealth.ts` | pergunta `debug_token` por config: validade, vencimento, **app emissor** e permissões concedidas |
| `src/services/whatsapp/metaTokenAlert.ts` | o aviso sai para o WhatsApp pelo canal Master, com `META_ALERT_PHONE` **caindo em** `INSTAGRAM_ALERT_PHONE` |
| `src/app/api/cron/whatsapp/meta-token-health/route.ts` | `CRON_SECRET` ou `x-admin-secret` |
| `.github/workflows/meta-token-health.yml` | diário 06:42 UTC, falha com `::error::` carregando a evidência |
| `src/services/whatsapp/metaTokenHealth.test.ts` | **12 casos** |

Quatro decisões que tomei sozinho, e o porquê:

1. **A varredura NUNCA desconecta ninguém.** Guardrail 5. As únicas escritas são
   `tokenExpiresAt` e `lastHealthCheckAt` — travado por teste que assere exatamente as
   duas chaves e a **ausência** de `connectionStatus`/`lastError` no `data`. Um erro de
   rede não pode derrubar o canal de um restaurante que está atendendo.
2. **"Não consegui perguntar" é `isValid: null`, nunca `true`, e vira atenção.** É o
   buraco descrito na oficina de 06/08 §4: num dia saudável o sistema nunca dizia
   "estou cego", e a cegueira só aparecia de carona num incidente já em curso.
3. **Uma variável de destino, não mais uma.** O mecanismo do Instagram já exigia TRÊS
   variáveis para um aviso sair. Somar uma quarta seria repetir o defeito; por isso
   `META_ALERT_PHONE` cai em `INSTAGRAM_ALERT_PHONE`: o CEO configura **um** número e
   os dois avisos passam a sair.
4. **`totalConfigs: 0` é atenção aqui, diferente do Instagram.** Lá, ninguém usar IG é
   normal. Aqui, zero WhatsApp significa que o canal do restaurante sumiu do banco.

O `debug_token` traz `scopes`, e isso rende uma leitura que nunca tínhamos: **as
permissões que a Meta de fato concedeu são prova indireta de App Review aprovada** —
um cliente que não é testador só consegue conceder permissão já aprovada. É o caminho
mais barato para responder "falta permissão?" sem depender de tela.

#### c) `admin/meta/diag` passa a dizer se a credencial está VIVA

`src/app/api/admin/meta/diag/route.ts` ganhou `tokenHealth` por config. O `diag` lia
WABA, número, templates e assinatura, e **não perguntava se o token estava vivo** —
reportava `connectionStatus`, que é o que o banco GUARDOU, não o que a Meta DIZ. É a
mesma mentira do selo "Ativo" do Instagram, na tela do WhatsApp.

#### d) `136024` deixa de mentir na hora do erro — `src/services/whatsapp/metaProvisionDiagnostics.ts`

O aprendizado estava na vitrine, que ninguém abre com o erro na tela. Agora
`/api/admin/meta/provision` anexa `diagnostico` na resposta de `add`, `request-code` e
`verify-code`: código, subcódigo, `is_transient`, **`retryable: false`** e o próximo
passo concreto (apagar a conta no aparelho; e o método `VOICE`, que nunca foi testado).
Cobre também 133005 (número em outra conta), 133008/133009 (PIN — avisa que insistir
**piora**, porque bloqueia por tentativas) e 190. **8 testes**, incluindo a metade que
reproduz o erro antigo: ler só a mensagem e concluir "temporário".

Guardrail 1 dentro do próprio diagnóstico: erro desconhecido devolve tudo `null`. Um
diagnóstico inventado é pior que nenhum.

#### e) `verifiedName` tinha um default fixo — **"Sushi Cazza"**

`provision/route.ts:42` (antes da mudança): `body.verifiedName?.trim() || "Sushi Cazza"`.
O `verified_name` é **o nome que o cliente final vê no WhatsApp**, e trocá-lo depois
passa por revisão da Meta. Qualquer número novo provisionado sem informar o campo
nasceria carimbado com o nome de um restaurante — **inclusive um número comercial da
própria Foocci**, que é exatamente o que o SDR precisa provisionar. Agora é obrigatório
e a recusa explica por quê.

#### f) A precedência banco→ambiente chega ao Instagram (achado #1 de 05/08, aberto havia 9 dias)

Três consumidores liam `process.env` direto e furavam a regra da casa. O efeito prático
é **o meu guardrail de papel**: rotacionar o segredo pela tela `/admin/meta` sem
atualizar o Railway deixava o WhatsApp com a credencial nova e o Instagram com a velha
— dois valores em vigor ao mesmo tempo, para o mesmo aplicativo, sem erro nenhum.

| Arquivo | O quê |
|---|---|
| `webhooks/instagram/route.ts:~50` | os segredos resolvidos entram na lista de candidatos da assinatura, **de forma aditiva** |
| `instagramLoginOAuth.ts` → `resolveInstagramLoginCreds()` | usada em `startInstagramLogin` e no callback |
| `metaOAuth.ts` → `resolveMetaAppCreds()` | usada nos dois pontos equivalentes |
| `metaCredentialPrecedence.test.ts` | **7 casos**, cada um com as duas metades |

**Aditivo de propósito:** o que já funcionava por env continua funcionando, e banco fora
do ar cai no env em vez de derrubar o OAuth (guardrail 5). A versão síncrona continua
existindo para a tela de status, que só reporta presença de variável de ambiente.

O webhook era o mais perigoso dos três: `META_APP_SECRET` assina **os dois** webhooks,
e um 403 ali é o canal inteiro mudo com o painel dizendo "Conectado".

#### g) Uma armadilha de acender o número de vendas, documentada onde ela morde

`src/components/marketing/config.ts:34` dizia que `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`
"não exige deploy". `NEXT_PUBLIC_*` é **congelado no build**, e este arquivo é importado
por `DemoForm.tsx`, que é `"use client"`. Salvar a variável e não refazer o build deixa
o site idêntico — sem erro, sem log. Quem espera o botão acender conclui que o número
está quebrado. Comentário corrigido com o aviso e o ponteiro para
`docs/setup-meta-passo-a-passo.md:111`, que já dizia isso para `NEXT_PUBLIC_META_APP_ID`.

### 2 · O que eu NÃO fiz, de propósito

- **Não rotacionei nada.** Nenhum segredo foi lido, impresso, gravado ou alterado.
- **Não chamei a Meta.** Nenhuma chamada desta sessão saiu para a Graph API.
- **Não toquei em `/{app-id}/subscriptions`** — camada comum com o WhatsApp, que está no ar.
- **Não mexi no número que atende o restaurante hoje.**
- **Não fiz deploy, não fiz merge, não dei push para a branch padrão.**
- **Não construí o SDR.** O degrau 0 é decisão do CEO (`docs/cronograma-sdr-e-crm-foocci.md:37`),
  e código antes disso é trabalho jogado fora.

### 3 · O que fica para o CEO, e por que só ele

1. **Abrir a aba "Ações necessárias"** do painel da Meta. `docs/pendencias.md:1098`
   registra: *"É onde a Meta lista o que está pendente ou bloqueando. Nunca foi lida
   nesta casa."* Se "toda a Meta está parada" tem uma explicação única, a chance maior
   é estar ali — e **App Review, permissão e verificação de negócio não são legíveis
   por API**; são tela, com a conta pessoal dele.
2. **Reconectar o Instagram** — login pessoal do dono, sem caminho por API.
3. **O chip do número novo** — apagar a conta de WhatsApp no aparelho é ato físico.
4. **Decidir o número de vendas e a resposta sobre preço** — degrau 0 do SDR.
5. **Rotacionar o PIN de 2FA** depois do registro.
6. **Definir `META_ALERT_PHONE`** e ligar o canal Master: escolher para onde vai o
   alerta e ativar um número na WABA é decisão dele, não minha.

### 4 · Verificação

`npx tsc --noEmit` **limpo** · `node --check scripts/meta-raiox.mjs` OK ·
`npx vitest run src/services/whatsapp/ src/services/instagram/ src/services/meta/
src/app/api/webhooks/` = **924 verdes, 0 vermelhos**. Os 27 testes novos:
12 (`metaTokenHealth`) + 8 (`metaProvisionDiagnostics`) + 7 (`metaCredentialPrecedence`).

### 5 · Para a vitrine (proposta — quem promove é o Diretor)

- **A API de Actions do GitHub está bloqueada pelo proxy deste ambiente.** `GH_TOKEN`
  existe e responde para repositório, mas `403` para `/actions/**`. Não dá para listar
  segredo, ler execução nem disparar workflow daqui — todo diagnóstico ao vivo depende
  de alguém apertar "Run workflow". Proveniência: `curl` com `GH_TOKEN` em 14/08,
  resposta literal do proxy.
- **`debug_token.scopes` é a prova mais barata de App Review aprovada.** Cliente que
  não é testador só concede permissão já aprovada pela Meta. Proveniência:
  `metaTokenHealth.ts` + `INSTAGRAM_LOGIN_SCOPES` em `instagramLoginOAuth.ts:38-41`.
- **`connectionStatus` é memória, não medição.** No WhatsApp ele é o que o banco
  guardou no onboarding; a Meta pode discordar há dias. Mesma mentira do selo "Ativo"
  do Instagram, na outra tela. Proveniência: `MetaConfigService.ts:110` × o
  `tokenHealth` novo em `diag/route.ts`.
- **Default de conveniência em campo que a Meta revisa é dívida cara.**
  `verified_name` nascia "Sushi Cazza" para qualquer número novo. Proveniência:
  `provision/route.ts:42`, corrigido em 14/08.
