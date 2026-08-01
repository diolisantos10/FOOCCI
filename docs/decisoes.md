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

## Sala sem dono é memória que ninguém mantém — o `manual` virou o 9º especialista

**Decidido em** 2026-08-01 · **por** CEO (*"pode seguir com todos os fixes"*) ·
**origem:** auditoria de coerência na primeira sessão do Diretor

`docs/agents/manual/vitrine.md` existia com seis entradas curadas, e
`docs/pendencias.md` tinha uma seção inteira de manual e treinamentos — mas **não
existia agente `manual`** em `.claude/agents/`. Eram oito, e ele não estava entre
eles.

Uma sala sem dono quebra duas regras ao mesmo tempo: o agente só escreve na
**própria** sala (então ninguém podia escrever naquela), e a área não tinha quem
respondesse por ela quando uma pendência aparecesse.

**Corrigido criando `.claude/agents/manual.md`** — guias, assistente do widget,
robô noturno de sync e onboarding do lojista.

**O que muda para todos:** vitrine e agente nascem **juntos**. Antes de promover a
primeira entrada de uma sala nova, confirme que existe agente com aquele nome — e
antes de criar um agente, confirme que a área não é de um dos que já existem.
Sala órfã é o sintoma barato de um problema caro: área sem responsável.

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

## Só uma branch chega em produção — as outras dezenas são blocos de trabalho

**Registrado em** 2026-08-01 · **origem:** `HANDOFF-painel-e-evolution.md` §f
(commit `cfc346c`) · **corrigido em** 2026-08-01 pelo Diretor

O remoto tem **mais de trinta** branches. Isso é normal — é o fluxo de branch por
bloco, não bagunça. Só uma delas importa para produção:

| Branch | O que é de verdade |
|---|---|
| `claude/remove-legacy-runner-q8iXa` | **A que auto-deploya no Railway** → `foocci.com.br`. É a padrão do repositório |
| `claude/pm-*`, `cmv-*`, e as demais | branches de bloco. Verifique se já entraram antes de tratar como trabalho perdido |
| `claude/foocci-brain-vaamrx` | ⚠️ **esgotada.** Era citada como "a" branch de trabalho no `CLAUDE.md`; hoje está 39 commits atrás da padrão e **zero à frente**. Não use — abra uma nova |
| `claude/inspiring-bardeen-hsx9wk` | já foi registrada aqui como "branch misteriosa". **Não é:** é uma branch de bloco e o trabalho dela **já está na padrão** (`d4eac6f`, o CEP na nota do caixa) |

**O que muda para todos:** o que chega em produção é o que entra em
`claude/remove-legacy-runner-q8iXa`. O padrão que funciona é branch de bloco →
PR → `merge --no-ff` na de deploy → push → **conferir o `commitSha` no
`/api/health`**.

**Antes de chamar uma branch de órfã, misteriosa ou perdida**, rode o teste de uma
linha — ele desarmou os dois falsos alarmes acima:

```
git merge-base --is-ancestor origin/<branch> origin/claude/remove-legacy-runner-q8iXa
```

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

## O fluxo é branch por bloco → PR → padrão — e esta entrada dizia o contrário

**Registrado em** 2026-08-01 · **corrigido em** 2026-08-01 pelo Diretor
**Origem:** `HANDOFF-cmv-precificacao.md` §5.1 e §7 (commits `36a36597`,
`e8f01e90`) · **corrigido contra** a API do GitHub e o histórico da branch padrão

Esta entrada afirmava *"o projeto é trunk-based, não usa PR, não crie branch de
feature sem pedido expresso"*. **É falso** — e estava no arquivo de maior
precedência que os agentes leem como verdade.

O que a verificação mostra: os PRs **#44 a #53** foram abertos em 01/08, **todos**
com base em `claude/remove-legacy-runner-q8iXa`, cada um saindo da **sua própria
branch de bloco** — `claude/pm-canais`, `claude/pm-crm`, `claude/pm-cmv`,
`claude/pm-manual`, `claude/pm-google`, `claude/pm-categorias`,
`claude/pm-painel`, `claude/pm-consolidacao`. Branch por bloco não é exceção
pedida: é o padrão da casa.

**O que muda para todos:** abra uma branch para o seu bloco, faça PR para a
padrão, e **nunca empilhe trabalho novo em branch já mergeada** — reinicie a
partir da padrão.

### As travas de escrita concorrente continuam valendo

Elas vieram de um incidente real, não da premissa errada acima. **Várias sessões
escrevem na mesma linha ao mesmo tempo**, e em 01/08 um `--force-with-lease`, com
a falha do `rebase` **mascarada por um pipe**, descartou o merge de outra sessão
por alguns minutos. Foi detectado na verificação e restaurado.

- Nunca `--force-with-lease` na branch padrão. O padrão é `push → fetch → rebase →
  push`, em loop.
- **Nunca canalize um `rebase` por pipe.** O código de saída passa a ser o do
  `tail`, e uma falha vira "sucesso" silencioso — que foi exatamente o que
  aconteceu.
- Depois de qualquer operação de escrita concorrente, **confirme com
  `git merge-base --is-ancestor`** que o trabalho alheio continua no remoto.

> **A lição de segunda ordem, e ela é a mais cara:** esta entrada esteve errada por
> um dia inteiro e ninguém pegou, porque o corredor é lido como **verdade** e não
> como afirmação verificável. Entrada de corredor que descreve **processo** — fluxo
> de branch, quem aprova o quê, como se publica — envelhece muito mais rápido que
> entrada que descreve **comportamento de código**. Carimbe a origem e reverifique
> antes de obedecer.

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
