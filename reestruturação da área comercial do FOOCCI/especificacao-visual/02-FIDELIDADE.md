# Auditoria de fidelidade — desenho × código (19/09/2026)

> Feita pelo agente de **interface** do Foocci, a pedido do Diretor Geral.
> Régua: `00-MOLDURA-COMUM.md`, `01-TELAS.md`, `MANIFESTO_IMAGENS.md`,
> `HISTORICO_INTEGRAL.md`, `DESIGN.md`, `.claude/agents/interface.md` e
> `.claude/agents/experiencia.md`.
>
> **Nenhuma linha de código de produto foi escrita.** Isto é medição.

---

## ⚠️ O limite honesto desta auditoria, dito antes de tudo

O `MANIFESTO_IMAGENS.md` inventaria **14 imagens** e aponta cada uma para um
arquivo `.webp` em `imagens/`. **Esses arquivos não existem no repositório.**
O que está commitado em `imagens/` é **uma** imagem:

- `ChatGPT Image 17_09_2026, 12_25_31 (2).png` — lida de verdade nesta sessão.
  É o **desenho nº 12, Central SDR / Gatekeeper**, e é a única tela cuja
  fidelidade pôde ser conferida **contra o pixel**. Todas as outras foram
  conferidas contra a *leitura literal* do Diretor Geral em `01-TELAS.md`.

Consequência, escrita e não escondida:

| Fonte usada para julgar | Telas |
|---|---|
| **A imagem de verdade** | 12 (Central SDR) |
| **Leitura literal em `01-TELAS.md`** | 05, 06, 07, 08, 09, 10, 11, 13, 14 |
| **Nada além do título no manifesto** — *depende de imagem não arquivada* | 01, 02, 03, 04 |

O `01-TELAS.md` documenta **10 das 14**. As telas **01, 02, 03 e 04** não têm
nem imagem nem leitura literal: para elas esta auditoria mede apenas se existe
um endereço com o propósito descrito no título, e **não** julga fidelidade
visual. Onde este documento diz *depende de imagem não arquivada*, é isso.

**Primeiro pedido, e é barato:** subir as 13 imagens que faltam em
`imagens/`. Sem elas, metade desta tabela é palavra do Diretor contra o
código, e o desenho do CEO — que é a régua — não está no repositório.

---

## 1. A moldura comum — a maior divergência da casa

`00-MOLDURA-COMUM.md` descreve uma moldura que **não é a que existe**. A tela
real mora em `src/app/comercial/(area)/layout.tsx` + `_pecas/MenuDaSala.tsx`.

| Elemento do desenho | Existe? | Onde / o que falta |
|---|---|---|
| Barra superior **escura** (~64px), azul-marinho | **Não** | `layout.tsx:95` — header é `bg-paper` claro, ~44px |
| Ícone + nome do produto + linha de apoio | **Parcial** | só "Comercial · Foocci", sem a linha de apoio |
| **Busca central larga com Ctrl+K** | **Não existe** | não há campo de busca global em lugar nenhum da área |
| Sino com contador de não lidas | **Não existe** | — |
| Bloco da pessoa (foto, nome, cargo, seta) | **Parcial** | só o nome (`sessao.nome`), sem foto, cargo nem menu |
| **Barra lateral esquerda ~230px**, item ativo em pílula | **Não** — virou **menu horizontal no topo** | `MenuDaSala.tsx` |
| Ordem dos 11 itens da lateral | **Quase** — 10 grupos, e a ordem bate | `rotas.ts:GRUPOS` — falta "Campanhas" |
| Cartão de plano no rodapé da lateral | **Não** | a adaptação **(a)** recomendada pela moldura (teto diário de mensagens, "de quantos eu podia, quantos mandei") **não foi feita** — e esse dado existe: `fila.tetoDoDia` / `usadosNaJanela` / `saldoDaJanela`, em `prospeccao/ProspeccaoClient.tsx` |
| Título de página + subtítulo de uma frase | **Sim**, nas telas novas | `Pecas.tsx:TituloDaPagina`, `Moldura.tsx:Cabecalho` |
| Seletor de **data** + seletor de **período/atualidade** | **Parcial e falso** | `TituloDaPagina` desenha os dois como **texto**, não como seletor: em `sdr`/`torre` o "Tempo real" é uma string fixa. Ver §4, item 3 |
| Fila de 5–6 cartões de indicador com ícone colorido | **Sim** | `FilaDeIndicadores` + `Indicador` |
| Variação ↑/↓ "vs. ontem" | **Parcial** | só a Torre compara janelas (`SecaoOntem`), e ela **não** desenha a seta; a regra de base zero está respeitada (`textoDaVariacao`) |
| Grade de 3 colunas, direita estreita reservada à IA | **Sim** | `Corpo` + `CartaoDeIA` — usado em sdr, torre, painel, qualificacao |
| Paleta via tokens semânticos | **Não** — ver §4, item 5 | telas novas trouxeram `slate-*`, `violet-*`, `emerald-*` por fora do kit |

