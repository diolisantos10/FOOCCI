# ADR-003 — Identidade interna convive com `ADMIN_SECRET` por prazo, não para sempre

**Data:** 24/08/2026 · **Estado:** proposto, aguardando aceite do proprietário
**Fase:** 0 · **Afeta:** Fase 1 e todas as seguintes

## Contexto

Todo o `/admin` é protegido por uma senha única (`ADMIN_SECRET`), como o próprio `src/lib/admin-auth.ts` documenta:

> *"Global admin access is gated by `ADMIN_SECRET` env var — no DB user required."*

O model `User` não serve: é do restaurante (`restaurantId` obrigatório, `@@unique([email, restaurantId])`).

Sem identidade interna, nada do núcleo é construível de verdade. Não existe "responsável pela tarefa", "autor da decisão", "quem assumiu a conversa" nem RBAC por departamento — todos seriam campos de texto sem lastro, e o documento 07 exige o contrário.

Trocar tudo de uma vez, porém, é a receita para trancar o dono para fora do próprio admin num sábado.

## Decisão

1. Criar `InternalUser` + sessão interna **sobre o NextAuth que já existe**, sem trocar o stack de autenticação.
2. `ADMIN_SECRET` continua válido durante a transição, com duas travas:
   - toda rota nova nasce exigindo sessão interna — `ADMIN_SECRET` **não** abre o que é novo;
   - o acesso por `ADMIN_SECRET` passa a ser registrado como ator `LEGACY_ADMIN_SECRET` na trilha de auditoria, para a convivência ser medida e não presumida.
3. A data de desligamento é **decisão do proprietário**, tomada quando ele tiver login próprio funcionando — não antes, e não por iniciativa da engenharia.

## Alternativas descartadas

**Desligar `ADMIN_SECRET` junto com a Fase 1.** Tecnicamente mais limpo, operacionalmente irresponsável: qualquer defeito no login novo deixa a empresa sem admin.

**Manter `ADMIN_SECRET` como atalho permanente do CEO.** Vira a porta que ninguém fecha, e o RBAC inteiro passa a ser decorativo — exatamente o *"menu oculto como autorização"* que o comando proíbe.

## Consequências

- Durante a transição existem duas portas. É risco real e está declarado; a mitigação é que a porta velha não abre nada novo e deixa rastro.
- O relatório de convivência (quantos acessos ainda entram por `ADMIN_SECRET`, e em quais rotas) vira o dado que sustenta a decisão de desligar.
- Se em dois ciclos o número não cair, isso é sinal de que o login novo não está sendo usado — e o problema é de adoção, não de segurança.
