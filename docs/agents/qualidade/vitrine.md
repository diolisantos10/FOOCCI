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
