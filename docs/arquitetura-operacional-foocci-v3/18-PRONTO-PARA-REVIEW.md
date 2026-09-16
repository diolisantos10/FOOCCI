# Pacote pronto para revisão

Branch: `chatgpt/fix-meta-cold-template-copy`

Mudanças funcionais:

1. variável `{{1}}` deixa de encerrar os templates 01 e 02;
2. exemplo da variável continua sendo enviado pelo endpoint existente;
3. `NONE` deixa de aparecer como erro na Sala Comercial;
4. teste protege a regra de posição da variável.

Após merge na branch de produção, o Railway deverá criar um novo deployment. Só depois de `SUCCESS` a interface deve ser atualizada e uma nova submissão deve ser tentada.
