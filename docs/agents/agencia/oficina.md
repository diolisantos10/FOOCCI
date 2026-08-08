# Oficina — agência

> Append-only. O especialista escreve aqui; quem promove para a vitrine é o Diretor.

---

## 2026-08-08 · O SDR do Foocci passa o valor dos planos

**Pedido:** decisão do CEO — *"Ele passa o valor dos planos."* Lead pergunta
quanto custa, o SDR responde na hora. A trava que veio junto valia mais que a
resposta: **ler o preço da mesma fonte que o site publica.**

### O levantamento primeiro (e ele mudou o desenho)

Não presumi pela descrição. O que achei:

1. **A fonte real não é `src/lib/site/plans.ts`.** Esse arquivo é camada de
   *copy* e já é derivado: ele lê `PLAN_CYCLE_CENTS` de
   `src/lib/billing/pricing.ts:95`, que é a fonte única de verdade — a mesma que
   o checkout cobra do cartão. `seletorDePlanos.ts` não tem preço nenhum, só as
   classes de visibilidade do seletor. Liguei o SDR em `pricing.ts` direto, e
   peguei nome e "para quem serve" de `plans.ts` (que é onde essa copy mora).

2. **O SDR do Foocci não existe.** `src/services/brain/sdr/` é o SDR da
   **agência** — entrevista cliente de marketing, e o desenho
   (`docs/sdr-foocci-desenho.md:31`) já tinha julgado que ele **não serve de
   base**: fala de outro produto e chama a IA por atalho, fora do portão
   (`sdr/Entrevistador.ts:332`). Por isso a pasta nova `sdr-foocci/`, separada, e
   não um remendo dentro de `sdr/`.