**Veredito da moldura:** o **corpo** do desenho foi honrado (título, fila de
indicadores, três colunas, cartão de IA). O **cabeçalho e a lateral, que são o
que faz a tela "parecer o desenho", não foram feitos.** Como a moldura é
comum a 14 telas, esta é a correção com maior alcance por unidade de trabalho
de toda a lista.

---

## 2. Tabela tela-desenhada × tela-existente

Legenda: ✅ existe · 🟡 existe parcialmente · ❌ não existe

| # | Tela do desenho | Estado | Arquivo |
|---:|---|:--:|---|
| 01 | Fluxo completo de atendimento e vendas | — | **não é tela**: é o diagrama do fluxo. Vive em `HISTORICO_INTEGRAL.md`. Nada a construir. |
| 02 | Sala do Supervisor / Control Tower | 🟡 | `torre/TorreClient.tsx` |
| 03 | Central de Atendimento | 🟡 | `atendimento/CentralDeAtendimentoView.tsx` |
| 04 | Perfil do Lead / CRM 360 | 🟡 | `lead/[id]/Crm360View.tsx` |
| 05 | Atendimento com IA / Copiloto | 🟡 | `conversas/AtendimentoClient.tsx` + `PainelDoCopiloto.tsx` |
| 06 | Qualificação e Lead Score | 🟡 | `qualificacao/QualificacaoClient.tsx` |
| 07 | Motor de Decisão / Roteamento | 🟡 | `roteamento/RoteamentoClient.tsx` |
| 08 | Catálogo, Oferta e Checkout | 🟡 | `oferta/OfertaClient.tsx` |
| 09 | Follow-up Automático | 🟡 | `relacionamento/RelacionamentoClient.tsx` (aba 1) |
| 10 | Pós-venda e Relacionamento | 🟡 | `relacionamento/RelacionamentoClient.tsx` (aba 2) |
| 11 | CRM IA / Departamento de CRM | 🟡 | `crm/CrmClient.tsx` |
| 12 | Central SDR / Gatekeeper | 🟡 | `sdr/SdrClient.tsx` |
| 13 | Revenue Supervisor | 🟡 | `painel/SupervisorClient.tsx` (dentro de `/comercial/painel`) |
| 14 | Hunter IA / Inteligência Comercial | 🟡 | `prospeccao/ProspeccaoClient.tsx` |

**13 telas desenhadas, 13 com endereço de pé, 0 ausentes, 0 fiéis.**
O trabalho que falta **não é criar tela — é terminar tela.** Isso confirma a
leitura do CEO: *"não é mais coisas que a gente precisa, é um upgrade."*

### O que falta, uma a uma

#### 02 — Control Tower → `/comercial/torre` 🟡
*Depende de imagem não arquivada* para julgar layout. Contra o propósito do
título e o que `rotas.ts` promete, a tela entrega: "travado agora" (7 filas),
alertas com causa, funil, hoje×ontem, raio-X, Supervisora, carga do time.
Falta, medindo contra a moldura: cabeçalho/lateral (§1) e o seletor de data
real. **A tela é a mais bem construída da área** e serve de padrão para as
outras.

#### 03 — Central de Atendimento → `/comercial/atendimento` 🟡
*Depende de imagem não arquivada.* O endereço existe e responde à pergunta do
título ("quem espera, quem atende, qual a carga"). Três defeitos medidos:
- **Sem estado de carregando.** `CentralCarregando()` está **exportado e nunca
  é chamado** — a página é de servidor. Controle morto no arquivo.
- **Erro sem "Tentar de novo".** `CentralComErro` não tem botão de retomada,
  contra `DESIGN.md §6.1` e contra o `Erro` da própria `Moldura.tsx`, que tem.
