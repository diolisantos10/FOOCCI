# Os "dois CRMs de prospect" da Foocci — diagnóstico

> **Frente de DIAGNÓSTICO E PROPOSTA.** Nada foi migrado, apagado ou alterado.
> Nenhuma escrita mudou. Este arquivo é a única coisa que esta frente produziu.
>
> Medido em **19/09/2026**, na branch `claude/remove-legacy-runner-q8iXa`.
> Leitura de base: `docs/comercial/LEIA-ANTES-DE-TOCAR.md`, `.claude/agents/crm.md`,
> `.claude/agents/diretor.md`.
>
> ⚠️ Regra deste documento: o que não foi medido está escrito como **"não medido"**.
> Cada afirmação carrega arquivo e, quando a linha importa, a linha.

---

## 0. A primeira correção: a tabela `Lead` NÃO EXISTE

O achado que motivou esta frente dizia: *"`/admin/foocci-crm` lê a tabela
`siteLead`; a área comercial nova lê a tabela `Lead`. Bases separadas, sem ponte."*

**Metade disso é falsa, e é a metade que muda a recomendação inteira.**

Medido:

```
grep -n "^model Lead " prisma/schema.prisma     → nenhuma linha
grep -rn "prisma\.lead\."  src/                  → nenhuma ocorrência
```

Não existe model `Lead` no schema. Não existe uma única chamada `prisma.lead.*`
no repositório. O que existe são models com o **prefixo** `Lead`
(`LeadMensagem`, `LeadProposta`, `LeadHandoff`, `LeadTarefa`…), e todos eles são
**filhos** de `SiteLead` por chave estrangeira — não bases paralelas.

E o outro lado, medido linha a linha:

| Área | Arquivo | Tabela que ele toca |
|---|---|---|
| `/admin/foocci-crm` | `src/services/foocci-crm/FoocciCrmService.ts:71, :131, :170, :232` | `siteLead`, `siteLeadInteraction` |
| `/admin/foocci-crm` (painel) | `src/services/foocci-crm/FoocciCrmPerformanceService.ts:114, :125, :128` | `siteLead` |
| `/comercial` (área nova) | `src/services/salaDeVendas/**` — 30 `db.siteLead.updateMany`, 15 `db.siteLead.update`, 10 `db.siteLead.create` | `siteLead` |

**As duas telas leem e escrevem A MESMA TABELA.** Não há duas bases, não há ponte
a construir, não há migração a fazer. `/admin/foocci-crm` não é um CRM
concorrente: é uma **tela mais velha sobre a mesma tabela**, e `/admin/leads`
(`src/app/admin/(area)/leads/page.tsx:15`) até redireciona para ela.

**Isso não anula o problema do CEO — só muda onde ele mora.** A pergunta "quantos
prospects nós temos" realmente tem duas respostas certas e diferentes. A causa não
é duas bases: é **duas réguas sobre uma base só**, e é um defeito pior, porque
nenhum dos dois lados tem como perceber que está respondendo outra pergunta.

---

## 1. O mapa dos dois — o que cada um é de fato

### 1.1 `/admin/foocci-crm` — a tela da BASE INTEIRA

| | |
|---|---|
| **Tela** | `src/app/admin/(area)/foocci-crm/page.tsx` + `FoocciCrmClient.tsx` |
| **API** | `src/app/api/admin/foocci-crm/contatos/**`, `/performance` |
| **Serviço** | `src/services/foocci-crm/FoocciCrmService.ts`, `FoocciCrmPerformanceService.ts` |
| **Quem escreve** | `moverEtapa` (`:71`), `registrarInteracao` (`:131`), `excluirContato` (`:170`) |
| **Quem lê** | `listarContatos` (`:232`), `getPerformance` (`PerformanceService:105`) |
| **Filtro padrão da lista** | `const where = {}` — **vazio**. Etapa, "não abordados", busca e data são todos opcionais (`:233-256`) |
| **Número que ela mostra** | `prisma.siteLead.count()` **sem nenhum `where`** (`PerformanceService:128`) |

**A régua dela é: prospect = toda linha de `SiteLead`.** Inclusive os milhares de
contatos de lista fria que nós fomos caçar na internet e com quem ninguém nunca
trocou uma palavra.

### 1.2 `/comercial` — a sala de vendas, a tela do TRABALHO

