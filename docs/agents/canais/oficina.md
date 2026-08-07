# Oficina — canais

> Append-only. Escrita pelo especialista. O Diretor promove o que virar vitrine.

---

## 2026-08-04 · Extração total da Evolution — o resto do sistema

**Ordem:** CEO, repetida três vezes — "EXTRAÇÃO TOTAL, NÃO QUERO UM CÓDIGO DESSA
EVOLUTION DENTRO DO FOOCCI". Não questionei; executei.

**Escopo meu:** `src/services/ai/**`, `src/services/whatsapp/ordering/**` e o resto
de `src/services/whatsapp/**`, `src/services/buildos/**`, as rotas
`/api/evolution/*` e `/api/webhooks/evolution`, `src/lib/evolution/**`,
`src/services/evolution/**`, `src/validators/evolution.ts` e as telas de QR.
Outros especialistas já tinham portado envio, `activeProvider`, `order/**`,
`integrations/` e `whatsapp/brain/**`.

### A checagem de paridade do webhook (o ponto que mais importava)

`docs/decisoes.md` registrava que os dois webhooks **não eram simétricos**.
Confiri item por item antes de apagar o da Evolution:

| Item do webhook da Evolution | Já existia na Meta? | O que fiz |
|---|---|---|
| dedupe por id de mensagem | sim | nada |
| status de entrega (delivered/read/failed) | sim | nada |
| criar/reaproveitar conversa | sim | nada |
| **upsert de Customer** | **NÃO** — só `findFirst` | **portei.** Sem `customerId` o opt-out era pulado |
| opt-out (PARAR/SAIR/STOP) | sim (`InboundGuardsService`) | nada — mas dependia do item acima |
| atribuição de receita do CRM | sim (`InboundGuardsService`) | nada |
| resgate de carrinho → humano | sim (`InboundGuardsService`) | nada |
| política central de IA (trava Staff/Fornecedor) | sim (`InboundGuardsService`) | nada |
| **pedido por texto (roteamento + motor + fallback)** | **NÃO** | **portei** → `InboundAgentDispatch` |
| **`agentMode` (AI_ORDERING_EXPERIMENTAL / MENU_ONLY)** | **NÃO** | **portei** → `InboundAgentDispatch` |
| **recepcionista para mídia/áudio** | **NÃO** (só Cérebro, só texto) | **portei** |
| **rastro `[WA-TextOrdering]`** | **NÃO** | **portei** |
| **comandos do Build OS** | **NÃO** | **portei** → `interceptBuildOsCommand` + `BuildOsMetaChannel` |
| reabrir conversa RESOLVED < 24h | NÃO | **não portei** — a Meta cria conversa nova. Diferença aceita, registrada |
| **eco `fromMe` (atendente responde do celular) → HUMAN_EXTERNAL + `handoffAlarmAckAt`** | **NÃO** | **NÃO PORTADO — ver abaixo** |
| `connection_update` → desativar instância | n/a | não existe na Meta (não há instância) |

### O único item sem paridade, dito sem maquiagem

O eco de coexistência (`smb_message_echoes`). Na Evolution, resposta dada pelo
celular do atendente entrava na Central como `HUMAN_EXTERNAL` **e** carimbava
`handoffAlarmAckAt` — foi assim que se matou o crônico "apita e não para".

Não portei porque **o formato do payload da Meta nunca foi validado contra um
evento ao vivo** (o próprio comentário no código dizia isso). Escrever no banco a
partir de formato adivinhado cria mensagem fantasma na conversa do cliente e
silencia alarme que deveria tocar — guardrail 5: a proteção não pode ser mais
destrutiva que o problema.

O que fiz em vez disso: o webhook **reconhece e loga o evento com as chaves do
payload** (guardrail 6 — a evidência necessária para implementar depois), e
`src/lib/alarm-contract.test.ts:43` trava o estado honesto em vez de o teste ser
apagado. Custo real, para o CEO decidir: resposta dada pelo celular não aparece na
Central e não silencia o alarme.

### O que apaguei

`src/app/api/evolution/**` (14 rotas) · `src/app/api/webhooks/evolution` ·
`src/lib/evolution/**` · `src/services/evolution/**` · `src/validators/evolution.ts` ·
`src/services/buildos/{AdminWhatsAppConfigService,BuildOSMasterChannelService,BuildOSInstanceHealthService}.ts` ·
`/api/admin/build-os/master-channel/{qr,sync,reset}` ·
`/api/admin/build-os/diagnostics/instance-health` ·
`WhatsAppIntegrationClient.tsx` (1.884 linhas, já não renderizado) ·
o `WhatsAppQRPanel` e o formulário de credenciais do Centro de Integrações ·
`getExpectedEvolutionWebhookUrl()` · a entrada do webhook morto no `middleware.ts` ·
**`POST /api/integracoes/whatsapp/meta/provider`**.

### Duas coisas que aprendi e quero na vitrine

