# Estado do Foocci — diagnóstico de 28/08/2026

> Pedido do Diretor Geral (Control Room): três fios abertos, **medidos, não
> opinados**. Volta de diagnóstico: **custo zero, nada tocado em produção**.
> Nenhum dado de cliente alterado, nenhuma mensagem enviada, nenhum pagamento
> registrado, nada apagado.
>
> Este arquivo é a fonte. O que subir ao CEO vira página, não `.md`.

---

## Conclusão primeiro

| # | Fio | Veredito | Gravidade |
|---|---|---|---|
| 1 | Cópia de segurança dos bancos | **Não existe cópia contínua em nenhum dos três bancos.** Provado mecanicamente. E há uma atualização automática de imagem armada para **sábado 29/08 às 10h UTC** — daqui a ~31h. | 🔴 |
| 2 | Cliente sem resposta no Sushi Cazza | **Não sei qual causa foi — a prova está no banco.** Mas achei **14 saídas** por onde o cliente fica sem resposta, **8 sem log nenhum**. E quem cai em atendimento humano **nunca volta sozinho para a IA**. | 🔴 |
| 3 | Teto do agente solto | **Nenhuma das três hipóteses: é desenho de produto.** Não existe limite de volume no código. O menu atende 20 de cada 21 turnos, por decisão. E **4,3 são respostas, não conversas** — o número de conversas nunca foi medido. | 🟡 |

---

## 1. 🔴 A cópia de segurança

### 1.1 O que eu esperava achar, e o que achei

O Control Room falou em **dois** bancos Postgres com aviso de segurança. São
**três**, e vale corrigir o número antes de qualquer decisão:

| Banco | Projeto Railway | Disco | Tráfego (7 dias) | O que é |
|---|---|---|---|---|
| `Postgres` | Foocci (`7c94833c`) | **0,852 GB** | ativo — TX médio 1,7 MB, pico 103 MB | **O banco vivo.** É este que tem cliente pagante dentro. |
| `Postgres-76OG` | Foocci (`7c94833c`) | 0,349 GB | **rigorosamente zero** | Órfão. Ninguém lê, ninguém escreve. |
| `Postgres` | Foocci Manager (`c2750840`) | 0,238 GB | quase zero, mas **disco crescendo** | Semi-vivo. Alguma coisa escreve nele. |

**Como medi qual é o vivo** (isto importa, porque não pude ler o `DATABASE_URL`
— ver §1.5): `get-service-metrics`, janela de 168 horas, 10.081 amostras por
banco.

- `Postgres-76OG`: `NETWORK_RX_GB` e `NETWORK_TX_GB` com **min = max = média = 0**
  nas 10.081 amostras. Disco **constante em 0,34873344 GB** — o mesmo número em
  todas as amostras, sem um byte de variação em sete dias. Isso não é "pouco
  movimento": é ausência de movimento.
- `Postgres` (projeto Foocci): disco variando de 0,84221952 a 0,852426752 GB na
  mesma janela, com CPU e rede ativas. É o banco de produção.

Isso **confirma e atualiza** o que o Diretor anterior registrou em
`docs/passagem-de-bastao-foocci-2026-08-05.md:155` — *"esse banco segue de pé,
ocioso (0,35 GB, tráfego zero)"*. Continua verdade 23 dias depois. Ele também
escreveu, com honestidade, *"nunca confirmei que ele é mesmo o banco da
Evolution — a `DATABASE_CONNECTION_URI` vinha redigida. **Não sei.**"* **Eu
também não sei**, e pelo mesmo motivo. O que sei a mais é que segue com zero
tráfego.

### 1.2 A prova de que não há cópia contínua

Não é dedução, é mecânica. A documentação do Railway
([Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery))
descreve o que acontece quando o PITR é ligado:

> *"Sets `WAL_ARCHIVE_*` env vars on the Postgres service"* — e cria um bucket
> chamado `Postgres-PITR`.

Ou seja: **PITR ligado deixa rastro obrigatório nas variáveis do serviço.** As
variáveis dos três bancos, lidas via `get-service-config`, são idênticas e
completas:

```
DATABASE_PUBLIC_URL, DATABASE_URL, PGDATA, PGDATABASE, PGHOST, PGPASSWORD,
PGPORT, PGUSER, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER,
RAILWAY_DEPLOYMENT_DRAINING_SECONDS, SSL_CERT_DAYS
```

**Nenhuma variável `WAL_ARCHIVE_*`. Em nenhum dos três.**

→ **PITR está desligado nos três bancos.** Não há arquivamento contínuo de WAL,
não há backup base semanal, não há incremental diário, não há janela de restauração
de ~4 semanas. Se o banco vivo se perder agora, não existe ponto no tempo para
onde voltar por esse caminho.

### 1.3 O que torna isto urgente esta semana

Os três bancos têm **auto-atualização por vulnerabilidade armada**:

```
cveId:          CVE-2026-15741
severity:       HIGH
targetImage:    ghcr.io/railwayapp-templates/postgres-ssl:18
currentVersion: 18.4
armedAt:        2026-08-24  (24/08, há 4 dias)
schedule:       dia 6 (sábado) 10h–24h  ·  dia 0 (domingo) 0h–18h
```

