# Foocci — Design QA & Refino Premium (Site Público)

> Versão 1 · 2026-06-05 · Aplica-se a `/site` e `/site/*`.
> Status: **pré-lançamento (piloto).** Pass de QA de design sênior + refino de UX premium.
> Pré-requisito: ver `pre-launch-mode-v1.md` (o que está intencionalmente desligado) e
> `copy-decisions-v1.md` (fonte de verdade de copy).

Este documento registra a auditoria de design e o refino aplicado para o site
parecer um produto SaaS **pronto para lançar** — sem abrir vendas, sem WhatsApp,
sem captação real e sem mover `/site` para `/`.

---

## 1. Resumo da auditoria de design

O site já era **seguro, coerente e honestamente pré-lançamento**, mas lia como um
*template organizado*, não como um *site de produto premium*. Pontos principais:

| Área | Diagnóstico | Severidade |
|---|---|---|
| Impressão em 5s | Limpo e confiável, porém "plano" — sem momento focal nem profundidade. | Alta |
| Hero | Copy correta, mas mockup leve, fundo cinza chapado, sem pista de capacidade. | Alta |
| Ritmo visual | **Maior problema:** 14 seções, todas `py-20`, alternância branco/cinza rígida, sem âncora escura, sem clímax. | Alta |
| Mockups | Inconsistentes — hero com rótulos, `DemoSection` só com barras cinza (parecia inacabado). Sem linguagem visual única. | Alta |
| Tipografia | Inter **400/600 apenas** → todo `font-bold` é **700 sintético**. Uso de "eyebrow" inconsistente. | Média |
| Consistência de cards | Sombras/realces ad-hoc, sem token de profundidade. | Média |
| Páginas internas | `demonstracao` era só texto — mais fina que a home. | Média |
| Excesso de laranja | **Não há excesso** — laranja é acento disciplinado; quase-preto + cinza dominam. | Baixa |
| Clareza pré-lançamento | Excelente e honesta (badges, "em breve", sem preço/forma/métrica falsos). | Forte |
| Premium vs template | **Tendia a template.** Faltava profundidade, mockup focal, âncora escura, eyebrows consistentes. | Alta |

**Direção adotada:** adicionar **profundidade**, um **mockup focal no hero**, **uma
âncora escura** de ritmo, uma **linguagem de mockup compartilhada**, **eyebrows
consistentes** e um **pass de foco/acessibilidade** — sem tocar em produto, vendas
ou nas garantias de pré-lançamento.

---

## 2. Melhorias implementadas

### Novos componentes (linguagem visual compartilhada)
- **`mockups.tsx`** — linguagem única de mockup (CSS, ilustrativa): `AppFrame` (chrome
  consistente), primitivos (`Bar`, `Tag`, `IconTile`, `MockRow`) e **5 mockups
  canônicos**: `OrderMockup`, `CrmProfileMockup`, `WhatsAppContextMockup`,
  `CampaignMockup`, `InsightMockup`. Um token de sombra (`MOCKUP_SHADOW`) dá a
  todos a mesma profundidade premium. **Sem números inventados, sem métricas, sem
  logo/foto/dado real** — apenas rótulos neutros aprovados.
- **`SectionHeading.tsx`** — cabeçalho de seção único (eyebrow → H2 → subtítulo) com
  `id` para `aria-labelledby`. Garante ritmo e escaneabilidade consistentes.
