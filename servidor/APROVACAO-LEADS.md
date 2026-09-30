# Aprovação dos cadastros públicos

## Ativação

1. As migrações `supabase/migracoes/20260918160000_aprovacao_de_leads.sql` e `20260918170000_dois_planos_clientes.sql` foram aplicadas em produção em 18/09/2026, nessa ordem. Não reaplicar. As tabelas restritas `backup_planos_20260918` e `backup_clientes_planos_20260918` preservam o enquadramento anterior.
2. Publicar o servidor e os dois frontends. Não reiniciar o motor enquanto houver sessões ativas sem autorização para interrompê-las.
3. Conferir Administração → Clientes → Aprovação de clientes em cada marca.

A migração não converte retroativamente a base antiga e não aprova ninguém. Novos envios entram automaticamente na fila, inclusive pelo armazenamento alternativo de auditoria.

## Recadastro (aplicado em produção em 30/09/2026)

A migração `20260930170442_teeds_recadastro_preserva_historico` está aplicada no banco compartilhado por Teeds e OMNI e exportada em `supabase/migracoes/`. Não reaplicar `servidor/sql/recadastro-aprovacao.sql`. As consultas REST de aprovação das duas marcas responderam HTTP 200. Os testes de recadastro em transação desfeita confirmaram deduplicação, novo ciclo após recusa e preservação integral da conta existente, sem disparar e-mails reais.

- Um e-mail já existente na marca também entra em aprovação, sinalizado como “Já estava na base — recadastro aguardando aprovação”.
- Repetições enquanto pendente atualizam a mesma solicitação; uma ficha em processamento fica estável. Após aprovação ou recusa, um novo formulário abre outra solicitação com novo ID, preservando a decisão e o envio anteriores.
- Não cria clientes duplicados nem altera a senha pelo envio público. Ao aprovar um recadastro, o administrador renova a senha para a provisória configurada e exige troca no primeiro acesso após a liberação. Histórico, plano e validade existentes são preservados; não reativa automaticamente acessos suspensos/vencidos. Contas administrativas são excluídas dessa renovação.
- A base antiga não entra em massa na fila nem recebe disparos por esta alteração. Apenas novos formulários produzem solicitações; edições administrativas nos leads não disparam recadastro.
- `inscricao_recebida_em` é marcado pelo servidor no envio do formulário. A alteração é compartilhada por login e `/cadastro`, com isolamento entre Teeds e OMNI.
- Teste isolado: `PGLITE_MODULE=/caminho/do/pglite/dist/index.js node servidor/teste-recadastro-banco.mjs`.

## Comportamento

- O formulário cria ficha em `clientes_pendentes`, visível na seção Clientes. O fluxo atual prepara a conta e envia o e-mail de cadastro antes da aprovação; contas novas continuam com acesso pendente. O registro original do lead permanece.
- Somente servidor autenticado como administrador da marca pode aprovar ou recusar. A decisão é registrada com administrador e horário.
- Aprovar prepara o login com senha provisória e troca obrigatória; contas pendentes recebem o plano escolhido por 30 dias. No recadastro, a conta existente mantém histórico e recebe a senha provisória somente nessa aprovação. Retomar a mesma aprovação não redefine a senha pela segunda vez.

## Dois planos

`essencial` = Sem simulador; `pro` = Com simulador. Apenas esses dois são oferecidos. Planos antigos são desativados para preservar histórico. A migração mantém o simulador para quem possui liberação ativa e não vencida do produto `simulador-treino`; não muda validade/status dos clientes nem a tabela de administradores. Novos cadastros diretos começam sem simulador.

A permissão da conta demo/simulador da Deriv é consultada no banco por marca; o servidor confere antes de iniciar/retomar robôs demo. O navegador não conecta conta demo sem permissão e nunca seleciona dinheiro real automaticamente após a retirada da demo. A conta real deve ser escolhida pelo usuário. Essa restrição é da plataforma, não impede usar uma conta demo diretamente na Deriv.

Publicar banco antes dos frontends/servidor: a ausência das funções novas bloqueia o simulador por segurança. Sessões já em execução não são interrompidas por alteração de plano; a nova permissão vale na próxima conexão/início/retomada.
- Uma aprovação interrompida pode ser retomada após dois minutos na aba Em aprovação. A trava vive no banco, não apenas na memória do processo.
- E-mails de aprovação são enviados pelo Resend a cada 30 segundos; permanecem pendentes em caso de falha. Remetente, identidade e endereço da plataforma vêm da marca.
- O e-mail de cadastro informa senha provisória apenas para conta criada nessa solicitação. Ela entra na tela de espera, antes da tela de troca de senha. Contas existentes recebem confirmação da análise e aguardam a aprovação para renovar a senha.
- O e-mail de aprovação inclui a senha provisória somente quando o marcador administrativo comprova que foi preparada para essa solicitação. Se o titular já escolheu outra senha ou houve outro ciclo, orienta usar a senha atual ou recuperação, sem enviar credencial antiga.
- Por solicitação explícita do responsável em 30/09/2026, a senha provisória é compartilhada (`123mudar`). A troca obrigatória no primeiro acesso não elimina o risco de uso por terceiros que conheçam o e-mail; senhas exclusivas continuam sendo a opção recomendada. Esta mudança não redefine em massa contas antigas nem reenvia aprovações concluídas.
- A chave de idempotência do provedor protege reenvios dentro da janela do Resend; falhas prolongadas de confirmação após envio exigem conferir o provedor antes de reenviar.

## Validação sem dados reais

`npm run aprovacao --prefix servidor`

`PGLITE_MODULE=/caminho/do/pglite/dist/index.js node servidor/teste-aprovacao-banco.mjs`

`preview/aprovacao.html` é uma fixture de desenvolvimento. Os testes de navegador devem interceptar `/api/clientes-pendentes` com dados fictícios; ela não contém credenciais reais.
