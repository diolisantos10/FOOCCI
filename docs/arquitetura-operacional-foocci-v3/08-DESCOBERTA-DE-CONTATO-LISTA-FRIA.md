# Lista fria — descoberta do contato correto

Decisão CEO — 15/09/2026

## Objetivo
Para contato FRIO ainda não qualificado, a primeira missão não é vender Foocci. É identificar o interlocutor correto do restaurante com o mínimo de atrito. Leads já qualificados ignoram esta etapa.

## Abertura
Sempre usar template aprovado pela Meta quando exigido pela janela/política. Não usar saudação dependente de horário. Não se apresentar como Foocci na primeira linha.

Templates candidatos submetíveis:
- `foocci_contato_inicial_01`: `Olá! Tudo bem? Este contato é do {{1}}?`
- `foocci_contato_inicial_02`: `Olá! Tudo bem? Falo com o {{1}}?`
- `foocci_contato_inicial_03`: `Olá! Tudo bem?`

`{{1}}` é o nome real do restaurante já presente no lead. Nunca inventar o nome.

## Resposta
- humano / papel desconhecido → TA pergunta se é responsável pela área comercial;
- decisor → TA inicia descoberta/qualificação;
- não decisor → TA pede o contato correto;
- indicação/cartão → CRM registra novo decisor e origem e reinicia abordagem no novo contato;
- automação/bot → TA não vende para bot; usa caminho permitido para solicitar atendimento humano;
- opt-out → encerra imediatamente;
- sem resposta → CRM/nutrição, sem abrir falsa qualificação.

## Guardrails
1. Não usar mensagem livre fora da janela permitida.
2. Template só dispara em status APPROVED no espelho sincronizado da Meta.
3. Automação não é sinal de interesse nem qualificação.
4. Não tentar burlar menu/bot, CAPTCHA, bloqueio ou política da plataforma.
5. Identidade da Foocci deve ser informada quando o humano perguntar quem fala/qual assunto; nunca mentir ou se passar pelo restaurante.
6. Não repetir abordagem para opt-out.
7. Não aplicar esta etapa a lead já qualificado.
8. O objetivo `FIND_CORRECT_DECISION_MAKER` termina quando o decisor correto é confirmado; daí em diante vale o fluxo SDR → Consultor.

## Métricas
- taxa de humano alcançado;
- taxa de decisor identificado;
- recuperação de contato errado;
- automações encontradas;
- opt-out;
- tempo até decisor;
- conversão decisor → qualificação.