3. **A decisão de hoje fecha metade do Degrau 0** do
   `docs/sdr-foocci-desenho.md:81` (*"qual número e qual a resposta sobre
   preço"*). A outra metade — o número de WhatsApp — continua aberta. E a linha 65
   do mesmo documento ficou **obsoleta**: dizia *"preço é escalada obrigatória
   enquanto as faixas estiverem em stand by"*. Não está mais.

### 🔴 O achado: existia uma segunda fonte do mesmo número

`src/app/admin/(area)/assinaturas/AssinaturasClient.tsx:261-263` digitava
`R$ 179/mês`, `R$ 429/mês` e `R$ 899/mês` no seletor de plano — **com
`PLAN_CYCLE_CENTS` já importado na linha 12 do próprio arquivo.**

Provado, não deduzido: sabotei `pricing.ts` para `STARTER.MENSAL: 25_500`,
confirmei por `git diff` que entrou, e o seletor do admin continuou oferecendo
"R$ 179/mês" — calado, sem nenhum teste reprovando. É o defeito inteiro em
miniatura: quem cadastra assinatura pelo admin escolheria pelo valor velho.

Corrigido no mesmo bloco (o seletor agora mapeia sobre os códigos e lê a tabela).
**Fica para o Diretor decidir** se a correção devia ser minha — o arquivo é do
domínio `operacao`/`interface`, não meu. Não deixei o duplicado de pé porque
duplicado conhecido é mentira conhecida.

### O que foi construído

- `src/services/brain/sdr-foocci/RespostaDePreco.ts`
  - `responderPreco()` — determinístico, sem IA, sem banco, sem rede. Compõe a
    fala com os três planos, o valor mensal, o desconto do primeiro mês **com o
    valor de cada plano ao lado**, e o aviso de que a partir do segundo mês é
    valor cheio. Nenhum número digitado.
  - `descontoDoPrimeiroMesPercent()` — derivado de `firstMonthDiscountCents`.
    **Não** importei `firstMonthDiscountPercent` de
    `components/marketing/SinaisDeVenda.tsx` de propósito: aquele módulo exporta
    componentes React, e um serviço do Brain que arrasta JSX passa a quebrar por
    motivo que não tem a ver com preço. As duas leem a MESMA função; nenhuma
    guarda o número.
  - `auditarFalaDePreco()` — **o portão**, porque a partir da segunda mensagem a
    fala é escrita por IA e "não negocie" no perfil do agente é aviso, não trava
    (guardrail 4). Reprova: valor em reais fora da tabela, porcentagem fora da
    tabela, negociação, prazo de implantação, promessa de resultado. Toda falta
    carrega o **trecho** que a causou (guardrail 6). **Fala vazia reprova**
    (guardrail 2).

### Uma nota sobre a régua de porcentagem

O conjunto de porcentagens permitidas é derivado da tabela (desconto do primeiro
mês + economia de cada ciclo contra o mensal). Isso faz dois trabalhos de uma vez:
barra o desconto inventado (*"faço por 30% a menos"*) e barra a promessa de número
que os guardrails já proíbem (*"aumenta suas vendas em 40%"*) — porque 30 e 40 não
saem de tabela nenhuma. Foi de graça, e é a parte de que mais gostei.

### 🟠 Defeito de terceiro que encontrei e NÃO consertei

`src/services/brain/reasoning/SnapshotCoherenceVerifier.ts:30` usa
`/R\$\s?(\d{1,4}(?:[.,]\d{2})?)/g`. Esse regex **para no separador de milhar**:
em `"R$ 4.290,00"` ele captura `"4.29"` e conclui R$ 4,29. Consequência: um preço
legítimo acima de mil reais é lido errado pelo verificador que decide se o agente
inventou preço. Para cardápio de restaurante quase nunca importa; para
encomenda/festa, e para mensalidade de plano no ciclo anual, importa sempre.

É do domínio `cerebro`, não meu — por isso escrevi o meu próprio extrator (que
trata milhar) e deixei o achado aqui em vez de mexer na sala do outro.

### O portão — as duas metades, com a sabotagem CONFERIDA antes de julgar

Fiz três sabotagens e conferi por `git diff`/`diff` que **cada uma entrou no
arquivo** antes de olhar o resultado. Isso pegou este projeto quatro vezes nesta
semana e quase me pegou também: minha primeira leitura foi "24 verdes, pronto".

| # | Sabotagem | Prova de que entrou | Resultado |
|---|---|---|---|
| A | `pricing.ts`: `STARTER.MENSAL 17_900 → 25_500` | `git diff --unified=0` mostrou a linha 96 trocada | A fala mudou: `R$ 179,00 → R$ 255,00` e o 1º mês `R$ 89,50 → R$ 127,50`. **Sem cópia.** |
| B | cópia escondida `{ STARTER: 17900, … }` dentro do agente | `diff` contra o backup mostrou as 2 linhas plantadas | **3 casos reprovaram** — os 2 dinâmicos (`vi.doMock`) e o estático de literal |
| C | apagada a linha do desconto na fala | `diff` mostrou a linha virando `""` | **4 casos reprovaram** |

Os três casos obrigatórios do despacho estão cobertos, e cada um tem a metade que
prova que o detector **morde** e a metade que prova que ele **não morde o
legítimo** — inclusive um caso que aprova o valor anual com separador de milhar,
que é justamente onde o regex do `SnapshotCoherenceVerifier` erraria.

O detector estático não tem lista digitada de valores proibidos: ele **gera** os
literais a partir de `PLAN_CYCLE_CENTS`. Uma lista escrita à mão envelheceria
pelo mesmo motivo que o bloco inteiro existe para combater.

### Verificação

- `npx tsc --noEmit` → **exit 0**, nenhuma saída.
- `npx vitest run --reporter=json`, lido do JSON: **success: true · 2190/2190
  arquivos de teste · 6251/6251 casos · 0 falhas · 0 pendentes.** Os 24 casos
  novos entraram na conta.

### O que NÃO fiz, de propósito

Nenhuma mensagem saiu para ninguém. Não toquei em WhatsApp, Meta, credencial nem
fluxo de conexão. Não construí o agente SDR — só o tijolo que a decisão do CEO
destravou. Freios de contato, opt-out, consentimento e esteira de treino
continuam abertos no `docs/sdr-foocci-desenho.md`, e o número de WhatsApp
continua sendo a dependência que manda em tudo.

---
