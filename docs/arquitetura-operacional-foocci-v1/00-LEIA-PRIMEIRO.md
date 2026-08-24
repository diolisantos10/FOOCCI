# Arquitetura Operacional Foocci v1 — Leia primeiro

**Status:** especificação canônica do projeto completo  
**Escopo:** construir a infraestrutura operacional interna dos 9 departamentos do Foocci, com agentes humanos, IA e híbridos, hierarquia, ordens de serviço, projetos, tarefas, aprovações, decisões, handoffs e indicadores.  
**Prioridade operacional inicial:** Vendas e Receita/Sala de Vendas, sem encerrar o programa nos limites desse departamento.  
**Branch de planejamento:** `claude/sala-de-vendas-levantamento`

## Resultado esperado

Transformar o admin atual do Foocci no sistema operacional interno da empresa. A plataforma deve conectar estratégia, execução e controle dos nove departamentos, aproveitando módulos que já existem e construindo somente as lacunas.

A Sala de Vendas é uma área interna do admin dedicada aos leads interessados em contratar o Foocci. SDR IA e humano atuam sobre a mesma conversa de WhatsApp. O login SDR acessa apenas essa área; o MASTER acessa todo o admin.

## Ordem obrigatória de leitura

1. `01-DEPARTAMENTOS-E-AGENTES.md`
2. `09-PLANO-MESTRE-DO-PROJETO-INTEIRO.md`
3. `10-PLATAFORMA-SDR-E-CONTROLE-DE-ACESSO.md`
4. `02-VENDAS-E-RECEITA-SDR.md`
5. `03-FUNIL-E-HANDOFFS.md`
6. `04-SALA-DE-VENDAS-UX.md`
7. `05-DADOS-APIS-E-PERMISSOES.md`
8. `06-PLANO-DE-CONSTRUCAO.md`
9. `07-TESTES-E-ACEITE.md`
10. `08-COMANDO-PARA-O-ARQUITETO.md`

## Princípios que não podem ser quebrados

- Evoluir o monólito/admin atual; não criar outro produto ou repositório.
- Auditar o que já existe antes de criar cada módulo.
- Uma capacidade existente deve ser reaproveitada ou adaptada, nunca duplicada.
- A empresa possui 9 departamentos canônicos e hierarquia: CEO → Diretor Foocci → Gerente Geral → gerentes de departamento → agentes.
- Agente é uma função com modo `AI`, `HUMAN` ou `HYBRID`; a IA não substitui autorização humana em decisões críticas.
- Todos os departamentos usam a mesma fundação de pessoas, permissões, OS, projetos, tarefas, aprovações, decisões, handoffs, arquivos, comentários, notificações e auditoria.
- MASTER acessa todo o admin; SDR acessa somente a plataforma SDR; demais logins obedecem papel, departamento e escopo.
- Esconder menu não é segurança: toda rota, API, serviço e query valida autorização no servidor.
- Prospect do Foocci, cliente Foocci e consumidor do restaurante são domínios separados.
- Mudanças de banco são aditivas e migráveis.
- PII, tokens e segredos não entram em código, prompt persistido ou log.
- Envio comercial continua bloqueado enquanto `FOOCCI_SDR_SEND_ENABLED` estiver desligado.
- Não ativar produção, enviar WhatsApp real, cadastrar credenciais, submeter templates Meta, fazer deploy ou merge automático.

## O que já existe e deve ser reaproveitado

- Foocci CRM e APIs administrativas.
- Funil comercial macro e métricas.
- Canal comercial, inbound, safety e artefatos SDR.
- Atendimento de clientes com padrão IA/humano e handoff.
- Agentes oficiais do produto: Waiter, CRM, WhatsApp e Analytics.
- Estruturas atuais de produto, restaurantes, pedidos, pagamentos, integrações e analytics encontradas na auditoria.

## Definição do programa

O Arquiteto deve construir por fases e PRs independentes. “Projeto inteiro” significa que o comando cobre toda a arquitetura e todas as entregas; não significa fazer um big-bang inseguro em um único PR.
