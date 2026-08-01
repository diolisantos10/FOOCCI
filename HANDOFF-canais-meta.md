# HANDOFF — Canais Meta (Instagram Direct + provisionamento de número WhatsApp)

- **Data:** 2026-08-01
- **Repositório:** `diolisantos10/foocci` (public) — confirmado com `git remote -v`
- **Branch deste doc:** `claude/handoff-canais-meta`
- **Escopo desta sessão:** diagnóstico operacional de dois problemas de produção — (1) DMs do Instagram não chegam na Central; (2) provisionamento de um número WhatsApp novo travado. **Nenhuma alteração de código de runtime foi feita** — só investigação/leitura + chamadas de diagnóstico read-only. Este documento é o entregável.

> ⚠️ Repositório **público**. Nenhum segredo, telefone, e-mail, nome de cliente ou ID
> de cliente real aparece aqui de propósito. Onde precisar de um valor concreto,
> pegue no painel ou nos endpoints de diagnóstico (abaixo). Ver a seção final
> **"Credenciais vistas nesta sessão"**.

---

## a) O que é o projeto e a stack REAL

Lido de `package.json` (`name: crm-restaurante`), não de memória:

- **Framework:** Next.js **14.2.35** (App Router), React 18.3, TypeScript 5.5
- **DB/ORM:** Prisma **5.16** (`@prisma/client`) — Postgres
- **Auth:** next-auth 4.24
- **UI:** Tailwind 3.4, dnd-kit
- **IA:** `@anthropic-ai/sdk` 0.111, `openai` 6.29
- **Testes:** `vitest` (unit, `npm run test:unit`), `@playwright/test` 1.49 (e2e)
- **Build/Deploy:** Railway — `railway.toml` (NIXPACKS, `preDeployCommand` roda `scripts/migrate-deploy.sh`, `startCommand` roda `scripts/start-production.sh`), `nixpacks.toml`
- **Jobs agendados:** GitHub Actions em `.github/workflows/` (ver armadilha sobre branch default)

**Não confundir:** existe um repositório SEPARADO `diolisantos10/secretario` (bot de
WhatsApp/Telegram, Baileys + Meta). Ele **não** trata Instagram — o webhook dele só
entende o formato do WhatsApp Cloud API. Toda a integração de Instagram descrita aqui
vive **neste** repo (`foocci`), em `src/services/instagram/` e `src/app/api/.../instagram/`.

---

## b) DECISÕES (data + PORQUÊ)

- **Instagram v1 = RECEIVE_ONLY, sem auto-reply de IA** (commit `b2fd9bf`).
  *Porquê:* v1 é só receber DM/comentário na Central e responder manualmente; a IA
  nunca responde sozinha no IG. Se alguém "ligar" IA no IG sem entender isso, muda o
  comportamento esperado do produto.

- **Scope padrão da conexão = `RESTAURANT_WIDE`** (commit `71d0805`, "DMs somem").
  *Porquê:* conexão nova nascia como conta-de-teste com allowlist vazia → `isSenderAllowed`
  derrubava **toda** DM (`skippedNotAllowlisted`) e o operador via "quebrado". Padrão
  amplo evita isso. Existe botão "Restringir a conta de teste" pra estreitar quando
  necessário. **Se voltar a `TEST_ACCOUNT_ONLY` com allowlist vazia, o IG volta a "sumir".**

- **Login direto "Entrar com Instagram" (sem Facebook)** (commit `b2fd9bf`).
  *Porquê:* restaurantes que só têm Instagram (sem página do Facebook). Usa
  "Instagram API with Instagram Login" → host `graph.instagram.com`, `connectedVia = "instagram_login"`.

- **Token long-lived com retry na troca + cron de refresh diário** (commit `115d357`, 23/jul 20:03).
  *Porquê:* esta é a "queda de julho". Uma falha transitória na troca curto→longo
  fazia o sistema guardar o token CURTO (~1h), que morria e derrubava as DMs em silêncio.
  O fix tenta a troca 3x e, se falhar, grava expiry curto pra o cron/health flagar rápido.

- **`provision` e `register` são endpoints separados** (comentário no `provision/route.ts`).
  *Porquê:* `provision` cuida de add/verificação/status; `register` (endpoint próprio)
  cuida do registro do número + PIN de 2FA + `subscribeAppToWaba`. Ver armadilha.

---

## c) O QUE FOI TENTADO E NÃO FUNCIONOU

