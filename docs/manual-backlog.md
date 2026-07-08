# Manual, Treinamentos & Onboarding — Backlog

> Fonte oficial do que está feito e do que vem a seguir nesta área.
> Mantido pelo chat dedicado de Manual/Treinamentos/Onboarding.
> Atualize este arquivo ao concluir ou repriorizar itens.

## ✅ Entregue
1. **Widget de ajuda flutuante** no painel do lojista — chat IA (RAG no manual),
   aba Avisos (notificações), "Falar com a FOOD" (último caso), "Nova conversa".
2. **Inbox de suporte** (`/admin/support-inbox`) — equipe responde escalações.
3. **Ponte do manual → assistente** — toggle por capítulo, botão único
   "📚 Atualizar guias de ajuda", tela do admin simplificada (Avançado ▾).
4. **20 guias do lojista** — um por tela principal, com rótulos reais da UI.
5. **Export do manual** (`GET /api/admin/manual/export`) — auditoria do que
   está no banco (inclusive capítulos digitados à mão).
6. **Robô noturno (manual vivo)** — workflow diário 03:07 BRT reescreve guias
   das telas alteradas + auto-publicação no boot do deploy. Playbook + log em docs/.

## ⚠️ Bloqueado — depende do Diego
- **B1. Segredo `ANTHROPIC_API_KEY` no GitHub** (Settings → Secrets → Actions).
  Sem ele o robô noturno acorda mas não roda a IA. É o único passo manual.

## ✅ Entregue (2ª leva)
7. **P1 — Guias das sub-telas de Configurações** — Loja, Equipe, Impressoras,
   Sons e alertas, Políticas. Todas as telas agora têm guia (29 no total).
8. **P2 (v1) — Onboarding** — guia "Primeiros passos — do zero ao primeiro
   pedido" + sugestão 🚀 em destaque no widget. (v2 futura: checklist interativo.)
9. **P3 — Treinamentos por função** — trilhas para Dono, Gerente e Atendente.
10. **P4 (v1) — Métricas do assistente** — `GET /api/admin/support/metrics` +
    aba "📈 Perguntas" no support-inbox (mais perguntadas + gaps sem resposta).
11. **Branch órfã resolvida** — `eloquent-franklin` verificada 100% redundante
    (commit já reaplicado no runner como e88a46a). Apagar no GitHub UI.

## 📋 A fazer (por prioridade)
- **P5. FAQ automático do suporte** — minerar conversas escaladas resolvidas
  e propor capítulos de FAQ (via change-request para aprovação).
- **P6. Resgate do conteúdo do banco** — rodar `GET /api/admin/manual/export`
  em produção e trazer pro código qualquer capítulo digitado à mão que valha.
- **P7. Bíblia interna no assistente?** — decidir se os 14 capítulos internos
  (Importar v0.1) também alimentam o chat. Decisão de produto pendente.
- **P8. Tours contextuais (Fase 3 do widget)** — o widget percebe em que tela
  o lojista está e oferece o guia daquela tela proativamente.
- **P9. Onboarding v2** — checklist interativo no widget (marcar etapas feitas).
- **P10. Corrigir Carteiro-Manual.txt** — o manual baixável do Carteiro cita a
  navegação antiga ("Integrações → Impressão"); atualizar para
  "Configurações → Impressoras" e o botão "🖨️ Testar".

## Notas
- Escopo do robô noturno hoje: só os guias do lojista. Onboarding/treinamentos
  entram no ciclo quando existirem (P2/P3).
- Conteúdo é sempre code-defined (versionado) — o banco é espelho.
