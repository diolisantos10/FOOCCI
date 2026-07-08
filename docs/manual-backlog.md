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

## 📋 A fazer (por prioridade)
- **P1. Guias das sub-telas de Configurações** — Loja (dados/fiscal/endereço),
  Equipe, Impressoras, Sons e alertas, Políticas. Fecha 100% das telas.
- **P2. Onboarding do novo lojista** — trilha "do zero ao primeiro pedido":
  checklist guiado (marca → cardápio → horário → entrega → pagamentos →
  WhatsApp → pedido teste), integrado ao widget de ajuda.
- **P3. Treinamentos por função** — trilhas para Dono, Gerente e Atendente
  (o que cada papel precisa dominar, com os guias como blocos).
- **P4. Métricas do assistente** — perguntas mais feitas e perguntas sem boa
  resposta (gaps) → viram novos guias. Painel simples no admin.
- **P5. FAQ automático do suporte** — minerar conversas escaladas resolvidas
  e propor capítulos de FAQ (via change-request para aprovação).
- **P6. Resgate do conteúdo do banco** — rodar o export em produção e trazer
  pro código qualquer capítulo digitado à mão que valha manter.
- **P7. Bíblia interna no assistente?** — decidir se os 14 capítulos internos
  (Importar v0.1) também alimentam o chat. Decisão de produto pendente.
- **P8. Tours contextuais (Fase 3 do widget)** — o widget percebe em que tela
  o lojista está e oferece o guia daquela tela proativamente.

## Notas
- Escopo do robô noturno hoje: só os guias do lojista. Onboarding/treinamentos
  entram no ciclo quando existirem (P2/P3).
- Conteúdo é sempre code-defined (versionado) — o banco é espelho.
