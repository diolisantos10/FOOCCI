# Vitrine — aplicativo Meta

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
>
> Esta sala nasceu em 2026-08-01, por decisão do CEO, quando ficou claro que o
> aplicativo dentro da Meta é **um só** — serve WhatsApp e Instagram ao mesmo
> tempo — e carrega as credenciais que permitem fazer qualquer coisa em nome da
> Foocci. As seis entradas abaixo **vieram da sala `canais`**, com a proveniência
> original preservada. A fronteira: **`meta` cuida da chave; `canais` usa a porta.**

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
