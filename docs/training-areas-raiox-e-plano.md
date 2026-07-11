# Raio-X das Áreas de Treinamento + Plano de Ação

> Missão pedida pelo CEO em 2026-07-11: mapear TODAS as telas/abas de
> treinamento e teste do admin, ler a fundo o "Treinamento IA", cruzar com o
> Brain e entregar um plano do que manter/fundir/deletar/reestruturar.
> **Nada foi deletado — este é o plano para aprovação.**
> Base: varredura por 3 agentes sobre o código real (não docs).

---

## 1. O diagnóstico em números

- **19 telas / ~40 abas** de treinar, testar, simular e diagnosticar agentes.
- **4 UIs** para a mesma função "simular pedido no WhatsApp" (WA Pedido Texto,
  Simulador dev, WA Cockpit, Arena) — todas sobre o mesmo motor.
- **4 UIs + 2 backends** para "aprovar melhorias" (Caixa Única, Melhorias,
  WaiterRoom, Brain Queue; `approvalInbox` de 3 fontes vs
  `UnifiedApprovalInbox` de 7 — a "fila única" do plano antigo virou DUAS).
- **2 pipelines de treinamento inteiros que não conversam** (o genérico do
  Treinamento IA, tabelas `agentTraining*`; e o do garçom, `agentSimulation*`).
- **Das 7+ filas de aprovação, só 2 fecham o loop** (aprovado → muda
  comportamento): `RestaurantKnowledgeItem` ACTIVE e a trilha Biblioteca →
  `WaiterRuntimeVersion` (gate P0=0). Todo o resto morre no status.
- **Becos confirmados:** `AgentImprovementProposal` APPROVED (sem consumidor),
  `AgentSimulationOpportunity` (só status), `AgentBrainVersion` (tabela
  write-only — nenhum runtime lê), CRs `TRAINING_RULE` do Quality (sem executor).
- **Bug crítico encontrado (JÁ CORRIGIDO neste commit):** o pool de
  aprendizados aprovados que o Brain vivo carrega estava SEMPRE vazio por
  mismatch de slug — runtime pede `whatsapp`, aprendizado ao vivo grava
  `whatsapp-receptionist` (`BrainTrainingContract`).
- **Zumbis/órfãs:** `/admin/agents/library` (zero links), simulador dev-only,
  `restaurant-mismatch` e `wa-identity` (debug one-off, intocados desde o
  import), 5 toggles de Configurações que salvam e ninguém lê
  (`autoApplySandbox`, `autoRunArenaOnCapture`, `minimumScoreThreshold`,
  `smallBatchEveryHours`, `nightlyBatchEnabled`).

**Veredito do "Treinamento IA":** excelente central de *observação e triagem*
(captura de casos reais com crons funcionando, Arena no motor real com safety
honesto, a melhor UX de aprovação do sistema) — mas como "escola", forma
alunos que nunca são contratados: o diploma (aprovação) não altera nenhum
agente, e os dois mecanismos que DE FATO mudam runtime (ChangeRequests
aplicáveis e a escada do free-form com evidência de sombra) ficaram fora do
merge.

## 2. O princípio do plano

> **Uma porta por função. Uma fila só existe se o aprovado muda comportamento.**
> A "escola" não se apaga — ela se pluga no único motor que forma de verdade:
> o Brain (aprovado → prompt/config governada → gate → evidência → promoção).

## STATUS DE EXECUÇÃO (2026-07-11)

| Fase | Status |
|---|---|
| **A** — Fechar os canos | ✅ ENTREGUE (garçom consome pool, executor TRAINING_RULE, aprovação gera learning) |
| **B** — Um inbox, um miner | ✅ ENTREGUE (Caixa Única lê 7 filas + decisão; dedupe cross-miner) |
| **E** — Prompt Room + categoria | ✅ ENTREGUE (menu por categorias, fichas técnicas editáveis, seletor de piloto) |
| **D** — Escola de verdade | ✅ ENTREGUE (aba 🎓 Formatura: boletim de sombra + gates + promoção) |
| **C** — Faxina | 🟡 PARCIAL — 3 telas órfãs deletadas + sidebar podada; fusões com link vivo (simulator, routing-test → Central WhatsApp) ficaram para rodada dedicada |

