# O que o CEO deixou — 13/08/2026, 00h20

> Ditado por voz, de madrugada, com a instrução: *"vou deixar tudo isso aqui
> escrito e amanhã você tenta começar sem mim assim que os créditos entrarem."*
>
> Este arquivo é a transcrição ORGANIZADA, não um resumo. Item que sumir daqui
> some da casa — foi por isso que ele escreveu em vez de falar amanhã.

---

## 🔴 PRIORIDADE DECLARADA POR ELE: WHATSAPP

> *"pra amanhã a gente precisa priorizar o WhatsApp... é necessário fazer um
> raio-X de todo esse sistema de WhatsApp porque tem uma coisa errada."*

**O que está sangrando:** *"as vendas caíram porque o CRM do Foocci não
funciona."* Isto é receita, e é o item mais caro da lista inteira.

| # | Item | Estado |
|---|---|---|
| 1 | **Raio-X completo do WhatsApp** — caminho da mensagem ponta a ponta | despachado ao `canais` em 13/08 |
| 2 | **CRM não envia** — 0 mensagens hoje, 12 campanhas ativas | causa provável achada (ver abaixo) |
| 3 | **Loja não recebe** — mensagem para a loja não produz resposta | dentro do raio-X |
| 4 | **Menu não aparece** no número antigo (que saiu da API e virou celular) | dentro do raio-X |
| 5 | **Resíduo dos "dois chips"** — comprou o chip certo, não sabe se sobrou lixo | dentro do raio-X |

### A causa provável do CRM, achada em 13/08

Na tela de Modelos de mensagem, **todos aprovados e todos com "— não usar em
campanha —"**. Sem vínculo, `resolveMetaCrmTemplate` devolve nulo
(`src/services/crm/metaCrmSend.ts:74-109`) e o envio **cai em texto livre** — que
a Meta recusa por regra para público frio, fora da janela de 24h.

**A troca de número em 12/08 explica:** modelo é vinculado à conta do WhatsApp.

**O defeito que é da casa, e não do CEO:** o sistema **silencia**. Ele tinha que
recusar dizendo *"nenhum modelo vinculado — nada vai sair"*, em vez de tentar um
envio que já se sabe que a Meta rejeita. Alerta que não carrega a evidência é
ruído (guardrail 6).

---

## 🟠 FOOCCI — produto

| # | Item | Natureza |
|---|---|---|
| 6 | **Tirar o alerta de som** do painel | remoção |
| 7 | **Tirar "Fotos do Cardápio"** do menu — era exclusivo de um restaurante | remoção |
| 8 | **`foocci.com.br` não pode cair no dashboard.** Logado no Chrome, clicar no domínio tem de levar ao **site**, não ao painel do cliente. *"sem falta"* | correção |
| 9 | **Conectar o número novo** para o atendimento do produto (agente de SDR) | configuração |
| 10 | **Temas para vídeo do SDR** — cliente pergunta e recebe a resposta **por texto OU por um vídeo do CEO**. Gravar na horizontal. *"a gente tem que pensar nessa estrutura"* | desenho novo |
| 11 | **Assistente virtual está fraco** — abre chamado e não resolve. Ele quer *"IA trabalhando 24h para corrigir o sistema com acesso total ao Railway"* | ⚠️ ver ressalva |
| 12 | **Onboarding** para quem não tem **nenhuma** noção de setup. *"uma coisa muito séria"* | desenho novo |
| 13 | **Identidade visual dos restaurantes** — *"ainda está um pouco quente"* | continuação |

> ⚠️ **Ressalva do item 11, registrada para não se perder:** "IA com acesso total
> ao Railway corrigindo o sistema sozinha" é a definição de uma máquina que pode
> derrubar produção sem ninguém decidir. Isso não é recusa — é o guardrail 5: a
> proteção não pode ser mais destrutiva que o problema. O caminho é a IA
> **diagnosticar e propor** com evidência, e o deploy continuar sendo ato
> humano. Levar ao CEO como decisão dele.

---

## 🟡 FOOCCI MANAGER — decisão de dono, não minha

> *"amanhã vamos decidir se o Foocci Vendas vai ser só um canal de vendas que
> precisa ser conectado a um gerenciador, ou se pode ser vendido como produto
> único com emissão de nota fiscal. Acho que não... todo restaurante tem o seu
> próprio gerenciador."*

**Não resolver em silêncio.** É escopo de produto e preço — decisão do CEO.

---

## 🔵 AGÊNCIA DIOLI

| # | Item | Natureza |
|---|---|---|
| 14 | **Dashboards** — do cliente e da agência; integrações, conexões, dados | frente grande |
| 15 | **Testar as artes.** *"está saindo uns posts bem ruins"* — descobrir se o problema é o **Radar** ou a **Oficina de peças** | investigação |
| 16 | **Colocar os primeiros projetos para rodar** | ⚠️ ver conflito |
| 17 | **Conectar o máximo de redes sociais**; abrir uma **parte especializada em LinkedIn** | frente grande |
| 18 | **Validar se as oficinas funcionam** e se a informação chega aos Diretores — **principalmente a regra de que cronograma nunca para** | verificação |
| 19 | **CityJobs** — ele mesmo produz os stories, e estão bons, mas *"as vagas não têm muito a ver com a arte"*. Dar a direção | direção |
| 20 | **Verificação da empresa na Meta** | ⏳ **ato do CEO** |

> ⚠️ **O conflito do item 16, dito com todas as letras:** em 09/08 a ordem foi
> *"a gente não vai postar nada, não vai criar nenhum conteúdo, até a agência
> estar com todos os departamentos acima de noventa por cento"*. Hoje ele pede
> para colocar os primeiros projetos para rodar. **Ele é o dono e pode mudar a
> própria ordem** — mas três departamentos (publicação 40%, medição 30%, tráfego
> 55%) estão travados na Meta e não sobem por código. Confirmar com ele antes de
> tratar a ordem antiga como revogada.

---

## O que ele pediu sobre o próprio funcionamento da casa

> *"distribui algumas tarefas para alguns Diretores."*
> *"não sei se o Claudio automaticamente quando entra o crédito já começa a
> trabalhar, mas se sim já tem bastante coisa para você fazer aqui."*

Começar sem ele assim que houver crédito. É a doutrina 28 aplicada: terminar um
item é o gatilho para começar o próximo.
