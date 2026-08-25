# ADR-004 — O schema passa a ser dividido por domínio

**Data:** 24/08/2026 · **Estado:** proposto, aguardando aceite do proprietário
**Fase:** 0 · **Afeta:** Fase 1 em diante

## Contexto

`prisma/schema.prisma` tem **5.404 linhas e 143 models** num arquivo único.

O programa acrescenta cerca de 25 models de fundação na Fase 1 e outros tantos por departamento nas fases seguintes. Mantido o arquivo único, ele passa de 8.000 linhas antes da Fase 5.

Isso não é preciosismo de organização: um arquivo desse tamanho torna o diff de PR ilegível, e PR ilegível é PR aprovado sem leitura — que é como uma fundação inteira entra em produção sem ninguém ter conferido a fronteira entre prospect e restaurante.

O Prisma 5.16 suporta múltiplos arquivos de schema pela preview feature `prismaSchemaFolder`.

## Decisão

Adotar `prismaSchemaFolder` e dividir por domínio:

```
prisma/schema/
  base.prisma          datasource, generator, enums compartilhados
  restaurante.prisma   restaurante, cardápio, pedido, pagamento, fiscal, impressão
  agentes.prisma       AgentProfile, Brain, treino, simulação, waiter
  comercial.prisma     SiteLead, SDR, campanha, conversa comercial
  organizacao.prisma   Department, InternalUser, WorkOrder, Task, Approval… (novo)
```

A divisão é **mecânica**: mover blocos sem alterar uma linha de model. A migração resultante deve ser vazia — e essa é a verificação de que a mudança foi mesmo mecânica. Migração não-vazia aqui significa que algo foi alterado sem querer, e o PR não passa.

## Alternativas descartadas

**Manter o arquivo único.** Custo zero hoje, revisão inviável em dois meses.

**Dividir só o que é novo, deixando os 143 no arquivo velho.** Metade do schema organizada e metade não é pior que qualquer uma das duas — ninguém sabe onde procurar.

## Consequências

- PRs das fases seguintes tocam arquivos pequenos e revisáveis.
- É preview feature: fica registrado como dependência de versão do Prisma.
- **Não faz parte do PR da Fase 1.** Vai num PR próprio, isolado, cuja única prova de correção é a migração vazia. Misturar reorganização com mudança de conteúdo é o jeito de esconder uma alteração real dentro de um diff enorme.
