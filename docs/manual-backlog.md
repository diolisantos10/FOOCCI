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

## ✅ Desbloqueado — nada pendente com o Diego
- **B1. Segredo `ANTHROPIC_API_KEY` no GitHub** — **RESOLVIDO em 30/07/2026.**
  O segredo entrou e o robô passou a rodar de verdade: execução manual de
  30/07 12:00 UTC verde (primeiro sucesso) e a agendada de 31/07 06:07 UTC
  também. No run agendado, o passo "Claude — executar o playbook do manual"
  levou 4min07s — a IA rodou, não foi só o check do segredo passando batido.
  Toda execução agendada anterior a 30/07 falhava por falta da chave.

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

## ✅ Entregue (3ª leva)
12. **P5 — FAQ automático do suporte** — `FaqMiner` + `POST /api/admin/support/mine-faq`
    (auth admin OU cron) + botão "🧠 Gerar FAQ" na aba 📈 Perguntas + cron
    semanal `.github/workflows/help-faq-mine.yml` (segundas 03:37 BRT).
    Propostas entram como Solicitações PENDENTES no manual — nada publica sozinho.
13. **P8 (v1) — Guia contextual** — o widget detecta a tela atual (usePathname)
    e destaca "📍 Guia desta tela" nas sugestões.
14. **P9 — Onboarding v2** — checklist interativo "🚀 Primeiros passos (n/8)"
    no widget, com marcação persistida e botão "como?" por etapa.
15. **P10 — Carteiro-Manual.txt** corrigido (navegação atual: Configurações →
    Impressoras, botão "🖨️ Testar", "Salvar tudo").

## 📋 A fazer
- **P6. Resgate do conteúdo do banco** — rodar `GET /api/admin/manual/export`
  em produção e trazer pro código qualquer capítulo digitado à mão que valha.
  (Precisa de acesso à produção — fora do alcance do ambiente de dev.)
- **P7. Bíblia interna no assistente?** — decidir se os 14 capítulos internos
  (Importar v0.1) também alimentam o chat. Decisão de produto do Diego.
- **P11. Tours contextuais v2** — sugestão proativa fora do estado vazio
  (ex.: balão percebe a troca de tela mesmo com conversa em andamento).

## Notas
- Escopo do robô noturno hoje: só os guias do lojista. Onboarding/treinamentos
  entram no ciclo quando existirem (P2/P3).
- Conteúdo é sempre code-defined (versionado) — o banco é espelho.
