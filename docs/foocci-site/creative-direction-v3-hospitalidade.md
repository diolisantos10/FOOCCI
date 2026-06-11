# Foocci — Direção Criativa V3 · "Hospitalidade Digital Inteligente"

> Versão 3 · 2026-06-10 · Aplica-se a `/site`, `/site/*` e à prévia `/preview`.
> Status: **pré-lançamento (piloto).** Direção aprovada pelo Diego (referência visual 2).

## 1. Por que a V3 foi escolhida

Feedback humano do Diego sobre a V2: o site ficou correto, mas ainda frio/racional.
A referência 2 foi aprovada por trazer **mais emoção, hospitalidade, restaurante,
sentimento, presença do mascote e a percepção de que faturamento vem de relacionamento**.

> "Tem que pegar o cliente pela emoção… o número tem que vir explícito também, mas tem
> que trazer a sensação de que esse faturamento vem do relacionamento."

Sensação-alvo no dono de restaurante: **"Eu posso vender mais porque vou me relacionar
melhor com meus clientes."**

## 2. Tese central

**relacionamento → recorrência → faturamento**

Linguagem emocional: *"Transformando pedidos em experiências que fazem clientes voltarem."*
A Foocci não é ferramenta fria de IA/chatbot/dashboard — é uma **camada inteligente de
hospitalidade, vendas e relacionamento**.

## 3. Diferença V2 → V3

| Aspecto | V2 | V3 |
|---|---|---|
| H1 | argumento racional ("o sistema inteligente que ajuda…") | **a essência emocional** ("Transformando pedidos em experiências…") |
| Mascote | decoração (avatar pequeno) | **anfitrião** — recebe o visitante com balão de fala no hero |
| Atmosfera | neutra/SaaS | **restaurante premium** (painel quente CSS, palco, balcão) |
| Tese comercial | implícita | **explícita** — seção escura "Relacionamento que vira recorrência. Recorrência que vira faturamento." |
| Jornada | timeline em página interna | **seção própria logo abaixo do hero** (obrigatória) |
| Home | 16 seções, muitas grids parecidas | **11 seções editoriais** |

## 4. Nova estrutura da home (11 seções)

1. **Hero emocional premium** (anfitrião)
2. **Jornada visual** (`JourneySection`) — Cliente chega → Pedido guiado → CRM ativo → Campanha → Cliente volta
3. **Mais que tecnologia, hospitalidade** (`HospitalitySection`, mascote em painel)
4. **Problema** — "restaurantes perdem clientes que poderiam voltar"
5. **Foocci como sistema inteligente** (`DemoSection`, preview com abas)
6. **Relacionamento que vira faturamento** (`RevenueRelationshipSection`, âncora escura, carrega `#crm`)
7. **Módulos** (`#solucoes`)
8. **Comparativo** Foocci × chatbot comum
9. **Pré-lançamento / planos** (sem preços)
10. **FAQ**
11. **CTA final com mascote**

Desligadas da home (componentes preservados no repo p/ reuso): StrategicShift, Pillars,
HowItWorks (substituída pela Jornada), CRMSection, WhatsAppSection, RecoverySection e
EssenceBand (a frase-essência virou o **H1**; a âncora escura agora é a seção comercial).
Frase forte preservada: a citação "Marketplace entrega pedido. Relacionamento constrói
cliente." migrou para a seção comercial.

## 5. Hero V3

