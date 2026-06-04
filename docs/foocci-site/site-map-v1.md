# Foocci — Site Map V1

> Documento oficial de arquitetura do site público.
> Versão 1 · 2026-06-04 · Status: **V1 implementada e isolada em `/site`** (commit `c9ffa4a`).
> Posicionamento oficial: *“Foocci é um sistema inteligente de vendas, relacionamento e fidelização para restaurantes.”*

---

## 1. Papel estratégico do site

O site público da Foocci é uma **ferramenta comercial**, não um folheto técnico.
Ele existe para:

- **Explicar o produto com clareza** — traduzir “sistema de vendas, relacionamento
  e fidelização” em benefícios concretos para o dono de restaurante, em linguagem
  simples e humana.
- **Gerar leads qualificados de restaurantes** — capturar donos com real intenção
  (pedido de demonstração / conversa no WhatsApp), não tráfego genérico.
- **Vender a ideia de hospitalidade digital inteligente** — posicionar a Foocci
  como uma camada de inteligência *por trás* da experiência do restaurante, que
  ajuda a vender mais e a fazer o cliente voltar.
- **Diferenciar a Foocci de chatbots e SaaS genérico** — deixar explícito que ela
  conduz a venda, mantém relacionamento e age no CRM, em vez de “só responder”.
- **Direcionar para demonstração e WhatsApp** — toda a narrativa converge para os
  dois CTAs aprovados: *“Quero ver a Foocci funcionando”* e *“Falar no WhatsApp”*.

**Métrica-norte:** pedidos de demonstração qualificados por restaurante.

---

## 2. Site Map V1 — Aprovado

### Rota atual (segura)

```
/site   →  Site de marketing V1. Rota isolada, pública e indexável.
           Escolhida para validar a vitrine antes de substituir a raiz pública.
```

`/site` é a **primeira rota segura**: não interfere no redirect de produto de `/`
(que hoje leva o usuário a `/login` ou `/dashboard`) e é liberada no middleware
apenas como rota pública aditiva.

### Futura home oficial

```
/       →  Home pública definitiva. Só recebe o site de marketing na Fase 6,
           após aprovação e validação (ver implementation-roadmap-v1.md).
```

### Páginas core (V1 → V2)

Hoje todas existem como **seções âncora** dentro de `/site`. Tornam-se **páginas
dedicadas** quando o volume de conteúdo/SEO justificar.

| Rota | Papel |
|---|---|
| `/como-funciona` | Explica o fluxo “da primeira mensagem ao próximo pedido” em profundidade: WhatsApp/QR/link → pedido guiado → CRM → recorrência. Reduz dúvida e objeção. |
| `/precos` | Apresenta os planos por momento do restaurante (Essencial / Crescimento / Performance) **sem preços inventados** — “configuração sob demonstração” até existirem valores reais. |
| `/demonstracao` | Página de conversão dedicada: formulário de demonstração + WhatsApp. Destino dos CTAs primários. |
| `/sobre` | História, propósito e visão da Foocci (hospitalidade digital inteligente). Constrói confiança. |
| `/politica-de-privacidade` | Página legal (LGPD). **Ainda não existe** — hoje é link `#`. Necessária antes de captar leads de verdade. |
| `/termos-de-uso` | Página legal de termos. **Ainda não existe** — hoje é link `#`. |

> **Nota de implementação:** na V1, os links de Política/Termos no rodapé apontam
> para `#` (sem páginas falsas). Devem virar páginas reais antes de qualquer
> captura de dados pessoais em produção.

---

## 3. Site Map V2 — Soluções (futuro)

Páginas de solução, uma por capacidade comercial. Servem para aprofundar valor e
capturar busca por intenção específica.

```
/solucoes
/solucoes/cardapio-inteligente
/solucoes/whatsapp-inteligente
/solucoes/crm-para-restaurantes
/solucoes/ia-para-restaurantes
/solucoes/recuperacao-de-clientes
/solucoes/fidelizacao
```

