# Instagram Direct — Integração v1 (canal de atendimento)

> Branch `claude/remove-legacy-runner-q8iXa` · 2026-06-11.
> Fase 1: **conectar canal, receber mensagens e atender pela Central** — sem IA
> automática, sem envio real em testes. O Instagram entra como **mais um canal**
> da Central de Atendimento existente, não como sistema paralelo.

## Objetivo

Mensagens recebidas no Direct do Instagram entram na mesma Central onde já entram
WhatsApp/Cardápio/Manual. O operador vê, responde manualmente e acompanha tudo
pela plataforma. A base fica pronta para, no futuro, plugar Brain/Waiter/CRM.

## Escopo v1

**Funciona:**
- Canal `INSTAGRAM_DIRECT` na Central (enum `Channel`).
- Webhook da Meta: verificação (GET) + recebimento (POST).
- Inbound vira `Customer` (sem telefone) + `CustomerChannelIdentity` (IGSID) +
  `Conversation` (channel=INSTAGRAM_DIRECT, `aiEnabled=false`) + `Message` (INBOUND).
- Idempotência por `externalMessageId`.
- Resposta **manual** do operador pela Central (mode REPLY_ONLY/FULL).
- Config por restaurante com token **criptografado** e verify token **hasheado**.
- Diagnóstico hermético (sem envio real) com cleanup.

**Não funciona ainda (proposital):**
- IA não responde automaticamente no Instagram.
- Sem envio real em testes (sempre dry-run sob test/sem token).
- Sem download/armazenamento de mídia (anexo vira placeholder + URL).
- Sem merge automático de cliente WhatsApp ↔ Instagram.
- Sem OAuth completo da Meta (configuração manual de IDs/token nesta fase).

> **UI do lojista:** a tela de produto para conectar a Meta vive em
> `/integracoes/instagram` (card "Meta / Instagram" na Central de Integrações).
> Detalhes em `docs/instagram-meta-integration-admin.md`.

## Arquitetura

```
Instagram Direct → Meta Webhook → /api/webhooks/instagram (POST)
  → verifyInstagramSignature (X-Hub-Signature-256, opcional)
  → normalizeInstagramPayload → InstagramChannelService.handleWebhookEvent
  → resolveConfigByInstagramAccountId (entry[].id)
  → upsertInstagramCustomerIdentity → findOrCreateConversation → persistInboundMessage
  → Central de Atendimento (/atendimento)
  → resposta manual → MessageService.sendOutbound (branch INSTAGRAM_DIRECT)
  → InstagramChannelService.sendManualReply → InstagramSendClient (Graph API)
```

Arquivos: `src/services/instagram/{types, InstagramConfigService, InstagramWebhookParser,
InstagramSendClient, InstagramChannelService, InstagramChannelDiagnostic}.ts`;
rotas `src/app/api/webhooks/instagram/route.ts`,
`src/app/api/admin/settings/integrations/instagram/route.ts`,
`src/app/api/cron/instagram/channel-diagnostic/route.ts`.

## Como configurar o Meta App

1. **Conta Instagram Professional** (Business/Creator) conectada a uma **Facebook Page**.
2. **Meta App** (developers.facebook.com) com o produto **Instagram** / Messaging.
3. Permissões de messaging (`instagram_basic`, `instagram_manage_messages`, `pages_messaging`)
   — produção exige **App Review**; contas de teste funcionam sem isso.
