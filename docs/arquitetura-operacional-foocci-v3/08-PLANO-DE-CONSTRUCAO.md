# Plano de construção (v3)

Cinco fases, na ordem determinada pelo CEO. Uma fase só muda de coluna quando o gate do documento 09 for cumprido — **não quando o código existir**.

## Fase 1 — Auditoria e arquitetura corrigida

- [x] Auditoria do estado atual e mapeamento do que já existe
- [x] Gap analysis (`RAIO-X-E-GAPS.md`)
- [x] Documentação da arquitetura corrigida — esta pasta
- [x] Modelo de permissões (`05-RBAC-E-PERMISSOES.md`)
- [x] v1 marcada como SUPERADA, sem apagar

## Fase 2 — Departamentos, hierarquia, perfis, permissões, auditoria ✅

- [x] Enum de perfis com os seis oficiais
- [x] 6 departamentos canônicos, 2 cargos de direção e 28 cargos de agente
- [x] Fim do cargo de Gerente Geral
- [x] Catálogo v3 semeado sobre `AgentProfile`
- [x] Área `/admin/departamentos` com os 6 cards
- [x] Testes de autorização nas duas metades

**Gate cumprido:** 6 departamentos, cada um com um Agente Gerente; todo cargo abaixo do Diretor começa com "Agente"; nenhuma ficha nasce ligada; a suíte inteira passa.

## Fase 3 — Sala de Vendas ✅ *(parcial: o núcleo está de pé)*

A fase revelou que a Sala **não era construção do zero**. `SiteLead` já tinha funil, LGPD, origem e histórico; havia CRM da Foocci com tela completa e quatro serviços de SDR. Dois gaps do próprio raio-x estavam errados — corrigidos em `RAIO-X-E-GAPS.md`.

- [x] Responsabilidade pelo lead: quem atende AGORA
- [x] Handoff IA ↔ humano, atômico e provado contra Postgres real
- [x] As sete filas, com o escopo do SDR dentro da consulta
- [x] Tela da Sala com assumir e devolver
- [x] Isolamento do SDR: 401/403 por URL e por API
- [x] CRM comercial separado do CRM do produto *(já era, e foi verificado)*
- [ ] Kanban — a lista existe; a visão de quadro fica para a próxima entrega
- [ ] Ficha 360º dentro da Sala — hoje vive no CRM da Foocci, na gaveta de contato
- [ ] Envio real pelo WhatsApp — **depende do CEO**: o número de vendas não existe

**Gate cumprido no que foi entregue:** SDR humano não alcança o resto do Admin nem por URL nem por API; a transferência preserva o histórico inteiro (verificado no ciclo IA → humano → IA).

## Fase 4 — Governança dos seis departamentos ✅

O gate do documento 01 é o **mínimo de governança**, e ele é o mesmo para os seis: dono, fila, entradas, saídas, SLA, métricas e regras de escalonamento. Um mecanismo, seis departamentos — não seis produtos sob medida.

- [x] **Dono**: o Agente Gerente de cada departamento
- [x] **Fila**: backlog aberto, vindo de `Task`
- [x] **Entradas e saídas**: a lista do que cada departamento controla, escrita e visível
- [x] **Escalonamento**: quando cada um devolve a decisão para cima
- [x] **Métrica de comando**: quantas ordens pularam o Agente Gerente em 30 dias
- [x] **Métrica de qualidade**: não conformidades abertas, com `nunca auditado` distinto de `limpo`

**A promessa do documento 01, cumprida:** *"a regra vira número, e o número aparece"*. O Diretor não é bloqueado de falar direto com quem executa — numa urgência ele precisa disso, e um sistema que impede é contornado por WhatsApp, fora do registro. O atalho é contado. Um pulo é exceção; um terço das ordens pulando é uma estrutura que não está funcionando.

## Fase 5 — Testes, migração, observabilidade e liberação

- Migração da v1 para a v3 (`10-PLANO-DE-MIGRACAO.md`)
- Observabilidade
- Documentação final
- Liberação controlada

**Gate:** os 16 critérios do documento 09, todos.

## O que NÃO acontece em nenhuma fase sem decisão do proprietário

Ativar IA · enviar mensagem real · submeter template à Meta · cadastrar credencial · executar pagamento · aplicar migração em produção · fazer merge.
