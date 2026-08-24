# Plano de migração — da v1 para a v3

## O que se perde e o que se aproveita

A v1 entregou **planta errada** e **motor certo**. A migração troca a planta e preserva o motor.

| Entregue na v1 | Destino |
| --- | --- |
| Identidade interna, sessão, RBAC | **aproveitado**, com os perfis renomeados |
| Trilha de auditoria interna | aproveitada inteira |
| Ordem de serviço, projeto, tarefa, dependência | aproveitados inteiros |
| Handoff atômico + linha do tempo append-only | aproveitados inteiros — são a base da Fase 3 |
| 9 departamentos e 12 cargos | **substituídos** por 6 departamentos e 30 cargos |
| Catálogo de 37 fichas | **substituído** pelo catálogo v3 de 30 |
| Cargo de Gerente Geral | **removido** |

Nenhuma linha de código do motor é jogada fora. O que muda é o que ele descreve.

## Situação de fato que torna a migração barata

**Não existe nenhuma pessoa cadastrada e nenhuma ficha ativa.** Os cargos da v1 nasceram todos vagos, e as fichas nasceram todas em rascunho, com runtime desligado.

Isso significa que a migração **não move gente e não desliga nada que esteja rodando**. Ela reescreve um catálogo que ninguém ocupa ainda.

Se houvesse pessoas alocadas nos 9 departamentos, este documento seria bem mais longo — e o risco, bem maior.

## Ordem da migração

1. **Renomear os perfis** (`ALTER TYPE ... RENAME VALUE`) — operação não destrutiva do Postgres, preserva qualquer linha existente.
2. **Remover o nível de Gerente Geral** do enum de cargo.
3. **Semear os 6 departamentos** e marcar como inativos os 3 que saíram.
4. **Semear os 30 cargos** da v3.
5. **Semear o catálogo v3** sobre `AgentProfile`, com população EMPRESA.
6. **Aposentar as fichas da v1** que não têm equivalente na v3 — marcadas como superadas, **não apagadas**.

## Por que aposentar em vez de apagar

Apagar uma ficha tira do sistema a prova de que aquela função já foi considerada. Daqui a três meses alguém propõe "Agente de SEO" sem saber que ele existiu e foi removido por decisão do CEO.

Ficha aposentada aparece como aposentada, com a data e o motivo.

## Os três departamentos que saem

| Saiu | Para onde foi o trabalho |
| --- | --- |
| Marketing & Growth | **para fora da Foocci** — a Dioli executa. A Foocci só recebe o lead e devolve conversão |
| Produto e Experiência | fundido em Produto e Agentes de IA |
| Sucesso do Cliente e Suporte | fundido em Implantação e Sucesso do Cliente |

## O que a migração NÃO faz

- não aplica nada em produção;
- não cria pessoa;
- não ativa agente;
- não apaga documento histórico;
- não faz merge.
