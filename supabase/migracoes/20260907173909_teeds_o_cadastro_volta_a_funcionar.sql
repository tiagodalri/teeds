-- O cadastro de novos clientes estava QUEBRADO — nas duas plataformas.
--
-- Quando a chave de `clientes` passou a ser (pessoa, marca), esta função
-- ficou para trás: ela ainda dizia `on conflict (user_id)`, e `user_id`
-- sozinho não é mais chave única de nada. O Postgres não avisa antes — ele
-- recusa na hora da gravação, com erro 42P10.
--
-- Como ela é gatilho de `auth.users`, o erro derrubava a criação do usuário
-- inteira. Ou seja: desde a troca da chave, ninguém conseguia se cadastrar
-- na Teeds nem na OMNI. E o sintoma para quem tentava era genérico — nada
-- na tela dizia "o banco recusou", então dava para ficar dias sem perceber.
--
-- Além de consertar a chave, a função passa a saber de qual plataforma veio
-- a pessoa: o cadastro manda `marca` junto, e quem não mandar continua caindo
-- na Teeds, que é o que todo cadastro antigo já era.
create or replace function public.teeds_novo_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_marca text := coalesce(nullif(new.raw_user_meta_data->>'marca', ''), 'teeds');
begin
  insert into public.clientes
    (user_id, marca, nome, email, telefone, cpf, criado_em, visto_em,
     plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (new.id, v_marca,
     new.raw_user_meta_data->>'nome', new.email,
     new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'cpf',
     coalesce(new.created_at, now()), now(),
     'essencial', 'ativo', now(), now() + interval '30 days')
  on conflict (user_id, marca) do nothing;
  return new;
end;
$$;
