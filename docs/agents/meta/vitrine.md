# Vitrine — aplicativo Meta

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
>
> Esta sala nasceu em 2026-08-01, por decisão do CEO, quando ficou claro que o
> aplicativo dentro da Meta é **um só** — serve WhatsApp e Instagram ao mesmo
> tempo — e carrega as credenciais que permitem fazer qualquer coisa em nome da
> Foocci. As seis entradas abaixo **vieram da sala `canais`**, com a proveniência
> original preservada. A fronteira: **`meta` cuida da chave; `canais` usa a porta.**

---

## Editar as configurações do app por API FUNCIONA — a chave está ligada

Até 02/08 a Graph API respondia:

```
(#10) Changing app settings through API calls has been disabled for this app.
```

Não era "não dá" — era "está desligado". **O CEO ligou a chave em
*Meta → Configurações do app → Avançado* e a escrita passou a funcionar**
(`{"success":true}`).

**O que o Diretor consegue fazer sozinho agora:**

```
POST https://graph.facebook.com/v21.0/{appId}
  ?access_token={appId}|{appSecret}
  &terms_of_service_url=...  &app_domains[0]=...  &privacy_policy_url=...
```

⚠️ **A chave corta os dois lados:** quem tiver o `META_APP_SECRET` altera a
configuração do app, não só lê. Se o segredo vazar, o estrago cresce.

**Corrigido por API em 02/08**, com os três avisos de App Review zerados:

| Campo | Antes | Agora |
|---|---|---|
| Termos de Serviço | `https://www.facebook.com/` ❌ | `https://foocci.com.br/termos` ✅ |
| Domínios do aplicativo | vazio ❌ | `["foocci.com.br"]` ✅ |
| Política de Privacidade | já correto | `https://foocci.com.br/privacidade` ✅ |

Conferido pelo diagnóstico do próprio admin: **0 avisos**.

— promovido em 2026-08-02 pelo Diretor · origem: escrita real na Graph API v21.0,
verificada em seguida por leitura

---

## O que está em vigor hoje, verificado ao vivo (02/08)

| Campo | Estado |
|---|---|
| App | **`Foocci Whats`** · `893641126399955` · aceito pela Meta ✅ |
| Termos de Serviço | ✅ `https://foocci.com.br/termos` *(corrigido por API em 02/08)* |
| Política de Privacidade | ✅ `https://foocci.com.br/privacidade` |
| Domínios do aplicativo | ✅ `["foocci.com.br"]` *(corrigido por API em 02/08)* |
| Avisos de App Review | ✅ **zero** |
| `META_CONFIG_ID` | `1571394541276497` (Railway) |
| `INSTAGRAM_APP_ID` | `2198678317551576` (Railway) |

> ⚠️ **A armadilha que já aconteceu:** em 02/08 o CEO colou o **ID do Aplicativo**
> nos campos de `configId` **e** `igAppId` da tela do admin. Como o banco vence o
> ambiente, os dois valores corretos do Railway ficaram encobertos — e o
> `igAppId` errado ficou pareado com o `igAppSecret` certo, **cruzando as
> credenciais do Instagram**. Nada quebrou com erro; teria falhado calado.
>
> **Corrigido limpando os três campos** (`configId`, `igAppId`,
> `coexistenceConfigId`), que voltaram ao valor do Railway. A tela agora avisa
> quando `configId == appId`.
>
> **A lição:** *precedência banco-sobre-ambiente é poderosa e silenciosa.* Um valor
> colado errado na tela **encobre** um valor certo que já funcionava. Sempre confira
> a coluna de fonte (`salvo aqui` × `via Railway`) depois de salvar.

---

## A renovação do Instagram rodava verde todo dia — e não renovava nada

**Verificado em 02/08 no histórico do GitHub Actions:** o workflow
`instagram-token-refresh` roda **todos os dias desde 24/07**, sempre `success`.
Inclusive nos dez dias em que o cliente estava sem receber DM nenhuma.

