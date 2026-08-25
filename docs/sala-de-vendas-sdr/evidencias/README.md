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

---

# Rodada do reforço de escopo — 25/08/2026

## A porta que não existia

`autenticarInterno` e `criarCookieInterno` estavam escritos desde a v3 e
**nenhuma rota os chamava**. O SDR não tinha como entrar em lugar nenhum; a tela
de login só aceitava o `ADMIN_SECRET`, que dá acesso a tudo — o oposto do
isolamento. Foi por isso que as evidências anteriores precisaram forjar o cookie
por script.

Agora existe, e o destino vem do servidor:

```
POST /api/admin/session/interna  →  {"ok":true,"data":{"nome":"Marina",
                                     "papel":"AGENTE_HUMANO",
                                     "destino":"/admin/sala-de-vendas/atendimento"}}

senha errada          →  "E-mail ou senha incorretos."
e-mail que não existe →  "E-mail ou senha incorretos."   (a MESMA frase)
```

A frase é a mesma de propósito: distinguir as duas entrega uma lista de e-mails
válidos a quem estiver tentando.

## A matriz, com login de verdade

```
SDR  /admin/sala-de-vendas/atendimento          200
SDR  /admin/sala-de-vendas/agentes              200
SDR  /api/admin/sala-de-vendas/agentes          200
SDR  /api/admin/sala-de-vendas/painel           403
SDR  /api/admin/departamentos                   403

CEO  /api/admin/sala-de-vendas/painel           200
CEO  /api/admin/departamentos                   200
```

O SDR alcança a Sala e as fichas; o painel de gestão e o resto do Admin recusam.

## A quarta camada: autorização NO BANCO

A prova que importa — a mesma consulta, pela aplicação e por um `psql` cru com
a string de conexão:

```
pela aplicação, SDR logado        6 mensagens
pela aplicação, CEO logado        6 mensagens
psql com a string do banco        0 mensagens
```

E no banco de teste dedicado, cada identidade:

```
sem identidade declarada     0        SDR Marina    2  (o dela + a fila aberta)
papel inventado ('CHEFAO')   0        SDR Outra     2  (o dela + a fila aberta)
papel vazio                  0        CEO           4
"MASTER_CEO'; --"            0        SISTEMA       4
```

**Dois buracos foram encontrados construindo isto**, e nenhum apareceria lendo o
SQL:

1. `NULL IN (...)` devolve NULL, não `false`. Sem `COALESCE`, o papel ausente
   atravessava o `OR` e deixava a política indecisa.
2. O ramo "lead de ninguém é alcançável" **não exigia identidade**. Uma conexão
   anônima lia a fila aberta inteira — 6 linhas, medidas. A trava aparecia como
   ativa em `pg_class` e vazava. É a definição de teatro de segurança.

E um terceiro, na ponte: `SET LOCAL` não aceita parâmetro, então o papel era
concatenado na string do comando. `MASTER_CEO'; --` fechava a aspa e **promovia
a CEO**. Trocado por `set_config()`, que é função e aceita parâmetro — o valor
viaja como dado, e o problema deixa de existir em vez de ser filtrado.

## As nove fichas comerciais

```
 1.1 Agente Gerente Comercial           HUMANO   vago
 1.2 Agente de Abordagem                IA       vago
 1.3 Agente de Recepção                 IA       vago
 1.4 Agente de Qualificação             IA       vago
 1.5 Agente SDR IA — TA                 IA       vago
 1.6 Agente SDR Humano                  HUMANO   vago
 1.7 Agente Consultor                   HUMANO   vago
 1.8 Agente Closer                      HUMANO   vago
 1.9 Agente CRM e RevOps                HIBRIDO  vago
```

Todas cadastradas, **nenhuma ligada, nenhum cargo ocupado** — e a tela escreve o
motivo de cada número ausente em vez de mostrar zero.

## Capturas desta rodada

| Arquivo | O que prova |
|---|---|
| `login-duas-portas.png` | a porta das pessoas em cima, a senha única recolhida embaixo |
| `login-mobile.png` | a 390px |
| `agentes-comerciais-desktop.png` | as nove fichas, com a do TA aberta: desempenho + o que pode |
| `agentes-comerciais-mobile.png` | a 390px |
