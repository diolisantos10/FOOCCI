# Redesign do painel — cronograma (Brand Book v1)

Linguagem: **"minimalismo premium com hospitalidade moderna"**, 90% neutro + 10% laranja.
Tokens (tailwind): `ink #0B0B0B` · `paper #FFF` · `canvas #F6F6F4` · `line #E9E9E6` ·
`line2 #E5E5E5` · `muted #8A8A86` · `ink2 #5C5C58` · `brand #F97316`. Fonte: **Inter**.
Kit reutilizável: `src/components/ui` (Card, Stat, SectionTitle, Pill, Button, Delta, EmptyState).

Régua por tela (sempre):
1. **O que NÃO pode faltar** nesta tela? (garante o essencial)
2. **Por que isso está aqui? Pra que serve?** (corta o ruído / "poluído")

## Feito (no ar)
- ✅ **Dashboard** — kit, declutter (6→4 KPIs, ruído de config num link), gráfico com
  R$ nas barras, comparação **dia-da-semana** (hoje vs. mesma quinta passada),
  Mais vendidos = **top 10 com foto**.
- ✅ **Pedidos** — lista (cards, filtros, performance) + painel de detalhe + modal "Novo pedido".
- ✅ **Shell** — logomarca grande na sidebar/topo; card do dono exposto no topo; nav
  retokenizada; fundo global do painel → canvas.
- ✅ **Central de Conversas** — paleta da marca + inputs premium.
- ✅ **CRM** — todas as abas (Visão geral, Campanhas, Automações, Clientes, Avaliações,
  Configurações) + Programa, retokenizadas. Cores de segmento preservadas.
- ✅ **Cardápio** (MenuManager + QRCard + upload) — retokenizado.
- ✅ **Analytics** — retokenizado.

## A fazer
- ⬜ **Integrações** (`integracoes`) — última tela de conteúdo grande
- ⬜ Polimento: 3 mini-diálogos de Pedidos (cancelar/apagar/confirmar pagamento manual);
  perfil do cliente (`customers/[id]`); revisar visualmente CRM/Cardápio/Analytics no ar.

## Backlog (deixar pro FINAL)
- ⬜ **Logo do restaurante na sidebar**, logo **abaixo da logo Foocci** (perto do card do dono),
  exposta — dá a cara de **parceria** (Foocci + restaurante). Fonte do logo:
  `restaurant.logoUrl` (já existe no schema). Pedido do Diego — fazer por último.
