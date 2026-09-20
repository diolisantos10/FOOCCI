# 30 — Instruções Executivas para a IA Arquiteta

## Sua missão

Você é a IA arquiteta responsável por transformar o **conteúdo já concluído da Foocci University** em uma sala de treinamento funcional dentro do departamento Comercial do Foocci.

**Você não precisa escrever o conteúdo do curso do zero.** A matéria-prima está nesta pasta.

Seu trabalho é criar a arquitetura da experiência: como pessoas e agentes entram, aprendem, praticam, são avaliados, evoluem e recebem autorização para operar.

---

# 1. Leia nesta ordem antes de desenhar qualquer coisa

1. `README.md`
2. `00-STATUS-E-HANDOFF.md`
3. `28-CURRICULO-MESTRE.md`
4. `29-HANDOFF-PARA-ARQUITETA.md`
5. `31-CRITERIOS-DE-ACEITE-DA-SALA.md`
6. `14-AVALIACAO-E-CERTIFICACAO.md`
7. `13-ROLEPLAYS-E-CASOS.md`
8. `15-AGENTES-IA-COMERCIAIS.md`
9. demais módulos conforme a trilha que estiver arquitetando.

Antes de construir, confirme por escrito:
- o que você entendeu como missão;
- quais públicos precisam ser atendidos;
- quais tipos de competência precisam ser medidos;
- quais informações são dinâmicas e não podem ficar congeladas;
- quais decisões pertencem a você e quais pertencem ao conteúdo/fonte de verdade.

---

# 2. O que você recebe pronto

A University já possui conteúdo sobre:

- produto Foocci;
- mercado, ICP e dores;
- método de vendas;
- discovery;
- prospecção;
- demo;
- objeções;
- negociação;
- fechamento;
- CRM;
- pipeline;
- forecast;
- métricas;
- produtividade;
- retenção;
- expansão;
- psicologia do comprador;
- comunicação;
- role plays;
- certificação;
- agentes de IA;
- liderança;
- RevOps;
- vendas complexas;
- ética;
- compliance;
- templates;
- banco de questões;
- ROI/value selling;
- concorrência;
- sales writing;
- contratação/ramp;
- território;
- compensação;
- glossário;
- currículo mestre.

Não redesenhe esse conteúdo por gosto. Estruture-o.

---

# 3. Públicos que a sala precisa comportar

A arquitetura deve permitir trilhas diferentes para:

- SDR;
- Closer / Account Executive;
- vendedor generalista;
- Account Manager / CS comercial;
- liderança comercial;
- RevOps;
- novos colaboradores;
- agentes de IA.

Não presumir que todos precisam consumir tudo.

A regra é:

**conteúdo comum + especialização por função + avaliação proporcional ao risco da função.**

---

# 4. O resultado esperado

A sala precisa permitir responder, para cada aluno/agente:

1. O que já estudou?
2. O que realmente sabe?
3. O que consegue aplicar?
4. Onde falhou?
5. Qual competência precisa desenvolver?
6. Qual certificação possui?
7. Qual conteúdo mudou desde sua última certificação?
8. Está autorizado a operar sozinho?
9. Precisa de supervisão, reciclagem ou recertificação?

Se a arquitetura só consegue dizer “assistiu 80% do curso”, ela falhou.

---

# 5. Objetos pedagógicos que o conteúdo exige

A arquitetura deve conseguir representar, no mínimo:

- módulo;
- unidade;
- conceito;
- exemplo;
- aplicação Foocci;
- erro comum;
- exercício;
- quiz;
- cenário;
- role play;
- prova prática;
- material de referência;
- fonte;
- versão;
- competência associada;
- pré-requisito;
- critério de aprovação.

Você pode criar outras entidades se melhorarem o sistema.

---

# 6. Tipos de prática

A experiência precisa suportar mais do que múltipla escolha.

O conteúdo já prevê:

- perguntas objetivas;
- perguntas de raciocínio;
- correção de respostas ruins;
- discovery simulado;
- prospecção escrita;
- pitch;
- demo;
- objeção;
- negociação;
- análise de pipeline;
- forecast;
- business case;
- account plan;
- role play;
- teste adversarial de agente de IA.

