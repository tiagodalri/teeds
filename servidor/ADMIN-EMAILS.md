# Central administrativa de e-mails

Menu: Administração → E-mails. Endpoint somente GET `/api/admin/emails?marca=teeds`.
Requer login e administrador da marca (ou master Teeds), conferidos no servidor.
Consulta a listagem do Resend; filtra pelo endereço exato do remetente da marca
antes de retornar destinatários, assunto, data e último evento. Não retorna
corpo, senha, token ou credencial. Não envia nem reenvia mensagens.

Configuração: `RESEND_LEITURA_CHAVE` no ambiente do servidor, com credencial
válida que permita listar e-mails. Se ausente, tenta `RESEND_CHAVE` existente.
Não trocar a chave de envio apenas para habilitar a consulta.
Na verificação de 30/09/2026, a consulta com a credencial atual retornou 401.

A busca e os filtros se aplicam aos registros carregados. Continuar carregando
até o fim para pesquisar todo o período retido pelo provedor. Páginas sem
registros desta marca ainda podem oferecer continuidade. Cache de 15 segundos.
Não é arquivo permanente nem histórico de falhas antes da aceitação pelo
Resend. Pendências de aprovação continuam na área de Clientes.

Teste isolado: compilar `src/teste-admin-emails.ts` com esbuild para Node/ESM
e executar o resultado. O teste simula o provedor, sem disparos reais.
