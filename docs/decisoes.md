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

## Carrinho abandonado: manda em 2 minutos, e loja fechada não manda nunca

**Decidido em** 2026-08-05 · **por** CEO · **origem:** o diagnóstico que mostrou
**4 mensagens de recuperação em 2 meses e meio**

Palavras dele: *"a mensagem tem que ser enviada quando o cliente fecha o Foocci,
e 2 min depois mandar. Se o cliente abre de madrugada não precisa enviar nada,
porque ele queria comer de madrugada e não quando o restaurante abrir."*

**O que muda:** carrinho não finalizado + 2 minutos sem atividade → manda, **se a
loja estiver aberta naquele momento**. Loja fechada: **não manda, e não guarda
para depois**. O carrinho morre em silêncio.

**Por que a segunda metade é a mais importante:** antes o motor *adiava* o envio
para quando a loja abrisse — e o carrinho expirava em 6h, antes disso. Ou seja,
ele prometia um envio que nunca acontecia. Agora a recusa é honesta e imediata.

**O que muda para todos:**

1. **A regra é avaliada no MOMENTO do abandono, não depois.** É essa escolha —
   e não uma trava de data — que impede enxurrada: os ~51 carrinhos represados
   que o diagnóstico encontrou **nunca** viram mensagem, por construção. Provado
   por três caminhos independentes, inclusive um teste que injeta os 51 com a
   validade afrouxada de propósito e exige zero envio.
2. **"Fechou o app" não existe como sinal.** O navegador não avisa isso de forma
   confiável; o que existe é **inatividade**. Quem for "melhorar" isso depois vai
   tentar detectar fechamento de aba e vai falhar em silêncio — está escrito no
   código para não tentar.
3. **Lembrete tardio é pior que lembrete nenhum.** Vontade de madrugada não
   sobrevive até o restaurante abrir; a mensagem de manhã chega como cobrança de
   um desejo que já passou. Vale como princípio para qualquer recuperação futura,
   não só a de carrinho.

---

## O concorrente não abre o site — a comparação só vale onde tem lastro

**Decidido em** 2026-08-05 · **por** CEO · **origem:** revisão do site ao vivo,
olhando a home no celular

O hero da home abria com *"Quanto o {marketplace} leva do seu faturamento?"*.
Convertia como conta, e queimava o primeiro impacto: **a primeira imagem que o
dono forma do Foocci não pode ser a de alguém apontando para o vizinho.** A
pergunta não foi descartada — desceu para o topo da calculadora.

**Por que a linha passa aí:** na calculadora a comparação tem lastro — os números
são do próprio dono e a taxa é um campo editável. No hero seria afirmação nossa
sobre a casa dos outros, que é justamente o que a trava jurídica de 04/08 evita.

**O que muda para todos:**

1. **A regra é de LUGAR, não de proibição.** Nomear o marketplace é permitido
   onde o visitante informa os próprios números; não é, em peça de primeiro
   contato.
2. **O gancho de abertura é a dor de fundo, não o sintoma.** Comissão dói todo
   mês, mas a causa é o cliente não ser do restaurante. Quem escrever peça nova
   de topo — página, anúncio, e-mail — parte daí.
3. Vale para qualquer superfície de aquisição, não só a home.

---

## Imagem do site é o produto fotografado, nunca banco de imagens

**Decidido em** 2026-08-05 · **por** Diretor, sob autorização do CEO ·
**origem:** *"o site está só com texto, botão e detalhes gráficos"*

Toda página de `/site` abre com um elemento visual. Onde o argumento é o produto,
a imagem é **captura da tela real** do Foocci rodando na padaria de demonstração
(`foocci-bakery`) — a mesma que o visitante pode experimentar em
`/site/experimente`. Fotografia de estilo de vida fica para o que é ambiente
(hospitalidade, salão, cliente), nunca para representar tela.

**Por que:** guardrail 7 aplicado à imagem. Mockup bonito de tela que não existe é
a versão visual de vender piloto como pronto — e é mais difícil de auditar que
texto, porque ninguém relê uma imagem.