**Follow-up da Fase C (fusões seguras, exigem religar referências):**
- Fundir `whatsapp-text-ordering/simulator` no cockpit (3 referrers)
- `whatsapp-routing-test` como aba da Central WhatsApp (referrer em quality/registryMeta)
- Waiter/CRM/Analytics Testes viram abas dentro de /admin/quality (hoje delinkados do menu, acessíveis por lá)

---

## 3. Plano de ação (4 fases, ordem obrigatória)

### FASE A — Fechar os canos (código; nenhuma tela muda)
1. ✅ **FEITO neste commit:** fix do slug (`whatsapp` ⇄ `whatsapp-receptionist`)
   — aprovações do aprendizado ao vivo passam a entrar no prompt do Brain.
2. Garçom real (`AIOrderService`) consumir o pool APPROVED slug `waiter`
   (mesmo bloco "APRENDIZADOS APROVADOS") — liga a segunda torneira.
3. Executor para `TRAINING_RULE` no `ChangeRequestApplier`: aplicar = promover
   a regra a `RestaurantKnowledgeItem` ACTIVE (destino real para os CRs que o
   Quality auto-arquiva).
4. Aprovação de `AgentSimulationOpportunity` e `AgentImprovementProposal`
   passa a GERAR algo vivo (KnowledgeItem sugerido ou BrainChangeRequest),
   em vez de só trocar status. Propostas de mudança de CÓDIGO viram issues de
   backlog explícitas (são to-dos de dev, não treino).

### FASE B — Um inbox, um miner
5. A UI da **Caixa Única** (a melhor UX) passa a ler o
   `UnifiedApprovalInbox` do Brain (7 fontes — incluindo as 2 que funcionam)
   com decisão por fonte; aposentar o `approvalInbox` de 3 fontes. Uma fila
   de aprovação no produto inteiro.
6. Unificar os 4 miners no cano `intake → example → suggestion` (o mais
   completo); os outros viram chamadas dele.

### FASE C — Faxina de telas (SÓ após aprovação do CEO)
**Deletar (7):** `/admin/agents/library` (órfã; a Biblioteca oficial é a do
WaiterRoom), simulador dev `/diagnostics/whatsapp-text-ordering/simulator`
(dev-only; funcionalidade coberta pela central), `restaurant-mismatch`,
`wa-identity` (one-offs resolvidos), aba **Versões** + tabela
`AgentBrainVersion` (write-only; a versão real é `WaiterRuntimeVersion` com
gate), Auto Simulator 60s (telemetria sem leitor), os 5 toggles fantasma.

**Fundir (7→2):** WA Cockpit + WA Pedido Texto + Routing Lab → **uma Central
WhatsApp** (simular, cenários, routing, config, governança de rollout);
Waiter/CRM/Analytics Testes (3 clones) → abas dentro de **/admin/quality**
(que já roda e linka tudo).

**Sidebar final (de ~12 entradas de treino/teste para 5):**
`Treinamento IA` (a escola) · `Qualidade` (as provas) · `Brain` + `Escada`
(governança e formatura) · `Central WhatsApp` (o simulador único).
`QA Recovery` permanece (é fluxo de negócio, não agente).

### FASE D — A escola vira de verdade (Treinamento IA v2)
7. O Treinamento IA ganha o que faltou no merge: **boletim de sombra**
   (shadow stats por restaurante), **gates/escada** (o aluno "se forma"
   quando a evidência libera a promoção — hoje só em /admin/brain/free-form)
   e o CTA "ao aprovar, o agente aplica" passa a ser VERDADEIRO (Fase A).
8. Generalizar da `WHATSAPP_ORDERING` para todos os agentes (o backend já é
   quase todo parametrizado por slug).

## 4. Riscos e salvaguardas
- Nenhuma deleção antes do OK do CEO; deleções em commits separados e
  reversíveis; tabelas aposentadas ficam no banco (só somem da UI) por 30 dias.
- Fase A primeiro — consolidar telas antes de fechar loops só embeleza becos.
- Tudo protegido pelo CI (3600+ testes) e pelos gates existentes.

## 5. Resultado esperado
De **19 telas/2 pipelines/7 filas mortas-em-maioria** para
**5 portas / 1 pipeline / 1 fila viva** — com a escola formando alunos que o
Brain contrata de verdade, sob a mesma governança de sempre (humano decide,
gate protege, rollback de 30s).
