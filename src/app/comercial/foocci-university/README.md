# Foocci University — Base de Conhecimento Comercial

> **Status:** material de treinamento em construção. Esta pasta NÃO é a implementação da sala.
> **Destino:** IA arquiteta responsável por transformar este conteúdo em experiência de treinamento dentro da Comercial Foocci.
> **Público final:** vendedores humanos e agentes de IA que vendem Foocci para donos e gestores de restaurantes.

## Missão

Transformar o conhecimento real do Foocci e as melhores práticas comerciais em um programa de formação capaz de preparar pessoas e agentes para vender o produto de forma consultiva, persuasiva, tecnicamente correta e sem promessas falsas.

O objetivo não é ensinar alguém a repetir funcionalidades. O vendedor deve saber:

- o que o Foocci é e o que ele não é;
- para quem serve e para quem não serve;
- quais dores de restaurante cada capacidade resolve;
- como diagnosticar contexto e prioridade;
- como traduzir produto em benefício operacional ou econômico;
- como demonstrar o produto;
- como lidar com objeções, negociação e fechamento;
- quais funcionalidades estão prontas, em piloto ou dependem de terceiro;
- quais afirmações comerciais são proibidas por falta de evidência.

## Regra estrutural

**Não construir aulas antes de fechar o RAIO-X factual do produto.**

Toda afirmação recebe uma das marcações:

- **CONFIRMADO** — validado em código, documentação normativa ou produto.
- **INFERIDO** — conclusão plausível a partir de documentação, ainda sem confirmação suficiente no código/comportamento.
- **NÃO VALIDADO** — não deve virar promessa comercial nem conteúdo afirmativo até verificação.

## Cadeia obrigatória por funcionalidade

`FUNCIONALIDADE → O QUE FAZ → DOR → CONSEQUÊNCIA → IMPACTO → ARGUMENTO COMERCIAL → COMO EXPLICAR → COMO DEMONSTRAR → LIMITES/CONDIÇÕES → STATUS DE EVIDÊNCIA`

Exemplo de padrão:

**Fraco:** “O Foocci tem CRM.”

**Correto:** “O Foocci organiza a base de clientes e identifica quem está ativo, esfriando ou perdido. Isso permite que o restaurante pare de tratar cada pedido como uma venda isolada e passe a trabalhar recompra. Pergunta de descoberta: ‘Você sabe hoje quais clientes compravam de você e pararam?’ Demonstração: abrir a ficha do cliente, segmentação e campanhas associadas.”

## Escopo da University

1. Produto Foocci.
2. Mercado e realidade operacional de restaurantes.
3. Perfis de cliente.
4. Mapa de dores.
5. Posicionamento e proposta de valor.
6. Método de venda consultiva.
7. Discovery.
8. Pitch.
9. Demonstração.
10. Objeções.
11. Preço, economia e negociação.
12. Alternativas e concorrência.
13. Fechamento.
14. Processo comercial e CRM interno.
15. Role plays.
16. Avaliação e certificação de humanos e agentes.

## Fontes-base

Começar sempre pelas fontes do próprio repositório:

- `CLAUDE.md`
- `docs/foocci-resumo-executivo.md`
- `docs/decisoes.md`
- `docs/pendencias.md`
- `docs/modelo-de-negocio.md`
- `docs/sala-de-vendas-levantamento.md`
- `docs/sdr-foocci-desenho.md`
- `docs/crm-foocci.md`
- `docs/DEVOLUTIVA.md`
- `src/app/comercial/`
- código real dos domínios de produto

O handoff recebido em 20/09/2026 também incluiu um dossiê de investigação e 101 arquivos-fonte. Ele é ponto de partida, não substituto da validação no código.

## Princípios comerciais

- Não vender como pronto o que está em piloto.
- Não garantir ROI.
- Não inventar economia, taxa, conversão ou aumento de faturamento.
- Não depreciar concorrente por slogan; comparar capacidades e contexto.
- O vendedor primeiro entende o restaurante; depois apresenta solução.
- Demo sempre conecta uma dor dita pelo prospect a uma função real.
- Objeção deve ser diagnosticada antes de ser respondida.
- Ausência de informação não autoriza conclusão negativa.
- Promessa comercial precisa ser sustentada por evidência verificável.

## Para a IA arquiteta

Esta pasta é a **fonte de verdade pedagógica e comercial** da futura sala Foocci University.

A arquiteta deverá transformar os materiais em jornadas, telas, exercícios, quizzes, simulações, role plays, progresso e certificação. Ela não deve reinterpretar ou ampliar capacidades do Foocci por conta própria.

A arquitetura da sala só deve ser fechada depois que os documentos de RAIO-X, produto, dores, método e avaliação estiverem marcados como prontos nesta pasta.
