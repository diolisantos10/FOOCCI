# Agente de Assistência Técnica — Plano / Esqueleto

> Rascunho para revisão do dono (manhã). O agente nasce sabendo diagnosticar e
> propor a correção com autonomia; a **execução em produção começa travada**
> (sombra → allowlist → geral), no mesmo molde da escada de governança do Brain
> e do Agente de CRM. Você abre a escada quando confiar.

## 1. O que é

Um "departamento de TI 24h" dentro do FOOCCI. O usuário (lojista) descreve um
problema em linguagem natural — texto ou voz — no balãozinho de ajuda (numa aba
**"Ajuda técnica"** ao lado da ajuda geral que já existe). O agente:

1. **Entende** o pedido e classifica: é dúvida de uso, ou um incidente sistêmico?
2. **Diagnostica** consultando sinais READ-ONLY do sistema (saúde de integrações,
   status de deploy/migração, filas, conectividade do banco, webhooks).
3. **Explica** ao usuário em linguagem clara o que está acontecendo e o que fazer.
4. **Propõe** a correção (runbook) — e, quando a ação estiver na allowlist e a
   escada permitir, **executa** a remediação segura e reversível sozinho.
5. **Escala** para humano (abre um chamado com o diagnóstico pronto) quando o
   problema estiver fora do que ele pode resolver com segurança.

Cenário-alvo: sábado à noite, sem equipe, uma API cai. O agente detecta, explica,
tenta a remediação segura (ex.: reprocessar webhook preso, re-tentar migração
travada, limpar item de fila zumbi) e, se não resolver, deixa o chamado com o
diagnóstico completo para o humano de segunda.

## 2. Molde da casa (mesmo padrão dos outros agentes)

- **Ficha padrão** (`TechAgentProfile`): persona, tom, limites — igual ao
  `CrmAgentProfile`.
- **Raciocínio pelo Brain**: `reasonAsAgent({ agentId: "suporte-tecnico" })` — o
  portão único. Nada fala com a IA por fora do motor.
- **Adaptador de conhecimento** (`TechKnowledgeAdapter`): a fonte de verdade do
  agente — o MAPA DO SISTEMA (serviços, integrações, modos de falha conhecidos,
  runbooks) + os sinais de saúde READ-ONLY do momento.
- **Quality gate** (`registerQualityGate("suporte-tecnico", ...)`): barra
  respostas perigosas (ex.: instruir o usuário a apagar dado, expor segredo,
  prometer o que não pode).
- **Escada de governança**: `SHADOW_ONLY → ALLOWLIST → RESTAURANT_WIDE` — só que
  aqui a escada governa a **execução de remediação**, não o envio de mensagem.

## 3. A escada de AÇÃO (o freio de mão)

| Degrau | O agente pode… | Estado inicial |
|---|---|---|
| **DIAGNOSE** | Ler sinais, achar causa raiz | ✅ ligado (100% read-only) |
| **EXPLAIN** | Explicar ao usuário + dar o passo-a-passo | ✅ ligado |
| **SUGGEST** | Propor a ação concreta (mas não executar) | ✅ ligado |
| **AUTO-REMEDIATE** | Executar ação da **allowlist** (segura + reversível) | 🔒 sombra (off) |
| **arbitrary fix** | Rodar correção arbitrária / código | 🚫 nunca |

Regras invioláveis da remediação automática (quando ligada):
- Só ações **explicitamente na allowlist** — nunca "execute qualquer coisa".
- Cada ação é **reversível** e **idempotente**, com limite de tentativas.
- Toda ação é **logada** (o que, por quê, resultado) — trilha de auditoria.
- Nenhuma ação toca dado do cliente de forma destrutiva.
- O texto livre do usuário **nunca** vira comando: ele dispara o *raciocínio*,
  e o raciocínio só pode escolher entre ações pré-aprovadas.

### Allowlist inicial candidata (a discutir de manhã)
Ações seguras/reversíveis que cobrem os incidentes mais comuns:
- Reprocessar um webhook (Meta/Evolution/pagamento) preso/falho.
- Re-tentar uma migração travada (o `migrate-deploy.sh` já faz isso no deploy).
- Reenfileirar/limpar um job zumbi de campanha/envio.
- Revalidar/refrescar token de integração expirado (sem expor o segredo).
- Forçar um novo health-check e reportar.

## 4. Peças a construir (o esqueleto)

1. `src/services/support/TechAgentProfile.ts` — ficha padrão.
2. `src/services/support/TechKnowledgeAdapter.ts` — mapa do sistema + sinais
   read-only + catálogo de modos de falha/runbooks.
3. `src/services/support/TechIncidentReasoner.ts` — `reasonTechIncident()` via
   `reasonAsAgent("suporte-tecnico")`: recebe o relato, classifica, diagnostica,
   propõe. Shadow-safe (`executed: false`).
4. `src/services/support/TechRemediationLadder.ts` — a máquina da escada de ação
   + a allowlist (começa vazia/sombra) + o executor governado.
5. `src/services/support/TechQualityGate.ts` — registrado como
   `runTechGateForBrain`.
6. `src/app/api/support/tech/route.ts` — endpoint (tenant auth), texto ou voz.
7. UI: aba/balão **"Ajuda técnica"** reaproveitando o widget de ajuda existente.
8. Testes de cada peça (diagnóstico determinístico, gate, escada em sombra).

## 5. Fases

- **Fase 0 (esta noite):** esqueleto no molde, tudo em SOMBRA. O agente
  diagnostica + explica + sugere; **não executa** nada em produção. Revisável.
- **Fase 1 (após revisão):** ligar a allowlist mínima em ALLOWLIST, com auditoria
  e limites — uma ação por vez, observando.
- **Fase 2 (com confiança):** ampliar allowlist + subir a escada por tipo de ação.

## 6. Riscos e como o esqueleto os contém

- **Ação destrutiva por engano** → allowlist fechada + reversibilidade + sombra.
- **Injeção via texto do usuário** → texto só dispara raciocínio; ações são
  pré-aprovadas, nunca geradas livremente.
- **Vazamento de segredo** → o gate barra; o adaptador nunca serializa tokens.
- **Falso "está tudo bem"** → diagnóstico ancorado em sinais reais; quando não
  sabe, escala para humano em vez de adivinhar.
