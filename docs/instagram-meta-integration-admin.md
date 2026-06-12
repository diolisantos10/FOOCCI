# Meta / Instagram — Integração do lojista

> Branch `claude/remove-legacy-runner-q8iXa` · 2026-06-12.
> Tela de produto (não é ferramenta de dev) para o lojista conectar a conta Meta
> e trazer o Instagram Direct para a Central de Atendimento. Sem IA automática,
> sem envio real em testes, token sempre seguro.

## 1. Onde fica

- **Central de Integrações:** `/integracoes` — card **Meta / Instagram** ao lado de
  WhatsApp, Mercado Pago, Stone, etc.
- **Tela de configuração:** `/integracoes/instagram` (botão "Configurar" do card).
- **APIs (tenant, sessão do lojista):**
  `GET/PATCH /api/integrations/instagram` e `POST /api/integrations/instagram/test`.
- **APIs admin (ADMIN_SECRET):** `GET/PATCH /api/admin/settings/integrations/instagram`
  e `POST /api/admin/settings/integrations/instagram/diagnostic`.

## 2. Como o lojista configura

Na tela `/integracoes/instagram`:

1. **Status da integração** — status geral (Não configurado / Aguardando
   configuração da Meta / Recebendo mensagens / Resposta manual ativa / Pausado /
   Erro), modo atual, canal pausado, token configurado, última mensagem recebida,
   último erro, botão **Testar integração** e **Pausar/Despausar**.
2. **Onde vou responder?** — explica que o Direct aparece em **Atendimento** com o
   selo **Instagram DM**, com link para abrir a Central.
3. **Webhook** — Callback URL (`/api/webhooks/instagram`) com botão Copiar e a
   instrução de colar no painel da Meta; eventos necessários (`messages`).
4. **Dados da Meta** — Facebook Page ID, Instagram Business Account ID, Page
   Access Token (campo senha; "Token configurado ✓" + "Substituir token" quando já
   salvo) e Verify Token (gerar/copiar).
5. **Modo de operação** — Desativado / Receber mensagens / Responder manualmente.
   IA automática (FULL) aparece desabilitada com o aviso de que ainda não está ativa.
6. **Segurança** — Conta de teste (padrão) ou Restaurante inteiro (com aviso forte).
7. **Salvar configuração**.
8. **Checklist da Meta** — passos para concluir do lado da Meta.
9. **Detalhes técnicos** — accordion para quem quiser (canal, webhook, criptografia).

## 3. O que precisa na Meta

Conta Instagram Professional ligada a uma Página do Facebook; Meta App com
Instagram Messaging; Webhook com a Callback URL `/api/webhooks/instagram` e o
mesmo Verify Token; Page Access Token de longa duração; (opcional) App Secret em
`INSTAGRAM_APP_SECRET` para validar a assinatura. Produção ampla exige App Review.

## 4. Como testar

Botão **Testar integração** (`POST /api/integrations/instagram/test`) roda o
diagnóstico hermético e mostra resultado amigável:

```
Webhook: OK
Leitura de mensagens: OK
Canal na Central: OK
Envio real: não executado
runtimeTouched: false
```

Nenhuma mensagem é enviada de verdade.

## 5. Como aparece na Central

Mensagens recebidas viram `Customer` + `Conversation` (badge **📷 Instagram DM**) +
`Message` em `/atendimento`. O operador responde pela mesma Central quando o modo
for **Responder manualmente** (REPLY_ONLY).

## 6. Modos

| Modo (UI) | Interno | Comportamento |
|---|---|---|
| Desativado | `DISABLED` | não recebe |
| Receber mensagens na Central | `RECEIVE_ONLY` | recebe, sem responder |
| Responder manualmente pela Central | `REPLY_ONLY` | recebe + resposta manual |
| IA automática (em breve) | `FULL` | reservado, **não ativo** |

Scope: **Conta de teste** (`TEST_ACCOUNT_ONLY`, só IGSIDs autorizados — padrão) ou
**Restaurante inteiro** (`RESTAURANT_WIDE`, com aviso).

## 7. Segurança

- **Page Access Token** criptografado (AES-256-GCM, `ENCRYPTION_KEY`); a API nunca
  retorna o token (só `tokenConfigured: true/false`).
- **Verify Token** guardado como hash SHA-256; não é recuperável.
- PATCH restrito a OWNER/MANAGER; `restaurantId` sempre vem da sessão.
- Diagnóstico hermético: `noRealInstagramSend=true`, `runtimeTouched=false`,
  token nunca aparece na resposta.

## 8. O que não está ativo ainda

- IA automática no Instagram (FULL) — desabilitada por design nesta fase.
- Envio real em testes — sempre dry-run.
- Onboarding/OAuth automático da Meta — configuração manual de IDs/token por enquanto.