- **"SLA estourado" sem a ressalva.** Ver §4, item 1 — é o pior achado desta
  auditoria.

#### 04 — Perfil do Lead / CRM 360 → `/comercial/lead/[id]` 🟡
*Depende de imagem não arquivada.* Existe, com contato, empresa, decisor e
porteiro, oportunidade, propostas, estado de follow-up e **linha do tempo** —
que é a peça central do desenho 10 e está aqui. Não julgo a hierarquia visual
sem a imagem.

#### 05 — Atendimento com IA / Copiloto → `/comercial/conversas` 🟡
O mais perto de pronto. Tem as três colunas, os balões, a coluna de IA com
resumo, necessidade/objeções, quem decide, o que o Hunter e o SDR acharam,
oportunidade, histórico, próxima ação, sugestões com **"Usar sugestão"** (que
preenche e **não** envia — conforme exigido, e com teste de contrato provando).
Falta, contra `01-TELAS.md`:
- **as abas `Todas 12 / Em atendimento 8 / Aguardando 3`** — a coluna de filas
  usa `NomeDaFila` sem contador visível no formato do desenho;
- **busca na coluna de conversas** — não há campo de busca;
- **"Intenção detectada com % de confiança"** — existe `leitura.confianca`, que
  é a confiança **do modelo sobre a própria leitura**, não sobre a intenção.
  O desenho pede outra coisa; hoje não temos;
- **"Oferta recomendada" + botão "Gerar oferta"** — não existe;
- **atalhos do rodapé**: existem "Registrar no CRM" e "Devolver para IA";
  **"Buscar no catálogo"** e **"Criar tarefa"** não existem;
- **cartões de produto e cartão de link de pagamento dentro da conversa** —
  não encontrados no render de mensagens.

#### 06 — Qualificação e Lead Score → `/comercial/qualificacao` 🟡
A adaptação pedida foi cumprida **exemplarmente**: nome do desenho ao lado do
nome do banco, os degraus extras desenhados, e "Ninguém pontuou" como quadro
próprio em vez de virar FRIO. Falta:
- **a tabela de leads** — o desenho tem a linha por lead (Origem, Produto,
  Necessidade, Urgência, Orçamento, Objeções, Stage, Ações, paginação). A tela
  atual é **só agregada**: termômetro, fatores e lacunas. **É a maior lacuna
  funcional da tela** — o desenho é uma mesa de trabalho e nós entregamos um
  relatório;
- Valor Potencial, Prob. de Compra e Objeções: **declarados ausentes na
  própria tela**, com o motivo. Correto — é a saída (2) da moldura;
- **rosca de distribuição** e **barras de conversão por score**: não existem;
- botão **Exportar**: não existe (é um ato; não desenhá-lo está certo).

#### 07 — Motor de Decisão → `/comercial/roteamento` 🟡
A separação "o que decide hoje" × "**previsto, não construído**" está feita, com
o endereço da função que executa cada regra. É exatamente o que a adaptação
pediu, e é o melhor exemplo de honestidade de capacidade da área. Falta:
- **o Preview em Tempo Real** — que `01-TELAS.md` chama de *"a peça mais valiosa
  e construível hoje"*. **Não existe nada dele**: nem exemplos, nem simulador,
  nem logs de decisão. É a lacuna nº 1 desta auditoria;
- o cartão "Motor ativo" com interruptor: há "Modo agora" em texto — e **não ter
  o interruptor está certo**, porque ligar/desligar daqui seria um ato;
- as abas SLA/Propriedade/Testes: viraram cartões empilhados.

#### 08 — Catálogo, Oferta e Checkout → `/comercial/oferta` 🟡
A adaptação grande (planos de assinatura no lugar de produto com estoque) foi
feita, e o fecho está documentado com o limite de desconto que o código impõe.
Falta:
- **a montagem da proposta** — o desenho tem carrinho, quantidade, cupom,
  subtotal, total e "Gerar link de pagamento". A tela é **só leitura** e diz
  isso com todas as letras. Está **coerente com a regra 3 da moldura** (ato que
  não existe não vira botão), mas significa que **o desenho 08 não tem
  equivalente funcional em lugar nenhum** — montar proposta hoje é na ficha do
  lead;
- migalha `Vendas › Nova Proposta`: não existe;
- "Status do Pagamento" em quatro passos: não existe.

