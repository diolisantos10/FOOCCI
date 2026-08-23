# Domínio — o diagnóstico (e é o inverso do que estava na lista)

## Estado atual (23/08/2026) — o `www` continua quebrado, e agora sabemos por quê

Medido **de fora deste ambiente** (SSL Labs, a partir dos servidores deles), porque
a saída HTTPS desta máquina passa por um proxy que troca o certificado — ler TLS
daqui dentro mede o proxy, não o Railway. Esse erro já custou um diagnóstico errado.

| Endereço | DNS | Certificado servido | Nota |
|---|---|---|---|
| `foocci.com.br` | A → 69.46.46.119 | ✅ `CN=foocci.com.br`, Let's Encrypt, válido até 05/2026+ | **A+** — intacto |
| `www.foocci.com.br` | CNAME → `9gfe3aaa.up.railway.app` → 69.46.46.53 | ❌ `CN=*.up.railway.app` (curinga do Railway) | **T** — falha de confiança |

O certificado curinga `*.up.railway.app` **não cobre** `www.foocci.com.br`. É
exatamente isso que o Chrome traduz como `NET::ERR_CERT_COMMON_NAME_INVALID`.

### A causa: o domínio `www` está cadastrado no Railway, mas não está vivo na borda

O CNAME de hoje **já é** o valor que o diagnóstico de 04/08 exigia (`9gfe3aaa`), e
mesmo assim não funciona. O que prova a causa é o corpo da resposta:

```
Host: www.foocci.com.br  →  {"status":"error","code":404,"message":"Application not found"}
   ... na borda 69.46.46.53 (9gfe3aaa, alvo do CNAME)
   ... e também nas bordas 69.46.46.119 (apex) e 69.46.46.69 (domínio de serviço)
```

**Nenhuma borda do Railway reconhece o Host `www.foocci.com.br`.** O domínio
aparece na API do Railway (`customDomains`), mas o roteamento nunca foi ativado —
e, sem roteamento, a validação de posse nunca completa e o certificado nunca é
emitido. Não é propagação de DNS, não é o `middleware`, não é o app.

> A exceção do ACME no `middleware` está correta e no ar — e não é a culpada:
> `http://www.foocci.com.br/.well-known/acme-challenge/<token>` responde **404 do
> `railway-edge`**, ou seja, a requisição nem chega à aplicação.

### O que ficou fora do alcance desta sessão

Não consegui ler o `certificateStatus` nem recriar o domínio: a cota do agente do
Railway está esgotada, não há CLI autenticado aqui, o `RAILWAY_TOKEN` só existe
dentro do GitHub Actions — e o **Actions está bloqueado por cobrança**. O MCP do
Railway lista domínios, mas não apaga nem recria domínio customizado.

**Portanto:** o motivo exato pelo qual o Railway deixou o `www` inativo (validação
travada desde 04/08 x registro órfão de uma recriação) é **"preciso confirmar"** —
o que está provado é o efeito, e ele é definitivo enquanto ninguém recriar o
domínio no painel.

### O conserto, em duas mãos

1. **No Railway (painel):** projeto Foocci → serviço FOOCCI → *Settings* →
   *Networking* → apagar `www.foocci.com.br` e adicioná-lo de novo (porta 8080).
   Ao adicionar, o Railway mostra **o valor de CNAME que ele exige** — e recriar
   **sorteia um valor novo**, quase certamente diferente de `9gfe3aaa`.
2. **Na Hostinger:** trocar o CNAME do `www` para exatamente esse valor novo
   (TTL 300). Só então o certificado é emitido, em minutos.

Nada disso encosta no `foocci.com.br` sem www: são registros diferentes (A/ALIAS
na apex, CNAME no `www`) e domínios separados no Railway.

### Exposição a cliente: nenhuma medida

Nenhum link gerado pelo produto usa `www` — cardápio, QR, recuperação de carrinho
e os curtos `/r/` e `/l/` saem todos de `foocci.com.br`. As únicas menções a `www`
no código são o redirecionamento canônico no `middleware` e os testes dele.

