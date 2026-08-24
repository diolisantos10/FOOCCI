# Funil comercial (v3)

O funil é da **Foocci vendendo para restaurantes**. Não confundir com o funil que o produto oferece aos restaurantes.

## As etapas

| # | Etapa | O que significa | Quem move |
| --- | --- | --- | --- |
| 1 | NOVO | chegou, ninguém falou com ele | entrada automática |
| 2 | CONTATADO | houve primeira resposta | SDR IA ou humano |
| 3 | QUALIFICADO | tem perfil, dor e momento | SDR IA ou humano |
| 4 | DEMONSTRACAO | viu a solução no contexto dele | Consultor e Closer |
| 5 | PROPOSTA | recebeu proposta formal | Consultor e Closer |
| 6 | FECHADO | assinou | Consultor e Closer |
| 7 | PERDIDO | não vai acontecer **agora** | qualquer um, com motivo |

## As regras duras

**Toda mudança de etapa registra quem moveu, quando e por quê.** Etapa que muda sozinha é etapa que ninguém explica depois.

**`PERDIDO` exige motivo padronizado.** Motivo livre vira 400 textos diferentes que não somam. Motivo padronizado responde "por que a gente perde", que é a pergunta que melhora a operação.

**`FECHADO` exige evidência de aceite verificável.** Sem isso, o funil vira otimismo.

**`FECHADO` NÃO é receita.** É promessa de receita. Receita é fatura confirmada pelo provedor de pagamento (`PlanInvoice`). Tratar fechamento como dinheiro é o erro que faz uma empresa comemorar faturamento que não entrou.

**Voltar etapa é permitido e registrado.** A vida real volta. O que não pode é voltar sem deixar rastro.

## Origem, campanha e atribuição

Todo lead carrega de onde veio: origem, campanha, UTM e identificador de clique. Isso já existe em `SiteLead` e é reaproveitado.

A Foocci **não** faz aquisição — quem faz é a Dioli. O papel da Foocci no ciclo é:

1. receber o lead gerado pela Dioli;
2. registrar origem, campanha e UTM;
3. distribuir para Vendas;
4. executar CRM comercial e follow-up;
5. **devolver à Dioli os dados de conversão e qualidade dos leads**.

O passo 5 é o que fecha o ciclo e é responsabilidade do Agente CRM e RevOps. Sem ele, a Dioli otimiza campanha no escuro — e a Foocci reclama da qualidade do lead sem nunca ter dito qual lead converteu.

## Distribuição

Automática e manual. Toda atribuição registra quem atribuiu — inclusive quando foi a regra automática.

Lead sem responsável cai na fila **"Sem responsável"**, que é visível e cobrada. Um lead sem dono não pode ser invisível.

## SLA

| Medida | Por que essa |
| --- | --- |
| tempo até a primeira resposta | é o número que mais move conversão em inbound |
| tempo em "aguardando humano" | mede o custo real do handoff |
| follow-up vencido | mede promessa não cumprida |

Sem SLA acordado, a tela escreve **"sem SLA"** — não "dentro do prazo". Verde afirmaria um acordo que ninguém fez.
