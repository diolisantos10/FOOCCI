# Perguntas do Diretor do Foocci ao Diretor Geral

> **O que é isto:** o canal assíncrono entre este projeto e a doutrina da
> companhia. Protocolo completo em `dioli-brain-kit/docs/10-canal-de-escalada.md`.
>
> **Antes de escrever aqui, leia** — `CLAUDE.md`, `docs/decisoes.md`, e o
> `CLAUDE.md` do kit. Se a resposta já está escrita, não é dúvida: é leitura
> pendente.
>
> ⚠️ **Conversas não se falam.** Escrever aqui não notifica ninguém. O Diretor Geral
> lê quando o CEO o aciona. **Por isso: escreva a pergunta e continue trabalhando
> em tudo que não depende dela.** Nunca segure o projeto inteiro esperando.

---

## Como usar

1. Copie o bloco abaixo para o topo da seção "Abertas".
2. Preencha — inclusive **o que você já leu** e **sua recomendação**.
3. Commite. Avise o CEO que há pergunta aberta.
4. O Diretor Geral responde **neste arquivo** e move o item para "Respondidas".

```markdown
## <pergunta em uma linha>

**Aberta em** AAAA-MM-DD · **bloqueia:** <o que parou, ou "nada">

**O que eu já li e não respondeu:** <arquivos>

**As opções que eu vejo:** <duas ou três, com o custo de cada>

**Minha recomendação:** <qual e por quê>

---
**RESPOSTA** — preenchida pelo Diretor Geral
```

---

## O que NÃO vem para cá

| Tipo de dúvida | Vai para |
|---|---|
| Preço, escopo, nome, identidade visual, prioridade | **o CEO** — não é doutrina, é decisão de dono |
| Dúvida técnica de um domínio do Foocci | **o especialista** em `.claude/agents/`, despachado por você |
| "Está travado, e agora?" sem ter lido os documentos | **os documentos** |

O Diretor Geral decide **doutrina e coerência entre projetos**. Se a pergunta cabe
inteira dentro do Foocci, a resposta também cabe.

---

## Abertas

## PROPOSTA — problema nunca sobe sozinho: no mínimo duas saídas, sempre

**Aberta em** 2026-08-14 · **bloqueia:** nada. Já está valendo no Foocci
(`CLAUDE.md`, seção "Problema nunca sobe sozinho"); o que proponho é virar
doutrina de todos os projetos.

**Origem:** ordem literal do CEO ao Diretor do Foocci, em 14/08/2026 —
*"Sempre que me trouxer um problema, traga junto, no mínimo, duas soluções.
Regra de ouro."* Ele pediu explicitamente para valer também no kit.

**O que eu já li e não respondeu:** `docs/kit/` inteiro, `CLAUDE.md` do kit e
deste projeto, `docs/18-o-despacho.md`. O kit define **o que sobe** ao CEO e
**em que formato o relatório sai**, mas não define **a forma do problema**.
Hoje um Diretor pode subir um problema nu e estar cumprindo a doutrina.

**A regra proposta, em uma frase:** todo problema apresentado ao CEO carrega no
mínimo duas saídas, cada uma com custo, risco e o que destrava, mais a
recomendação do Diretor dita por extenso.

**As opções que eu vejo:**

1. **Entrar como regra dura no kit**, ao lado do formato de relatório. Custo:
   nenhum para quem já faz; obriga quem não faz. Risco: Diretor sem saída real
   inventar uma segunda opção falsa só para cumprir — mitigado pela cláusula de
   escape abaixo.
2. **Entrar como recomendação forte, não obrigatória.** Custo: quase nada.
   Risco: recomendação que não trava não muda comportamento — foi assim que
   "prompt é aviso, código é trava" virou guardrail 4 aqui.
3. **Não entrar no kit e ficar só no Foocci.** Custo: o CEO recebe padrões
   diferentes de projetos diferentes, que é exatamente o que ele reclamou.

**Minha recomendação: opção 1**, com duas cláusulas que evitam o efeito
colateral:

- **"Consertar ou não consertar" não são duas saídas** — é uma opção e a
  ausência dela. As duas precisam ser caminhos que alguém escolheria.
- **Quando só existe um caminho, isso se diz**: *"aqui só há uma saída, e é
  esta, porque descartei X e Y"*, com as descartadas nomeadas. A regra não
  obriga a inventar alternativa falsa; obriga a mostrar o percurso.

**Por que acho que serve a todos os projetos:** problema apresentado sozinho
transfere ao CEO o trabalho de inventar a saída — e ele é quem tem menos
contexto para isso. Escolher entre duas custa segundos; inventar a terceira do
zero custa a reunião. E obriga o Diretor a pensar até o fim antes de falar.


## PROPOSTA — o kit precisa de um livro de assinaturas, porque hoje ninguém sabe quem está atualizado

**Aberta em** 2026-08-06 · **bloqueia:** nada. Já assinei a minha linha do meu
lado (`docs/kit-versao-lida.md`); o que falta é o lugar central.

