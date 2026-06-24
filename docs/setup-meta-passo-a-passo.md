# Guia: Conectar o Foocci à Meta (WhatsApp + Instagram + Facebook)

> Este guia é para a **equipe Foocci** fazer **uma única vez**. Depois disso, qualquer
> lojista conecta sozinho com 1 clique. Tempo estimado: 30-40 minutos.
>
> O que isto desbloqueia de uma vez só: **WhatsApp oficial da Meta**, **Instagram Direct**
> e **Facebook Messenger**.

---

## Antes de começar, tenha em mãos
- Uma conta no Facebook (pode ser a sua pessoal — ela só cria o "app", não aparece pro cliente).
- Acesso ao **Railway** (onde ficam as configurações do servidor Foocci).
- 30-40 minutos.

---

## PARTE 1 — Criar o App da Meta

1. Acesse **https://developers.facebook.com** e faça login com sua conta Facebook.
2. No topo, clique em **Meus Apps** → **Criar app**.
3. Em "Caso de uso", escolha **Outro** → **Avançar**.
4. Tipo de app: escolha **Empresa (Business)** → **Avançar**.
5. Dê um nome (ex: `Foocci Integrações`), confirme o e-mail → **Criar app**.

> ✅ Pronto: o app foi criado. Agora vamos pegar as "chaves".

---

## PARTE 2 — Pegar o ID e a Chave Secreta do app

1. No painel do app, menu esquerdo → **Configurações do app** → **Básico**.
2. Copie o **ID do aplicativo** (uma sequência de números).
3. Clique em **Mostrar** ao lado de **Chave secreta do aplicativo** e copie.

> Guarde os dois. Vamos colocá-los no Railway no final.
> - ID do aplicativo → vai virar `META_APP_ID`
> - Chave secreta → vai virar `META_APP_SECRET`

---

## PARTE 3 — Adicionar o produto WhatsApp

1. Menu esquerdo → **Adicionar produto** (ou "Painel").
2. Encontre **WhatsApp** → **Configurar**.
3. Ele vai pedir para vincular a uma conta comercial (Meta Business). Crie ou selecione uma.

### 3.1 — Criar o "Embedded Signup" (o botão de 1 clique do cliente)
1. Dentro do WhatsApp, procure por **Configuração** ou **Cadastro Incorporado / Embedded Signup**.
2. Crie uma configuração de cadastro. Ao salvar, ele gera um **Configuration ID**.
3. Copie esse **Configuration ID** → vai virar `META_CONFIG_ID`.

> Este é o ID que faz a janelinha "Conectar com a Meta" aparecer pro lojista.

---

## PARTE 4 — Configurar o Webhook (o "correio" que entrega as mensagens)

O webhook é o que faz as mensagens recebidas chegarem na Central de Conversas do Foocci.

### 4.1 — WhatsApp
1. No produto **WhatsApp** → **Configuração** → seção **Webhook**.
2. **URL de callback:** `https://foocci.com.br/api/webhooks/meta/whatsapp`
3. **Token de verificação:** invente uma senha aleatória (ex: `foocci-meta-2026-xY7k`).
   Guarde essa senha → vai virar `META_WEBHOOK_VERIFY_TOKEN`.
4. Clique em **Verificar e salvar**.
5. Em **Campos do webhook**, assine o campo **messages**.

### 4.2 — Instagram e Facebook (mesma tela de webhooks do app)
1. Adicione o produto **Instagram** e/ou **Messenger** ao app (menu "Adicionar produto").
2. **URL de callback do Instagram:** `https://foocci.com.br/api/webhooks/instagram`
3. **Token de verificação:** pode usar a mesma senha aleatória de cima.
4. Assine o campo **messages**.

---

## PARTE 5 — Permissões (para o app sair do "modo teste")

1. Menu esquerdo → **Revisão do app** → **Permissões e recursos**.
2. Solicite as permissões abaixo (a Meta revisa — pode levar alguns dias):
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `pages_show_list`
   - `pages_messaging`
   - `instagram_basic`
   - `instagram_manage_messages`

> ⚠️ **Importante:** enquanto a Meta não aprova, dá pra testar com **números/contas de teste**
> que você mesmo adiciona. Para clientes reais, precisa da aprovação. É um processo da Meta,
> não tem como pular — todos os concorrentes passam por isso.

---

## PARTE 6 — Colocar os valores no Railway

No Railway → projeto **FOOCCI** → aba **Variables**, adicione:

```
META_WHATSAPP_ENABLED=true
META_APP_ID=<o ID do aplicativo da Parte 2>
META_APP_SECRET=<a chave secreta da Parte 2>
META_CONFIG_ID=<o Configuration ID da Parte 3.1>
META_WEBHOOK_VERIFY_TOKEN=<a senha aleatória da Parte 4>
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<a mesma senha aleatória>
INSTAGRAM_APP_SECRET=<a mesma chave secreta>
NEXT_PUBLIC_META_APP_ID=<o mesmo ID do aplicativo>
NEXT_PUBLIC_META_CONFIG_ID=<o mesmo Configuration ID>
FOOCCI_BASE_URL=https://foocci.com.br
```

> ⚠️ As duas que começam com `NEXT_PUBLIC_` só funcionam **depois de um redeploy**.
> No Railway, clique em **Deploy** / **Redeploy** após salvar.

---

## PARTE 7 — Conferir

Depois do redeploy:
1. Entre no Foocci → **Integrações**.
2. Os botões **Conectar** do WhatsApp Meta, Instagram e Facebook devem ficar ativos.
3. Clique em qualquer um → deve abrir a janela de login da Meta.

✅ A partir daqui, **qualquer lojista** conecta sozinho: clica no botão, faz login na conta
dele da Meta, escolhe a página/número, e pronto. Sem mais nenhum passo técnico.
