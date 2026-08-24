# Status da construção — Sistema Operacional Foocci

_Atualizado em 24/08/2026. Este arquivo é o índice de progresso do programa. Uma fase só muda de coluna quando o gate do documento 07 for cumprido — não quando o código existir._

---

## Feito

### Fase 0 — Raio-X e mapa de reaproveitamento

- Os 10 documentos da fonte canônica lidos na ordem de `00-LEIA-PRIMEIRO.md`.
- Repositório auditado: 143 models, 37 páginas de admin, ~190 rotas de API, 45 serviços.
- Mapa `EXISTE / PARCIAL / A CONSTRUIR / N/A` publicado em `10-RAIO-X-E-MAPA-DE-REAPROVEITAMENTO.md`.
- Catálogo de 32 fichas de agente publicado em `11-FICHAS-DOS-AGENTES.md`.
- Quatro ADRs registrados.
- Baseline: `tsc --noEmit` **limpo**; suíte Vitest e `next build` no PR.
- Produção intocada. Nenhuma migração aplicada.

---

## Em andamento

Nada. A Fase 1 aguarda as duas decisões do proprietário listadas abaixo.

---

## Não iniciado

| Fase | Departamento / entrega | Depende de |
| --- | --- | --- |
| 1 | Núcleo operacional compartilhado | decisões D-01 e D-02 |
| 1b | Divisão do schema por domínio (ADR-004) | Fase 1 |
| 2 | Vendas e Receita — Sala de Vendas | Fase 1 |
| 3 | Marketing & Growth | Fase 1 |
| 4 | Implantação e Onboarding | Fase 2 |
| 5 | Sucesso do Cliente e Suporte | Fase 1 |
| 6 | Produto e Experiência | Fase 1 |
| 7 | Agentes e Inteligência do Produto | Fase 1 |
| 8 | Tecnologia, Operações e Integrações | Fase 1 |
| 9 | Qualidade, Segurança e Compliance | Fase 1 |
| 10 | Financeiro e Administrativo | Fase 1 |
| 11 | Integração ponta a ponta e governança | todas |

---

## Decisões do CEO

_A Fase 1 não começa sem as duas primeiras. As demais têm data mais folgada, mas estão aqui para não sumirem._

### D-01 · Os quatro ADRs da Fase 0 — aprovados? ⛔ **trava a Fase 1**

| ADR | O que decide | Recomendação |
| --- | --- | --- |
| 001 | Conversa de prospect ganha tabelas próprias; a doutrina será corrigida onde diz "reutilizar" algo que não existe como tabela | aprovar |
| 002 | A ficha de agente **estende** `AgentProfile`; não nasce uma segunda | aprovar |
| 003 | `ADMIN_SECRET` convive com o login novo por prazo, com rastro | aprovar |
| 004 | O schema passa a ser dividido por domínio, em PR isolado | aprovar |

### D-02 · Quem entra no sistema, e com qual papel? ⛔ **trava a Fase 1**

O admin inteiro é uma senha compartilhada hoje. Para construir hierarquia e RBAC é preciso saber quem existe.

Mínimo para começar: **quem é o CEO, quem é o Diretor Foocci, quem é o Gerente Geral** — e se, no início, a mesma pessoa acumula os três (o plano mestre já prevê acúmulo).

### D-03 · Quando desligar o `ADMIN_SECRET`?

Não precisa ser agora. Precisa ter data, senão vira a porta que ninguém fecha. Sugestão: decidir quando o login próprio estiver funcionando e medido.

### D-04 · Teto de custo por lead e por campanha (Fase 3)

Sem teto, o gate humano de orçamento não tem contra o quê comparar.

### D-05 · Qual é a fonte financeira confiável? (Fase 10)

`FECHADO` no funil **não** é receita. Sem uma fonte de verdade financeira, o dashboard executivo mostra "não medido" no lugar de faturamento — o que é honesto, mas provavelmente não é o que o CEO quer ver.

---

## Duas pendências antigas que este programa não resolve sozinho

Já estavam registradas no backlog do Foocci e continuam de pé. Nenhuma é bloqueio da Fase 1, mas as duas bloqueiam a Fase 2 fechar o ciclo com envio real:

1. **O número de WhatsApp de vendas da Foocci não existe.** Sem ele, a Sala de Vendas é construída e testada, mas não fala com ninguém.
2. **Não há conta de teste isolada.** Sem ela não há como exercitar o fluxo ponta a ponta sem tocar em dado real.

Ambas são decisão do proprietário, não de engenharia.