Chamando o endpoint ao vivo, a resposta era:

```
{"ok":true,"checked":0,"refreshed":0,"results":[]}
```

**Por que zero:** a varredura consulta só `enabled: true` **e** com token guardado.
Quando o token morre, o canal é desabilitado e o token some — então **a conta
quebrada desaparece da consulta**. O trabalho que o job existe para fazer é
exatamente o que faz o job ficar quieto.

É o guardrail 2 invertido: **esquecer o portão passou a significar "aprovado".**

### O que mudou (02/08)

`refreshExpiringInstagramTokens` passa a devolver:

| Campo | Para quê |
|---|---|
| `totalConfigs` | quantas contas existem, habilitadas **ou não** |
| `ineligible[]` | as que ficaram de fora, **com o motivo e o último erro** |
| `needsAttention` | true quando alguma coisa precisa de humano |
| `attention[]` | o caso concreto, em português (guardrail 6) |

E o workflow **falha** com `::error::` quando `needsAttention` é true — antes ele
imprimia *"✅ executado"* em qualquer cenário.

**O silêncio continua permitido num caso só:** ninguém usa Instagram
(`totalConfigs: 0`). Alertar todo dia quem nunca conectou vira ruído que ninguém lê.

Travado por 4 testes, incluindo o cenário exato da queda de julho.

— promovido em 2026-08-02 pelo Diretor · origem: verificação do histórico real do
Actions + chamada ao vivo do endpoint em produção

---

## As credenciais do app agora resolvem BANCO primeiro, Railway depois

Desde 02/08 existe `/admin/meta`. As credenciais do aplicativo vivem em
`meta_app_credentials` (singleton), criptografadas com a mesma `ENCRYPTION_KEY` já
usada pelo token do Instagram.

**A ordem é deliberada:** valor salvo na tela **vence** a variável de ambiente;
linha vazia **não muda nada**. Por isso subir isso não podia quebrar um deploy que
já funcionava — e não quebrou.

**Leia sempre `MetaAppCredentialsService.getResolved()`**, nunca `process.env.META_*`
direto. Quem ler o env vai sub-reportar: a tela pode ter um valor que o env não tem.
Os cinco consumidores foram migrados (`webhooks/meta/whatsapp`, `MetaOnboardingService`,
`MetaWhatsAppCloudProvider`, `admin/meta/diag`, `integracoes/whatsapp/meta/diagnostics`).

Três regras estão **travadas por teste**, não por combinado
(`MetaAppCredentialsService.test.ts`):

1. **Campo em branco = MANTÉM, nunca apaga.** A tela só mostra segredo mascarado; se
   Salvar limpasse o que está em branco, abrir a tela e salvar apagaria tudo que o
   operador não consegue ver. Limpar é ação explícita.
2. **Segredo que não descriptografa cai no env**, não estoura. Uma linha corrompida
   não pode derrubar todo o envio de WhatsApp — é o guardrail 5 (a proteção não pode
   ser mais destrutiva que o problema).
3. **Tabela inexistente não quebra nada** — cai no env. Protege o intervalo entre o
   deploy do código e a migração rodar.

— promovido em 2026-08-02 pelo Diretor · origem: construção da tela `/admin/meta`,
verificada com `tsc` limpo e 4601 testes verdes

---

## A tela diz "Ativo" com o token MORTO

O selo **"Conectado / Ativo"** não prova nada. Um token expirado há dias continua
exibindo o mesmo selo — foi assim que um cliente ficou sem receber DM nenhuma
desde 23/07 sem ninguém notar.

**Os sinais reais**, no card *Diagnóstico*: **"Conta conectada: pendente"** e o
**"Último Direct recebido"** parado.

