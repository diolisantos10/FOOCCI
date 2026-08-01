# A reestruturação: um Diretor por projeto

**01/08/2026** · Desenho pedido pelo CEO · **Casa final deste documento:
`dioli-brain-kit`** (aqui é rascunho de trabalho até o kit receber a camada de Diretor)

> **O problema, na frase do CEO:** *"cada projeto tem um chat, e aí eu fico
> abrindo vários chats por assunto, e tratando de forma unilateral. Está ficando
> desgastante porque a quantidade de projetos está aumentando."*
>
> **A troca:** uma porta por projeto. Você fala com o Diretor; o Diretor decide quais
> especialistas aquele projeto precisa, despacha, cobra qualidade e registra. O
> repositório vira a memória — não o chat.
>
> **E uma porta acima de todas:** o **Diretor Geral do Cérebro** — com quem o CEO
> fala sobre *todos* os projetos ao mesmo tempo (§3.1).

---

## 0. ⚠️ A regra que não tem volta

**Nenhum chat é fechado antes de ter sido exportado e minerado.**

Fechar um chat é irreversível. Todo o resto deste plano pode ser refeito — um
`CLAUDE.md` mal escrito se reescreve, um especialista mal recortado se conserta.
Uma conversa apagada não volta.

A ordem é sempre: **exportar → minerar → conferir que desceu → só então fechar.**
O Diretor do projeto confirma por escrito que o conteúdo virou decisão, pendência ou
regra antes de qualquer aba ser encerrada.

---

## 1. O que já existe (e muda o desenho)

Metade da estrutura já está de pé, construída em julho:

| Peça | Onde | Estado |
|---|---|---|
| **A casa** — filosofia, arquitetura, incidentes, memória de agente, segurança | `dioli-brain-kit/docs/` | 8 documentos, v1.1 |
| **Os moldes de código** | `dioli-brain-kit/templates/` | 6 núcleos extraídos do Foocci |
| **O raio-x por projeto** | `dioli-brain-kit/casos/` | foocci, dioli-agency-os |
| **A regra anti-cópia** | `dioli-agency-os-1/CLAUDE.md` | *"a fonte é o kit; cópia espalhada diverge"* |
| **O modelo organizacional** | `foocci/docs/como-montar-…-v2.md` | escrito, ainda **fora** do kit |

**A decisão mais importante já foi tomada e é do CEO:** regra não se copia, se
aponta. O `dioli-agency-os-1` diz por quê — *"aprende-se algo novo, atualiza-se um
repositório e esquece-se os outros, e em três meses ninguém sabe qual versão
vale"*. O desenho abaixo obedece isso.

> **Dívida que este documento cria e assume:** o `CLAUDE.md` que o Foocci recebeu
> em 01/08 **copiou** os guardrails em vez de apontar para o kit. Contradiz a
> regra acima. Entra como item da Fase 1 — pela hierarquia de conflito, o item de
> menor precedência é corrigido, não anotado.

---

## 2. O desenho

```
dioli-brain-kit/                    ← A CASA. Fonte única. Ninguém copia; todos apontam.
├── docs/
│   ├── 01-filosofia.md             ← já existe
│   ├── 02-arquitetura.md           ← já existe
│   ├── 06-incidentes.md            ← já existe
│   ├── 07-memoria-de-agente.md     ← já existe
│   └── 08-modelo-ceo-pm-agentes.md ← NOVO (vem do Foocci)
├── templates/
│   ├── CLAUDE.md.modelo            ← NOVO: o esqueleto do manual de bordo
│   ├── agente.md.modelo            ← NOVO: o esqueleto de especialista
│   └── (os 6 núcleos de código já existentes)
└── casos/<projeto>.md              ← o raio-x de cada projeto

<cada projeto>/
├── CLAUDE.md                       ← FINO. Aponta pro kit + o que ESTE projeto é
├── .claude/agents/*.md             ← os especialistas que ESTE projeto precisa
├── docs/pendencias.md              ← o que está aberto agora
├── docs/decisoes.md                ← o corredor (decisões que cruzam domínios)
├── docs/agents/<esp>/              ← as salas: vitrine + oficina (sob demanda)
└── docs/arquivo/                   ← os chats exportados, já minerados
```

