-- A fila dos e-mails de acesso.
--
-- O Supabase sabe QUANDO um e-mail precisa sair (cadastro, senha esquecida),
-- mas so sabe mandar um modelo para o projeto inteiro — e o projeto e um so
-- para a Teeds e a OMNI. Entao ele deixa de mandar e passa a AVISAR.
--
-- O jeito comum de avisar e chamar um endereco na internet, o que exige uma
-- senha combinada entre os dois lados. Aqui o aviso vai para uma tabela: o
-- servidor ja tem a chave do banco, entao nao precisa de senha nova nenhuma.
-- E ganha uma coisa de graca: se o servidor estiver reiniciando naquele
-- segundo, o cadastro NAO falha — o e-mail so espera na fila.
--
-- A linha guarda o codigo de confirmacao, que e sensivel: quem tiver ele
-- confirma o e-mail no lugar da pessoa. Por isso a tabela e fechada para
-- todo mundo (RLS ligado, nenhuma regra), so a chave-mestra do servidor le,
-- e a linha e apagada assim que o e-mail sai.
create table if not exists public.emails_pendentes (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  aviso       jsonb not null,
  tentativas  integer not null default 0,
  ultimo_erro text
);

comment on table public.emails_pendentes is
  'Fila dos e-mails de acesso (cadastro, senha, convite). O Supabase enfileira; o servidor manda e apaga.';

alter table public.emails_pendentes enable row level security;
revoke all on table public.emails_pendentes from public, anon, authenticated;

-- O gancho: recebe o aviso do Supabase Auth, guarda e responde "ok".
-- SECURITY DEFINER para o papel do Auth nao precisar de permissao na tabela.
create or replace function public.teeds_enfileirar_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.emails_pendentes (aviso) values (event);
  return '{}'::jsonb;
end;
$$;

-- So o Supabase Auth chama. Ninguem logado alcanca.
revoke execute on function public.teeds_enfileirar_email(jsonb) from public, anon, authenticated;
grant execute on function public.teeds_enfileirar_email(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

comment on function public.teeds_enfileirar_email(jsonb) is
  'Gancho "Send Email" do Supabase Auth. Nao manda nada: so poe na fila para o servidor mandar com a marca certa.';