Hoje é **sexta-feira, 28/08/2026, 03h UTC**. A janela abre **sábado 29/08 às 10h
UTC** — daqui a **cerca de 31 horas**. Nessa janela o Railway troca a imagem dos
três bancos e os reinicia, sozinho.

Trocar imagem de Postgres é operação rotineira e quase sempre passa sem
incidente. Mas ela é, por definição, **o momento em que o banco para e sobe de
novo** — e é exatamente aí que se descobre se havia cópia. Fazer isso sem
backup, com cliente faturando em cima, é correr o único risco que não dá para
desfazer depois.

**Isto não é motivo para desarmar a atualização.** O CVE é HIGH e os dois bancos
do projeto Foocci estão **abertos para a internet** (§1.4). Desarmar troca um
risco por outro, pior. O que falta é a rede embaixo, não tirar o arame.

### 1.4 Os dois bancos do projeto Foocci estão expostos à internet

Ambos têm proxy TCP ativo na porta 5432:

| Banco | Endpoint público |
|---|---|
| `Postgres` (vivo) | `autorack.proxy.rlwy.net:38237` → 5432 · `syncStatus: ACTIVE` |
| `Postgres-76OG` (órfão) | `yamanote.proxy.rlwy.net:11498` → 5432 · `syncStatus: ACTIVE` |

Qualquer máquina do mundo alcança esses dois endereços. A única barreira é a
senha do Postgres. Some-se a isso o CVE HIGH ainda não corrigido, e o órfão —
que ninguém usa, ninguém observa, e cuja porta está tão aberta quanto a do banco
vivo. **Órfão exposto é a pior combinação que existe:** superfície de ataque sem
dono e sem ninguém olhando.

Não afirmo que houve invasão. Não tenho como saber — ver §1.5.

### 1.5 ⛔ O que eu NÃO consigo verificar, e por quê

*Ausência de informação não é informação.* Nada abaixo pode ser lido como "está
tudo bem".

| Não consigo verificar | Por quê | O que fecharia a lacuna |
|---|---|---|
| **Se existe agendamento de backup de volume** (diário/semanal/mensal) nos três bancos | O MCP do Railway não expõe leitura de agendamento de volume. Não há tool de listar backups. | Aba **Backups** de cada serviço no painel Railway, ou `railway postgres pitr status --service <nome>` |
| **Se existe algum backup já tirado**, e de quando | Mesmo motivo | Mesma aba **Backups** |
| **Qual banco o `DATABASE_URL` da aplicação aponta** | Sou app OAuth conectado: a API devolve `valuesRedacted: true`. Só recebo nomes de variável, nunca valores. | Painel Railway, ou token de conta |
| **O que tem dentro do `Postgres-76OG`** — se é mesmo o banco da Evolution, se tem dado de cliente | Sem credencial de banco. E consultar produção estava fora desta volta. | `psql` com credencial + `\dt`, uma leitura só |
| **Se alguém já entrou por aqueles dois endereços públicos** | Log de conexão do Postgres não é acessível por este caminho | Log do banco no painel Railway |
| **Qual é o segundo aviso do `Postgres-76OG`** (ele tem 2, o vivo tem 1) | `environment-status` devolve a contagem, não o texto | Painel Railway |

**Não instalei a CLI do Railway nem tentei autenticar** — não havia
`RAILWAY_TOKEN` no ambiente e obter um seria ação fora do combinado desta volta.

### 1.6 Duas saídas (regra de ouro do CEO)

O problema, em uma linha para quem decide: **o banco que fatura não tem cópia de
segurança, e ele vai reiniciar sozinho sábado de manhã.**

**Saída A — Ligar o PITR nos três bancos, antes de sábado. ✅ RECOMENDADA.**

- **O que destrava:** arquivamento contínuo a partir do momento em que liga.
  Backup base automático, incremental diário, completo semanal, janela de
  restauração de ~4 semanas. Restaurar cria um serviço novo ao lado — **o banco
  de produção nunca é tocado**.
- **O que custa:** dinheiro de verdade, pouco. Cobra por armazenamento do bucket
  e por saída de rede, tudo comprimido em zstd. Para 0,85 GB de banco com o
  movimento medido acima, é ordem de poucos dólares por mês. **Mas é gasto novo,
  e gasto novo é decisão do CEO** — não minha.
- **O que arrisca:** ligar redeploya o serviço do banco. Segundos de
  indisponibilidade, em horário escolhido. Risco baixo e controlável.
- **A pegadinha, e ela é séria:** *"the available restore window starts from the
  first post-enable base backup, not retroactively. If you enable PITR today, you
  can't restore to yesterday."* **Ligar sábado às 11h não protege o que existe
  hoje.** Só protege dali para frente. Por isso a ordem importa: ligar **antes**
  da janela de manutenção, não depois.

**Saída B — Tirar um `pg_dump` agora e guardar fora do Railway.**

- **O que destrava:** uma foto do banco inteiro, hoje, no bolso. É a rede
  embaixo do sábado, e é a única coisa que protege retroativamente.
