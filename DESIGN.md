# Foocci — Design System (livro da marca / UI)

> **Como usar este arquivo:** é a **referência única** de todo trabalho de interface do
> Foocci. Antes de criar/alterar qualquer tela, siga os tokens e padrões daqui.
> Ao final há a lista de **inconsistências conhecidas** (drift) que devem ser
> corrigidas quando você tocar no arquivo, nunca ampliadas.
>
> Gerado a partir do código real (Next.js 14 App Router + Tailwind 3.4).
> Fontes de verdade: `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`,
> `src/components/ui/index.tsx`.

---

## 0. Princípio & as DUAS superfícies

O Foocci tem **duas identidades visuais distintas** — não misture os padrões:

| Superfície | Onde | Identidade |
|---|---|---|
| **Painel (admin)** | `(dashboard)/**` | **Foocci** — laranja `#F97316` sobre off‑white `#F6F6F4`. "Minimalismo premium: ~90% neutro + 10% laranja." |
| **Loja (cliente)** | `pedido/[slug]`, `qr/[slug]` | **White‑label** — cor por restaurante via `--brand-primary`/`--brand-secondary` (default WhatsApp: verde `#25d366` sobre bege `#ece5dd`). Estética de chat. |

Regra de ouro: no **painel** use os tokens Foocci (laranja + neutros). Na **loja** nunca
cravar cor de marca — sempre `var(--brand-primary)`/`var(--brand-secondary)`.

Stack: Tailwind puro, **sem shadcn/ui, sem Radix, sem Headless UI, sem lucide/framer** —
componentes são escritos à mão. Ícones = **emoji** + SVG custom (`components/marketing/icons.tsx`).

---

## 1. Cores

### Tokens semânticos (use ESTES — `tailwind.config.ts`)

**Marca — laranja (o acento primário do painel):**
| Token | Hex | Uso |
|---|---|---|
| `brand-50` | `#fff7ed` | fundo de pill/badge |
| `brand-100` | `#ffedd5` | anel de foco (`ring-brand-100`) |
| `brand-400` | `#fb923c` | borda de foco (`border-brand-400`) |
| `brand-500` | `#f97316` | **primário** (botões, ativos) |
| `brand-600` | `#ea580c` | **hover** do primário |
| `brand-700` | `#c2410c` | pressionado |

**Neutros (o "90% neutro"):**
| Token | Hex | Uso |
|---|---|---|
| `ink` | `#0B0B0B` | títulos / texto forte |
| `ink2` | `#5C5C58` | texto de corpo |
| `muted` | `#8A8A86` | texto secundário / placeholder |
| `paper` | `#FFFFFF` | superfícies / cards |
| `canvas` | `#F6F6F4` | fundo do app |
| `line` | `#E9E9E6` | hairline / bordas suaves |
| `line2` | `#E5E5E5` | borda mais forte / inputs |

Superfícies neutras auxiliares (hoje literais — trate como tokens): `#F4F4F2` (chip / hover neutro), `#FAFAF8` (hover sutil de secundário).

