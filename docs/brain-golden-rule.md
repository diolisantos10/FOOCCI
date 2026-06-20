# Regra de Ouro do Brain — A Lei do Raciocínio

> **Constituição portátil.** Vale para este e para qualquer projeto futuro
> construído sobre esta estrutura. As leis abaixo são **invioláveis** até serem
> alteradas por decisão humana explícita e governada (BrainChangeRequest).

---

## O modelo (a analogia oficial)

- **Brain = o motor.** A estrutura de raciocínio **canônica e permanente** que
  orquestra todo o sistema. Tem nome, lógica e arquitetura próprios. **Nunca é
  trocado.** O Brain **NÃO é** a IA.
- **IA = o piloto.** ChatGPT, Claude, Gemini ou qualquer outra. Pluga no Brain e
  o **pilota**. É **troca‑troca** — pode ser uma, ou várias (uma por função).
- **Interface = o carro.** O produto que o cliente vê e toca.

> O Brain pensa. A IA dá a potência. A interface é onde tudo acontece.

---

## As duas leis

### Lei 1 — Todo agente raciocina através do Brain.

Todo agente, **sem exceção**, raciocina **através do Brain** (a estrutura
canônica de raciocínio). O Brain é **pilotado por uma IA real e plugável**.
Nenhum agente pode ter um "cérebro paralelo" de regras hardcoded (cadeias de
`if/else`, regex, árvore de decisão fixa) **no lugar** do raciocínio do Brain. A
IA é intercambiável; o fato de o raciocínio **passar pelo Brain**, não.

### Lei 2 — Raciocínio é pensamento, não poder.

A IA **pensa e responde** — mas **nunca** altera as regras da interface, preços,
cardápio, regras de negócio ou o runtime. A Base de Conhecimento e as regras
configuradas são **a verdade**. A IA raciocina **dentro** dessa verdade; jamais a
reescreve. Quando falta informação, o agente diz *"preciso confirmar"* — nunca
inventa.

---

## Os pilotos (IA): possibilidade, não obrigação

Hoje, o **único piloto plugado é o ChatGPT (OpenAI)** — e é só ele que vamos usar
por enquanto. A arquitetura, porém, mantém o **soquete aberto**: plugar Claude,
Gemini ou outra IA (uma ou várias, por função) é uma **troca de piloto governada**
(BrainChangeRequest), **sem reescrever o Brain**. Ter a possibilidade não obriga
a usar.

---

## O que é "raciocínio" — e o que NÃO é

| Raciocínio **É** (sempre via Brain) | Raciocínio **NÃO é** (proibido) |
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
   de entrada** (o Brain), que por dentro roteia para a IA‑piloto conectada. Não
   existe "responder ao cliente" sem passar por esse portão.
2. **Invariante verificada no CI.** Um teste automático **quebra o build** se um
   agente produzir uma resposta ao cliente sem passar pelo Brain — do mesmo jeito
   que `assertBrainSafety()` já protege as invariantes do Brain. Assim, é
   *fisicamente impossível* dar merge num agente que raciocina por regras.
3. **Escopo declarado por agente.** Cada agente declara seu escopo (o que pode e
   o que não pode fazer); a IA‑piloto raciocina **dentro** desse escopo, nunca
   fora.

---

## Por que esta lei existe

O agente de WhatsApp ("Pedido Texto") nasceu raciocinando por **regex e
comparação de strings** — sem nenhuma IA‑piloto — justamente porque **nada o
impedia**. Ele é a prova viva de que boa intenção em documento não basta. A Lei
do Raciocínio só vale com os três dentes acima: **portão único + invariante de
CI + escopo declarado.**