#### 09 — Follow-up Automático → `/comercial/relacionamento` (aba 1) 🟡
Tem os 14 estados, a régua de tempo, as cadências com condição por passo e as
paradas. Falta:
- **o Construtor da Jornada** (canvas, blocos, setas, zoom, Salvar/Ativar) — não
  existe. **A tela também não diz que a edição visual não existe**, e
  `01-TELAS.md` manda dizer. Omissão de aviso, não mentira;
- **"Resultados desta automação"** (enviadas, respostas, recuperações, **vendas
  recuperadas em R$**): não existe;
- as três abas Modelos/Minhas/Logs: não existem.

#### 10 — Pós-venda → `/comercial/relacionamento` (aba 2) 🟡
Tem marcos, situações, risco de churn com sinais e pesos, e a régua. Falta:
- **a lista de clientes + a ficha do cliente + a linha do tempo** — a aba é
  agregada; a linha do tempo por cliente existe só para *lead*, em
  `lead/[id]`, não para *cliente*;
- **rosca de Saúde do Cliente 0–100**: não existe;
- NPS, tickets, produtos complementares: **corretamente ausentes**, e o
  documento já autorizou substituir por risco de churn — foi o que se fez.

#### 11 — CRM IA → `/comercial/crm` 🟡
Tem as 8 filas do plano do dia, os 14 estados, cadência e pós-venda. A regra
"plano não é execução" está cumprida e comentada. **Receita potencial é
declarada como piso** quando há item sem estimativa — exatamente o pedido.
Falta:
- **a tabela do plano do dia por contato** (Contato/Empresa, Segmento,
  **Próxima ação**, Canal, **Janela ideal**, **Potencial R$**, Status). Os itens
  estão no dado (`ItemDaFila` traz `nome`, `porque`, `valorPotencialCents`) e
  **a tela só mostra a contagem**. É a segunda maior lacuna: temos o dado e não
  desenhamos a linha;
- os 4 seletores (Segmento, Canal, Prioridade, Responsável): não existem;
- "Campanha recomendada", "Próximos disparos", "Ações automáticas com
  interruptores": não existem — e os interruptores **não devem** existir;
- "Automação em destaque" (jornada em blocos): não existe.

#### 12 — Central SDR → `/comercial/sdr` 🟡 — **medido contra a imagem**
Única tela conferida no pixel. O que **bate**: título, subtítulo (palavra por
palavra), 5 indicadores, a fila vertical com ícone+nome+número, "Tipo de
gatekeeper detectado", "Decisor encontrado", "Resumo da situação", a coluna
direita de copiloto.

O que **não bate**:
| Na imagem | No código |
|---|---|
| 4 colunas (Filas · Conversas · A conversa · Copiloto) | **2 colunas** (`Corpo` = corpo + lateral) |
| Coluna **Conversas SDR (98)** com avatar, prévia, hora, pílula de canal, pílula de estado, contador vermelho | **não existe** |
| **A conversa** (balões, campo de digitar, ✓✓) | **não existe** — correto: é ato, e a tela é só leitura |
| 4 botões de ação sob o campo | **não existem** — correto pela regra 3 |
| Respostas sugeridas com botão de copiar | **não existem** |
| **Checklist da descoberta (2/3)** com caixas | **não existe** |
| Indicadores: Prioridade alta · Gatekeepers ativos · Decisores encontrados · Reuniões agendadas · Follow-ups | **outros cinco**: Abordados · Responderam · Caíram em porteiro · Decisores capturados · Fila de reabordagem |
| Fila: Novos prospects · Gatekeeper · Falando com atendente · Decisor identificado · Abordagem comercial · Reunião · Sem contato | fila vem do serviço; `TINTA_DA_FILA` cobre os 7 e pinta o resto de cinza — **fiel em espírito** |
| Seta `›` à direita de cada balde, que abre a fila | desenhada com o ícone **`alvo`**, e **não navega** — ver §4, item 2 |
| Cabeçalho escuro, busca, sino, plano | ver §1 |

**Ausentes da coluna Conversas, a diferença é de natureza:** a imagem é uma
**mesa de trabalho**; o que construímos é um **painel**. Não é infidelidade de
pixel — é infidelidade de propósito, e é a que mais custa.

