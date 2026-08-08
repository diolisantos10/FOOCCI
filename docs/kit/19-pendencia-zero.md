<!-- ESPELHO-DO-KIT
origem: docs/19-pendencia-zero.md
kit-commit: e25aefbe3f4ffa143cd9b66a6f21a8a97b032c66
sha256-do-corpo: e3c47184d0a65063d27e23aa80d2df7762bc8d02b960531ef3d7efabbc922ab7
-->

> ⚠️ **ESPELHO GERADO — NÃO EDITE ESTE ARQUIVO.**
>
> Ele é uma cópia automática de `diolisantos10/dioli-brain-kit` → `docs/19-pendencia-zero.md`,
> no commit `e25aefb`.
>
> **Editar aqui não muda a doutrina** — muda só este repositório, e reprova o
> teste `src/services/doutrina/kitEspelho.test.ts` no próximo CI. Para mudar a
> regra, edite **no kit**; quem escreve lá é o CEO / Diretor Geral do Cérebro.
>
> Quem regenera: `.github/workflows/kit-espelho.yml`. Carimbo de versão em
> `docs/kit/_ESPELHO.json`.

<!-- FIM DO CABECALHO DO ESPELHO - daqui para baixo e conteudo do kit, sem alteracao -->
# 19 — Pendência zero: o sistema só para quando não há mais o que fazer

> **REGRA DE OURO. Obrigatória em todos os processos de todos os sistemas.**
> Ordem do CEO, 06/08/2026, nas palavras dele:
>
> *"Não existe a pergunta 'o que eu priorizo agora, isso ou aquilo?'. A regra é
> clara: tem que atacar TUDO. Enquanto estiver pendência, o sistema não para —
> só para quando não tiver mais o que fazer. 'Aí eu ataco o quê, hoje ou amanhã
> ou depois?' Não. Se tem pendência, tem que terminar."*

---

## A pergunta proibida

**"O que eu priorizo: isto ou aquilo?"** — esta pergunta está proibida na
companhia, e não por capricho. Ela carrega uma premissa falsa.

Priorizar fazia sentido quando quem executava era **um** — um humano, ou uma
sessão de IA fazendo tudo inline. Um executor precisa escolher, porque só tem
duas mãos. Mas esta companhia é multiagente (doc 18): o Diretor entrega ao PM,
o PM quebra e despacha, e **dez especialistas trabalham ao mesmo tempo**.
Nesse desenho, "priorizar" quase sempre significa uma coisa só: **adiar sem
motivo** — escolher qual pendência vai apodrecer.

A pergunta certa, para CADA pendência da lista, é outra:

> **"O que impede isto de estar rodando AGORA?"**

Se a resposta é "nada" — despacha. Agora. Todas.

---

## Os dois únicos estados legítimos de uma pendência

Toda pendência, a qualquer momento, está em um destes dois estados — e
**qualquer outro estado é violação**:

| Estado | O que significa | Prova |
|---|---|---|
| **RODANDO** | um agente está produzindo isto agora | o despacho existe |
| **BLOQUEADA, com o motivo à vista** | há uma trava REAL, nomeada, e alguém cobra a trava | o motivo está escrito na pendência |

Só existem **duas** travas reais:

1. **Dependência de outro trabalho que está rodando.** ("A auditoria espera a
   implementação terminar.") Dependência de trabalho que NÃO está rodando não
   é trava — é fila disfarçada.
2. **Decisão pendente do CEO.** E aí a pergunta ao CEO tem que já ter sido
   feita, com prazo — pendência esperando uma pergunta que ninguém fez não
   está bloqueada, está abandonada.

O que **não** é trava, por mais razoável que soe:

- *"Vou fazer depois do piloto / da entrega / da semana que vem."* Se dá para
  fazer com segurança agora, faz agora. Risco real se gerencia com teste,
  auditoria e conferência — não com adiamento.
- *"Não quero fazer muita coisa ao mesmo tempo."* Você não faz — os agentes
  fazem. Conflito de arquivo se resolve com isolamento, não com fila.
- *"É pequeno, faço quando sobrar tempo."* Não sobra. Foi assim que o roteiro
  ficou dois dias parado.
- *"Estou esperando o momento certo."* O momento certo de trabalho sem trava
  é agora, por definição.

---

## O que "o sistema não para" significa na prática

Uma sessão de IA termina, compacta, dorme. "Não parar" não é a sessão ficar
acesa — é isto:

1. **Nenhum turno termina com pendência solta.** Ao fim de qualquer turno,
   toda pendência está RODANDO ou BLOQUEADA-com-motivo. É o teste de
   conformidade do doc 18, elevado a lei.
2. **O backlog é varrido, não consultado.** Backlog não é cardápio de onde se
   escolhe o prato do dia — é a lista do que TEM que estar rodando. A
   varredura pergunta, item por item: "por que isto não está despachado?"
3. **A madrugada trabalha.** Rotina noturna, raio-x, vigia de pedido parado —
   o relógio da companhia não é o expediente de ninguém.
4. **Terminou tudo? Aí sim, para.** "Não há mais o que fazer" é o único
   estado de repouso legítimo — e ele é raro, honesto e verificável: backlog
   vazio ou 100% bloqueado com motivo à vista.

---

## O que esta regra NÃO autoriza

Atacar tudo não é atacar de qualquer jeito:

- **Não suspende a conferência.** Delegou não é entregou (doc 18, R5). Dez
  frentes rodando = dez conferências devidas. Velocidade sem conferência é o
  incidente de amanhã.
- **Não suspende as travas de qualidade.** Teste, type-check, deploy com SHA
  conferido, guardrails do sistema — tudo continua valendo em cada frente.
- **Não autoriza resolver em silêncio o que é do CEO.** Decisão pendente do
  CEO continua sendo dele (doc 08). A regra manda PERGUNTAR já — não decidir
  por ele.
- **Não transforma o Diretor em operário.** A regra convive com a hierarquia:
  atacar tudo = despachar tudo, não fazer tudo inline.

---

## O teste de conformidade

No fim de qualquer turno, olhe o backlog do seu sistema e responda:

1. Existe pendência que não está RODANDO nem BLOQUEADA-com-motivo?
   → violação. Despacha antes de encerrar.
2. Existe pendência "bloqueada" cujo bloqueio é outra pendência parada?
   → fila disfarçada. Despacha as duas.
3. Existe pendência esperando decisão do CEO cuja pergunta nunca foi feita?
   → abandono. Pergunta sai neste turno.
4. Existe item adiado por prudência ("depois do piloto") cujo risco real seria
   coberto por teste + auditoria + conferência? → adiamento sem trava.
   Despacha, com as travas de qualidade no critério de aceite.

---

## Registro

Escrito no kit por ordem direta do CEO em 06/08/2026, transmitida ao Diretor do
Foocci Manager — terceira regra do mesmo dia (17-placar, 18-despacho e
hierarquia, 19-pendência zero). As três se completam: o placar mostra o estado,
o despacho garante o começo imediato, e a pendência zero garante que nada
espera escolha. Manutenção do kit segue com o Diretor do Foocci.
