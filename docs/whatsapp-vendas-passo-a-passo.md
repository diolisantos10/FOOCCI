# WhatsApp de vendas da Foocci — o passo a passo do CEO

> Número decidido pelo CEO: **+55 11 94372-3316**.
> Objetivo: colocar esse número no ar como **canal de vendas da Foocci**, separado
> do canal do cliente.
>
> **Fato apurado, não hipótese:** a WABA onde vive o número do Sushi Cazza é
> `1045616451725086`, nome "Sushi cazza", em nome do negócio do cliente
> (`on_behalf_of_business_info` = "Sushi cazza", APPROVED). **A venda da Foocci
> não pode ser pendurada ali.** Este guia cria uma conta de WhatsApp **da Foocci**.
>
> ⛔ **Nada aqui liga o envio.** Depois de tudo pronto, o SDR continua calado até
> o CEO mandar ligar. E **nenhuma mensagem sai** enquanto `FOOCCI_SDR_SEND_ENABLED`
> não for `true` — que **não é** desta rodada.

---

## 🟥 LEIA ISTO ANTES DE COMEÇAR — três armadilhas que custam a tarde

**1. Não use o tradutor do navegador.** Tela da Meta traduzida pelo navegador
troca nome de botão e esconde campo. Se a sua tela estiver em português e o nome
não bater com este guia, **o lugar do botão é o mesmo** — vá pela posição descrita.
*(Onde exatamente se troca o idioma dentro da Meta: preciso confirmar.)*

**2. O chip do número precisa estar limpo.** Um número que já tem conta no
WhatsApp comum ou no WhatsApp Business (o aplicativo) **não entra na API** — a
conta antiga tem de ser apagada antes. O caminho tranquilo é um chip que **nunca
teve WhatsApp instalado**. Tenha o celular com esse chip na mão: vai chegar um
código.

**3. `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` CONGELA NO BUILD.**
Essa variável entra no site **na hora de construir**, não na hora de rodar. Salvar
ela no Railway **e não refazer o build deixa o site exatamente como estava** — sem
erro, sem aviso, sem log. Você vai olhar o site, não ver o botão de WhatsApp e
concluir que está quebrado. **Não está: falta o build.**
👉 Depois de salvar essa variável, **peça um novo deploy** (ou me avise que eu
disparo). As outras variáveis deste guia não têm esse problema.

---

## O que você vai ter no fim

**Uma coisa a menos desde 25/08/2026:** o número `5511943723316` **já está fixo no
código** (`src/components/marketing/config.ts`). Ele não precisa mais de variável
no Railway, e com isso some a armadilha nº 3 para ele — o número sobe junto com o
código. A variável continua existindo e, se preenchida, **vence** o valor fixo:
é por ali que se TROCA de número um dia, e aí a armadilha do build volta a valer.

Três coisas para me entregar:

| O que | Onde vai | Vira a variável |
|---|---|---|
| ID do número de vendas | Railway | `FOOCCI_SALES_PHONE_NUMBER_ID` |
| Token permanente | Railway | `FOOCCI_SALES_ACCESS_TOKEN` |
| Um segredo qualquer, longo, que você inventa | Railway | `SDR_DIARIO_SECRET` |

Tempo: cerca de 40 minutos, mais a espera da aprovação do nome de exibição.

> ⚠️ **Uma escolha que precisa ser feita ANTES de instalar o WhatsApp nesse chip.**
> As duas coisas abaixo não cabem no mesmo número ao mesmo tempo:
>
> - **Atender à mão hoje** — instalar o WhatsApp (comum ou Business) no chip e
>   responder quem chegar pelo site. Funciona imediatamente, sem Meta, sem token.
> - **Recepção automática depois** — o número entra na API da Meta e o "oi" vira
>   registro na Sala de Vendas sozinho. Para isso a conta de WhatsApp do aplicativo
>   **precisa ser apagada** antes (armadilha nº 2).
>
> Dá para fazer o primeiro agora e migrar para o segundo depois — só não é de
> graça: apagar a conta apaga o histórico de conversa daquele aparelho.

---

## PARTE 1 — Abrir a conta de WhatsApp da Foocci (separada do cliente)

O aplicativo Meta **já existe** e é o mesmo que recebe as mensagens hoje
(`Foocci Whats`). **Você não vai criar aplicativo nenhum** — vai criar uma conta
de WhatsApp nova **dentro dele**. Isso é requisito, não gosto: o nosso servidor só
aceita mensagem assinada por **um único aplicativo Meta**. Conta pendurada em
outro aplicativo simplesmente não chega.

1. Abra **https://developers.facebook.com** e entre com a sua conta.
2. No topo, **Meus Apps** → clique no aplicativo **Foocci Whats**.
3. No menu da esquerda, clique em **WhatsApp** → **Configuração da API**
   (em inglês: **API Setup**).
4. Nessa tela existe um seletor de **conta do WhatsApp Business**. Clique em
   **Criar uma conta do WhatsApp Business** (em inglês:
   **Create a WhatsApp Business account**).
5. Dê o nome **Foocci** a essa conta. **Não** escolha nada que tenha "Sushi" ou
   o nome de qualquer cliente.
6. Confirme.

> ✅ Agora existem duas contas de WhatsApp no mesmo aplicativo: a do cliente e a
> da Foocci. Elas não se misturam.

---

