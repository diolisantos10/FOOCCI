# Plano de construção (v3)

Cinco fases, na ordem determinada pelo CEO. Uma fase só muda de coluna quando o gate do documento 09 for cumprido — **não quando o código existir**.

## Fase 1 — Auditoria e arquitetura corrigida

- [x] Auditoria do estado atual e mapeamento do que já existe
- [x] Gap analysis (`RAIO-X-E-GAPS.md`)
- [x] Documentação da arquitetura corrigida — esta pasta
- [x] Modelo de permissões (`05-RBAC-E-PERMISSOES.md`)
- [x] v1 marcada como SUPERADA, sem apagar

## Fase 2 — Departamentos, hierarquia, perfis, permissões, auditoria

- Enum de perfis com os seis oficiais
- 6 departamentos canônicos, 2 cargos de direção e 28 cargos de agente
- Fim do cargo de Gerente Geral
- Catálogo v3 semeado sobre `AgentProfile`
- Área `/admin/departamentos` com os 6 cards
- Testes de autorização nas duas metades

**Gate:** existem exatamente 6 departamentos, cada um com um Agente Gerente; todo cargo abaixo do Diretor começa com "Agente"; nenhuma ficha nasce ligada; a suíte inteira passa.

## Fase 3 — Sala de Vendas *(a mais pesada)*

- Modelo do lead comercial, conversa comercial e etapa do funil
- Inbox, listas e Kanban
- Ficha 360º
- SDR IA e SDR humano compartilhando a sala
- Handoff IA ↔ humano sem perda de contexto
- CRM comercial, separado do CRM do produto
- WhatsApp pela integração oficial

**Gate:** SDR humano não alcança o resto do Admin nem por URL nem por API; transferência não perde histórico; a sala funciona em desktop e mobile.

## Fase 4 — Os outros cinco departamentos

Implantação e Sucesso · Produto e Agentes · Tecnologia · Qualidade · Financeiro.

**Gate:** cada departamento tem backlog, fila, entrada, saída, SLA, métrica e regra de escalonamento.

## Fase 5 — Testes, migração, observabilidade e liberação

- Migração da v1 para a v3 (`10-PLANO-DE-MIGRACAO.md`)
- Observabilidade
- Documentação final
- Liberação controlada

**Gate:** os 16 critérios do documento 09, todos.

## O que NÃO acontece em nenhuma fase sem decisão do proprietário

Ativar IA · enviar mensagem real · submeter template à Meta · cadastrar credencial · executar pagamento · aplicar migração em produção · fazer merge.