**O que muda para todos:**

1. **Captura de produto é reproduzível ou não entra.**
   `scripts/site/capturar-produto.mjs` refaz as cinco; quem criar slot novo cria o
   passo no roteiro junto.
2. **Slot vazio degrada, nunca quebra.** `hasAsset()` decide em tempo de request;
   página sem a imagem cai no visual anterior em vez de abrir um buraco.
3. **Peso é requisito, não detalhe.** O público abre no 4G: cada captura fica
   abaixo de 400 KB.

---

## Diagnóstico de credencial é leitura pura — nunca uma cobrança de teste

**Decidido em** 2026-08-05 · **por** Diretor · **origem:** o CEO colocou o
`MP_PLATFORM_ACCESS_TOKEN` no Railway e a pergunta virou "entrou certo?"

Para saber se uma credencial de terceiro funciona, o sistema **pergunta pela via
mais barata que o provedor oferece** (no Mercado Pago, `GET /users/me`). Nunca
executa a operação real — nada de contratação de mentira em produção para
descobrir se o gateway responde.

**Por que:** a operação real deixa rastro que não se apaga: contrato falso na
carteira, objeto de recorrência no gateway, e-mail para um cliente que não existe.
E "presença de variável" **não é** a mesma pergunta que "a chave funciona" — token
vencido devolve `true` do mesmo jeito, e quem descobre a diferença é o cliente.

**O que muda para todos:**

1. Toda integração externa que sustenta dinheiro deve expor um diagnóstico
   **verificável de fora**, com veredito e a razão que o provedor deu.
2. **"Não deu para conferir" nunca vira "está tudo bem"** (guardrail 1). A tela
   diz que não sabe.
3. **O segredo nunca sai no veredito.** Isto é trava em código (`semSegredo`),
   não combinado — o teste que exigia isso reprovou a primeira versão, que ecoava
   um campo do gateway direto para o admin.

---

## Identificação por telefone: obrigatória onde nasce pedido, pulável só na mesa

**Decidido em** 2026-08-04 · **por** CEO · **origem:** conferência da Loja do
sushi-cazza em produção (a Loja oferecia "Identificar-se" como convite opcional)

O cliente **precisa** informar o WhatsApp para usar a **Loja** e o **chat com
IA**. No **QR da mesa**, continua podendo pular.

**Por que a linha passa aí:** a mesa é consumo presencial — o cliente já está
sentado, o pedido é do garçom, e barrar quem quer só ver o cardápio é atrito puro.
Loja e chat são o oposto: ali nasce pedido, cupom, endereço e histórico. Cliente
anônimo nesses dois quebra a atribuição de receita do CRM, impede recuperação de
carrinho e deixa o pedido sem dono verificável.

**O que muda para todos:**

1. A pergunta que decide se uma superfície nova exige identificação é **"aqui
   nasce pedido?"** — não "aqui tem checkout?" nem "aqui tem IA?".
2. **A marca de "já perguntei" não pode ser compartilhada entre superfícies de
   regras diferentes.** O `sessionStorage` `qr-welcome-seen-<slug>` é gravado
   pelo QR da mesa, onde pular vale; se a Loja consultar essa marca para decidir
   se pede identificação, quem pulou no salão entra na Loja anônimo. Portão que
   uma tela anterior desliga não é portão. Travado em
   `src/components/menu/identificacaoObrigatoria.test.ts`.
3. Tela sem saída **diz o porquê** e some com o que promete saída (o rótulo
   "pular", a alcinha de arrastar). Obrigatoriedade sem explicação lê como
   cobrança de dado.

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

## O aplicativo Meta é chave mestra, e chave mestra tem dono só dela

**Decidido em** 2026-08-01 · **por** CEO · **origem:** conversa com o Diretor, com o
painel do app à vista (`Foocci Whats`, App ID `893641126399955`)

Existe **um único aplicativo** da Foocci dentro da Meta, e ele serve **WhatsApp e
Instagram ao mesmo tempo**. Não são dois. Uma permissão negada, uma revisão
reprovada, um cadastro de empresa incompleto ou um segredo rotacionado sem
atualizar o Railway **derruba os dois canais de uma vez, para todos os clientes**.

