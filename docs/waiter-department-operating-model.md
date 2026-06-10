# Waiter Department — Modelo Operacional

> Atualizado em 2026-06-10. Este é o documento de referência de COMO o Waiter
> Department funciona como produto: o que cada área significa para o operador,
> o que acontece (e o que NÃO acontece) quando ele aprova algo, e o fluxo ideal
> de evolução do agente. O Waiter Department é o modelo que será replicado para
> os demais agentes.

## O que é o Waiter Department

A "sala" do agente Garçom no admin (`/admin/agents/waiter`). Por fora, fala a
língua do dono/operador (marketing, vendas, operação). Por baixo, mantém os
módulos técnicos separados e seguros (Library, Simulation, Examples, Runtime
Merge, Evidence, Quality — nenhum acoplado de forma perigosa).

### Navegação (8 abas)

| Aba | O que é |
|---|---|
| **Dashboard** | Visão executiva. |
| **Perfil do Agente** | Identidade, regras de atendimento, habilidades e forma de operação — Perfil + Operação + Brain & Skills unificados em 6 seções (identidade · como atende · habilidades · regras de segurança · status técnico resumido · links rápidos). Nada foi removido; os componentes técnicos ficam em "Detalhe técnico" colapsado. |
| **Biblioteca de Treinamento** | Envie livros/manuais/materiais; a IA extrai técnicas "prontas para treino". |
| **Centro de Treinamento** | O coração: o Waiter aprende com 3 fontes + você decide. |
| **Versão de Teste** | Runtime Merge: monta uma versão com treinamentos aprovados; Quality Gate protege a ativação. |
| **Provas de Resultado** | Evidências comerciais documentadas (separadas do treinamento por design). |
| **Qualidade** | Componentes do runtime, Test Center, critérios de avaliação. |
| **Governança** | Mapa de risco, backlog, garantias de rollback. |

## Centro de Treinamento Vivo

> O Waiter aprende continuamente com materiais enviados, conversas reais,
> simulações automáticas e evidências comerciais. **Nada muda no atendimento
> real sem passar por versão de teste e aprovação humana.**

### As 4 fontes de aprendizado

1. **Biblioteca de Treinamento** (módulo técnico: Agent Library) — livros,
   manuais, materiais; técnicas extraídas automaticamente (quick/deep extraction
   em background).
2. **Casos reais** (módulo: Simulation Examples) — conversas reais SANITIZADAS,
   objeções/dúvidas/comportamentos reais. Coleta automática diária (abaixo).
3. **Simulador** (módulo: Simulation Lab) — clientes artificiais testam o Waiter
   todos os dias (cron 06:45 UTC) e geram **Sugestões de treinamento**.
4. **Provas de Resultado** (módulo: Waiter Evidence) — casos documentados de
   venda/upsell/recuperação; além do uso comercial, casos de sucesso servem de
   referência de comportamento desejado.

### Coleta automática de casos reais (Real Conversation Intake)

- **Rota cron-safe:** `POST /api/cron/waiter/training/intake-real-conversations`
  (Bearer `CRON_SECRET`).
- **Workflow:** `.github/workflows/waiter-training-real-conversations.yml` —
  diário às 06:15 UTC (~03:15 BRT, antes da simulação) + dispatch manual.
- **Como funciona:** lê Conversation/Message **somente leitura** → mascara
  telefone, nome, e-mail, endereço, CPF/CNPJ, nº de pedido e tokens **antes** de
  persistir (transcript bruto nunca é salvo) → classifica a situação (indeciso,
  fome, pagamento, restrição, preço, grupo, desistência, entrega, pedir por
  texto, reclamação, elogio, upsell aceito, finalização…) → cria o caso como
  **PENDING_REVIEW** com origem `REAL_CONVERSATION`.
- **Idempotente** por conversationId — rodar duas vezes não duplica.
- **Nunca** altera conversa, envia mensagem ou toca o runtime
  (`runtimeTouched=false`, validado pelo workflow).
- **UI:** seção "Casos reais" do Centro de Treinamento mostra coletados hoje,
  última/próxima coleta, pendentes e o botão "Coletar casos reais agora", com o
  aviso: *Dados sensíveis são removidos antes de qualquer uso*.

