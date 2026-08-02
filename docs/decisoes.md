# O corredor — decisões que atravessam domínios

> Decisão que afeta mais de um especialista não mora na sala de nenhum deles.
> Mora aqui. **Só o Diretor escreve neste arquivo.**
>
> Sem o corredor, uma decisão que toca três domínios vira três versões dela — cada
> uma na vitrine do seu dono, todas se achando certas, e em um mês elas se
> contradizem.
>
> Formato: o que ficou decidido, por quê, quem decidiu, quando, e o que muda.

---

## Toda proteção decide pelo estado, não por reflexo

**Decidido em** 2026-07-31 · **por** CEO + Diretor · **origem:** incidente da Nicole
(commit `3ec378b3`)

Um portão que reprova precisa escolher a resposta olhando o **estado da
conversa**. O comportamento antigo — cair sempre na saudação — fez uma cliente
receber a tela de entrada cinco vezes no meio de um pedido.

**O que muda para todos:** proteção que dispara não pode ser mais destrutiva que
o problema que ela evita. Vale para o Cérebro, para os canais e para qualquer
verificador futuro. Quando duas peças usam a mesma janela de tempo (aqui, 30 min),
**elas leem a mesma constante** — se divergirem, uma acha que a conversa começou e
a outra acha que não.

---

## Mentir sobre si mesmo é uma categoria de erro separada

**Decidido em** 2026-07-31 · **por** Diretor · **origem:** mesmo incidente

Verificador de fato (preço, cardápio, entrega) **não pega** agente que encena uma
capacidade que não tem. O agente não mentiu sobre o restaurante — mentiu sobre si
mesmo.

**O que muda para todos:** ao auditar comportamento de agente, as duas perguntas
são feitas separadamente. Todo canal declara o que ele **não** consegue fazer, e
isso vira trava em código, não linha de perfil.

---

## Prompt é aviso; código é trava

**Decidido em** 2026-07-31 · **por** Diretor · **origem:** "não prometa pedido" estava
no perfil do agente e não segurou

Para o que causa dano real, exija o mecanismo — gate, validação, restrição de
ferramenta. O aviso continua existindo **em paralelo** com a trava, nunca no lugar
dela.

**O que muda para todos:** vale inclusive na configuração dos próprios
especialistas: `tools:` restrito é trava; "não faça X" no prompt é aviso. Por isso
o agente `qualidade` não tem permissão de escrita.

---

## Um estado sem prazo é um vazamento

**Decidido em** 2026-07 · **por** Diretor · **origem:** comanda parada em `CLAIMED`
para sempre; carrinho abandonado eterno; falha permanente retentada sem fim

Todo estado intermediário — "em processamento", "reservado", "aguardando" — nasce
com prazo e com quem o resgata quando vence.

**O que muda para todos:** vale em impressão, pedido, envio de mensagem e fila de
campanha. Estado novo sem prazo não passa em revisão.

---

## O repositório é a memória; o chat é a sala de reunião

**Decidido em** 2026-08-01 · **por** CEO · **origem:** a reestruturação
CEO → Diretor → especialistas

Cada projeto passa a ter **um Diretor**, que é a ponte única do CEO. Assuntos deixam de
virar chats separados: viram despacho para especialista, e o resultado vira
registro no repositório **na mesma sessão**.

**O que muda para todos:** nenhum aprendizado durável pode existir só na conversa.
Sentiu que "isso é importante e está só no chat"? Pare e escreva agora — na
oficina do agente, se for do domínio; aqui, se atravessar domínios.

---

## Documentação não é evidência

**Decidido em** 2026-07 · **por** Diretor · **origem:** o comentário do Carteiro
descrevia re-tentativa que o servidor nunca implementou

Verificação se faz contra o código em execução. Comentário, README e documento
descrevem intenção — e intenção diverge silenciosamente do que roda.

**O que muda para todos:** toda afirmação em entrega de especialista vem com
**arquivo:linha**. Alerta e relatório carregam a própria evidência.