O Diretor recomendou manter isso dentro de `canais` e **o CEO decidiu o
contrário** — com o argumento que venceu: `META_APP_SECRET` é **chave mestra**.
Quem a tem faz qualquer coisa dentro da Meta em nome da Foocci. Isso é **custódia
de credencial e governança**, não tráfego de mensagem.

**A fronteira: `meta` cuida da CHAVE; `canais` usa a PORTA.**

| É do `meta` | É do `canais` |
|---|---|
| o app não tem a permissão | a mensagem não chegou |
| o token morreu / nasceu curto | a DM caiu no filtro errado |
| o número não registra | o número corre risco de bloqueio |
| a assinatura do webhook não confere | o webhook chegou e roteou errado |
| rotacionar segredo | escolher provedor (Evolution × Meta) |

Seis entradas de vitrine migraram de `canais` para `meta`, com proveniência
preservada.

**O que muda para todos:** o teste de fronteira é uma pergunta só — *"isso quebra
WhatsApp e Instagram juntos?"*. Se sim, é do `meta`. E **segredo do app nunca
aparece em chat, log, documento ou commit** — esta casa já vazou dois (o PIN de 2FA
do WhatsApp e o client secret do Google), e nenhum dos dois tem rotação confirmada.

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

**RESPONDIDO pelo CEO em 04/08:** perguntado quantos restaurantes ainda dependiam
da Evolution, respondeu **"NENHUM"**. Some a etapa (b) — não há migração a fazer,
só remoção. E veio a ordem, repetida três vezes: *"EXTRAÇÃO TOTAL, NÃO QUERO UM
CÓDIGO DESSA EVOLUTION DENTRO DO FOOCCI"*.

**Executado em 04/08** por quatro frentes em paralelo (meta, crm, operação,
canais), com o Diretor consolidando:

- O roteamento virou Meta e só Meta. O buraco mais grave estava aqui: em falha de
  banco o código **caía na Evolution como reserva** — uma falha momentânea mandava
  mensagem pelo canal não homologado, exatamente o risco que a homologação existe
  para eliminar. Não há mais caminho alternativo, nem em erro.
- `WhatsAppProviderId` e `CRMProviderMode` viraram tipos de **um valor só**:
  reintroduzir um segundo canal é erro de compilação, não decisão de configuração.
  É o guardrail 4 aplicado — prompt é aviso, código é trava.
- A **rampa de aquecimento** (20→250 msgs/dia por idade do número) saiu junto: ela
  protegia uma sessão Web não oficial de banimento e, no aplicativo homologado, só
  segurava venda sem reduzir risco.

**A armadilha desta remoção, registrada para quem vier depois:** o normalizador e
o validador de telefone do projeto inteiro se chamam `normalizePhoneForEvolution`
e `isValidEvolutionPhone` (`src/lib/crm/normalizePhone.ts`) — e hoje estão no
caminho de envio da **Meta**. Quem varrer o repositório por "evolution" e apagar
sem ler derruba a validação de telefone de **todo** envio. Renomear é passo
separado, depois da extração, exatamente para não virar incidente.

## Cards do Garçom: categoria mostra tudo; fim de funil mostra 100% da categoria

**Data:** 2026-08-03 · **Decidido por:** CEO (em teste real no sushi-cazza) ·
**Registrado por:** Diretor do Foocci

Duas regras de produto, ditas pelo CEO como regra ("Isso é regra"):

1. **Pergunta de categoria mostra tudo — e só o que é da categoria.** "Tem
   sushi?" apresenta TODOS os itens de sushi, sem limite de quantidade. E nada
   que não seja sushi: métricas de venda (best-seller, prioridade, popularidade)
   **nunca qualificam** um item sem relação textual com a pergunta — elas só
   desempatam a ordem entre itens que já são relevantes. O bug que motivou a
   regra: os bônus de venda somavam pontos ANTES do filtro de relevância, então
   um best-seller de outra categoria entrava na resposta só por ser best-seller.