- **Reenviar `request-code` de hora em hora (número WhatsApp novo).** Retorna SEMPRE
  `136024` / `error_subcode 2388091` / `is_transient: false`, com a mensagem
  *"Our servers are temporarily unavailable. Please wait 1 hour"*. **A mensagem mente:**
  `is_transient:false` = **permanente**, não é cooldown. Repetir NÃO resolve — foram
  várias tentativas idênticas ao longo da sessão. Por eliminação (a WABA está 100%
  saudável — ver `status` abaixo), a causa mais provável é **o chip ainda ter uma conta
  WhatsApp ativa**; o destravamento é **apagar a conta no aparelho** (Config → Conta →
  Apagar minha conta) e esperar ~1h. *Não confirmado* de forma independente (dependia
  do dono testar o chip). Método `VOICE` em vez de `SMS` **não foi testado**.

- **`graph-check?subscribe=true` para reassinar o webhook do IG.** Não adianta quando o
  token está expirado (OAuthException 190) — reassinar também exige token válido.
  Ordem obrigatória: **reconectar primeiro**, resubscribe depois (se necessário).

- **Refrescar por API um token já expirado.** Impossível: `ig_refresh_token` exige token
  ainda vivo, com ≥24h e não expirado. Token morto = **só reconexão via UI** (login do dono).

- **Achar endpoint de status de IG/WABA por GET adivinhado em `foocci.com.br`.** Rotas
  inexistentes devolvem o HTML do app (Next), não 404 JSON. Use os endpoints listados
  na seção (f), que existem de verdade.

---

## d) O QUE FICOU ABERTO (+ o que quebra se ninguém mexer)

1. **Instagram DM do restaurante do Sushi — token expirado.**
   `tokenValid:false` (190, "Session expired 25-Jul"), `lastWebhookAt` parado em 23/jul.
   *Quebra se ninguém mexer:* o cliente perde **100% das DMs do Instagram**, em silêncio.
   A UI de integração exibe **"Conectado / Ativo"** mesmo assim (ver armadilha).
   *Ação:* dono precisa **Desconectar → "Entrar com Instagram" → login** na tela
   `/integracoes/instagram`. Só o dono consegue (OAuth com login pessoal do IG).

2. **Número WhatsApp novo do CRM — preso no `request-code` (136024).**
   *Quebra se ninguém mexer:* o número novo nunca verifica → nunca registra → o bot/CRM
   não atende por ele. **NÃO liberar/mexer no número atual do restaurante enquanto o novo
   não estiver no ar** (é o número que está atendendo hoje).

3. **Cron de refresh de token do IG (`.github/workflows/instagram-token-refresh.yml`).**
   `on: schedule` só dispara da **branch default** do repo. *Não confirmado* se está
   rodando de fato e se os secrets (`CRON_SECRET`, `FOOCCI_BASE_URL`) estão setados no
   GitHub. *Quebra se ninguém mexer:* todo token de IG expira em ~60 dias sem aviso e a
   "queda de julho" se repete.

---

## e) ARMADILHAS deste repositório

- **A UI de Instagram diz "Conectado / Ativo" mesmo com o token MORTO.** O sinal real de
  problema é, no card **Diagnóstico**, "Conta conectada: **pendente**" e o "Último Direct
  recebido" parado. Não confie no selo "Ativo".

- **O filtro "📷 Instagram" da Central é CLIENT-SIDE, sobre a janela já carregada**
  (`AtendimentoClient.tsx`, ~linha 725). Ele NÃO faz busca no banco só de IG. Tab vazia
  **≠** "não existe conversa" — pode ser só que nenhuma conversa de IG está na janela
  recente carregada.

- **A branch default do repo é `claude/remove-legacy-runner-q8iXa`** (não `main`/`master`).
  Como o `on: schedule` do GitHub só roda da default, **trocar a default sem migrar os
  workflows quebra os crons silenciosamente**.

- **`provision` NÃO tem ação `register`.** Ações válidas: `add | delete | request-code |
  verify-code | status`. O registro do número + PIN 2FA é o endpoint **separado**
  `POST /api/admin/meta/register` (`{ pin, restaurantId }`). *(Durante a sessão eu disse
  ao operador que o register acontecia dentro do `verify-code` — **isso estava errado**;
  fica corrigido aqui.)*

- **`136024` + `error_subcode 2388091` se disfarça de erro transitório** ("wait 1 hour"),
  mas `is_transient:false` = permanente. Não trate como retry-able.

- **`provision action:"delete"` tem guarda pra nunca apagar o número LIVE do restaurante.**
  Mesmo assim, confirme o `phoneNumberId` antes — é destrutivo (libera slot na WABA).

- **Token do IG é criptografado em repouso e NUNCA retornado pela API** (view mascarada).
  O `graph-check` descriptografa server-side só pra bater na Graph; não loga o token.

---

