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

### Regras permanentes de UI (não pular)

1. **Seguir o `DESIGN.md`** em toda tela, componente ou estilo (detalhado acima). O `DESIGN.md` inclui as **Referências** (norte estético: Linear/Stripe/Vercel no painel, iFood/Rappi na loja) e os **Estados obrigatórios** (§6.1).

2. **Responsivo obrigatório.** Toda tela criada ou alterada é conferida em **3 tamanhos** — **celular (375px)**, **tablet (~768px)** e **desktop (~1280px)** — tirando um **screenshot de cada** com o Playwright. A maioria acessa pelo **celular**, então ele é prioridade; nada de layout que só funciona no monitor.
   > Nesta execução (web), o Playwright já vem **pré-instalado** (mesmo motor do Playwright MCP): renderizo a página nos 3 tamanhos e comparo. No Claude Code de desktop, usar o Playwright MCP (`"usa o playwright mcp"`).

3. **Auto-revisão obrigatória.** Após qualquer mudança visual: tirar screenshot e **se autoavaliar de 0 a 10** em **hierarquia, tipografia, espaçamento e consistência**. Só apresentar ao dono quando estiver **8+ em todos os quatro** — se algo ficar abaixo, **iterar sozinho** antes de mostrar. Tratar sempre os 3 **Estados obrigatórios** (loading / vazio / erro) antes de considerar a tela pronta.
</content>