2. **Upsell de fim de funil mostra 100% da categoria.** Ao finalizar o pedido,
   as etapas de bebidas, sobremesas e extras apresentam TODOS os cards da
   categoria — o antigo teto de 6 cards foi aposentado. Upsell consultivo no
   meio do fluxo continua conciso; a regra vale para o funil de fechamento.

**Onde vive:** `src/services/ai/WaiterBrainV2.ts` (busca `searchMenuByQuery`,
funil `handleCheckoutStarted`, teto `capForCardScope`). **Travado por teste:**
`src/services/ai/tests/WaiterBrainV2.card-policy.test.ts` ("Regra CEO ①/②").
O teto técnico de segurança da categoria subiu de 50 para 200 cards — é proteção
contra catálogo patológico, não limite de produto.

## O Cardápio sem IA é o cardápio da mesa que compra — e esse é o nome

**Data:** 2026-08-04 · **Decidido por:** CEO ·
**Registrado por:** Diretor do Foocci

Correção de direção do CEO sobre o produto do plano básico, nas palavras dele:
o cardápio sem IA *"era pra ser igual ao cardápio da mesa (…) A única diferença
é que esse o cliente pode comprar, escolher produtos, e ter o checkout. É só
pegar o mesmo cardápio, replicar, e colocar os itens à venda e o processo de
checkout."*

Três consequências, todas executadas em 04/08:

1. **Igualdade por construção.** O visual do `/qr/[slug]` vive em
   `src/components/menu/*` e as duas superfícies (mesa e Cardápio sem IA)
   compõem os mesmos componentes. Divergir passou a ser impossível sem mexer no
   módulo comum — não é mais uma questão de disciplina de quem edita.
2. **A única diferença é a compra.** ProductModal em modo `commerce` (variantes
   selecionáveis, opções, adicionais, observação, quantidade), barra de carrinho
   integrada à nav de categorias, e o checkout provado de `/api/pedido/*`
   intocado por baixo. Preço no canal DELIVERY; a mesa segue DINE_IN, vitrine.
3. **O nome do produto é "Cardápio sem IA"** — não "Loja", não "Cardápio Loja".
   É assim que o cartão de QR do painel o chama e é assim que ele será vendido
   no plano básico. (`LojaClient`/`?modo=loja` sobrevivem como nomes internos de
   código e parâmetro; o que o lojista lê usa o nome oficial.)

**Contexto de corredor:** é a segunda correção de rota no mesmo produto em dois
dias (03/08: "não é a tela do /pedido sem IA"; 04/08: "é a réplica exata da
mesa"). O padrão a aprender: quando o CEO descreve uma superfície POR REFERÊNCIA
a outra ("igual à da mesa"), a entrega é a referência replicada — não uma
interpretação nova do mesmo requisito funcional.

## Cobra-se o que a tela mostrou — retirada precifica pelo canal de exibição

**Data:** 2026-08-04 · **Decidido por:** CEO (opção recomendada pelo Diretor) ·
**Registrado por:** Diretor do Foocci

Contexto: produtos podem ter dois preços (entrega × salão). As superfícies de
pedido exibem tudo no canal DELIVERY, mas a cobrança de **retirada** usava a
tabela DINE_IN — cliente podia ver um valor e pagar outro.

**A regra:** quando o cliente pede por uma superfície online, vale **o preço que
a tela mostrou**. Nunca surpresa de valor — a regra dos marketplaces.

Aplicação (04/08, mesmo dia):
- `/api/pedido/[slug]/finalize`: pickup precifica e promociona como DELIVERY
  (canal que o `/pedido` exibe). Taxa de entrega continua só para delivery.
- `WhatsAppCheckoutAdapter`: idem — a conversa exibe tudo em DELIVERY
  (extensão da mesma decisão pelo Diretor, com a evidência no código).
- Corolário para todo caminho novo de checkout: **canal de cobrança = canal de
  exibição.** A pergunta a responder antes de precificar é "que canal a tela
  usou?". Promovido à vitrine do `operacao`.
