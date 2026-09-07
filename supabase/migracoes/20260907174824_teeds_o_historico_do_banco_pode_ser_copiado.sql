-- Uma porta para tirar cópia do histórico do banco.
--
-- Toda mudança de estrutura desta plataforma — cada tabela, cada permissão,
-- cada correção — vive num registro interno do Supabase. Ele é confiável,
-- mas é um lugar só: se a conta se perder, some junto a receita de como o
-- banco foi construído, e refazer isso à mão é semanas de trabalho.
--
-- Esta função existe para o servidor conseguir puxar esse registro e gravar
-- em arquivo, que então vai para o GitHub junto com o resto do código
-- (ver scripts/exportar-banco.sh). Backup que ninguém consegue tirar sozinho
-- não é backup — é intenção.
--
-- Ela NÃO expõe nada: não há senha nem chave dentro de uma migração, e o
-- acesso é só do `service_role`, a chave que já mora no servidor e que já
-- enxerga o banco inteiro de qualquer jeito. Nenhum cliente logado alcança.
create or replace function public.teeds_exportar_migracoes()
returns table (version text, name text, sql text)
language sql
stable
security definer
set search_path = public
as $$
  select m.version, m.name, array_to_string(m.statements, chr(10))
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;

revoke all on function public.teeds_exportar_migracoes() from public, anon, authenticated;
grant execute on function public.teeds_exportar_migracoes() to service_role;

comment on function public.teeds_exportar_migracoes() is
  'Copia do historico de estrutura do banco, para backup no repositorio. So o service_role chama.';
