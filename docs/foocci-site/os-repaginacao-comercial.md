# OS — Repaginar o site comercial para converter

> **Ordem de serviço do Diretor Geral para o Diretor do Foocci.** 2026-08-02.
> Pedido do CEO: *"um site um pouco mais agressivo, sofisticado, sem perder a
> essência dele"* — com a análise competitiva virando argumento na página.
>
> **A execução é sua.** Este documento é o *quê* e o *porquê*; o *como* em código
> é decisão do especialista `interface`, que você despacha.

---

## 1. Por que mexer num site que acabou de subir

Ele **está bem construído** — sua própria auditoria de 02/08 provou: zero rolagem
horizontal nos três tamanhos, acessibilidade limpa, marca correta. **Nada disso se
toca.**

O problema é outro: **a home tem 19 telas de rolagem no celular e não diz, em
lugar nenhum, o que a Foocci tem que os concorrentes não têm.** Ela descreve o
produto. Não argumenta.

E a partir de amanhã ela recebe tráfego de campanha paga. Página que descreve
converte mal; página que argumenta converte.

---

## 2. O material novo — é isto que precisa entrar

Levantamento de 02/08, com pesquisa pública de concorrente feita no mesmo dia.
**Cada número abaixo é citável; nenhum é estimativa de marketing.**

### 2.1 A tese, e ela vira o novo herói

> **Todo mundo vende um pedaço. A Foocci faz os quatro conversarem — e por menos
> que a soma deles.**

Cardápio digital, PDV, atendimento por IA e CRM de fidelidade são **quatro
categorias separadas** no mercado brasileiro. Somando: **≈ R$ 700/mês** em quatro
contratos que não trocam dado. O Crescimento custa **R$ 429** — 39% menos, e é o
único em que o dado atravessa de um módulo ao outro.

### 2.2 A conta que fecha a venda

iFood 2026: **12% de comissão + 3,2% de taxa de pagamento = 15,2%** com entrega
própria; **≈ 26,5%** com a entrega deles.

| Fatura no iFood | Comissão/mês | Migrando 20% economiza | O plano se paga |
|---|---|---|---|
| R$ 20 mil | R$ 3.040 | R$ 608 – 1.060 | 3,4× a 5,9× |
| R$ 40 mil | R$ 6.080 | R$ 1.216 – 2.120 | 2,8× a 4,9× |
| R$ 80 mil | R$ 12.160 | R$ 2.432 – 4.240 | 5,7× a 9,9× |
| R$ 150 mil | R$ 22.800 | R$ 4.560 – 7.950 | 5,1× a 8,8× |

### 2.3 Os sete diferenciais, em ordem de força

1. **A IA é impedida de mentir** — verificador determinístico contra o cardápio +
   simulador noturno com clientes artificiais. *Ninguém no mercado publica como
   garante isso, porque a maioria não garante.* **É o argumento mais forte que
   existe, e é contraintuitivo: não é ter IA, é provar que ela não inventa.**
2. **O número não queima** — silêncio 21h–8h, teto diário, descanso por cliente,
   atraso aleatório, e livro imutável de quem já foi contatado. *É o medo nº 1 de
   quem já tentou WhatsApp, e quase ninguém o enfrenta.*
3. **Resgate antes de perder** — quente esfriando → morno → frio. *CRM comum faz
   reativação depois que o cliente já sumiu.*
4. **Preço por canal** — delivery, salão e iFood com preços próprios no mesmo prato.
5. **CMV com ficha técnica + reprecificação automática** — *vendido como produto
   separado por outras empresas.*
6. **A comanda não some** — 5 tentativas, impressão por estação, alarme que repete
   e não vira coro entre aparelhos.
7. **Os quatro num contrato, conversando.**

### 2.4 O que o mercado tem e nós não — e a resposta pronta

| Falta | Resposta |
|---|---|
| Integração com iFood | *"Nossa aposta é te tirar de lá, não integrar melhor."* Temos preço próprio para o canal iFood |
| Totem de autoatendimento | Não temos. Nosso salão é o QR na mesa |
| App de garçom | Não temos |
| Marca conhecida | Somos novos — por isso existe preço fundador e degustação |
| Equipe de suporte | Hoje é o fundador. Enquanto a base é pequena, **quem atende é quem construiu** |

---

## 3. O que fazer, passo a passo

> **Ordem obrigatória.** Cada passo depende do anterior. Não pule para o design
> antes de fechar o argumento — é assim que se produz site bonito que não vende.

### Passo 1 · Cortar a home de 12 seções para 7

Sua auditoria já apontou: 12 seções, 11 `h2`, 19 telas no celular. Landing B2B
converte entre 6 e 8.

**A nova estrutura, nesta ordem:**

| # | Seção | O que faz |
|---|---|---|
| 1 | **Herói com a tese** | "Todo mundo vende um pedaço…" + CTA de demonstração |
| 2 | **A calculadora de comissão** | Interativa. Ver passo 2 |
| 3 | **Os quatro contratos vs. um** | A ancoragem de R$ 700 vs R$ 429 |
| 4 | **Os três diferenciais que ninguém tem** | IA que não mente · número não queima · resgate antes de perder |
| 5 | **Como funciona, em 3 passos** | O que já existe, enxugado |
| 6 | **Planos** | A tabela nova. Ver passo 3 |
| 7 | **Prova + CTA final** | O que é honesto afirmar hoje |

**O que fundir ou cortar:** *"Por trás de cada experiência"* e *"Mais que
tecnologia"* dizem a mesma coisa com cards diferentes — vire uma. Blocos que
repetem a estrutura de cards brancos achatam a hierarquia; varie o tratamento ou
corte.

