# OS — O fluxo de compra do plano: o que falta entre "quero contratar" e "cliente pagando com nota"

> **Aberta em:** 03/08/2026 · pelo **Diretor Geral**, por ordem direta do CEO:
> *"se um cliente hoje clicar 'quero comprar o plano', a gente não tem nada —
> legalmente, checkout, pós-compra, nota fiscal de serviço."*
> **Prioridade:** P0 comercial. O site está no ar com preços; a campanha começa;
> um lead quente hoje não tem onde pagar.

---

## 1 · O que foi medido — o cliente que quer pagar hoje bate em quê

| Peça | Estado medido | Evidência |
|---|---|---|
| Botão "contratar" no site | **Não existe.** Todo CTA leva ao formulário de demonstração | `/site/precos` |
| Termos de uso | Existem (100 linhas), **mas cobrem só o uso do site** — **zero** ocorrências de plano, assinatura, pagamento, cancelamento ou reembolso | grep em `termos-de-uso/page.tsx` |
| Cobrança recorrente | **Zero código.** O Mercado Pago integrado é o de **pedidos dos restaurantes** (PIX/cartão avulso do comensal), não assinatura nossa | grep assinatura/subscription/preapproval |
| Registro de assinante | **Não existe** tabela nem tela: quem assina, qual plano, desde quando, status | schema.prisma |
| NFS-e (nota do NOSSO serviço) | **Zero código de emissão** — MAS a integração **Focus NFe já existe** como conta-mãe (para NFC-e dos lojistas), e o mesmo provedor emite NFS-e | `src/services/fiscal/fiscalPlatform.ts` |
| Onboarding pós-pagamento | Existe auto-registro de restaurante (`/api/restaurants/register`), desconectado de qualquer pagamento | middleware |

**Resumo honesto:** das seis peças, uma está meio pronta (fiscal, pela conta-mãe
Focus), uma existe desconectada (onboarding), e quatro não existem.

---

## 2 · A estrutura, na ordem em que o dinheiro anda

```
INTERESSE          CONTRATO           COBRANÇA            REGISTRO           NOTA              ONBOARDING
site/preços   →    aceite dos    →    assinatura     →    tabela de     →    NFS-e via    →    conta criada +
"Contratar"        termos do          recorrente          assinantes         Focus NFe         trava por plano
                   plano (novo)       (Mercado Pago)      + admin
```

### Peça 1 — O contrato (BLOQUEIA TUDO, e metade é do CEO)

Vender assinatura sem contrato de assinatura é operar no fiado jurídico. Falta um
**Termo de Contratação de Serviço** dizendo: o que cada plano inclui (a tabela já
aprovada), ciclo e reajuste, cancelamento e prazo, SLA honesto, limitação de
responsabilidade, LGPD do lado B2B.

- **Do Diretor Geral/Diretor:** rascunho técnico do termo a partir da tabela de
  planos (posso escrever a base).
- **Do CEO:** revisão jurídica — ele já assumiu a das páginas legais; este é o
  documento mais importante do lote. **Guardrail 7: sem contrato revisado, não se
  publica botão de compra.**
- **No produto:** tela de aceite com registro de quem/quando/qual versão aceitou
  (aceite sem trilha não vale nada numa disputa).

### Peça 2 — Cobrança recorrente (Mercado Pago Assinaturas)

Recomendação: **Mercado Pago**, porque a conta e a integração de pagamentos já
existem no sistema — é o caminho de menor atrito. O produto "Assinaturas"
(preapproval) cobra cartão todo mês sozinho e manda webhook de cada evento
(pagou, falhou, cancelou).

V1 não precisa de tela de cartão nossa: o MP fornece **link de assinatura**
hospedado. Nosso trabalho é criar a assinatura via API, guardar o vínculo e
processar o webhook.

### Peça 3 — Registro de assinante

Tabela `PlanSubscription`: restaurante → plano, ciclo (mensal/trimestral/anual),
valor fechado, status (ativa/inadimplente/cancelada), IDs do MP, data do aceite
dos termos + versão. Tela no admin para o CEO ver a carteira. **É esta tabela que
a trava por plano (OS do cardápio, passo 3) vai ler** — as duas frentes se
encontram aqui.

### Peça 4 — NFS-e

A boa notícia do levantamento: **a Foocci já opera uma conta-mãe no Focus NFe**
para notas dos lojistas. O mesmo provedor emite NFS-e. O código de emissão é
pequeno perto do que já existe.

**ATUALIZADO 03/08 — o CEO enviou o CCMEI e a situação real é mais séria:** o
CNPJ 59.120.811/0001-79 é **MEI com CNAE de comércio de VESTUÁRIO**, sem
secundários. Como está, **não pode emitir nota de software** — e software não é
atividade permitida no MEI (2026). Caminho, porquê e ordem em
**`docs/juridico/parecer-cnpj-e-caminho-fiscal.md`**: desenquadrar para SLU-ME
com CNAE 6203-1/00, via contador. Até lá a emissão fica travada; aceite e
cobrança podem ser construídos em paralelo. A minuta do contrato já existe:
**`docs/juridico/termo-de-contratacao-foocci.md`**.

### Peça 5 — Pós-compra

Webhook do MP confirma o primeiro pagamento → cria/ativa o restaurante → registra
a assinatura → dispara e-mail de boas-vindas com os primeiros passos (o `manual`
já tem conteúdo de onboarding) → NFS-e emitida e enviada. Inadimplência: avisar no
painel antes de travar qualquer coisa — **proteção não pode ser mais destrutiva
que o problema** (guardrail 5).

---

## 3 · Recomendação de V1 — porque a venda é 1:1

Enquanto o CEO fecha cada cliente pessoalmente, **não precisamos de self-service
completo** para começar a cobrar certo. V1 = **checkout assistido**:

1. CEO fecha no WhatsApp → cria a assinatura na tela do admin (plano + ciclo);
2. Sistema manda ao cliente o **link de aceite dos termos** e, aceito, o **link
   de assinatura do MP**;
3. Webhook confirma → registro + onboarding + NFS-e automáticos.

Isso entrega contrato válido, cobrança recorrente e nota fiscal **sem** construir
carrinho público — e todo o miolo é reaproveitado quando o botão "Contratar"
abrir no site (V2).

---

## 4 · Ordem de execução e dependências

| # | Item | Depende de | Quem faz |
|---|---|---|---|
| 1 | Rascunho do Termo de Contratação | tabela de preços (pronta) | Diretor Geral escreve; **CEO revisa com jurídico** |
| 2 | Schema `PlanSubscription` + aceite com trilha | — | código |
| 3 | Integração MP Assinaturas (criar + webhook) | conta MP (existe) | código |
| 4 | Tela admin da carteira + fluxo assistido | 2, 3 | código |
| 5 | Emissão NFS-e via Focus | **4 dados do CEO/contador** (§2, peça 4) | código pronto esperando |
| 6 | E-mail de boas-vindas + gancho no onboarding | 3 | código |
| 7 | Botão "Contratar" público no site (V2) | 1–6 rodando com clientes reais | depois |

**O que trava em quem:** 1 e 5 têm dependência do CEO. 2, 3, 4 e 6 são código puro
e começam já.

---

## 5 · Registro

- Evidências: greps e arquivos citados na §1, medidos em 03/08.
- Fechar esta OS = fluxo assistido rodando ponta a ponta com um cliente real:
  aceite registrado, cobrança recorrente ativa, NFS-e emitida, onboarding
  disparado.
