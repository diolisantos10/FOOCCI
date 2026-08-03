# Parecer — o CNPJ atual e o caminho para faturar o Foocci

> 03/08/2026 · Diretor Geral, a pedido do CEO ("jurídico é você").
> **Honestidade de escopo:** este parecer é a melhor análise técnica que consigo
> fazer, com fontes citadas — mas não sou advogado inscrito na OAB nem contador
> registrado. Para o contrato valer briga judicial e para o ato fiscal ser
> protocolado certo, uma revisão humana (advogado + contador) continua valendo o
> preço. Enquanto ela não acontece, isto aqui é muito melhor do que nada — que
> era o estado anterior.

---

## 1 · O que o documento e a Receita dizem

| Campo | Valor |
|---|---|
| Titular | Diego de Oliveira Santos · CPF 071.294.354-45 |
| CNPJ | **59.120.811/0001-79** · ATIVA · abertura 27/01/2025 |
| Enquadramento | **MEI** (Simples Nacional) |
| Endereço | Rua Itápolis 1167, Pacaembu, São Paulo/SP |
| **CNAE principal** | **4781-4/00 — Comércio varejista de artigos do VESTUÁRIO e acessórios** |
| CNAEs secundários | **nenhum** |

Fonte: CCMEI enviado pelo CEO + consulta pública à base da Receita (BrasilAPI)
em 03/08/2026.

## 2 · O problema, sem rodeio

**Este CNPJ, como está, vende roupa.** Ele não pode emitir nota fiscal de
licenciamento de software (Foocci) nem de serviços de marketing (agência):

1. **CNAE errado** — nota emitida em atividade não registrada é nota irregular;
2. **E não dá para simplesmente adicionar o CNAE certo**, porque
   **desenvolvimento e licenciamento de software NÃO estão na lista de
   atividades permitidas ao MEI** (2026). Existe projeto para incluir
   (PLP 25/2026), aprovado em comissão mas **não concluído** — hoje não vale.
3. **Teto do MEI: R$ 81.000/ano.** Mesmo que coubesse, a matemática estoura
   rápido: 10 clientes no Crescimento (R$ 429) = R$ 51,5 mil/ano só aí; somando
   Performance e agência, o teto cai no primeiro ano bom.

## 3 · O caminho recomendado

**Desenquadrar do MEI e virar ME no Simples Nacional** — de preferência como
**SLU (Sociedade Limitada Unipessoal)**: sócio único, sem exigência de capital
alto, e **separa o patrimônio pessoal do Diego do risco da empresa** (o MEI não
separa — hoje uma dívida da empresa alcança bens pessoais).

CNAEs a registrar (confirmar com o contador):

| CNAE | O quê | Para |
|---|---|---|
| **6203-1/00** | Licenciamento de programas de computador não customizáveis | **Foocci (SaaS) — principal** |
| 6202-3/00 | Desenvolvimento e licenciamento de programas customizáveis | projetos sob medida |
| 7319-0/99 ou 7311-4/00 | Publicidade / agenciamento | esteira de agência |

Efeitos práticos do desenquadramento: contabilidade obrigatória (contador
mensal, ~R$ 200–400), imposto pelo Simples anexo III ou V (fator R — com
pró-labore adequado, tende ao anexo III, ~6% na faixa inicial), e **NFS-e
emitida normalmente** — inclusive pela conta Focus NFe que o sistema já tem.

> ⚠️ **Prazo de efeito do desenquadramento** varia conforme o motivo (voluntário
> × exercício de atividade vedada) — é exatamente o tipo de detalhe para o
> contador protocolar certo. Não afirmo prazo aqui para não afirmar errado.

## 4 · O que fazer, em ordem

1. **CEO → contador** (esta semana): desenquadramento/transformação em SLU-ME,
   CNAEs da tabela, inscrição municipal em SP para NFS-e. É um serviço padrão.
2. **Enquanto isso, nada impede**: fechar clientes, colher aceite do contrato,
   ativar assinatura no Mercado Pago (o recebimento em si não depende do CNAE) —
   **a emissão da nota** é o que espera o registro certo. Faturar sem nota é
   decisão de risco do CEO; a recomendação é alinhar o registro antes do
   primeiro pagamento recorrente.
3. **Quando o CNPJ estiver ajustado**: cadastrar a empresa na conta-mãe Focus
   NFe e ligar a emissão automática (código pronto na OS do fluxo de compra).

## 5 · Adendo (03/08, mesma noite) — "não vendemos software, vendemos serviços digitais"

O CEO levantou a tese e pediu validação na lei. Validei procurando o ângulo a
favor. **A tese não se sustenta, por três motivos:**

