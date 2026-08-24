# Arquitetura Operacional Foocci v1 — Leia primeiro

**Status:** especificação canônica para construção  
**Escopo desta entrega:** organização da empresa, Departamento de Vendas e Receita e Sala de Vendas omnicanal com WhatsApp, SDR IA e SDR humano.  
**Branch de trabalho:** `claude/sala-de-vendas-levantamento`  
**Documento de levantamento anterior:** `docs/sala-de-vendas-levantamento.md`

## Resultado esperado

Construir dentro do admin atual do Foocci uma operação comercial em que leads de campanhas entrem no CRM, sejam atendidos no WhatsApp por IA e humanos na **mesma conversa**, avancem pelo funil e sejam entregues à implantação sem perda de contexto.

Este pacote substitui improvisos e deve ser lido por inteiro antes de alterar código:

1. `01-DEPARTAMENTOS-E-AGENTES.md`
2. `02-VENDAS-E-RECEITA-SDR.md`
3. `03-FUNIL-E-HANDOFFS.md`
4. `04-SALA-DE-VENDAS-UX.md`
5. `05-DADOS-APIS-E-PERMISSOES.md`
6. `06-PLANO-DE-CONSTRUCAO.md`
7. `07-TESTES-E-ACEITE.md`
8. `08-COMANDO-PARA-O-ARQUITETO.md`

## Princípios que não podem ser quebrados

- Evoluir o CRM já existente; não criar outro produto ou repositório.
- `SiteLead`, o funil e os serviços comerciais atuais continuam sendo a base.
- Conversas comerciais não podem usar tabelas de conversas dos restaurantes.
- O humano pode assumir a qualquer momento; a IA deve parar de enviar imediatamente.
- O humano pode devolver explicitamente a conversa à IA.
- Controle de acesso deve existir no servidor, não apenas no menu.
- Mudanças de banco devem ser aditivas e migráveis, sem apagar dados.
- Envio continua bloqueado enquanto `FOOCCI_SDR_SEND_ENABLED` estiver desligado.
- Opt-out, consentimento, idempotência e segurança de contato são obrigatórios.
- Nenhum segredo, token, telefone privado ou PII deve ser gravado em código/log.
- Não ativar produção, não enviar mensagens reais, não submeter templates Meta e não fazer merge automático.

## O que já existe e deve ser reaproveitado

- CRM em `src/app/admin/(area)/foocci-crm/`.
- APIs em `src/app/api/admin/foocci-crm/`.
- Funil macro `NOVO → CONTATADO → QUALIFICADO → PROPOSTA → FECHADO`, com `PERDIDO` fora da sequência.
- `FoocciSalesInbound`, `FoocciSalesChannel`, `LeadContactSafety` e diário/entrevista SDR.
- Padrão de handoff já usado no atendimento de clientes: IA atendendo, humano assumiu e devolver para IA.
- Métricas honestas do CRM, inclusive ausência de taxa quando não há amostra mínima.

## Fora deste ciclo

Automatizar todos os departamentos, substituir atendimento de restaurantes, trocar o provedor oficial do WhatsApp, ativar cobrança ou implantar um ERP. Este ciclo cria a fundação organizacional e entrega o Departamento de Vendas e Receita operacional.
