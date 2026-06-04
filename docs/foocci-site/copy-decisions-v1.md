# Foocci — Copy Decisions V1

> Decisões de linguagem aprovadas para o site público.
> Versão 1 · 2026-06-04. Esta é a fonte de verdade de copy para `/site` e páginas futuras.

---

## Posicionamento principal aprovado

> **“O sistema inteligente que ajuda restaurantes a vender mais e fazer clientes voltarem.”**

Usado como **H1** da home (`/site`).

## Definição de produto aprovada

> **“Foocci é um sistema inteligente de vendas, relacionamento e fidelização para restaurantes.”**

Usada no rodapé, no `<meta>` e sempre que o produto precisa ser definido em uma frase.

## Essência emocional

> **“Transformando pedidos em experiências que fazem clientes voltarem.”**

## CTAs aprovados

| Tipo | Texto | Comportamento atual |
|---|---|---|
| **Primário** | **“Quero ver a Foocci funcionando”** | Rola até a seção de demonstração (`#demonstracao`). |
| **Secundário** | **“Falar no WhatsApp”** | Abre o WhatsApp quando houver número configurado; enquanto não houver, rola até `#demonstracao`. |
| Apoio (planos) | “Ver melhor plano para meu restaurante” | Rola até `#demonstracao`. |

> Centralizados em `src/components/marketing/config.ts`. Trocar/ativar em um só lugar.

---

## Palavras a USAR

- vender mais
- clientes voltando
- relacionamento
- fidelização
- recorrência
- pedido direto
- WhatsApp
- CRM para restaurantes
- atendimento inteligente
- cardápio inteligente
- recuperação de clientes
- operação comercial
- hospitalidade digital inteligente

## Palavras a EVITAR

| Evitar | Por quê |
|---|---|
| “chatbot” como posicionamento principal | Reduz a Foocci a “responder mensagem”. |
| omnichannel | Jargão corporativo frio. |
| agentic | Jargão técnico de IA. |
| LLM | Jargão técnico. |
| stack | Jargão de dev. |
| pipeline | Jargão de dev. |
| automação cognitiva | Jargão; soa robótico. |
| “sistema operacional de vendas” como headline | Frio e abstrato para o dono. |
| “máquina de vendas” como promessa exagerada | Superpromessa. |
| “substitui seu atendente” | Falso e ameaçador; a Foocci **apoia** a equipe. |

---

## Tom de voz

- **Humano e comercial**, não técnico. Fala com o **dono do restaurante**, não com um CTO.
- **Simples e direto**: frases curtas, benefício claro, zero jargão de IA.
- **Premium e acolhedor**: hospitalidade moderna; a Foocci é a camada inteligente
  **por trás** do restaurante — nunca rouba o protagonismo dele.
- **Confiante, sem arrogância**: promete o que entrega.

### Exemplos aprovados (no site)

- “A Foocci ajuda a organizar conversas e direcionar clientes.”
- “Conduz o cliente até o pedido.”
- “Seus clientes não deveriam desaparecer depois do pedido.”
- “Chatbot responde. Foocci vende, relaciona e ajuda o cliente a voltar.”

### Anti-exemplos (não usar)

- “Nossa stack agentic de LLMs automatiza seu funil.” ❌
- “Substitua seu atendimento por um chatbot 24/7.” ❌
- “Aumente suas vendas em 30% garantido.” ❌

---

## Claims que exigem CAUTELA

O site **não pode superprometer**. Evitar afirmar como garantido/automático tudo
que não está validado no código:

| Claim | Tratamento correto |
|---|---|
| Automação 24/7 | Não afirmar operação autônoma garantida. Falar em “ajuda a”, “direciona”, “mantém contexto”. |
| Substituição de marketplace | Posicionar como **fortalecimento dos canais diretos**, sem atacar marketplaces. |
| Aumento de receita garantido | Proibido prometer número/percentual de aumento. |
| Integrações não validadas no código | Usar “pode integrar”; não listar integração que não existe. |
| Resultados de clientes | Apenas casos **reais e autorizados**. Nada fictício. |
| Depoimentos | Apenas reais. Nenhum depoimento inventado. |
| Métricas | Nenhuma métrica/estatística inventada (ex.: “+X% de ticket”). |

### Verbos de segurança (quando há incerteza de capacidade)

Preferir: **“ajuda a”**, **“permite”**, **“organiza”**, **“direciona”**,
**“mantém contexto”**, **“pode integrar”** — em vez de afirmações absolutas.
