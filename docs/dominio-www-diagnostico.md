# Domínio — o diagnóstico (e é o inverso do que estava na lista)

> 30/07/2026. Medido de fora, do container e de um resolvedor público.

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

## O conserto — precisa de acesso que eu não tenho

Não consigo mexer em DNS nem no Railway daqui. O passo a passo exato:

### 1. Registrar o `www` no Railway (obrigatório)

O Railway roteia pelo cabeçalho `Host`. Um DNS apontando para o IP certo **não
basta**: se o domínio não estiver registrado no serviço, o Railway recusa.

- Railway → o serviço do Foocci → **Settings → Networking → Custom Domain**
- Adicionar `www.foocci.com.br`
- O Railway devolve um alvo de `CNAME` (algo como `xxxx.up.railway.app`) —
  **anotar esse valor**, é ele que vai no passo 2

### 2. Criar o registro na Hostinger

- Hostinger → **Domínios → foocci.com.br → DNS / Nameservers**
- Adicionar:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `CNAME` | `www` | *(o alvo que o Railway deu no passo 1)* | 300 |

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