- **O que custa:** nada em dinheiro. Alguns minutos, e uma credencial.
- **O que arrisca:** é foto, não filme — protege até o instante do dump e mais
  nada. E cria um arquivo com **todos os dados de todos os clientes** fora do
  Railway: se ele for parar num lugar errado, o remédio vira o problema. Onde
  guardar é decisão, não detalhe.

**A recomendação, dita por extenso: as duas, nesta ordem — B antes de sábado, A
logo em seguida.** Elas não competem, resolvem coisas diferentes. B cobre o
passado, que hoje está a descoberto e é o que se perde no sábado. A cobre o
futuro, e é a que faz o problema não voltar. Fazer só A deixa o histórico até a
data de ligação sem proteção nenhuma; fazer só B deixa a casa dependendo de
alguém lembrar de repetir o dump.

**Nenhuma das duas eu executei** — ambas custam dinheiro ou exigem credencial de
produção, e a volta era diagnóstico.

**Uma terceira, que descartei e por isso nomeio:** *desarmar a atualização
automática do CVE para ganhar tempo.* Descartada porque o CVE é HIGH e os bancos
estão publicamente acessíveis (§1.4) — adiar a correção aumenta a exposição real
para reduzir um risco de operação que o backup já resolve melhor. Trocar segurança
por conveniência quando existe uma saída que não pede essa troca é escolha ruim.

### 1.7 Uma coisa que eu achei que estava quebrada, e não está

Registro porque quase virou achado falso, e porque é uma **armadilha montada para
o próximo que olhar**.

`scripts/migrate-deploy.sh` diz no cabeçalho que está ligado via `railway.toml`
(*"config-as-code overrides the dashboard command"*). Já o `get-service-config`
do Railway devolve, para o serviço `FOOCCI`:

- `startCommand: "npm run start"` — e não `bash scripts/start-production.sh`
- `preDeployCommand: "npx prisma migrate resolve ... && npx prisma migrate deploy"` — o comando simples do painel, e não o script
- `builder: "RAILPACK"` — e não `NIXPACKS`, como o `railway.toml` declara

Pela doença crônica desta casa — *mecanismo pronto e nada o chamando* — isso
tinha cara de dois mecanismos de proteção mortos. **Fui conferir no log do deploy
em vez de concluir, e os dois estão vivos:**

```
2026-08-27T21:56:05Z  ── Pre-deploy migration ──────────────────────────
2026-08-27T21:56:10Z  ✓ migrate deploy ok (attempt 1)
2026-08-27T21:56:29Z  FOOCCI EMERGENCY MIGRATION RECOVERY START
2026-08-27T21:56:31Z  Step 2: running prisma migrate deploy...
```

As duas primeiras linhas só existem dentro de `scripts/migrate-deploy.sh`; as
duas últimas, só dentro de `scripts/start-production.sh`. **Os dois rodam.** O
`railway.toml` de fato vence o painel no pré-deploy, e `npm run start` chega no
`start-production.sh` pelo `package.json` (`"start": "bash scripts/start-production.sh"`).

**O que fica de aviso:** a API do Railway devolve os valores do painel, que estão
desatualizados e **discordam do que roda**. Quem auditar esse serviço por API vai
ver três divergências e concluir errado, como eu quase concluí. A regra que se
tira: *config-as-code não se confere no painel, se confere no log do deploy.*

**Um ponto fraco que fica declarado:** o `nixpacks.toml` diz que o
`start-production.sh` está *"baked into image CMD so it cannot be overridden by
Railway dashboard settings"*. O builder em uso é **Railpack**, não Nixpacks — e
o Railpack não lê `nixpacks.toml`. A garantia de "não pode ser sobrescrito" **não
existe**; o script roda pelo caminho do `package.json`, que é sobrescrevível.
Hoje funciona. Se alguém trocar o `startCommand` no painel, para de funcionar e
nada avisa. Não consertei — está fora do escopo desta volta.

---

## 2. O cliente sem resposta no Sushi Cazza

### 2.1 O veredito, e ele é honesto

**Não consigo dizer qual das causas produziu ESTE atendimento** — a evidência
está no banco de produção, e consultar produção estava fora desta volta. Isso é
declaração, não desculpa: *ausência de informação não é informação.*

**O que consigo dizer, e é o que importa:** achei **catorze saídas por onde uma
mensagem de cliente morre sem resposta**, e **oito delas não deixam rastro
nenhum no servidor**. Não é preciso saber qual disparou para saber que o sistema
tem por onde emudecer, e que na maioria dos casos ninguém ficaria sabendo.

O Sushi Cazza é o restaurante **no degrau mais alto** do raciocínio livre —
`RESTAURANT_WIDE` desde 12/07/2026 (`LiveStageHealth.ts:146`). Ou seja: todo
turno fora do menu vai para o **Cérebro**, e é justamente no ramo do Cérebro que
estão os silêncios mudos.

### 2.2 O caminho vivo da mensagem

```
Meta → POST /api/webhooks/meta/whatsapp
  route.ts:69   processMetaWebhook em try/catch → SEMPRE devolve 200 à Meta
  route.ts:276  findOrCreateConversation      · :284 grava INBOUND
  route.ts:325  InboundGuardsService.apply    ← opt-out, carrinho, política de IA
  route.ts:347  dispatchInboundAgent
       ↓
  InboundAgentDispatch.ts:224 → BRAIN (padrão do texto)   :234 → recepcionista (mídia)
       ↓
  WhatsAppBrainRuntimeService.ts:190 run()
       ↓
  :397 WhatsAppMessagingService.sendConversationReply → Meta Cloud API
```

