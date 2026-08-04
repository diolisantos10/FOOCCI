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
