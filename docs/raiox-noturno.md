# Raio-X noturno

> A coleta determinística que roda toda madrugada. **Metade de um par**: esta
> metade produz evidência; a leitura de negócio é escrita depois, por uma sessão
> do Diretor, em cima do que está aqui.

## Por que as duas metades são separadas

Um raio-x que depende de IA para **coletar** erra diferente toda noite — e aí
"piorou desde ontem" deixa de significar alguma coisa. A coleta é código puro,
barata, sempre igual. A interpretação é onde a IA entra, e ela entra **depois**,
sobre números que não mudam sozinhos.

## O que a coleta enxerga

Dezesseis sondas, em dois grupos.

### Estado de operação (lê o banco)

| Sonda | Pergunta que responde |
|---|---|
| `ia-custo` | quanto a IA consumiu em 24h, por motor, e quanto falhou |
| `ia-retrabalho` | conversa que consome IA repetidamente e não vira pedido |
| `mensagens-presas` | mensagens com falha **declarada** pelo provedor ou penduradas |
| `fila-impressao` | comanda que não saiu na cozinha |
| `carrinho-parado` | rascunho encalhado e sessão vencida que o relógio não fechou |
| `assinaturas` | pagou e a conta não nasceu · cobrança pela metade · venda parada |
| `portoes` | a auditoria de qualidade rodou? achou P0? |
| `cerebro-sombra` | evidência da escada de liberação e configuração fora de sombra |
| `jobs-travados` | importação, extração, campanha ou nota fiscal que não terminou |
| `dado-morto` | tabela que só cresce · restaurante ativo que parou de vender |
| `pulso-negocio` | pedidos por restaurante hoje contra a média dos 7 dias |

### Padrões nomeados no código (lê o repositório)

Estas olham o que **já estava lá** e ninguém questiona mais — não o que acabou
de mudar (isso é auditoria adversarial, e o CI já faz).

| Sonda | Padrão |
|---|---|
| `porta-aberta` | rota pública que alcança chamada paga sem prova de chamador |
| `id-sem-dono` | rota que aceita id de restaurante/cliente sem provar posse |
| `selo-vazio` | veredito de verificação escrito como `true` fixo |
| `estado-morto` | campo gravado que nenhum leitor consome |
| `loop-sem-teto` | laço/retentativa sem condição de parada, pior se custa por volta |

## Regras que viraram código

1. **Ausência de dado não é "está tudo bem".** Cada bloco da amostra é
   `{ ok } | { reason }`. Sonda cujo bloco não veio devolve `UNKNOWN`, nunca
   `PASS`, e qualquer `UNKNOWN` impede o veredito global de ser `PASS`.
2. **Sonda que não registrou resultado reprova.** Devolver lista vazia ou
   explodir vira `UNKNOWN` com o motivo. Esquecer nunca é aprovar.
3. **Todo achado carrega a própria evidência.** `evidence` traz o caso concreto
   (arquivo:linha, id do pedido, id da conversa) e `metrics` traz os números
   comparáveis. Sem base de comparação, o delta é `null` — **não zero**, que
   seria lido como "estável".
4. **Nunca age.** Não envia, não cobra, não cria pedido. Provado por varredura
   em `src/services/raiox/noSideEffects.test.ts`, não por promessa no cabeçalho.

## Como rodar

**Em produção (é o que o cron faz):**

```bash
curl -X POST https://foocci.com.br/api/cron/raiox/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Ler o resultado (é daqui que a sessão da manhã lê):**

```bash
curl -s "https://foocci.com.br/api/admin/raiox/latest" \
  -H "x-admin-secret: $ADMIN_SECRET" | jq .
```

Parâmetros: `?runId=<id>` para uma execução específica, `?history=14` para o
tamanho da série.

**Agendamento:** `.github/workflows/raiox-noturno.yml`, 06:00 UTC (03:00 BRT),
antes da auditoria de qualidade das 06:30 UTC.

## Como a leitura da manhã deve usar isto

- Comece por `unavailableBlocks`. **O que a coleta não conseguiu olhar entra no
  relatório como "não sei".** Omitir isso é afirmar calmaria onde houve cegueira.
- Ordene por `severity` e leia `deltas` antes de `metrics`: o que mudou desde
  ontem é a notícia.
- Os detectores de código (`id-sem-dono`, `selo-vazio`, `estado-morto`) são
  **heurísticos**. Eles entregam candidatos com arquivo:linha para confirmação.
  Nunca apresente um candidato como fato — é o mesmo defeito que o raio-x caça.

## Onde mexer

```
src/services/raiox/
  types.ts                  contratos + Block<T> (a trava do guardrail 1)
  RaioXService.ts           orquestrador puro (a trava do guardrail 2)
  probes/runtimeProbes.ts   as 11 sondas de operação
  probes/sourceProbes.ts    as 5 sondas dos padrões nomeados
  collect/RaioXCollector.ts a única camada que lê o banco
  collect/SourceScanner.ts  a varredura do código-fonte
  persistence/              a única camada que escreve (só raiox_*)
```

Sonda nova nasce com **as duas metades de teste**: a que prova que ela acha o
problema quando ele existe, e a que prova que ela **não** inventa problema
quando ele não existe. Varredura que só foi vista achando coisa é
indistinguível de varredura que alarma sempre — e a que alarma sempre é
desligada na primeira semana.
