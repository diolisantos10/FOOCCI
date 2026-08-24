# O site passa a mandar o visitante falar com o agente (24/08/2026)

> Ordem do CEO. Palavras dele: *"Esse botão laranja, 'Agende uma demonstração',
> não existe. (…) no canto da tela, um botãozinho do WhatsApp sinalizando 'tire
> suas dúvidas' (…) Lá no final também tem algumas páginas dizendo 'entre em
> contato e marque uma demonstração com o cardápio da sua empresa'. Isso não
> existe ainda, não sei nem quem criou, tem que tirar."*

## O achado — e ele é maior que uma troca de texto

A frase que o CEO não reconheceu **não estava numa página**: estava no texto
padrão da faixa de fechamento (`CtaBand`), que aparece no fim de **sete páginas**,
e repetida à mão dentro da seção do formulário. Ela prometia:

> *"Uma pessoa do Foocci mostra o sistema rodando com o cardápio e os números do
> seu restaurante."*

**Esse processo não existe.** Ninguém monta o cardápio de um prospecto para
mostrar numa reunião: não há quem faça, não há passo a passo, não há prazo. Era a
promessa mais cara do site, porque aparecia exatamente no momento da decisão.

**Nove lugares corrigidos** (a lista completa está no relatório do bloco), entre
título de faixa, subtítulo padrão, os três passos do "Depois que você enviar", três
respostas da FAQ e o "sob demonstração" da calculadora.

Um teste de texto (`semDemonstracaoPersonalizada.test.ts`) agora impede a frase de
voltar — inclusive num arquivo que ainda não existe. Ela volta com facilidade
porque é bonita.

## A mecânica: uma porta só, com interruptor no servidor

Todo botão comercial do site aponta para **`/site/falar-com-agente`** — caminho
interno. Quem decide o destino é o servidor, **a cada clique**:

| Estado | Para onde vai | O que o botão diz |
|---|---|---|
| Canal **no ar** | WhatsApp do Foocci (`wa.me`), mensagem já escrita | "Fale com nosso agente" |
| Canal **desligado** | o formulário (`/site/precos#demonstracao`) | "Agende uma demonstração" |

**Texto e destino nunca se separam.** Botão escrito "fale com nosso agente" que
cai num formulário é promessa quebrada no primeiro clique.

### Por que isso mata a armadilha do `NEXT_PUBLIC_`

`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` **congela no build**: salvar no Railway sem
refazer o build não muda nada — sem erro, sem log, sem sintoma. Agora:

1. **O número mora no repositório** (`NUMERO_DE_VENDAS = "5511943723316"`). Não é
   segredo: é o número que vai estampado num botão para o mundo clicar. Viaja com
   o deploy e não depende de ninguém configurar nada.
2. **A chave que acende é lida por requisição**, no servidor:
   **`FOOCCI_SALES_WHATSAPP_ATIVO=true`**. Sem `NEXT_PUBLIC_`, não entra em bundle
   nenhum — trocar no Railway vale na requisição seguinte, **sem build**.

**Ausência de configuração = desligado.** Silêncio não é permissão.

## O botãozinho do canto

Só aparece **quando o canal está no ar**, e só no **desktop**: no celular quem faz
esse papel é a barra fixa de baixo, que já é o convite da tela. Dois botões
disputando o mesmo canto do celular é ruído — e o dedo acerta o errado.

## O que NÃO mudou, de propósito

- **`FOOCCI_SDR_SEND_ENABLED` continua desligado.** O botão leva o visitante ao
  WhatsApp; **a casa não manda mensagem sozinha**. Quem escreve primeiro é sempre
  ele — e é isso que abre a janela de 24 h de texto livre da Meta.
- **O formulário continua existindo** e continua alimentando o CRM e a entrevista
  do SDR. Ele é a porta que funciona enquanto o número não estiver verificado.
- **O painel de WhatsApp do formulário** (o que aparece depois de enviar) segue
  dormente: ele lê a variável antiga, que continua sem valor. Ligá-lo é uma linha,
  e fica para quando o canal acender — não quis acender duas portas no mesmo dia.
- **A página de erro 404** também mostra o botão, mas ela é gerada no build: o
  rótulo dela só acompanha a virada do canal no deploy seguinte. O destino, esse,
  acompanha na hora — quem desvia é o servidor. Fica registrado por ser a única
  tela do site onde o texto pode ficar um passo atrás.
- **Nenhum texto novo promete preço, prazo ou desconto.** As sete perguntas
  comerciais continuam sem resposta.

## A prova de que o número atende (24/08/2026) — medida de fora, com controle

O CEO confirmou a verificação na Meta. **Verificado e recebendo mensagem não são a
mesma coisa**, e conferir pelo Graph exigiria manusear o token de vendas — que não
é meu. A medição honesta foi outra, sem token nenhum:

```
curl -sSL "https://wa.me/5511943723316?text=teste"
→ a página de conversa mostra o nome  Foocci
```

**O controle, que é o que transforma isso em prova:** um número inexistente
(`5511900000000`) devolve a mesma página mostrando o **número cru** —
*"Chat on WhatsApp with +55 11 90000-0000"*. Ou seja: quando aparece **nome**, há
conta de WhatsApp de verdade do outro lado, e o nome de exibição **Foocci** já foi
aprovado pela Meta.

Sem o controle, a primeira medição não valeria: eu estaria lendo uma página que
carrega igual nos dois casos e concluindo pelo que quis ver.

## O que continua na mesa do CEO

1. **Ativar o canal** — a medição acima já autoriza:
   `FOOCCI_SALES_WHATSAPP_ATIVO=true` no Railway. **Sem deploy.** Enquanto essa
   chave não existir, o site segue com o botão levando ao formulário, e dizendo
   isso. Cofre é do CEO; nenhum agente cria variável.
2. **A contradição do preço**, que este bloco não resolve: `/site/precos` publica
   a tabela e a FAQ dizia "o valor depende". Reescrevi a resposta da FAQ para
   apontar a página de preços, mas **quem decide o que o agente responde sobre
   preço continua sendo ele** — é uma das sete perguntas.
