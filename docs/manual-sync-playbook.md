# Manual Sync — Playbook do robô noturno

> Objetivo: manter os **guias do lojista** (e, no futuro, onboarding e treinamentos)
> sempre em dia com o código. Roda toda madrugada, de forma automática. Este
> arquivo é o roteiro que a sessão noturna deve seguir — passo a passo, sempre igual.

## Como roda (o ciclo completo)
1. **03:07 BRT** — o workflow `.github/workflows/manual-sync-nightly.yml` acorda
   uma sessão do Claude Code que executa este playbook e, havendo mudanças,
   commita (`chore(manual): sync noturno YYYY-MM-DD`) e faz push na branch.
2. **Push → deploy** — o Railway publica a nova versão.
3. **Boot → publicação automática** — `scripts/start-production.sh` chama
   `POST /api/admin/manual/seed-howtos` ao subir; os guias do código entram no
   banco (publicados + visíveis pro assistente) **sem nenhum clique**.
4. De manhã, o assistente de ajuda já responde com os guias atualizados.

> Segredo necessário no GitHub (Settings → Secrets → Actions): `ANTHROPIC_API_KEY`.
> Teste manual: aba Actions → "Manual Sync Nightly" → Run workflow.

## Princípios
- **Cirúrgico:** só reescreve os guias das telas que mudaram nas últimas 24h.
- **Fiel ao código:** os passos e rótulos vêm sempre da UI real (JSX), nunca inventados.
- **Tom de lojista:** linguagem simples do dono do restaurante ("vá em Cardápio → + Novo Produto…").
- **Nunca destrói:** não apaga guia sem motivo; conteúdo é code-defined (versionado).
- **Rastreável:** toda noite deixa uma entrada em `docs/manual-sync-log.md`.

## Fonte da verdade dos guias
`src/services/manual/howToGuidesContent.ts` — array `HOW_TO_GUIDES`. Cada entrada:
`{ slug, title, area, description, content (markdown) }`. Publicados no assistente
pelo botão **📚 Atualizar guias de ajuda** (endpoint `POST /api/admin/manual/seed-howtos`),
que faz upsert por `slug` como `isPublished=true` + `agentVisibility=true`.

## Procedimento (toda madrugada)
1. **Preparar:** `git fetch origin claude/remove-legacy-runner-q8iXa` e checkout dessa branch.
2. **Raio-x das 24h:** `git log --since="26 hours ago" --name-only` (janela com folga)
   na branch de trabalho → colete a lista de arquivos alterados.
3. **Filtrar telas do lojista** — considere apenas mudanças em:
   - `src/app/(dashboard)/**` (páginas do painel)
   - `src/components/layout/**` (TopBar, Sidebar)
   - `src/components/**` que a UI do lojista use
   Ignore: testes, `src/services/**` (a menos que mudem rótulos), admin, scripts.
4. **Mapear arquivo → guia** pela tabela abaixo. Monte a lista de guias afetados.
5. **Detectar tela nova:** se surgiu rota nova em `src/app/(dashboard)/<nova>/` sem
   guia correspondente, crie um guia novo (slug `guia-<nome>`), lendo o componente real.
6. **Reescrever** cada guia afetado em `HOW_TO_GUIDES`: releia o componente da tela,
   confirme os rótulos/botões exatos e atualize o `content` (e `description` se preciso).
7. **Verificar:** `npm run type-check` (tem que passar).
8. **Registrar** no topo de `docs/manual-sync-log.md`: data, arquivos que
   dispararam, guias atualizados/criados.
9. **Publicar:** commit `chore(manual): sync noturno YYYY-MM-DD` + push na branch
   (se rejeitado, rebase e tente de novo). O deploy + boot cuidam do resto.
10. **Sem mudanças relevantes → sem commit e sem push** (evita deploy à toa).
    O registro da noite fica no log de execução do GitHub Actions.

## Mapa tela → guia → arquivo-fonte
| Guia (slug) | Tela | Arquivo-fonte principal |
|---|---|---|
| guia-painel-inicial | Início | `src/app/(dashboard)/dashboard/**` |
| guia-acompanhar-pedidos | Pedidos | `src/app/(dashboard)/orders/OrdersClient.tsx` |
| guia-central-conversas | Central de Conversas | `src/app/(dashboard)/atendimento/AtendimentoClient.tsx` |
| guia-cadastrar-produto | Cardápio | `src/app/(dashboard)/menu/MenuManager.tsx` |
| guia-cardapio-digital-qr | Cardápio (QR) | `src/app/(dashboard)/menu/MenuManager.tsx`, `src/app/(dashboard)/web-menu/**` |
| guia-precificacao | CMV & Precificação | `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx` |
| guia-agentes-ia | Agentes IA | `src/app/(dashboard)/agente-ia/AgentePage.tsx` |
| guia-ensinar-ia | Agentes IA (base de conhecimento) | `src/app/(dashboard)/agente-ia/AgentePage.tsx` |
| guia-analytics | Analytics | `src/app/(dashboard)/analytics/**` |
| guia-promocoes | Promoções | `src/app/(dashboard)/promotions/**` |
| guia-criar-campanha-crm | CRM | `src/app/(dashboard)/crm/CRMClient.tsx` |
| guia-canais-links | Canais | `src/app/(dashboard)/canais/**` |
| guia-personalizar-marca | Marca | `src/app/(dashboard)/marca/page.tsx` |
| guia-fotos-cardapio | Fotos do Cardápio | `src/app/(dashboard)/menu-enhancement/EnhancementClient.tsx` |
| guia-conectar-whatsapp | Integrações · WhatsApp | `src/app/(dashboard)/integracoes/whatsapp/**` |
| guia-integracoes | Integrações | `src/app/(dashboard)/integracoes/**` |
| guia-configurar-pagamentos | Configurações · Pagamentos | `src/app/(dashboard)/settings/payments/**` |
| guia-area-entrega-taxas | Configurações · Delivery | `src/app/(dashboard)/settings/delivery/**` |
| guia-horario-funcionamento | Configurações · Operação | `src/app/(dashboard)/settings/operation/**` |
| guia-configuracoes | Configurações (visão geral) | `src/app/(dashboard)/settings/**` |
| guia-pausar-pedidos | Pausar pedidos (topo) | `src/components/layout/TopBar.tsx` |
| guia-primeiros-passos | Onboarding (trilha) | composição dos guias acima |
| guia-treinamento-dono / -gerente / -atendente | Treinamentos por função | composição dos guias acima |
| guia-config-loja | Configurações · Loja | `src/app/(dashboard)/settings/store/**` |
| guia-equipe | Configurações · Equipe | `src/app/(dashboard)/settings/team/**` |
| guia-impressoras | Configurações · Impressoras | `src/app/(dashboard)/settings/impressoras/**` |
| guia-sons-alertas | Configurações · Sons e alertas | `src/app/(dashboard)/settings/sons/**` |
| guia-politicas | Configurações · Políticas | `src/app/(dashboard)/settings/policies/**` |

> Ao criar/renomear telas, adicione a linha correspondente aqui para o robô
> saber mapear no dia seguinte.
