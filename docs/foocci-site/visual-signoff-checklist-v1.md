# Foocci — Visual Sign-off Checklist (Site Público)

> Versão 1 · 2026-06-05 · Aplica-se a `/site` e `/site/*` (pré-lançamento).
> Objetivo: checklist de QA visual a ser aprovado **antes de mover `/site` → `/`** no lançamento.

---

## 0. Por que esta é uma checklist manual (e não screenshots)

As capturas automáticas (390/768/1440) **não puderam ser geradas neste ambiente**:
o pacote Playwright está instalado, mas **nenhum binário de browser** está presente e
o **download é bloqueado pela política de rede** do container de execução remota.

**Como gerar as evidências depois**, em um ambiente com browser (local/CI):

```bash
# 1) instalar o browser uma vez
npx playwright install chromium

# 2) servir o build de produção
npm run build && npx next start -p 3100

# 3) capturar (exemplo) — rodar para cada viewport/rota
npx playwright screenshot --viewport-size=390,844  http://localhost:3100/site            site-390.png
npx playwright screenshot --viewport-size=768,1024 http://localhost:3100/site            site-768.png
npx playwright screenshot --viewport-size=1440,900 http://localhost:3100/site            site-1440.png
# repetir para /site/como-funciona, /site/demonstracao, /site/precos
```

Anexar as imagens a esta pasta ou ao PR de lançamento.

---

## 1. Rotas a inspecionar

- [ ] `/site`
- [ ] `/site/como-funciona`
- [ ] `/site/demonstracao`
- [ ] `/site/precos`
- [ ] `/site/sobre`
- [ ] `/site/politica-de-privacidade`
- [ ] `/site/termos-de-uso`

## 2. Viewports a inspecionar

- [ ] **390px** (mobile — iPhone base)
- [ ] **768px** (tablet)
- [ ] **1440px** (desktop)
- [ ] (bônus) 320px e 1280px

---

## 3. Hero (home + PageHero internos)

- [ ] H1 legível e sem quebra estranha em 390px.
- [ ] Badge "Em breve para restaurantes selecionados" visível, com o ponto pulsante.
- [ ] Subheadline curta e legível.
- [ ] CTAs visíveis acima da dobra no mobile (sem precisar rolar muito).
- [ ] Mockup focal **não domina** a primeira tela no 390px (cap `max-w-xs`).
- [ ] Glow quente sutil, sem "blob"; sem overflow horizontal.
- [ ] Faixa de capacidades ("Em um só sistema: Cardápio · WhatsApp · IA · CRM") quebra bem.

## 4. CTAs

- [ ] Primário (laranja) com contraste forte; secundário (outline) legível.
- [ ] Apenas CTAs aprovados: "Ver como a Foocci funciona" / "Conhecer a proposta" /
      "Conhecer como a Foocci funciona". **Nenhum** "Falar no WhatsApp", "Agendar",
      "Solicitar", "Contratar", "Comprar".
- [ ] `focus-visible` (anel) aparece ao navegar por teclado (Tab).
- [ ] Sticky CTA mobile aparece após o hero e **não** cobre o rodapé.
- [ ] Hover states suaves; nada pisca/treme.

## 5. Mobile (390px)

- [ ] **Sem overflow horizontal** em nenhuma rota (testar arrastar lateralmente).
- [ ] Cards empilham limpos; sem cards espremidos.
- [ ] Comparação (Chatbot × Foocci) empilha e fica legível.
- [ ] Fluxos (Recuperação, Como funciona) empilham com setas corretas.
- [ ] FAQ: alvos de toque confortáveis (≥44px); abrir/fechar suave.
- [ ] Mockups (pedido/CRM/dados) cabem na largura, sem vazar.
- [ ] Sem "buracos" verticais estranhos entre seções.

## 6. Footer

- [ ] 4 colunas no desktop; empilha no mobile sem quebrar.
- [ ] Links válidos (sem `#` morto); todos levam a rotas reais.
- [ ] Linha de posicionamento + "Em fase piloto · Lançamento comercial em breve." presente.
- [ ] Pílula "em breve" ao lado do wordmark.
- [ ] Espaçador impede o sticky CTA de cobrir o conteúdo final.

## 7. Mensagens de pré-lançamento

- [ ] Badge/pílula "em breve" no header e hero.
- [ ] Microcopy "Produto em fase piloto. Lançamento comercial em breve." no hero.
- [ ] Preços: "Em definição para o lançamento" — **sem valores**.
- [ ] Demonstração: painel "em breve", **sem formulário ativo**; prévia rotulada
      "Telas ilustrativas do produto em fase piloto".
- [ ] Legais (privacidade/termos): bloco "Status de pré-lançamento" presente; **sem**
      implicar forms/WhatsApp/venda ativos.
- [ ] **Nenhum** `wa.me`, preço `R$`, métrica `+N%` ou depoimento.
- [ ] `<meta name="robots" content="noindex, follow">` em **todas** as 7 rotas.

## 8. Antes de mover `/site` → `/` (gate de lançamento)

- [ ] QA visual desta checklist aprovado em 390/768/1440 (com screenshots anexados).
- [ ] Logo/favicon/marca reais aplicados (hoje wordmark em texto).
- [ ] Screenshots reais do produto (substituir mockups CSS, se desejado).
- [ ] Revisão jurídica das páginas legais concluída (LGPD/Termos).
- [ ] Metadata de lançamento: `robots` → `index, follow` (1 linha em `site/layout.tsx`).
- [ ] CTAs comerciais ativados (WhatsApp/lead/demo) de forma intencional.
- [ ] Captação de leads ligada a backend real (`DemoForm`).
- [ ] WhatsApp de vendas configurado (`WHATSAPP_SALES_NUMBER`) e testado.
- [ ] Analytics/tracking de conversão configurado.
- [ ] Matriz de rotas validada para a troca `/site` → `/` (sem afetar produto).
- [ ] `tsc` / `lint` / `build` limpos + smoke test das 7 rotas.
