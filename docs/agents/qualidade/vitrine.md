# Vitrine — qualidade

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
>
> Esta sala guarda o que se aprendeu **duvidando**: portão que mente, verde que
> não prova nada, varredura que não varre.

---

## `tsc` limpo e teste verde NÃO provam extração completa

Os resquícios de uma remoção sobreviveram exatamente onde **nenhum compilador
olha**: em `scripts/` (excluído do `tsconfig.json`) e em `.github/workflows/`.
Sete workflows liam um campo por `jq`; o campo foi renomeado, o `jq` passou a
devolver `null`, e **o portão reprovava para sempre por motivo falso** — sem que
uma linha de teste piscasse.

**Varredura de remoção inclui `scripts/` e `.github/` ou não é varredura.**

— promovido em 2026-08-05 pelo Diretor · origem: extração da Evolution, oficina de
`qualidade` de 2026-08-05

---

## Antes de acreditar num verde, pergunte: "se isso quebrasse agora, ficaria vermelho?"

Três verificações desta casa aprovavam sem provar nada, e as três foram
encontradas no mesmo dia:

1. O *health check* pós-deploy aceitava **qualquer 200** — e a versão antiga
   responde 200. **O portão aprovou com a construção quebrada** e escondeu um
   deploy falho por 45 minutos.
2. Um campo de segurança era `true` **fixo no código**: nunca provou nada, nem
   quando estava verde.
3. Um verificador de TLS concatenava `"000"` com `"000"` e comparava com `"000"` —
   passava sempre.

O padrão comum não é descuido: é **portão escrito olhando só o caminho feliz**.
Metade dos testes de um detector existe para provar que ele **reprova** quando
deve — sem essa metade, um detector que aprova sempre é indistinguível de um que
funciona.

— promovido em 2026-08-05 pelo Diretor · origem: passagem de bastão do Diretor
anterior, `docs/passagem-de-bastao-foocci-2026-08-05.md` §3.2

## A porta dos fundos é a ferramenta de teste

**Promovido por:** Diretor do Foocci · **Data:** 2026-08-05 ·
**Origem:** varredura de multi-inquilino · **Commit:** #102

A varredura achou 40+ rotas de produção corretas e **uma** furada: o simulador de
conversa do painel. Ele apagava cliente e histórico de pedidos por id cru — sem
checar restaurante, sem checar cargo — e contornava as três proteções que o
caminho oficial tinha (`chat-sim/session:26-41` × `customers/[id]:50-55`).

Motivo: quem escreve sandbox pensa em dado descartável e esquece que a rota vive
no mesmo servidor e no mesmo banco. Entre ~140 rotas de inquilino revisadas, foi
a única sem check-then-write.

**Toda varredura de autorização começa pelas rotas com `sim`, `test`, `debug`,
`preview` ou `diagnostic` no caminho.**

## Função fail-closed não protege quem a chama

**Promovido por:** Diretor do Foocci · **Data:** 2026-08-05 · **Origem:** a mesma varredura

`lib/stone.ts:141` faz `if (!secret) return false` — certinho — e o comentário
entrega o problema: *"para o chamador decidir se aceita webhook sem assinatura"*.
O chamador decidiu aceitar. No Instagram é pior: a função é **fail-open**, a rota
só escapa porque `[].some()` é `false`, e **o teste congela o fail-open como
comportamento esperado**.

**Auditar verificação de segredo é auditar a decisão do CHAMADOR, não a do
verificador — e desconfiar do teste que protege o defeito.**

## Portão que reprova por sorte deixou de ser portão

**Promovido por:** Diretor do Foocci · **Data:** 2026-08-05

Três testes da pasta `quality/` reprovaram por CARGA num único dia. Todos passam
por `runAll()`, que executa todos os auditores — são segundos por natureza,
contra um limite de 5s pensado para teste unitário. Rodando sozinhos, passavam.

Três ocorrências não são azar: é a família inteira medindo determinismo com o
cronômetro errado. **Quem vê um portão reprovar sem motivo aprende a rodar de
novo até passar** — e a partir daí ele não barra mais nada. Prazo próprio para a
família, nenhuma asserção afrouxada.