4. **Webhook** do app:
   - **Callback URL:** `{FOOCCI_BASE_URL}/api/webhooks/instagram`
   - **Verify Token:** o valor que você cadastrar no Foocci (env `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
     ou por restaurante via admin). A Meta faz um GET com `hub.verify_token`; o Foocci
     ecoa o `hub.challenge` quando o token confere.
   - Assinar o campo de `messages`.
5. **Page Access Token** de longa duração da Page conectada → salvar no Foocci (admin).
6. (Opcional/recomendado) **App Secret** em `INSTAGRAM_APP_SECRET` para validar a
   assinatura `X-Hub-Signature-256` dos webhooks.

## Webhook

- **GET** `/api/webhooks/instagram` — handshake: lê `hub.mode`/`hub.verify_token`/`hub.challenge`,
  valida o verify token (env **ou** hash de qualquer config) e ecoa o challenge; 403 se inválido.
- **POST** `/api/webhooks/instagram` — eventos: valida assinatura (quando há app secret),
  normaliza, persiste inbound permitido. **Nunca** responde sozinho, **nunca** envia,
  **nunca** cria pedido/Pix. Sempre responde 200 rápido (com resumo seguro, sem PII/token);
  contas/eventos desconhecidos são ignorados.

## Modos e escopo

| `mode` | Recebe? | Operador responde? | IA? |
|---|---|---|---|
| `DISABLED` | ❌ | ❌ | ❌ |
| `RECEIVE_ONLY` | ✅ | ❌ (aviso "somente recebimento") | ❌ |
| `REPLY_ONLY` | ✅ | ✅ (manual) | ❌ |
| `FULL` | ✅ | ✅ | reservado p/ futuro (não usado na v1) |

`scope`: `TEST_ACCOUNT_ONLY` (só IGSIDs na allowlist — padrão seguro) ou
`RESTAURANT_WIDE` (todos os remetentes da conta conectada).

## Segurança dos tokens

- **Page Access Token:** criptografado em repouso (AES-256-GCM, `lib/crypto`, env
  `ENCRYPTION_KEY`). Nunca retornado por API (só `tokenConfigured: true/false`).
- **Verify Token:** guardado como **hash SHA-256**, só comparado, nunca exibido.
- **App Secret:** referenciado por env (`INSTAGRAM_APP_SECRET`), não salvo em texto.
- Logs do webhook não incluem conteúdo de mensagem, PII nem token.
- Webhook idempotente; erros da Meta tratados sem derrubar o endpoint.

## Como aparece na Central

- Em `/atendimento`, conversas Instagram ganham o badge **📷 Instagram DM**
  (`CHANNEL_META.INSTAGRAM_DIRECT`).
- Lista mostra origem, nome (`Instagram …`), última mensagem e não-lidas.
- Timeline mostra inbound/outbound e eventos de sistema; anexos aparecem como
  placeholder (`[anexo: …]`) com a URL no metadata.

## Como responder

- O operador responde pela mesma caixa da Central. Se `conversation.channel ==
  INSTAGRAM_DIRECT`, o envio é roteado para `InstagramChannelService.sendManualReply`
  (WhatsApp segue pelo Evolution, intacto).
- `RECEIVE_ONLY` → não envia, mostra "Instagram conectado em modo somente recebimento".
- Sem token → "Instagram não configurado para responder por aqui".
- A mensagem outbound é persistida refletindo o resultado real (`sent`/`pending`/`failed`).

## Admin

`GET/PATCH /api/admin/settings/integrations/instagram?restaurantSlug=…` — status,
enabled/paused, mode, scope, IDs, webhook URL, "token configurado? sim/não" (nunca o
token), último webhook, último erro, allowlist. (UI dedicada pode ser adicionada
depois; os endpoints seguros já existem.)

## Diagnóstico

`POST /api/cron/instagram/channel-diagnostic` (Bearer `CRON_SECRET`) e workflow
`instagram-channel-diagnostic.yml`. Testa parser, assinatura, gates de modo, send em
dry-run e (com `restaurantSlug`) um round-trip sintético de inbound **com cleanup**.
Critérios: `PASS`, `noRealInstagramSend=true`, `runtimeTouched=false`.

## Conectar com Facebook (one-click)

O lojista pode conectar a Meta sem dados manuais via `/integracoes/instagram`
("Conectar com Facebook"). Ver `docs/instagram-meta-one-click-connect.md`.

## Próximos passos

- UI admin de Integrações (formulário de conexão + botão testar/pausar).
- Filtro de canal "Instagram" na lista da Central.
- Download/render de mídia.
- `SocialChannelBrainAdapter`: Brain classifica intenção; Waiter pode assumir pedido;
  CRM aproveita lead; Evidence registra conversões — **tudo manual na v1**.
- OAuth/onboarding Meta e App Review para produção ampla.