Canal único Meta desde 04/08 — não há Evolution, nem segundo provedor, nem
reserva em caso de erro.

### 2.3 As três causas mais prováveis, conferidas por mim no arquivo

#### 🥇 Hipótese 1 — A conversa entrou em modo HUMANO e **nada a devolve para a IA**

Qualquer handoff grava `status=HUMAN, aiEnabled=false` (`src/lib/handoff.ts:41`).
Dali em diante toda mensagem nova é gravada, incrementa o não-lido, e a IA não
responde. **Para sempre**, até um humano abrir a Central e apertar "Devolver
para IA" (`src/app/api/chat/conversations/[id]/release/route.ts:51`).

**Isto é decisão de produto, e está escrita:**

> *"PRODUCT DECISION (2026-05-28): Human handoff is now persistent. IA returns
> ONLY by explicit staff action. Auto-resume on customer inactivity has been
> permanently removed."*
> — `src/app/api/atendimento/handoff/check-customer-inactivity/route.ts:5-8`

**E aqui está a doença crônica da casa, no formato clássico.** Existe uma
política de retorno automático — `WhatsAppAiReturnPolicy.ts` — que decide quando
uma conversa presa pode voltar para a IA (dia novo, 12h de inatividade, cliente
reabriu). Ela está **escrita, testada e não é chamada por ninguém**:

| Quem usa `evaluateAiReturn` | O que faz |
|---|---|
| `WhatsAppBrain.test.ts:3` | teste |
| `WhatsAppAiReturnDiagnostic.ts:11` | **conta** quantas conversas seriam elegíveis |
| `/api/cron/whatsapp/ai-return-diagnostic` | roda o diagnóstico — *"Changes NOTHING — no aiEnabled flip"* |

**Confirmei por varredura**: em todo o `src/`, as únicas escritas de `aiEnabled`
são `false` (`handoff.ts:41`, `InstagramChannelService.ts:111,279`). O único
`aiEnabled: true` que religa uma conversa é a rota manual de release; o outro é
o nascimento de conversa nova (`ConversationLogService.ts:138`).

**A nuance que me obriga a ser justo:** o cabeçalho do arquivo declara que agir
sobre a elegibilidade é *"out of scope for this round"*. Pela régua do Control
Room, **isso é dívida declarada, não armadilha** — para quem lê o código. Mas
para o cliente do Sushi Cazza, e para o CEO, a consequência não está declarada
em lugar nenhum: **cliente que cai em handoff fica mudo até alguém olhar o
painel.** Declarado no código, invisível no negócio.

O log existe (`route.ts:337-339`, `HUMAN_TAKEOVER`), mas é `console.info` e não
gera alerta. A própria Central já mede o sintoma: *"1 sem resposta há +1080 min —
cliente esperando"* (`src/services/channels/channelHealth.ts:266`) — **18 horas.**

#### 🥈 Hipótese 2 — "Quero cancelar" descadastra o cliente e cala o turno

`ContactSafetyService.ts:388-390` trata `stop, sair, parar, cancelar,
descadastrar, remover` como pedido de opt-out **quando a mensagem tem até 3
palavras** (`:425-429`). Efeito: `hasOptedOut=true`, `crmContactable=false`, e
`aiMayRespond=false` (`InboundGuardsService.ts:138`) → **o cliente não recebe
resposta naquele turno** e sai do CRM.

**Rodei a regra contra frases reais de cliente de restaurante:**

| Frase | Vira opt-out? |
|---|---|
| `cancelar` | ✅ sim |
| `quero cancelar` | ✅ **sim** |
| `cancelar meu pedido` | ✅ **sim** |
| `pode cancelar` | ✅ **sim** |
| `preciso cancelar pedido` | ✅ **sim** |
| `quero cancelar o pedido` | ❌ não (4 palavras) |

Um cliente que quer **cancelar um pedido** é descadastrado da comunicação do
restaurante e fica sem resposta. E a fronteira é arbitrária para quem escreve:
três palavras descadastram, quatro não. Num restaurante, "cancelar" é palavra do
dia a dia — não é sinônimo de "não quero mais receber mensagem".

Este ponto **tem log** (`ContactSafetyService.ts:650` e `route.ts:337`).

#### 🥉 Hipótese 3 — O Cérebro não produziu resposta, e ninguém fica sabendo

`WhatsAppBrainRuntimeService.ts:311-312`:

```ts
const replyBruto = outcome.result.idealResponse?.trim();
if (!replyBruto) return { status: "SKIPPED", reason: "brain produced no reply" };
```

Se o LLM devolve vazio (tempo esgotado, resposta cortada, parse falhando), o
método **retorna sem chamar o recepcionista** — ao contrário dos portões do
crítico (`:356`) e do juiz (`:376`), que **têm** rede. E não há `console.warn`.
Silêncio absoluto, sem rastro.

