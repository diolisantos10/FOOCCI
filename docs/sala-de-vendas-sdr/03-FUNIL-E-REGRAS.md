# 03 — Funil comercial e as regras do movimento

## As onze etapas

| # | Etapa | O que significa |
|---|---|---|
| 1 | Novo lead | chegou. Ninguém falou com ele |
| 2 | Primeiro contato | recebeu a primeira mensagem nossa |
| 3 | Em qualificação | está respondendo; a descoberta anda |
| 4 | Qualificado | tem perfil, dor e interesse. Vale tempo de gente |
| 5 | Demonstração agendada | marcou. Ainda não aconteceu |
| 6 | Demonstração realizada | viu o produto funcionando |
| 7 | Proposta enviada | recebeu preço e condições por escrito |
| 8 | Em negociação | discute condição, prazo ou desconto |
| 9 | Fechado — ganho | virou cliente assinante |
| — | Fechado — perdido | terminal. Motivo estruturado obrigatório |
| — | Nutrição futura | não é agora, mas pode ser depois. **NÃO é perda** |

## Duas etapas ficam fora da conversão, por motivos opostos

**PERDIDO** sai do funil. Contá-lo como degrau faria a conversão mentir para
cima: todo mundo "avança" para perdido.

**NUTRICAO** também sai — e essa distinção custa dinheiro quando não existe.
"Não é agora" não é "não". Somá-lo à conversão inflaria o número; somá-lo à
perda apagaria a lista de quem voltaria a conversar em três meses.

## O que muda de 6 para 11

A planta anterior tinha `NOVO → CONTATADO → QUALIFICADO → PROPOSTA → FECHADO`.
O trecho cego era o meio: "contatado" cobria do primeiro oi à véspera da
proposta, e a **demonstração** — o degrau onde a venda acontece ou morre — não
existia. Sem separar agendada de realizada não há como responder a única
pergunta que interessa depois de marcar: *quantos aparecem?*

Mapeamento aplicado na migração, com `CASE` explícito:

```
NOVO        → NOVO
CONTATADO   → PRIMEIRO_CONTATO     (não EM_QUALIFICACAO: "recebeu mensagem"
                                    não prova que a descoberta começou)
QUALIFICADO → QUALIFICADO
PROPOSTA    → PROPOSTA_ENVIADA
FECHADO     → GANHO                ("fechado" também descreve o perdido, e
                                    relatório já somou os dois)
PERDIDO     → PERDIDO
```

## As regras do movimento

### Pular e voltar são permitidos

Um funil que só anda de um em um **obriga o vendedor a mentir**: a demo que
virou fechamento na mesma ligação passaria por três cliques em etapas que nunca
existiram, e a conversão contaria três degraus que ninguém subiu.

Voltar acontece de verdade — quem "ia fechar" volta para negociação. Proibir faz
o vendedor deixar o lead na etapa errada, que é pior do que registrar o
retrocesso.

### Sair de terminal exige gerente

GANHO virou contrato; PERDIDO entrou em relatório. Desfazer é **correção**, e
correção tem dono.

### Perder exige motivo estruturado

Motivo em texto livre não vira relatório: cada vendedor escreve "caro", "achou
caro", "preço" e "sem verba", e a pergunta que paga a próxima decisão de produto
— *o que mais nos faz perder?* — fica sem resposta.

O catálogo tem onze motivos, agrupados (preço, concorrência, produto, perfil,
contato). "Outro" exige detalhe — sem essa trava ele vira o maior motivo de
perda da empresa em dois meses e não explica nada.

### Toda etapa em aberto marca uma próxima ação

| Etapa | Prazo | O que cobra |
|---|---|---|
| Novo | 1 h | fazer o primeiro contato |
| Primeiro contato | 24 h | retomar se não responder |
| Em qualificação | 48 h | concluir a descoberta |
| Qualificado | 24 h | agendar a demonstração |
| Demo agendada | 24 h | **confirmar presença** |
| Demo realizada | 24 h | enviar a proposta |
| Proposta enviada | 48 h | retomar a proposta |
| Em negociação | 24 h | fechar ou entender o que falta |
| Ganho | 24 h | passar para implantação |
| Nutrição | 90 dias | retomar contato |

"Novo" tem o prazo mais curto porque é o único momento em que velocidade muda a
conversão de forma comprovada. "Demo agendada" cobra a **confirmação**, e não a
demo: demo marcada e não confirmada é a maior fonte de não comparecimento.

Nutrição sem data de volta é perda que ninguém admitiu — e a lista cresce sem
nunca ser trabalhada.

### Ganho prepara a implantação

Entrar em GANHO cria uma tarefa de passagem para o departamento 2 (Implantação e
Sucesso do Cliente). O handoff automático entre as áreas ainda não existe; a
tarefa existe para a venda não morrer entre as duas.

## A corrida no Kanban

Dois arrastes simultâneos são o caso comum, não o exótico — o gerente reorganiza
a coluna enquanto o SDR atualiza a conversa. A escrita é condicional na etapa de
origem: o segundo movimento recebe 409 e a tela mostra o estado atual, em vez de
gravar uma transição que nunca existiu.