**Só está pronto quando:** a home cabe em **8 telas de rolagem no celular** ou
menos, medido com `document.documentElement.scrollHeight` em 375px.

### Passo 2 · A calculadora de comissão evitada

**É a peça de maior conversão do site inteiro.** Não é enfeite: é a conta da §2.2
virando interação.

- Entradas: **quanto fatura no iFood por mês** e **usa entrega própria ou do iFood**
- Saída, na hora: *"você paga R$ X de comissão por mês. Migrando 20% para o canal
  direto, economiza R$ Y — o plano Z se paga N vezes."*
- Termina em CTA de demonstração, com o valor calculado **levado para o formulário**

**Regras que não podem ser quebradas:**
- Percentuais **configuráveis em constante**, não espalhados. A taxa do iFood muda,
  e um número errado num site público é passivo.
- **Mostrar a fonte** do percentual. Guardrail 1: número sem origem é número
  inventado.
- Estados de carregando/vazio/erro do `DESIGN.md` §6.1 valem aqui também.

### Passo 3 · Publicar a tabela de preços

**Substitua a página `/site/precos` inteira** pela tabela comercial nova, que já
está pronta e revisada pelo CEO.

Cada plano abre por **"Só aqui você tem"** — o diferencial, não a lista. Depois a
conta de ROI daquele porte, depois o que ele substitui, e **só então** os recursos.

Junto vêm: os três ciclos (mensal / trimestral / anual com 2 meses grátis), a
degustação de primeiro mês pela metade, os add-ons e a regra de limite escrita em
linguagem de lojista.

> ⛔ **O único bloqueio real, e ele é seu para respeitar.**
> **O sistema não bloqueia por plano.** Enquanto isso for verdade, a página pode
> mostrar os planos e os preços, mas **a venda continua sendo 1:1 pelo CEO** — não
> pode existir cadastro self-service escolhendo faixa. Quem paga Performance
> descobriria que o Essencial entrega igual, e não reclama: só não renova.
>
> Se você julgar que publicar preço sem gating é risco alto demais, **escreva a
> objeção e escale** em `docs/perguntas-ao-diretor-geral.md` — não decida sozinho
> contra o pedido do CEO, e não publique em silêncio se discordar.

### Passo 4 · Espalhar os diferenciais pelo resto do site

`/site/como-funciona` e `/site/sobre` hoje descrevem. Passam a argumentar,
puxando da §2.3. **Um diferencial por bloco**, com o medo que ele resolve escrito
antes da solução.

### Passo 5 · Tom: agressivo e sofisticado, sem perder a essência

Pedido literal do CEO. A tradução prática:

**Agressivo é:**
- Número na cara: *"R$ 6.080 por mês de comissão"* em vez de *"economize com
  marketplace"*
- Comparação direta e verificável: quatro contratos vs. um
- Verbo no imperativo no CTA: *"Calcule quanto você paga de comissão"*

**Agressivo NÃO é:**
- Citar concorrente pelo nome numa comparação depreciativa — cria briga e passivo
- Promessa sem número atrás
- Urgência falsa (*"últimas vagas"*) quando não há vaga limitada de verdade

**Sofisticado, aqui, já está definido e é lei:** `DESIGN.md` — **90% neutro + 10%
laranja**, laranja como acento, pesos 400/600, `rounded-2xl` em card e `rounded-xl`
em botão. **Sofisticação vem de tipografia, espaço e ritmo — não de mais cor.**

**A essência que não se perde:** hospitalidade. O produto é sobre relacionamento;
a página não pode virar planilha. O número entra para provar, não para substituir
a história.

### Passo 6 · Verificar antes de mostrar

Não negociável, e é a regra que já está no `CLAUDE.md`:

- Screenshot em **375 / 768 / 1280**
- Autoavaliação **0 a 10** em hierarquia, tipografia, espaçamento e consistência —
  **8+ nos quatro** antes de apresentar ao CEO. Abaixo disso, itere sozinho
- `document.documentElement.scrollWidth` **exatamente igual à viewport** nos três
  tamanhos
- Os três estados obrigatórios na calculadora e no formulário
- `npx tsc --noEmit` limpo + `npx vitest run` verde
- `/api/health` com o `commitSha` do merge

> ⚠️ **Armadilha que você mesmo registrou:** detector ingênuo de "elemento mais
> largo que a viewport" acusa 5 falsos positivos — são decorações de fundo
> cortadas pelo pai. **O sinal que vale é o `scrollWidth` do documento.**

---

## 4. Material para a agência

O CEO vai entregar campanha para a agência a partir de amanhã. **Estes três blocos
são briefing pronto** — não reescreva, aponte:

1. **A conta de comissão evitada** (§2.2) — vira post de carrossel, anúncio e
   roteiro de vídeo. É o gancho de maior conversão que existe aqui.
2. **Os sete diferenciais** (§2.3) — sete peças, uma por diferencial, cada uma
   abrindo pelo **medo** e fechando na solução.
3. **Os quatro contratos vs. um** (§2.1) — comparação visual direta.

> **O que a agência NÃO pode prometer:** pedido completo por texto no WhatsApp
> (está em piloto) e "impressão 100% garantida" (a fila é boa, mas ninguém
> confirmou presencialmente o papel saindo). Guardrail 7.

---

## 5. Como saber que ficou bom

- Um dono de restaurante entra pelo celular, **calcula quanto paga de comissão em
  menos de um minuto**, e pede demonstração sem falar com ninguém.
- A home cabe em **8 telas** de rolagem no celular.
- Alguém que nunca viu o produto consegue dizer, depois de ler a home, **duas
  coisas que a Foocci tem e o concorrente não**.
- Nenhuma afirmação da página é indefensável numa reunião de venda.
- Nada em piloto foi vendido como pronto.