---

## A branch padrão deste repositório não é `main` — e os crons dependem disso

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-canais-meta.md` §e (commit `18a5ed7`)

A branch padrão é `claude/remove-legacy-runner-q8iXa`. O gatilho `on: schedule` do
GitHub Actions **só dispara a partir da branch padrão**.

**O que muda para todos:** trocar a branch padrão sem migrar os workflows **quebra
todos os crons em silêncio** — nenhum erro, nenhum aviso, as tarefas noturnas
simplesmente param de rodar e ninguém percebe até faltar o resultado delas.

Vale para o robô do manual, os simuladores, o refresh de token do Instagram e as
varreduras de qualidade.

---

## Três nomes de branch circulam — só um chega em produção

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-painel-e-evolution.md` §f
(commit `cfc346c`)

Toda sessão nova se confunde com isto:

| Branch | O que é de verdade |
|---|---|
| `claude/remove-legacy-runner-q8iXa` | **A que auto-deploya no Railway** → `foocci.com.br`. É a padrão do repositório |
| `claude/foocci-brain-vaamrx` | branch de trabalho citada no `CLAUDE.md` |
| `claude/inspiring-bardeen-hsx9wk` | apareceu na abertura de uma sessão; **não é nenhuma das duas** |

**O que muda para todos:** o que chega em produção é o que entra em
`claude/remove-legacy-runner-q8iXa`. O padrão que funciona é branch de feature →
`merge --no-ff` na de deploy → push → **conferir o `commitSha` no `/api/health`**.

---

## `/api/health` é o oráculo de deploy — e diz mais que "ok"

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-painel-e-evolution.md` §f
(commit `cfc346c`)

Ele devolve `commitSha`, `branch`, `db` e um bloco `checks` com
`mpWebhookSecret`, `encryptionKey`, `nextauthSecret`, `openaiKey`, `databaseUrl`.

**O que muda para todos:** é o jeito mais rápido de saber **o que falta de variável
de ambiente em produção sem abrir o Railway**. Hoje o único `false` ali é
`mpWebhookSecret`.

Use-o para confirmar que um merge chegou no ar — não confie no verde do deploy.

---

## Push na branch padrão é rejeitado na primeira tentativa — e isso é normal

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-manual.md` §6 (commit `5b1c885c`)

Várias sessões commitam na mesma branch ao mesmo tempo. O padrão obrigatório é o
loop: **`push → fetch → rebase → push`**.

E **403 ao empurrar fora da própria branch é comportamento esperado**, não erro de
rede: a credencial git de uma sessão web é escopada à branch dela. Não insista.

**O que muda para todos:** apagar branch alheia daqui **nunca funciona** — nem por
`git push --delete`, nem pelas ferramentas do GitHub. O único caminho é a UI do
GitHub, pelo dono.

E **o nome de branch exibido na interface do chat é etiqueta da sessão** — só vira
branch de verdade se aquela sessão fizer push. Isso já causou dois falsos alarmes
de "branch misteriosa".

---

## Este projeto é trunk-based e não usa PR — e `--force-with-lease` já custou caro

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-cmv-precificacao.md` §5.1 e §7
(commits `36a36597`, `e8f01e90`)

O CEO trabalha **trunk-based**: push direto na branch padrão, sem pull request. Um
PR chegou a ser aberto e foi dispensado — o pedido explícito foi push direto.
**Não crie branch de feature sem pedido expresso.**

A consequência é que **várias sessões escrevem na mesma linha ao mesmo tempo**, e
isso já produziu um incidente real em 01/08: um `--force-with-lease`, com a falha do
`rebase` **mascarada por um pipe**, descartou o merge de outra sessão por alguns
minutos. Foi detectado na verificação e restaurado.

**O que muda para todos:**

- Nunca `--force-with-lease` na branch padrão. O padrão é `push → fetch → rebase →
  push`, em loop.
- **Nunca canalize um `rebase` por pipe.** O código de saída passa a ser o do
  `tail`, e uma falha vira "sucesso" silencioso — que foi exatamente o que
  aconteceu.
- Depois de qualquer operação de escrita concorrente, **confirme com
  `git merge-base --is-ancestor`** que o trabalho alheio continua no remoto.

---

## A Regra de Ouro do Brain é travada por teste, não por combinado

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-cmv-precificacao.md` §5.5
(commit `36a36597`)