---

> 30/07/2026. Medido de fora, do container e de um resolvedor público.
> **Atualizado em 04/08/2026** — ver "Estado atual" logo abaixo.

---

## Estado atual (04/08/2026, 13:10Z)

| Peça | Estado | Evidência |
|---|---|---|
| **Redirect `www` → apex no código** | ✅ **NO AR** | middleware 308 preservando caminho/query; deploy confirmado (`34a633c`) |
| **DNS do `www` existe (Hostinger)** | ✅ **FEITO pelo CEO** | `CNAME www → o8p24ufo.up.railway.app`, Status 0 no DoH (era NXDOMAIN) |
| **Domínio `www` registrado no Railway** | ✅ **FEITO pelo Diretor, por API** | id `f474c409-59e5-4981-8d24-22d8bbbc115f`, run [30912306769](https://github.com/diolisantos10/FOOCCI/actions/runs/30912306769) |
| **Valor do CNAME** | ❌ **ERRADO** | Railway exige `9gfe3aaa.up.railway.app`; a Hostinger tem `o8p24ufo.up.railway.app` |

### A causa raiz, que só apareceu depois do registro

O Railway devolveu, ao criar o domínio:

```
CNAME www → esperado "9gfe3aaa.up.railway.app" · atual "o8p24ufo.up.railway.app"
```

**Cada domínio customizado ganha uma borda própria no Railway**, e o certificado é
emitido só para ela. Os dois endereços são reais e ambos são da Railway, mas são
máquinas diferentes:

```
o8p24ufo.up.railway.app → 69.46.46.119   ← onde o www chega hoje (borda do serviço/apex)
9gfe3aaa.up.railway.app → 69.46.46.53    ← borda exclusiva do www, com o certificado
```

Por isso o navegador acusa *"no alternative certificate subject name matches"*: a
conexão chega numa borda que **não tem** o certificado do `www`. Não é propagação,
não é espera, não é o Railway pendente — é valor trocado. Enquanto o CNAME apontar
para `o8p24ufo`, o `www` fica fora do ar para sempre.

> **Aprendizado que vale além deste domínio:** "DNS resolvendo" e "DNS correto" são
> coisas diferentes. O `Status 0` do DoH só prova que o nome existe — não prova que
> aponta para o lugar certo. Um portão que só checa NXDOMAIN aprova este erro.

### O acesso ao Railway: resolvido, e não depende mais de humano

O registro foi feito **sem o painel e sem token novo**. A credencial do Railway já
existia nos segredos do repositório (`RAILWAY_TOKEN`, usada pelo deploy há 217
execuções) — e os segredos só são alcançáveis de dentro do GitHub Actions. Daí a
solução: `scripts/railway-custom-domain.mjs` + o workflow
`.github/workflows/railway-custom-domain.yml`, disparáveis pelo Diretor.

**Daqui em diante, domínio no Railway é trabalho do Diretor, não do CEO.**

---

## O que está no ar agora

| Host | DNS | HTTPS |
|---|---|---|
| **`foocci.com.br`** | ✅ A → `69.46.46.119` | ✅ responde — `307 → /login`, e `/api/health` devolve `200` |
| **`www.foocci.com.br`** | ❌ **NXDOMAIN** — não existe registro nenhum | ❌ não responde (o nome não resolve) |

O item da fila dizia *"domínio sem www não responde"*. **É o contrário.** O
domínio sem www é o que funciona — inclusive foi por ele que confirmei todos os
deploys de hoje. Quem não responde é o **www**.

### A medição

```
$ curl -sI https://foocci.com.br/            → 307, redirect para /login
$ curl -s  https://foocci.com.br/api/health  → 200 {"ok":true, ...}

$ curl -sI https://www.foocci.com.br/        → 000 (sem conexão)
```

Consulta a um resolvedor público (Cloudflare DoH), para não depender do DNS do
container:

```
foocci.com.br      A     → Status 0 (OK)      → 69.46.46.119
www.foocci.com.br  A     → Status 3 (NXDOMAIN)
www.foocci.com.br  CNAME → Status 3 (NXDOMAIN)
```

**`Status 3` é NXDOMAIN: o nome não existe.** Não é certificado, não é o app,
não é o Railway recusando o Host — é DNS: `www` nunca foi criado.

Autoridade da zona: **Hostinger** (`dns.hostinger.com`, `pixel.dns-parking.com`).

---

## Por que isso importa antes de segunda

Muita gente digita `www.` por hábito, e quem clica num link com `www` numa peça
de lançamento recebe **erro do navegador** — não uma página do Foocci. No dia da
abertura comercial, é a pior primeira impressão possível.

---

## O conserto

### 1. Registrar o `www` no Railway — ✅ **FEITO** (por API, 04/08)

O Railway roteia pelo cabeçalho `Host`. Um DNS apontando para o IP certo **não
basta**: se o domínio não estiver registrado no serviço, o Railway recusa.

Executado pelo Diretor via GitHub Actions:

```
Actions → "Railway — domínio customizado" → Run workflow → domínio: www.foocci.com.br
```

O script é idempotente: rodar de novo apenas reporta o estado do DNS, e agora
**grita quando o valor do CNAME diverge do exigido** — que é exatamente o erro
que ficou escondido aqui.

### 2. Corrigir o valor do CNAME na Hostinger — ✅ **FEITO** (por API, 04/08)

O registro já existia; o que estava errado era o **valor**. Corrigido pela API da
Hostinger (`PUT /api/dns/v1/zones/foocci.com.br`), trocando **apenas** o `CNAME`
do `www` e deixando o `ALIAS @` e o `TXT _railway-verify` intocados:

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nome | `www` |
| Aponta para | ~~`o8p24ufo.up.railway.app`~~ → **`9gfe3aaa.up.railway.app`** |
| TTL | 14400 → **300** |

Conferido nos dois servidores autoritativos, consultados um a um (sem passar por
resolvedor com cache):

```
pixel.dns-parking.com (172.64.52.230) → 9gfe3aaa.up.railway.app
byte.dns-parking.com  (172.64.53.67)  → 9gfe3aaa.up.railway.app
```

> **Cuidado ao medir depois de uma troca de DNS:** o TTL antigo era de 4 horas,
> então Google e Cloudflare continuaram servindo o valor velho por um tempo — e o
> proxy desta sessão também. Perguntar ao resolvedor público **não** prova que a
> troca falhou. O que prova é o autoritativo, e o `certificateStatus` na API do
> Railway.

> Use **CNAME**, não A. Se o IP do Railway mudar, o CNAME acompanha sozinho; um
> A record fixo quebra em silêncio no dia da troca.

### 3. Conferir (dá para fazer daqui depois)

```bash
curl -sI https://www.foocci.com.br/api/health
```

Tem que devolver `200` com o mesmo `commitSha` de `foocci.com.br`. A propagação
costuma levar de minutos a ~1h com TTL 300.

### 4. Decidir a canônica

Com os dois no ar, escolher **um** como oficial e redirecionar o outro — dois
endereços servindo o mesmo conteúdo dividem SEO e confundem link.

Recomendo **`foocci.com.br` como canônica** (é a que já está no ar, é a que está
nos docs e nos callbacks de Google/Meta/SumUp) e o `www` redirecionando para ela.
Assim nenhum callback configurado precisa mudar.

---

## O que NÃO precisa mudar

`NEXT_PUBLIC_SITE_URL` / `NEXTAUTH_URL` / `FOOCCI_BASE_URL` continuam em
`https://foocci.com.br`. O `www` é só uma porta de entrada que redireciona — a
URL canônica do produto segue a mesma, e nenhum link gerado (recuperação de
carrinho, QR, WhatsApp) muda.