Nunca use o selo como evidência de saúde de credencial.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §e (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala

---

## Token de IG morto só volta por reconexão manual. E a ordem importa.

- **Refrescar por API não funciona:** `ig_refresh_token` exige token **ainda vivo**,
  com ≥24h e não expirado. Token morto não tem conserto por API.
- **`graph-check?subscribe=true` também não resolve** com o token expirado —
  reassinar o webhook exige token válido (senão dá OAuthException 190).

**A ordem obrigatória é:** o dono reconecta pela UI (login pessoal do Instagram) →
**só então** resubscribe, se ainda faltar.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §c (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala

---

## O token curto é o bug; a expiração é só o sintoma

A conexão de 25/07 nasceu com token **curto** — durou ~1h40, quando um long-lived
dura **60 dias**.

**Ao reconectar qualquer Instagram, confira imediatamente com `graph-check` a
validade do novo token.** Se vier ~60 dias, está certo. **Se vier curto de novo, a
troca `ig_exchange_token` está falhando em produção — e é aí que está o defeito**,
não na expiração.

*Não confirmado* qual das duas causas: a troca falhou nas 3 tentativas daquele dia,
ou o fix `115d357` ainda não estava deployado em 25/07.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §f.1 (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala

---

## `136024` se disfarça de erro temporário e é permanente

O provisionamento de número novo devolve `136024` / `error_subcode 2388091` com a
mensagem *"Our servers are temporarily unavailable. Please wait 1 hour"* — mas o
campo `is_transient` vem **`false`**.

**Não trate como retry-able.** Repetir de hora em hora não resolve, e já consumiu
uma sessão inteira de tentativas idênticas.

Causa mais provável: **o chip ainda tem conta WhatsApp ativa**. O destravamento é
apagar a conta no aparelho e esperar ~1h. *Não confirmado.*

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §c e §e (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala

---

## A sequência completa de um número novo — não está junta em lugar nenhum

```
add → request-code → verify-code
    → POST /api/admin/meta/register  (PIN 2FA)  ← endpoint SEPARADO
    → subscribeAppToWaba
    → activate / enableCrm  (rotear o CRM pro número novo)
    → SÓ ENTÃO liberar o número antigo pro celular
```

⚠️ **`provision` NÃO tem ação `register`.** As ações válidas são
`add | delete | request-code | verify-code | status`. O registro com PIN é o
endpoint separado acima — isto já foi dito errado numa sessão e fica corrigido
aqui.

⚠️ **`provision action:"delete"` é destrutivo** (libera slot na WABA). Existe guarda
para nunca apagar o número LIVE do restaurante, mas confirme o `phoneNumberId`
mesmo assim.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §e e §f.2 (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala

---

## Diagnósticos read-only que existem de verdade

Autenticação: header `x-admin-secret` == env `ADMIN_SECRET`.

| Rota | Para quê |
|---|---|
| `GET …/integrations/instagram?restaurantId=` | mode, paused, `lastWebhookAt`, `lastError` |
| `GET …/instagram/graph-check?restaurantId=[&subscribe=true]` | `tokenValid` e `subscribedApps` — **precisa conter `messages`**; `subscribe=true` reassina |
| `GET …/instagram/env-diagnostic` | quais env vars existem (só nomes) + URIs |
| `POST …/instagram/diagnostic` | checagem hermética de assinatura/parser |
| `POST /api/cron/instagram/refresh-tokens` | refresh manual — **só em token vivo ≥24h** |
| `POST /api/admin/meta/provision` `action:"status"` | campos ao vivo do número |

⚠️ **Rota inexistente devolve o HTML do app, não 404 JSON.** Adivinhar endpoint por
GET não funciona — use os de cima, que existem.

O token do IG é **criptografado em repouso e nunca retornado pela API**. O
`graph-check` descriptografa no servidor só para bater na Graph, e não loga o token.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §e e §f.4 (commit `18a5ed7`)
· movido da sala `canais` em 2026-08-01, na criação desta sala
