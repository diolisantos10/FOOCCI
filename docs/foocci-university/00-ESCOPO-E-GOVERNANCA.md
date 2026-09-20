# 00 — Escopo e governança da Foocci University

## Missão

Formar pessoas e agentes de IA capazes de vender Foocci de forma **consultiva, tecnicamente correta e comercialmente convincente** para donos e gestores de restaurantes.

Ao final, quem estiver certificado deve saber:

- o que a Foocci é e o que não é;
- para quem serve e para quem não serve;
- quais dores resolve;
- como o produto funciona de verdade;
- quais recursos estão prontos, dependem de terceiro, estão desligados ou estão em piloto;
- como diagnosticar o restaurante antes de apresentar software;
- como demonstrar a Foocci conectando cada tela a uma dor já descoberta;
- como falar de preço, valor e retorno sem prometer resultado;
- como responder objeções sem discutir;
- como avançar para próximo passo e fechamento;
- como registrar corretamente a venda na operação comercial.

## Público

### Humanos
SDR, vendedor/consultor, gerente comercial, QA, onboarding comercial e liderança.

### IAs
Agentes que façam recepção, prospecção, qualificação, suporte ao vendedor, simulação, QA, coaching ou follow-up comercial.

A mesma verdade factual deve alimentar os dois públicos. O formato pedagógico pode mudar; o fato não.

## O produto vendido

Posicionamento comercial vigente no material herdado:

> **“O sistema inteligente que ajuda restaurantes a vender mais e fazer clientes voltarem.”**

Definição de trabalho:

> **Sistema inteligente de vendas, relacionamento e fidelização para restaurantes.**

Não posicionar como “chatbot”. Não dizer que substitui atendente. O papel comercial da IA é apoiar venda, atendimento, relacionamento e análise dentro de limites definidos pelo sistema.

## Cadeia obrigatória por funcionalidade

Nenhuma funcionalidade entra na University como lista solta. Para cada item, registrar:

1. **o que faz**;
2. **evidência**;
3. **estado factual**;
4. **maturidade**;
5. **condições/dependências**;
6. **limites — o que não faz**;
7. **problema do restaurante**;
8. **impacto operacional/financeiro possível**;
9. **argumento comercial**;
10. **como explicar para um dono de restaurante**;
11. **como demonstrar**;
12. **pergunta de descoberta**;
13. **plano em que aparece publicamente**;
14. **relevância comercial**.

## Regras de discurso

### Pode
- “ajuda a”
- “permite”
- “organiza”
- “direciona”
- “pode integrar”
- “no que o restaurante vende direto, não há comissão da Foocci sobre a venda”

### Não pode
- prometer percentual de aumento de venda, economia ou ROI;
- inventar cliente, case, depoimento ou métrica;
- atacar marketplace como inimigo;
- dizer que a IA é infalível;
- vender piloto como pronto;
- prometer prazo de implantação sem fonte aprovada;
- conceder desconto fora da mecânica real;
- usar jargão como argumento (“LLM”, “agentic”, “pipeline”, “automação cognitiva”);
- transformar ausência de evidência em frase plausível.

## Política de preço: fonte única

A University **nunca deve ter uma tabela de preço independente**. Para ensinar os valores, a fonte canônica é:

`src/lib/billing/pricing.ts`

A tela comercial deriva da mesma origem em:

`src/services/salaDeVendas/precos.ts`

Qualquer mudança de preço no treinamento deve nascer da fonte única; nunca de cópia manual.

## Política de atualização

Cada conteúdo factual deverá carregar:

- data da última validação;
- arquivos/rotas usados como evidência;
- responsável pela validação;
- status;
- versão ou commit de referência quando disponível.

Se uma aula depender de funcionalidade alterada depois da validação, ela deve ficar **PENDENTE DE REVALIDAÇÃO** até ser conferida.

## Definição de pronto do conteúdo

Um módulo só pode ser chamado de “pronto para treinamento” quando:

- todo fato de produto tem evidência;
- promessas e limites estão explícitos;
- há exemplo correto e incorreto;
- há exercício;
- há quiz;
- há cenário de simulação quando aplicável;
- existe critério objetivo de aprovação;
- não há conflito com preço, contrato, site ou código atual.

## Sequência de construção

1. Raio-X de produto.
2. Mapa de funcionalidades.
3. Perfis de cliente.
4. Mapa de dores.
5. Posicionamento.
6. Método comercial.
7. Demonstração.
8. Objeções.
9. Alternativas/concorrência com fonte.
10. Economia da venda.
11. Academia/módulos.
12. Role plays.
13. Certificação.

**Aulas vêm depois da verdade do produto.**