**Nenhum arquivo fora de `src/services/brain/engines/**` pode importar
`@/lib/openai` ou SDK de IA.** O caminho certo é `selectEngine(agentId)` +
`callStructuredJson()`.

`architecture.test.ts` varre os imports e **derruba o CI**. Não é convenção — é
mecanismo. É o guardrail "prompt é aviso, código é trava" aplicado ao próprio
repositório.

**Junto:** `next build` roda `tsc` strict **e** ESLint com
`react/no-unescaped-entities` e `no-restricted-imports` como **erro**. Lint quebra o
build, não só o CI.

---

## Commit ausente da branch padrão **não** prova que o trabalho não chegou

**Registrado em** 2026-08-01 · **origem:** mineração do
`HANDOFF-railway-build-e-ui-promocoes.md` (commit `4712538`)

Os **seis** commits daquela sessão não são ancestrais da branch padrão. Pela
verificação usual (`git merge-base --is-ancestor`), o trabalho nunca chegou em
produção.

**E no entanto está tudo lá:** o `nixpacks.toml` é byte a byte idêntico, os quatro
pacotes estão em `dependencies`, o drawer com `lg:left-56` e a aba
*🤖 Automações WhatsApp* rodam em produção hoje. O conteúdo entrou por outro
caminho — outra sessão reaplicou, ou um rebase reescreveu os commits (é o mesmo
efeito já registrado em *"`git log` numa branch compartilhada não é linha do
tempo"*).

**O que muda para todos:** a pergunta certa nunca é *"o commit está na branch?"* —
é **"o comportamento está no código que roda?"**. Verifique por conteúdo:
`git show <branch>:<arquivo>`, `git grep <padrão> <branch>`, `/api/health`.

O erro simétrico é igualmente caro. Já aconteceu dos dois lados no mesmo dia:

| Achado | Conclusão errada | Verdade |
|---|---|---|
| commit **não** é ancestral | "o trabalho se perdeu, vou refazer" | já estava em produção — refazer criaria conflito |
| branch existe e parece pronta | "é só mergear" | reprovava no `tsc` (a `fresh-debug-session-C3qhF`) |

---

## O deploy roda com `NODE_ENV=production` — e isso apaga metade do `package.json`

**Registrado em** 2026-08-01 · **origem:** mesmo handoff, §1 e §3

O nixpacks instala com `NODE_ENV=production`, e nesse modo o `npm ci` **omite as
`devDependencies`**. Um pacote que só existe ali simplesmente não chega no
contêiner — e o build quebra com `Cannot find module`, apontando para um arquivo
que está no git e compila perfeitamente na máquina.

Duas travas estão na branch padrão e resolvem o caso:

1. `nixpacks.toml` → `[phases.install] cmds = ["npm ci --include=dev"]`
2. `tailwindcss`, `postcss`, `autoprefixer` e o **CLI** do `prisma` movidos para
   `dependencies` (o CLI é usado em produção duas vezes: `prisma generate` no
   build e `prisma migrate deploy` no start)

**O que muda para todos:** *"passa localmente"* não é evidência de que o deploy
passa — o ambiente local instala tudo. Antes de culpar o código por um
`Module not found` no Railway, confira **em que lista do `package.json`** o pacote
está.

⚠️ **Não remova o bloco `[start]` do `nixpacks.toml`.** Ele é recuperação de
emergência de um P3009 e não pertence à mesma mudança — só sai depois de
confirmar que a migração `20260518000001_add_distance_min_fee_km` está estável em
produção. O comentário *"remove after confirmed stable"* vale **só** para esse
bloco.

---

## Ler o arquivo inteiro antes de afirmar o que ele contém

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-site-comercial.md` §4
(commit `79943f5`)

Duas afirmações erradas na mesma sessão, pelo mesmo motivo — **leitura parcial
tratada como leitura completa**:

1. Uma primeira leitura do `tailwind.config.ts` devolveu só as cores `brand` e a
   fonte. O arquivo tem 44 linhas e **também** define os sete tokens semânticos e a
   filosofia da marca. A conclusão que ia sair era "laranja protagonista" — o
   oposto do que o arquivo diz.
2. Uma busca ampla por "PREMIUM" encontrou a palavra e concluiu que era nome de
   plano. É de **outro** enum (`CRMMessageStyle`). O enum `Plan` real é
   `{ STARTER, GROWTH, PRO }` — `prisma/schema.prisma:155-159`.

**O que muda para todos:** busca **localiza**; ela não **conclui**. Achou a palavra?
Abra o arquivo, leia o bloco inteiro e confirme a que estrutura ela pertence antes
de afirmar qualquer coisa.

O sinal de alerta é o que salvou os dois casos: **duas leituras do mesmo arquivo
discordando entre si**. Quando isso acontecer, pare e releia — nunca escolha a que
confirma o que você já ia escrever.

É o guardrail "documentação não é evidência" um nível abaixo: **nem a sua própria
leitura anterior é evidência.**

---

## O WhatsApp da Foocci passa a ser SÓ a Meta — a Evolution sai

**Decidido em** 2026-08-02 · **por** CEO · **origem:** conversa com o Diretor
durante o preparo do lançamento

Direção fechada: **o único provedor de WhatsApp é a Meta Cloud API.** Tudo que for
Evolution deve ser eliminado.

**O que isso NÃO significa:** apagar hoje. A eliminação é migração, e apagar sem
migrar derruba WhatsApp de quem está no ar. Os números medidos em 02/08:

| Fato | Número |
|---|---|
| Arquivos que citam Evolution | **239** |
| Provedor padrão no banco (`Restaurant.whatsappProvider`) | **`EVOLUTION`** |
| Provedor de reserva (`fallbackProvider`) | **`EVOLUTION`** |

Ou seja: **todo restaurante existente está na Evolution** até ser trocado
explicitamente. O default nasceu assim de propósito, para a adoção da Meta ser
aditiva.

**O que quebra se alguém apagar a Evolution antes de portar** (confirmado por
leitura, registrado em `docs/pendencias.md`): pedido por texto, opt-out,
recuperação de carrinho, atribuição de receita do CRM e os comandos do BuildOS.
Os dois webhooks **não são simétricos** — o da Meta chama só o Cérebro; o da
Evolution carrega todo o resto.

**O que muda para todos, a partir de agora:**

1. **Nada novo nasce na Evolution.** Recurso novo de WhatsApp se constrói na Meta.
   Se só der para fazer na Evolution, é sinal de que falta paridade — reporte,
   não contorne.
2. **Mexeu em algo da Evolution? Só para conserto de segurança, correção de
   mentira em tela, ou para portar para a Meta.** Não invista em melhoria ali.
3. **A ordem da eliminação é fixa:** (a) portar a paridade de entrada para o
   webhook da Meta — aditivo, não mexe em produção; (b) trocar o default e migrar
   restaurante por restaurante, com confirmação; (c) só então apagar código.
   Pular (a) é derrubar cliente.
4. **O painel de QR/código de pareamento é da Evolution.** A Meta não usa QR. Ele
   é transitório e morre no fim da migração — corrigi a mentira dele em 02/08 para
   que ninguém se perca durante a transição, não para investir nele.

**Ainda travado, e é do CEO:** a Meta está ativa para **todos** os restaurantes ou
só alguns? Sem esse dado a etapa (b) não começa.
