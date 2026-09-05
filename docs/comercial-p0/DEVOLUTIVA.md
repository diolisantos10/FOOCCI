# Devolutiva — Comercial Foocci P0

> No formato pedido em `07-ORDEM-DE-SERVICO.md`. Nada aqui é declarado pronto
> com base só em PR, CI ou tela aberta.

| Item | Estado |
|---|---|
| **URL** | `https://foocci.com.br/comercial` — no ar, conferido |
| **Acesso funcional** | ⛔ **não verificado** — ver bloqueio abaixo |
| **SHA implantado** | `78ec4a03` na branch padrão `claude/remove-legacy-runner-q8iXa` |
| **Railway** | deploy SUCCESS; app de pé; Postgres 18 |
| **Migrations** | as duas aplicadas em produção, confirmado no log do boot |
| **WhatsApp** | chaves presentes em produção; **valor ligado/desligado não legível daqui** |
| **Jornadas** | as três executadas contra Postgres real: 17 conferências verdes |
| **Kill switches** | prospecção nasce desligada (teto 0); `FOOCCI_SDR_SEND_ENABLED` segue do CEO |
| **Primeiro lote** | ⛔ não iniciado — depende de supervisão do CEO, como a ordem manda |

## Smoke de produção, no SHA implantado

| Endereço | Resposta | Leitura |
|---|---|---|
| `/comercial/entrar` | 200 | a porta abre |
| `/comercial/prospeccao` | 307 | manda para o login — certo, sem sessão |
| `/api/admin/sala-de-vendas/prospeccao` | 401 | recusa anônimo: *"sem sessão interna"* |
| `/admin/pessoas` | 307 | existe e é protegida |

## Reconciliação dos nove PRs que a ordem mandou examinar

**Oito estão mergeados** — #145, #154, #155, #160, #164, #165, #166, #178. O
trabalho deles já está na branch padrão.

**#179 está aberto e é rascunho obsoleto:** o commit de cabeça dele já é
ancestral da branch padrão (`git merge-base --is-ancestor` confirma). Não é
frente aberta; pode ser fechado.

⚠️ Existem **cinco outros PRs abertos** que a ordem não citou (#175, #170, #169,
#132, #69) e cujo trabalho **não** está na padrão. São frentes vivas de outros
assuntos, fora do P0.

## Critérios de aceite (doc 06) — o que está provado

**Entrada:** endereço abre a Comercial sem passar pelo Admin ✅ · não autorizado
não acessa ✅ · Admin e plataforma do restaurante **não aparecem** na navegação
da Comercial ✅ (conferido: a moldura não importa nada do Admin e não tem um
único link para lá) · **Diego possui acesso funcional ⛔ não verificado**.

**Lead e multicanal:** site cria/atualiza com origem ✅ · WhatsApp encontra ou
cria ✅ · item importado mantém proveniência ✅ · duplicidade conhecida não cria
duas carteiras ✅ · **nenhuma origem desaparece ao convergir no WhatsApp** ✅.

**Atendimento:** opt-out interrompe abordagem ✅ (inclusive em telefone de
formato legado) · autoria, assunção e handoff já existiam e seguem cobertos ·
**mensagem real de controle entrando e saindo ⛔ depende do canal ligado**.

**Operação:** webhook duplicado não duplica efeito ✅ (índice único, provado
contra banco) · botões de pausa funcionam ✅ · conversa sobrevive a reinício ✅
(vive no banco).

## ⛔ O bloqueio real, dito com precisão

**Eu não consigo comprovar que você tem acesso funcional**, e não vou dizer que
consigo. Motivo exato: criar ou conferir uma pessoa exige o `ADMIN_SECRET` ou
uma sessão de CEO — **nenhuma sala tem credencial**, por desenho.

**O caminho manual, em três passos:**

1. Abra `https://foocci.com.br/admin/pessoas` com a sua senha de administração
2. Se você já estiver lá, o acesso existe — entre em `/comercial/entrar`
3. Se não estiver, crie a sua pessoa naquela tela (papel **MASTER_CEO**) e a
   senha aparece **uma vez** — anote antes de fechar

Se a tela de administração não abrir, o caminho alternativo é o script
`scripts/criar-usuario-interno.ts`, que precisa ser rodado com acesso ao banco.

## Falhas encontradas e corrigidas nesta execução

1. **A tela de conferência consumia a lista** só de ser aberta — contatos saíam
   da fila sem ninguém ter falado com eles.
2. **Opt-out não era encontrado** em telefone de formato legado: o portão
   liberava a abordagem com convicção.
3. A correção de (2), na primeira tentativa, **ignorava o DDD** e grudava o
   contato na carteira de outra pessoa — pego pela jornada contra banco real.
4. Corrida entre dois SDRs criava dois leads para a mesma pessoa.
5. Teto do dia virava à meia-noite **UTC** (21h de Brasília, dentro da janela).
6. Ligar com teto zero ligava nada; `NaN` derrubava a rota.

## Lacunas posteriores que NÃO impedem vender

- `vendas.foocci.com.br` não existe ainda (código pronto e inerte; criar o
  domínio é ato do CEO);
- o teto da prospecção conta lead e não evento de abordagem — **pré-condição
  para ligar o envio**, registrada em `docs/pendencias.md`;
- a cadeia de migrations não reconstrói o banco do zero (defeito herdado de
  maio/2025), o que conversa com o backup nunca provado por restauração.
