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
- ✅ **Shell** — logomarca grande (anagrama + wordmark) na sidebar/topo; card do dono
  subiu pro topo, exposto; nav retokenizada.
- ✅ **Central de Conversas** — paleta da marca + inputs premium (bolhas, lista, busca, composer).

## A fazer (telas grandes, uma por passo)
- ⬜ **CRM / Clientes** (`crm/CRMClient.tsx` ~5978 linhas + abas + perfil do cliente)
- ⬜ **Cardápio** (`menu`)
- ⬜ **Analytics** OU **Integrações** (a definir com o Diego)
- ⬜ Polimento: 3 mini-diálogos de Pedidos (cancelar/apagar/confirmar pagamento manual)

## Backlog (deixar pro FINAL)
- ⬜ **Logo do restaurante na sidebar**, logo **abaixo da logo Foocci** (perto do card do dono),
  exposta — dá a cara de **parceria** (Foocci + restaurante). Fonte do logo:
  `restaurant.logoUrl` (já existe no schema). Pedido do Diego — fazer por último.
