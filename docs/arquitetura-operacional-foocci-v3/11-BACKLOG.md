# Backlog — o que está aberto

> Atualizado em 25/08/2026, depois da Sala de Vendas e do reforço de escopo.
>
> **Segue o padrão da companhia** — `docs/kit/11-backlog-do-diretor-geral.md`,
> espelho de `dioli-brain-kit`. Seções: Em execução · Fila · Depende do CEO ·
> Fechados.
>
> **Escrito em linguagem de negócio, a pedido do CEO.** Onde um termo técnico é
> inevitável, ele vem com a tradução ao lado. O detalhe técnico vive nos
> documentos do projeto, não aqui.

---

## A regra que governa este arquivo

**O CEO não é fila de aprovação.** Item que não precisa de decisão de dono,
**executa**. Item que precisa, vai para "Depende do CEO" **com a pergunta
pronta** — e o resto do trabalho continua andando sem ele.

---

## 🔨 Em execução

### Duas correções que vieram de você em 25/08

**1. O preço já está no site — e eu tinha dito o contrário.** Você corrigiu, e
estava certo: os três planos têm valor fechado e publicado desde 04/08
(Essencial R$ 179, Crescimento R$ 429, Performance R$ 899 por mês), com checkout
funcionando. Eu tinha montado um relatório em cima de um comentário velho no
código que dizia "preço ainda não publicado". O comentário foi corrigido em
três lugares, e o item de preço deste backlog foi reescrito para o que falta de
verdade — que é desconto, prazo e alçada, não preço.

**2. Quem ocupa as funções são agentes, e a ficha é minha de fazer.** Também
certo, e o item saiu de "depende de você". O que fiz: conferi **uma a uma** as 32
fichas e **nenhuma** estava completa. Foram preenchidas, e existe agora um portão
que reprova a próxima ficha que nascer torta.

⏳ **Falta ligar:** a base de preço da Sala foi construída e testada, e ainda não
tem tela. Enquanto não tiver, é trabalho pronto parado — a mesma categoria do
item F3 abaixo.

---

## 📋 Fila

Em ordem do que mais muda a vida de quem usa. Nenhum depende de decisão do CEO.

### F1 · A ficha vazia de quem chegou antes da Sala
**Tamanho:** pequeno.

> ⚠️ **Corrigido em 25/08, depois de o CEO perguntar "que contato antigo?".**
> Este item dizia *"a Sala abre vazia; quem já pediu demonstração não aparece na
> tela nova"*. **Está errado, e eu escrevi.** A Sala lê a mesma lista onde o
> formulário do site sempre salvou — todo contato antigo **aparece**, na fila
> "Sem responsável", porque é esse o estado com que ele nasce. Bastava ler o
> filtro da fila para ver, e eu não li antes de escrever.

O que é verdade é menor, e é isto: eles aparecem **sem conversa e sem nota**.
Não havia nem uma coisa nem outra quando entraram. O vendedor abre o cartão e vê
nome, cidade e mais nada — não sabe se aquela pessoa já foi procurada, nem por
quem.

**E não deve existir script que preencha isso.** Dar nota a um contato cuja ficha
ninguém respondeu é calcular sobre o vazio, e o número sairia com a mesma cara de
um número real. O que dá para fazer sem inventar nada é mostrar na tela **o que
se sabe de verdade** — data de entrada, origem, campanha — e dizer, escrito, que
o resto é anterior à Sala.

### F2 · Deixar arrastar o cartão no quadro do funil
**Tamanho:** médio.
O quadro já existe e mostra as onze etapas com a contagem de cada uma. O que
falta é **puxar o cartão de uma coluna para a outra** com o dedo. Hoje a etapa se
muda por uma lista, que funciona e é mais lenta.

### F3 · Ligar o motor do vendedor de IA ao mundo
**Tamanho:** médio.
O cérebro do vendedor de IA existe, está testado, **e nada o chama**. É trabalho
pronto parado — a pior categoria de item de backlog, porque não parece dívida.

⚠️ Isto é a **ligação técnica**, não a decisão de soltar a IA para falar com
cliente. Essa continua sendo sua, e está mais abaixo.

### F4 · Fechar a escrita dentro do banco de dados
**Tamanho:** médio.
Hoje o banco já impede que alguém **leia** o que não é dele, mesmo entrando por
fora do sistema. O que ele ainda não impede é **escrever**.

Em português claro: se alguém tivesse a senha do banco, não conseguiria ver os
contatos — mas conseguiria alterar. Fechar isso exige mexer em como o sistema
grava, e é por isso que ficou para depois em vez de ser feito pela metade.

