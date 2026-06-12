# Instagram — Conectar com Facebook (One-Click Connect v1)

> Branch `claude/remove-legacy-runner-q8iXa` · 2026-06-12.
> Jornada de produto para o lojista conectar a conta Meta sem procurar Page ID,
> Instagram Business Account ID ou Page Access Token na mão. O caminho manual
> continua existindo, mas como "Configuração manual avançada".

## 1. Fluxo do lojista

```
Integrações → Meta / Instagram → [Conectar com Facebook]
  → autoriza permissões na Meta
  → escolhe a Página do Facebook (conectada ao Instagram)
  → Foocci detecta o Instagram, salva a config e o token (criptografado)
  → modo inicial RECEIVE_ONLY (receber mensagens)
  → roda diagnóstico
  → Direct aparece na Central de Atendimento
```

Tela: `/integracoes/instagram`. Estados: **não conectado** (botão Conectar) →
**escolher Página** (`?meta=select_page`) → **conectado** (Página, @Instagram,
modo, último Direct + botões Rodar diagnóstico / Ativar resposta manual / Pausar
/ Desconectar / Abrir Central).

## 2. Como criar o Meta App

1. developers.facebook.com → criar App (tipo Business).
2. Adicionar produtos **Facebook Login** e **Instagram** (Messaging).
3. Instagram precisa ser **conta profissional** ligada a uma **Página do Facebook**.
4. Configurar o **Webhook** do app (campo `messages`) com a Callback URL do Foocci.
5. **App Review**: para uso fora de contas de teste, a Meta exige revisão das
   permissões de messaging. Em desenvolvimento, contas de teste funcionam.

## 3. Env vars necessárias (servidor)

| Var | Uso |
|---|---|
| `META_APP_ID` (ou `FACEBOOK_APP_ID`) | client_id do OAuth |
| `META_APP_SECRET` (ou `FACEBOOK_APP_SECRET`) | troca de code por token |
| `FOOCCI_BASE_URL` (ou `NEXTAUTH_URL`) | base para o redirect URI e webhook |
| `ENCRYPTION_KEY` | criptografa o Page Access Token em repouso |
| `INSTAGRAM_APP_SECRET` (opcional) | valida assinatura do webhook |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (opcional) | verify token a nível de env |

Sem `META_APP_ID`/`META_APP_SECRET`, o botão "Conectar com Facebook" responde
com o blocker **BLOCKED_BY_META_APP_ENV** (sem quebrar) e o lojista pode usar a
configuração manual avançada.

## 4. Redirect URI

```
{FOOCCI_BASE_URL}/api/integrations/meta/oauth/callback
```

Cadastre exatamente esse valor em **Facebook Login → Settings → Valid OAuth
Redirect URIs**.

## 5. Permissões / scopes

```
pages_show_list, pages_manage_metadata, instagram_basic,
instagram_manage_messages, pages_messaging
```

> O conjunto exato pode variar conforme a versão da Graph API e o App Review da
> Meta. Ajuste no app conforme a documentação oficial vigente.

## 6. Rotas OAuth (Foocci)

| Rota | O que faz |
|---|---|
| `GET /api/integrations/meta/oauth/start` | cria `state` single-use e redireciona ao diálogo da Meta |
| `GET /api/integrations/meta/oauth/callback` | valida state, troca code→token, lista Páginas + Instagram, guarda candidatos (sem token) |
| `GET /api/integrations/meta/oauth/candidates` | lista as Páginas descobertas (sem token) para a seleção |
| `POST /api/integrations/meta/oauth/select-page` | salva a Página escolhida (token criptografado), mode RECEIVE_ONLY |
| `POST /api/integrations/meta/oauth/disconnect` | pausa/desativa, apaga o token, **preserva conversas** |

## 7. Webhook e verify token

O OAuth não substitui o webhook. A Callback URL
`/api/webhooks/instagram` aparece na tela com botão Copiar. O verify token pode
ser gerado na tela (mostrado uma única vez, com aviso "Por segurança, ele não
será exibido novamente"); é guardado como **hash**.

## 8. Segurança

- `state` anti-CSRF: aleatório, **expira em 10 min**, **single-use** (consumido
  na seleção), `@unique`.
- Tokens **nunca** aparecem no front; logs sem token; App Secret nunca vai ao cliente.
- Page Access Token e user token guardados **criptografados** (AES-256-GCM); o
  user token é apagado após a seleção; candidatos persistidos **sem token**.
- Erros da Meta viram mensagem humana; permissão/app review faltando → blocker claro.
- Nenhuma mensagem real é enviada no fluxo de conexão.

## 9. Configuração manual avançada

Accordion com Page ID, Instagram Business Account ID, Page Access Token (senha) e
Verify Token — para quem prefere não usar o OAuth. Não é o caminho principal.

## 10. Limitações da v1

- IA automática no Instagram **não** ativa (modo FULL reservado).
- Sem long-lived token exchange automático / refresh (token da Página é salvo como veio).
- Sem seleção multi-conta simultânea (uma Página por restaurante).
- Produção ampla depende de App Review da Meta.

## Troubleshooting: `localhost` em produção / `blocked_env`

Sintoma: clicar em "Conectar com Facebook" redireciona para
`http://localhost:8080/...` ou a tela mostra "Conexão automática ainda não
configurada".

Causa: sem `FOOCCI_BASE_URL` no runtime da Railway, o servidor só enxerga o
origin interno do proxy (`localhost:8080`). Desde esta correção o código usa
`getPublicBaseUrl()` (FOOCCI_BASE_URL → NEXT_PUBLIC_APP_URL → APP_URL →
NEXT_PUBLIC_SITE_URL → NEXTAUTH_URL; candidatos com localhost/.railway.app são
rejeitados em produção) e, sem base válida, retorna o erro explícito
`PUBLIC_BASE_URL_NOT_CONFIGURED` em vez de gerar link quebrado.

Correção manual (Railway → serviço Foocci → Variables):

```
META_APP_ID=...
META_APP_SECRET=...
FOOCCI_BASE_URL=https://foocci.com.br
```

Verificação: `GET /api/admin/settings/integrations/instagram/env-diagnostic`
(ADMIN_SECRET) retorna booleans + `missing[]` — nunca valores de secrets.
