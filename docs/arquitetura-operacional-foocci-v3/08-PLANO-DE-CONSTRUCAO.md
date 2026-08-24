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
- [x] Saída para o WhatsApp — aceso em 25/08/2026 com o número **11 94372-3316**, que já era decisão do CEO desde 23/08 e estava no repositório; eu é que havia registrado como faltando
- [ ] **Recepção** do WhatsApp — o "oi" virar registro na Sala sozinho. Depende do cadastro do número na Meta, que é trabalho do CEO. Hoje a mensagem cai num aparelho e quem responde é gente
- [ ] **Envio** pelo Foocci — desligado de propósito. É a última chave, e ela é decisão do CEO com o diário do SDR na mão

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

## Fase 5 — Testes, migração, observabilidade e liberação ✅ *(o que não depende do CEO)*

- [x] **Migração da v1 para a v3**, executada e verificada contra um banco que já tinha a v1: 4 departamentos, 10 cargos e 27 fichas desativados **com o motivo escrito**, nada apagado
- [x] **Observabilidade da própria arquitetura**: `npm run db:conferir-v3`
- [x] **Documentação final** nesta pasta
- [ ] **Liberação controlada** — depende do CEO: nenhuma migração foi aplicada em produção, e não haverá merge sem aprovação

### O instrumento da liberação

`npm run db:conferir-v3` pergunta uma coisa que os testes **não** perguntam.

Os testes provam que o CÓDIGO está certo. O script pergunta se o BANCO onde a aplicação vai rodar está no estado que a arquitetura descreve. São perguntas diferentes, e a segunda é a que passa batida: o código pode estar impecável e o banco ter ficado sem o seed, sem a migração ou sem a trava de append-only — e nada avisa, porque a aplicação sobe igual.

Doze conferências, e a regra que governa todas: **nenhuma devolve ✓ por ausência de dado.** Banco vazio não é banco correto. Onde a resposta é "não dá para saber", o relatório escreve isso.

Verificado nas duas direções antes de entrar:

- num banco correto, 12 de 12 passam;
- quebrando três coisas de propósito (um gatilho derrubado, uma ficha ligada, um cargo renomeado para fora do padrão), o script acusa exatamente as três e sai com código 1;
- num banco sem seed, 7 reprovam e 1 sai como "sem resposta" — nunca como aprovado.

**Gate:** os 16 critérios do documento 09.

## O que NÃO acontece em nenhuma fase sem decisão do proprietário

Ativar IA · enviar mensagem real · submeter template à Meta · cadastrar credencial · executar pagamento · aplicar migração em produção · fazer merge.
