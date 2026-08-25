# 06 — RBAC e permissões

## As três camadas

| Camada | O que protege | Onde vive |
|---|---|---|
| **Tela** | conveniência — **não é segurança** | menu por papel |
| **Rota** | o endereço | `guardarSalaDeVendas`, `autorizarInterno` |
| **Consulta** | **o dado** | `escopoDaConsulta` no `where`, `podeVerOLead` |

A terceira é a que costuma faltar. A rota protege o endereço; a consulta protege
o dado. Confundir as duas é como o RBAC vira porta com fechadura e janela
aberta.

## A matriz

| | MASTER_CEO | DIRETOR_FOOCCI | GERENTE_DEPTO | AGENTE_HUMANO | AUDITOR_QA |
|---|---|---|---|---|---|
| Entrar na Sala | ✅ | ✅ | ✅ | ✅ | ✅ (lê) |
| Ver leads | todos | todos | todos | **só os dele** | todos |
| Assumir / devolver | ✅ | ✅ | ✅ | ✅ | — |
| Escrever na conversa | ✅ | ✅ | ✅ | ✅ | — |
| Mover no funil | ✅ | ✅ | ✅ | ✅ | — |
| Sair de etapa terminal | ✅ | ✅ | ✅ | — | — |
| Distribuir automaticamente | ✅ | ✅ | ✅ | — | — |
| Tirar lead de outra pessoa | ✅ | ✅ | ✅ | — | — |
| Painel do gerente | ✅ | ✅ | ✅ | **—** | ✅ |
| Avaliar no QA | ✅ | ✅ | ✅ | — | ✅ |
| Contestar avaliação | — | — | — | ✅ | — |
| Revisar contestação | ✅ | ✅ | ✅ | — | **—** |

`AGENTE_IA` não abre tela: ator técnico não tem sessão. As ações da IA passam
pelo serviço, com autor registrado.

## As decisões que não são óbvias

### O painel do gerente não reaproveita a guarda da Sala

A guarda aceita `AGENTE_HUMANO` de propósito — a Sala é a área dele. O painel
mostra carga, produtividade e nota de QA de **todo o time**, e o SDR ver o
desempenho comparado dos colegas não é transparência.

Reaproveitar a guarda seria o caminho curto que abre a porta errada. A lista de
papéis do painel é escrita à parte.

### O auditor avalia e não revisa contestação

Quem deu a nota não julga o recurso contra a própria nota. É a mesma regra da
não conformidade: quem encontra não assina a liberação.

### Cada um muda o próprio estado de disponibilidade

Não há `userId` no corpo da requisição. Um SDR marcando outro como pausado é uma
forma silenciosa de tirá-lo da fila.

### O SDR não avalia conversa de colega

Hierarquia informal nasce exatamente assim: por um botão aberto.

## `podeVerOLead` — a camada que faltava

`escopoDaConsulta` protege as **listas**. Mas a tela de atendimento busca **um**
lead, por id, vindo da URL.

Sem esta checagem,
`/api/admin/sala-de-vendas/conversa?leadId=<qualquer>` devolveria a conversa de
qualquer prospecto a qualquer SDR autenticado: a guarda de rota diria "sim, você
é da Sala" e entregaria o dado. A tela nunca pediria isso — e é por isso que o
defeito passa despercebido: ele só existe fora da tela.

O SDR alcança: o que é dele, o que não é de ninguém, e o que espera gente.

### Por que 404, e não 403

Um 403 confirmaria que o lead existe. Num sistema comercial isso já é
informação: dá para varrer ids e medir o tamanho da base sem ler um dado sequer.

"Não encontrado" é a mesma resposta para o lead que não existe e para o que não é
seu — e as duas são verdade da posição de quem perguntou. Há um teste que exige
que as duas respostas sejam **indistinguíveis**.

## A trilha

Toda negativa entra em `InternalAuditEvent` com ator, ação, recurso e motivo.

**Trilha fora do ar não abre a porta:** o `catch` em volta da gravação do log não
altera a decisão. É o caso que faz uma checagem de segurança virar decorativa, e
há teste para ele.