### O que fica no kit e o que fica no projeto

A regra é uma pergunta só: **se eu aprender isso, quantos projetos precisam
saber?**

- **Mais de um → kit.** Filosofia, guardrails de comportamento, o modelo
  CEO→Diretor→especialistas, moldes de código, lições de incidente.
- **Só este → projeto.** O que o produto é, quem são seus especialistas, o que
  está aberto, suas decisões locais.

O `CLAUDE.md` de cada projeto fica **curto de propósito**: ele responde *"o que é
esta casa e quem trabalha nela"*, e delega ao kit tudo que é regra de companhia.

---

## 3. Os papéis

```
CEO (Dioli)
 │   decide o quê e o porquê
 ▼
DIRETOR GERAL DO CÉREBRO          ← a sessão da casa (dioli-brain-kit)
 │   o único interlocutor sobre TODOS os projetos ao mesmo tempo
 ▼
Diretor de cada projeto                ← uma sessão por projeto
 │   traduz, despacha, controla qualidade, registra
 ▼
Especialistas (.claude/agents/)   ← o Diretor decide quais o projeto precisa
```

### 3.1 O Diretor Geral do Cérebro ⭐

**Decidido pelo CEO em 01/08/2026.** Existe porque um Diretor enxerga um projeto, e
alguém precisa enxergar a companhia.

**Base:** `dioli-brain-kit` — a casa. É lá que mora a doutrina, e é de lá que ele
opera.

**O que é dele:**

- **A doutrina.** O que um projeto aprende e serve para todos sobe ao kit. Ele
  decide o que vira regra de companhia e o que fica local — e **promoção ao kit é
  ato dele com aval do CEO**, nunca de um Diretor sozinho.
- **A coerência entre projetos.** Quando dois projetos resolvem o mesmo problema
  de formas diferentes, é ele que percebe e decide qual vale.
- **A conversa larga com o CEO.** Prioridade entre projetos, o que começa, o que
  para, o que dorme. Um Diretor não tem como responder isso — ele só vê a própria casa.
- **A implantação dos Diretores novos** e a manutenção dos moldes.

**O que NÃO é dele:** executar dentro dos projetos. Trabalho de projeto é do Diretor
daquele projeto. Diretor que vira operário perde a única visão que justifica o
cargo.

**Por que o kit não ganha Diretor:** Diretor traduz pedido de negócio em execução. O kit não
tem negócio — tem doutrina. O papel certo ali é este.

---

## 4. Os Diretores — quem ganha um, e quando

| Projeto | O que é | Diretor |
|---|---|---|
| **foocci** | Sistema operacional do restaurante (vendas, CRM, IA) | ✅ montado 01/08 — 10 especialistas |
| **dioli-agency-os-1** | O OS da agência | ✅ já tem sessão que é o Diretor; aponta pro kit |
| **dioli-brain-kit** | **A casa** — doutrina, moldes, casos | — é a base do **Diretor Geral** |
| **diolidigital** | Presença/produto digital da Dioli | ⬜ **criar** |
| **foocci_manager** | POS/ERP — produto separado, hub de canais | ⬜ **criar** (blueprint pronto) |
| **cityjobs** | Canal pago de vagas via Instagram Stories | ⬜ criar |
| **multi-ai-council** | "Conselho": várias IAs respondem cego, um relator junta | ⬜ criar |

**Adormecidos** — `Dioli_Political`, `secretario`, `Dropshipping-Factory` (parado
desde abril). Ganham Diretor quando acordarem; montar agora é cerimônia.

