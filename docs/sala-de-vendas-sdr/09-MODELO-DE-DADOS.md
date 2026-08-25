# 09 — Modelo de dados

## O que nasceu

Catorze tabelas, todas prefixadas por domínio para nunca se confundirem com as do
produto:

| Tabela | O que guarda |
|---|---|
| `lead_mensagens` | a conversa de WhatsApp do lead |
| `lead_qualificacoes` | a ficha 360º (1-1 com o lead) |
| `lead_score_fatores` | a **conta** que explica o score |
| `motivos_de_perda` | o catálogo estruturado |
| `lead_tarefas` | tarefas e follow-ups |
| `lead_compromissos` | demonstrações e reuniões |
| `lead_propostas` | propostas comerciais |
| `lead_handoffs` | passagens de bastão, com dossiê congelado |
| `sdr_disponibilidade` | estado e capacidade de quem atende (1-1) |
| `sdr_ia_config` | a configuração do TA (singleton) |
| `sdr_ia_config_versoes` | versões publicáveis e reversíveis |
| `cadencias` / `cadencia_passos` | sequências de toque |
| `lead_cadencias` | a inscrição de um lead numa cadência |
| `lead_avaliacoes_qa` / `lead_avaliacao_criterios` | o scorecard e as notas |

## O que `SiteLead` ganhou

Colunas **filtráveis e ordenáveis**, que moram na tabela principal porque a lista
de conversas as consulta a cada carregamento:

`email` · `score` · `scoreAt` · `temperatura` · `proximaAcaoEm` ·
`proximaAcaoNota` · `prioritario` · `tags` · `primeiraRespostaEm` ·
`slaVenceEm` · `ultimaMensagemEm` · `ultimaMensagemTexto` ·
`ultimaMensagemDeQuem` · `naoLidas` · `motivoPerdaId`

Buscá-las numa tabela ligada obrigaria um `join` por lead em toda listagem — e a
lista é a tela que mais abre no dia de quem trabalha aqui.

Os campos **descritivos** (segmento, unidades, dor, urgência…) ficaram em
`lead_qualificacoes`, porque a lista nunca os lê.

## As decisões de modelagem

### Cache declarado como cache

`ultimaMensagemEm`, `naoLidas` e `proximaAcaoEm` são espelho. A verdade são as
linhas de `lead_mensagens` e `lead_tarefas`. Está escrito no schema para ninguém
tratar o espelho como fonte.

### `waMessageId` é UNIQUE

A idempotência do webhook é uma restrição do banco, e não uma verificação em
código. Guardrail 4.

### `remarcadoParaId` encadeia

Remarcar cria um compromisso novo e aponta o antigo para ele. Sobrescrever a data
seria mais simples e apagaria a informação que interessa: remarcar três vezes é
um sinal, e um lead assim parece igual a qualquer outro sem a cadeia.

### `nota` e `score` aceitam `null`

Em `lead_avaliacao_criterios.nota` e em `SiteLead.score`. `null` significa "não
medido" ou "não se aplica" — e nenhum dos dois é zero.

### O motivo de perda é chave estrangeira

Não é texto. É o que permite responder "o que mais nos faz perder" com uma
consulta em vez de uma leitura de trezentas notas.

## A migração

`20260825180000_sala_de_vendas_e_sdrs` — **zero `DROP TABLE`, zero `DROP
COLUMN`**. Toda coluna nova é opcional ou tem padrão, e por isso a aplicação
atual sobe sem enxergar nada disto.

### O bloco do enum foi escrito à mão, e o motivo importa

O `prisma migrate diff` gerou o trecho sozinho, com **dois defeitos**:

1. **Cast direto** — `"stage"::text::"SiteLeadStage_new"`. Funciona em banco
   vazio e estoura em qualquer linha gravada como `CONTATADO`. Verificado:
   `ERROR: invalid input value for enum "SiteLeadStage_new": "CONTATADO"`, em
   tempo de migração, com o deploy no meio do caminho.
2. **Ordem errada** — alterava `lead_handoffs` e `lead_avaliacoes_qa` **antes**
   de criar essas tabelas, mais abaixo no mesmo arquivo. Falharia até em banco
   vazio.

Reescrito com `CASE` explícito, tocando só as duas tabelas que já existem. As
novas nascem com o tipo já convertido.

### Verificado com dados reais

Seis leads, um em cada etapa antiga, mais três linhas de histórico. Todos
mapearam corretamente, e o **histórico foi junto** — converter a etapa atual e
deixar a linha do tempo para trás produziria um lead em GANHO cuja história diz
que ele nunca passou por lá.

### Recriar em vez de renomear valor

O Postgres não remove valor de enum. Renomear deixaria `CONTATADO` e `FECHADO`
para sempre, e um enum com valores que a arquitetura aposentou é convite a
usá-los.