### Cores de status (semânticas — sempre o par 50/600‑700)
`green` (sucesso) · `red` (erro) · `amber` (aviso) · `blue` (info). Fundo `-50/-100`, texto `-600/-700`, ponto `-500`.
→ **Padronize "aviso" em `amber`** (hoje há `amber` e `yellow` misturados — ver drift #7).

### ❌ Não use
- **`indigo`/`violet`/`purple`** como cor de ação — **não é a marca**. É o maior drift do projeto (360 usos). Ação primária = `brand-500`.
- **`gray-*` cru** pra texto/borda — use `ink/ink2/muted` e `line/line2`.
- **Hex literal** quando existe token (`border-[#E5E5E5]` → `border-line2`).

### Loja (cliente) — white‑label
```tsx
const pc = brandPrimaryColor || "#25d366";   // PedidoClient.tsx:2364
const sc = brandSecondaryColor || "#128c7e";
// CTA:  style={{ backgroundColor: "var(--brand-primary)" }}
```

---

## 2. Tipografia

- **Inter**, local (`next/font/local`), `--font-inter`. **Só os pesos 400 e 600 são carregados** (`layout.tsx`, `public/fonts/inter-{400,600}.woff2`).
- **Regra:** use **`font-normal` (400)** e **`font-semibold` (600)** — são os únicos pesos reais.
  - ⚠️ `font-medium` (500), `font-bold` (700), `font-extrabold` (800) hoje renderizam como **faux‑bold** sintético (peso não existe no arquivo). Ao criar tela nova, prefira 400/600. (Ver drift #9 — a correção definitiva é carregar +pesos OU padronizar em 400/600.)
- Tamanho base: 16px (default do browser). Escala comum: `text-xs` `text-sm` `text-base` `text-2xl`.
- Título de seção: `text-[12.5px] font-bold uppercase tracking-[.04em] text-ink2` (`SectionTitle`).

---

## 3. Raio, espaçamento, sombra, borda

- **Raio:** cards & modais **`rounded-2xl`**; botões & inputs **`rounded-xl`**; nav/itens pequenos `rounded-lg`; pills/toggles/dots `rounded-full`. Bottom‑sheets da loja `rounded-t-3xl`.
- **Espaçamento:** botões `px-4 py-2.5` (ou `px-5 py-2`); inputs `px-3 py-2`; cards `p-5`; gaps `gap-2 / gap-2.5 / gap-3`.
- **Sombra:** card = `shadow-[0_1px_2px_rgba(11,11,11,.03)]` (ultra‑sutil); primário laranja = `shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)]`; modal = `shadow-2xl`; cards interativos `shadow-sm hover:shadow-md`.
- **Borda:** 1px, `border-line` (padrão) / `border-line2` (inputs/mais forte).

---

## 4. Componentes — o kit oficial (`src/components/ui/index.tsx`)

**Use o kit `@/components/ui` em telas novas** (Button, Card, Pill, ConfirmDialog, SectionTitle, Stat…). Ele hoje é subusado (só 4 arquivos importam), e reimplementar inline é a raiz das inconsistências — não reinvente.

**Botão** — base: `inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-50`
- **primário:** `bg-brand-500 text-white border-brand-500 shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] hover:bg-brand-600`
- **secundário:** `bg-paper text-ink border-line2 hover:bg-[#FAFAF8]`
- **ghost:** `bg-transparent text-ink2 border-transparent hover:bg-[#F4F4F2]`

**Card:** `rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(11,11,11,.03)]` (conteúdo `p-5`).

**Pill / badge:** `inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold` + tom (`neutral bg-[#F4F4F2] text-ink2`, `brand bg-brand-50 text-brand-600`, `green bg-green-50 text-green-700`, `amber bg-amber-50 text-amber-700`, `red bg-red-50 text-red-600`, `blue bg-blue-50 text-blue-600`).

**Input:** `rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted` + **foco canônico (laranja):** `focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100`. (Base global já é laranja em `globals.css`.) → um único acento de foco; nada de indigo/purple/amber.

**Toggle:** trilho `relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-400` + `checked ? "bg-brand-500" : "bg-line2"`; botão `absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-paper shadow` + `translate-x-3`/`translate-x-0`.

**Modal (canônico = ConfirmDialog):** overlay `fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm`; painel `w-full max-w-sm rounded-2xl border border-line bg-paper p-5 shadow-2xl`. → **um único** overlay/z‑index (`bg-ink/45`, `z-50`), não `bg-black/40|50|60` soltos.

**Chip/tab selecionado:** `border-brand-500 bg-brand-500 text-white`; sublinhado de aba ativa `h-0.5 rounded-full bg-brand-600`.

---

## 5. Layout

- **Painel:** shell `flex h-screen overflow-hidden bg-canvas`; `Sidebar` `w-60 border-r border-line bg-paper` (item ativo `bg-brand-50 text-brand-600`); `<main class="flex-1 overflow-y-auto">`. Header opcional via `TopBar` (`h-14 border-b border-line2 bg-paper`). → **padronize a largura de conteúdo** (hoje `max-w-7xl…2xl` variam; ver drift). Sugestão: `max-w-6xl` como default de página densa.
- **Loja:** frame `fixed inset-0 flex flex-col lg:flex-row` com as vars de marca; conteúdo `sm:max-w-md sm:rounded-2xl sm:shadow-2xl`; bottom‑sheets e bolhas de chat (`rounded-2xl rounded-bl-sm`).

---

## 6. Bibliotecas & utilitários
- Sem lib de UI/ícones. `cn/clsx/tailwind-merge` **não** instalados — há um helper local `cx(...parts)` em `components/ui/index.tsx`. Use‑o (ou template‑literal) — não adicione lib nova sem motivo.
- Presentes: `@dnd-kit/*` (drag‑and‑drop do menu), `qrcode`, `zod`, `sharp`, `date-fns`.

---

## 7. ✅ Checklist para toda tela nova
1. É **painel** (laranja+tokens) ou **loja** (white‑label var)? Use a paleta certa.
2. Ação primária = **`brand-500`/`brand-600`**. **Zero indigo/purple.**
3. Texto/borda = tokens **ink/ink2/muted/line/line2** (não `gray-*`, não hex literal).
4. Foco = **brand** (`ring-brand-100 border-brand-400`), um só acento.
5. Raio: card `rounded-2xl`, botão/input `rounded-xl`.
6. Peso de fonte: **400 / 600** (reais).
7. Reaproveite **`@/components/ui`** antes de escrever primitivo inline.
8. Modal = padrão do `ConfirmDialog` (`bg-ink/45`, `z-50`, `rounded-2xl`).

---

## 8. Inconsistências conhecidas (drift a corrigir — não ampliar)

1. ~~**Cor de ação fragmentada em ≥4 tons:** brand‑laranja vs **indigo** (`bg-indigo-600` em Integrações/CRM/pagamento) vs amber vs green/blue.~~ ✅ **resolvido** — indigo/roxo/violeta → `brand` (commit ebf8789).
2. ~~**Anel de foco em 5 acentos** (orange/indigo/brand/purple/amber).~~ ✅ **resolvido** — todo `focus:`/`focus-visible:` (amber/blue/orange) convergido pra **brand** no painel.
3. **Mesmo botão, raios diferentes** (`rounded` / `-lg` / `-xl` / `-2xl`). → botão = `rounded-xl`. *(pendente — precisa distinguir botão de outros elementos arredondados; fazer por tela.)*
4. **Token vs hex literal** pro mesmo valor. → usar token. ✅ **parcial** — `border-[#E5E5E5]` → `border-line2` feito; falta `bg-white`→`bg-paper` e os neutros soltos `#F4F4F2`/`#FAFAF8` (sem token equivalente hoje — precisa criar token antes).
5. **Duas escalas neutras** (`ink/ink2/muted` vs `gray-*` cru no `TopBar` e nos preços da loja). → tokens. *(pendente — `gray-*` é semântico em muitos lugares; requer revisão caso a caso, não sweep cego.)*
6. **Overlay/z‑índice de modal sem padrão** (`bg-ink/45` vs `black/30|40|50|60`; `z-50` vs `z-[100]` vs `z-40/60`). → padrão `ConfirmDialog`. *(pendente — mexer em z‑índice afeta empilhamento; fazer por componente.)*
7. ~~**Dois tons de "aviso"** no mesmo conjunto de badge (`amber` vs `yellow`).~~ ✅ **resolvido** — família de aviso (`yellow-50/100/200/600/700/800`) → `amber`; estrelas/pins (`yellow-400/500`) permanecem amarelo (semântica diferente).
8. **Kit de UI subadotado** — `components/ui` importado por só 4 arquivos; telas grandes reimplementam tudo inline (raiz de 1–6). → migrar telas pro kit aos poucos.
9. **Pesos de fonte não embarcados** — `font-medium/bold/extrabold` (~1.660 usos) viram faux‑bold; só 400/600 existem. → carregar +pesos ou padronizar 400/600.
10. **Largura de conteúdo do painel não padronizada** (`max-w-7xl…2xl`). → definir default.
</content>