**1 · Com um provedor só, o botão de "voltar" vira botão de emudecer.**
`/api/integracoes/whatsapp/meta/provider` deixava o lojista gravar
`whatsappProvider = "EVOLUTION"`. Depois da extração isso não é "voltar para o
canal anterior": é escolher *nenhum canal*, sem erro visível na tela. O mesmo vale
para a rota genérica `PUT/DELETE /api/integrations/whatsapp`, que gravava e
apagava credencial — agora recusa com mensagem que aponta o caminho certo, em vez
de 404 mudo. **Toda alternância de provedor tem que morrer junto com o segundo
provedor**, ou ela vira um interruptor de silêncio.

**2 · Quando a fonte de evidência morre, o painel não pode herdar o silêncio dela.**
O diagnóstico do Build OS respondia "meu /build chegou?" lendo
`EvolutionWebhookEventLog` — o log bruto de todo evento. A Meta **não grava log
bruto**, e não há tabela equivalente. Se eu simplesmente trocasse a fonte pelo
rastro do Build OS, "rastro vazio" passaria a ser lido como "a Meta parou de
entregar" — que é exatamente o guardrail 1 ao contrário. Deixei o campo dizer
explicitamente *o que ele não prova*, e as duas causas possíveis lado a lado, sem
escolher uma pelo silêncio da outra.

### Decisões que tomei e o CEO precisa saber

- **O canal Master do Build OS virou número dedicado da Meta**, por variável de
  ambiente (`BUILDOS_META_PHONE_NUMBER_ID` + `BUILDOS_META_ACCESS_TOKEN`), no mesmo
  molde do número de suporte. **Enquanto elas não forem definidas, `/build` por
  WhatsApp não funciona** — os scripts (`buildos:bootstrap`, `buildos:verify`,
  `buildos:test-command`) continuam valendo. Registrar o número dentro do
  aplicativo da Meta é trabalho do `meta` + decisão do CEO.
- **Mídia antiga recebida pela Evolution não abre mais.** Sem `metaMediaId` não há
  de onde baixar o blob. A rota devolve 404 declarado (não 500) e loga o caso; a
  mensagem continua visível na Central, só o anexo não abre.
- **Onde havia "existe config da Evolution?" agora é "existe config da Meta?"**, e
  ausência **falha fechado**: recepcionista e `AIOrderService` abortam o turno com
  log em vez de seguir. O `AIOrderService` devolve a conversa para `OPEN` — nada
  fica preso em `BOT`.

### O que NÃO toquei, de propósito

- `normalizePhoneForEvolution` / `isValidEvolutionPhone` (`src/lib/crm/normalizePhone.ts`)
  — é o normalizador de telefone BR do projeto inteiro, hoje no caminho de envio da
  META. O Diretor renomeia em passo separado.
- `cartEvolution` (`AISimulatorService`) — é "evolução do carrinho", não o provedor.
- Modelos `EvolutionConfig` e `EvolutionWebhookEventLog` no Prisma — apagar exige
  migração e destrói histórico. **Nenhum código lê mais essas tabelas.** Decisão de
  quando dropar é do CEO/Diretor.
- `Restaurant.whatsappProvider` — a coluna existe com valores antigos e **não decide
  mais nada**. O `status` da tela devolve `META_CLOUD_API` fixo, porque ler do banco
  daria ao painel uma resposta que o envio não obedece.
- `src/services/crm/**` e `src/services/quality/**` — de outros especialistas. As
  4 ocorrências restantes de `EvolutionClient|EvolutionConfigService|EvolutionApiError`
  são 1 nota histórica deliberada + 3 asserções **negativas** em teste (`not.toMatch`),
  que são armadilhas anti-reintrodução — não sobra nenhum import vivo.

### Verificação

- `npx tsc --noEmit` — **limpo**.
- `npx vitest run src/services/whatsapp/ src/services/ai/ src/services/buildos/` —
  **78 arquivos, 1.514 testes, verde**. Os 2 vermelhos do início eram meus
  (`WhatsAppBrainRuntimeService.test.ts` e `WhatsAppFallbackGuard.test.ts`) e foram
  **reescritos para a Meta**, não deletados.
- Suíte inteira: **379/380 arquivos verdes**. O único vermelho
  (`src/services/quality/noSideEffects.test.ts`, timeout de 5s) **falha igual no
  baseline sem as minhas mudanças** — confirmado com `git stash`.
- `grep -rl "EvolutionClient\|EvolutionConfigService\|EvolutionApiError" src` → **4**
  (era 13 no meio do trabalho; nenhum é import vivo).

### Arquivos novos que criei

- `src/services/whatsapp/inbound/InboundAgentDispatch.ts` — a paridade de quem responde.
- `src/services/whatsapp/inbound/tests/InboundAgentDispatch.test.ts` — 12 travas.
- `src/services/buildos/BuildOsMetaChannel.ts` — o canal Master na Meta.
- `src/app/api/admin/build-os/master-channel/route.ts` — só leitura, substitui o provisionador.

---

## 2026-08-07 · A Central não sabe que o Instagram existe como canal vivo