O mesmo vale para a recusa de envio da Meta (`:397-402`). E aqui há um detalhe
que vale mais que o achado — o comentário imediatamente acima da linha diz:

> *"Falha da Meta vira SKIPPED com o motivo real: sem rede alternativa, calar sem
> registrar seria o cliente esperando resposta que nunca vem."*

**A linha seguinte cala sem registrar.** O motivo real é devolvido no `reason` —
e o chamador o joga fora (§2.4). O código declara a intenção certa e faz o
contrário. O recepcionista loga esse mesmo caso
(`WhatsAppReceptionistService.ts:1606-1610`); o Cérebro não. **Quem depurar o
canal pelo log conclui que o Cérebro nunca falha.**

### 2.4 A causa-raiz atrás de seis dos silêncios: os `void` do dispatch

`InboundAgentDispatch.ts:219, 228, 238` disparam os agentes assim:

```ts
void import("…/WhatsAppBrainRuntimeService")
  .then(({ WhatsAppBrainRuntimeService }) =>
    WhatsAppBrainRuntimeService.respond(input.conversationId)
      .catch((err) => console.error("[InboundAgentDispatch] Cérebro falhou:", err)))
```

O `.catch` pega **exceção**. Mas o Cérebro não lança exceção quando desiste — ele
**devolve** `{ status: "SKIPPED", reason: "…" }`. Esse valor de retorno é
descartado pelo `void`.

**Ou seja: o Cérebro sabe exatamente por que não respondeu, escreve o motivo, e
ninguém escuta.** É o que torna invisíveis seis das saídas mudas de uma vez.

### 2.5 As catorze saídas mudas, e quais não têm log

| # | Arquivo:linha | O que cala | Log? |
|---|---|---|---|
| 1 | `WhatsAppBrainRuntimeService.ts:311` | LLM devolveu vazio — **sem rede para o recepcionista** | ❌ |
| 2 | `WhatsAppBrainRuntimeService.ts:402` | Meta recusou/bloqueou o envio | ❌ |
| 3 | `WhatsAppBrainRuntimeService.ts:204` | conversa não elegível para IA | ❌ |
| 4 | `WhatsAppBrainRuntimeService.ts:214` | conversa sem telefone | ❌ |
| 5 | `WhatsAppBrainRuntimeService.ts:224` | última entrada não é texto usável | ❌ |
| 6 | `WhatsAppBrainRuntimeService.ts:229` | idempotência ("já respondi") | ❌ |
| 7 | `webhooks/meta/whatsapp/route.ts:160` | mensagem sem `phoneNumberId` | ❌ |
| 8 | `webhooks/meta/whatsapp/route.ts:66` | JSON inválido → 200 mudo | ❌ |
| 9 | `webhooks/meta/whatsapp/route.ts:270` | dedupe por wamid | ✅ |
| 10 | `WhatsAppReceptionistService.ts:820` | conversa não elegível | ✅ |
| 11 | `WhatsAppReceptionistService.ts:849` | sem última mensagem | ✅ |
| 12 | `MetaWhatsAppCloudProvider.ts:32,77-89` | sem config, telefone inválido, erro HTTP/rede | ❌ |
| 13 | `WhatsAppMessagingService.ts:106` | fora da janela de 24h da Meta | ✅ |
| 14 | `webhooks/meta/whatsapp/route.ts:71` | exceção derruba o resto do lote — **e a Meta recebe 200, logo não reentrega** | ⚠️ loga sem o wamid, sem telefone, sem restaurante |

O nº 14 merece nota: como o webhook sempre devolve 200, uma exceção no meio de um
lote **descarta as mensagens seguintes em definitivo**. E o log dela não carrega
o caso concreto — guardrail 6 aberto.

### 2.6 O que descartei, com evidência

Não são suspeitas em aberto; são portas que fui conferir e estão fechadas:

- **Horário de silêncio, teto diário, descanso por cliente.**
  `ContactSafetyService.assertSendable` só é chamado pelos runners de campanha e
  de resgate — **nenhum** está no caminho de resposta a mensagem que entra.
- **Plano e restaurante inativo.** `restaurants.isActive` não é consultado no
  caminho de entrada; `aiWaiterIncluded` só é lido no cardápio web.
- **Loja pausada/fechada.** Muda o texto, não impede a resposta.
- **Modo sombra / `SHADOW_ONLY` / queda de degrau.** Caem no recepcionista
  (`WhatsAppBrainRuntimeService.ts:286-293`). **Não silenciam** — guardrail 5
  respeitado.
- **Portões de qualidade do Cérebro** (crítico e juiz). Têm rede e logam.
- **`META_WHATSAPP_ENABLED`.** Deliberadamente não consultada no envio.

### 2.7 ⛔ O que exige produção, e a consulta exata que faltou

A tabela é `messages` (`prisma/schema.prisma:921`), pela conversa do cliente. A
leitura que separa as hipóteses:

1. **INBOUND sem nenhuma OUTBOUND depois** → calou antes do envio (hipóteses 1, 2, 3).
2. **OUTBOUND com `providerStatus IN ('failed','blocked')`** → o envio foi tentado
   e recusado; `providerError` diz o código da Meta.
