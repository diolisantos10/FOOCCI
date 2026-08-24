# Arquitetura operacional da Foocci — v3

**Data:** 25/08/2026 · **Estado:** OFICIAL
**Substitui:** `docs/arquitetura-operacional-foocci-v1/` (9 departamentos) — **SUPERADA**

## O que mudou, e por quê

A planta anterior tinha **9 departamentos**. O CEO a considerou superdimensionada: ela reproduzia funções da agência Dioli que não pertencem à operação interna da Foocci.

A v3 tem **6 departamentos** e uma regra que a v1 não tinha: marketing não é departamento interno.

| v1 (superada) | v3 (oficial) |
| --- | --- |
| 1 · Marketing & Growth | **removido** — a Dioli faz a aquisição |
| 2 · Vendas e Receita | 1 · Vendas e Receita |
| 3 · Implantação e Onboarding | 2 · Implantação e Sucesso do Cliente *(fundidos)* |
| 4 · Sucesso do Cliente e Suporte | 2 · Implantação e Sucesso do Cliente *(fundidos)* |
| 5 · Produto e Experiência | 3 · Produto e Agentes de IA *(fundidos)* |
| 6 · Agentes e Inteligência do Produto | 3 · Produto e Agentes de IA *(fundidos)* |
| 7 · Tecnologia, Operações e Integrações | 4 · Tecnologia e Confiabilidade |
| 8 · Qualidade, Segurança e Compliance | 5 · Qualidade, Segurança e Governança |
| 9 · Financeiro e Administrativo | 6 · Financeiro e Administrativo |

Também saiu o cargo de **Gerente Geral**: o Diretor da Foocci já ocupa essa camada.

## Por que a v1 não foi apagada

Os documentos da v1 continuam no repositório, marcados como superados. Apagá-los tiraria a trilha de por que a estrutura mudou — e uma decisão sem o porquê é uma decisão que se repete.

O que a v1 produziu em **código** não é jogado fora. Ela entregou identidade interna, RBAC, trilha de auditoria, ordem de serviço, tarefa e handoff atômico. Tudo isso é reaproveitado; o que muda é a planta que ele descreve. Ver `10-PLANO-DE-MIGRACAO.md`.

## Ordem de leitura

| # | Documento | Para quê |
| --- | --- | --- |
| 01 | Hierarquia e governança | quem manda em quem, e como a ordem vira trabalho |
| 02 | **Departamentos e agentes** | o catálogo canônico — o código lê este arquivo |
| 03 | Sala de Vendas (SDR) | a tela de prioridade máxima |
| 04 | Funil comercial | as etapas e o que move o lead entre elas |
| 05 | RBAC e permissões | a matriz, e por que ela vive no servidor |
| 06 | Handoff IA ↔ humano | a transferência sem perda de contexto |
| 07 | Modelo de dados | o que reaproveita e o que nasce |
| 08 | Plano de construção | as 5 fases, em ordem |
| 09 | QA e critérios de aceite | como se sabe que acabou |
| 10 | Plano de migração | o caminho da v1 para a v3 |
| 11 | **Backlog** | o que ficou aberto, de quem é cada item, e o que trava o resto |

## As três regras que atravessam tudo

1. **Permissão vive no servidor.** Esconder menu não é autorização. Toda regra é validada em rota e em consulta ao banco.
2. **Nada nasce ligado.** Nenhuma IA é ativada por este programa. Ligar cada agente é decisão do proprietário, uma por uma, com gate.
3. **Não escrever zero quando a resposta é "não sei".** Vale para indicador, para score e para saldo.
