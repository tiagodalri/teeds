-- 08/11/2026 (aplicada em produção pelo MCP antes de entrar no repo):
-- o botão "Liberar acesso geral" procura, para cada inscrito, o pedido dele
-- por user_id OU e-mail. Sem estes dois índices a busca varria a tabela
-- inteira para cada inscrito: 1,36 s com 740 inscritos, crescendo ao
-- quadrado, perto do limite de 8 s da chamada do admin. Com eles: 0,015 s.
create index if not exists clientes_pendentes_marca_status_user on public.clientes_pendentes (marca, status, user_id);
create index if not exists clientes_pendentes_marca_status_email_min on public.clientes_pendentes (marca, status, lower(email));
analyze public.clientes_pendentes;