Pedido do CEO: *"por que o Instagram não conecta com a central de atendimentos"*.
Recorte: **a tela**, não o token (esse é do `meta`, que apurou `lastWebhookAt`
congelado em 23/07/2026 12:23 UTC).

### O que li

- `src/app/(dashboard)/atendimento/AtendimentoClient.tsx` (2561 linhas)
- `src/app/(dashboard)/atendimento/page.tsx`
- `src/app/api/chat/conversations/route.ts`
- `src/services/conversation/conversationListFilter.ts`
- `src/services/conversation/MessageService.ts:114-146`
- `src/services/instagram/InstagramChannelService.ts:53-120, 365-409`
- `src/services/instagram/InstagramSendClient.ts:34-45`
- `src/services/instagram/InstagramConfigService.ts:110-224`
- `src/app/api/integrations/instagram/route.ts:54-96`
- `src/app/(dashboard)/integracoes/instagram/InstagramIntegrationClient.tsx:294-344`

### Achados

1. **A Central RENDERIZA Instagram corretamente.** `CHANNEL_META` cobre
   `INSTAGRAM_DIRECT`/`INSTAGRAM_COMMENT`/`MESSENGER` (linhas 163-173), a aba
   "📷 Instagram" existe (181) e `buildConversationWhere` **não filtra canal por
   padrão** — nenhum canal é excluído da consulta. Se um DM chegasse hoje, ele
   apareceria. **O defeito não é de renderização.**

2. **A janela é de 100 e não tem "carregar mais".** `fetchList` manda
   `limit: "100"`, sempre `page` 1 (AtendimentoClient:432). O backend busca 400,
   deduplica por cliente e corta em 100 (route.ts:133,167). **Busca e filtro de
   Instagram rodam client-side sobre essas 100** (699-708, 726-728). Conversa de
   Instagram de 23/07 ou antes só aparece se estiver entre as 100 mais recentes por
   `lastMessageAt`. Com 15 dias de WhatsApp em cima, ela cai fora — e a aba diz
   "Nenhuma conversa encontrada". **Isto é defeito de tela e é meu.**

3. **A Central é cega para saúde de canal.** Zero referências a
   `/api/integrations/*`, `lastWebhookAt`, `lastError` ou status de conexão em
   AtendimentoClient. O vazio genérico está em 1142-1152. Um canal morto e um
   canal sem movimento são **a mesma tela**. É o mesmo defeito que segurou isto 15
   dias sem ninguém ver.

4. **O selo verde não tem prazo de validade.**
   `src/app/api/integrations/instagram/route.ts:58` —
   `status = "active"` exige apenas `view.lastWebhookAt` **não-nulo**. Carimbo de
   15 dias vale igual a carimbo de 1 minuto. A Central não consome esse selo (ver
   3), então ela não mente junto — ela simplesmente não olha.

5. **Bônus fora do token: responder pelo Instagram vem DESLIGADO de fábrica.**
   `instagramLoginOAuth.ts:378` grava `mode: "RECEIVE_ONLY"` na conexão;
   `InstagramChannelService.ts:378-380` recusa qualquer resposta manual nesse modo
   ("Modo somente recebimento", 502 em `MessageService.ts:129`). Mesmo com token
   saudável, o lojista **não responde da Central** até apertar "Ativar resposta
   manual" em Integrações. A Central não avisa isso em lugar nenhum.

6. **Guardrail 2 (nada preso para sempre):**
   `InstagramChannelService.ts:398` e `:467` persistem o outbound com
   `externalStatus: "pending"` quando `send.dryRun` — inclusive no caso "token
   ausente" (`InstagramSendClient.ts:38-40`), que é **permanente**, não transitório.
   Não há retentativa nem prazo: a mensagem fica `pending` eternamente. Deveria ser
   `failed`. Não corrigi (não foi pedido); fica registrado.

### O que NÃO consegui medir

- **Não há Instagram conversation contável.** `DATABASE_URL` local aponta para
  `localhost:5432` (fora do ar) e o `ADMIN_SECRET` desta caixa devolve **401** em
  `https://foocci.com.br/api/admin/restaurants`. Produção responde
  (`commitSha ccc621a`), mas eu não tenho chave. **Não consegui medir** quantas
  conversas de Instagram existem no banco nem a posição delas na janela de 100.

### Não fiz

Nenhuma mensagem enviada. Nada tocado em token, segredo, permissão ou App Review.
Nenhum arquivo de código alterado, nenhum commit, nenhum push.

### Proposta de vitrine

**"A Central de Atendimento não tem noção de canal morto"** — ela consulta todos os
canais sem filtro, mas a janela é de 100 conversas sem paginação, o filtro de
Instagram é client-side sobre essa janela, e não existe nenhum aviso de saúde de
canal. Canal desconectado e canal parado produzem a **mesma tela vazia**.
Corolário: **"aba de canal vazia na Central nunca é evidência de que o canal está
bem"** — é a versão forte da entrada de 01/08 sobre o filtro client-side.
Proveniência: apuração 2026-08-07, código em `ccc621a`, arquivos acima.
