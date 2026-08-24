# 04 — O TA, o Agente SDR de IA

> ⛔ **O TA está DESLIGADO.** `sdr_ia_config.ligado = false`, e nenhuma migração
> nem seed o liga. Ligar é ato humano, uma vez, com evidência.

## O que ele é

O SDR de IA da Sala. Recebe, responde rápido, faz descoberta, qualifica,
registra na ficha, calcula score, sugere o próximo passo e **passa para gente**
quando bate um gatilho.

## O que ele nunca faz

- não concede desconto;
- não altera contrato;
- não promete recurso que não existe;
- não afirma o que a base oficial da Foocci não confirma;
- não inventa preço, prazo ou condição.

As quatro primeiras são gatilho de handoff, e não um pedido no prompt: guardrail
4 — prompt é aviso, código é trava.

## Configuração

Duas camadas, separadas de propósito:

**Na versão** (muda com o produto, e é versionada):
identidade · tom de voz · objetivos · perguntas de descoberta · respostas
proibidas · gatilhos ligados · régua de score.

**Fora da versão** (limite operacional, não redação):
janela de horário · máximo de mensagens sem resposta · score que manda para
gente · modo de distribuição · SLA de primeira resposta · SLA de espera.

A separação existe para que **mudar o texto do prompt não amplie acidentalmente
o horário de disparo nem solte o desconto**.

## Versão, publicação e volta atrás

`SdrIaConfigVersao` guarda cada versão com situação (rascunho, em teste,
publicada, aposentada). Publicar é apontar `versaoAtivaId` para outra versão;
voltar atrás é apontar de volta.

Há **uma** configuração ativa por vez (`slug` único). Duas configurações ativas
produziriam duas IAs falando com o mesmo lead.

## O score, e por que ele não é opaco

O comando é explícito: *"mostrar os fatores que formaram o score"*.

A função devolve a **conta**, e não só o número: cada fator, o que foi observado,
quantos pontos deu, e com que versão da régua. A tela mostra a conta; o gerente
discorda de uma linha, não do número.

Um número que ninguém consegue contestar é um número que o time aprende a
ignorar — e aí o campo existe, aparece na tela, e não muda decisão nenhuma.

### Os pesos

| Fator | Pontos | Nota |
|---|---|---|
| Depende de marketplace | 22 | o maior sinal de compra |
| Unidades | 8–20 | porte |
| Volume mensal | 4–20 | porte |
| Dor identificada | 15 | |
| Urgência | 6–15 | "para ontem" vale mais |
| Já vende por WhatsApp | 12 | |
| Poder de decisão | 5–12 | dono decide |
| Engajamento | 3–12 | **contado**, não declarado |
| Orçamento | 8 | só quando informado |
| Sistema atual | 6 | |

Marketplace vale mais que porte de propósito: um restaurante de uma casa
sangrando comissão sente a dor que o produto resolve mais que uma rede de cinco
que não depende de ninguém.

### `null` não é zero

Lead sem nenhum sinal tem score `null`. Zero diria "avaliado e não presta"; null
diz "ninguém perguntou ainda" — que é a verdade, e é uma fila de trabalho.

A única vez em que zero é a resposta certa: `ehRestaurante = false`. Aí houve
avaliação, e ela deu negativa.

### As lacunas viram as próximas perguntas

A função devolve `lacunas`: o que falta perguntar. Sem elas, "não sei nada"
seria um beco — verdadeiro e inútil.

Orçamento **não** entra nas lacunas: perguntar faixa cedo demais queima a
conversa, e o comando pede que ele conte "quando informado".