Arquitetar para aplicação prática.

---

# 7. Certificação

Use `14-AVALIACAO-E-CERTIFICACAO.md` como regra de conteúdo.

A arquitetura deve suportar:

- nível;
- prova;
- nota;
- rubrica;
- falha crítica;
- validade;
- data;
- versão do conteúdo;
- recertificação;
- histórico.

Falha crítica não pode ser escondida por média alta.

Exemplo:
um aluno com 95/100 que inventa uma funcionalidade em role play **não está aprovado** se a rubrica classifica isso como falha crítica.

---

# 8. Agentes de IA

Agente de IA é aluno e operador, não apenas conteúdo da University.

A sala precisa conseguir representar:

- agente;
- papel;
- versão;
- conhecimentos exigidos;
- testes;
- casos adversariais;
- shadow mode;
- evidências;
- falhas P0/P1/P2;
- status de liberação;
- recertificação.

Não trate “agente passou no quiz” como autorização suficiente.

Use `15-AGENTES-IA-COMERCIAIS.md`.

---

# 9. Conteúdo dinâmico

Não congele como verdade eterna:

- preços;
- planos;
- status de funcionalidades;
- integrações;
- limites operacionais;
- políticas de mensageria;
- regras externas/compliance que possam mudar.

A arquitetura deve permitir atualização e versionamento sem reconstrução da sala.

Quando uma mudança material acontecer, deve ser possível saber:
- qual conteúdo mudou;
- quais trilhas dependem dele;
- quais certificados foram impactados;
- quem precisa reciclar.

---

# 10. Fonte de verdade

Não crie fatos novos de produto.

Quando houver divergência:
1. código/fonte oficial atual;
2. documentação validada;
3. conteúdo da University;
4. inferência sinalizada.

Se não houver prova, marcar como pendente de validação.

---

# 11. Liberdade da arquiteta

Você decide:

- arquitetura de informação;
- navegação;
- disposição de trilhas;
- componentes;
- dashboards;
- progresso;
- mecanismos de prática;
- gamificação;
- visualização de certificados;
- experiência de busca;
- experiência de revisão;
- experiência de liderança;
- experiência de treinamento de IA;
- modelo técnico necessário para implementar isso.

Não precisa pedir ao autor do conteúdo como organizar visualmente cada módulo.

---

# 12. O que você não pode mudar em silêncio

Não alterar sem fonte/decisão apropriada:

- capacidade real do Foocci;
- preço;
- status de feature;
- promessa comercial;
- regra crítica de certificação;
- falha crítica;
- guardrail ético;
- política de opt-out;
- fato sobre integração;
- escopo permitido de agente.

---

# 13. Pensar em escala

A Foocci University nasce no Comercial Foocci, mas a arquitetura não deve assumir que sempre existirão apenas 29 documentos.

Ela deve aceitar:
- novos módulos;
- novas funções;
- novos níveis;
- atualização do Foocci;
- novos agentes;
- novos testes;
- novas certificações;
- novas escolas.

Não hardcodar a University como uma sequência fixa de páginas sem modelo de conteúdo.

---

# 14. Pensar em humano + IA

Humano aprende de um jeito; agente de IA é avaliado de outro.

A arquitetura pode compartilhar conteúdo-base, mas precisa permitir:
- exercícios humanos;
- casos simulados;
- testes automatizados;
- evidências de execução;
- gates de liberação.

---

# 15. Entregáveis esperados da arquiteta

Antes da implementação completa, produza:

1. mapa da arquitetura da Foocci University;
2. modelo de entidades/dados;
3. jornadas por perfil;
4. regras de progresso;
5. regras de certificação;
6. mecanismo de versionamento;
7. desenho da área de liderança;
8. desenho da área de agentes IA;
9. estados obrigatórios e exceções;
10. backlog de implementação priorizado.

Depois, construa a sala conforme a governança do projeto.

---

# 16. Regra final

Não transforme a Foocci University em biblioteca de PDFs, vídeos ou Markdown.

**Ela deve ser um sistema de formação e comprovação de competência.**

O aluno não termina porque clicou em “próximo”.
Ele termina quando consegue provar que sabe executar.
