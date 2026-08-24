# Fichas dos agentes — catálogo dos 9 departamentos

> ⛔ **SUPERADA em 25/08/2026.** A arquitetura oficial da Foocci é a de 6 departamentos, em `docs/arquitetura-operacional-foocci-v3/`. Este arquivo fica para auditoria — não é fonte para construir nada.

**Data:** 24/08/2026 · **Estado:** proposto, aguardando aceite do proprietário

Este é o catálogo canônico. Cada ficha aqui vira uma linha de `AgentProfile` (ADR-002) e aparece em `/admin/sala-dos-agentes`. Nenhuma ficha nasce fora deste arquivo, e nenhuma ficha vive só neste arquivo.

## Como ler uma ficha

| Campo | O que significa |
| --- | --- |
| **Modo** | `IA` executa sozinha · `HUMANO` é pessoa · `HÍBRIDO` é IA com humano no comando |
| **Dono** | o humano responsável. **Toda ficha tem um, inclusive as de IA.** IA sem dono é trabalho sem responsável. |
| **Pode** | o que a ficha executa sem pedir licença |
| **Não pode** | a trava. Não é conselho: vira `forbiddenActions` e é verificada no servidor |
| **Escala quando** | o gatilho que devolve a decisão para gente |

Três regras valem para **todas** as fichas de IA, sem exceção e sem precisar repetir em cada uma:

1. **Nunca inventa** preço, desconto, prazo, integração, funcionalidade ou número.
2. **Nunca aprova** exceção financeira, jurídica, de segurança ou promessa fora do catálogo.
3. **Nunca escreve zero quando a resposta é "não sei"** — o tipo `Medida` obriga isso no código.

---

## 1. Marketing & Growth

### 1.1 Gerente de Marketing & Growth · HUMANO
Dono da demanda rastreável. Aprova orçamento, publicação e criativo. Responde por custo por lead e por qualidade de origem.
**Não pode:** assumir custo externo sem aprovação do Diretor acima do teto definido.

### 1.2 Analista de Atribuição · IA
**Pode:** ler UTMs e `clickId` do `SiteLead`, montar performance por campanha, canal e criativo, apontar origem que gera lead ruim.
**Não pode:** publicar, alterar orçamento, criar campanha, nem afirmar receita — receita vem do Financeiro, não do funil.
**Escala quando:** o dado de gasto não bate com a fonte externa. Divergência vira "não medido" com motivo, nunca uma média.

### 1.3 Agente de Conteúdo e Campanha · HÍBRIDO
**Pode:** redigir briefing, sugerir calendário, propor criativo, preparar UTM padronizada.
**Não pode:** publicar nada. Publicação tem gate humano — está no plano mestre e é regra do comando.

---

## 2. Vendas e Receita

*O departamento da primeira entrega. As fichas abaixo são as únicas com detalhe operacional completo nesta fase.*

### 2.1 Gerente de Vendas e Receita · HUMANO
Governa fila, SLA, distribuição, capacidade e playbook. Único que altera política comercial.
**Não pode:** aprovar desconto fora do catálogo sem o Diretor.

### 2.2 SDR IA · IA
**Pode:** responder inbound rápido, identificar intenção, coletar dados de sondagem, registrar fato separado de inferência, qualificar, mover `NOVO → CONTATADO → QUALIFICADO`, criar tarefa e pedir handoff.
**Não pode:** enviar com `FOOCCI_SDR_SEND_ENABLED` desligado; falar com quem tem `optOutAt`; negociar preço ou prazo; prometer integração; enviar fora da janela sem template aprovado; escrever nota interna no canal externo.
**Escala quando:** o lead pede humano, a confiança cai, o tema é sensível, houve falha repetida, ou aparece intenção de negociar.
**Mede-se por:** tempo até primeira resposta, taxa de contato, taxa de qualificação, taxa e motivo de handoff.

### 2.3 SDR Humano · HUMANO
**Pode:** assumir qualquer conversa, conduzir diagnóstico, tratar exceção, agendar demonstração, devolver para a IA com objetivo escrito.
**Regra dura:** assumir é **atômico**. Ao confirmar, o humano vira responsável e a IA silencia **antes do próximo envio** — com lock e transação, não com boa intenção.

### 2.4 Consultor Comercial · HUMANO
Demonstra a solução no contexto daquele restaurante. Move `QUALIFICADO → PROPOSTA`.

### 2.5 Closer · HUMANO
Conduz proposta, objeção e fechamento. Move `PROPOSTA → FECHADO` ou `PERDIDO` — **sempre com motivo padronizado**.
**Não pode:** marcar `FECHADO` sem evidência de aceite verificável.

### 2.6 RevOps · HÍBRIDO
**Pode:** higiene de CRM, detectar lead sem próximo passo, tarefa vencida, duplicata e etapa parada; produzir relatório e previsão.
**Não pode:** conversar em nome do lead. RevOps garante que o sistema represente a realidade; não fabrica a realidade.

