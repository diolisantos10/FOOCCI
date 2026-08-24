# 11 — Backlog do Diretor do Foocci

> Aberto em 25/08/2026, quando as cinco fases da v3 fecharam.
>
> **Segue o padrão da companhia** — `docs/kit/11-backlog-do-diretor-geral.md`,
> espelho de `dioli-brain-kit`. Seções: Em execução · Fila · Depende do CEO ·
> Fechados. A primeira versão deste arquivo inventou uma estrutura própria; foi
> corrigida em 25/08 quando o CEO apontou que **existe padrão na empresa**.
>
> **O que entra aqui:** execução dentro do Foocci.
> **O que NÃO entra:** doutrina e coerência entre projetos — isso é do Diretor
> Geral, e se propõe ao kit (guardrail 3).

---

## A regra que governa este arquivo

**O CEO não é fila de aprovação.** Item que não precisa de decisão de dono,
**executa**. Item que precisa, vai para "Depende do CEO" **com a pergunta pronta**
— e o resto do trabalho continua andando sem ele.

Aplicado aqui: os quatro itens da Fila não esperam resposta nenhuma. Se eu ficar
parado esperando o CEO, o erro é meu, não a fila dele que está lenta.

---

## 🔨 Em execução

*Vazio.* A v3 fechou em 25/08 e a Fila abaixo ainda não foi puxada — o CEO está
decidindo por onde começar.

---

## 📋 Fila

Em ordem do que mais muda a vida de quem usa. Nenhum depende de decisão do CEO.

### F1 · Colocar os leads antigos na Sala de Vendas
**Tamanho:** pequeno — script de uma passada.
A Sala abre **vazia** hoje. Quem entra pela primeira vez vê um sistema que parece
não ter nada dentro, e é a primeira impressão que o time de vendas vai ter dela.

### F2 · Ficha do contato dentro da Sala
**Tamanho:** médio.
O histórico do contato vive no CRM, noutra gaveta. Hoje o vendedor atende sem ver
com quem está falando — e pergunta de novo o que a pessoa já respondeu no site.

### F3 · Quadro de etapas (Kanban) da Sala
**Tamanho:** médio.
A lista existe, funciona e é testada. Quadro é o que time comercial espera ver, e
é onde a etapa parada fica visível sem ninguém procurar.

### F4 · Ligar `/api/sdr/entrevista` ao mundo
**Tamanho:** médio.
O motor do SDR existe, é testado, e **ninguém o chama**. É trabalho pronto parado
— a pior categoria de item de backlog, porque não parece dívida.

---

## 🧍 Depende do CEO (não bloqueia a Fila)

| Pergunta | O que acontece enquanto não vier |
|---|---|
| **Aprovar o PR #145** e dizer para qual branch ele vai | tudo que foi feito continua em rascunho |
| **Preço, alçada de desconto, prazo, formas de pagamento, quem fecha** | o SDR trava na primeira pergunta de preço |
| **Cadastrar o número na Meta** (`docs/whatsapp-vendas-passo-a-passo.md`) | toda mensagem continua sendo respondida à mão |
| **Destino do chip** — atender à mão hoje **ou** automatizar depois | decidir depois custa o histórico do aparelho |
| **O e-mail de escalada do suporte está configurado?** | cliente pede ajuda, chamado é salvo, **ninguém é avisado** |
| **Data para desligar o `ADMIN_SECRET`** | porta sem data de fechamento é porta que ninguém fecha |
| **Ligar o envio** (`FOOCCI_SDR_SEND_ENABLED`) | nenhuma mensagem sai — e é assim de propósito |
| **Conta de teste isolada** | não há como exercitar ponta a ponta sem tocar em dado de gente |

**Um item da Fila é meu e parece dele:** criar o primeiro acesso interno. Hoje a
área responde 401 para todos, inclusive para o CEO. É um comando, não é decisão —
por isso não está nesta tabela. Entra assim que o PR for aprovado.

---

## 🧾 Dívida herdada (não é da v3)

Nenhuma quebra nada hoje. A característica comum — e é o que as torna caras — é
que **nenhuma delas avisa quando dá errado**.

| # | O que | Por que importa |
|---|---|---|
| D1 | A cadeia de migrações não replica do zero | banco novo não se monta pelo histórico. Hoje contornado gerando por diferença de schema |
| D2 | ~750 erros de tipo em arquivos de teste antigos | ficaram invisíveis porque teste era excluído do `type-check` |
| D3 | Dois arquivos de teste diferem só na caixa da letra | em Mac ou Windows um sobrescreve o outro no clone |
| D4 | A submissão de modelo à Meta ficou sem motor (achado de 23/08) | sem modelo aprovado a campanha fria fica bloqueada para sempre, e nada falha no log |

---

## ✅ Fechados

| # | O que | Quando |
|---|---|---|
| — | Raio-x do que já existia, antes de escrever qualquer linha | 25/08 |
| — | Planta de 6 departamentos; v1 marcada SUPERADA, nada apagado | 25/08 |
| — | 30 fichas de cargo, todas nascidas vagas e desligadas | 25/08 |
| — | Seis perfis de acesso, com escopo dentro da **consulta**, não só na rota | 25/08 |
| — | Sala de Vendas: sete filas, assumir e devolver com escrita condicional | 25/08 |
| — | Governança: delegação medida e não conformidade com evidência | 25/08 |
| — | `db:conferir-v3` — o instrumento que confere o banco antes de liberar | 25/08 |
| — | Saída para o WhatsApp acesa, com o número **11 94372-3316** | 25/08 |
| — | Regra: entrega ao CEO é página publicada, não `.md` (em `CLAUDE.md`) | 25/08 |

**16 de 16 critérios de aceite**, com a ressalva escrita no documento 09: o "oi"
do WhatsApp chega num aparelho, não na Sala. Recepção automática depende da Meta.

---

## Notas

- **Este arquivo é a fonte; a página é a entrega.** O CEO não lê `.md` (ordem de
  25/08). O que sobe para ele é página publicada, e ela é gerada a partir daqui.
- Item fechado **não sai** da lista: vira linha em "Fechados" com a data. Backlog
  que apaga o que entregou perde a única prova de ritmo que existe.
