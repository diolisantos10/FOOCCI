# 08 — QA de vendas

## O que este módulo se recusa a fazer

Item 13 do comando: *"Não avaliar apenas quantidade de mensagens. Avaliar
qualidade e capacidade de conversão."*

**Não existe contador de mensagens aqui**, e a ausência é a decisão. Uma conversa
de quatro linhas que marcou a demonstração é melhor que trinta que não foram a
lugar nenhum — e um scorecard que contasse volume diria o contrário, premiando
quem enrola.

## Os quinze critérios

| Critério | Peso |
|---|---|
| Velocidade da primeira resposta | 1 |
| Abertura | 1 |
| Clareza | 1 |
| Escuta e descoberta | 1,5 |
| Qualificação | 1,5 |
| Identificação da dor | 1,5 |
| Apresentação de valor | 1,5 |
| Personalização | 1 |
| Tratamento de objeções | 1,5 |
| **Segurança das informações** | **2** |
| Empatia | 1 |
| Próximo passo | 1,5 |
| Tentativa de fechamento | 1 |
| **Conformidade** | **2** |
| Registro correto no CRM | 1 |

Segurança da informação e conformidade pesam o dobro porque errar neles não é
vender mal — é criar problema jurídico ou prometer o que o produto não faz. Um
vendedor simpático que inventa funcionalidade custa mais caro que um vendedor
seco.

## As três regras

### 1. Nota baixa exige comentário

Abaixo de 3, o comentário é obrigatório. Um 1 sem explicação não ensina nada e
não se defende. O objetivo do QA é coaching, e coaching sem o "por quê" é só uma
nota ruim no fim do mês.

### 2. `null` não é zero

Critério que **não se aplica** àquela conversa fica em branco, e sai do
numerador **e do denominador**.

Se ficasse no denominador, uma conversa curta e correta — em que metade dos
critérios não se aplica — tiraria nota baixa por não ter tido a chance de
pontuar. O vendedor seria punido pelo tamanho da conversa, que é exatamente o
defeito que o item 13 manda evitar, entrando pela porta dos fundos.

Uma avaliação com os quinze critérios em branco é recusada: é uma avaliação
vazia com aparência de completa.

### 3. Quem é avaliado pode contestar

Avaliação sem direito de resposta vira ruído que o time aprende a ignorar — e um
QA ignorado é pior que nenhum: custa o tempo de quem avalia e não muda
comportamento.

Contestar é do **avaliado**. Revisar é do **gerente** — não do auditor, porque
quem deu a nota não julga o recurso contra a própria nota. Rever não obriga a
mudar a nota; obriga a **responder**.

## Evidência é chave estrangeira, não citação

Cada critério aponta para a **mensagem** que sustenta a nota.

Apontar, e não copiar, é o que permite abrir a conversa no ponto exato onde a
nota caiu. Uma citação copiada envelhece e não leva a lugar nenhum — e é
justamente o que quem foi mal avaliado precisa ver para aceitar a nota.

## Alerta crítico

Zero ou um em **segurança da informação** ou **conformidade** dispara alerta,
independentemente da média.

Um vendedor que inventou uma funcionalidade pode ter ido bem em tudo o mais, e a
média o esconderia atrás de um 78.

## A fila de revisão

Não é amostragem aleatória. Aleatório distribui o esforço de forma justa e
encontra pouco.

A fila prioriza:
1. **perdidos nos últimos 7 dias** — para aprender;
2. **leads quentes parados há mais de 2 dias** — para salvar.

São os dois lugares onde a revisão ainda muda alguma coisa.

## Desempenho de quem nunca foi avaliado

`desempenhoDe` devolve **"sem avaliações"**, não zero.

Mostrar zero para quem nunca foi avaliado colocaria o SDR novo no fim do ranking
na primeira semana, sem ninguém ter olhado uma conversa dele. É a mentira mais
cara desta tela.