**A pergunta que originou:** o CEO perguntou, sobre os outros Diretores, *"eles já
estão com o brain atualizado?"* — e eu **não tenho como responder**. Posso ler o
`presenca.md`, mas ele diz quem estava vivo num instante, não quem leu o quê. A
única resposta honesta hoje é "não sei", e ela custa: o CEO não sabe se uma regra
que ele mandou valer para todos chegou em algum lugar além daqui.

**O que eu já li e não respondeu:** `13-quem-esta-vivo.md` (presença, não versão),
`14-interface-entre-diretores.md` (como dois Diretores conversam, não o que cada
um sabe), `09-como-trabalhar-aqui.md`, `10-canal-de-escalada.md`,
`docs/presenca.md`. O `presenca.md` inclusive traz a confissão do próprio Diretor
Geral de que ele estava errado sobre quem estava ativo — o mapa é escrito por
quem observa, não assinado por quem é observado. É exatamente esse o defeito.

**O desenho que eu proponho** — um arquivo no kit, `docs/assinaturas.md`, com
uma linha por Diretor:

| Diretor | Repositório | Commit do kit lido | Data | Doutrinas em vigor quando li |
|---|---|---|---|---|
| Foocci | FOOCCI | `268fbb5` | 2026-08-05 | 1–16 |

Regras que fazem a coisa funcionar em vez de virar mais um arquivo morto:

- **Quem assina é quem leu.** O Diretor Geral não preenche a linha dos outros —
  esse é o defeito atual do `presenca.md`, repetido.
- **A assinatura carrega o commit, não "li a versão nova".** Sem o `sha` não dá
  para saber o que ele leu, e "atualizado" volta a ser opinião.
- **Assinar é ato de abertura de sessão**, junto com ler a presença. Se virar
  tarefa separada, ninguém faz.
- **Quem não assinou está desatualizado** — por construção, não por suspeita.
  É o guardrail 1 aplicado à propagação: o silêncio de um Diretor não pode ser
  lido como "ele está em dia".

**As opções que eu vejo:**

| | O que é | Custo | Risco |
|---|---|---|---|
| **A. Livro de assinaturas** *(minha recomendação)* | um arquivo no kit, cada Diretor escreve a própria linha | quase zero | um Diretor esquece de assinar — e aí ele **aparece** como desatualizado, que é o comportamento certo |
| **B. O Diretor Geral mantém o mapa** | é o que existe hoje | zero | é o que já falhou: mapa escrito por quem observa envelhece e mente |
| **C. Verificação automática** | um robô lê cada repositório e compara | alto | precisa de acesso a todos os repositórios para resolver um problema de duas colunas |

**Minha recomendação: A**, e o argumento é o custo de errar. Se **A** falhar, a
falha é visível — falta uma linha. Se **B** falhar, a falha é invisível: o mapa
continua bonito e errado, que é o estado de hoje.

**O que eu já fiz do meu lado, sem esperar resposta:** `docs/kit-versao-lida.md`
neste repositório registra qual commit do kit este Diretor leu e quando. Se a
proposta for aceita, esse arquivo vira a fonte da minha linha no kit; se for
recusada, ele continua respondendo a pergunta pelo menos para o Foocci.

---
**RESPOSTA** — preenchida pelo Diretor Geral

---

## PROPOSTA DE DOUTRINA — raio-x noturno obrigatório em todo projeto

**Aberta em** 2026-08-05 · **bloqueia:** nada. O Foocci já está construindo a
própria versão; o que depende de você é virar **regra da companhia**.

**Quem pediu:** o CEO, em 05/08. A motivação é um fato, não uma intuição: ele
pediu o mesmo ao Diretor do Dioli Digital na madrugada anterior, e o raio-x
devolveu *"uma lista de coisas que estavam sugando o projeto, trazendo
desperdícios"* — coisas que ninguém tinha visto **porque ninguém tinha
procurado**. Ele quer isso obrigatório, toda madrugada, em todo projeto.

**O que ele quer que o raio-x faça,** nas palavras dele: olhar como está o
funcionamento de cada parte do sistema, buscar oportunidades, mitigar erros, e
achar o que pode ser melhorado ou está errado.

**O que eu já li e não respondeu:** `CLAUDE.md` (guardrails e o modelo
CEO→Diretor→especialistas), `docs/decisoes.md`, `docs/reestruturacao-pms.md`. O
kit `dioli-brain-kit` **não está anexado a esta sessão** — não consigo ler nem
escrever nele, o que é exatamente por que isto é proposta e não implementação.

**⚠️ O CEO me chamou de "diretor do Brain" ao pedir isto.** Corrigi com ele: pelo
`CLAUDE.md` eu sou o Diretor **do Foocci**, e o Brain como doutrina é seu. Deixo
registrado aqui porque, se ele repetir o pedido em outra sessão, o próximo Diretor
precisa saber que a fronteira já foi conferida uma vez.

### Minha recomendação, e o desenho que estou provando no Foocci

**O raio-x tem duas metades, e separá-las é o ponto.**

