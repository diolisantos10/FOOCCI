# O topo do site: dois botões — Entrar e Assinar (24/08/2026)

> Ordem do CEO, palavras dele: *"O botão laranja lá em cima, 'fale com
> especialista' ou coisa do tipo, tem que ser banido do site. No lugar disso,
> colocar pro cliente já assinar. Então é um botão pra entrar e um botão pra já ir
> pra tela da assinatura. E o contato com dúvida ou qualquer coisa do tipo é
> WhatsApp."*

## A pergunta que vinha antes de escrever qualquer coisa

**A tela de assinatura existe, ou o que existe é formulário que gera lead?**
Conferido no código E medido de fora antes de o botão ser escrito:

| O que | Onde | Estado |
|---|---|---|
| Tela de contratação | `/contratar/novo` | **existe** e responde 200 em produção |
| O que ela monta | `CheckoutClient` | escolhe plano e ciclo, aceita o Termo, pega os dados |
| Para onde ela manda | `POST /api/billing/checkout` | **cobra de verdade** — cria a recorrência no Mercado Pago e devolve `paymentUrl` |
| O preço | `@/lib/billing/pricing` | **fonte única do servidor**; o corpo do request não carrega centavos |
| O contrato | `recordAcceptance` | aceite gravado com nome, IP, data e versão **antes** do pagamento |
| Gateway em produção | `/api/health` | `mpPlatformToken: true`, `mpWebhookSecret: true` |

**Resposta: existe, e é self-service de verdade** — o dono de restaurante escolhe
o plano, aceita o Termo, paga e sai com a loja no ar, sem humano no meio.

Por isso o botão pôde ser escrito. **"Assinar" caindo num formulário de contato
seria a mesma doença que passamos a madrugada arrancando** — o texto prometendo o
que o destino não entrega —, só que com a palavra mais séria que um site pode
usar. Há teste travando o par: o rótulo é "Assinar", e a página do outro lado tem
de montar o checkout que cobra (`topoEntrarEAssinar.test.ts`).

### Uma degradação que existe e fica declarada
Se o gateway não estiver configurado, o checkout **não finge**: grava o aceite e
devolve `paymentUrl: null`, levando o cliente à página de obrigado sem cobrar.
Hoje, em produção, o gateway está configurado — mas quem for mexer nisso precisa
saber que esse caminho existe.

## O que ficou no topo

- **Entrar** — quem já é cliente.
- **Assinar** (laranja) — vai direto para `/contratar/novo`.
- **Sem plano na URL de propósito:** a tela abre no Crescimento mensal e o cliente
  troca ali, vendo os três preços. Escolher por ele seria empurrar plano.

## Onde a dúvida foi parar

- **Botão verde do canto**, com o SDR no WhatsApp — e ele **passou a aparecer no
  celular também**. Antes era só desktop, porque a barra fixa de baixo era o
  convite comercial do celular; agora aquela barra virou "Assinar", e sem essa
  mudança a dúvida ficaria sem porta justamente no aparelho em que quase todo dono
  de restaurante abre o site. No celular ele fica acima da barra, sem tapá-la.
- **As faixas de fechamento das páginas** continuam convidando a falar com o
  agente — é lá que mora "tire suas dúvidas", e é o que o CEO pediu.

## O que NÃO mudou

- **Preço: vale a tabela do site.** Nenhum valor, desconto ou condição nova.
- **Nenhum texto novo promete prazo, desconto ou caso de sucesso.**
- **`FOOCCI_SDR_SEND_ENABLED` continua desligado** — a casa não manda mensagem
  sozinha; quem escreve primeiro é o visitante.

## O painel dormente do formulário — a leitura pedida

Depois de enviar o formulário, o `DemoForm` mostraria um painel levando a pessoa
ao WhatsApp com a mensagem e o `#código` prontos. Ele está **dormente**: lê
`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`, que continua sem valor.

**Minha leitura: o papel do formulário mudou hoje, e mexer nele agora seria
trabalho jogado fora.** Até esta rodada ele era o destino do botão laranja do
topo — a porta principal. Agora a porta principal é *Assinar*, e a dúvida vai pelo
botão verde. O formulário virou a terceira porta: quem não quer assinar agora nem
abrir o WhatsApp, mas topa deixar o contato.

Duas saídas, quando o CEO quiser decidir:

1. **Acender o painel** (uma linha: fazer o `DemoForm` ler o mesmo
   `canalDeVendas` do resto do site). Ganha coerência — todo caminho de contato
   termina no mesmo WhatsApp. Custa: mais um lugar mandando gente para o SDR, cujo
   envio automático segue desligado.
2. **Aposentar o painel** e deixar o formulário como captura pura ("recebemos,
   a gente chama você"). Ganha simplicidade e reduz uma promessa. Custa: perde-se
   o `#código` que liga o "oi" do WhatsApp ao lead — e é justamente ele que evita
   o SDR perguntar o que a pessoa acabou de digitar.

**Eu recomendo a 1**, e só depois que a sala de vendas existir: acender o painel
antes de haver onde a conversa aterrissar aumenta o volume de gente falando com um
SDR que ainda não responde sozinho.
