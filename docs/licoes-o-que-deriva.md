# O que deriva — três lições do caso da marca no checkout (24/08/2026)

> Doutrina desta casa, nascida de um caso concreto: o CEO disse *"mudaram a
> logomarca"* e a investigação mostrou que **ninguém tinha mudado nada** — as
> telas nasceram sem o arquivo oficial, em 05/08, e ficaram 19 dias assim.
> O caso inteiro está em `docs/marca-no-checkout.md`.

---

## 1. Existe defeito que não quebra: ele DERIVA

Marca desenhada com texto e CSS (`f<span class="text-brand-500">oo</span>cci`) não
falha em teste nenhum, não gera erro, não aparece em log. Ela simplesmente **muda
sozinha** no dia em que alguém ajusta a tipografia, o peso da fonte ou a escala
`brand-*` — e o logotipo do dia seguinte é outro, sem que ninguém tenha decidido
isso.

É a mesma família do caminho fixo com versão embutida que congelou o deploy da
casa irmã por seis dias: **parece estável até o dia em que não é.**

**A regra:** o que representa a identidade da empresa — marca, cor, nome, número,
preço — vem de **uma fonte declarada** (arquivo, constante, tabela), nunca de uma
reprodução local. Reprodução local é uma cópia que ninguém sabe que existe, e
cópia que ninguém sabe que existe é a que sai do ar sem avisar.

**Como reconhecer:** se a resposta para *"o que acontece se alguém mudar a fonte
padrão?"* for *"aí muda também"*, é derivação, não implementação.

---

## 2. Dezenove dias no fluxo de pagamento não é azar — é ausência de régua

A imitação viveu quase três semanas exatamente nas telas em que o cliente vai
pagar, e **nenhuma pessoa viu**. Não adianta prometer atenção: quem escreve a
próxima tela também não vai ver.

**A régua que funciona é a que vale para o arquivo que ainda não existe.** O teste
que fechou este caso não confere as três telas conhecidas: ele **varre o `src`
inteiro** procurando o padrão, e por isso reprova numa tela que será criada daqui
a dois meses por alguém que nunca leu este documento.

**A regra:** conserto de caso concreto conserta um dia; teste de classe de defeito
conserta o ano. Quando corrigir uma imitação, **pergunte o que impede a próxima**
— e se a resposta for "a gente lembra", não impede nada. É o guardrail 4 da casa
aplicado à identidade: *prompt é aviso, código é trava.*

**A forma da régua** (decidida pelo Diretor Geral em 24/08/2026 — molde no kit,
implementação em cada produto, porque um varredor único envelheceria tentando
conhecer cinco repositórios):

  1. varre o repositório inteiro, não a lista de arquivos conhecidos;
  2. vale para o arquivo que ainda não existe;
  3. reprova contra o código de hoje — teste que passa dos dois lados não prova
     nada.

---

## 3. Imitação anda em bando — e olhe primeiro onde tem dinheiro

Não era uma tela: eram **três**, e as três eram do fluxo de contratação —
`/contratar/novo`, `/contratar/obrigado`, `/contratar/[token]`. Faz sentido: quem
cria um fluxo copia o cabeçalho da tela anterior, e a imitação viaja junto.

**A regra:** achou uma imitação, **procure as irmãs antes de comemorar o
conserto** — varredura no repositório inteiro, não só na tela reclamada. E comece
a procurar **onde tem dinheiro do outro lado**: no checkout, no pagamento, no
contrato. É lá que parecer outra empresa custa mais caro, e é lá que o cliente
está mais atento e menos disposto a perdoar.

---

## 4. A lição que sustenta as outras três: diagnostique antes de consertar

O pedido que chegou foi *"conserte a logo"*. Se eu tivesse consertado, teria
entregue a tela certa **e a conclusão errada** — "alguém trocou a marca" —, e a
próxima tela nasceria com o mesmo defeito.

`git log -S` custou dois minutos e mudou o caso inteiro: de *"achar quem trocou"*
para *"impedir a próxima tela de nascer errada"*. **São conclusões opostas, e só a
medição separava uma da outra.**

**A regra:** quando o relato for sobre algo que *mudou*, **confirme que mudou**
antes de procurar o culpado. Muita coisa que "mudou" sempre foi assim — e alguém
só reparou agora.

**Diagnóstico errado com sintoma resolvido é a pior combinação que existe:** some
a evidência e fica a crença. A tela ficaria certa e a casa acreditaria, para
sempre, que alguém trocou a marca um dia.

**A irmã deste engano, no mesmo dia:** um `HTTP 400` que *parecia* corpo
malformado e era **falta de saldo**. Mesmo formato — o sintoma sugerindo uma causa
plausível que não era a verdadeira. Causa plausível é o disfarce mais comum da
causa errada.
