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

## ~~A rota de QR tem OITO formatos de resposta~~ — rota apagada em 04/08/2026

> **Caducou.** A rota de QR e o pareamento saíram junto com a Evolution: a Meta
> não usa QR. A entrada fica como lição de forma — *uma rota com muitos formatos
> de resposta faz o `else` mentir* —, mas o caso concreto não existe mais.

### O caso original

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

## Prova por peça não é prova de caminho

**Promovido por:** Diretor do Foocci · **Data:** 2026-08-15 · **Origem:** a
conferência de fechamento da saída da Evolution · **Commit:** este bloco

A paridade Evolution → Meta foi feita em quatro módulos, cada um com suíte própria
e verde. Faltava a prova que ninguém tinha pedido: **um teste que atravessa o
caminho inteiro**, do POST assinado da Meta até a resposta saindo no WhatsApp do
cliente.

Por que isso importa aqui, e não é preciosismo: **o defeito histórico deste canal
foi exatamente um caminho que não se ligava.** O webhook da Meta tinha, escrito no
comentário, *"feed the same agent pipeline Evolution uses"* — e não alimentava.
Opt-out, atribuição de CRM, resgate de carrinho e a política de IA ficavam de fora.
Todos os testes de unidade das peças passavam. **Nenhum deles podia pegar isso.**

**A regra:** quando a migração é "o caminho A passa a ser o caminho B", o
entregável não é a peça portada — é o teste que percorre B de ponta a ponta. E ele
tem as duas metades: o caso que roteia **e** os que não roteiam sem deixar o
cliente mudo (fora da allowlist, modo em sombra, conversa com humano, kill switch).

**Corolário para o relatório:** enquanto esse teste não existe, o estado honesto da
migração é *"portado, não provado"* — nunca *"pronto"*.
