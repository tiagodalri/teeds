-- 13/11/2026: o carteiro do lançamento (lancamento-emails.ts) relê a tabela inteira a cada 30 s,
-- em páginas ordenadas por (etapa, email). A chave é (marca, email, etapa), então cada página
-- ordenava as 23 mil linhas: 221 mil execuções, ~4 h de CPU do banco, e o banco saturou na live.
-- Com este índice a página mais funda cai de ~66 ms para ~9 ms (só índice). Já aplicado em produção.
create index concurrently if not exists lancamento_emails_marca_etapa_email
  on public.lancamento_emails (marca, etapa, email);