## PARTE 2 — Colocar o +55 11 94372-3316 nessa conta

1. Ainda em **WhatsApp** → **Configuração da API**, procure o campo **De**
   (em inglês: **From**) e clique em **Adicionar número de telefone**
   (em inglês: **Add phone number**).
   *(O mesmo lugar existe pelo WhatsApp Manager: ícone de caixa de ferramentas
   **Ferramentas da conta** → **Números de telefone** → **Adicionar número de
   telefone**.)*
2. Preencha:
   - **Nome de exibição:** `Foocci` — é o nome que o dono do restaurante vai ver.
     **Não** escreva promessa nem slogan aqui; a Meta reprova.
   - **Fuso horário:** Brasília.
   - **Categoria:** *preciso confirmar qual você prefere* — a mais próxima do que
     vendemos é software/tecnologia.
   - **Descrição do negócio:** uma frase simples, sem promessa de resultado.
3. Escolha o país **Brasil (+55)** e digite **11 94372-3316**.
4. Escolha como receber o código: **Mensagem de texto** (SMS) ou **Ligação**
   (em inglês: **Text Message** / **Phone**). Clique em **Avançar**.
5. Digite o código que chegou no celular e confirme.

> ⏳ O **nome de exibição** passa por revisão da Meta. Pode levar de minutos a
> alguns dias. O número já funciona antes da aprovação; o que fica pendente é o
> nome que aparece.

---

## PARTE 3 — Copiar os dois valores que eu preciso

1. Volte para **WhatsApp** → **Configuração da API**.
2. No seletor **De**, escolha o **+55 11 94372-3316**.
3. Logo abaixo do número aparece **Identificação do número de telefone**
   (em inglês: **Phone number ID**) — uma sequência longa de números.
   **Copie.** → é o `FOOCCI_SALES_PHONE_NUMBER_ID`.

> ⚠️ O token que aparece nessa mesma tela é **temporário** (vale ~24 h). Não use
> ele. O token que vale está na Parte 4.

---

## PARTE 4 — Gerar o token que não expira

1. Abra **business.facebook.com** → **Configurações do negócio**
   (em inglês: **Business settings**).
2. No menu da esquerda, clique em **Usuários do sistema**
   (em inglês: **System users**).
3. Clique em **Adicionar** (botão no canto superior direito) e crie um usuário
   chamado `foocci-sdr`. Função: **Administrador**.
4. Selecione o usuário criado e clique em **Atribuir ativos**
   (em inglês: **Assign assets**).
   - Escolha **Aplicativos** → marque **Foocci Whats** → ligue **Gerenciar
     aplicativo** (controle total).
   - Escolha **Contas do WhatsApp** → marque a conta **Foocci** (a que você criou
     na Parte 1, **não** a do cliente) → ligue **Gerenciar contas do WhatsApp
     Business** (controle total).
   - Clique em **Atribuir ativos**.
5. Clique em **Gerar token** (em inglês: **Generate token**), escolha o
   aplicativo **Foocci Whats** e marque estas três permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
6. **Copie o token na hora.** Ele aparece **uma única vez** — fechou a janela,
   perdeu, e você gera outro. → é o `FOOCCI_SALES_ACCESS_TOKEN`.

> 🔒 Esse token abre o envio de mensagem em nome da Foocci. Ele mora **só** no
> Railway. Não cole em chat, e-mail, documento nem me mande por aqui.

---

## PARTE 5 — Salvar no Railway

No serviço do Foocci, aba **Variables**, crie:

```
FOOCCI_SALES_PHONE_NUMBER_ID = (o da Parte 3)
FOOCCI_SALES_ACCESS_TOKEN    = (o da Parte 4)
SDR_DIARIO_SECRET = (invente uma senha longa, 20+ caracteres)
```

`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` **saiu desta lista** em 25/08/2026: o número
está fixo no código. Só crie essa variável no dia em que o número MUDAR — e, nesse
dia, a armadilha nº 3 volta a valer (salvar sem refazer o build não muda nada).

**NÃO crie** `FOOCCI_SDR_SEND_ENABLED`. Ela fica de fora — é ela que solta a
mensagem, e a decisão de soltar é sua, depois, com o diário na mão.

---

## PARTE 6 — O que acontece assim que isso ficar pronto

- O número passa a **receber**. Quem escrever é reconhecido pelo `#código` do
  formulário ou pelo telefone, e o contato entra no CRM da Foocci.
- **Nada é respondido.** O recepcionista anota e cala — por construção, não por
  esquecimento.
- O **diário do SDR** passa a poder ser lido em
  `https://foocci.com.br/api/sdr/diario`, com o `SDR_DIARIO_SECRET` no cabeçalho.

---

## O que eu ainda preciso confirmar (não completei de memória)

1. **A tradução exata de cada botão em português.** Confirmei os nomes em inglês
   na documentação da Meta de hoje; os nomes em português eu **não** confirmei
   tela a tela. Se um botão não bater, me diga o que você está vendo.
2. **Se este número vai precisar do passo extra de "registro" na API** (um PIN de
   6 dígitos). Quando o número é adicionado por essa tela, normalmente já sai
   registrado — mas a nossa tela interna de registro é amarrada a um restaurante,
   e o número de vendas não tem restaurante. Se travar, é um comando que eu rodo.
3. **A categoria do negócio** a escolher na Parte 2.
