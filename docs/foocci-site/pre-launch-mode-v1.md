# Foocci — Modo Pré-Lançamento (Site Público)

> Versão 1 · 2026-06-04 (atualizado 2026-06-05) · Aplica-se a `/site` e `/site/*`.
> Status: **pré-lançamento (piloto).** Abertura comercial prevista para ~julho.

A Foocci está em fase piloto e **ainda não vende**. O site existe para apresentar
a proposta, gerar desejo, confiança e expectativa — **sem abrir operação de vendas**.

---

## 1. Por que o site está em pré-lançamento

- O produto está em piloto e não está pronto para venda pública.
- O lançamento comercial será anunciado em breve (~julho).
- O objetivo é vender a **visão**, não iniciar vendas: desejo, confiança e antecipação.

---

## 2. O que está intencionalmente DESLIGADO

| Item | Estado | Onde |
|---|---|---|
| WhatsApp de vendas | ❌ Nenhum link `wa.me` renderizado | `WHATSAPP_SALES_NUMBER = null` em `config.ts` |
| Captação real de leads | ❌ Sem endpoint, sem POST | `DemoForm.tsx` existe, mas **não é renderizado** (reservado) |
| Agendamento de demonstração | ❌ Não disponível | `/site/demonstracao` é um painel "em breve" |
| Preços | ❌ Sem valores | "Em definição para o lançamento" |
| Raiz de produção `/` | ❌ Não trocada | Site permanece em `/site` |
| Indexação (SEO) | ❌ `noindex, follow` temporário | Centralizado em `src/app/site/layout.tsx` |

Nenhum formulário finge envio. Nenhum CTA implica disponibilidade imediata.

### Indexabilidade (decisão de negócio · 2026-06-05)

- `/site` é **intencionalmente temporário** e está em **`noindex, follow`** enquanto a
  Foocci não está comercialmente no ar. O subtree inteiro herda o `robots` do
  `src/app/site/layout.tsx` (fonte única) — as páginas não definem `robots` próprias.
- A raiz **`/`** será a rota pública **indexável oficial apenas no lançamento**. A troca
  é de **uma linha** em `site/layout.tsx`: `robots: { index: true, follow: true }`.
- A infraestrutura de vendas permanece **desligada** (WhatsApp, captação de leads,
  agendamento de demo e tracking serão ativados depois — ver seções 4 e 6).
- **Revisão jurídica** das páginas legais e **sign-off visual** são exigidos antes do
  lançamento (ver `visual-signoff-checklist-v1.md`).

---

## 3. CTAs usados agora (pré-lançamento)

| Papel | Texto | Destino |
|---|---|---|
| Primário | **Ver como a Foocci funciona** | `/site/como-funciona` |
| Secundário | **Conhecer a proposta** | `/site/sobre` (na home, rola para `#solucoes`) |
| Badge | **Em breve para restaurantes selecionados** | — |
| Nota | "Produto em fase piloto. Lançamento comercial em breve." | — |
| Header | pílula **em breve** ao lado do wordmark | — |

Centralizados em `src/components/marketing/config.ts` e `Cta.tsx`.

---

## 4. CTAs que serão ativados no lançamento

- **"Falar no WhatsApp"** — `WhatsAppCta` já existe (reservado); ativa ao definir `WHATSAPP_SALES_NUMBER`.
- **Formulário de demonstração** — `DemoForm` já existe (reservado); ativa ao ligar um backend de leads real.
- **"Solicitar / Agendar demonstração"** — quando a demo comercial abrir.
- **Preços reais** nos cards de planos.

---

## 5. O que precisa acontecer antes do lançamento

1. Definir **número de WhatsApp** de vendas + **destino do lead** (backend/CRM real).
2. Definir e publicar **preços reais**.
3. **Revisão jurídica** das páginas legais (LGPD) — hoje são versões iniciais que já
   refletem o pré-lançamento (sem forms/WhatsApp ativos), mas exigem revisão final.
4. Aplicar **logo/favicon/Brand Book** reais (hoje wordmark em texto).
5. **Sign-off visual** (390/768/1440) aprovado — ver `visual-signoff-checklist-v1.md`.
6. Trocar **indexação** de `noindex,follow` → `index,follow` em `site/layout.tsx`.
7. Decidir e executar a **troca `/site` → `/`** (Fase 6 do roadmap, com gate).

---

## 6. Checklist seguro de lançamento (julho)

- [ ] Número de WhatsApp configurado em `config.ts` e testado.
- [ ] Backend de leads ligado ao `DemoForm` (sem fake submission).
- [ ] Preços reais definidos e publicados em `/site/precos` e no teaser da home.
- [ ] Páginas legais revisadas juridicamente.
- [ ] Logo e marca reais aplicados (header, footer, favicon).
- [ ] CTAs trocados de pré-lançamento → comerciais (`Cta.tsx` / `config.ts`).
- [ ] Badge "em breve" e notas de piloto removidos.
- [ ] **Indexação trocada** `noindex,follow` → `index,follow` em `site/layout.tsx`.
- [ ] Metadata/SEO atualizada para comunicar disponibilidade.
- [ ] **Sign-off visual aprovado** (`visual-signoff-checklist-v1.md`, 390/768/1440).
- [ ] Analytics/tracking de conversão (opcional).
- [ ] Validação `tsc` / `lint` / `build` + QA mobile (390/768/1440).
- [ ] Execução da troca `/site` → `/` com matriz de rotas validada.
