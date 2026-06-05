# Foocci — Site Backlog V1

> Backlog priorizado do site público. Versão 1 · 2026-06-04.
> Legenda de status: ✅ feito (V1, commit `c9ffa4a`) · ⏳ pendente.

---

## P0 — Necessário agora (base de conversão)

> **Estado geral: ✅ entregue na V1 em `/site`.** Critérios de aceite abaixo
> servem como checklist de regressão para qualquer mudança futura.

| # | Item | Objetivo | Critério de aceite | Risco se mal feito | Status |
|---|---|---|---|---|---|
| 1 | Rota segura `/site` | Vitrine isolada do produto | `/site` = 200 público; `/`, `/pedido`, `/qr`, `/dashboard`, `/api` inalterados | Quebrar fluxo de produto / expor rota protegida | ✅ |
| 2 | Home premium v1 | Narrativa comercial completa | Todas as seções renderizam sem erro | Página fraca não converte | ✅ |
| 3 | Header e footer | Navegação e fechamento | Header fixo com nav + CTA; footer com links válidos | Navegação confusa | ✅ |
| 4 | Hero com posicionamento | Comunicar valor em 5s | H1 aprovado + sub + 2 CTAs visíveis acima da dobra | Mensagem ambígua | ✅ |
| 5 | CTA “Quero ver a Foocci funcionando” | Direcionar à conversão | Presente em header, hero, planos, CTA final → `#demonstracao` | Sem caminho de conversão | ✅ |
| 6 | CTA secundário WhatsApp | Canal alternativo | “Falar no WhatsApp” presente; ativa com número real | Link morto/falso | ✅ (fallback documentado) |
| 7 | Seção Problema | Criar urgência | 5 dores claras, sem números falsos | Não gera identificação | ✅ |
| 8 | Seção virada estratégica | Pedido direto = experiência | Mensagem “relacionamento constrói cliente” sem atacar marketplace | Soar agressivo | ✅ |
| 9 | Pilares vendas/relacionamento/fidelização | Eixo do produto | 3 pilares com benefício claro | Reduzir a “só IA de pedido” | ✅ |
| 10 | Como funciona | Reduzir objeção | 6 passos do 1º contato à recorrência | Cliente não entende o fluxo | ✅ |
| 11 | Módulos do produto | Mostrar amplitude | 8 módulos com benefício curto | Parecer ferramenta única | ✅ |
| 12 | Seção CRM | Mostrar relacionamento | Cards de segmento + wording “ajuda a organizar” | Prometer automação não validada | ✅ |
| 13 | Seção WhatsApp | WhatsApp comercial | Wording cauteloso (“ajuda a”, “pode integrar”) | Superprometer comportamento | ✅ |
| 14 | Comparação Chatbot × Foocci | Diferenciação | Duas colunas + frase de fechamento | Parecer chatbot | ✅ |
| 15 | Preview do produto | Tornar tangível | Tabs com mockups CSS, **sem dados falsos** | Mockup parecer fake | ✅ |
| 16 | Teaser de planos sem preço falso | Qualificar | 3 planos + “configuração sob demonstração” | Preço inventado | ✅ |
| 17 | FAQ | Remover dúvidas | 7 perguntas com respostas curtas | Dúvida vira objeção | ✅ |
| 18 | CTA final | Fechar a visita | Título + formulário + WhatsApp | Visita sem conversão | ✅ |
| 19 | Responsivo mobile-first | Excelência no mobile | Sem overflow horizontal; comparação empilha; CTA fixo | Mobile ruim derruba conversão | ✅ |
| 20 | SEO básico | Indexação | `<title>`, description, `robots:index`, OpenGraph | Página não indexa | ✅ |
| 21 | Acessibilidade básica | Inclusão e qualidade | Headings semânticos, labels, `aria` em toggles | Inacessível / penalização | ✅ |
| 22 | Validação TS/build | Não quebrar build | `tsc` limpo, `next lint` limpo, render 200 | Deploy quebrado | ✅ |

---

## P1 — Refino premium e conversão

| # | Item | Objetivo | Critério de aceite | Risco se mal feito |
|---|---|---|---|---|
| 1 | Refino de ritmo visual | Respiro e hierarquia premium | Espaçamento e tipografia consistentes em todas as seções | Visual amador |
| 2 | Mockups de produto melhores | Mais credibilidade | Mockups CSS mais fiéis (ainda sem dados falsos) | Parecer fake |
| 3 | Assets reais da Foocci | Identidade verdadeira | Logo/anagrama aplicados no header/footer | Marca inconsistente |
| 4 | Screenshots reais do produto | Prova visual | Imagens reais otimizadas (sem dados sensíveis) | Vazar dado / parecer genérico |
| 5 | CTA fixo mobile | Conversão no scroll | Barra inferior aparece após o hero | Cobrir conteúdo |
| 6 | Form/modal de captura de lead | Capturar lead | Form com validação ligado a backend real | Lead perdido / form falso |
| 7 | WhatsApp com número oficial | Canal vivo | `WHATSAPP_SALES_NUMBER` configurado e testado | Link errado |
| 8 | Eventos de conversão (tracking) | Medir funil | Eventos disparam em CTA/scroll/submit | Decisão sem dado |
| 9 | FAQ schema (JSON-LD) | Rich result | Schema válido no Google Rich Results Test | Sem ganho de SEO |
| 10 | Microinterações | Polimento | Transições suaves, sem exagero | Distrair/pesar |
| 11 | Hero mobile melhor | 1ª tela perfeita | Hero não dominado pelo mockup no 390px | Hero confuso |
| 12 | Passe de QA visual | Consistência | Checklist de QA aprovado em 320–1440px | Bugs visuais |

---

## P2 — Páginas internas

