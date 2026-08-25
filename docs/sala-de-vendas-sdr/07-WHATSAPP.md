# 07 — WhatsApp

## O número

**+55 11 94372-3316** — o WhatsApp comercial da Foocci, decidido pelo CEO em
23/08/2026 e aceso no site em 25/08.

Ele está fixo em `src/components/marketing/config.ts`, e não numa variável de
ambiente: `NEXT_PUBLIC_*` congela no build, então a variável exigiria dois atos
— salvar e refazer o deploy — e o segundo é o que se esquece.

## As três chaves, e o que cada uma acende

| Chave | O que acende | Estado |
|---|---|---|
| `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` (ou o valor fixo) | o site leva a pessoa ao WhatsApp com a mensagem pronta | ✅ **aceso** |
| `FOOCCI_SALES_PHONE_NUMBER_ID` + `FOOCCI_SALES_ACCESS_TOKEN` | a **recepção**: o "oi" vira registro na Sala | ⛔ falta cadastro na Meta |
| `FOOCCI_SDR_SEND_ENABLED` | o **envio** | ⛔ desligada, por decisão do CEO |

Meio-configurado é desligado. Sequestrar a mensagem sem poder responder deixaria
o lead falando sozinho.

## Por que é o cliente quem manda o "oi"

Abordar quem nunca falou com a gente queima número e, no WhatsApp oficial, exige
modelo aprovado pela Meta. Se a conversa nasce do lado dele, abre a janela de
24 h de texto livre, o consentimento fica evidente e o risco de banimento cai a
quase zero.

O percurso: formulário no site → **lead gravado** → botão que abre o WhatsApp com
a mensagem escrita e o `#código` que liga aquele "oi" ao lead.

A trava de ordem não é código: a mensagem carrega um código que **só existe na
resposta do servidor**. Sem gravação não há código, sem código não há tela de
WhatsApp.

## Idempotência

`LeadMensagem.waMessageId` é **UNIQUE**, no banco.

A Meta reentrega webhook quando não recebe 200 rápido o bastante, e reentrega a
mensagem idêntica. Sem a trava, a conversa mostraria o cliente perguntando o
preço duas vezes — e o vendedor responderia duas vezes.

A trava é a restrição do Postgres, **não** um `findFirst` antes do `create`:
entre a leitura e a escrita cabe o segundo webhook, e ele cabe justamente quando
a Meta está reentregando em rajada.

Reentrega devolve `repetida: true`, e **não** erro: erro faria o webhook
responder 500, o que ensina a Meta a reentregar mais ainda.

## A ordem da conversa

`ocorreuEm` vem do carimbo da Meta; `createdAt` é quando gravamos. Numa
reentrega os dois diferem em minutos, e ordenar pela gravação embaralharia a
conversa — colocando a resposta antes da pergunta.

## O status de entrega é uma escada

```
PENDENTE → ENVIADA → ENTREGUE → LIDA
                  ↘ FALHOU (terminal, vence qualquer avanço)
```

A Meta manda `read` antes de `delivered` com frequência. Atribuir o último que
chegou faria o ✓✓ azul virar cinza na tela do vendedor, e ele concluiria que o
sistema está errado. Estaria.

`FALHOU` é estado de primeira classe e aparece **na própria bolha**: uma
mensagem que não chegou e se parece com uma que chegou faz o vendedor esperar
resposta que nunca vem.

## Tipos de mensagem

Texto, áudio, imagem, vídeo, documento e template. O que o sistema não sabe
representar entra como `NAO_SUPORTADO` **com o tipo cru guardado** — nunca
descartado.

O padrão do tradutor é `NAO_SUPORTADO`, e não `TEXTO`. Um default `TEXTO` seria
mais simples e mentiria: localização, contato compartilhado e figurinha entrariam
como texto vazio, e o vendedor veria uma linha em branco e concluiria que o
sistema perdeu a mensagem — quando ele a guardou e a descreveu errado.

## A janela de 24 horas

Três estados, e a tela precisa distinguir os três:

- **aberta** — texto livre sai;
- **expirou** — só modelo aprovado;
- **nunca falou** — a janela nunca chegou a abrir.

O aviso aparece **antes** de o vendedor escrever. Sem isso ele digita, aperta
enviar e recebe um erro de API que não explica nada.

## Opt-out

Terminal, todos os canais, para sempre. Verificado **no instante do envio**, e
não só no agendamento: entre uma coisa e outra a pessoa pode ter pedido silêncio.

A mensagem do pedido de silêncio é gravada como qualquer outra — ela **é** a
evidência do opt-out. Uma auditoria de LGPD que encontra a data sem o texto que a
originou não demonstra nada.

## Uma escolha que o CEO precisa fazer

Atender à mão hoje (WhatsApp comum instalado no chip) e entrar na API da Meta
depois **não cabem no mesmo número ao mesmo tempo**: a conta do aplicativo tem de
ser apagada antes, e isso apaga o histórico daquele aparelho.

Dá para fazer os dois em ordem. Só não é de graça. Detalhe em
`docs/whatsapp-vendas-passo-a-passo.md`.
