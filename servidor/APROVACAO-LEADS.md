# Aprovação dos cadastros públicos

## Ativação

1. As migrações `supabase/migracoes/20260918160000_aprovacao_de_leads.sql` e `20260918170000_dois_planos_clientes.sql` foram aplicadas em produção em 18/09/2026, nessa ordem. Não reaplicar. As tabelas restritas `backup_planos_20260918` e `backup_clientes_planos_20260918` preservam o enquadramento anterior.
2. Publicar o servidor e os dois frontends. Não reiniciar o motor enquanto houver sessões ativas sem autorização para interrompê-las.
3. Conferir Administração → Clientes → Aprovação de clientes em cada marca.

A migração não converte retroativamente a base antiga e não aprova ninguém. Novos envios entram automaticamente na fila, inclusive pelo armazenamento alternativo de auditoria. Um cadastro já existente na mesma marca não retorna à fila.

## Comportamento

- O formulário cria ficha em `clientes_pendentes`, visível na seção Clientes, mas nenhum login. O registro original do lead permanece.
- Somente servidor autenticado como administrador da marca pode aprovar ou recusar. A decisão é registrada com administrador e horário.
- Aprovar cria um login confirmado, com troca obrigatória da senha provisória, e o plano escolhido (Sem simulador ou Com simulador) por 30 dias. A conta existente é preservada, sem redefinição de senha ou sobrescrita de plano/status.

## Dois planos

`essencial` = Sem simulador; `pro` = Com simulador. Apenas esses dois são oferecidos. Planos antigos são desativados para preservar histórico. A migração mantém o simulador para quem possui liberação ativa e não vencida do produto `simulador-treino`; não muda validade/status dos clientes nem a tabela de administradores. Novos cadastros diretos começam sem simulador.

A permissão da conta demo/simulador da Deriv é consultada no banco por marca; o servidor confere antes de iniciar/retomar robôs demo. O navegador não conecta conta demo sem permissão e nunca seleciona dinheiro real automaticamente após a retirada da demo. A conta real deve ser escolhida pelo usuário. Essa restrição é da plataforma, não impede usar uma conta demo diretamente na Deriv.

Publicar banco antes dos frontends/servidor: a ausência das funções novas bloqueia o simulador por segurança. Sessões já em execução não são interrompidas por alteração de plano; a nova permissão vale na próxima conexão/início/retomada.
- Uma aprovação interrompida pode ser retomada após dois minutos na aba Em aprovação. A trava vive no banco, não apenas na memória do processo.
- E-mails de aprovação são enviados pelo Resend a cada 30 segundos; permanecem pendentes em caso de falha. Remetente, identidade e endereço da plataforma vêm da marca.
- Senhas provisórias não são gravadas em tabelas, respostas de API nem logs. São derivadas da credencial secreta do servidor e do ID da aprovação; não rotacionar essa credencial com aprovações/e-mails em processamento sem planejar a recuperação desses acessos.
- Se a senha já foi trocada ou a conta já existia, o e-mail orienta usar a senha atual ou recuperação.
- A chave de idempotência do provedor protege reenvios dentro da janela do Resend; falhas prolongadas de confirmação após envio exigem conferir o provedor antes de reenviar.

## Validação sem dados reais

`npm run aprovacao --prefix servidor`

`PGLITE_MODULE=/caminho/do/pglite/dist/index.js node servidor/teste-aprovacao-banco.mjs`

`preview/aprovacao.html` é uma fixture de desenvolvimento. Os testes de navegador devem interceptar `/api/clientes-pendentes` com dados fictícios; ela não contém credenciais reais.