#### 13 — Revenue Supervisor → `/comercial/painel` 🟡
Tem Diagnóstico da IA, Principais gargalos, Ações recomendadas, Saúde da
operação, Funil de receita e **Eficiência por etapa com a coluna SLA tratada
como "não medido" e o motivo** — exatamente a adaptação pedida. Falta:
- **"Receita ao longo do mês"** (linha realizada × meta tracejada): **nenhuma
  ocorrência de receita/meta/previsão no arquivo**;
- **"Previsão e Meta"** com barra de % atingido: não existe;
- dos 8 indicadores do desenho, **Receita do mês**, **Reativações** e
  **Clientes em risco** não aparecem aqui (os dois últimos existem em
  `/comercial/crm` — ver §3);
- em `torre/SecaoOntem`, as barras passam `fracao={null}`: `Barra` então **omite
  a barra** e a seção vira lista de números. Honesto, mas o desenho pedia o
  gráfico.

#### 14 — Hunter IA → `/comercial/prospeccao` 🟡 — **a mais distante**
A adaptação maior (descoberta automática não existe) é verdadeira. Mas a tela
**não é a tela do desenho**: é a tela de **operação da base fria** (receber
lista, enriquecer, interruptor, fila automática, conferência, "Rodar agora").
Falta tudo que o desenho pede:
- 6 indicadores (Empresas encontradas, Enriquecidas, **ICP alto**, Decisores,
  Prontas para SDR, Novas hoje): **nenhum**;
- a tabela "Restaurantes prospectados" com **Fontes**, **Decisor**, **ICP**,
  **Prioridade**, **Status**: as colunas **ICP, Decisor e Prioridade não
  aparecem em nenhuma linha do arquivo** — e `EmpresaFatorIcp` **existe no
  schema** (`prisma/schema.prisma:8433`). Temos o dado e não o mostramos;
- os filtros (Estado, Cidade, Segmento, Fonte, Ticket) e a paginação;
- "Categorias com maior ICP", "Fila de enriquecimento", "Pipeline Hunter",
  "Sugestões da IA", "Fontes monitoradas";
- **e a tela não escreve "a descoberta automática não está ligada e falta X"**,
  que `01-TELAS.md` manda escrever com todas as letras.

---

## 3. Telas que existem e não estão em desenho nenhum

O CEO pediu **consolidação**. Estas 15 não têm desenho, e é aqui que o upgrade
tem folga para ganhar espaço sem criar tela nova.

| Endereço | O que é | Veredito |
|---|---|---|
| `/comercial` (Filas) | `SalaDeVendasClient.tsx` — coluna de filas + lista | **Fundir em `/comercial/conversas`.** As duas montam a mesma `ColunaDeFilas` sobre `NomeDaFila`; `conversas` já abre em `aguardandoHumano`. São a mesma tela com e sem a conversa ao lado. |
| `/comercial/carteira` | todos os leads numa tabela | **Fundir com a tabela por lead que falta em `/comercial/qualificacao` (06).** É o mesmo objeto; o desenho 06 pede exatamente esta tabela com colunas de score. |
| `/comercial/funil` | o funil desenhado | **Fundir em `/comercial/painel` (13).** O desenho 13 já tem "Funil de Receita", e `SupervisorClient` já o desenha. Duas telas para um funil. |
| `/comercial/atendimento` | Central de Atendimento (03) | **Candidata a fusão com `/comercial/torre` (02).** As 7 filas do "agora", a carga do time e a fila do SDR são **os mesmos números nas duas telas** — `torre` lê `painel.agora`, `atendimento` lê `c.filas`. A Torre ainda estampa a ressalva do prazo; a Central não. Ver §4, item 1. |
| `/comercial/painel` | Painel do gerente + Revenue Supervisor (13) | **Sobrepõe `/comercial/torre` no bloco "agora"** (os mesmos 7 campos). Manter uma das duas lentes, não as duas. |
| `/comercial/supervisora` | qualidade da conversa, 1088 linhas | **Manter**, mas o seu resumo já é repetido em `torre/SecaoSupervisora`. Nome colide com `painel/SupervisorClient.tsx` — dois "supervisores" diferentes. |
| `/comercial/meus-numeros` | os números da própria pessoa | **Manter.** Responde outra pergunta e a razão está escrita em `rotas.ts`. |
| `/comercial/base-fria` | estoque de contatos frios | **Fundir em `/comercial/prospeccao` (14).** A Prospecção **já desenha a Base fria dentro dela** (`<h2>Base fria</h2>`, linha 682). Tela duplicada de fato. |
| `/comercial/importacoes` | de que arquivo veio cada contato | **Manter como aba.** É a resposta de proveniência — e é defesa jurídica, não conveniência. |
| `/comercial/precos` | tabela de preços | **Fundir em `/comercial/oferta` (08)**, que já desenha "Os planos" a partir da mesma fonte única de preço. **Duas telas para a mesma tabela.** |
| `/comercial/oferta` aba "Catálogo" | os planos | idem acima — a fusão resolve as duas. |
| `/comercial/agentes` | fichas de função | **Manter** (Configurações). |
| `/comercial/agente` | o agente TA | **Manter** (Automações). |
| `/comercial/ensaio` | ensaio do TA, não envia | **Manter.** Mas **é a única tela da área sem estado de carregando** (0 ocorrências). |
| `/comercial/whatsapp` | conferência do canal, modelos | **Manter** (Configurações). |
| `/comercial/acessos` | criar acesso | **Manter**, fora da moldura, por construção. |

