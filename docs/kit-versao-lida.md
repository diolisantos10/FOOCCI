# Qual versão do kit este Diretor leu

> **O que é isto:** a assinatura do Diretor do Foocci. Uma linha por leitura, com
> o commit do `dioli-brain-kit` que estava valendo na hora.
>
> **Por que existe:** em 06/08/2026 o CEO perguntou, sobre os outros Diretores,
> *"eles já estão com o brain atualizado?"* — e a resposta honesta foi **"não
> sei"**. O kit tem `presenca.md`, que diz quem estava vivo num instante, e não
> tem nada que diga quem leu o quê. Sem isso, "atualizado" é opinião de quem
> observa, não fato assinado por quem leu.
>
> Este arquivo resolve a pergunta **para o Foocci**. A proposta do livro central
> de assinaturas está em `docs/perguntas-ao-diretor-geral.md` e depende do
> Diretor Geral — não se escreve no kit por conta própria (CLAUDE.md, "As salas",
> regra 1).

---

## Como assinar

**Na abertura da sessão**, junto com ler `docs/pendencias.md`:

```bash
cd /workspace/dioli-brain-kit && git log -1 --format="%h %cd %s" --date=short
```

Se o commit for diferente do último da tabela abaixo: **leia o que mudou**
(`git log <ultimo-assinado>..HEAD --stat`) e acrescente uma linha nova. Se for o
mesmo, não escreva nada — linha repetida vira ruído e ensina a não ler a tabela.

**Não apague linhas antigas.** A tabela é o histórico de propagação; ela responde
"quando esta doutrina chegou aqui?", que é uma pergunta diferente de "estou em
dia hoje?".

---

## Assinaturas

| Commit do kit | Data do commit | Lido em | Doutrinas em vigor | O que mudou desde a assinatura anterior |
|---|---|---|---|---|
| `268fbb5` | 2026-08-05 | 2026-08-06 | 1–16 | Doutrina 15 (especialista por assunto vira obrigatório, e o silêncio vira falha nomeada) · correção da contradição interna na tabela de adoção, que mandava o Diretor escrever no kit · Doutrina 16 ganhou a tabela de adoção |

---

## O que esta assinatura NÃO promete

**Que eu aplico tudo.** A leitura é um fato; a aplicação é trabalho, e ele
aparece em `docs/pendencias.md` como qualquer outro. Uma doutrina lida e não
aplicada é dívida **conhecida** — que é melhor que dívida invisível, e é o ponto
inteiro deste arquivo.

**Que o kit está certo.** Discordância de doutrina vai para
`docs/perguntas-ao-diretor-geral.md`, não para uma nota nesta tabela. Assinar é
dizer "li", nunca "concordo".
