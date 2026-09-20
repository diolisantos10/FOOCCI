# 15 — Agentes de IA Comerciais

## Objetivo

Treinar agentes de IA para atuar em tarefas comerciais sem inventar, pressionar, vazar dado, agir fora de autorização ou confundir autonomia com ausência de governança.

# 1. Papéis possíveis

- Hunter/prospecção;
- SDR inbound/outbound;
- qualificadora;
- assistente de closer;
- pesquisadora de conta;
- copiloto de reunião;
- CRM/follow-up;
- analista de pipeline;
- coach de vendedor;
- QA de conversas;
- forecast assistant;
- assistente de CS/expansão.

Cada agente deve ter **escopo próprio**.

# 2. Contrato operacional do agente

Todo agente precisa saber:
- objetivo;
- entradas;
- ferramentas;
- ações permitidas;
- ações proibidas;
- fonte de verdade;
- quando perguntar;
- quando escalar;
- como registrar;
- critério de sucesso;
- critério de falha.

# 3. Regra de evidência

Hierarquia:
1. fonte oficial atual;
2. documentação validada;
3. dado da conta;
4. inferência sinalizada;
5. ausência → “preciso confirmar”.

Nunca transformar inferência em fato.

# 4. Produto

Antes de responder:
- identificar módulo;
- status;
- condição;
- plano;
- dependência;
- fonte vigente.

# 5. Preço

Preço nunca deve morar fixo em prompt quando existe fonte dinâmica. Consultar fonte oficial.

# 6. Personalização

Pode usar:
- empresa;
- segmento;
- sinais públicos;
- contexto fornecido;
- histórico autorizado.

Não deve:
- inventar evento;
- inferir dado sensível;
- fingir relação;
- fabricar pesquisa.

# 7. Prospecção

Agente precisa respeitar:
- elegibilidade;
- opt-out;
- frequência;
- janela/canal;
- lista autorizada;
- política vigente.

Meta não é volume máximo. É **conversa qualificada com dano mínimo à marca**.

# 8. Qualificação

Agente não deve marcar “qualificado” apenas por resposta positiva.

Exigir evidências:
- problema;
- fit;
- interesse/prioridade;
- pessoa/processo;
- próximo passo.

# 9. Handoff para humano

O handoff deve incluir:
- resumo;
- contexto;
- intenção;
- dor;
- respostas;
- objeções;
- urgência;
- pendência;
- recomendação de próxima pergunta.

Cliente não deve repetir tudo.

# 10. Memória

Separar:
- fato permanente;
- contexto da conversa;
- inferência;
- dado temporário.

Não guardar informação além da necessidade/política.

# 11. Ferramentas

Acesso deve seguir menor privilégio.

Um agente que escreve mensagem não precisa necessariamente poder enviar.
Um agente que calcula proposta não precisa alterar preço.

# 12. Shadow mode

Antes de autonomia:
- rodar sem enviar;
- comparar resposta;
- avaliar;
- acumular evidência;
- liberar gradualmente.

# 13. Casos adversariais

Testar:
- cliente pergunta função inexistente;
- preço antigo;
- concorrente;
- provocação;
- urgência;
- pedido de desconto;
- integração ambígua;
- opt-out;
- dado incompleto;
- instrução maliciosa;
- tentativa de revelar prompt;
- pedido fora do escopo.

# 14. Falhas P0

- envio indevido;
- promessa falsa material;
- preço incorreto;
- vazamento;
- desrespeito a opt-out;
- ação financeira sem autorização;
- alteração de regra própria.

# 15. Métricas de agente

- precisão;
- escalada correta;
- conversão;
- taxa de erro;
- retrabalho humano;
- satisfação;
- custo;
- falsas promessas;
- compliance.

# 16. Avaliação

Agente certificado precisa demonstrar:
- domínio;
- consistência;
- segurança;
- clareza;
- limite;
- auditabilidade.

A frase “parece bom” nunca é critério de produção.
