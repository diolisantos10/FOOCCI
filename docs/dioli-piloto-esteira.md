# Dioli — o piloto ponta a ponta, e as três quebras que ele achou

> 30/07/2026. A esteira inteira percorrida na ordem real, com a Foocci de cliente:
> **SDR → plano do PM → portão de direção → produção → aviso.**
>
> Rodar: `npm run dioli:piloto`

---

## Por que um passeio e não um teste

Cada peça da esteira tinha teste próprio e todos passavam. O que ninguém tinha
feito era **andar a corrente inteira** — e é nas juntas que ela estava
arrebentada. As três quebras abaixo só aparecem quando uma etapa entrega para a
seguinte.

---

## Quebra 1 — a Oficina não conhecia o domínio "agencia"

Só existia manual de `restaurante`. Toda peça pedida para um cliente de agência
caía no caminho **sem manual**: ficha pelada, nenhum eixo para o Variador girar,
nenhuma lista negra.

**Conserto:** [`manualAgencia.ts`](../src/services/brain/oficina/manualAgencia.ts) —
a régua do ofício. Lista negra do jargão que denuncia peça de robô ("solução
inovadora", "revolucionar o mercado", "aumente suas vendas em"), proibições
padrão (nada de número prometido, nada de depoimento inventado) e os eixos por
meio.

De quebra, o eixo **`formato`** — que o juiz exige e que **nenhum** manual
oferecia em texto. Sem ele, toda peça escrita era reprovada com "defina o formato
e o limite". O manual do restaurante tem o mesmo buraco; quem chama passa
`formato` no rascunho e não percebe.

## Quebra 2 — o caminho sem manual jogava fora as proibições do cliente

Pior que a primeira, e mais sutil. Quando não havia manual, a Oficina montava a
ficha com `proibicoes: []` — **descartando as proibições que vinham do briefing**.

Isso importava de verdade: a Foocci tem uma lista escrita e específica (não
posicionar como chatbot, nunca prometer percentual de aumento, nenhum depoimento
inventado). A peça mais arriscada — a de um domínio que a casa ainda não conhece
— era justamente a que saía sem ninguém segurando nada.

**Conserto:** o rascunho é honrado mesmo sem manual. O domínio desconhecido
continua reprovando (isso está certo), mas o juiz agora tem contra o que
conferir.

## Quebra 3 — não havia verdade nenhuma para cliente de agência

A maior. Só existia `BusinessKnowledgeAdapter` de `RESTAURANT`. Para `AGENCY` a
verdade vinha vazia, e o juiz reprovava — **corretamente** — com *"anexe os fatos
do banco na verdade, senão a IA vai inventar e a peça sai genérica"*.

Ou seja: a esteira da Dioli parava na produção. Sempre. Para todo cliente.

**Conserto:** [`AgencyKnowledgeAdapter`](../src/services/brain/knowledge/AgencyKnowledgeAdapter.ts).
A peça que faltava já existia — **a sondagem do SDR**. O briefing é exatamente o
que a Oficina precisa: o que o cliente vende, para quem, o que o diferencia, o
que ele proíbe.

| truthSource | vem de |
|---|---|
| `products` | `o_que_vende` + `diferencial` |
| `customers` | `publico` |
| `policies` | `proibicoes` + a origem do material de cada serviço contratado |
| `materials` | identidade visual, canais, objetivo, datas, região |

Duas consequências que valem mais que o conserto:

1. **A corrente fecha.** O que o cliente respondeu ao SDR é literalmente o que
   ancora a peça — não uma cópia que envelhece em outro lugar.
2. **A trava herda o rigor da sondagem.** Briefing pobre → verdade pobre →
   completude baixa → peça reprovada. O jeito de destravar a produção é
   **terminar a entrevista**, que é exatamente o que deveria acontecer.

E nunca inventa: campo sem resposta vira `missingContext` **com a pergunta
original**, não com um valor plausível.

---

## Como o piloto ficou

```
ETAPA 1 — SDR
  ✓ o bastão pode passar para o PM
  ✓ nenhum essencial ficou sem PERGUNTAR
  · 6 resposta(s) pendente(s) — vão declaradas

ETAPA 2 — PM
  ✓ calendário de 2026-08-03 a 2026-08-30 com 36 peça(s)
  ✓ toda linha nasceu com data e dia da semana
  ✓ toda peça tem dono do material declarado

ETAPA 3 — Direção
  ✓ proposta apta ao aceite, com as pendências impressas no rodapé

ETAPA 4 — Produção
  ✓ manual do domínio "agencia" registrado
  ✓ o briefing virou verdade: 4 chave(s), completude 0.71
  ✓ 13 proibição(ões) chegaram na ficha
  ✓ as proibições do BRIEFING sobreviveram até a ficha
  ✓ comando APROVADO pelo juiz

ETAPA 5 — Aviso
  ✓ sai com o calendário e as pendências declaradas

PILOTO OK — a corrente inteira aguentou.
```

---

## O que o piloto NÃO provou

**A chamada de IA de verdade não rodou nesta máquina.** Não há chave de IA no
ambiente onde o piloto foi executado, então `selectEngine` devolve o motor
`MOCK`, que recusa a chamada. O piloto **diz isso em vez de fingir** — e segue,
porque tudo que vem antes da IA é determinístico e é justamente o que se queria
provar.

Em produção há `openaiKey: true` (confere em `/api/health`). Para rodar a perna
da IA, basta executar o piloto num ambiente com a chave:

```bash
OPENAI_API_KEY=… npm run dioli:piloto
```

A saída passa a mostrar a peça escrita e o veredito do juiz do resultado.

---

## Detalhe de arquitetura que vale lembrar

Os manuais e os adapters **registram-se no import**. Um script que busque
`rodarEsteira` pelo caminho fundo pula esse registro e reprova a peça por um
motivo falso ("domínio sem manual" com o manual existindo).

Por isso o piloto importa tudo por [`scripts/piloto-dioli.imports.ts`](../scripts/piloto-dioli.imports.ts),
que passa por `@/services/brain` — a dependência fica visível em vez de escondida
numa ordem de import que qualquer refatoração desfaz sem perceber.