---

## 🧍 Depende do CEO (não bloqueia a Fila)

| Pergunta | O que acontece enquanto não vier |
|---|---|
| **Aprovar o PR #150** (é o "pedido de aprovação" do trabalho) | tudo continua em rascunho, fora do ar |
| **Até quanto o vendedor pode dar de desconto além da tabela, prazo de implantação, formas de pagamento aceitas, e quem assina condição fora do padrão** | o vendedor responde preço normalmente, e trava na primeira exceção |
| **Cadastrar o número na Meta** (o dono do WhatsApp) | a mensagem continua caindo no aparelho e sendo respondida à mão |
| **Decidir o destino do chip** — atender à mão hoje **ou** automatizar depois | os dois não cabem no mesmo número ao mesmo tempo. Decidir depois custa o histórico de conversa daquele aparelho |
| **O e-mail que recebe pedido de ajuda está configurado?** | o cliente pede ajuda, o chamado é salvo e **ninguém é avisado** |
| **Data para desligar a senha única do sistema** | senha que dá acesso a tudo e não identifica quem entrou. Sem data, fica para sempre |
| **Quando soltar o vendedor de IA para falar com cliente** | é a última chave, e só depois de ver resultado |
| **Uma conta de teste separada** | sem ela não dá para testar do começo ao fim sem mexer em dado de gente de verdade |

---

## 🧾 Dívida velha (não é deste trabalho)

Nenhuma quebra nada hoje. O que as torna caras é a característica comum:
**nenhuma delas avisa quando dá errado.**

| # | O que é | Por que importa |
|---|---|---|
| D1 | O banco de dados não consegue ser montado do zero pela própria história | se um dia precisarmos criar um ambiente novo do nada, não sai pelo caminho normal. Hoje é contornado |
| D2 | Cerca de 750 avisos de código em testes antigos | ficaram invisíveis por anos porque essa parte não era conferida. Agora está medida e nomeada |
| D3 | Dois arquivos de teste com o mesmo nome, mudando só maiúscula | em Mac ou Windows um apaga o outro na cópia, e o time perde um teste sem notar |
| D4 | O envio de modelos de mensagem para a Meta ficou sem quem execute | sem modelo aprovado, campanha para quem não escreveu primeiro fica bloqueada para sempre. Nada falha, nada aparece — só não acontece |

---

## ✅ Fechados

| O que | Quando |
|---|---|
| Raio-x do que já existia, antes de escrever qualquer linha | 25/08 |
| Estrutura de 6 departamentos; a antiga marcada como superada, nada apagado | 25/08 |
| 34 fichas de função, todas nascidas vagas e desligadas | 25/08 |
| Seis perfis de acesso | 25/08 |
| **Sala de Vendas**: filas, conversa, ficha do cliente e passagem da IA para gente | 25/08 |
| Funil de 11 etapas, com a demonstração separada em marcada e realizada | 25/08 |
| Nota do lead **com a conta à vista** — mostra por que é 78 | 25/08 |
| Painel do gerente | 25/08 |
| Avaliação de qualidade das conversas, com evidência ligada à mensagem | 25/08 |
| **Login por e-mail e senha** — não existia; o vendedor não tinha como entrar | 25/08 |
| O vendedor cai **direto na Sala** ao entrar | 25/08 |
| **As nove fichas de agente comercial**, com tela de desempenho de cada uma | 25/08 |
| **Permissão dentro do próprio banco de dados** | 25/08 |
| Saída para o WhatsApp acesa, com o número 11 94372-3316 | 25/08 |
| Regra: entrega ao CEO é página com link, não arquivo | 25/08 |
| **As 32 fichas conferidas uma a uma e completadas** — nenhuma estava inteira | 25/08 |
| Portão que reprova ficha de agente sem trava, sem escalonamento ou sem medida | 25/08 |

---

## Notas

- **Este arquivo é a fonte; a página é a entrega.** O CEO não lê `.md` (ordem de
  25/08). O que sobe para ele é página publicada, gerada a partir daqui.
- Item fechado **não sai** da lista: vira linha em "Fechados" com a data. Backlog
  que apaga o que entregou perde a única prova de ritmo que existe.
- **O que NÃO está aqui, de propósito:** marketing dentro do Foocci (é da Dioli),
  cargo de Gerente Geral (o Diretor ocupa a camada), e reescrever o que já
  funciona. Se voltarem a ser propostos, são decisão nova — não item esquecido.
