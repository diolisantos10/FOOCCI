# WhatsApp Coexistence — número no celular **e** na Cloud API (bot/CRM)

Coexistência (Meta, 2025) deixa o mesmo número de WhatsApp funcionar **ao mesmo tempo** no
**WhatsApp Business (app do celular)** e na **Cloud API** (bot Foocci / CRM). As mensagens
espelham entre os dois e o histórico dos últimos ~6 meses é sincronizado.

Use isto quando o restaurante quer continuar respondendo pelo aparelho **sem perder** o
atendimento automático no mesmo número.

---

## 1. Como funciona (diferente do fluxo normal)

- Onboarding normal da Cloud API **registra** o número (`POST /{phone_number_id}/register`),
  o que **tira** o número do celular. Coexistência **NÃO** faz isso.
- Coexistência usa o **Embedded Signup** com `featureType = whatsapp_business_app_onboarding`.
  O comerciante escolhe "conectar minha conta do WhatsApp Business", **lê um QR Code no app**
  e autoriza — o número entra na Cloud API **sem sair do celular**.
- No fim, `is_on_biz_app = true` e `platform_type = CLOUD_API` no phone number.

## 2. Pré-requisitos (lado do cliente / número)

- Número **ativo no WhatsApp Business (app verde)** há **pelo menos 7 dias**.
- App **v2.24.17+**, celular com câmera (para o QR).
- WABA vinculada a uma **Página do Facebook**.
- Região não restrita (não vale Nigéria / África do Sul).
- Máx. 1 número por conta em coexistência.

> Se o número está hoje na Cloud API (registrado), primeiro **desregistrar**
> (`Integrações → admin → deregister`, ou `POST /api/admin/meta/register {deregister:true, phoneNumberId}`),
> deixar o cliente **ativar o número no WhatsApp Business** e só então rodar a coexistência.

## 3. Configuração na plataforma (Meta App Dashboard) — **feito uma vez**

1. **Embedded Signup config** com a feature **"WhatsApp Business App Onboarding"**.
   - Anote o `config_id` e coloque em `META_COEXISTENCE_CONFIG_ID`
     (+ `NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID` para o front). Se não setar, cai no `META_CONFIG_ID` padrão.
2. **App Dashboard → WhatsApp → Configuration → Webhooks**: assinar os campos
   **`history`**, **`smb_app_state_sync`** e **`smb_message_echoes`** (além de `messages`).
   - `smb_message_echoes` = mensagens que o **atendente enviou pelo celular** (para espelhar no CRM).
   - `history` / `smb_app_state_sync` = histórico e contatos (sync em até 24h).
3. App precisa ser **Tech Provider / Solution Partner** (já é, para o Embedded Signup atual).

## 4. Passo do restaurante (na tela Integrações → WhatsApp)

1. Botão **"Conectar número que está no celular"** (seção *Coexistência*).
2. Login Meta → **"conectar sua conta do WhatsApp Business"**.
3. **Ler o QR Code** que aparece, com o app do WhatsApp Business do aparelho.
4. Autorizar o histórico. Pronto — badge **"Coexistência · número segue no celular"**.

## 5. O que o código já faz

- **Front** (`MetaProviderCard.tsx`): botão de coexistência → `fbLogin(configId, "whatsapp_business_app_onboarding")`.
- **Finalize** (`/api/integracoes/whatsapp/meta/connect`, `coexistence:true`): troca o code por token,
  assina o app na WABA e salva a config **sem** chamar `/register`.
- **Guarda** (`/api/admin/meta/register`): recusa registrar um número em coexistência
  (`skipped: coexistence`) — só com `force:true` — para nunca tirá-lo do celular.
- **Config**: coluna `coexistence` em `meta_whatsapp_configs` (migration `20260724100000_meta_coexistence`).
- **Webhook**: eventos `history` / `smb_app_state_sync` / `smb_message_echoes` são **logados**
  (`[webhook/meta/whatsapp] coexistence event(s): …`).

## 6. Pendência pós-go-live (validar com evento real)

- **Ingestão de `smb_message_echoes`** (mostrar no Central as respostas enviadas pelo celular):
  a estrutura exata do payload deve ser conferida num evento real antes de gravar em banco —
  por isso hoje só logamos. Quando o primeiro echo chegar, mapear `message_echoes[]`
  (destinatário, id p/ dedupe, texto) e inserir como `direction: OUTBOUND`.
- **Sync de histórico/contatos** via SMB App Data API (`sync_type: history` / `smb_app_state_sync`) em até 24h.

## 7. Checagem rápida (API)

`GET /api/admin/meta/diag` mostra, por config, `wabaPhones[]` com `platform_type` e o número.
Depois da coexistência, o número real deve aparecer com `is_on_biz_app: true` +
`platform_type: CLOUD_API`.
