# Vitrine — canais

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---

## A tela de Instagram diz "Ativo" com o token MORTO

O selo **"Conectado / Ativo"** não prova nada. Um token expirado há dias continua
exibindo o mesmo selo — foi assim que um cliente ficou sem receber DM nenhuma
desde 23/07 sem ninguém notar.

**Os sinais reais**, no card *Diagnóstico*: **"Conta conectada: pendente"** e o
**"Último Direct recebido"** parado.

Nunca use o selo como evidência de saúde de canal.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §e (commit `18a5ed7`)

---

## Token de IG morto só volta por reconexão manual. E a ordem importa.

- **Refrescar por API não funciona:** `ig_refresh_token` exige token **ainda vivo**,
  com ≥24h e não expirado. Token morto não tem conserto por API.
- **`graph-check?subscribe=true` também não resolve** com o token expirado —
  reassinar o webhook exige token válido (senão dá OAuthException 190).

**A ordem obrigatória é:** o dono reconecta pela UI (login pessoal do Instagram) →
**só então** resubscribe, se ainda faltar.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §c (commit `18a5ed7`)

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

---

## O filtro "📷 Instagram" da Central é client-side

Em `AtendimentoClient.tsx` (~linha 725), o filtro roda **sobre a janela já
carregada** — não faz busca no banco só de Instagram.

**Aba vazia ≠ "não existe conversa de Instagram".** Pode ser só que nenhuma esteja
na janela recente. Não conclua ausência a partir dela.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §e (commit `18a5ed7`)

---

## Por que uma DM não entrou — a ordem de causas

O webhook `POST /api/webhooks/instagram` loga uma linha **`[ig-wh]`** por payload,
com `resolved / persisted / skippedNonMessage / skippedNotAllowlisted /
skippedDuplicates`. Comece por ela.

Ordem das causas, conforme `InstagramChannelService.handleWebhookEvent`:

1. assinatura inválida (403)
2. payload não é DM de Instagram
3. sem `accountId`
4. `accountId` não resolve nenhuma config (`resolved: false`)
5. `mode: DISABLED` ou `paused`
6. evento de echo / delivery / read / reaction
7. mensagem sem texto **e** sem anexo
8. remetente fora do allowlist — **só quando `scope ≠ RESTAURANT_WIDE`**

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-canais-meta.md` §f.5 (commit `18a5ed7`)

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

---

## A Evolution é o default E o fallback — não é só "o padrão"

Em `src/services/whatsapp/activeProvider.ts`: sem
`whatsappProvider === "META_CLOUD_API"` cai na Evolution, **e qualquer erro de
banco no lookup também cai na Evolution**.

Ela é a rede de segurança do envio, não uma opção entre duas. Removê-la sem
substituir os dois caminhos derruba o envio quando o banco tossir.

**E a Meta só é usada quando `metaCrmEnabled && connectionStatus === "CONNECTED"`.**
Um restaurante "com Meta configurada" que não esteja `CONNECTED` continua na
Evolution — não conclua pelo nome do campo.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §e (commit `cfc346c`)

---

## Os dois webhooks de entrada NÃO são simétricos

Confirmado por leitura do código:

| Webhook | Linhas | O que carrega |
|---|---|---|
| `api/webhooks/meta/whatsapp/route.ts` | ~225 | **só Brain** + suporte |
| `api/webhooks/evolution/route.ts` | ~274 | pedido por texto, opt-out, carrinho, atribuição, **BuildOS** |

O comentário no código da Meta diz *"feed the same agent pipeline"*. **Hoje "the
same pipeline" é só o Brain.** Quem ler o comentário e acreditar vai concluir que
há paridade — e não há.

**Não há caminho BuildOS pela Meta hoje.** Ele é dirigido por scripts
(`buildos:bootstrap`, `buildos:verify`, `buildos:test-command`) **e por comandos que
chegam pelo webhook da Evolution**.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-painel-e-evolution.md` §e e §f (commit `cfc346c`)

---

## O card de avaliação do Google "disponível" não significa dado real

Se a API v4 do Meu Negócio não estiver liberada para o projeto, o card mostra um
**aviso âmbar educado** — que é fácil confundir com *"ainda não tem avaliação"*.

**Leia a mensagem antes de concluir que não há avaliações.**

E a fonte de verdade sobre a configuração é o **verificador embutido** em
Integrações → Google → **"Avançado"** — mais confiável que adivinhar o que está
setado no Railway. Antes de investigar "por que não conecta", olhe ali primeiro.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-google.md` §7 (commit `06bfaf3`)

---

## A Google Cloud Console mudou — os tutoriais antigos não batem mais

Agora é **"Google Auth Platform"**, com menus: *Visão geral / Branding /
Público-alvo / Clientes / Acesso a dados / Central de verificação / Configurações*.
Não existe mais a "Tela de consentimento OAuth" como uma tela única.

⚠️ **O campo de escopo fica DENTRO do painel "Adicionar ou remover escopos"** (que
abre ao lado, com um campo "adicionar manualmente" no fim) — **não é a barra de
busca do topo do console.** O CEO já colou o escopo na busca errada uma vez; é um
erro fácil de repetir, e vale avisar antes.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-google.md` §8 (commit `06bfaf3`)

---

## A rota de QR tem OITO formatos de resposta — e o `else` já mentiu por causa disso

> ✅ Os dois painéis foram alinhados em 02/08. A regra abaixo é o que fica.

`/api/evolution/qr` responde:

| Formato | Significa |
|---|---|
| `{ base64 }` | imagem de QR pronta |
| `{ pairingCode, code }` | código de pareamento, **sem imagem** |
| `{ connected: true }` | **a única coisa que prova conexão** |
| `{ generating: true }` | ainda produzindo — **espere, continue perguntando** |
| `{ restarting: true }` | idem |
| `{ error: "not_configured" }` | faltam credenciais |
| `{ error: "instance_not_found" }` | instância apagada no provedor |
| `{ error: "qr_shape_unknown" \| "evolution_error" }` | falha declarada |

Um painel tratava só `base64` e usava o `else` como sucesso. Resultado: **código de
pareamento e "ainda gerando" viravam "WhatsApp já está conectado!"** para um
lojista que não tinha conectado nada.

É o guardrail 1 dentro da interface: **ausência de imagem não é informação de que
conectou.**

**Ao mexer em qualquer painel de canal:**

1. Trate cada formato explicitamente.
2. **Nunca** use `else` como sucesso — estado desconhecido é estado desconhecido, e
   a tela deve dizer isso ao lojista.
3. Separe "espere" de "acabou": tratar transitório como final para o polling e
   congela o lojista num estado errado.

Travado por `src/app/api/evolution/qr/route.contract.test.ts`.

— promovido em 2026-08-01, atualizado em 02/08 pelo Diretor · origem:
`HANDOFF-railway-build-e-ui-promocoes.md` + a correção do próprio painel

---

## `WhatsAppQRPanel` renderiza sem olhar se a integração está ativa — de propósito

A prop `isActive` foi **removida deliberadamente**. O painel precisa aparecer
justamente quando a integração está *"Não configurado"* — é ali que o lojista vai
conectar. Se você encontrar `WhatsAppQRPanel({ isActive })` num branch antigo, não
restaure: a remoção foi a correção.

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff (commit `edf8b86`)