### E uma tela fora da área, que é o achado mais grave desta seção

**`/admin/foocci-crm` — "O CRM DA FOOCCI"** (`admin/(area)/foocci-crm/`).

Ela lê **`prisma.siteLead`**. A área comercial inteira lê **`Lead`** /
`Empresa` / `Contato`. São **duas bases de prospect da Foocci, em dois
endereços, com dois funis, sem ponte entre elas** — e `/admin/leads` ainda
redireciona para lá, o que mantém o endereço vivo em e-mails antigos.

Isto não é uma tela duplicada: é **um segundo CRM**. Enquanto existir, "quantos
prospects a Foocci tem" tem duas respostas certas e diferentes. **É decisão de
produto, não de interface** — sobe ao Diretor com a recomendação de unificar a
base, não as telas.

---

## 4. Onde a tela mente

Ordenado por dano, não por facilidade de conserto. Cada item traz a evidência.

### 1. ⛔ "SLA estourado: 0" na Central de Atendimento — número sem a ressalva

`atendimento/CentralDeAtendimentoView.tsx` desenha:

```tsx
<Cartao rotulo="SLA estourado" valor={String(c.filas.slaEstourado)} … />
```

A **mesma contagem**, na Torre, vem obrigatoriamente acompanhada de
`RESSALVA_DO_PRAZO` (`torre/TorreClient.tsx`), porque `slaVenceEm` **só passou a
ser gravado em 18/09/2026**: lead anterior não tem prazo e **não pode estourar**.

O resultado é o engano nº 2 da ficha do `experiencia` — *número em que não se
pode confiar*: um "0" que o gerente lê como "ninguém atrasado", quando a
verdade é "quase ninguém tem relógio". **Duas telas, o mesmo número, uma com
aviso e outra sem** — e a que não tem é justamente a que se abre no dia ruim.
Vale igual para "Follow-up vencido" e "Sem próxima ação".

**Conserto:** passar a ressalva para o `detalhe` do cartão, ou usar o
`Indicador` de `Pecas.tsx`, que já tem `rodape`.

### 2. A seta que não leva a lugar nenhum — Central SDR

`sdr/SdrClient.tsx`, fila do SDR:

```tsx
{/* A seta do desenho abre a fila. Enquanto a tela de trabalho daquele
    balde não existir, ela é só o sinal de direção — e não um botão… */}
<Icone nome="alvo" className="h-3.5 w-3.5 shrink-0 text-muted" />
```

Na imagem, a `›` **abre a fila**. Aqui ela é um ícone `alvo` cinza, à direita,
dentro de uma linha inteira que parece clicável. O comentário sabe do problema
e o resolve **por escrito**, não por mecanismo — é `prompt é aviso; código é
trava` ao contrário. Engano nº 1: *controle que não faz nada*. Um chevron que
não navega é pior que nenhum. **Ou vira link, ou sai.**

### 3. "Tempo real" é uma string, não um estado

`sdr` e `torre` passam `atualidade="Tempo real"` **fixo**, e o `periodo` é texto
formatado. Na moldura do desenho os dois são **seletores**. Hoje:
- não há como mudar a janela — o período é o que o serviço decidiu;
- "Tempo real" **não se apaga** se a leitura estiver velha (a busca roda uma vez
  no `useEffect`, sem repetição). Uma tela parada há uma hora continua dizendo
  "Tempo real" com a bolinha verde.