| Rota | Foco |
|---|---|
| `/solucoes` | Hub que conecta todas as soluções e direciona para demonstração. |
| `/solucoes/cardapio-inteligente` | Cardápio digital que mostra, organiza e **conduz** a venda. |
| `/solucoes/whatsapp-inteligente` | WhatsApp como canal comercial (organizar, direcionar, manter contexto). |
| `/solucoes/crm-para-restaurantes` | CRM simples: quem comprou, voltou, sumiu, VIP. |
| `/solucoes/ia-para-restaurantes` | IA aplicada ao pedido e ao relacionamento (sem jargão). |
| `/solucoes/recuperacao-de-clientes` | Reativação de clientes sumidos e oportunidades. |
| `/solucoes/fidelizacao` | Recorrência e hábito de voltar. |

> **Regra:** **não construir** estas páginas antes do site core de conversão estar
> **validado** (Fases 1–4). Solução sem conversão validada é esforço prematuro.

---

## 4. Site Map V3 — Segmentos de restaurante (futuro)

Páginas por nicho, para **SEO** e **conversão segmentada** (a mesma proposta com a
linguagem e os exemplos de cada tipo de operação).

```
/para-restaurantes
/para-restaurantes/japones
/para-restaurantes/pizzaria
/para-restaurantes/hamburgueria
/para-restaurantes/acai
/para-restaurantes/marmitaria
/para-restaurantes/delivery
```

| Rota | Foco |
|---|---|
| `/para-restaurantes` | Hub de segmentos. |
| `/para-restaurantes/japones` | Caso de uso japonês/sushi (combos, rodízio, delivery). |
| `/para-restaurantes/pizzaria` | Pizzaria (montagem, bordas, bebidas). |
| `/para-restaurantes/hamburgueria` | Hamburgueria (combos, adicionais). |
| `/para-restaurantes/acai` | Açaí/sorveteria (complementos, recompra). |
| `/para-restaurantes/marmitaria` | Marmitaria (recorrência, fidelização). |
| `/para-restaurantes/delivery` | Operações de delivery (pedido direto vs marketplace). |

> **Regra:** criar **depois** do core, como camada de aquisição. Cada página deve
> ter conteúdo próprio e útil (nada de páginas duplicadas só trocando o nicho).

---

## 5. Site Map V4 — Conteúdo e autoridade (futuro)

Camada de **SEO, autoridade e aquisição** orgânica.

```
/blog
/blog/crm-para-restaurantes
/blog/vender-mais-pelo-whatsapp
/blog/fidelizacao-de-clientes-restaurante
/blog/cardapio-digital-inteligente
/blog/como-recuperar-clientes-de-restaurante
/casos
/guias
/comparativos
```

| Rota | Foco |
|---|---|
| `/blog` | Conteúdo educativo para donos de restaurante. |
| `/blog/*` | Artigos por dor/intenção (CRM, WhatsApp, fidelização, cardápio, recuperação). |
| `/casos` | Casos de sucesso — **apenas reais e autorizados** (nada inventado). |
| `/guias` | Guias aprofundados (lead magnets). |
| `/comparativos` | Comparações honestas (ex.: pedido direto × marketplace), sem ataque agressivo. |

> **Regra:** esta camada exige processo de conteúdo (e provavelmente um CMS). É a
> última a ser construída, sobre uma base de conversão já validada.

---

## Princípios de arquitetura

1. **Isolamento:** rotas de marketing nunca colidem com `/pedido`, `/qr`, `/admin`,
   `(dashboard)`, `/api` ou webhooks. Liberação de acesso público é sempre aditiva
   no `middleware.ts`.
2. **Progressão validada:** V1 (core) → V2 (soluções) → V3 (segmentos) → V4
   (conteúdo). Não pular etapas.
3. **Sem fakes:** preços, métricas, depoimentos, logos e integrações só entram
   quando forem reais.
4. **Troca de raiz por último:** `/site` só vira `/` na Fase 6, com aprovação.