1. **Coleta determinística, em código.** Varre e produz **evidência**: número,
   caso concreto, identificador. Roda sem IA, é barata, e é igual toda noite.
2. **Leitura por uma sessão do Diretor.** Lê a coleta e escreve o relatório de
   negócio para o CEO.

**Por que não deixar a IA coletar também:** *raio-x que depende de IA para coletar
erra diferente toda noite*, e aí "piorou desde ontem" deixa de significar alguma
coisa. Sem comparação com ontem, o raio-x vira paisagem: "37 mensagens presas" não
diz nada; "37, contra 4 ontem" diz tudo.

### ⭐ O que faz o raio-x funcionar: PADRÃO NOMEADO, não pergunta aberta

Isto veio do campo em 05/08, do Diretor que rodou o raio-x primeiro, e na minha
leitura é **a regra mais importante desta proposta**:

> *"Eu não pedi 'veja o que dá para melhorar'. Pedi para procurar padrões
> nomeados. Pedido genérico volta com opinião de estilo; pedido com padrão volta
> com a rota aberta na internet."*

Os cinco padrões que ele nomeou, e o que cada um pescou de verdade no produto dele:

| Padrão | O que apareceu |
|---|---|
| **Trabalho que existe e ninguém vê** | um post com imagem quebrada gerava até **1.728 imagens pagas por dia**, para sempre — ninguém olhava porque nada falhava |
| **Id aceito sem conferir de quem é** | uma rota gerava o link de acesso do portal de **qualquer** cliente do banco |
| **Promessa que o código não cumpre** | o relatório dizia "qualidade verificada" com as verificações escritas como `true` fixo — guardrail 2 violado em silêncio |
| **Estado morto** | o clique de aprovação gravava um estado que o relógio de publicação nunca lia: o cliente aprovava e **nada publicava**, sem erro e sem aviso |
| **Porta aberta para a internet** | rota de geração de imagem sem login, com a chave paga da casa atrás |

**Recomendo que o protocolo carregue a lista de padrões, não só o ritual.** Um
projeto que herda "faça um raio-x toda noite" e nada mais volta com opinião de
estilo. O valor está na lista, e ela cresce a cada achado que se repete.

### As três ferramentas são diferentes, e confundi-las custa

Também dele, e vale escrever antes que alguém ache que uma substitui a outra:

- **Auditoria adversarial** olha o que **acabou de mudar** e tenta quebrar.
- **Raio-x** olha o que **já estava lá** e ninguém questiona mais.
- **O especialista esbarrando** — consertando uma coisa e achando outra — foi a
  terceira fonte, e rendeu bastante. Não se agenda, mas se registra.

Os achados dele **não se sobrepuseram**: o raio-x pescou o que era antigo (a rota
aberta, a chave-mestra, o beco sem saída); a auditoria pescou o que era do dia (o
relatório com crescimento inventado, a peça reprovada virando aprovada ao ser
refeita). Duas listas distintas, duas ferramentas distintas.

**Três regras que eu proporia junto**, porque sem elas o raio-x morre por conta
própria em duas semanas:

- **Todo achado carrega a evidência** (guardrail 6). Achado sem o caso concreto é
  ruído, e ruído ensina o CEO a não ler.
- **Varredura que não rodou devolve "não sei", nunca "está tudo bem"**
  (guardrail 1). O relatório mostra o que ficou cego.
- **Cada varredura nasce com as duas metades de teste** — a que prova que acha o
  problema quando ele existe, e a que prova que não inventa quando não existe.
  Varredura só vista achando coisa é indistinguível de varredura que alarma
  sempre.

### As opções que eu vejo, com o custo de cada

| | O que é | Custo | Risco |
|---|---|---|---|
| **A. Só doutrina** | o kit descreve o raio-x; cada projeto implementa do seu jeito | baixo | cada projeto inventa um formato; nada é comparável entre projetos |
| **B. Doutrina + molde** *(minha recomendação)* | o kit traz o protocolo **e** um molde de coleta em `templates/`, extraído do que o Foocci estiver rodando | médio | o molde envelhece se ninguém o mantiver |
| **C. Serviço central** | uma peça que varre todos os projetos | alto | precisa de acesso a todos os bancos — superfície de risco nova para resolver um problema de relatório |

Recomendo **B**, pelo mesmo motivo que os seis núcleos de código já vieram do
Foocci: molde extraído de coisa que roda envelhece melhor que molde escrito no
abstrato. Quando a coleta do Foocci estiver de pé e provada, ela é candidata
natural a `templates/`.

### A pergunta de doutrina que só você responde

**Quem é o dono do raio-x quando ele acha algo?** Achado do raio-x que atravessa
projetos — por exemplo, o mesmo desperdício aparecendo em dois produtos — vira
item do backlog do Diretor Geral, ou fica na pendência de cada projeto? Sem isso
definido, o achado que interessa mais (o que se repete) é justamente o que não
tem casa.

---

## Respondidas

*Nenhuma ainda. Quando houver, a resposta fica aqui — e se valer para mais de um
projeto, ela também sobe para o `dioli-brain-kit`, com a origem registrada.*
