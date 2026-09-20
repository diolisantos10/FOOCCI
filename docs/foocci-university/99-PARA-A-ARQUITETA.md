# 99 — Contrato para a IA arquiteta

## O que você receberá desta pasta

A Foocci University será construída a partir de uma base de conhecimento já tratada comercialmente. A arquiteta **não deve investigar o produto do zero nem reinterpretar fatos**; deve transformar conteúdo validado em experiência de aprendizagem.

O conteúdo final terá três camadas:

1. **Conhecimento de produto** — o que a Foocci faz, limites, evidências e demo.
2. **Competência comercial** — discovery, diagnóstico, argumentação, demo, objeção, negociação, fechamento e CRM.
3. **Avaliação** — quiz, caso, role play, demo e certificação.

## Dois tipos de aluno

### Pessoa
Precisa compreender, praticar, receber feedback, revisar e provar competência.

### Agente de IA
Precisa de fatos estruturados, regras, exemplos positivos/negativos, limites, cenários, testes e critérios de aprovação.

A sala deve permitir que o mesmo módulo tenha uma representação pedagógica para humano e uma representação estruturada para IA, sem duplicar a verdade factual.

## Estrutura mínima de um módulo

Cada módulo final deverá expor campos equivalentes a:

- `id`
- `titulo`
- `versao`
- `ultimaValidacao`
- `publicos`
- `prerequisitos`
- `objetivosDeAprendizagem`
- `conteudo`
- `fontesFactuais[]`
- `afirmacoesProibidas[]`
- `exemplosCorretos[]`
- `exemplosIncorretos[]`
- `exercicio`
- `quiz`
- `simulacao`
- `criterioDeAprovacao`

## Requisito de rastreabilidade

A interface deve conseguir dizer **de onde veio o fato** e **quando ele foi validado**.

Se um módulo ensinar “o plano custa X”, a fonte não é o texto da aula: é a fonte canônica de preço. Se a fonte mudar, o conteúdo precisa sinalizar revalidação.

## Certificação

A certificação não deve ser “assistiu = concluiu”.

Estrutura prevista:
- prova de produto;
- prova comercial;
- role play;
- demonstração;
- objeções;
- simulação de fechamento.

Estados:
- **EM TREINAMENTO**
- **APTO COM SUPERVISÃO**
- **CERTIFICADO FOOCCI**

A rubrica de QA já existente na Sala de Vendas deve ser reaproveitada como base, principalmente os critérios de segurança da informação e conformidade.

## O que não construir antes do conteúdo final

- aula gerada automaticamente a partir de documento histórico;
- ranking/gamificação sem critério de domínio;
- certificado só por progresso;
- resposta automática que trate `NÃO VALIDADO` como verdade;
- cópia de preço em banco próprio da University;
- assistente que responda sobre produto sem citar o estado factual da informação.

## Integração conceitual com o Comercial

A University pertence ao Comercial Foocci. A implementação futura deve considerar o trabalho que já existe em `/comercial`: vendedor, gerente, QA e agentes de IA já têm papéis distintos.

A arquiteta decide a experiência e a integração técnica depois. Esta pasta decide **o que precisa ser aprendido e provado**.
