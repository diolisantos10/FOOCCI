# O corredor — decisões que atravessam domínios

> Decisão que afeta mais de um especialista não mora na sala de nenhum deles.
> Mora aqui. **Só o PM escreve neste arquivo.**
>
> Sem o corredor, uma decisão que toca três domínios vira três versões dela — cada
> uma na vitrine do seu dono, todas se achando certas, e em um mês elas se
> contradizem.
>
> Formato: o que ficou decidido, por quê, quem decidiu, quando, e o que muda.

---

## Toda proteção decide pelo estado, não por reflexo

**Decidido em** 2026-07-31 · **por** CEO + PM · **origem:** incidente da Nicole
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

**Decidido em** 2026-07-31 · **por** PM · **origem:** mesmo incidente

Verificador de fato (preço, cardápio, entrega) **não pega** agente que encena uma
capacidade que não tem. O agente não mentiu sobre o restaurante — mentiu sobre si
mesmo.

**O que muda para todos:** ao auditar comportamento de agente, as duas perguntas
são feitas separadamente. Todo canal declara o que ele **não** consegue fazer, e
isso vira trava em código, não linha de perfil.

---

## Prompt é aviso; código é trava

**Decidido em** 2026-07-31 · **por** PM · **origem:** "não prometa pedido" estava
no perfil do agente e não segurou

Para o que causa dano real, exija o mecanismo — gate, validação, restrição de
ferramenta. O aviso continua existindo **em paralelo** com a trava, nunca no lugar
dela.

**O que muda para todos:** vale inclusive na configuração dos próprios
especialistas: `tools:` restrito é trava; "não faça X" no prompt é aviso. Por isso
o agente `qualidade` não tem permissão de escrita.

---

## Um estado sem prazo é um vazamento

**Decidido em** 2026-07 · **por** PM · **origem:** comanda parada em `CLAIMED`
para sempre; carrinho abandonado eterno; falha permanente retentada sem fim

Todo estado intermediário — "em processamento", "reservado", "aguardando" — nasce
com prazo e com quem o resgata quando vence.

**O que muda para todos:** vale em impressão, pedido, envio de mensagem e fila de
campanha. Estado novo sem prazo não passa em revisão.

---

## O repositório é a memória; o chat é a sala de reunião

**Decidido em** 2026-08-01 · **por** CEO · **origem:** a reestruturação
CEO → PM → especialistas

Cada projeto passa a ter **um PM**, que é a ponte única do CEO. Assuntos deixam de
virar chats separados: viram despacho para especialista, e o resultado vira
registro no repositório **na mesma sessão**.

**O que muda para todos:** nenhum aprendizado durável pode existir só na conversa.
Sentiu que "isso é importante e está só no chat"? Pare e escreva agora — na
oficina do agente, se for do domínio; aqui, se atravessar domínios.

---

## Documentação não é evidência

**Decidido em** 2026-07 · **por** PM · **origem:** o comentário do Carteiro
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