3. **Existe `content = '[handoff:…]'` com `senderType='SYSTEM'`** antes do
   silêncio → hipótese 1, e `handoffReason` diz quem pediu.

Complementares: `conversations` (`status`, `aiEnabled`, `aiLocked`,
`handoffAlarmAckAt`, `unreadCount`), `customers` (`hasOptedOut`, `optOutAt`) e
`meta_whatsapp_configs` (`connectionStatus`, `lastError`, `tokenExpiresAt`).

⚠️ **Duas armadilhas para quem for buscar:**
- **`ai_interaction_logs` provavelmente estará vazia.** Ela tem um único
  escritor — `AIOrderService.ts:1271`. **O Cérebro e o recepcionista não escrevem
  nela.** Quem procurar a evidência ali não acha, e pode concluir que nada
  aconteceu.
- **`brain_shadow_logs` só grava turno do topo a partir de 24/08/2026**
  (`LiveStageHealth.ts:151`). Antes disso, ausência de linha não prova nada.
- **A retenção de log do Railway tem buraco conhecido** — em 23/08 faltavam 14
  horas (`docs/pendencias.md:886`).

### 2.8 Duas saídas

O problema para quem decide: **o sistema tem catorze portas por onde o cliente
fica sem resposta, oito delas invisíveis — e quem cai em atendimento humano fica
mudo até alguém abrir o painel.**

**Saída A — Acender a luz antes de mexer na trava. ✅ RECOMENDADA.**
Fazer os `void` do dispatch lerem o `reason` que o agente já devolve, e logar as
oito saídas mudas. É mudança pequena, sem risco de comportamento: **nada passa a
responder diferente, só passa a deixar rastro.** Destrava o principal: hoje não
dá para saber quantos clientes ficaram mudos, nem por quê. Custo baixo, risco
quase nulo. E dá a medição para decidir a Saída B com número em vez de palpite.
Uma correção entra junto porque é do mesmo tamanho e é defeito puro: dar ao
`:311` (resposta vazia) a mesma rede que o crítico e o juiz já têm — cair no
recepcionista em vez de calar.

**Saída B — Ligar o retorno automático da IA**, usando a `WhatsAppAiReturnPolicy`
que já está escrita e testada. Destrava o cliente preso: ele volta a ser atendido
no dia seguinte ou após 12h de silêncio. Custa reabrir uma decisão de produto que
o CEO fechou em 28/05 — e arrisca o caso que motivou aquela decisão: a IA voltar
a falar por cima de um atendimento humano em andamento (a política já prevê isso
com `RECENT_HUMAN_ACTIVITY` e `CRITICAL_HANDOFF`, mas o risco é de negócio, não
de código).

**Recomendo A agora e B como pergunta ao CEO**, nessa ordem — porque B mexe no
que o produto promete ao cliente, e isso não é decisão do Diretor. E registro
uma terceira, que **não** recomendo e por isso nomeio: *afrouxar a regra de
opt-out* para "cancelar" não descadastrar. Descartada como ação isolada porque
opt-out é LGPD: mexer na porta de saída do cliente sem medir antes troca um
defeito por risco jurídico. O caminho certo é medir com a Saída A quantos
opt-outs vêm de mensagens com "cancelar" e levar o número junto com a proposta.

---

## 3. O teto do agente solto — **não é teto, é desenho**

### 3.1 Primeiro, o que é "o agente solto"

É o **raciocínio livre do Cérebro no WhatsApp** — o que o próprio código chama de
"IA solta" (`src/services/crm/CrmAgentPilotService.ts:86`) e de "inteligência
livre do Brain" (`src/services/whatsapp/brain/WhatsAppBrainRuntimeService.ts:277`).
Ele responde quando o cliente sai do menu com uma pergunta de verdade.

Descartei três candidatos: o agente de CRM (compõe campanha de saída, não
atende), o SDR da esteira (saída fria para lead) e o Garçom (vive no cardápio,
não no WhatsApp).

### 3.2 Veredito

**Nenhuma das três hipóteses do Control Room, e sim uma quarta: é funil de
elegibilidade por decisão de produto.** O menu determinístico atende 20 de cada
21 turnos; o que sobra é o que chega ao agente.

**E há uma correção de vocabulário que muda a leitura: 4,3 não são conversas,
são mensagens de resposta.** A consulta que produziu o número é `count(*)` sobre
`messages` (`scripts/volume-topo-ao-vivo.mjs:279-292`) — uma conversa em que o
cliente sai do menu duas vezes conta 2. **O número de conversas distintas é menor
que 4,3, e nunca foi medido.** Quem repetir "4 conversas por dia" está inflando
um número que ninguém apurou.

### 3.3 A conta, mostrada

Não é estimativa minha: é medição de produção de 25/08/2026, registrada em
`src/services/brain/runtime/LiveStageHealth.ts:28-42` — **abri o arquivo e
conferi linha a linha**:

```
turnos de cliente no WhatsApp .............. 5.866 em 90 dias  ≈ 65/dia
turnos que CHEGAM ao raciocínio livre ......   273 em 64 dias  ≈ 4,3/dia
no mesmo período, o menu respondeu .........  3.955             → 1 turno em 21
```

