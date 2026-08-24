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

### Fase 1 · PR 1.1 — Identidade interna, departamentos e RBAC

Construído em 24/08/2026, com o proprietário ausente e sob autorização dele. Cada decisão tomada no lugar dele está em **ADR-005**, uma a uma, para poder ser revertida sabendo o quê e por quê.

- **5 tabelas novas**, aditivas: `departments`, `positions`, `internal_users`, `department_memberships`, `internal_audit_events`. Migração gerada por diferença de schema e **aplicada num Postgres limpo para provar que roda** — zero `DROP`, zero `ALTER` destrutivo.
- **Identidade interna** (`src/lib/internal-auth.ts`): sessão própria com cookie assinado por HMAC, senha em bcrypt como o resto da casa. Fora do NextAuth de propósito — colocar o pessoal da Foocci lá exigiria inventar um restaurante fictício para a própria empresa.
- **RBAC no servidor**, separando *pertencer* de *gerenciar*: membro de Vendas lê Vendas, só o gerente administra.
- **Convivência com `ADMIN_SECRET`** (ADR-003): rota nova não aceita a senha antiga, e todo acesso por ela entra na trilha como `LEGACY_ADMIN_SECRET`.
- **9 departamentos e 12 cargos** semeados. **Todos os cargos nascem vagos** — ninguém foi inventado.
- **Segredo de sessão é trava, não recomendação:** em produção, sem `INTERNAL_SESSION_SECRET`, o sistema recusa e explica em vez de sortear um segredo por instância — que derrubaria o login de forma intermitente, sem erro no log (ADR-005, decisão 6).
- **36 testes novos:** 12 do organograma, 14 do RBAC, 4 da trava do segredo e 6 de integração contra banco real.
- **O tipo do teste passa a ser conferido** no código deste programa (`npm run type-check:tests`) — o `type-check` da casa exclui teste, e foi assim que um teste meu com dois campos inexistentes ficou verde. Ver achado A-03.
- **Suíte inteira verde:** `tsc --noEmit` limpo, 6.588 testes passando em 506 arquivos. Nenhum teste da casa quebrou.

---

## Em andamento

Nada. O PR 1.1 está pronto para revisão; o 1.2 começa quando este for aceito.

---

## Não iniciado

| Fase | Departamento / entrega | Depende de |
| --- | --- | --- |
| 1b | Fichas de agente sobre `AgentProfile` (PR 1.2) | PR 1.1 |
| 1c | OS, projetos, tarefas e handoffs (PR 1.3) | PR 1.2 |
| 1d | Aprovações, decisões, eventos e dashboard (PR 1.4) | PR 1.3 |
| 1e | Divisão do schema por domínio (PR 1.5, ADR-004) | PR 1.4 |
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

### D-01 · Os quatro ADRs da Fase 0 — confirma? ✅ *adotados sob autorização*

Segui os quatro como aprovados durante a ausência do proprietário (ADR-005). A confirmação continua devida — o custo de reverter é baixo, porque a Fase 1 é aditiva e nada foi ativado.

| ADR | O que decide | Recomendação |
| --- | --- | --- |
| 001 | Conversa de prospect ganha tabelas próprias; a doutrina será corrigida onde diz "reutilizar" algo que não existe como tabela | aprovar |
| 002 | A ficha de agente **estende** `AgentProfile`; não nasce uma segunda | aprovar |
| 003 | `ADMIN_SECRET` convive com o login novo por prazo, com rastro | aprovar |
| 004 | O schema passa a ser dividido por domínio, em PR isolado | aprovar |

### D-02 · Quem ocupa cada cargo? *(não trava mais)*

Resolvi o bloqueio sem inventar ninguém: a hierarquia foi construída sobre **cargos**, e os 12 cargos nascem **vagos**. A Fase 1 andou.

Falta o fato: **quem é o CEO, o Diretor Foocci e o Gerente Geral** — pode ser a mesma pessoa nos três. Um comando preenche:

```bash
npx tsx scripts/criar-usuario-interno.ts --email <email> --nome "<nome>" --papel CEO --cargo ceo
```

Enquanto ninguém for cadastrado, o sistema funciona e diz a verdade: cargo vago aparece como vago.

### D-03 · Quando desligar o `ADMIN_SECRET`?

Não precisa ser agora. Precisa ter data, senão vira a porta que ninguém fecha. Sugestão: decidir quando o login próprio estiver funcionando e medido.

### D-04 · Teto de custo por lead e por campanha (Fase 3)

Sem teto, o gate humano de orçamento não tem contra o quê comparar.

### D-05 · Qual é a fonte financeira confiável? (Fase 10)

`FECHADO` no funil **não** é receita. Sem uma fonte de verdade financeira, o dashboard executivo mostra "não medido" no lugar de faturamento — o que é honesto, mas provavelmente não é o que o CEO quer ver.

---

## Achados registrados (não são decisão do CEO — são fatos com dono a definir)

_Todos anteriores a este programa. Nenhum bloqueia a Fase 1. Nenhum foi consertado aqui: mexer em área alheia dentro do PR da organização interna é desvio de escopo, e some do radar depois._

### A-01 · A cadeia de migrações não replica do zero

`20250506000000_saipos_integration` falha num banco limpo. Não atrapalha hoje — produção existe e está adiante disso. Mas significa que **não dá para reconstruir o banco do zero**, o que atinge ambiente de teste novo, onboarding e recuperação de desastre.

### A-02 · Dois arquivos de teste diferem só na caixa da letra

`crmExecutionClassification.test.ts` e `CrmExecutionClassification.test.ts` são **dois arquivos diferentes**, os dois versionados. Em Mac ou Windows — sistemas indiferentes a maiúscula — um sobrescreve o outro no clone e **um dos testes some sem avisar**. Aqui em Linux os dois convivem, e é por isso que ninguém viu.

### A-03 · ~750 erros de tipo em ~150 arquivos de teste antigos

O `type-check` da casa exclui teste de propósito, para o `next build` só olhar o que vai para produção. O efeito colateral é que o tipo do teste nunca é conferido — o Vitest apaga os tipos e roda assim mesmo.

Ligando a conferência no repositório inteiro aparecem ~750 erros, quase todos de índice não checado em código de teste. É dívida antiga, medida agora. **O número está aqui em vez de escondido atrás de uma lista de exclusões** que pareceria cobertura sem ser.

Fica valendo para o código deste programa, que nasce limpo: `npm run type-check:tests`. E `npm run type-check:scripts`, que já cobre `scripts/` inteiro e está verde.

---

## Duas pendências antigas que este programa não resolve sozinho

Já estavam registradas no backlog do Foocci e continuam de pé. Nenhuma é bloqueio da Fase 1, mas as duas bloqueiam a Fase 2 fechar o ciclo com envio real:

1. **O número de WhatsApp de vendas da Foocci não existe.** Sem ele, a Sala de Vendas é construída e testada, mas não fala com ninguém.
2. **Não há conta de teste isolada.** Sem ela não há como exercitar o fluxo ponta a ponta sem tocar em dado real.

Ambas são decisão do proprietário, não de engenharia.