- **Eyebrow:** "Hospitalidade digital inteligente"
- **H1:** "Transformando pedidos em experiências que fazem clientes voltarem."
- **Sub:** definição oficial (vendas, relacionamento e fidelização… conexões… recorrência)
- **CTAs:** "Ver como a Foocci funciona" (primário) · "Acompanhar lançamento" (secundário → `/site/demonstracao`)
- **Microcopy:** "Produto em fase piloto. Lançamento comercial em breve."
- **Direita — cena do anfitrião:** painel quente inspirado em restaurante (gradiente
  brand-50→branco, luz âmbar, dot-grid), **palco neutro** onde o mascote fica (a placa
  clara do PNG funde sem emenda), **balão de fala** ("Olá! Sou a Foocci." / "Estou aqui
  para ajudar seu restaurante a criar conexões que geram resultados."), **anagrama F**
  como objeto de marca, chip "Cliente recorrente" e badge "Em breve para restaurantes
  selecionados". Sem foto pesada — atmosfera 100% CSS + assets oficiais.

## 6. Jornada visual

5 cards premium com copy aprovada, números editoriais, ícones lineares e **conectores
laranja discretos** no desktop; empilhados no mobile. Headline da seção:
"Relacionamento vira recorrência. Em cada etapa."

## 7. Uso do mascote (anfitrião, com moderação)

| Local | Papel |
|---|---|
| **Hero** | anfitrião com balão de fala (novo papel central) |
| Hospitalidade | presença institucional (painel) |
| CTA final | despedida calorosa |
| Como funciona · bastidor | apoio visual pequeno |
| `/sobre` | bloco institucional |
| Gate `/site/entrar` | recepção da prévia |

Nunca em fundo escuro (sem variação dark), nunca esticado, nunca infantil.

## 8. Como mantém o pré-lançamento

Gate por senha (`MARKETING_PREVIEW_PASSWORD`) + `noindex` intactos; `/preview` → `/site`;
CTAs apenas educacionais ("Ver como a Foocci funciona", "Acompanhar lançamento",
"Conhecer a proposta"); **sem** WhatsApp, lead, preço, métrica ou depoimento; `/site`
não movido para `/`. A seção comercial fala de faturamento **sem números** — apenas
consequência de relacionamento + labels aprovados ("Cliente recorrente", "Cliente em
risco", "Campanha enviada", "Pedido recuperado", "Histórico salvo").

## 9. O que ainda precisa de revisão humana

- **Sign-off visual ao vivo** no `/preview` (este ambiente não tem browser p/ screenshot).
- Densidade da cena do anfitrião no desktop real (balão/chip/anagrama) — ajustar se pedir.
- Tom do painel quente (brand-50/80) — pode subir/descer 1 nível conforme gosto.

## 10. O que fica para o lançamento oficial

Ativação de vendas (WhatsApp/lead/demo), preços reais, troca `noindex`→`index`,
`/site` → `/`, assets vetoriais (SVG) e variação escura do mascote, revisão jurídica
final e analytics — ver `pre-launch-mode-v1.md` e `visual-signoff-checklist-v1.md`.

---

## 11. Mockup oficial + contrato de assets (atualização)

O **print aprovado** (header com "Entrar" + "Acompanhar lançamento", hero com mascote
anfitrião GRANDE atrás do balcão em restaurante real, jornada com medalhões
fotográficos, faixa "Mais que tecnologia, hospitalidade" e trust strip) é a
**referência principal de layout/composição/atmosfera**. A implementação segue o
print sem reinterpretar.

As **fotografias oficiais** entram por *asset slots* (`siteAssets.ts`), em
`public/brand/foocci/site/`. **V4 (entregue e ativo):**

| Arquivo | Conteúdo | Uso |
|---|---|---|
| `hero-restaurant-with-mascot.png` | cena completa: restaurante + mascote anfitrião + balão "Olá! Sou a Foocci" + anagrama F | **hero da home** (render flat — composição oficial, sem reinterpretar em CSS) |
| `hero-restaurant-background.png` | restaurante vazio c/ balcão curvo (sem mascote/texto) | ambiência quente atrás do hero das **páginas internas** (`PageHero`, veladas em branco) |
| `journey-1-cliente.jpg` | mulher sorrindo (Cliente chega) | medalhão da jornada |
| `journey-2-pedido.jpg` | app/pedido (Pedido guiado) | medalhão da jornada |
| `journey-3-crm.jpg` | CRM ativo | medalhão da jornada |
| `journey-4-campanha.jpg` | prato premium (Campanha) | medalhão da jornada |
| `journey-5-volta.jpg` | casal jantando (Cliente volta) | medalhão da jornada |
| `owner-tablet.jpg` / `app-phone.jpg` | dono c/ tablet · app no celular | slots reservados (institucional) |

O hero deixou de compor mascote/balão/anagrama em CSS: agora renderiza a
**fotografia composta oficial** (`hero-restaurant-with-mascot.png`), eliminando os
defeitos de composição apontados (balão sobre o rosto, sombra "caixa", chips
cruzando o corpo). Slots ainda ausentes caem em *fallback fiel* (tom quente, mesma
composição) — nada quebra, nada genérico.

Desvios conscientes do print (regras de negócio do pré-lançamento):
- **Nav** mantém as rotas reais (`Como funciona / Soluções / CRM / Preços / Demonstração`);
  os rótulos do print ("Recursos", "Conteúdo", "Empresa") apontariam para páginas que
  não existem ainda.
- Pílula **EM BREVE** no header e microcopy de piloto permanecem (obrigatórios no
  pré-lançamento), mesmo não aparecendo no print.