1. **A lista do MEI é fechada e por ocupação, não por rótulo.** Não existe a
   categoria "serviços digitais" — existem ~470 ocupações nominais (Resolução
   CGSN 140/2018, Anexo XI). O que decide não é como chamamos a venda, é se a
   atividade **realmente exercida** corresponde a uma ocupação listada.
2. **O que o Foocci vende, para a lei tributária, tem nome:** acesso a programa
   de computador mediante assinatura = **licenciamento/cessão de uso de
   software** (LC 116, item 1.05). É assim que o fisco classifica SaaS,
   independentemente do nome comercial. Essa atividade **não está** na lista do
   MEI.
3. **Usar ocupação "parecida" é exatamente o cenário de autuação.** A
   orientação pública é expressa: cadastrar como digitador, técnico ou editor
   de listas para faturar o que na prática é software gera **desenquadramento
   de ofício retroativo, cobrança dos impostos como ME desde o início, com
   juros e multa**. Sairia mais caro que o contador.

E mesmo se coubesse: o CNAE atual é **vestuário** (teria que mudar de qualquer
jeito) e o teto de R$ 81 mil/ano seguiria estrangulando o crescimento no
primeiro ano bom. **A recomendação não muda: SLU-ME.** A notícia boa continua a
mesma — é um processo barato, padrão, e nada impede de vender enquanto corre.

Fontes do adendo:
[Company Hero — marketing/NF no MEI](https://www.companyhero.com/blog/marketing-nota-fiscal-mei),
[Instacont — ocupação para dev no MEI e o risco do "parecido"](https://instacont.com.br/qual-ocupacao-principal-colocar-no-mei-para-desenvolvedor-de-software/),
[Contabilizei — tabela oficial de atividades 2026](https://www.contabilizei.com.br/contabilidade-online/atividades-mei-tabela/),
[Contabilidade.com — digitador MEI e desenquadramento](https://contabilidade.com/blog/cnae-8219999-digitador-a-independente-pode-ser-mei-quanto-paga-e-quando-desenquadrar-do-mei/).

## 6 · DECISÃO DO CEO — 03/08, madrugada: lançar faturando no MEI

Ouvido o parecer (§2–§5), o CEO decidiu: **"vamos lançar no MEI como serviço"**.
É decisão de dono, informada, e fica registrada como tal — junto com o que a
torna operável e o risco que ela carrega.

**O que precisa acontecer para ser sequer possível** (hoje o cadastro é só
comércio de vestuário e o Emissor Nacional não oferece nota de serviço sem
ocupação de serviço):

1. No **Portal do Empreendedor** (gov.br/mei → Atualização Cadastral — grátis,
   na hora, sem contador): **adicionar ocupação(ões) secundária(s) de
   SERVIÇO** da lista permitida, escolhendo a que melhor descreva o trabalho
   real. A lista é pesquisável no próprio portal. Nenhuma descreve
   licenciamento de SaaS com exatidão — essa distância é exatamente o risco
   residual da decisão.
2. Emitir as notas no **Emissor Nacional de NFS-e** (gov.br) — manual, grátis.
3. No sistema: a fila de cobranças (`/admin/assinaturas`) é a lista de
   conferência; cada nota emitida à mão é registrada pelo botão **"marcar
   emitida (manual)"** com o link do PDF. A emissão automática via Focus segue
   desligada.

**O risco aceito, para constar:** faturar SaaS sob ocupação aproximada é
passível de desenquadramento de ofício retroativo com recálculo, juros e multa
(§5). Com faturamento inicial pequeno, a exposição financeira é pequena e
diminui a cada mês que a migração para SLU-ME avança. **A recomendação de
migrar para SLU-ME continua de pé e em paralelo** — esta decisão é sobre não
esperar a burocracia para começar a vender, não sobre ficar no MEI.

**Teto vigiado:** R$ 81 mil/ano somando TUDO que o CNPJ fatura. A carteira de
assinaturas dá o número do Foocci; o CEO soma o resto.

## 7 · Fontes

- CCMEI enviado pelo CEO (03/08/2026) e consulta pública Receita/BrasilAPI.
- Sobre software não caber no MEI e o PLP 25/2026:
  [Meu Contador Online](https://www.meucontadoronline.com.br/blog/desenvolvedor-de-software-pode-ser-mei/),
  [Contabilidade.com](https://contabilidade.com/blog/desenvolvedor-pode-ser-mei-em-2026-veja-como-abrir-cnpj-escolher-o-cnae-ideal-e-pagar-menos-impostos/),
  [Conta Junto](https://contajunto.com/desenvolvedor-pode-ser-mei-em-2026-entenda-qual-empresa-abrir/),
  [Econtrol](https://econtrolcontabilidade.com.br/desenvolvedor-de-software-pode-ser-mei-entenda-o-que-diz-a-legislacao-e-quais-alternativas-existem/).