O próprio arquivo declara, na linha 38: *"A distância entre 65 e 4,3 não é erro:
é o desenho."*

O número está **travado em teste**: `LiveStageHealth.test.ts:201` guarda
`const RITMO_MEDIDO_POR_DIA = 273 / 64; // ≈ 4,27`, com três testes que quebram
se alguém encolher a janela de medição.

**Não existe cadência a multiplicar.** O agente é reativo a webhook, não a cron —
o único chamador em produção é
`src/services/whatsapp/inbound/InboundAgentDispatch.ts:228-230`, disparado pelo
webhook da Meta. Não há lote, não há frequência, logo não há `frequência × lote`.

### 3.4 Não existe limite de volume — e isso é o achado

Varredura em `src/services/brain/`, `src/services/whatsapp/brain/` e
`src/services/ai/`: **nenhum `MAX_*`, `dailyCap`, `*_PER_DAY`, cota, amostragem
percentual ou rate limit sobre a resposta do agente solto.** Os únicos `MAX_*`
são de tamanho de prompt e de janela de histórico.

O único teto de volume do domínio é do CRM de saída
(`ContactSafetyService.ts:290`, `dailyGlobalCap`) — e ele **não toca** o agente
solto.

Quem cria os 4,3/dia são **dois portões de produto**, ambos em
`WhatsAppBrainRuntimeService.ts`:

| Portão | Linha | O que faz |
|---|---|---|
| **Âncora do menu** | `:243-252` | Saudação, "cardápio", "0"/voltar e mensagens só de dígitos vão ao recepcionista determinístico. Nunca ao agente. |
| **Sessão de 30 min** | `:261-276` | Fora de sessão ativa, a **primeira** mensagem sempre abre o menu — mesmo sendo pergunta direta. |

O segundo é o mais restritivo, e é decisão de produto explícita no comentário do
código: *"O menu é a experiência de entrada, sempre."*

### 3.5 A escada não explica o número

`SHADOW_ONLY → ALLOWLIST → RESTAURANT_WIDE`, gravada na tabela
`brain_freeform_configs` (`prisma/schema.prisma:4572-4591`). Sem linha =
`SHADOW_ONLY`.

**ALLOWLIST não é a causa neste caso**: as 273 respostas medidas saíram com
`metadata->>'source' = 'WHATSAPP_BRAIN'`, marca que só é gravada depois de
`freeForm.allowed === true`. Ou seja, saíram de um restaurante que já está
**acima** da allowlist. E o cabeçalho de `LiveStageHealth.ts:9-11` nomeia qual:
**o Sushi Cazza, no degrau alto desde 12/07.**

### 3.6 ⛔ O que NÃO consigo saber sem banco

| Não sei | Consulta que faltaria |
|---|---|
| Em que degrau cada restaurante está hoje | `SELECT "restaurantId", mode, paused, "minConfidence", jsonb_array_length("allowlistedPhones") FROM brain_freeform_configs;` |
| **Quantas CONVERSAS distintas** (o número que ninguém mediu) | `count(DISTINCT m."conversationId")` com o mesmo filtro do medidor |
| Quanto do funil morre em cada portão | Os portões gritam em `console.warn("[BrainDecision]", …)` (`:250, 274, 344, 374, 425`) e **não são persistidos em tabela nenhuma**. Faltaria varrer o log do Railway por `gate=` e contar. |
| Quantos dias o agente esteve de fato no ar | Série de `finishedAt` das runs de qualidade nos últimos 90 dias — ver §3.7 |
| **Demanda reprimida**: quantos turnos o recepcionista atendeu com `intent = UNKNOWN` | Nunca foi medido. É exatamente o número que separa *"demanda que não chega"* de *"demanda que chega e é barrada"*. |

### 3.7 Um ponto fraco que fica declarado

