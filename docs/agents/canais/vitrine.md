# Vitrine — canais

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---

## 🔑 O que é do aplicativo Meta mudou de sala

Em 2026-08-01, por decisão do CEO, o **aplicativo dentro da Meta ganhou
especialista próprio** (`meta`). Seis entradas desta vitrine foram para
`docs/agents/meta/vitrine.md`, com a proveniência preservada:

- a tela que diz "Ativo" com o token morto
- token de IG morto só volta por reconexão manual, e a ordem importa
- o token curto é o bug; a expiração é só o sintoma
- `136024` se disfarça de temporário e é permanente
- a sequência completa de um número novo
- os diagnósticos read-only que existem de verdade

**A fronteira: o `meta` cuida da CHAVE; você usa a PORTA.** Credencial, permissão,
token, registro de número e assinatura de webhook são dele. Mensagem que entra e
sai, roteamento, provedor e risco de bloqueio do número continuam seus.

Na dúvida: *"isso quebra WhatsApp e Instagram juntos?"* Se sim, é do `meta`.

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

## São DOIS painéis de QR do WhatsApp vivos — e só um está certo

| Arquivo | Trata `pairingCode`? |
|---|---|
| `integracoes/whatsapp/WhatsAppIntegrationClient.tsx:210` | **sim** — ramo próprio, mostra o código |
| `integracoes/IntegrationsCenterClient.tsx:337-345` | **não** — cai em `"connected"` |

A rota `/api/evolution/qr` tem **três formatos de resposta**, não dois:

```
{ base64: "…" }              → imagem de QR
{ pairingCode: "ABCD-EFGH", code: "…" }   → código de pareamento, SEM imagem
{ error: "…" }               → falha
```

Quem só testa `base64` e usa o `else` como "conectado" **inventa uma conexão que
não existe**. É o guardrail 1 dentro da interface: ausência de imagem não é
informação de que conectou.

**Ao mexer em qualquer painel de canal:** trate os três formatos explicitamente e
**nunca** use `else` como estado de sucesso. Estado desconhecido é estado
desconhecido.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-railway-build-e-ui-promocoes.md`,
verificado na branch de produção

---

## `WhatsAppQRPanel` renderiza sem olhar se a integração está ativa — de propósito

A prop `isActive` foi **removida deliberadamente**. O painel precisa aparecer
justamente quando a integração está *"Não configurado"* — é ali que o lojista vai
conectar. Se você encontrar `WhatsAppQRPanel({ isActive })` num branch antigo, não
restaure: a remoção foi a correção.

— promovido em 2026-08-01 pelo Diretor · origem: mesmo handoff (commit `edf8b86`)
