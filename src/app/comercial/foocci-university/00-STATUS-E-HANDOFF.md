# 00 — Status e Handoff

**Data-base:** 20/09/2026

## O que foi recebido

Handoff do trabalho anterior contendo:

- dossiê de passagem;
- pedido original do CEO;
- prompt de continuação;
- briefings de investigação;
- 101 arquivos-fonte copiados do projeto.

O trabalho anterior fez reconhecimento amplo de produto, site, preço, contrato, SDR e sala de vendas, mas **não concluiu a validação por domínio no código** e **não escreveu aulas**.

## Estado real na entrada

| Bloco | Estado |
|---|---|
| Reconhecimento inicial | FEITO |
| Inventário preliminar de funcionalidades | FEITO, parte ainda INFERIDA |
| Validação de produto por domínio no código | NÃO CONCLUÍDA |
| Pesquisa de mercado/alternativas | NÃO CONCLUÍDA |
| Perfis de cliente | NÃO INICIADO |
| Mapa de dores | NÃO INICIADO |
| RAIO-X Comercial final | NÃO INICIADO |
| Método de venda | NÃO INICIADO |
| Demo oficial | NÃO INICIADO |
| Objeções | NÃO INICIADO |
| Economia da venda | NÃO INICIADO |
| Academia/módulos | NÃO INICIADO |
| Role play | NÃO INICIADO |
| Certificação | NÃO INICIADO |

## Fatos já suficientemente estabelecidos para orientar a investigação

- Foocci é um sistema operacional/comercial para restaurantes com painel do lojista e experiência white-label para cliente final.
- O produto cobre, em diferentes graus de maturidade, cardápio, pedido, atendimento, CRM, operação, analytics e automação/IA.
- A Comercial Foocci existe em `src/app/comercial/`.
- O diferencial declarado no projeto é a integração entre canais de venda, operação, CRM e inteligência, não a superioridade isolada de cada módulo.
- A regra de produto é conservadora: recurso em piloto não pode ser vendido como pronto.
- O treinamento será usado por humanos e por agentes de IA.

## Alertas que já entram como guardrail

1. Pedido completo por texto no WhatsApp foi descrito no handoff como piloto e precisa de validação atual antes de qualquer promessa.
2. Integrações dependentes de terceiros devem ser tratadas como condicionais.
3. Impressão física precisa de cuidado de discurso enquanto não houver evidência operacional suficiente.
4. CRM e agentes possuem regras de governança e segurança; treinamento não pode ensinar comportamento que viole essas travas.
5. Preço e planos devem ser lidos da fonte vigente no código/site, nunca copiados de memória ou documento histórico.
6. O termo legado “FUT” não deve aparecer em material comercial final; usar **Foocci**.

## Próxima etapa obrigatória

Fechar o **Mapa Mestre de Produto** por domínio, validando cada capacidade comercialmente relevante no código e classificando:

- CONFIRMADO;
- INFERIDO;
- NÃO VALIDADO;
- PRONTO;
- PILOTO;
- DEPENDE DE TERCEIRO/CONFIGURAÇÃO;
- NÃO DISPONÍVEL.

Só depois disso começa a transformação pedagógica em módulos.
