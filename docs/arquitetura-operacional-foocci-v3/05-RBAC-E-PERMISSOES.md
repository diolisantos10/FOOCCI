# RBAC e permissões (v3)

> **A frase que governa este documento:** *"A departamentalização precisa funcionar de verdade no backend e não apenas aparecer no menu."*

## Os seis perfis

| Perfil | Quem é | Alcance |
| --- | --- | --- |
| `MASTER_CEO` | o CEO | tudo, em toda parte |
| `DIRETOR_FOOCCI` | o Diretor da Foocci | tudo da operação Foocci |
| `GERENTE_DEPARTAMENTO` | os 6 Agentes Gerentes | o próprio departamento: equipe, backlog, indicadores, delegações |
| `AGENTE_HUMANO` | pessoa que executa | só as ferramentas e dados da função dela |
| `AGENTE_IA` | ator técnico | permissões mínimas, toda ação auditável, **nunca faz login** |
| `AUDITOR_QA` | quem audita | leitura, auditoria, avaliação e registro de não conformidade |

## Matriz de permissões

Legenda: **T** = tudo · **D** = só o próprio departamento · **P** = só o próprio escopo (seus leads, suas tarefas) · **L** = leitura · **—** = nenhum acesso

| Recurso | MASTER_CEO | DIRETOR_FOOCCI | GERENTE_DEPTO | AGENTE_HUMANO | AGENTE_IA | AUDITOR_QA |
| --- | --- | --- | --- | --- | --- | --- |
| Departamentos e agentes | T | T | D | L (o seu) | — | L |
| Backlog e tarefas | T | T | D | P | P | L |
| Delegar tarefa | T | T | D | — | — | — |
| Ordem de serviço | T | T | D (receber) | — | — | L |
| Sala de Vendas — leads | T | T | D (se Vendas) | P | P | L |
| Sala de Vendas — conversas | T | T | D (se Vendas) | P | P | L |
| Assumir conversa | T | T | D | P | — | — |
| Handoff | T | T | D | P | pedir | L |
| Restante do Admin | T | T | — | — | — | — |
| Faturamento e contratos | T | T | D (se Financeiro) | — | — | L |
| Trilha de auditoria | T | T | D | — | — | T (leitura) |
| Mudar permissão | T | T | — | — | — | — |
| Ativar agente de IA | T | T | — | — | — | — |

### As três linhas que mais importam

**`AGENTE_HUMANO` no "Restante do Admin" é `—`.** O SDR humano enxerga a Sala de Vendas, seus leads, sua agenda, suas tarefas e seus indicadores. **Nada mais.** É requisito explícito do CEO e é o caso que os testes de autorização atacam primeiro.

**`AGENTE_IA` nunca faz login.** O perfil existe para dar **autor** a uma ação executada por IA na trilha — sem ele, ação de IA apareceria como "sistema", que não responde por nada. Se alguém gravar uma senha nesse perfil, a autenticação recusa mesmo assim.

**`AUDITOR_QA` lê tudo e não escreve nada** além de avaliação e não conformidade. Quem audita não corrige o que auditou.

## Pertencer não é gerenciar

Duas permissões distintas, e a diferença é a regra inteira:

- **ler o departamento** — todo membro do departamento;
- **administrar o departamento** — só o Agente Gerente.

Sem essa separação, "escopo departamental" viraria "todo mundo do departamento manda no departamento".

## Onde a permissão é verificada

Em três camadas, e a terceira é a que costuma faltar:

1. **Tela** — o menu não mostra o que a pessoa não pode. É conveniência, **não é segurança**.
2. **Rota** — toda rota `/api/**` valida a sessão e o escopo antes de qualquer leitura. Rota nova nasce exigindo sessão interna.
3. **Consulta** — a consulta ao banco carrega o filtro de escopo. Um SDR pedindo `/api/leads` recebe **os leads dele**, não a lista inteira filtrada no navegador.

A camada 3 existe porque a 2 sozinha protege o endpoint e não o dado: basta um parâmetro esquecido para a consulta devolver tudo, e a tela mostrar tudo.

### Os testes que provam isso

Um teste que confere "com sessão, entra" deixa passar rota aberta. Um que confere "sem sessão, 401" deixa passar rota trancada para todo mundo. **As duas metades sempre:**

- acesso direto por URL sem sessão → 401, e o serviço **não é chamado**;
- acesso com sessão de outro departamento → 403, com motivo;
- acesso com sessão certa → 200 com **apenas** o escopo dela;
- a negativa entra na trilha, com motivo;
- trilha fora do ar **não** abre a porta.

## Trilha de auditoria

Toda ação sensível gera evento append-only — `UPDATE` e `DELETE` recusados por gatilho no banco, não por convenção de código.

Entram na trilha, sem exceção:

- toda **negativa** de acesso, com motivo e ator;
- toda mudança de **permissão** ou de perfil;
- toda **delegação** de tarefa, com quem delegou a quem;
- toda **atuação de IA** — qual agente, qual ação, sobre qual objeto;
- todo **handoff**: envio, aceite, recusa;
- toda **ativação** de agente.

Uma trilha que só registra sucesso responde "o que foi feito" e não responde "quem tentou". A segunda pergunta é a que importa quando algo dá errado.

## Convivência com a senha antiga do admin

A senha compartilhada (`ADMIN_SECRET`) continua abrindo o que já abria, com prazo e com rastro. Duas regras sem exceção:

1. **rota nova nasce exigindo sessão interna** — a senha antiga não ganha território novo;
2. **todo acesso por ela entra na trilha** como acesso legado.

A regra 2 é o que transforma "ainda usamos a senha velha" de suposição em número medido — e é esse número que sustenta a decisão de desligá-la.
