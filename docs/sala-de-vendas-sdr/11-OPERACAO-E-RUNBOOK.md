# 11 — Operação e runbook

## Como ligar, na ordem

A ordem importa: cada passo depende do anterior, e pular um produz uma tela
vazia que parece defeito.

### 1. Aplicar a migração

```bash
npx prisma migrate deploy
npm run db:travas          # o gatilho de append-only não vem no schema
```

### 2. Semear o que a Sala precisa

```bash
npm run db:seed-sala
```

Cria o catálogo de motivos de perda (11), a configuração do TA **desligada** e
uma cadência **inativa**. Não cria lead nenhum.

⚠️ Sem os motivos de perda, **nenhum lead pode ser marcado como perdido** — a
regra do funil exige motivo estruturado.

### 3. Criar o primeiro acesso

```bash
npx tsx scripts/criar-usuario-interno.ts
```

Sem isso a Sala responde 401 para todo mundo, **inclusive para o CEO**. Isso é a
porta funcionando, não defeito.

### 4. Registrar disponibilidade

Cada SDR marca o próprio estado na Sala. Enquanto ninguém marcar, o painel diz
"ninguém registrou disponibilidade" — que é diferente de "todo mundo offline".

### 5. (Depois) Ligar a recepção do WhatsApp

Cadastro do número na Meta → `FOOCCI_SALES_PHONE_NUMBER_ID` e
`FOOCCI_SALES_ACCESS_TOKEN` no Railway. Passo a passo em
`docs/whatsapp-vendas-passo-a-passo.md`.

### 6. (Muito depois) Ligar o envio e o TA

`FOOCCI_SDR_SEND_ENABLED=true` e `sdr_ia_config.ligado = true`. **Duas decisões
do CEO, separadas**, e nenhuma delas é desta rodada.

## Sintomas e causas

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| A Sala responde 401 para todos | ninguém cadastrado | passo 3 |
| A lista abre vazia | não há lead na base | é verdade, não defeito. Ver "leads antigos" abaixo |
| "Nenhum motivo cadastrado" no funil | seed não rodou | passo 2 |
| Não consigo marcar perdido | mesma coisa | passo 2 |
| Mensagem fica PENDENTE para sempre | envio desligado | é o desenho. Passo 6 |
| O "oi" chega no celular e não na Sala | recepção desligada | passo 5 |
| Painel diz "sem dados" em tudo | não há histórico ainda | é honesto. Aparece quando houver |
| Receita diz "valor não cadastrado" | propostas aceitas **sem o valor digitado** | não é falta de tabela: os três planos têm preço fechado e publicado desde 04/08. Quem fechou a proposta não gravou o valor nela |
| O SDR vê 3 de 4 leads | **é o escopo funcionando** | o quarto é de outra pessoa |
| 404 ao abrir uma conversa | o lead não é seu | idem — e é indistinguível de "não existe", de propósito |

## Os leads antigos

A base tem leads anteriores à Sala. Eles aparecem nas filas, mas sem conversa
(não havia `LeadMensagem` quando entraram) e sem score.

Não há script de retrofit nesta entrega, e **não deve haver um que invente
dados**: pontuar retroativamente um lead cuja ficha ninguém preencheu produziria
um score calculado sobre o vazio.

## O que nunca deve ser feito aqui

- **Semear lead de exemplo.** Um lead falso numa base comercial é
  indistinguível de um real três semanas depois, e alguém vai ligar para ele.
  Pior: entra na contagem do funil e contamina toda taxa da tela.
- **Ligar o TA e o envio no mesmo ato.** São duas decisões, e receber é seguro
  (a mensagem já chegou) enquanto enviar é falar em nome da empresa com um
  estranho.
- **Marcar disponibilidade de outra pessoa.** É tirá-la da fila em silêncio.
- **Desativar um motivo de perda e reaplicar o seed esperando ressuscitá-lo.**
  O seed não religa o que alguém desativou — desativar foi uma decisão.

## Conferência

```bash
npm run db:conferir-v3     # a estrutura da v3
npx vitest run src/services/salaDeVendas src/app/api/admin/sala-de-vendas
```

## Onde as coisas vivem

| O quê | Onde |
|---|---|
| Regras de negócio | `src/services/salaDeVendas/` |
| Rotas | `src/app/api/admin/sala-de-vendas/` |
| Telas | `src/app/admin/(area)/sala-de-vendas/` |
| Portão de contato (LGPD) | `src/services/foocci-sdr/LeadContactSafety.ts` |
| Recepção do WhatsApp | `src/services/foocci-sdr/FoocciSalesInbound.ts` |
| Canal de vendas | `src/services/foocci-sdr/FoocciSalesChannel.ts` |
| Migração | `prisma/migrations/20260825180000_sala_de_vendas_e_sdrs/` |
