# 02 — Plano de investigação do produto

## Objetivo

Completar a fase que ficou interrompida no handoff: ler o Foocci atual por domínio e produzir um mapa comercial verificável antes da escrita das aulas.

## Contrato de saída por funcionalidade

Cada item investigado precisa entregar, no mínimo:

```
id
nome
oQueFaz
evidencia[]
estado: CONFIRMADO | INFERIDO | NAO_VALIDADO
maturidade: PRONTO | DEPENDE_DE_TERCEIRO | DESLIGADO_POR_PADRAO | PILOTO | NAO_EXISTE
condicoes
limites
problemaDoRestaurante
impacto
argumentoComercial
comoExplicar
comoDemonstrar
perguntaDeDescoberta
planoOndeAparece
relevanciaComercial
```

## As duas revisões adversariais obrigatórias

### Lente A — “Existe e está ligado?”
Perguntas:
- a tela existe?
- a API existe?
- quem chama?
- existe flag?
- depende de credencial?
- depende de allowlist?
- o default ativa ou desativa?
- existe teste?
- existe apenas documentação sem chamada real?

### Lente B — “A promessa é honesta?”
Perguntas:
- o argumento diz mais do que o código entrega?
- depende de dado que o restaurante precisa cadastrar?
- depende de terceiro?
- a demonstração provaria o que o vendedor está falando?
- existe caso em que a frase vira falsa?
- o recurso é piloto?
- o benefício está sendo confundido com resultado garantido?

## Domínios

### 01 — Canal de venda próprio
Investigar `/pedido/[slug]`, `/qr/[slug]`, modo loja sem IA, links rastreáveis, preço/visibilidade por canal, horários, pausa, white-label, identificação, carrinho e checkout.

### 02 — Operação do pedido
Status, tipos de pedido, alerta, coordenação entre aparelhos, impressão/Carteiro, estações, fila/retry, edição, cancelamento e papéis operacionais.

### 03 — Cardápio e produto
Categorias, múltiplas categorias, variantes, adicionais, disponibilidade, fotos, planilha, melhoria de imagem, informações usadas pela IA, porção e serve-N.

### 04 — CMV e precificação
Custo, ficha técnica, ingredientes, propagação, markup, reprecificação, teto, arredondamento, CMV de período e histórico.

### 05 — Pagamentos, entrega e nota fiscal
Pix/dinheiro/cartão/link, online/presencial, gateways, troco, entrega, zonas, distância, retirada, NFC-e, certificado e emissor.

### 06 — WhatsApp e canais
Provedor atual, onboarding Meta, recepção, menu, personalidade, passagem humana, pedido por texto, Instagram/Facebook/Google e Central de Conversas.

### 07 — CRM e relacionamento
Ficha, segmentação, importação, limpeza, campanhas, segurança de contato, cupons, níveis, indicação, carrinho abandonado, regras de pedido em voo e agente CRM.

### 08 — Garçom IA no cardápio
Venda guiada, sugestão, combo, categorias, restrições, recusa, fim de funil, fidelidade aos fatos do cardápio e fallback.

### 09 — Verdade e qualidade da IA
Retrato factual, verificador, simulador, P0/P1/P2, escada de promoção, shadow/allowlist/wide, evidência e cofre de aprendizados.

### 10 — Analytics e integrações
Overview, produtos, categoria, attach rate, clientes, segmento, canal, upsell, cohort, operação, diagnóstico e integrações externas.

### 11 — Onboarding, ajuda e manual
Cadastro inicial, importações, setup de canais, ajuda interna, escalada humana, manual e implantação.

### 12 — Segurança, dados e LGPD
Papéis, isolamento entre restaurantes, criptografia, auditoria, exportação, retenção/portabilidade, controlador/operador e limites contratuais.

### 13 — Planos, cobrança, contrato e site
Tabela, ciclos, desconto, checkout, cancelamento, reajuste, inadimplência, o que é cobrado à parte, limites publicados, FAQ e conflito site×produto.

### 14 — Infraestrutura comercial
`/comercial`, grupos/telas, funil, carteira, prospecção, hunter, SDR, qualificação, CRM comercial, follow-up, supervisora/QA, preço, métricas e passagem humano↔IA.

## Ordem de prioridade

1. preço/contrato/site — porque dinheiro não aceita memória;
2. WhatsApp/CRM — porque são áreas de maior promessa e maior risco;
3. canal próprio/pedido — porque sustentam a demonstração;
4. Garçom/verdade/qualidade — porque diferenciam o produto e exigem linguagem precisa;
5. CMV/analytics — porque produzem argumento econômico;
6. integrações/fiscal/onboarding/segurança;
7. infraestrutura comercial — para transformar conteúdo em rotina do vendedor.

## Saída da fase

A fase termina com:

- `03-MAPA-DE-FUNCIONALIDADES.md`
- `03-mapa-de-funcionalidades.json`
- lista de divergências;
- lista de “NÃO DIZER”;
- lista de telas/rotas demonstráveis;
- lista de lacunas que dependem do CEO;
- data da última validação por domínio.

Só então começa a escrita pedagógica definitiva.
