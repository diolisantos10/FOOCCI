# Backlog — o que está aberto depois da v3

> Atualizado em 25/08/2026, logo depois de as cinco fases fecharem.
>
> **Como ler:** a primeira tabela é a única que interessa se você tem dois
> minutos. O resto é detalhe para quem for executar.
>
> A regra deste arquivo é a mesma do resto da casa: **nada aqui é marcado como
> pronto por otimismo, e nada é omitido por ser incômodo.** Item que depende do
> CEO fica no nome dele, não escondido numa lista de engenharia.

---

## 1. O que trava tudo o resto

Três coisas. Enquanto elas não acontecem, o que foi construído existe e não opera.

| # | O que falta | De quem é | Por que trava |
|---|---|---|---|
| 1 | **Aprovar o PR #145** e dizer para qual branch ele vai | CEO | nada da v3 sai do rascunho sem isso |
| 2 | **Criar o primeiro acesso** (uma pessoa cadastrada) | engenharia, 1 comando | hoje a área interna responde 401 para todo mundo, **inclusive para o CEO** — e isso é a porta funcionando, não defeito |
| 3 | **As sete respostas comerciais** (preço, alçada de desconto, fidelidade, prazo de implantação, formas de pagamento, prova citável, quem fecha) | CEO | o SDR não consegue vender o que ninguém definiu. Sem elas ele trava na primeira pergunta de preço |

---

## 2. Depende do CEO

| O que | Consequência de não fazer |
|---|---|
| **Cadastrar o número na Meta** (`docs/whatsapp-vendas-passo-a-passo.md`) | o "oi" continua caindo num aparelho e sendo respondido à mão. Funciona — só não é automático |
| **Escolher o destino do chip antes de instalar o app** | atender à mão hoje e entrar na API depois não cabem no mesmo número ao mesmo tempo: a conta do aplicativo tem de ser apagada antes, e isso apaga o histórico daquele aparelho |
| **Confirmar o e-mail de escalada do suporte** | se estiver vazio, o cliente pede ajuda, o chamado é salvo e **ninguém é avisado** |
| **Dar data para desligar o `ADMIN_SECRET`** | porta antiga sem data de fechamento é porta que ninguém fecha |
| **Ligar o envio (`FOOCCI_SDR_SEND_ENABLED`)** | é a última chave, e é decisão dele — com o diário do SDR na mão, não antes |
| **Conta de teste isolada** | sem ela não há como exercitar o fluxo ponta a ponta sem tocar em dado real de gente |

---

## 3. Engenharia — o que dá para fazer sem esperar ninguém

Em ordem de quanto muda a vida de quem usa.

| O que | Tamanho | Por quê |
|---|---|---|
| **Semear os leads antigos** na Sala | pequeno, script de uma passada | a Sala abre vazia hoje. Quem entra vê um sistema que parece não ter nada |
| **Ficha 360º dentro da Sala** | médio | hoje o histórico do contato vive no CRM, noutra gaveta. O SDR atende sem ver com quem está falando |
| **Kanban da Sala** | médio | a lista existe e funciona; a visão de quadro é o que o time de vendas espera ver |
| **Ligar `/api/sdr/entrevista` ao mundo** | médio | o motor do SDR existe, é testado, e **ninguém o chama**. É trabalho pronto parado |

---

## 4. Dívida herdada — não é da v3, mas é real

Nenhum destes quebra nada hoje. Todos são a mesma categoria de risco: **coisas que
não avisam quando dão errado.**

| O que | Risco de verdade |
|---|---|
| **A cadeia de migrações não replica do zero** | um banco novo não consegue ser construído do começo pelo histórico. Enquanto isso, migração é gerada por diferença de schema e testada contra banco moldado na forma da produção |
| **~750 erros de tipo em arquivos de teste antigos** | ficaram invisíveis por anos porque teste era excluído do `type-check`. O portão novo cobre o código da v3; o passivo está medido e nomeado, não escondido |
| **Dois arquivos de teste diferem só na caixa da letra** | em Mac ou Windows um sobrescreve o outro no clone, e o time perde um teste sem ninguém notar |
| **A submissão de modelo à Meta ficou sem motor** (achado de 23/08) | as frases nunca chegam à revisão, e sem modelo aprovado a campanha fria fica bloqueada para sempre. Nada falha e nada aparece no log — só não acontece |

---

## 5. O que NÃO está neste backlog, de propósito

- **Marketing dentro do Foocci.** Saiu por decisão do CEO: a aquisição é da Dioli.
  Se voltar a ser proposto, é decisão nova, não item esquecido.
- **Gerente Geral.** O Diretor já ocupa a camada.
- **Reescrever o que já funciona.** Waiter, CRM, WhatsApp e Suporte não foram
  tocados, e não entram em fila para serem "melhorados" sem motivo escrito.