---

## 3. Implantação e Onboarding

### 3.1 Gerente de Implantação · HUMANO
Dono do tempo até o primeiro valor. Único que dá o gate de go-live.

### 3.2 Agente de Kickoff e Checklist · HÍBRIDO
**Pode:** abrir a implantação a partir do `FECHADO`, montar checklist por plano e tipo de restaurante, cobrar pendência, registrar evidência de treinamento.
**Não pode:** redescobrir o que já foi vendido. O dossiê de Vendas é imutável; divergência vira pendência registrada, não conversa nova com o cliente.

### 3.3 Agente de Configuração e Importação · HÍBRIDO
**Pode:** operar `ImportJob` e `ImportMappingTemplate`, configurar conta, validar cardápio.
**Não pode:** ativar canal, cadastrar credencial ou ligar cobrança. Go-live é decisão humana.

---

## 4. Sucesso do Cliente e Suporte

### 4.1 Gerente de Sucesso e Suporte · HUMANO
Dono de carteira, retenção e escalonamento.

### 4.2 Agente de Suporte N1 · HÍBRIDO
**Pode:** atender `SupportTicket` e `HelpThread`, responder dúvida conhecida, classificar, escalar para N2.
**Não pode:** tocar conversa de prospect. **Suporte é de cliente ativo; a Sala de Vendas é de prospect** — as duas bases não se cruzam, por desenho e por trava.

### 4.3 Agente de Saúde da Carteira · IA
**Pode:** calcular health score **com fatores explicáveis**, apontar risco de churn, sugerir check-in.
**Não pode:** exibir score sem mostrar de que fatores ele veio. Score que ninguém consegue explicar é número que ninguém deveria usar.
**Escala quando:** falta dado para calcular — devolve "não medido" com motivo, nunca um score baixo por ausência.

### 4.4 Agente de Voz do Cliente · IA
**Pode:** estruturar feedback e mandar como **evidência** para Produto.
**Não pode:** transformar pedido de cliente em compromisso de roadmap. Isso é decisão de Produto.

---

## 5. Produto e Experiência

*Único departamento que começa do zero. Nada aqui existe no repositório hoje.*

### 5.1 Gerente de Produto · HUMANO
Dono da priorização. Único que muda roadmap.

### 5.2 Agente de Discovery e Evidências · IA
**Pode:** juntar evidência de CS, Suporte, Vendas e uso; agrupar por problema; ligar evidência a hipótese.
**Não pode:** priorizar. Junta e organiza; quem decide é gente.

### 5.3 Agente de Especificação e Aceite · HÍBRIDO
**Pode:** redigir requisito, critério de aceite e dependência; verificar se a entrega bate com o critério.
**Não pode:** aprovar a própria especificação.

---

## 6. Agentes e Inteligência do Produto

*O departamento que governa os quatro agentes vendidos. Este é o mais maduro do repositório — 27 models já existem.*

### 6.1 Gerente de Agentes e Inteligência · HUMANO
Dono dos gates. Único que autoriza rollout e aciona kill switch.

### 6.2 Waiter · IA *(agente de produto, já existe)*
Atende e vende dentro do `/pedido` do restaurante. Governado por `WaiterRuntimeVersion` e avaliado por `WaiterResultEvidence`.

### 6.3 CRM · IA *(agente de produto, já existe)*
Relacionamento de saída com o cliente do restaurante. Governado por `CrmAgentPilotConfig` e `CRMActionLog`.

### 6.4 WhatsApp · IA *(agente de produto, já existe)*
Recepção de entrada no WhatsApp do restaurante. Governado por `WhatsAppAgentConfig`.

### 6.5 Analytics · IA *(o slot existe vazio — a ficha ainda não foi escrita)*
Leitura de dados do restaurante.
**Não pode:** nada, porque nada foi escrito. O slug `analytics-product` existe no registro desde a Fase 0 como *placeholder*: zero regra, zero ferramenta, `DRAFT`. Chamar isso de "agente que já existe" seria vender como pronto o que é uma vaga com nome.
**Escala quando:** sempre. Enquanto esta ficha não for escrita e aprovada, não há agente de Analytics — há uma linha reservada.

### 6.6 Agente de Avaliação e Gate · HÍBRIDO
**Pode:** rodar dataset de avaliação, comparar versões, medir qualidade, custo e latência, bloquear promoção que regrediu.
**Não pode:** promover versão. Promoção é do Gerente, com gate.

> **O Cérebro não é ficha de agente vendido.** É camada interna de orquestração e governança (`BrainEngineRouting`, `BrainShadowLog`, `BrainChangeRequest`). Não aparece como quinto agente aos restaurantes — regra do plano mestre, e a Sala dos Agentes deve refleti-la.

---

## 7. Tecnologia, Operações e Integrações

### 7.1 Gerente de Tecnologia · HUMANO
Dono de release, incidente e capacidade.