É um selo de frescor que nada sustenta.

### 4. `/comercial/precos` — nenhum dos três estados obrigatórios

281 linhas, **zero ocorrências** de carregando, vazio ou erro. Contra
`DESIGN.md §6.1`. Mesmo diagnóstico, mais brando, em `ensaio/EnsaioClient.tsx`
(sem "carregando").

E **"Tentar de novo" só existe em 3 das 20 telas** (`funil`, `supervisora`, e as
4 que usam `Moldura.tsx`). As demais — `carteira`, `meus-numeros`, `base-fria`,
`importacoes`, `agentes`, `agente`, `conversas`, `atendimento` — mostram o erro
e deixam a pessoa sem saída a não ser recarregar a página na mão.

### 5. Drift de cor **ampliado** pelas telas novas

`DESIGN.md §1` proíbe `gray-*` cru, `indigo/violet/purple` como ação, e manda
usar `ink/ink2/muted/line/line2` + `brand-*`. O drift #8 do `DESIGN.md` pede
migrar para o kit `@/components/ui`. As telas do desenho fizeram o contrário:
criaram um **segundo kit** (`_pecas/Pecas.tsx`, 540 linhas) que não importa
`@/components/ui`, e nele aparecem `slate-100`, `slate-500`, `violet-50`,
`violet-600`, `emerald-50`, `emerald-700`. O agente `interface` tem ordem
explícita — *"ao tocar numa tela, corrija o drift; nunca amplie"*. Foi ampliado.

Também: `MenuDaSala.tsx` usa `font-medium` na barra de abas — peso 500, **que
não está embarcado** (drift #9). A aba do menu renderiza em faux-bold.

### 6. Omissões de aviso que `01-TELAS.md` mandava escrever

Não são mentiras — são silêncios onde o documento pediu voz alta:
- **`/comercial/relacionamento`** não diz que **a edição visual da jornada não
  existe**. Quem abre vê 14 estados e conclui que o construtor está noutra aba.
- **`/comercial/prospeccao`** não diz que **a descoberta automática não está
  ligada, e o que falta**. É a "adaptação maior de todas" e ela não está na tela.

---

## 5. As três lacunas que mais doem

1. **A moldura do desenho não existe** — sem cabeçalho escuro, sem lateral, sem
   busca. É o que faz 14 telas "não parecerem o desenho" de uma vez só, e é a
   correção com maior alcance por hora de trabalho da lista inteira.
2. **Construímos painéis onde o desenho pedia mesas de trabalho.** SDR sem a
   coluna de conversas, Qualificação sem a tabela de leads, CRM IA sem a linha
   por contato, Hunter sem a tabela de empresas com ICP/Decisor/Prioridade.
   Em três desses quatro casos **o dado já existe** e só falta a linha.
3. **O Preview do Motor de Decisão não foi construído** — a própria leitura do
   CEO o chamou de *"a peça mais valiosa, e construível hoje"*. Sem ele,
   `/comercial/roteamento` é uma lista de regras que ninguém consegue conferir
   contra um lead real.

E uma quarta, que não é lacuna e sim risco em aberto: **dois CRMs de prospect
da Foocci em bases diferentes** (`siteLead` × `Lead`). Enquanto existirem, dois
números certos vão discordar.

---

## 6. O que NÃO deve ser "consertado"

Para o próximo que ler este documento não confundir ausência com defeito. As
ausências abaixo estão **certas** e seguem a regra 3 da moldura — *ato que não
existe não vira botão*:

- Os 4 botões de ação da Central SDR e o campo de digitar.
- "Gerar link de pagamento" e "Enviar proposta no WhatsApp" em `/comercial/oferta`.
- "Ativar automação" em `/comercial/relacionamento`.
- Os interruptores de "Ações automáticas" em `/comercial/crm`.
- O interruptor "Motor ativo" em `/comercial/roteamento`.
- Os interruptores das 6 regras "previstas, não construídas".
- NPS, tickets e produtos complementares no pós-venda.
- Valor Potencial, Probabilidade de Compra e Objeções por lead na Qualificação.

Em todos esses casos a tela **declara a ausência e o motivo**. É a doutrina
funcionando, não uma pendência.
