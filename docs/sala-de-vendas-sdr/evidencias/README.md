# Evidências — Sala de Vendas

> Capturadas em 25/08/2026 contra o sistema rodando de verdade, banco
> `foocci_sala_demo`, com sessão interna assinada. Duas pessoas cadastradas:
> **Marina** (AGENTE_HUMANO) e **Dioli** (MASTER_CEO).

## As capturas

| Arquivo | O que prova |
|---|---|
| `atendimento-sdr-desktop.png` | as quatro áreas a 1280px: filas com contagem, lista, a conversa inteira e a ficha com a **conta do score** |
| `atendimento-sdr-mobile.png` | a 390px: um painel por vez, com barra de abas |
| `filas-sdr-desktop.png` | as sete filas no escopo do SDR |
| `funil-desktop.png` / `funil-mobile.png` | as 11 etapas, rolando dentro do próprio contêiner |
| `painel-gerente-desktop.png` | o painel do gerente, com os cards que dizem "sem dados" |
| `painel-negado-ao-sdr.png` | o que o SDR vê ao abrir o painel que não é dele |

### ⚠️ Uma ressalva honesta sobre as capturas

O Chromium headless **não pinta o valor de `<input>`** nas capturas. Na imagem
da ficha, os campos de qualificação parecem vazios — e não estão. O valor está
no DOM, e foi lido de lá:

```
unidades          = "2"
pedidos por mês   = "1800"
canais hoje       = "iFood, WhatsApp"
sistema atual     = "Anota AI"
dor principal     = "Comissão do iFood pesando demais"   (textarea — esta aparece)
para quando       = "Quer fechar hoje"
quem decide       = "É o dono"
```

A `<textarea>` da dor principal aparece na imagem, e é o que denuncia que o
problema é da captura e não da tela: os dois campos vêm da mesma consulta.

## A matriz de permissão, ao vivo

```
SDR  /admin/sala-de-vendas                      200
SDR  /admin/sala-de-vendas/atendimento          200
SDR  /admin/sala-de-vendas/funil                200
SDR  /api/admin/sala-de-vendas/painel           403
SDR  /api/admin/departamentos                   403

CEO  /api/admin/sala-de-vendas/painel           200
CEO  /api/admin/departamentos                   200

sem cookie nenhum                               307
```

O SDR abre a **página** do painel (200) e a **rota** recusa (403). É o desenho:
a página explica por que não é dele, em vez de dar um erro seco.

## A terceira camada, ao vivo

Cinco leads na base. O SDR pede cada um pela API, direto pela URL:

```
SDR → esperando gente          200
SDR → o próprio lead dela     200
SDR → sem dono                 200
SDR → com a IA                 404
SDR → de outra pessoa          404
SDR → id que não existe       404

CEO → de outra pessoa          200
```

**Os três 404 são indistinguíveis** — de propósito. Um 403 no lead de outra
pessoa confirmaria que ele existe, e daria para varrer ids e medir a base sem
ler um dado sequer.

## O que a captura da Sala mostra sem legenda

A fila "Todos" do SDR diz **3**, e há **5** leads na base. Os dois que faltam
são o que está com a IA e o que é de outra pessoa. O isolamento não é uma
afirmação deste documento — está na contagem da tela.