> Para cada página: **propósito · seções obrigatórias · foco de SEO · CTA**.

### 1. `/como-funciona`
- **Propósito:** explicar o fluxo completo e reduzir objeção.
- **Seções:** hero da página, passo a passo detalhado, papel da IA, CRM e recorrência, FAQ curto.
- **SEO:** “como funciona Foocci”, “sistema de pedidos para restaurante”.
- **CTA:** “Quero ver a Foocci funcionando”.

### 2. `/demonstracao`
- **Propósito:** página de conversão dedicada.
- **Seções:** proposta clara, formulário de demonstração, WhatsApp, o que esperar da demo.
- **SEO:** “demonstração Foocci”, “agendar demonstração restaurante”.
- **CTA:** envio do formulário + WhatsApp.

### 3. `/precos`
- **Propósito:** qualificar por plano, sem preço falso.
- **Seções:** planos por momento (Essencial/Crescimento/Performance), o que cada um inclui, FAQ de preço.
- **SEO:** “preço Foocci”, “quanto custa CRM para restaurante”.
- **CTA:** “Ver melhor plano para meu restaurante”.

### 4. `/sobre`
- **Propósito:** confiança e propósito.
- **Seções:** missão, visão de hospitalidade digital inteligente, time/contato.
- **SEO:** “sobre a Foocci”.
- **CTA:** “Falar no WhatsApp”.

### 5. `/politica-de-privacidade`
- **Propósito:** conformidade LGPD (obrigatória antes de captar dados).
- **Seções:** dados coletados, finalidade, direitos do titular, contato do DPO.
- **SEO:** baixa prioridade (não-indexável é aceitável).
- **CTA:** nenhum.

### 6. `/termos-de-uso`
- **Propósito:** termos legais.
- **Seções:** uso do site, propriedade, limitações, foro.
- **SEO:** baixa prioridade.
- **CTA:** nenhum.

---

## P3 — Crescimento e aquisição

| # | Item | Objetivo | Risco se mal feito |
|---|---|---|---|
| 1 | Blog | Autoridade e SEO orgânico | Conteúdo raso sem tração |
| 2 | Páginas de solução (V2) | Conversão por intenção | Páginas duplicadas/finas |
| 3 | Páginas de segmento (V3) | SEO segmentado | Conteúdo genérico |
| 4 | Casos de sucesso | Prova social real | Caso inventado (proibido) |
| 5 | Guias | Lead magnets | Sem captura ligada |
| 6 | Comparativos | Decisão de compra | Comparação desonesta |
| 7 | Testes A/B | Otimizar conversão | Decisão sem significância |
| 8 | CMS / conteúdo editável | Escala de conteúdo | Acoplar ao produto |
| 9 | Integração de leads no CRM | Lead vira oportunidade | Lead perdido / dado errado |
| 10 | Analytics avançado | Funil completo | Privacidade / dado falso |

---

## Pre-launch mode

> A Foocci está em piloto (abertura comercial ~julho). O site comunica "em breve"
> e **não** abre vendas. Detalhes em [`pre-launch-mode-v1.md`](./pre-launch-mode-v1.md).

| # | Item | Estado | Observação |
|---|---|---|---|
| 1 | Refino premium de design | ✅ feito | Hero, ritmo, cards, CTAs pré-lançamento |
| 2 | Copy "em breve" / piloto | ✅ feito | Badge, notas, FAQ de pré-lançamento |
| 3 | Infra de vendas desligada | ✅ feito | Sem WhatsApp, sem lead real, sem preços, sem `/` |
| 4 | WhatsApp de vendas | ⏳ no lançamento | `WhatsAppCta` reservado; setar `WHATSAPP_SALES_NUMBER` |
| 5 | Captação de leads | ⏳ no lançamento | `DemoForm` reservado; ligar backend real |
| 6 | Preços reais | ⏳ no lançamento | Hoje "Em definição para o lançamento" |
| 7 | Troca `/site` → `/` | ⏳ no lançamento | Fase 6 do roadmap, com gate de aprovação |
| 8 | Revisão jurídica (legais) | ⏳ antes do lançamento | LGPD / Termos (copy já reflete pré-lançamento) |
| 9 | Logo / marca reais | ⏳ antes do lançamento | Hoje wordmark em texto |
| 10 | Indexação `/site` | ✅ `noindex,follow` temporário | Centralizado em `site/layout.tsx`; vira `index` no lançamento |
| 11 | Copy legal alinhada ao pré-lançamento | ✅ feito | Sem implicar forms/WhatsApp/venda ativos |
| 12 | Tipografia sem bold sintético | ✅ feito | `font-semibold` (Inter 600 real) no marketing |

### Antes do lançamento

> Gate de aprovação humana antes de abrir comercialmente. Detalhes operacionais em
> [`pre-launch-mode-v1.md`](./pre-launch-mode-v1.md) e
> [`visual-signoff-checklist-v1.md`](./visual-signoff-checklist-v1.md).

- [ ] QA visual final aprovado (390/768/1440) — `visual-signoff-checklist-v1.md`.
- [ ] Logo/favicon/assets reais aplicados.
- [ ] Screenshots reais do produto (se substituir os mockups CSS).
- [ ] Revisão jurídica final das páginas legais (LGPD/Termos).
- [ ] Metadata de lançamento (`noindex,follow` → `index,follow` em `site/layout.tsx`).
- [ ] Troca `/site` → `/` com matriz de rotas validada (sem afetar produto).
- [ ] Ativar CTAs de vendas (pré-lançamento → comercial).
- [ ] Ativar captação de leads (`DemoForm` + backend real).
- [ ] Ativar WhatsApp (`WHATSAPP_SALES_NUMBER` configurado e testado).
- [ ] Analytics/tracking de conversão configurado.