- **`EssenceBand.tsx`** — **âncora escura** (`#0B0B0B`) com a essência emocional
  **já aprovada** ("Transformando pedidos em experiências que fazem clientes
  voltarem.") + tríade Vender · Relacionar · Fidelizar. Quebra a monotonia e cria
  o clímax visual. Sem CTA, sem métrica.

### Hero (Task 2)
- Mockup focal trocado para `OrderMockup` (linguagem compartilhada) + chips flutuantes.
- Glow quente único atrás do mockup (radial sutil — **sem "blobs" genéricos**).
- Badge premium com ponto "ao vivo" (ping) e anel.
- **Faixa de capacidades** ("Em um só sistema: Cardápio digital · WhatsApp · IA · CRM")
  — densidade premium e escaneável, sem texto longo acima da dobra.
- Copy do hero **exatamente** como especificada (H1, subheadline, CTAs, microcopy).

### Ritmo de seções (Task 4)
- Inserida a `EssenceBand` (escura) entre Recuperação e Comparação → branco→escuro→cinza.
- Variedade preservada: split (CRM, WhatsApp), narrativa central (Problema, Mudança,
  Recuperação, Comparação), grids (Pilares, Soluções), mockup (Hero, Demo, Demonstração),
  comparação (Mudança, Comparação) e quebras (Essência, Fechamento).
- Eyebrows consistentes adicionados (Antes da Foocci, Mudança estratégica, Por que Foocci,
  WhatsApp, Recuperação, Comparação, Produto, Dúvidas).

### Mockups de produto (Task 3)
- `DemoSection` reescrita: as 5 abas agora renderizam os 5 mockups canônicos (era só
  barras cinza). Layout em duas colunas (texto + preview) com superfície premium.
- `CRMSection` e `WhatsAppSection` unificadas ao `AppFrame`/profundidade compartilhada.

### Páginas internas (Task 6)
- `demonstracao`: passou a **prever o produto** com uma montagem de 3 mockups, claramente
  rotulado "Telas ilustrativas do produto em fase piloto" (honesto, sem fingir dashboard).
- `como-funciona`: seção "Bastidor" virou seção com mockup (duas colunas); CTA fraco
  ("Voltar para a página principal") trocado por "Conhecer a proposta".
- `precos`/`sobre`: profundidade (anéis) e semântica adicionadas; sem preços (mantido).
- `PageHero`/`LegalShell`: glow sutil e `aria-labelledby` para conectar visualmente.

### Acessibilidade e estados de interação (Task 8)
- `focus-visible:ring` em **todo** elemento interativo (header, nav, footer, sticky CTA,
  abas, FAQ, CTAs).
- `aria-labelledby` em todas as seções (landmarks com nome) e `aria-controls`/`role`
  no acordeão do FAQ; alvos de toque do FAQ aumentados (`py-5`, ≥44px).
- `aria-label` em navegações; badge "ao vivo" puramente decorativo (`aria-hidden`).

---

## 3. Direção visual atual

- **Base branca**, texto **quase-preto `#0B0B0B`**, **laranja `#F97316` como único acento**
  (badges, eyebrows, CTA primário, realces). Acentos multicolor só nos chips de
  segmento do CRM (sky/emerald/amber/brand/rose) para dar vida sem poluir.
- **Profundidade**: cards com `ring-1 ring-gray-900/[0.02–0.03]`; mockups com sombra
  em camadas (`MOCKUP_SHADOW`). Nada de sombras pesadas.
- **Uma âncora escura** (`EssenceBand`) como clímax do scroll.
- **Glows radiais sutis** (≤10% de opacidade) em vez de blobs.
- **Mockups** = uma só linguagem (`AppFrame`), parecendo UI real **sem** fingir
  dashboards exatos; rótulos neutros aprovados ("Pedido guiado", "Cliente identificado",
  "Histórico salvo", "Campanha CRM", "Cliente recorrente", "Oportunidade recuperada",
  "Sugestão inteligente", "Dados comerciais").

---

## 4. Decisões mobile (390px)

- Body com `overflow-x-hidden` + seções `overflow-hidden` → glows nunca geram scroll
  horizontal. Verificado: **sem overflow** nas 7 rotas.
- Hero: mockup `max-w-xs` no mobile (não domina), chips flutuantes só `lg`, CTAs cedo
  (logo após a subheadline), faixa de capacidades quebra em linha (`flex-wrap`).
- Fluxos (Recuperação, Como funciona) e comparações empilham (`flex-col`/`grid` 1-col)
  com setas rotacionadas; grids viram 1 coluna.
- `DemoSection` e `demonstracao`: preview empilha acima do texto; mockups em `max-w-sm`
  centralizados, sem estourar o padding.
- Sticky CTA mobile: único, não-vendas, com espaçador para não cobrir o rodapé; foco visível.
- FAQ: alvos de toque ≥44px.

## 5. Decisões de copy

- **Nada de copy de vendas ativa.** Mantidas as frases fortes aprovadas (pedido direto /
  marketplace / clientes desaparecem / chatbot responde). "Chatbot" só na seção de
  Comparação. Sem "máquina de vendas", sem jargão, sem superpromessa, sem métrica.
- `EssenceBand` usa **apenas** a essência emocional já aprovada em `copy-decisions-v1.md`.
- Mockups usam somente os rótulos neutros permitidos (lista acima) — nenhum número/percentual.
- Microcopy honesta nas prévias ("Telas ilustrativas do produto em fase piloto").

---

## 6. O que falta para o modo de lançamento final

Sem mudança de design — são ativações de negócio (ver checklist em `pre-launch-mode-v1.md`):
1. Número de WhatsApp + destino do lead (backend/CRM real) → liga `WhatsAppCta` e `DemoForm`.
2. Preços reais nos cards (hoje "Em definição para o lançamento").
3. Revisão jurídica das páginas legais (LGPD).
4. Logo/favicon/Brand Book reais (hoje wordmark em texto).
5. Troca `/site` → `/` (com matriz de rotas validada).

---

## 7. Itens em aberto (assets e ativações)

- [ ] **Logo/marca real** (header, footer, favicon) — hoje wordmark "Foocci" + pílula "em breve".
- [ ] **Screenshots reais do produto** — substituir os mockups CSS quando houver UI estável
      e autorizada (a linguagem de `mockups.tsx` foi feita para ser trocada sem refatorar layout).
- [ ] **CTA de WhatsApp real** — `WhatsAppCta` reservado; ativa via `WHATSAPP_SALES_NUMBER`.
- [ ] **Captação de leads real** — `DemoForm` reservado; ativa com backend de leads.
- [ ] **Mover `/site` → `/`** — Fase 6 do roadmap, com gate.
- [ ] **Sign-off visual** — QA por screenshot (390/768/1440) não pôde ser gerado neste
      ambiente (download de browser bloqueado por política de rede); recomenda-se rodar
      `next start` + captura em ambiente com browser antes do go-live.
- [ ] **Fonte 700 real** — opcional: hoje `font-bold` é 700 sintético (apenas 400/600
      carregados). Para crispância máxima, carregar Inter 600/700 reais ou padronizar 600.

---

## 8. Validação executada

- `tsc --noEmit`: **0 erros** (superfície de marketing limpa; projeto inteiro limpo após `prisma generate`).
- `next lint` (marketing + site): **sem warnings/erros**.
- `next build`: sucesso; as 7 rotas `/site` **prerenderizadas como estáticas (○)**.
- Runtime (`next start`): 7 rotas → **200**; rotas de produto (`/dashboard`, `/crm`,
  `/orders`) → **307** (middleware intacto). `/site` indexável; produto `noindex`.
- Segurança: **0** `wa.me`, **0** preços `R$`, **0** `+X%`, **0** botão de envio ativo.
