# Sala de vendas — levantamento guardado (24/08/2026)

> ⛔ **NADA FOI CONSTRUÍDO.** O CEO disse "espera" e vai mandar o desenho da tela.
> Este arquivo é só o que eu já tinha apurado quando o trabalho foi interrompido,
> guardado para encurtar o caminho quando o desenho chegar. **Nenhuma linha deste
> documento é decisão tomada** — são achados de código e perguntas em aberto.

## O pedido, nas palavras do CEO

> *"O SDR trabalha dentro da plataforma. (…) uma plataforma onde o humano e o
> agente trabalham juntos. (…) Vai ficar dentro do admin, porém só os consultores
> ou quem vende produtos vai ter acesso."*

Regra de operação que ele deu: **a IA atende enquanto não há humano; o humano
entra quando quiser.** Não é IA sugerindo e humano aprovando.

## 1. Onde a tela encostaria (medido no código, não de memória)

| Peça que já existe | Caminho | O que ela já resolve |
|---|---|---|
| Admin de leads da Foocci | `src/app/admin/(area)/foocci-crm/` | lista de contatos, dossiê, mudar etapa, registrar interação |
| API desse admin | `src/app/api/admin/foocci-crm/` (`contatos`, `contatos/[id]/etapa`, `contatos/[id]/interacao`, `performance`, `_guard.ts`) | leitura e escrita já protegidas por guarda própria |
| Funil do lead | enum `SiteLeadStage` | `NOVO · CONTATADO · QUALIFICADO · PROPOSTA · FECHADO · PERDIDO` — o "desfecho" que a sala precisaria **já é dado, não texto livre** |
| Linha do tempo | `SiteLeadInteraction` | `CAPTURA · REENVIO_FORMULARIO · MUDANCA_ETAPA · MENSAGEM_ENVIADA · RESPOSTA_RECEBIDA · LIGACAO · REUNIAO · NOTA` |
| Entrada de WhatsApp de vendas | `FoocciSalesInbound.ts` | reconhece de quem é o "oi" e anota — **não redige e não envia** |
| Motor da entrevista | `/api/sdr/entrevista` | **no ar e desligado do mundo**: ninguém o chama. A sala seria o primeiro caller |
| Diário do SDR | `/api/sdr/diario` | o que já dá para mostrar na tela sem inventar métrica |

**Conclusão do levantamento:** a sala é **uma tela nova em cima de dados que já
existem**, não um subsistema novo. O que falta de banco é pouco: quem está
atendendo (IA ou humano) e quem é o responsável.

## 2. O que copiar do atendimento ao cliente final — e onde ele mora

O Foocci **já resolveu humano-e-IA na mesma caixa**, e o vocabulário está no
código, não em documento:

- `ConversationStatus` tem `AI_ATENDENDO` e `HUMANO_ASSUMIU` (além de
  `OPEN/BOT/HUMAN/RESOLVED`) — o par de estados que a sala precisaria.
- O botão **"Devolver para IA"** existe em `AtendimentoClient.tsx` (~linha 1971) e
  em `ChatClient.tsx`.
- Há um comentário nesse arquivo registrando um **bug já vivido**: a tela tratava
  uma conversa como "em mãos humanas" e só oferecia "Devolver para IA". Quem for
  construir a sala precisa ler esse trecho antes — o erro já foi cometido uma vez.
- Existem rotas de handoff prontas: `api/atendimento/handoff/acknowledge`,
  `acknowledge-all`, `check-timeouts`, `check-customer-inactivity`.

**Duas telas do mesmo produto resolvendo o mesmo problema de dois jeitos é dívida
garantida.** Se o desenho do CEO pedir outro vocabulário, isso precisa subir como
pergunta, não ser implementado calado.

## 3. O papel de "consultor" — o tamanho honesto do problema

**Hoje esse papel NÃO existe no produto.** O acesso é de dois tipos:

1. **global**, pelo `ADMIN_SECRET` (cookie de admin) — abre o painel inteiro da
   empresa;
2. **sessão de lojista** (NextAuth, com `restaurantId`) — que um consultor de
   vendas não tem, porque ele não é dono de restaurante nenhum.

Um terceiro papel é **mudança do modelo de acesso**, não uma tela: precisa de
usuário, de vínculo, e de **autorização rota por rota no servidor**. Esconder item
de menu não é permissão — um POST direto passa por cima de botão desabilitado.

**O menor recorte honesto que eu proporia** (quando o desenho chegar, e para o
CEO derrubar se quiser): nascer **dentro do admin já existente**, com toda rota
nova verificando a guarda de admin no servidor, e **dizer na cara que hoje quem
entra é admin** — sem inventar uma permissão de consultor que o código não tem. O
papel de verdade vira um bloco próprio, depois.

## 4. As perguntas que o desenho pode não responder

1. **Quando o humano assume, e como devolve** — um clique para cada? O lead é
   avisado da troca? Enquanto o humano está com a conversa, a IA fica muda?
2. **O consultor vê todos os leads ou só os dele?** (Hoje o time é uma pessoa.)
3. **O que o consultor pode fazer nesta primeira volta?** Conversar, assumir,
   devolver, marcar desfecho, ver histórico — e o que **não** pode: mexer em
   preço, plano ou desconto, que dependem das sete perguntas comerciais ainda sem
   resposta.
4. **A tela nasce sem envio.** `FOOCCI_SDR_SEND_ENABLED` está desligado: a caixa
   de escrever pode existir, mas **nada sai**. O desenho precisa dizer o que a
   tela mostra nesse estado — porque uma caixa de texto que parece funcionar e não
   envia é pior que uma caixa desabilitada com o motivo escrito.

## 5. O que continua valendo enquanto o desenho não chega

Envio desligado · lead esperando sem resposta automática · nada submetido à Meta ·
canal e WABA do Sushi Cazza intocados · nenhuma variável criada.
