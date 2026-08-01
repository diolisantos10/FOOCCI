# Pendências — o que está aberto

> Última atualização: 31/07/2026, logo após o merge do PR #40.
>
> Lista curta e viva do que ainda não foi feito. Cada linha diz **o que quebra
> se ninguém mexer** — não só o nome da tarefa. Atualize ao concluir ou
> repriorizar.

---

## 🔴 Prioridade — erro aqui chega no cliente

### 1. Garçom: o P1 dietético (mais 3 P1 da mesma varredura)
O Garçom pode dar informação errada sobre restrição alimentar. É o único item
desta lista em que o defeito não custa dinheiro nem reputação — custa a saúde
de quem pediu. Os outros três P1 saíram na mesma varredura e são menos graves.

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Garçom: "tem lasanha?" casa com yakisoba | O matcher difuso aproxima demais e o cliente recebe outro prato |
| Garçom: ponto cego do simulador | Quando cai na IA, resposta vazia passa batida — o simulador aprova o silêncio |
| Foocci: saudação com nome + menu colado por código | Hoje depende do modelo lembrar; tem que ser garantido por código |
| Brain Fase 5 (parcial) | Falta consolidar as 6 filas, avaliar candidato e o LLM-judge online |

---

## 🚚 Mudou de casa — eram daqui e não eram

Três pendências estavam listadas aqui como "Agência" e **pertencem ao Dioli
Digital**, não ao Foocci. Verificado em 01/08: o Foocci não tem nenhuma ocorrência
de `autoCheckable` no código; as 31 checagens com 28 desligadas estão em
`diolidigital/lib/dioli-brain/quality-gates.ts`.

| O que | Foi para |
|---|---|
| 28 de 31 portões são decoração (**P0**) | pendências do Dioli Digital |
| Verdade do cliente montada no cliente | pendências do Dioli Digital |
| Escada por departamento | pendências do Dioli Digital |

O Foocci tem a sua própria esteira de agência (`src/services/brain/sdr`,
`src/services/brain/oficina`) — o que confundiu. São coisas diferentes com nome
parecido, e é exatamente o tipo de erro que a camada de Diretor existe para pegar.

---

## 🅿️ Stand by — por decisão do dono (31/07)

### Custo por restaurante
Adiado. **O achado não pode se perder:** `AIInteractionLog` já tem
`restaurantId`, contagem de tokens e `estimatedCostUsd` — mas **só o
`AIOrderService` escreve nela**. Ficam de fora o Cérebro
(`OpenAIEngineAdapter`), o recepcionista de WhatsApp, o `helpAssistant`, os
embeddings, o `imageEnhancement`, o suporte e **os crons noturnos** — estes
últimos são custo que cresce a cada restaurante novo sem nenhum cliente
conversando. Além disso, `PRICING_USD_PER_1K` só conhece `gpt-4o` e
`gpt-4o-mini`, e modelo desconhecido cai no preço do `gpt-4o` em silêncio.

Quando voltar: ligar o logger em todos os caminhos, atualizar a tabela de
preços e fazer modelo desconhecido gritar, marcar origem (conversa × cron),
endpoint de soma mensal, e **uma semana de coleta em produção** antes de ler
qualquer número.

Isso bloqueia a definição das faixas de preço e o bloqueio por plano.

---

## 🧍 Fora do código — depende de gente, não de commit

- **Impressão física nunca confirmada numa loja.** Foi corrigida no servidor e
  ninguém ainda viu papel sair com alguém presente. Até isso acontecer, é
  conserto no papel.
- **Faixas de preço + bloqueio por plano.** O campo de plano existe e não
  bloqueia nada. Bloqueador comercial, travado no stand by acima.
- **`mpWebhookSecret` não configurado.** Aparece como `false` em `/api/health`.
  Se um pagamento por Mercado Pago não confirmar sozinho, é o primeiro lugar
  para olhar.

---

## ✅ Fechado recentemente

- **B1 — chave `ANTHROPIC_API_KEY`** (30/07). O robô noturno do manual saiu do
  papel: manual de 30/07 verde, agendada de 31/07 idem, com o passo da IA
  levando 4min07s. Toda agendada anterior falhava.
- **Os dois consertos do incidente da Nicole** (31/07, PR #40, em produção). A
  queda do Cérebro parou de apagar a conversa no meio do pedido, e o agente
  parou de prometer pedido que não pode criar.
- **A branch de trabalho estava 42 commits atrás** da padrão, e as duas travas
  acima estavam paradas nela sem chegar em produção. Resolvido no mesmo PR.
