# Runbook — prospecção fria

Antes de aumentar volume:

1. template escolhido precisa estar APPROVED na Meta;
2. número comercial não pode colidir com número de restaurante;
3. envio autônomo e TA precisam respeitar suas chaves de ativação;
4. resposta automática passa pelo BotGate antes do TA;
5. indicação explícita cria/vincula novo SiteLead sem herdar consentimento/score;
6. novo número é nova conversa; não sobrescrever telefone original;
7. opt-out é terminal;
8. menus sem rota segura e loops vão para espera/fila humana;
9. inbound de campanha/formulário permanece prioritário e usa o contexto já capturado;
10. escalar volume somente com filas de resposta/handoff/sem próxima ação sob controle.

A ativação de envio em produção é uma decisão operacional separada do merge do código. Nunca habilitar milhares de disparos apenas porque o deploy ficou verde.
