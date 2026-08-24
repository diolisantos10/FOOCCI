# A primeira mensagem do SDR — proposta para o CEO aprovar

> ⛔ **Nada foi submetido à Meta.** Esta é a proposta do texto. Você aprova
> primeiro; a submissão é ato seu, depois.

## Por que esta mensagem não pode ser escrita por IA

No WhatsApp oficial, abrir conversa com quem **não escreveu primeiro** só é
permitido com **modelo aprovado pela Meta**: texto fixo, com lacunas. A IA não
escreve a primeira fala — ela só entra **a partir da resposta** do dono do
restaurante. Isso não é limitação nossa; é regra da plataforma. E, de quebra, é a
parte da conversa em que o risco de a IA prometer algo é maior — então a regra
joga a nosso favor.

## Regras que a mensagem obedece (e por isso ela é curta)

- **Não promete resultado**, número nem percentual — proibição já escrita e
  aprovada em `copy-decisions-v1.md`.
- **Não fala preço.** Enquanto as sete perguntas comerciais não voltarem, preço é
  escalada: *"vou confirmar e te retorno"*, nunca um número inventado.
- **Não diz "chatbot"** nem "substitui atendente".
- **Diz quem somos e por que estamos falando** — a pessoa deixou o contato, e
  lembrar disso é o que separa contato de abordagem fria.
- **Oferece saída** na primeira mensagem. O código já entende "PARE" e registra o
  silêncio para sempre.

---

## Opção A — a que eu recomendo (reconhece o formulário)

> Olá, **{{1}}**! Aqui é a Foocci. Você deixou seu contato no nosso site pedindo
> para conhecer o sistema (seu código é **{{2}}**).
> Posso te explicar por aqui como funciona no seu restaurante e tirar suas
> dúvidas? Se preferir falar depois, é só me dizer o melhor horário.
> Se não quiser mais receber mensagem, responda **PARE**.

- `{{1}}` = primeiro nome · `{{2}}` = o código `#XXXXX` do formulário
- Categoria sugerida: **MARKETING** *(a Meta pode aceitar UTILITY por ser resposta
  a um pedido da própria pessoa — preciso confirmar antes de submeter)*.

**Por que esta.** Ela cita o formulário e o código. Quem preencheu reconhece na
hora, e o código é o mesmo que liga a conversa ao contato no nosso CRM — é ele
que evita o "oi" sem contexto.

## Opção B — mais curta, sem o código

> Olá, **{{1}}**! Aqui é a Foocci, do sistema para restaurantes. Você pediu uma
> demonstração no nosso site.
> Quer que eu te explique por aqui como funciona no seu restaurante?
> Se não quiser mais receber mensagem, responda **PARE**.

**Por que ela existe.** Mensagem menor é lida mais. O preço é perder o código:
sem ele, quando a pessoa responder dias depois, o reconhecimento passa a depender
só do telefone — que funciona, mas erra mais (nono dígito, número trocado).

**O que eu recomendo:** **A**. A diferença de tamanho é de uma linha; a diferença
de rastreabilidade é permanente.

---

## O que vem depois da resposta

1. A pessoa responde → aí sim a IA entra, e ela **não inventa a fala**: as
   perguntas saem prontas do motor de regras e a IA só interpreta a resposta.
2. O que ela já disse no formulário **não é perguntado de novo** — restaurante,
   cidade, tipo e desafio já entram na entrevista.
3. Cada turno vira uma linha no **diário do SDR** — se a IA falhar, aparece lá,
   com o motivo.
4. Chegou em preço, prazo, desconto ou caso de sucesso **sem resposta sua**: o
   SDR diz *"vou confirmar e te retorno"* e para. Não improvisa número.

## Antes de submeter à Meta, preciso de você

- **Aprovar o texto** (A ou B), incluindo o nome que aparece: **Foocci**.
- **Confirmar se o SDR pode dizer preço** quando perguntarem — hoje o site
  publica a tabela e a FAQ diz "depende". Enquanto as duas coexistirem, o agente
  não tem uma resposta só, e é isso que ele vai encontrar na segunda mensagem.