### 7.2 Agente de Integrações e Saúde · IA
**Pode:** ler `IntegrationConfig`, `MetaWhatsAppConfig` e diagnósticos; reportar integração caída, token vencido e webhook falhando.
**Não pode:** cadastrar credencial, renovar token nem replicar segredo. Segredo fica no provedor — o Foocci mostra estado e link, não guarda cópia.
**Regra que veio de erro real:** nunca escrever "Conectado" sem prova de que o token responde.

### 7.3 Agente de Incidente e Runbook · HÍBRIDO
**Pode:** abrir incidente com severidade, executar runbook de diagnóstico, propor rollback.
**Não pode:** executar deploy, merge ou rollback em produção. Isso é humano, sempre.

---

## 8. Qualidade, Segurança e Compliance

### 8.1 Gerente de Qualidade e Compliance · HUMANO
Dono do gate de release e do registro de risco.
**Regra estrutural:** **nenhuma área aprova o próprio desvio crítico.** Quem constrói não assina o próprio gate.

### 8.2 Agente de Auditoria e Raio-X · IA *(parcialmente existe)*
**Pode:** rodar varredura determinística sobre o sistema, registrar achado com evidência, comparar com a noite anterior. Já existe como `RaioXRun` / `RaioXFinding` e `QualityAuditRun` / `QualityAuditFinding`.
**Não pode:** consertar nada. Diagnostica; o conserto é frente com dono.
**Regra dura:** varredura que não rodou devolve **"não sei"**, nunca "está tudo bem".

### 8.3 Agente de LGPD e Privacidade · HÍBRIDO
**Pode:** verificar consentimento, opt-out, retenção e minimização; preparar exportação e exclusão.
**Não pode:** executar exclusão definitiva sem confirmação humana registrada.

---

## 9. Financeiro e Administrativo

### 9.1 Gerente Financeiro · HUMANO
Acesso mais restrito do sistema. Segregação de função obrigatória.

### 9.2 Agente de Faturamento e Cobrança · HÍBRIDO
**Pode:** ler `PlanSubscription` e `PlanInvoice`, apontar inadimplência, preparar régua autorizada.
**Não pode:** executar pagamento, ação bancária ou emissão fiscal. **Nunca**, em nenhuma fase deste programa.
**Não pode também:** derivar receita de status comercial. `FECHADO` no funil não é dinheiro no caixa — receita vem de fonte financeira confiável ou não é exibida.

### 9.3 Agente de Contratos · HÍBRIDO
**Pode:** registrar contrato, vigência, plano e condição vendida.
**Não pode:** alterar condição já aceita. Alteração é aditivo novo, com trilha.

---

## Direção e comando

| Ficha | Modo | Papel |
| --- | --- | --- |
| CEO | HUMANO | Decide o quê e o porquê. Fila própria de decisões executivas. |
| Diretor Foocci | HUMANO | Traduz vontade em direção; responde pelo produto inteiro. |
| Gerente Geral | HUMANO | Distribui OS e projetos entre os 9 departamentos; cobra prazo. |

---

## Contagem

**37 fichas:** 3 de direção, 9 de gerência departamental, 25 operacionais.
Modo: **11 IA · 15 HUMANO · 11 HÍBRIDO.**

| Departamento | Fichas |
| --- | --- |
| 1 · Marketing & Growth | 3 |
| 2 · Vendas e Receita | 6 |
| 3 · Implantação e Onboarding | 3 |
| 4 · Sucesso do Cliente e Suporte | 4 |
| 5 · Produto e Experiência | 3 |
| 6 · Agentes e Inteligência do Produto | 6 |
| 7 · Tecnologia, Operações e Integrações | 3 |
| 8 · Qualidade, Segurança e Compliance | 3 |
| 9 · Financeiro e Administrativo | 3 |
| Direção (CEO, Diretor, Gerente Geral) | 3 |
| **Total** | **37** |

Das 37, **quatro já existem** semeadas (`waiter`, `crm`, `whatsapp`, `suporte-tecnico`). As outras 33 são novas — e nascem em `AgentProfile`, não numa tabela paralela.

> **Correção de 24/08/2026.** A versão anterior desta seção dizia "32 fichas · 11 IA · 12 HUMANO · 9 HÍBRIDO". Estava errada: eu somei à mão e a soma não fechava com as fichas listadas acima. O número certo é 37, e agora ele é **contado do próprio documento por código** — `agentesCanonicos.test.ts` lê este arquivo, conta os cabeçalhos e falha se a tabela acima divergir.
>
> Fica registrado em vez de corrigido em silêncio: um catálogo que erra a própria contagem é exatamente o defeito que este programa existe para achar, e ele apareceu aqui dentro primeiro.

## O que estas fichas ainda NÃO fazem

Nenhuma está ativa. Nenhuma IA foi ligada. Nenhuma envia mensagem. Este documento é o catálogo aprovado no papel; ligar cada uma é decisão do proprietário, uma por uma, com gate — e a Fase 7 é onde isso acontece, não aqui.
