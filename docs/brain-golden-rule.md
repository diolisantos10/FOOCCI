# Regra de Ouro do Brain — A Lei do Raciocínio

> **Constituição portátil.** Vale para este e para qualquer projeto futuro
> construído sobre esta estrutura. As leis abaixo são **invioláveis** até serem
> alteradas por decisão humana explícita e governada (BrainChangeRequest).

---

## As duas leis

### Lei 1 — Todo raciocínio é feito por uma IA real conectada.

Todo agente, **sem exceção**, raciocina através de um motor de IA real (ChatGPT,
Claude, Gemini ou qualquer outro que estiver plugado). Entender a intenção do
cliente, interpretar o contexto, decidir o que responder e como agir dentro do
seu escopo é **sempre** trabalho da IA.

Nenhum agente pode ter um "cérebro paralelo" de regras hardcoded (cadeias de
`if/else`, regex, árvore de decisão fixa) **no lugar** do raciocínio. O motor de
IA é intercambiável — o fato de o raciocínio vir de uma IA, **não**.

### Lei 2 — Raciocínio é pensamento, não poder.

A IA **pensa e responde** — mas **nunca** altera as regras da interface, preços,
cardápio, regras de negócio ou o runtime. A Base de Conhecimento e as regras
configuradas são **a verdade**. A IA raciocina **dentro** dessa verdade; jamais a
reescreve. Quando falta informação, o agente diz *"preciso confirmar"* — nunca
inventa.

---

## O que é "raciocínio" — e o que NÃO é

| Raciocínio **É** (sempre via IA) | Raciocínio **NÃO é** (proibido) |
|---|---|
| Entender o que o cliente realmente quis dizer | Mudar regra da interface, layout ou fluxo |
| Interpretar intenção, tom e contexto | Definir ou alterar preço / cardápio / promoção |
| Escolher a melhor resposta dentro do escopo | Reescrever regra de negócio ou de segurança |
| Decidir quando pedir ajuda / escalar | Executar ação irreversível por conta própria |
| Usar a Base de Conhecimento como fonte da verdade | Inventar fato que não está na Base de Conhecimento |

---

## Como a lei é garantida (não é confiança — é mecanismo)

Uma regra que mora só num documento não segura nada. Para ser uma **garantia**,
a lei tem três dentes:

1. **Portão único de raciocínio.** Todo agente raciocina chamando **um só ponto
   de entrada**, que por dentro roteia para o motor de IA conectado. Não existe
   "responder ao cliente" sem passar por esse portão.
2. **Invariante verificada no CI.** Um teste automático **quebra o build** se um
   agente produzir uma resposta ao cliente sem passar pelo motor de IA — do mesmo
   jeito que `assertBrainSafety()` já protege as invariantes do Brain. Assim, é
   *fisicamente impossível* dar merge num agente que raciocina por regras.
3. **Escopo declarado por agente.** Cada agente declara seu escopo (o que pode e
   o que não pode fazer); a IA raciocina **dentro** desse escopo, nunca fora.

---

## Por que esta lei existe

O agente de WhatsApp ("Pedido Texto") nasceu raciocinando por **regex e
comparação de strings** — sem nenhuma IA — justamente porque **nada o impedia**.
Ele é a prova viva de que boa intenção em documento não basta. A Lei do
Raciocínio só vale com os três dentes acima: **portão único + invariante de CI +
escopo declarado.**