`LiveStageGuard.ts:136` derruba o agente para `SHADOW_ONLY` quando o veredito de
qualidade passa de 30h (`VERDICT_MAX_AGE_HOURS`). O cron de qualidade roda uma
vez por dia. **Se ele falhar dois dias seguidos, o agente cai sozinho e ninguém
é avisado** — o comportamento é correto por construção (*"cair de degrau com o
medidor quebrado é o comportamento certo"*), mas é silencioso.

Confirmei que a queda **não emudece o cliente**: o código devolve ao recepcionista
(`WhatsAppBrainRuntimeService.ts:285-292`). O guardrail 5 da casa está respeitado
aqui. O cliente recebe resposta pior, não ausência de resposta.

### 3.8 Duas saídas

O problema, para quem decide: **o agente inteligente responde 1 pergunta em 21
porque o menu vem primeiro, sempre.** Isso é decisão de produto tomada, não
defeito.

**Saída A — Não mexer, e medir o que falta. ✅ RECOMENDADA.**
Custa quase nada (uma consulta de conversas distintas e uma contagem de
`intent = UNKNOWN` no recepcionista). Destrava a única pergunta que importa
antes de mexer: *quantos clientes fazem pergunta de verdade e são barrados pelo
portão de primeiro contato?* Sem esse número, afrouxar portão é chute. Arrisca
nada.

**Saída B — Afrouxar o portão de sessão** e deixar o agente atender primeiro
contato. Destrava volume de imediato. Custa a experiência de entrada padronizada
que o produto escolheu ter. Arrisca o mais caro: primeiro contato é onde o
cliente decide se confia — e é o turno com menos contexto para o agente acertar.

**Recomendo A**, e recomendo **não** tratar 4,3/dia como problema até o número
de §3.6 existir. Hoje não há evidência de que exista demanda reprimida; há
evidência de que o desenho é esse.

---

## 4. O que esta volta NÃO cobriu — e a régua de entrega

### 4.1 A régua de entrega, aplicada a esta volta

A régua da casa cobra quatro coisas **de toda peça nova**. **Não escrevi peça
nenhuma** — esta volta é diagnóstico e não produziu código. Então a régua se
aplica assim:

| Item da régua | Nesta volta |
|---|---|
| **Quem chama isto?** | Foi a lente, não o produto. Aplicada a `WhatsAppAiReturnPolicy` (§2.3), a `migrate-deploy.sh` (§1.7) e ao `nixpacks.toml` (§1.7). Duas respostas: "ninguém age sobre ela" e "os dois rodam, conferido no log". |
| **O teste alcança o que o cliente lê?** | Não se aplica — nenhum teste novo. O que fiz foi o inverso: conferir se o **código vivo** alcança o cliente, e em 14 pontos ele não alcança (§2.5). |
| **Cada mutação rodada** | Não se aplica — nada a mutar. **Não rodei a suíte**: nada mudou no código, e suíte verde não provaria nada sobre achado de configuração de produção. |
| **O que não consegui provar** | §1.5, §2.7 e §3.6, cada uma com nome, motivo e a consulta que faltaria. |

### 4.2 O que ficou de fora, com nome e motivo

| Não fiz | Por quê |
|---|---|
| **Confirmar o backup no painel do Railway** | Sou app OAuth: a API não expõe agendamento de volume nem lista de backups. Precisa de olho humano na aba **Backups**, ou de token de conta. **É a lacuna mais cara desta volta.** |
| **Tirar o `pg_dump`** | Exige credencial de produção e cria arquivo com dado de todos os clientes. Ação, não diagnóstico. |
| **Ligar o PITR** | Gasta dinheiro — decisão do CEO — e mexe em produção. |
| **Achar a causa do caso do Sushi Cazza** | A prova está no banco. Consultar produção estava fora do combinado. |
| **Medir conversas distintas do agente solto** | Mesma razão. |
| **Consertar qualquer um dos 14 silêncios** | Diagnóstico, custo zero. Nenhuma linha de código foi alterada. |
| **Abrir o `Postgres-76OG` para ver o que tem dentro** | Sem credencial. Segue sendo 0,35 GB de conteúdo desconhecido, exposto à internet. |

### 4.3 Três coisas que achei de passagem e que outro Diretor vai tropeçar

1. **A vitrine do `canais` está caduca e mente.**
   `docs/agents/canais/vitrine.md:63-97` ainda diz *"a Evolution é o default E o
   fallback"* e *"os dois webhooks não são simétricos"*. A Evolution saiu em
   04/08/2026; existe **um** webhook de WhatsApp. A ficha `agentes/canais-v1.0.md`
   carrega o mesmo erro. Pela hierarquia de conflito do `CLAUDE.md`, vitrine é o
   item de menor precedência e deveria ser corrigida na mesma sessão — **não
   corrigi**, porque esta volta é de leitura e alteração de ficha é do CEO. Fica
   registrado como o primeiro conserto da próxima.

2. **A API do Railway discorda do que roda.** §1.7. Quem auditar o serviço `FOOCCI`
   pelo painel vê três divergências (`startCommand`, `preDeployCommand`, builder) e
   conclui que dois mecanismos de proteção estão mortos. Estão vivos. **Config-as-code
   se confere no log do deploy, não no painel.**

3. **A restrição de agentes desta sessão contradiz o `CLAUDE.md`, de novo.**
   A configuração desta sessão manda não acionar agentes sem pedido explícito; o
   `CLAUDE.md` manda delegar trabalho pesado. O Diretor anterior registrou
   exatamente isto em `docs/passagem-de-bastao-foocci-2026-08-05.md:170-180` e
   pediu que o próximo avisasse em vez de ficar lento em silêncio. **Estou
   avisando.** Nesta volta despachei `canais` e `crm` em paralelo — a doutrina do
   projeto é explícita e os dois fios eram varredura de muitos arquivos, que é o
   caso nomeado para delegar. Conferi pessoalmente todo achado que entrou neste
   relatório, abrindo os arquivos citados.

### 4.4 Um ponto fraco declarado deste próprio relatório

Os números do fio 3 (65/dia, 4,3/dia, 1 em 21) **não foram medidos por mim**.
Vieram de uma medição de produção de 25/08 registrada em
`LiveStageHealth.ts:28-42` e travada em teste. Eu conferi que o registro existe,
que o teste trava o número, e que a consulta que o produziu é `count(*)` sobre
`messages`. **Não conferi que a medição original estava certa** — para isso
precisaria rodar a consulta em produção. Se aquela medição estiver errada, o fio
3 inteiro se move.
