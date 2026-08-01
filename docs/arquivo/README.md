# Arquivo — os chats antigos, depois de minerados

> Esta pasta guarda conversas exportadas que **já foram lidas e distribuídas**.
> É **perícia, não leitura**. Ninguém abre um arquivo daqui para trabalhar; abre
> para reconstruir por que uma decisão foi tomada, quando ela der errado.

---

## ⚠️ A regra que não tem volta

**Nenhum chat é fechado antes de ter sido exportado e minerado.**

Todo o resto é refazível — um manual mal escrito se reescreve, um especialista mal
recortado se conserta. **Conversa apagada não volta.**

---

## Por que a pasta existe

O modelo antigo era um chat por assunto. Funcionava com dois projetos; com nove
virou insustentável — abas demais, nenhuma conversando com a outra, e o
aprendizado morrendo junto com a sessão que o produziu.

A troca é: **uma porta por projeto**. O Diretor lê o repositório, não o histórico de
conversa. Para isso, o que estava só no chat precisa descer para cá — uma vez.

---

## O protocolo, em três passos

```
1. EXPORTAR   o CEO baixa a conversa e a joga aqui como
              docs/arquivo/AAAA-MM-DD-<assunto>.md

2. MINERAR    o Diretor lê e DISTRIBUI cada coisa para o lugar certo:
                decisão que vale            → docs/decisoes.md
                trabalho ainda aberto       → docs/pendencias.md
                regra de um domínio         → vitrine do especialista dono
                regra de mais de um projeto → PROPOSTA ao Diretor Geral (kit)
                fato sobre o produto        → docs/foocci-resumo-executivo.md

3. ARQUIVAR   o Diretor escreve no topo do arquivo o bloco de conclusão abaixo,
              commita, e SÓ ENTÃO o CEO pode fechar aquela aba.
```

### O bloco que o Diretor escreve no topo do arquivo minerado

```markdown
> **MINERADO em AAAA-MM-DD por <Diretor>.** Commit: <sha>
> Desceu para: <lista dos arquivos que receberam conteúdo>
> Nada mais aqui é leitura corrente.
```

**Sem esse bloco, o chat não está minerado** — e não pode ser fechado. É o
guardrail "sem portão = reprovado" aplicado ao arquivamento: esquecer de minerar
nunca pode significar "pode apagar".

---

## Por que o passo 3 não é burocracia

Se o chat bruto virar leitura obrigatória, você recriou dentro do repositório
exatamente o problema de contexto que a reorganização existe para matar — só que
agora **pior**, porque parece organizado.

O arquivo morto tem uma função e só uma: quando uma decisão der errado, alguém
precisa reconstruir o raciocínio que levou até ela.

---

## O que provavelmente **não** precisa ser exportado

Muita coisa já desceu sozinha. Este repositório tem quase 60 documentos em `docs/`
— os raio-x do CRM, da impressora e do WhatsApp, os backlogs, os playbooks. **Eles
são o resíduo daqueles chats.** Foi de lá que saiu quase tudo que está nas fichas
dos oito especialistas.

**Regra prática:** exporte o chat **só se** o Diretor, depois de ler o repositório,
disser que falta alguma coisa. O Diretor entrega uma **lista de buracos** — curta e
específica, do tipo *"achei a decisão X mas não achei por que você escolheu Y"*.
O CEO responde o buraco, não o inventário.
