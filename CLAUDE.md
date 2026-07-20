# CLAUDE.md — Foocci

Instruções para o Claude Code neste repositório.
Stack: **Next.js 14 (App Router) + Tailwind CSS 3.4 + Prisma/Postgres**.

## Interface / Design — regra obrigatória

**Todo trabalho de interface (UI) DEVE seguir o [`DESIGN.md`](./DESIGN.md) na raiz.**

Antes de criar ou alterar qualquer tela, componente ou estilo, **leia o `DESIGN.md`** —
é o design system oficial (cores, tipografia, componentes, layout, padrões) e cobre as
**duas superfícies**: o **painel** (Foocci, laranja + tokens neutros) e a **loja do
cliente** (white‑label, cor por restaurante via `--brand-primary`/`--brand-secondary`).

Ao trabalhar em UI:
- Use os **tokens** (`ink / ink2 / muted / paper / canvas / line / line2` e a escala
  `brand-*`). **Nunca** `gray-*` cru, `indigo/purple` como cor de ação, nem hex literal
  quando já existe token.
- Ação primária do painel = **`brand-500`/`brand-600`** (laranja). Foco = **brand**.
- Raio: card `rounded-2xl`, botão/input `rounded-xl`. Peso de fonte: **400 / 600** (os
  únicos embarcados).
- Reaproveite o kit **`@/components/ui`** antes de reescrever primitivos inline.
- Ao tocar numa tela, **corrija** o drift listado no fim do `DESIGN.md` — nunca amplie.
</content>
