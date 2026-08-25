# "Mudaram a logomarca" — o que realmente aconteceu (24/08/2026)

> O CEO abriu `/contratar/novo` e disse: *"Mudaram a logomarca, não sei por quê."*

## Resposta curta: ninguém mudou. Aquelas telas nasceram erradas.

**A marca oficial** é o arquivo `public/brand/foocci/foocci-wordmark.png`
(200×50, transparente), registrado no brand book em
`docs/foocci-site/brand-implementation-v1.md` — que já mandava, desde o início:
*"Wordmark oficial no header/footer/gate (**substitui o texto**)"*.

**O que estava no checkout** era a marca **desenhada com texto e CSS**:
`f<span class="text-brand-500">oo</span>cci`. Não é o logotipo — é uma imitação
que depende da fonte instalada, do peso e do tom de laranja daquele dia.

**Desde quando:** commit `16cf3b5`, de **05/08/2026** (PR #107), o mesmo que criou
o fluxo de contratação. Medido com `git log -S` nas três telas: a imitação entrou
com elas e nunca foi trocada. Ou seja, **não houve troca de logo** — houve uma
tela que nunca passou pelo arquivo oficial, e ficou 19 dias assim sem ninguém ver.

## Por que isso é mais sério do que parece

Marca desenhada com texto **muda sozinha**: basta alguém ajustar tipografia, peso
ou a escala `brand-*` e o logotipo do dia seguinte é outro — sem erro, sem log,
sem alerta. É a mesma família de defeito que a casa irmã registrou no PR #324 da
Dioli, com a ordem explícita de *"não usar logo aproximada, texto `O°` ou marca
redesenhada"*.

E **anda em bando**: eram **três** telas, todas do fluxo de contratação —
`/contratar/novo`, `/contratar/obrigado` e `/contratar/[token]`. Justamente onde
o cliente está prestes a pagar, que é onde parecer outra empresa custa mais caro.

## O conserto

Um componente único, `src/components/brand/FoocciWordmark.tsx`, que serve o
arquivo oficial. As três telas passaram a usá-lo; **nenhuma escreve o caminho do
arquivo à mão**, para que trocar a marca um dia seja trocar uma linha.

Teste de texto (`marcaOficial.test.ts`) reprova se o padrão
`f<span>oo</span>cci` reaparecer em qualquer arquivo do `src` — inclusive num que
ainda não existe. O defeito volta sempre com a melhor das intenções ("é só um
título"), e é por isso que a trava é código e não recomendação.

## O link para comparar os planos

Pedido do CEO na mesma olhada: *"precisa de um link logo acima da tabela, levando
pra página dos planos, caso ainda tenha dúvida entre os planos."*

Ficou assim, logo abaixo do título "1. Seu plano" e **antes** dos botões de plano:
**"Ainda em dúvida entre os planos? Compare os três aqui"** → `/site/precos`.

**Abre em nova aba de propósito.** O que a pessoa já digitou no checkout vive no
navegador e some se ela sair da página. Mandar comparar preço e, de brinde, apagar
o cadastro dela seria pior do que não oferecer a comparação.

Sem prazo, sem desconto, sem promessa — e há teste barrando essas palavras nesse
trecho.