### Sugestões de treinamento

Cada oportunidade do simulador vira um card humano: problema → o que o cliente
disse → solução sugerida → impacto esperado → origem → decisão
(**Aprovar treinamento / Rejeitar / Guardar para depois**). Código técnico
(`HUNGRY_BIG · MISSED_SALE · P2`) fica colapsado em "Detalhe técnico".

## O que APROVAR significa (e o que não muda)

> **Aprovar não muda o atendimento real imediatamente.** A melhoria fica
> registrada como treinamento e só poderá entrar no Waiter em uma **versão de
> teste** aprovada no **Quality Gate** — e só você ativa, manualmente.

Aprovar = registrar a decisão humana (status APPROVED). Não altera o
WaiterBrainV2, não ativa Library-Assisted, não toca cliente real. O runtime
real segue em modo CURRENT até existir uma versão ACTIVE explicitamente ativada
(P0=0 obrigatório no gate; rollback instantâneo disponível).

## Provas de Resultado (Evidências Comerciais)

Área **separada do treinamento** por design: evidência é storytelling
comercial; treinamento é aprendizado.

- **Modelo:** `WaiterResultEvidence` (tabela própria, referências soft — apagar
  pedido/conversa nunca apaga uma prova aprovada).
- **Tipos:** Venda conduzida · Upsell · Recuperação · Atrito resolvido · Prova
  qualitativa (elogio) · Antes e depois.
- **Segurança:** o trecho passa pelo sanitizador ANTES de persistir (sem PII);
  tudo nasce **DRAFT**; uso comercial exige `isPublicCandidate` **e** aprovação
  humana (APPROVED). `incrementalValue` só é calculado quando antes/depois
  existem de verdade (nada inventado).
- **Coleta automática inicial (`WaiterEvidenceCollector`):** detecta, read-only,
  elogios (QUALITATIVE_PROOF) e pedido de finalização na conversa
  (SALE_CONVERSION). **Parcial por design:** upsell com valor, recuperação e
  antes/depois ainda exigem captura manual ("Criar evidência manual") até haver
  vínculo confiável pedido↔conversa.
- **APIs (admin):** `GET/POST /api/admin/agents/waiter/evidence`,
  `PATCH /api/admin/agents/waiter/evidence/[id]`,
  `POST /api/admin/agents/waiter/evidence/collect`.

## Fluxo ideal (ponta a ponta)

1. Material/conversa entra (upload na Biblioteca · coleta diária de casos reais);
2. IA extrai aprendizado (técnicas · classificação de situação);
3. Simulador testa o Waiter (diário, ambiente seguro);
4. Operador aprova sugestões de treinamento;
5. **Versão de teste** é criada com os aprendizados aprovados;
6. **Quality Gate** roda (bloqueia se houver problema crítico);
7. Humano decide ativar (e pode reverter na hora);
8. **Evidências de resultado** são coletadas e aprovadas para uso comercial.

## Garantias de segurança (o que NUNCA acontece sozinho)

- Runtime real (WaiterBrainV2/PromptBuilder) intocado por treinamento/coleta/provas;
- Nenhuma versão Library-Assisted ativa sem ação humana + gate P0=0;
- Nenhum WhatsApp, pedido ou Pix gerado por esses módulos;
- Nenhum transcript bruto ou PII persistido;
- Nenhuma prova usada comercialmente sem aprovação humana.

## Referências técnicas

- Intake: `src/services/simulation/examples/realConversationIntake.ts`
- Extractor/sanitizer: `SimulationExampleExtractor.ts` · `simulationSanitizer.ts`
- Evidência: `src/services/waiterEvidence/` (+ migration `20260610010000_waiter_result_evidence`)
- Navegação: `src/services/agents/waiterDepartmentNav.ts`
- Labels humanos: `src/services/simulation/waiterTrainingDisplayLabels.ts`
- Docs irmãos: `waiter-training-center-ux.md`, `waiter-current-architecture-raiox.md`,
  `agent-simulation-lab.md`, `waiter-runtime-merge.md`, `quality-control.md`