| | |
|---|---|
| **Telas** | `src/app/comercial/(area)/**`, roteadas por `src/lib/sala/rotas.ts:37` |
| **Serviços** | `src/services/salaDeVendas/**` (≈65 mil linhas) |
| **Quem escreve** | `conversa.ts`, `abordar.ts`, `responsavel.ts`, `distribuicao.ts`, `funil.ts`, `jornadaComercial.ts` — todos sobre `siteLead` |
| **Régua das filas** | `filas.ts:145` · `const TEM_CONVERSA = { mensagens: { some: {} } }` — entra no `AND` de **toda** fila |
| **Régua do painel** | `painel.ts:83` · conta com `where: { atendidoPor: "NINGUEM", stage: { notIn: ["GANHO","PERDIDO","NUTRICAO"] } }` |

**A régua dela é: prospect = quem tem conversa aberta comigo.** E o comentário em
`filas.ts:136-143` registra exatamente por que ela passou a ser assim:

> *"Medido em 18/09/2026: as 3.700 mensagens foram apagadas, e a tela continuou
> mostrando 7.638 linhas. Não eram conversas — eram `SiteLead` da base fria."*

### 1.3 O que um sabe que o outro não sabe

Como a tabela é a mesma, **nenhum dos dois sabe um dado que o outro não tenha**.
A diferença é inteiramente de **recorte e de escrita**:

| | `/admin/foocci-crm` | `/comercial` |
|---|---|---|
| Vê contato de lista fria sem mensagem | **Sim** | **Não** (`TEM_CONVERSA`) |
| Vê a conversa de WhatsApp (`LeadMensagem`) | **Não** | Sim |
| Move etapa do funil | Sim (`moverEtapa:71`) | Sim (`funil.ts`) |
| Escreve `lastContactedAt` | Sim (`registrarInteracao:152`) | Sim (`conversa.ts`) |
| Tem RBAC por vendedor | **Não** — enxerga tudo | Sim (`filas.ts:111` `escopoDaConsulta`) |
| **Apaga contato em definitivo** | **Sim** (`excluirContato:170`, `prisma.siteLead.delete`) | Não |
| Aplica a distinção frio × lead do CEO | **Não** | **Também não** (ver §4.2) |

⛔ **O item que pesa mais desta tabela:** `/admin/foocci-crm` tem um botão que
**apaga `SiteLead` em cascata** — e o cascade leva junto `SiteLeadInteraction`,
`LeadMensagem`, `LeadProposta`, `LeadHandoff`, toda a família. É a única tela da
casa com esse poder, e ela não tem RBAC por vendedor. Não medido: se a tela expõe
esse botão para todo perfil de admin ou só para alguns.

### 1.4 Campo a campo — o que importaria importar

**Nada.** Não existe campo em uma base que falte na outra, porque a base é a
mesma. A coluna que as duas telas discordam não é um campo: é a **cláusula
`where`**.

---

## 2. A sobreposição real e a chave para casar

**A sobreposição é de 100%.** Não é estimativa: é a mesma linha da mesma tabela
`site_leads`, lida por dois caminhos. Um contato movido de etapa em
`/admin/foocci-crm` aparece movido em `/comercial` no mesmo segundo.

**A chave existe e é o `id` (cuid) da própria linha.** Não é preciso casar por
telefone, CNPJ ou domínio — não há o que casar.

Para o caso de alguém precisar casar `SiteLead` com o mundo externo (planilha,
Meta Ads), a chave humana é **`SiteLead.whatsappDigits`** — só dígitos, com DDI 55,
normalizado por `src/services/foocci-crm/leadOrigin.ts` · `normalizaWhatsapp`, com
índice em `schema.prisma`. E o schema é explícito sobre por que ela **não** é
única:

> *"Índice (não único) de propósito: uma restrição de unicidade poderia FAZER UM
> LEAD SE PERDER numa corrida de dois envios simultâneos, e perder lead é pior
> que duplicar."*

⚠️ **Consequência honesta:** a casa aceita, por decisão de projeto, que o mesmo
telefone apareça em mais de uma linha de `SiteLead`. **Não medido: quantos
telefones duplicados existem hoje em produção.** Isso é medível com uma consulta
de leitura pura e vale a pena antes de qualquer decisão de higiene de base — mas é
um problema de **duplicata dentro de uma base**, não de duas bases.

CNPJ e domínio **não servem** como chave de `SiteLead`: nenhum dos dois existe
nesse model.

---

## 3. A OUTRA dualidade — a que é real, e é de conceito, não de base

Enquanto `/admin/foocci-crm` × `/comercial` são duas telas sobre uma tabela,
existe **um segundo modelo de prospect que é mesmo separado**, e é ele que merece
a pergunta do CEO:

| | `SiteLead` | `Empresa` / `Contato` / `Oportunidade` |
|---|---|---|
| **Nasceu em** | migração `20260801120000_site_lead` | migração `20260917120000_jornada_comercial_empresa_ate_cliente` |
| **Idade** | ~7 semanas | **2 dias** |
| **Unidade** | uma **pessoa** e a conversa com ela | a **empresa**, seus contatos e o **negócio** |
| **Quem escreve** | tudo em `salaDeVendas/**`, `foocci-crm/**`, `site/SiteLeadService.ts`, `meta-leads/**` | **um arquivo só**: `salaDeVendas/jornadaComercial.ts:385, :471, :548, :598, :683, :697, :923, :1010, :1084` |
| **Quem lê nas telas** | todas as telas de `/comercial` e `/admin/foocci-crm` | `crm360.ts`, `copilotoNoCrm.ts`, `propostas.ts`, `checkoutDaProposta.ts` |
| **Está sendo alimentado hoje?** | **Sim, por cron** (`comercial-recepcao.yml`, `prospeccao-rodada.yml`) | **Só de carona**: `importarMetaLead.ts:53`, `ta/atender.ts:83` e `prospeccao/empresaDoLead.ts` chamam `jornadaComercial`; nenhum cron escreve `Empresa` diretamente |

**A ponte entre os dois JÁ EXISTE e é uma chave estrangeira**, não um `match` por
telefone. Em `SiteLead`:

```
empresaId String?   → Empresa   (onDelete: SetNull)  @@index([empresaId])
contatoId String?   → Contato   (onDelete: SetNull)  @@index([contatoId])
```

E a `Empresa` tem `leads SiteLead[]` de volta. O schema explica por que os dois
ponteiros são opcionais, e a explicação é boa:

> *"A maioria dos leads NÃO tem empresa descoberta: quem chega pelo Meta Ads, pelo
> formulário do site ou escrevendo no WhatsApp é uma pessoa. (…) Torná-los
> obrigatórios pararia a captação viva no mesmo dia."*

`Empresa` também tem `chaveDeDedupe String @unique` (nome+cidade+estado
normalizados, `jornadaComercial.chaveDeDedupeDaEmpresa`) e `Contato` tem
`@@unique([empresaId, telefoneDigits])` — **no MESMO formato de
`SiteLead.whatsappDigits`**, e o schema diz que é de propósito: *"é por ele que o
serviço reconhece que este contato já virou lead."*

**Não medido: quantas linhas de `Empresa` e `Oportunidade` existem em produção.**
Pelo código, a expectativa é "poucas" — o model tem 2 dias e um único escritor.

---

## 4. A recomendação — uma, escolhida

### 4.1 `SiteLead` é a fonte única de prospect, e já é. Não migrar nada.

**Não existe unificação de base a fazer.** A unificação já está feita desde
01/08/2026; o que falta é **uma régua única e um nome único na tela**.

Concretamente, a recomendação tem três partes, nesta ordem de prioridade:

1. **`/admin/foocci-crm` deixa de ser um CRM e vira o que já é: a tela de
   administração da base.** Uma tela só de gestão de base — busca, ficha, LGPD,
   exclusão — sem funil, sem número de topo, sem a palavra "CRM". Quem opera
   vendas trabalha em `/comercial`, e só lá. Duas telas de funil sobre a mesma
   tabela é o que produz as duas respostas.

2. **A régua "o que conta como prospect" passa a existir em UM arquivo, e é a do
   CEO — `frioOuLead.ts` · `ehLead()`.** Ela já está escrita, já está testada
   (`consciencia-do-frio.test.ts`) e responde exatamente à ordem de 17/09/2026:
   *"A lista fria não é lead. Ela só é lead quando se interessa sobre o produto."*
   O defeito medido é que **nenhuma tela de contagem a chama** (§4.2).

3. **`Empresa`/`Oportunidade` continuam separados de `SiteLead`, com nomes
   diferentes na tela — e isso é a resposta certa, não um adiamento.** São contas
   diferentes, e o próprio schema já argumenta melhor do que eu conseguiria:

   > *"O funil do lead responde 'em que pé está a CONVERSA com esta pessoa'. A
   > oportunidade responde 'quanto vale este NEGÓCIO e o que falta para fechar'. A
   > mesma empresa pode ter duas oportunidades (…) e um funil por pessoa nunca
   > soube contar isso."*

   Fundir os dois destruiria a única estrutura da casa capaz de responder "quanto
   vale o pipeline". Devem aparecer na tela como **"Contatos"** (pessoas) e
   **"Negócios"** (oportunidades) — nunca os dois como "leads".

