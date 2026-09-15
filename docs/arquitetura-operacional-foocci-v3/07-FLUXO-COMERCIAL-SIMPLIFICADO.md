# Sala Comercial — fluxo operacional simplificado

**Data:** 15/09/2026 · **Estado:** decisão do CEO · **Escopo:** lista fria, qualificação, venda e handoff

## Regra central

A Sala Comercial preserva as inteligências, travas, métricas, QA e governança já construídos, mas deixa de apresentar cada responsabilidade interna como um novo personagem na jornada.

Para o lead existem somente três interlocutores operacionais:

1. **CRM / Abordagem** — inicia contato, executa cadência, nutrição, reativação e follow-up.
2. **SDR — TA** — recebe quem respondeu, identifica decisor, descobre dor/contexto/interesse/timing, qualifica e roteia.
3. **Consultor Comercial** — diagnostica, demonstra, recomenda plano, trata objeções, apresenta proposta e fecha dentro da política vigente.

**Closer** e **Gerente Comercial** permanecem como alçadas de exceção e governança. Não são handoffs obrigatórios.

## Fluxo

`Lista fria → CRM/Abordagem → resposta → SDR/TA → qualificado → Consultor Comercial → proposta → fechamento → Implantação`

Sem resposta: CRM mantém cadência/nutrição. Recusa/opt-out: encerra abordagem. Contato errado com indicação: SDR registra o não decisor e a indicação; CRM aborda o decisor correto preservando a origem. Lead sem timing: CRM agenda próximo passo. Exceção de negociação: Closer/Gerente decide a alçada, mas o Consultor continua como interlocutor para preservar continuidade.

## Limite do SDR

O SDR não precisa fazer interrogatório longo. O objetivo é decidir se vale tempo de venda. Dor registrada + contexto operacional + interesse real são suficientes para handoff. Também há handoff imediato quando o lead pede humano, proposta/preço em contexto comercial, surge intenção de negociar, cai a confiança ou a régua de score atinge o limite.

O SDR não negocia desconto, prazo ou condição especial e não promete integração, funcionalidade ou roadmap inexistente.

## Decisor incorreto

Resposta como “não sou eu, fale com Maria” não é perda e não é qualificação. O registro passa a conter: contato original, status `não decisor`, decisor indicado, canal informado, origem da indicação e próxima ação. O decisor indicado retorna ao motor de abordagem.

## Consultor e fechamento

O Consultor é o vendedor principal e pode demonstrar, recomendar plano, apresentar proposta e fechar dentro da política comercial publicada. Isso elimina o handoff obrigatório Consultor → Closer.

Closer/Gerente entram apenas em desconto fora da alçada, condição de pagamento fora do padrão, exceção contratual, compromisso de roadmap ou outra decisão reservada. Resolvida a exceção, a conversa volta ao Consultor.

## Funções internas que deixam de ser personagens

Recepção e Qualificação continuam existindo como capacidades, métricas e travas do TA, mas não como interlocutores independentes. SDR Humano é fallback/assunção humana, não nova etapa. CRM/RevOps continua governando higiene e inteligência do funil, mas a experiência pública permanece simples.

## Indicadores oficiais

### CRM / Abordagem
- envios realizados
- taxa de resposta
- taxa de opt-out
- reclamações por mil toques
- taxa de reativação de nutrição

### SDR / TA
- segundos até primeira resposta
- cobertura da descoberta
- taxa de qualificação
- taxa de handoff por motivo
- recuperação de decisor incorreto

### Consultor Comercial
- demonstrações agendadas
- comparecimento
- demo → proposta
- proposta → ganho
- ciclo de venda
- motivo padronizado de perda

### Gestão
- SLA da fila
- conversão por origem/campanha
- conversão por responsável
- leads parados
- leads sem próxima ação
- nota de QA

## Regras duras

- Nunca inventar preço, desconto, prazo, integração, funcionalidade ou número.
- Nunca aprovar exceção financeira, jurídica, de segurança ou promessa fora do catálogo.
- Opt-out encerra nova abordagem.
- Fora da janela aplicável do WhatsApp, usar somente template aprovado quando exigido pela Meta.
- Handoff precisa carregar ficha, fatos, inferências, dor, score, histórico e próximo passo; o lead não repete a história.
- Máximo normal de dois handoffs reais antes da venda: CRM → SDR → Consultor.
- Nenhum agente novo deve ser adicionado à jornada pública sem decisão explícita de arquitetura comercial.

## Contrato executável

A definição de estados, sinais, ownership, exceções e KPIs vive em `src/services/sales/commercialFlow.ts`. UI, automações, roteamento e analytics devem consumir esse contrato em vez de recriar uma taxonomia paralela.