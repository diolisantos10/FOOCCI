# Vitrine — cerebro

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
>
> Esta sala guarda o que se aprendeu **fazendo** o Cérebro: portão, verdade,
> escada de liberação, instrumento de medição.

---

## Coleta que julga não pode ser a mesma que mede

Instrumento que usa IA para **coletar** erra diferente toda noite — e aí "piorou
desde ontem" perde o sentido, que é metade do valor de qualquer medição
recorrente. Separe **amostra** (veio, ou não veio *com motivo*) de **julgamento**
(função pura sobre a amostra).

Três consequências que valem para qualquer varredura desta casa:

1. A sonda **não consegue** ver zero no lugar de "não li" — são tipos diferentes.
2. Sonda que devolve vazio vira **desconhecido** e **proíbe o PASS global**
   (guardrail 2 aplicado ao instrumento).
3. Todo detector heurístico entrega **candidato com arquivo:linha**, nunca
   veredito. No primeiro raio-x, o único achado que parecia P0 foi **absolvido**
   pela leitura humana — se ele tivesse saído como veredito, teria virado conserto
   de coisa que não estava quebrada.

— promovido em 2026-08-05 pelo Diretor · origem: construção do raio-x noturno,
commit `528f281b`

---

## Régua que só olha os últimos N dias descarta o esforço de meses

O agente de CRM ficou meses em sombra e **nunca acumulou nada**: o portão de
promoção lia apenas os **últimos 7 dias**, e a sombra só grava depois que uma
campanha **envia de verdade**. Campanha parada = sombra muda = escada travada,
**sem nenhum erro aparecer**.

Duas regras que ficam:

- **Escada precisa de esteira própria.** Se a evidência de um agente depende de
  outro sistema estar funcionando, ele não sobe quando aquele sistema para — e
  ninguém liga o defeito à causa. O recepcionista tem replay noturno; o CRM não
  tinha, e é por isso que um parecia progredir e o outro não.
- **Zero amostra nunca é PASS.** A vistoria noturna somava todos os agentes e
  carimbava aprovado até com sombra vazia. Instrumento que aprova o silêncio é
  pior que instrumento nenhum: ele impede a pergunta.

— promovido em 2026-08-05 pelo Diretor · origem: investigação da escada do agente
de CRM, PR #100

---

## Defeito que ainda não custou dinheiro é defeito que ainda não foi chamado

A tabela de preços de IA cobrava **qualquer modelo desconhecido ao preço do
gpt-4o**, por fallback silencioso — e o prejuízo real era **zero**, porque um
`z.enum` a montante só deixava gravar os dois modelos já precificados. A trava
certa existia **por acidente**, num arquivo que ninguém ligava a custo.

Três regras que ficam:

- **Medir o dano atual não mede o risco.** O roteador já tinha defaults de Claude
  e Gemini prontos; bastava um ajuste de roteamento para o relatório passar a
  errar ~8x, calado. Julgue a trava pelo que ela deixa passar **quando o caminho
  ao lado abrir**, não pelo que já passou.
- **"Não sei o preço" precisa de tipo próprio, não de valor sentinela.** Zero
  conhecido (motor interno), custo indeterminado (modelo fora da tabela) e
  cobrado em outra unidade (áudio por minuto, imagem por imagem) colapsam todos
  em `0` se o campo for só um número. A tela que soma os três vira ficção.
- **Criar um valor novo para "não sei" transforma todo consumidor existente em
  suspeito.** O `?? 0` do raio-x era inofensivo enquanto a coluna nunca era nula
  — o conserto do produtor foi o que o armou. Produtor honesto com consumidor
  surdo dá no mesmo número errado, agora com aparência de auditado. Ao introduzir
  o estado, **varra quem lê o campo na mesma sessão**.

— promovido em 2026-08-07 pelo Diretor · origem: Sala dos Agentes / custo de IA
por agente, commits `e4fc483b` e o deste bloco

---

## Neste repositório, type-check verde não diz nada sobre teste

`tsconfig.json` exclui `src/**/*.test.ts`. Um bloco inteiro passou no
`npx tsc --noEmit` com os testes ainda usando campos que tinham sido renomeados
— comparando contra `undefined` e parecendo corretos. **Só o `vitest run` pega.**

Vale para todo agente desta casa: `tsc` limpo é metade do portão, nunca o portão.

— promovido em 2026-08-07 pelo Diretor · origem: renomeação dos campos de custo
do raio-x, mesmo bloco acima
