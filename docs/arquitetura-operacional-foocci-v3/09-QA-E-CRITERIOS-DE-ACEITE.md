# QA e critérios de aceite (v3)

## Os 16 critérios do CEO

| # | Critério | Como se verifica |
| --- | --- | --- |
| 1 | Exatamente 6 departamentos oficiais | teste conta o catálogo e compara com a tabela publicada nele |
| 2 | Cada departamento tem um Agente Gerente | teste percorre os 6 e reprova se faltar |
| 3 | Todo cargo abaixo do Diretor começa com "Agente" | teste lê o catálogo e reprova o primeiro que não começar |
| 4 | Marketing não duplicado dentro da Foocci | teste reprova se aparecer departamento de marketing/growth/mídia |
| 5 | Hierarquia aplicada no backend e na interface | testes de autorização + tela |
| 6 | SDR humano vê só a Sala de Vendas autorizada | acesso direto por URL e por API → 403 |
| 7 | Master e Diretor veem toda a operação | teste de escopo integral |
| 8 | IA e humanos compartilham e transferem atendimento | teste de handoff nos dois sentidos |
| 9 | Nenhuma transferência perde histórico | teste compara a linha do tempo antes e depois |
| 10 | Toda ação sensível gera auditoria | teste conta eventos, inclusive nas negativas |
| 11 | CRM comercial separado do CRM do produto | teste reprova consulta que cruze as duas bases |
| 12 | Sala de Vendas em desktop e mobile | verificação visual em duas larguras |
| 13 | Testes de autorização impedem acesso por URL/API | ver critério 6 |
| 14 | Funil, WhatsApp, handoff e QA aprovados | suíte da Fase 3 |
| 15 | Documentação completa na pasta determinada | os 11 arquivos existem |
| 16 | Build, lint, typecheck e testes sem erro | executados e anexados no PR |

## Como se escreve teste nesta casa

**Sempre as duas metades.** Um teste que só prova que o portão barra deixa passar um portão que barra todo mundo. Um que só prova que deixa entrar deixa passar um portão aberto.

**Teste de autorização espia a consulta, não só o resultado.** Um teste que olha apenas o retorno passa numa base de teste onde não existe dado do outro escopo — e passa exatamente até o dia em que existir.

**Teste que pula avisa alto.** Teste que depende de banco e some em silêncio é teste que ninguém percebe que parou de rodar.

**Concorrência se prova com concorrência.** Banco falso responde o que mandarem responder. Corrida se testa disparando os pedidos ao mesmo tempo contra Postgres de verdade.

**Prova nas duas direções.** Depois de escrever a trava, quebrar a implementação de propósito e confirmar que o teste reprova. Trava que nunca reprovou não é trava — é decoração.

## QA das conversas

O Agente de QA e Auditoria audita conversa contra script e política. Regras:

- **ausência de evidência não é aprovação.** Sem evidência, o resultado é "não sei" — que não é aprovado;
- toda não conformidade nasce com evidência anexada;
- quem audita não assina a liberação do que auditou.

## O que reprova a entrega, mesmo com tudo verde

- autorização que existe só no frontend;
- mock entregue como funcionalidade;
- indicador exibindo `0` quando o dado é indisponível — o certo é "não medido", com motivo;
- tabela duplicada sem justificativa técnica escrita;
- agente criado só para preencher organograma.