## f) O QUE EU SEI E NÃO ESTÁ ESCRITO EM LUGAR NENHUM

**1. A causa provável da queda atual do IG (a mais importante).**
A conexão de 25/jul nasceu com token **curto** (durou ~1h40; long-lived dura 60 dias).
*Não confirmado* qual dos dois: (a) a troca `ig_exchange_token` falhou nas 3 tentativas
naquele dia, ou (b) o fix `115d357` ainda não estava deployado em 25/jul. **Consequência
prática:** ao reconectar, **verifique imediatamente** com `graph-check` que a validade do
novo token é **~60 dias, não ~1h**. Se voltar curto, a troca long-lived está falhando em
produção — e **é aí que está o bug real**, não na expiração em si.

**2. Sequência COMPLETA do número WhatsApp novo (não está junta em lugar nenhum):**
`add` → `request-code` → `verify-code` → **`POST /api/admin/meta/register` (PIN)** +
`subscribeAppToWaba` → `activate`/`enableCrm` (rotear CRM pro número novo) → só ENTÃO
apontar bot/CRM. **Só depois disso** liberar o número atual do restaurante pro celular.

**3. Snapshot real da config de IG do restaurante (via `status`/GET, durante a sessão):**
`enabled:true`, `paused:false`, `mode:RECEIVE_ONLY`, `scope:RESTAURANT_WIDE`,
`connectedVia:"instagram_login"`, `tokenConfigured:true`, `lastError` = "token refresh:
… Session has expired". Ou seja: **tudo saudável menos o token.** A WABA do WhatsApp
também está saudável (`account_mode:LIVE`, `name_status:AVAILABLE_WITHOUT_REVIEW`,
`code_verification_status:NOT_VERIFIED` — só falta verificar).

**4. Diagnósticos read-only prontos** (auth: header `x-admin-secret` == env `ADMIN_SECRET`):
- `GET /api/admin/settings/integrations/instagram?restaurantId=…` → mode, paused,
  `lastWebhookAt`, `lastError`, `instagramBusinessAccountId`.
- `GET /api/admin/settings/integrations/instagram/graph-check?restaurantId=…[&subscribe=true]`
  → `tokenValid`, `subscribedApps` (**precisa conter `messages`**); `subscribe=true`
  reassina o campo `messages` (o conserto comum, sem App Review).
- `GET …/instagram/env-diagnostic` → quais env vars existem (só nomes), webhook/redirect URIs.
- `POST …/instagram/diagnostic` → checagem hermética (assinatura/parser).
- `POST /api/cron/instagram/refresh-tokens` (`Bearer CRON_SECRET` **ou** `x-admin-secret`),
  body `{ "restaurantId": "…" }` → refresh manual (só funciona em token vivo ≥24h).
- WhatsApp: `POST /api/admin/meta/provision` com `action:"status"` → campos ao vivo do número.

**5. Como saber por que uma DM não entrou (o jeito mais rápido):**
o webhook `POST /api/webhooks/instagram` loga uma linha **`[ig-wh]`** por payload, com
`resolved / persisted / skippedNonMessage / skippedNotAllowlisted / skippedDuplicates`.
Ordem de causas de uma DM não persistir (de `InstagramChannelService.handleWebhookEvent`):
assinatura inválida (403) → payload não é DM de IG → sem `accountId` →
`accountId` não resolve nenhuma config (`resolved:false`) → `mode:DISABLED` ou `paused` →
evento echo/delivery/read/reaction → mensagem sem texto e sem anexo →
remetente fora do allowlist (**só quando `scope ≠ RESTAURANT_WIDE`**).

---

## Credenciais vistas nesta sessão (para você TROCAR — não reproduzidas aqui)

- **`ADMIN_SECRET`** — usado nas chamadas de diagnóstico. Estava num arquivo de scratchpad
  da sessão (não colado como texto no chat). Não reproduzido neste doc.
- **PIN de 2FA do registro do WhatsApp (6 dígitos)** — apareceu **em texto** nas instruções
  da tarefa desta conversa. **Recomendo tratar como sensível e rotacionar após o registro.**
  Não reproduzido neste doc.
- Nenhuma API key/token da Meta foi exposta em texto nesta conversa.

---

## Estado no fim da sessão

- Instagram: **aguardando o dono reconectar** pela UI. Após reconectar, rodar `graph-check`
  (validar token ~60d + `messages` subscrito; resubscribe se faltar).
- WhatsApp número novo: **parado** no `request-code` (136024). Não reagendar retry automático
  (o dono pediu para parar). Retomar só quando o dono confirmar que apagou a conta do chip.
- Nada foi alterado no número WhatsApp que está no ar hoje.