### 4.2 ⛔ O defeito de verdade, medido

```
grep -rn "ehLead\|veioDeListaFria" src/ --include=*.ts | grep -v test
```

devolve seis arquivos, e **nenhum deles é uma tela de listagem ou de contagem**:
`importarMetaLead.ts:293`, `ta/atender.ts:480`, `jornadaComercial.ts:845`,
`reabordagem/rota.ts:224`, `empresaDoLead.ts:367`, `abordar.ts:631`.

**Efeito:** a distinção que o CEO mandou deixar *"cristalina em todos os cantos do
departamento comercial"* governa quem **recebe mensagem**, e não governa **nenhum
número que ele lê**. `/admin/foocci-crm` mostra `siteLead.count()` cru;
`/comercial` mostra o que tem mensagem. Nenhum dos dois mostra "quantos leads".

É a mesma classe de defeito que o `CLAUDE.md` da Control Room nomeia: **régua
verde sobre o componente errado**. As duas telas estão certas sobre a pergunta que
cada uma responde, e as duas estão erradas sobre a pergunta que o CEO faz.

---

## 5. Custo e risco — em linguagem de negócio

**O custo de migração é ZERO, porque não há migração.** Nenhum dado se move,
nenhuma tabela morre, nada é irreversível. O que a recomendação custa é trabalho
de tela e de texto. Isso é a boa notícia deste relatório.

**O que o CEO deixa de ver:** se `/admin/foocci-crm` perder o painel de funil, ele
perde a visão "base inteira, incluindo lista fria" naquele endereço. **Mitigação
obrigatória:** esse número não pode desaparecer — ele vira uma linha explícita na
tela, com o nome certo ("Base total, inclui lista fria: N"). Número que some é
número que alguém vai recriar errado em outro canto.

**O que pode ser perdido:** nada de dado. Mas existe um risco de **hábito**: se
alguém do time trabalha o funil por `/admin/foocci-crm`, tirar o funil de lá
interrompe o fluxo dessa pessoa. **Não medido: quem usa `/admin/foocci-crm` hoje e
com que frequência.** Isso se pergunta, não se deduz.

**O que é irreversível:** um item só, e ele já existe hoje, antes de qualquer
mudança — `excluirContato` (`FoocciCrmService.ts:170`) apaga `SiteLead` com
cascata sobre toda a família de tabelas filhas. É o único ato desta frente que não
tem volta, e ele fica **exatamente onde está** na recomendação: na tela de
administração da base, que é o lugar certo para o direito de eliminação da LGPD.

**O risco de NÃO fazer nada:** é o que o CEO já nomeou. Dois números, os dois
certos, nenhum deles respondendo à pergunta dele. O dono decide sobre o errado
porque nenhum dos dois é o número que ele pensa estar lendo.

---

## 6. O passo reversível de amanhã — sem decisão do CEO

**Toda tela que mostra um número de prospect passa a dizer, na própria linha, qual
régua usou.** Texto, não migração. Reversível com um `git revert`.

| Tela | Hoje mostra | Passa a mostrar |
|---|---|---|
| `/admin/foocci-crm` (topo) | `1.234` | `1.234 contatos na base — inclui lista fria e quem nunca respondeu` |
| `/comercial` (filas) | `312` | `312 com conversa aberta — não inclui a base fria` |
| `/comercial/base-fria` | `N` | `N na lista fria — ainda não são leads` |

Três strings. Nenhuma consulta muda, nenhum dado se move, nenhuma etapa se altera.

**Por que isso já para o sangramento:** o dano não é ter dois números — é os dois
se apresentarem como a mesma coisa. Rótulo honesto transforma "duas verdades" em
"duas perguntas", e aí o CEO decide qual delas ele quer.

**Complemento de leitura pura, também sem decisão:** rodar a contagem por
`ehLead()` e por telefone duplicado, para o relatório deixar de ter "não medido"
nos dois pontos onde ele tem. É `SELECT` — não escreve nada.

---

## 7. O que ficou como "não medido"

1. Quantas linhas de `Empresa`, `Contato` e `Oportunidade` existem em produção.
2. Quantos telefones (`whatsappDigits`) aparecem em mais de uma linha de `SiteLead`.
3. Quantos `SiteLead` passam por `ehLead() = true` hoje — o número que o CEO pede.
4. Quem usa `/admin/foocci-crm` hoje, e se o botão de exclusão está exposto a todo
   perfil de admin.

Nenhum dos quatro exige escrita. Os três primeiros são consulta; o quarto é
pergunta ao CEO.
