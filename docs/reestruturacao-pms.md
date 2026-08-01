# A reestruturação: um PM por projeto

**01/08/2026** · Desenho pedido pelo CEO · **Casa final deste documento:
`dioli-brain-kit`** (aqui é rascunho de trabalho até o kit receber a camada de PM)

> **O problema, na frase do CEO:** *"cada projeto tem um chat, e aí eu fico
> abrindo vários chats por assunto, e tratando de forma unilateral. Está ficando
> desgastante porque a quantidade de projetos está aumentando."*
>
> **A troca:** uma porta por projeto. Você fala com o PM; o PM decide quais
> especialistas aquele projeto precisa, despacha, cobra qualidade e registra. O
> repositório vira a memória — não o chat.

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
  CEO→PM→especialistas, moldes de código, lições de incidente.
- **Só este → projeto.** O que o produto é, quem são seus especialistas, o que
  está aberto, suas decisões locais.

O `CLAUDE.md` de cada projeto fica **curto de propósito**: ele responde *"o que é
esta casa e quem trabalha nela"*, e delega ao kit tudo que é regra de companhia.

---

## 3. Os PMs — quem ganha um, e quando

| # | Projeto | O que é | Estado hoje |
|---|---|---|---|
| 1 | **foocci** | Sistema operacional do restaurante (vendas, CRM, IA) | ✅ PM montado em 01/08, 8 especialistas |
| 2 | **foocci_manager** | POS/ERP — produto separado, hub de canais | 1 commit; blueprint pronto em `desenho-v1.md` |
| 3 | **dioli-agency-os-1** | O OS da agência | 88 commits, já aponta pro kit, README nunca escrito |
| 4 | **diolidigital** | Presença/site da Dioli | a mapear |
| 5 | **cityjobs** | Canal pago de vagas via Instagram Stories | 1 commit, MVP substituindo Tally+Make+Sheets |
| 6 | **multi-ai-council** | "Conselho": várias IAs respondem cego, um relator junta | 1 commit |
| — | **dioli-brain-kit** | **A casa.** Não é projeto — não ganha PM, ganha **curador** | 15 commits |

**Adormecidos** — `Dioli_Political`, `secretario`, `Dropshipping-Factory` (parado
desde abril). Ganham PM quando acordarem; montar agora é cerimônia.

### Por que o kit não ganha PM

PM existe para traduzir pedido de negócio em execução. O kit não tem negócio — ele
tem **doutrina**. O papel dele é curadoria: quando um projeto aprende algo que
serve para todos, **o PM daquele projeto propõe ao kit**, e a promoção é ato
humano. É a mesma regra da vitrine, um nível acima.

---

## 4. Os chats — o que dá e o que não dá

**Não existe forma de um PM ler as suas conversas.** Nem por branch, nem por
token, nem por identificador de workspace. A ferramenta não existe. Qualquer
desenho que dependa disso está morto na origem.

O que funciona é o caminho que o próprio CEO propôs: **exportar**.

```
1. EXPORTAR   você baixa a conversa e joga em docs/arquivo/<assunto>.md
2. MINERAR    o PM lê e distribui: decisão → decisoes.md · aberto → pendencias.md
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

**Regra prática:** exporte o chat **só se** o PM, depois de ler o repositório,
disser que falta alguma coisa. Cada PM entrega uma **lista de buracos** — curta e
específica, do tipo *"achei a decisão X mas não achei por que você escolheu Y"*.
Você responde o buraco, não o inventário.

---

## 5. A ordem de execução

**Fase 1 — A casa (primeiro, senão os 6 PMs nascem tortos).**
1. Levar `como-montar-estrutura-ceo-pm-agentes-v2.md` para o kit como
   `docs/08-modelo-ceo-pm-agentes.md`.
2. Criar `templates/CLAUDE.md.modelo` e `templates/agente.md.modelo`.
3. **Pagar a dívida:** reescrever o `CLAUDE.md` do Foocci para apontar ao kit em
   vez de copiar.

**Fase 2 — Provar num projeto real.** Rodar um despacho de verdade no Foocci
(candidato: o especialista `garcom` no P1 dietético, a pendência mais perigosa
aberta). Se ranger, conserta **uma vez** — não seis.

**Fase 3 — Os cinco PMs restantes**, um por vez, na ordem de uso. Para cada um:
raio-x do repositório → `CLAUDE.md` → especialistas → pendências → **lista de
buracos** para o CEO.

**Fase 4 — O ciclo pega.** Todo bloco termina com registro no repositório na mesma
sessão. É a única parte que não é código, e é a que decide se isso sobrevive.

---

## 6. O que só o CEO pode dar

Três perguntas por projeto, ~5 minutos cada. O repositório diz **o que existe**;
não diz **o que importa**.

1. **Para que serve e para quem?**
2. **Qual é a prioridade agora?**
3. **O que nunca pode acontecer aqui?** (o guardrail do projeto — como "nunca
   prometer número" é o da agência)

---

## 7. O risco real deste plano

Não é técnico. É de hábito.

A estrutura inteira falha se, na primeira urgência, abrir-se um chat novo "só
dessa vez". A partir daí a memória volta a morrer na sessão e o repositório vira
um museu de uma reorganização que não pegou.

**O sinal de que pegou:** o CEO passa uma semana sem abrir aba nova, e um PM
começa uma sessão já sabendo o que estava aberto sem ninguém contar.
