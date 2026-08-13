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

## 2026-08-13 · Uma caixa só para o Sushi Cazza — parecer, e a trava que saiu dele

Despacho do Diretor: conferir a afirmação dele de que "um WhatsApp só é
impossível". Ele pediu explicitamente para ser refutado se estivesse errado.
**Estava, em duas das três afirmações.** Depois, segundo despacho: implementar a
trava que o próprio parecer propôs.

### 1 · O que foi refutado, com fonte

- **"Um número está ou na API ou no aplicativo, nunca nos dois"** — errado como
  regra geral. Vale para o registro normal, e nisso ele acertou:
  *"Registered numbers … cannot be used with WhatsApp Messenger"* e *"Numbers
  already in use with WhatsApp cannot be registered unless they are deleted first"*
  (fonte oficial, capturada ao vivo em 13/08:
  `https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers`).
  Mas existe **coexistência**, e o Foocci **já tem o botão dela na tela**
  (`MetaProviderCard.tsx:437`), a coluna no banco (`schema.prisma:1397`) e a guarda
  que impede registrar um número em coexistência (`admin/meta/register/route.ts:88`).
- **"Dois números são duas caixas que não se juntam"** — errado dentro do Foocci.
  `Conversation` **não tem campo de número** (`schema.prisma:867-907`) e o webhook
  agrupa por restaurante + telefone do CLIENTE
  (`webhooks/meta/whatsapp/route.ts:314-326`). A caixa única já existe.
- **"O número antigo saiu da API, então mensagem para ele não chega"** — certo.

### 2 · A biblioteca de fontes citada no despacho NÃO EXISTE

`docs/plataformas/meta/fontes/` não existe; não há `docs/plataformas/` nenhum.
Recapturei ao vivo em vez de deduzir.

⚠️ **A documentação da Meta MUDOU DE ENDEREÇO** — de `/docs/whatsapp/…` para
`/documentation/business-messaging/whatsapp/…`. As URLs antigas devolvem **404
real**. Toda URL citada de memória em `/docs/whatsapp/` tem chance alta de estar
morta; isso sozinho explica erro de quem responde sem conferir.

⚠️ **A página de coexistência exige LOGIN.** `.../business-phone-numbers/coexistence`
responde 200 mas devolve shell que redireciona para `business.facebook.com/loginpage`.
**NÃO VERIFIQUEI** o conteúdo oficial: sincronia de histórico de 6 meses, sentidos
da sincronização e o limite de 1 número por conta seguem apoiados só em
`docs/whatsapp-coexistence-setup.md`, que é documento **interno**. Capturar exige a
conta do CEO.

**Verificado com fonte oficial:** vários números por WABA são suportados — teto
inicial de 2, subindo até 20 com verificação de negócio
(`.../whatsapp/whatsapp-business-accounts`).

### 3 · O achado grave, e a trava que ele gerou

`MetaConfigService.upsert` tem chave **`restaurantId`**, não o número. Conectar um
segundo número no mesmo restaurante **sobrescrevia o primeiro** — `phoneNumberId`,
`wabaId` e token trocados de uma vez, sem erro e sem log. O número que sai deixa de
resolver no webhook e toda mensagem para ele passa a ser descartada no
`console.warn` de `webhooks/meta/whatsapp/route.ts:168`.

Não era hipótese: o botão *"Conectar número que está no celular"* fica ao lado de um
restaurante já conectado. **Um clique derrubava o número que atende o restaurante.**

**Implementado** em `MetaConfigService.ts:61-148`:

- `MetaNumberSwapBlockedError`, com a frase do **conserto** dentro do erro — quem
  captura devolve ela, não inventa outra;
- allowlist `SWAPPABLE_STATUSES = {DISCONNECTED}` — **fail-closed**. `PENDING`,
  `ERROR` e status desconhecido recusam. A denylist "bloqueia só CONNECTED" deixaria
  a falha aberta: bastaria um health-check marcar ERROR para a troca silenciosa
  voltar;
