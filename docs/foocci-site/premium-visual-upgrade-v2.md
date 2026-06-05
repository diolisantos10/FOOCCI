# Foocci — Upgrade Visual Premium (V2)

> Versão 2 · 2026-06-05 · Aplica-se a `/site`, `/site/*` e à prévia `/preview`.
> Status: **pré-lançamento (piloto).** Correção de direção de arte (percepção de valor).

## 1. Diagnóstico do problema visual anterior

Feedback do Diego: *"O site ficou super simplista. Em nenhuma página vi o mascote.
Minimalista demais, abaixo do produto. Falta um toque de design sofisticado, sem poluir."*

Diagnóstico:
- Hero com 1 mockup pequeno e fundo quase liso — **sem mascote**, sem camadas/profundidade.
- **Mascote quase invisível** (só gate/sobre/CTA final, discreto) — ausente acima da dobra.
- **Sem seção proprietária** ("hospitalidade digital") → site parecia SaaS genérico.
- Fundos branco/cinza chapados; cards planos; ritmo monótono.

> "Minimalismo premium" ≠ vazio. = poucos elementos **muito bem compostos**, com profundidade
> sutil, hierarquia forte, identidade proprietária e ritmo editorial.

## 2. O que foi melhorado

**Novo design system de marketing — `premium.tsx`** (primitivos reutilizáveis, sem overengineer):
`DotGrid` (grid de pontos sutil, com máscara) · `Halo` (brilho laranja controlado ≤14%) ·
`TopWash` · `GradientRule` · `PremiumCard` (sombra em camadas + ring) · `Eyebrow` ·
`BrandBadge` (com dot "ao vivo") · `MascotPanel` · `MascotAvatar`.

**Home:**
- **Hero refeito**: composição em **camadas** (tela de pedido focal + 2ª tela "espiando" atrás),
  **3 chips flutuantes** (Pedido guiado, Cliente identificado, Oportunidade recuperada), **mascote
  institucional pequeno**, fundo com profundidade (dot-grid + halo + wash). Copy mantida.
- **Nova seção "Hospitalidade digital inteligente"** (`HospitalitySection`): mascote em painel
  premium + 4 cards de experiência (pedido simples, atendimento com contexto, relacionamento
  contínuo, cliente voltando). Diferencia de SaaS genérico.
- **Pilares** e **Soluções**: `PremiumCard` com sombra em camadas, ícones com ring, numeração
  editorial (pilares), eyebrow + subtítulo, dot-grid/halo de fundo.

**Páginas internas:**
- **`/site/como-funciona`** bem mais rica: jornada em **cards editoriais** (número + ícone),
  seção "bastidor" com **mascote** + mockup, e diagrama de fluxo premium (nós com ícone +
  conectores). Fundos com profundidade.
- **`/site/precos`**: cards com sombra premium + microbadge "Destaque" + dot-grid.
- **`/site/demonstracao`**: prévia com profundidade (dot-grid + halo).
- **`/site/sobre`**: mantém mascote no bloco institucional (de V1).

## 3. Onde o mascote foi aplicado (com moderação)

| Local | Uso |
|---|---|
| Gate `/site/entrar` | mascote em card claro (de V1) |
| **Home — Hero** | mascote pequeno institucional (novo) |
| **Home — Hospitalidade digital** | mascote em painel premium (novo) |
| Home — CTA final | mascote pequeno (de V1) |
| **Como funciona — Bastidor** | mascote pequeno na composição (novo) |
| `/site/sobre` | mascote no bloco institucional (de V1) |

Sempre sobre **fundo claro** (silhueta branca preservada), nunca esticado/cortado, nunca
infantil, nunca competindo com o mockup do produto.

## 4. Onde os mockups foram melhorados

- Hero: **camadas sobrepostas** (2 telas) + chips flutuantes + halo → aparência de produto real.
- Como funciona / demonstração: mockups com fundo de profundidade e composição.
- A linguagem de mockup (`mockups.tsx`) foi mantida (sem dados/métricas falsos; labels aprovados).

## 5. Como o site agora respeita "minimalismo premium"

- 90% neutro + 10% laranja **mantido** — laranja só em CTA/acentos/halos sutis.
- Profundidade vem de **camadas e luz** (dot-grid, halo, sombras em camadas, off-white), não de cor.
- Hierarquia forte (eyebrow → título → subtítulo), ritmo editorial (hero → problema → manifesto →
  pilares → hospitalidade → como funciona → módulos → CRM → WhatsApp → recuperação → essência →
  comparação → preview → preços → FAQ → CTA).
- Identidade proprietária (mascote + wordmark + linguagem de mockup) presente, sem poluir.

## 6. O que ainda depende de revisão humana

- **Sign-off visual** em browser (390/768/1440) — não há browser neste ambiente para screenshots.
- Validar densidade do hero (camadas + chips + mascote) no desktop real — ajustar se ficar cheio.
- Confirmar tom premium das novas seções com o Diego.

## 7. O que ainda precisa de assets melhores

- **Logo/anagrama/mascote em vetor (SVG)** e **mascote transparente + variação escura** (para
  usar na faixa escura "A essência"). Hoje raster extraído do Brand Book (bom em tamanho
  pequeno/médio). Ver `brand-implementation-v1.md`.
- Eventual fonte **Satoshi** para headlines (hoje Inter premium, pesos reais).

---

Pré-lançamento preservado: `/preview` → `/site`, gate por senha, `noindex`, sem vendas/WhatsApp/
leads/preços/métricas. Produto, domínio/DNS e middleware (fora de `/site` e `/preview`) intocados.
