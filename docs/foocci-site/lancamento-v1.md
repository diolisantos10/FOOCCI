# Foocci — Lançamento do site comercial

> Versão 1 · 2026-08-01 (executado) · lançamento marcado para **2026-08-03, segunda**.
> Substitui `pre-launch-mode-v1.md`, que passa a ser **histórico**.

O site saiu de prévia privada e virou site comercial público. Este documento diz
**o que mudou, o que ficou de fora e por quê** — quem for mexer aqui depois lê isto
antes.

---

## 1. A armadilha que quase derrubou o lançamento

O portão de senha estava em **DOIS lugares ao mesmo tempo**:

| Camada | Arquivo |
|---|---|
| middleware (bloqueia antes de renderizar) | `src/middleware.ts` |
| layout do subtree | `src/app/site/(gated)/layout.tsx` |

Os dois foram removidos juntos. **Remover só um deixa o site fechado sem erro
nenhum para explicar.**

E a armadilha maior, que era a hipótese natural de quem ia liberar:

> ⛔ **Apagar a variável `MARKETING_PREVIEW_PASSWORD` NÃO abre o site — fecha de
> vez.** O helper falha fechado de propósito: sem senha configurada, `previewToken()`
> devolve `null` e ninguém entra, nem com cookie. `/site/acesso` passa a responder
> 503. Liberar sempre foi mudança de código.

A maquinaria da prévia (`preview/previewAuth.ts`, `/site/entrar`, `/site/acesso`,
`/site/sair`) foi **mantida** no repositório — uma prévia privada futura é um import
de distância.

---

## 2. O que mudou

| Item | Antes | Agora |
|---|---|---|
| Acesso a `/site` | senha compartilhada | **público** |
| `robots` | `noindex, follow` | `index, follow` (`src/app/site/layout.tsx`, fonte única) |
| Raiz `/` | redirecionava para `/login` | **anônimo → `/site`**; logado → `/dashboard` |
| Formulário de demonstração | inerte ("Envio disponível em breve") | **grava lead + avisa por e-mail** |
| Discurso | "em breve" em 6 lugares | produto disponível |
| Páginas legais | diziam que o site **não** coleta dados | descrevem a coleta real, com base legal LGPD |
| Nome do 3º plano | — | **`PRO`** no banco; no site os nomes são comerciais (ver §5) |

### O bug que apareceu no caminho

`src/app/page.tsx` tinha `redirect("/dashboard")` **dentro** de um `try/catch`.
`redirect()` funciona lançando exceção — o `catch` engolia o sinal e o usuário
logado caía em `/login`. Corrigido junto: o `redirect` agora fica fora do `catch`.

---

## 3. Captura de leads — a ordem é o projeto inteiro

```
POST /api/site/leads
  → valida (zod, todos os campos com teto de tamanho)
  → GRAVA no banco (SiteLead)          ← nada depende do e-mail
  → tenta avisar por e-mail
  → marca notifiedAt OU grava notifyError
```

**Persiste primeiro, avisa depois.** Um lead que chegou no banco nunca se perde,
aconteça o que acontecer com o e-mail. A lista em **`/admin/leads`** é o cofre; o
e-mail é só o alarme.

Travado por teste: `src/services/site/tests/SiteLeadService.test.ts` prova que o
lead sobrevive a provedor ausente, a erro 4xx/5xx e a exceção de rede, e que a
gravação acontece **antes** do aviso.

### Configuração do e-mail (o que falta)

| Variável | Para quê |
|---|---|
| `RESEND_API_KEY` | chave do provedor de e-mail |
| `LEADS_NOTIFY_EMAIL` | para quem chega o aviso |
| `LEADS_FROM_EMAIL` | opcional; sem ela usa o remetente compartilhado do Resend |

Sem elas o site **funciona igual** — o lead é gravado e `/admin/leads` mostra
`RESEND_API_KEY ausente` na coluna *Aviso*. Guardrail 6: o alerta carrega a
própria evidência.

Não foi instalado SDK: a chamada é um `fetch` para a API HTTP do Resend. Uma
dependência a mais teria que entrar em `dependencies` (ver o corredor sobre
`NODE_ENV=production`) para um único POST.

---

## 4. O que NÃO foi feito, e por quê

### Preços continuam sem valor publicado

O CEO optou por publicar preços, mas **os três valores não foram fechados até o
lançamento**. Publicar número inventado fere o guardrail 7 e a decisão D3 do
briefing. As páginas apresentam os planos qualitativamente e levam ao formulário
("valor sob consulta").

Publicar depois é mudança de conteúdo em **dois lugares**:
`src/app/site/(gated)/precos/page.tsx` e
`src/components/marketing/PricingTeaserSection.tsx`. Nada mais depende disso.

### Revisão jurídica

As páginas legais foram **corrigidas de fato falso** (elas afirmavam que o site não
coletava dados — deixou de ser verdade no minuto em que o formulário passou a
gravar). Continuam **sem revisão de advogado**, e o `TODO(legal)` segue no arquivo.
Isso é decisão do CEO, não pendência técnica.

### `/` renderiza o site ou redireciona?

**Redireciona** (`/` → `/site`). Renderizar exigiria duplicar o shell de marketing
ou reestruturar a árvore de rotas no fim de semana do lançamento — risco sem ganho
visível. `/site` é a URL canônica e é a indexada.

---

## 5. Nomes de plano: dois vocabulários, de propósito

| No banco (`enum Plan`) | No site |
|---|---|
| `STARTER` | Essencial |
| `GROWTH` | Crescimento |
| `PRO` | Performance |

Mesma escada, rótulos diferentes. **Nunca imprima o enum no site nem os nomes
comerciais no painel.** O erro registrado no `HANDOFF-site-comercial.md` era
chamar o terceiro de "PREMIUM" — que não existe em lugar nenhum.

---

## 6. Verificação executada

- `npx tsc --noEmit` → 0
- `npx vitest run` → **4598 testes, 355 arquivos, todos verdes**
- `npm run build` → 0
- Rotas conferidas no build de produção: `/` → 307 → `/site`; `/site`,
  `/site/precos`, `/site/demonstracao` → 200 **sem senha**
- Screenshots em **390 / 768 / 1440** de home, planos e demonstração

### Autoavaliação visual (DESIGN.md exige 8+ nos quatro)

| Critério | Nota |
|---|---|
| Hierarquia | 9 — sobrancelha → título → subtítulo → CTA, mesmo ritmo nas três páginas |
| Tipografia | 9 — Inter, pesos 400/600, escala consistente |
| Espaçamento | 9 — ritmo de seção uniforme, respiro correto no 390 |
| Consistência | 9 — depois de alinhar "Preços"/"Planos" entre menu e rodapé |

**Duas correções entraram por causa dos prints**, não do código: as páginas de
*Planos* e *Demonstração* tinham CTA mandando o visitante **para longe** do
formulário — herança do modo pré-lançamento, quando não havia para onde converter.

---

## 7. Rotina de reversão

Se na segunda algo der errado, o caminho de volta é reverter o merge — não mexer
em variável de ambiente. Repetindo, porque é o erro natural:
**apagar `MARKETING_PREVIEW_PASSWORD` não fecha o site com elegância; hoje ela não
faz mais nada.**
