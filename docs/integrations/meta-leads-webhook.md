# Lead do Facebook caindo no Foocci na hora (webhook da Meta)

**O que muda:** hoje o lead do anúncio cai numa planilha do Google e espera
alguém empurrar — foi assim que quatro leads quentes ficaram parados, um deles
36 horas. Com isto ligado, o lead entra no Foocci **no segundo em que a pessoa
aperta "Enviar"** no formulário do anúncio.

---

## 1. O que você vai colar na tela da Meta

| Campo da tela | O que digitar |
|---|---|
| **URL de retorno de chamada** (Callback URL) | `https://foocci.com.br/api/webhooks/meta/leads` |
| **Token de verificação** (Verify Token) | o mesmo valor que já está em `META_WEBHOOK_VERIFY_TOKEN` — é o mesmo do WhatsApp |
| **Campo a assinar** | `leadgen` |

> O token de verificação **não** é uma senha nova. É o mesmo que a casa já usa no
> webhook do WhatsApp. Se você não tem ele à mão, quem cuida do servidor lê o
> valor da variável `META_WEBHOOK_VERIFY_TOKEN` e te passa.

---

## 2. O passo a passo na tela

1. Entre em **developers.facebook.com** → seu aplicativo → menu da esquerda,
   **Webhooks**.
2. Na caixa de seleção do topo, escolha **Página** (Page).
3. Clique em **Assinar este objeto** (ou **Editar assinatura**, se já existir).
4. Cole a **URL de retorno de chamada** e o **token de verificação** da tabela
   acima e clique em **Verificar e salvar**.
   - Se aparecer *"Não foi possível validar a URL de retorno"*, o token digitado
     está diferente do configurado no servidor. Não é a URL.
5. Na lista de campos que aparece, procure **`leadgen`** e clique em **Assinar**.
6. Vá em **Meta Business Suite** → **Todas as ferramentas** → **Integração de
   leads** (ou, dentro do formulário do anúncio, a aba **Integração de leads**).
   Escolha a Página dos anúncios e confirme que o aplicativo do Foocci está
   listado como destino. Se a tela oferecer **Webhook**, ela já estará apontando
   para a URL acima.
7. Use o botão **Enviar lead de teste** (Lead Ads Testing Tool). Um lead de
   teste deve aparecer no Foocci Comercial em segundos.

---

## 3. O que precisa existir no servidor (para quem cuida do ambiente)

| Variável | Já existe? | Para quê |
|---|---|---|
| `META_APP_SECRET` | **sim** | conferir a assinatura de cada aviso da Meta. **Sem ela a rota recusa tudo** — de propósito. |
| `META_WEBHOOK_VERIFY_TOKEN` | **sim** | o token que você digita no passo 4. |
| `META_APP_ID` | sim | identificação do aplicativo. |
| `CRON_SECRET` | sim | libera a rodada que reaproveita lead que ficou pendente. |
| **`META_LEADS_PAGE_ACCESS_TOKEN`** | ⛔ **NÃO EXISTE — precisa ser criada** | é o que permite BUSCAR os dados da pessoa. |

### ⛔ A única peça que falta

O aviso que a Meta manda **não traz o nome nem o telefone** — traz só um número
de protocolo do lead. Para pegar os dados é preciso um **token de Página** da
Página que roda os anúncios, com a permissão **`leads_retrieval`**.

Esse token **não existe hoje em lugar nenhum do sistema**, e não dá para
improvisar com o que já existe: a credencial do aplicativo não serve para isso, e
o único token de Página guardado hoje pertence ao Instagram de um restaurante
cliente — usar o de terceiro não se faz.

**Enquanto ele não for criado, nenhum lead se perde**: cada aviso que chega fica
gravado como pendente e, no minuto em que a variável for preenchida, a rodada
automática busca todos e cria os leads atrasados de uma vez.

Como gerar (uma vez só): Graph API Explorer → escolher o aplicativo → permissão
`leads_retrieval` (+ `pages_show_list`) → gerar token da Página dos anúncios →
trocar por **token de longa duração** → salvar no servidor como
`META_LEADS_PAGE_ACCESS_TOKEN`.

---

## 4. Quando desligar a planilha do Google

Desligue só depois que os três itens abaixo estiverem verdadeiros:

1. `META_LEADS_PAGE_ACCESS_TOKEN` configurada no servidor;
2. o **lead de teste** do passo 7 apareceu no Foocci Comercial;
3. **sete dias corridos** em que todo lead do Facebook apareceu no Foocci sem
   ninguém mexer na planilha.

Até lá, deixe a planilha rodando em paralelo: ela é a rede de segurança, e ter
lead repetido não faz mal nenhum — a casa reconhece o mesmo lead e não cria ficha
dobrada nem manda a mesma mensagem duas vezes.

Para desligar, siga `docs/integrations/meta-leads-google-sheets.md` e remova o
gatilho de 1 minuto da planilha. Não apague a planilha: ela é o histórico.

---

## 5. O que o sistema garante (e não é promessa, é código)

- **Só a Meta consegue mandar lead.** Todo aviso vem assinado; assinatura errada
  é recusada. Sem o segredo configurado, a porta fica fechada — nunca aberta.
- **Lead repetido não vira lead dobrado.** A Meta reenvia o mesmo aviso em dias
  de instabilidade; o mesmo lead nunca gera duas fichas nem duas abordagens.
- **Lead não some.** Se a Meta não responder na hora da busca, o protocolo fica
  guardado e é tentado de novo — em vez de sumir em silêncio.
- **A hora de chegada é a real**, não a hora em que o sistema processou. É o que
  faz o painel de atraso dizer a verdade.
