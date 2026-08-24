# Hierarquia e governança (v3)

## A escada

```
CEO / Master                    ← acesso integral
 └── Diretor da Foocci          ← acesso integral à operação Foocci
      └── Agente Gerente        ← um por departamento, obrigatório
           └── Agentes          ← IA, humano ou híbrido
```

Quatro níveis. Não há um quinto.

## As dez regras

1. **O CEO/Master tem acesso integral.** Tudo, em toda parte.
2. **O Diretor da Foocci tem acesso integral à operação Foocci.**
3. **Cada departamento tem obrigatoriamente um Agente Gerente.** Departamento sem gerente é departamento sem dono, e trabalho sem dono não é cobrado de ninguém.
4. **O Agente Gerente é subordinado ao Diretor da Foocci.** Direto, sem camada intermediária.
5. **O Diretor envia objetivos, decisões e ordens aos Agentes Gerentes.**
6. **Cada Agente Gerente transforma a ordem em backlog**, delega aos agentes do seu departamento e responde pelo resultado.
7. **O Diretor não opera rotineiramente delegando direto aos agentes subordinados.**
8. **Todo cargo abaixo do Diretor começa com a palavra "Agente".**
9. **Cada agente tem tipo configurável:** IA, HUMANO ou HÍBRIDO.
10. **Não existe cargo de Gerente Geral.** O Diretor já ocupa essa camada.

## A regra 7 é a que exige mecanismo

As outras nove se resolvem com estrutura de dados. A regra 7 — *"o Diretor não opera rotineiramente delegando direto aos agentes"* — descreve um **hábito**, e hábito não se implementa com `if`.

O que dá para fazer, e que é o que este programa faz:

- **Toda delegação registra o autor e o caminho.** Se o Diretor delegar direto a um agente, isso é gravado como tal.
- **A tela de departamento mostra o caminho normal:** o Diretor vê os 6 Agentes Gerentes, não os 28 agentes.
- **Existe um indicador**: quantas delegações do Diretor pularam o Agente Gerente, no período.

Não bloqueamos, e a distinção importa. Bloquear seria errado: numa urgência, o Diretor **precisa** poder falar direto com quem executa. O que não pode é isso virar rotina sem ninguém perceber.

**A regra vira número, e o número aparece.** Um pulo é exceção; trinta pulos por mês é uma estrutura que não está funcionando — e aí a conversa é sobre a estrutura, não sobre a regra.

## Ordem → backlog → resultado

O caminho de uma ordem do Diretor:

1. **Ordem** — o Diretor registra objetivo, resultado esperado, critério de aceite e prazo, endereçada a um Agente Gerente.
2. **Backlog** — o Agente Gerente quebra em tarefas, cada uma com responsável e prazo.
3. **Execução** — os agentes do departamento executam; o que atravessa departamento vira handoff.
4. **Resultado** — o Agente Gerente responde ao Diretor contra o critério de aceite que foi escrito no passo 1.

O critério de aceite é escrito no **começo**, não no fim. Sem ele, "pronto" vira opinião, e a discussão acontece quando o trabalho já foi feito do jeito errado.

## Tipo do agente é configuração, não código

Um agente pode ser IA hoje e híbrido amanhã, sem migração e sem deploy: o tipo é um campo.

Isso importa porque a empresa vai começar com quase tudo em IA ou vago, e vai trocar conforme contratar. Se o tipo fosse decidido em código, cada contratação viraria uma tarefa de engenharia.

## Cargo vago é informação

A hierarquia é construída sobre **cargos**, não sobre pessoas. Os cargos existem desde o primeiro dia e a maioria nasce **vaga**.

Isso é deliberado: inventar um "Agente Gerente Comercial" chamado Fulano para a tela não ficar vazia produziria exatamente a mentira que este programa existe para impedir — uma tela dizendo que alguém responde por uma área quando ninguém responde.

**Vago aparece como vago.** É informação, não defeito.
