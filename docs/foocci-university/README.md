# Foocci University

**Status:** fundação do conteúdo criada em 20/09/2026.  
**Responsável pelo conteúdo:** Sales Enablement / treinamento comercial.  
**Destino:** área Comercial Foocci.  
**Implementação da sala/telas:** será feita por uma IA arquiteta em etapa posterior.

## O que esta pasta é

Esta pasta é a **fonte de verdade do conhecimento de treinamento** para quem vende Foocci para donos e gestores de restaurantes.

Ela deve servir a dois públicos ao mesmo tempo:

1. **Pessoas:** SDRs, vendedores, consultores, gestores comerciais, QA e novos integrantes.
2. **Agentes de IA:** SDR, copiloto, supervisora, CRM comercial e outros agentes que precisem falar do produto sem inventar capacidade, preço, prazo ou resultado.

A Foocci University não é uma biblioteca de apresentações e não é documentação técnica do software. O objetivo é transformar o produto real em competência comercial:

> produto real → problema do restaurante → impacto → pergunta de descoberta → argumento → demonstração → objeção → próximo passo → avaliação.

## Regra de ouro

**Não escrever aulas definitivas antes de terminar o raio-X comercial do produto atual.**

O handoff recebido em 20/09/2026 contém um reconhecimento forte do produto e 101 arquivos-fonte, mas a leitura adversarial dos 14 domínios de código não foi concluída na sessão anterior. Portanto, qualquer material herdado é ponto de partida, não licença para repetir como fato o que ainda não foi revalidado.

## Hierarquia de evidência

Quando duas fontes divergem, vale a ordem abaixo:

1. comportamento medido no produto / rota funcional;
2. código atual;
3. fonte única de negócio no código (preço, contrato, política);
4. site público atual;
5. documentação oficial interna;
6. documento histórico;
7. inferência.

Documento antigo não vence código atual.

## Estados obrigatórios

Toda afirmação comercial relevante deve carregar um destes estados:

- **CONFIRMADO** — evidência atual suficiente no produto/código/fonte oficial.
- **INFERIDO** — existe evidência parcial, mas o comportamento ponta a ponta não foi provado.
- **NÃO VALIDADO** — não existe evidência suficiente.

E, quando aplicável, uma maturidade:

- **PRONTO**
- **DEPENDE DE TERCEIRO**
- **DESLIGADO POR PADRÃO**
- **PILOTO**
- **NÃO EXISTE**

## Estrutura desta pasta

- `00-ESCOPO-E-GOVERNANCA.md` — missão, regras e critérios de qualidade.
- `01-RAIO-X-COMERCIAL-V0.md` — retrato de partida, já reconciliado com evidências atuais que foram reabertas.
- `02-PLANO-DE-INVESTIGACAO.md` — os 14 domínios e o contrato de saída de cada investigação.
- `90-PENDENCIAS-E-LACUNAS.md` — decisões e lacunas que não podem ser preenchidas no improviso.
- `99-PARA-A-ARQUITETA.md` — contrato de consumo do material quando a sala for construída.

Os próximos arquivos serão criados somente depois da revalidação factual:
`03-MAPA-DE-FUNCIONALIDADES.md`, `04-PERFIS-DE-CLIENTE.md`, `05-MAPA-DE-DORES.md`, `06-POSICIONAMENTO-E-PITCHES.md`, `07-METODO-DE-VENDA.md`, `08-ROTEIRO-DE-DEMO.md`, `09-OBJECOES.md`, `10-BATTLECARDS.md`, `11-ECONOMIA-DA-VENDA.md`, módulos, role plays e certificação.

## Terminologia

A marca oficial é **Foocci**. “FUT/Fute” é nomenclatura interna legada e não entra em material comercial, aula, prova, simulação ou fala de agente.

## O que a arquiteta não deve fazer com esta pasta

- transformar `NÃO VALIDADO` em texto de aula;
- deduzir funcionalidade por nome de tela;
- ensinar promessa de resultado como garantia;
- transformar piloto em recurso pronto;
- copiar preço para outro lugar: preço deve continuar vindo da fonte única;
- construir uma experiência que permita a um agente “ser certificado” sem prova prática.

A sala será construída depois. **O conhecimento vem primeiro.**