- a guarda lê com `select` de **três campos não sensíveis**, nunca `getResolved` —
  senão um token corrompido derrubaria a própria guarda (guardrail 5);
- `connect/route.ts:59-80` devolve **400 com a orientação**, não o `serverError()`
  genérico. "Erro interno" esconderia justamente o próximo passo.

**Continua passando de propósito:** mesmo número com token novo, troca de WABA,
primeiro número, e depois de desconectar. Travar o legítimo é como esta guarda
viraria a próxima quebra — token que expira e ninguém consegue renovar é queda pior
que a evitada.

### 4 · Sabotagem — três, todas pegas

`src/services/whatsapp/tests/MetaConfigService.numberSwap.test.ts` (9 testes).

| Sabotagem | Resultado |
|---|---|
| remover a guarda inteira | **3 reprovam** (os de recusa) |
| trocar a allowlist por `=== "CONNECTED"` | **1 reprova** — exatamente o do fail-closed |
| remover o `.trim()` da comparação | **1 reprova** — o de espaço no id |

Original restaurado, 9 verdes. `tsc --noEmit` limpo, **6386 testes** verdes (489
arquivos).

### 5 · Sobre o CRM — o que confirmei e o que NÃO

**Confirmado por leitura:** `MetaMessageTemplate` **não tem `wabaId`**
(`schema.prisma:1482-1501`) e `syncFromMeta` só faz `upsert`, sem nenhuma
reconciliação ou remoção (`MetaTemplateService.ts:243-286`). **Logo: template
aprovado na WABA antiga fica "Aprovado" na lista local para sempre.** Rodar o sync
não conserta — o template velho simplesmente não vem na lista nova e ninguém o toca.
`findApproved` então resolve um fantasma e a Meta rejeita o envio.

**NÃO VERIFICADO — e não afirmei:** a causa do "0 mensagens, 0 campanhas". Template
fantasma produz *erro por mensagem*, não *zero campanhas processadas*. Os candidatos
com endereço: `crmWhatsAppChannel.ts:28-38` (qualquer erro vira DESCONECTADO, e é
caminho **diferente** do selo da tela, que usa `ReadyMadeCampaignService.ts:231`),
`.github/workflows/crm-cron.yml` (se o `CRON_SECRET` não bate com o Railway, nada
roda e a tela não diz), e `metaSendPolicy.ts:52-57`. A ferramenta certa para fechar
é `CRMPreflightDiagnosisService.ts:116`, read-only. **Não executei** — exige segredo
de produção.

### 6 · O que NÃO fiz

Nenhuma chamada de escrita à Meta. Nenhum envio, registro, desconexão ou
provisionamento. Nenhum segredo lido, exibido ou logado — a captura de documentação
foi só `GET` em página pública. Não toquei no schema: dois números simultâneos é a
Opção 3 inteira, com migration em sistema no ar, e não era este despacho. O
`console.warn` que descarta mensagem de `phone_number_id` desconhecido
(`webhooks/meta/whatsapp/route.ts:168`) fica para o próximo despacho, por ordem do
Diretor.

### 7 · Para a vitrine (proposta — quem promove é o Diretor)

- **A caixa única já existe; o que falta é o segundo número.** `Conversation` não
  guarda número; a Central agrupa por restaurante + cliente. Proveniência:
  `schema.prisma:867-907` + `webhooks/meta/whatsapp/route.ts:314-326`, 13/08.
- **`upsert` de config Meta é chaveado por restaurante — um segundo número
  sobrescrevia o primeiro, calado.** Agora trava, fail-closed, com 9 testes e 3
  sabotagens. Proveniência: `MetaConfigService.ts:61-148`, 13/08.
- **`syncFromMeta` nunca invalida template órfão.** Aprovado na WABA velha fica
  "Aprovado" para sempre. Proveniência: `MetaTemplateService.ts:243-286`, 13/08.
- **A documentação da Meta mudou de endereço e a de coexistência exige login.**
  URL antiga em `/docs/whatsapp/` dá 404 real. Proveniência: captura ao vivo, 13/08.