> **A conferir com o CEO:** ele indicou que dois projetos já estão cobertos — um
> com sessão que já funciona como Diretor, outro que "já nasceu com a informação nova".
> A leitura acima é a mais provável (agency-os e o kit). Se um dos quatro marcados
> como "criar" já tiver sessão fazendo esse papel, ele sai da fila.

---

## 5. Os chats — o que dá e o que não dá

**Não existe forma de um Diretor ler as suas conversas.** Nem por branch, nem por
token, nem por identificador de workspace. A ferramenta não existe. Qualquer
desenho que dependa disso está morto na origem.

O que funciona é o caminho que o próprio CEO propôs: **exportar**.

```
1. EXPORTAR   você baixa a conversa e joga em docs/arquivo/<assunto>.md
2. MINERAR    o Diretor lê e distribui: decisão → decisoes.md · aberto → pendencias.md
              · regra de domínio → vitrine do especialista · regra de companhia
              → proposta ao kit
3. ARQUIVAR   o bruto vira perícia. NINGUÉM lê de novo.
```

**O passo 3 é o que faz isso funcionar.** Chat bruto como leitura obrigatória
recria exatamente o problema de contexto que estamos matando — só que agora dentro
do repositório, onde é pior, porque parece organizado.

### E o que já não precisa ser exportado

Muita coisa **já desceu**. O `foocci_manager` tem o blueprint inteiro em
`docs/desenho-v1.md`, com a nota *"rascunho aprovado em conversa"* e a decisão de
arquitetura datada. O Foocci tem 58 documentos que são o resíduo daqueles chats.
O kit tem `casos/` com raio-x por projeto.

**Regra prática:** exporte o chat **só se** o Diretor, depois de ler o repositório,
disser que falta alguma coisa. Cada Diretor entrega uma **lista de buracos** — curta e
específica, do tipo *"achei a decisão X mas não achei por que você escolheu Y"*.
Você responde o buraco, não o inventário.

---

## 6. A ordem de execução

**Fase 1 — A casa (primeiro, senão os 6 Diretores nascem tortos).**
1. Levar `como-montar-estrutura-ceo-pm-agentes-v2.md` para o kit como
   `docs/08-modelo-ceo-pm-agentes.md`.
2. Criar `templates/CLAUDE.md.modelo` e `templates/agente.md.modelo`.
3. **Pagar a dívida:** reescrever o `CLAUDE.md` do Foocci para apontar ao kit em
   vez de copiar.

**Fase 2 — Provar num projeto real.** Rodar um despacho de verdade no Foocci
(candidato: o especialista `garcom` no P1 dietético, a pendência mais perigosa
aberta). Se ranger, conserta **uma vez** — não seis.

**Fase 3 — Os cinco Diretores restantes**, um por vez, na ordem de uso. Para cada um:
raio-x do repositório → `CLAUDE.md` → especialistas → pendências → **lista de
buracos** para o CEO.

**Fase 4 — O ciclo pega.** Todo bloco termina com registro no repositório na mesma
sessão. É a única parte que não é código, e é a que decide se isso sobrevive.

---

## 7. O que só o CEO pode dar

Três perguntas por projeto, ~5 minutos cada. O repositório diz **o que existe**;
não diz **o que importa**.

1. **Para que serve e para quem?**
2. **Qual é a prioridade agora?**
3. **O que nunca pode acontecer aqui?** (o guardrail do projeto — como "nunca
   prometer número" é o da agência)

---

## 8. O risco real deste plano

Não é técnico. É de hábito.

A estrutura inteira falha se, na primeira urgência, abrir-se um chat novo "só
dessa vez". A partir daí a memória volta a morrer na sessão e o repositório vira
um museu de uma reorganização que não pegou.

**O sinal de que pegou:** o CEO passa uma semana sem abrir aba nova, e um Diretor
começa uma sessão já sabendo o que estava aberto sem ninguém contar.
