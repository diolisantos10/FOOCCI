# Foocci — Implementação de Marca no Site (Brand Implementation)

> Versão 1 · 2026-06-05 · Aplica-se a `/site`, `/site/*` e à prévia em `/preview`.
> Status: **pré-lançamento (piloto).** Aplicação do branding oficial no site privado.

## 1. Brand Book usado como fonte

Fonte de verdade: **Foocci Master Brand Book v1.0** (`Foocci_Master_Brand_Book_v1_FINAL.pptx`).
Arquivado, otimizado, em **`docs/foocci-site/brand/brandbook/slide-01..11.webp`** (referência interna).

Absorvido:
- **Definição:** "Foocci é um sistema inteligente de vendas, relacionamento e fidelização para restaurantes."
- **Essência:** "Transformando pedidos em experiências que fazem clientes voltarem."
- **Categoria:** "hospitalidade digital inteligente."
- **Filosofia visual:** "Minimalismo premium com hospitalidade moderna."
- **Tom de voz:** simples, direto, acolhedor, comercial, confiável, inteligente.
- **Backstage vs frontstage:** Foocci forte no bastidor, invisível no palco; **restaurante protagoniza**.
- **NÃO é:** chatbot genérico, software frio, ERP, dashboard enterprise, marketplace, cyberpunk, infantil.

## 2. Assets encontrados e extraídos (do Brand Book)

| Asset | Origem (slide) | Arquivo no repo |
|---|---|---|
| Wordmark "Foocci" preto (institucional) | slide 9 | `public/brand/foocci/foocci-wordmark.png` (200×50, transparente) |
| Wordmark "Foocci" laranja (comercial) | slide 9 | `public/brand/foocci/foocci-wordmark-orange.png` (reservado p/ fundos escuros) |
| Anagrama **F** (app icon preto arredondado) | slide 9 | `public/brand/foocci/foocci-anagram.png` (256×256) → favicons |
| Mascote (robô de chapéu de chef, F laranja) | slide 1 | `public/brand/foocci/foocci-mascot.png` (196×321) |

> O Brand Book traz os ativos **apenas como slides renderizados** (sem SVG/PNG isolado). Os assets
> acima foram **extraídos dos slides oficiais** (recorte + remoção de fundo via `sharp`/canvas),
> **não inventados nem redesenhados**. São raster de boa qualidade para tamanhos pequenos/médios.

## 3. Assets faltantes (precisam de export do designer)

- **Vetor (SVG)** do wordmark (preto/laranja) e do anagrama; favicon `.ico` multi-resolução oficial.
- **Mascote transparente** + **variação escura** (para fundos `#0B0B0B`, ex.: faixa "A essência").
- **Open Graph / social image** oficial.

## 4. Cores aplicadas (paleta oficial — já correspondia; confirmada)

Regra **90% neutro + 10% laranja**. Preto `#0B0B0B` · Branco `#FFFFFF` · Cinza claro `#E5E5E5`
(via `gray-200`) · Laranja `#F97316` (via `brand-500`, **só** CTA/estados/destaques).
`tailwind.config` já define `brand` = `#F97316`. **Design system do produto não alterado.**

## 5. Tipografia aplicada

**Inter** (oficial p/ digital) — já carregada (400/600), pesos reais, **sem bold sintético**
(`font-semibold`). **Satoshi**/**SF Pro** não adicionadas (evitar dependência insegura); Inter
premium é aceitável pelo Brand Book. Satoshi fica como melhoria opcional futura.

## 6. Logo aplicado onde

- **Header** (`MarketingHeader`): wordmark oficial + pílula "em breve".
- **Footer** (`MarketingFooter`): wordmark oficial + pílula "em breve".
- **Tela de senha** (`PreviewGate`): wordmark oficial + pílula "em breve".
- **Favicon / app icon** (anagrama F): `src/app/site/icon.png` (64×64) + `apple-icon.png` (180×180),
  **escopados a `/site`** (produto não recebe favicon novo).

## 7. Mascote aplicado onde (com moderação)

- **Tela de senha**: mascote pequeno em card claro.
- **`/site/sobre`**: mascote ao lado da crença da marca (seção `gray-50`).
- **CTA final da home**: mascote pequeno acima do fechamento.
- **NÃO** no hero (não competir com o mockup do produto), **nem** repetido em excesso.

## 8. Restrições respeitadas

- Logo: **sem** deformar, rotacionar, gradiente, sombra ou proporção alterada.
- **Não** inventei/redesenhei logo ou mascote (extração do oficial).
- Sem logo + anagrama + mascote juntos poluindo (wordmark no header; anagrama só no favicon;
  mascote pontual).
- Mascote sempre sobre fundo claro compatível (silhueta branca preservada); sem fones/cyberpunk/
  holograma/estética infantil. Laranja como destaque, não base; sem dark mode dominante.

## 9. Mudanças de copy

Copy já alinhada à identidade verbal (vinha de `copy-decisions-v1.md`). Ajuste pontual em
`/site/sobre`: reforço **"A tecnologia trabalha no bastidor. Quem aparece para o cliente é o seu
restaurante."** (backstage vs frontstage). Nenhuma palavra proibida introduzida.

## 10. Mudanças visuais

- Wordmark oficial no header/footer/gate (substitui o texto).
- Favicon/app-icon oficiais (anagrama F) no `/site`.
- Mascote oficial com moderação (gate, sobre, CTA final).
- Assets via `next/image` (passam pelo gate por `/_next/`).

## 11. O que ainda precisa de revisão humana

- Aprovar a qualidade dos assets extraídos (raster) ou substituir por **exports vetoriais**.
- Mascote em fundo escuro (variação para a faixa `#0B0B0B`).
- Decisão sobre **Satoshi** nas headlines.
- Favicon global do produto (hoje só `/site`).
- **Sign-off visual** 390/768/1440 em browser (`visual-signoff-checklist-v1.md`).
