-- 20/10/2026: depois de separar as contas, uma aba antiga da GlobalFly (com
-- a sessão da conta da Teeds) criou sozinha uma ficha da GlobalFly na conta
-- da Teeds. Agora o banco recusa: a ficha só existe na marca da conta.

create or replace function public.teeds_ficha_na_marca_da_conta()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_conta text;
begin
  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.marca = old.marca then return new; end if;
  select public.teeds_marca_da_conta(email) into v_conta from auth.users where id = new.user_id;
  if v_conta is distinct from new.marca then
    raise exception 'Esta conta é de outra plataforma. Saia e entre com a sua conta desta plataforma.'
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

drop trigger if exists ficha_na_marca_da_conta on public.clientes;
create trigger ficha_na_marca_da_conta before insert or update on public.clientes
  for each row execute function public.teeds_ficha_na_marca_da_conta();

-- Conta sem etiqueta é da Teeds: se o cadastro disser outra marca (uma tela
-- antiga ainda aberta), recusa em vez de criar a conta misturada.
create or replace function public.teeds_novo_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_real text := public.teeds_email_real(new.email);
  v_marca text := public.teeds_marca_da_conta(new.email);
  v_pedida text := nullif(new.raw_user_meta_data->>'marca', '');
  v_status text := 'ativo';
begin
  if v_pedida is not null and v_pedida <> v_marca then
    raise exception 'Atualize a página e faça o cadastro de novo.';
  end if;
  -- Há um cadastro esperando aprovação nesta marca para este e-mail? Então a
  -- conta serve só para entrar e ler "aguarde a liberação".
  if exists (
    select 1 from public.clientes_pendentes p
    where p.marca = v_marca
      and lower(p.email) = lower(v_real)
      and p.status in ('pendente', 'processando')
  ) then
    v_status := 'pendente';
  end if;

  insert into public.clientes
    (user_id, marca, nome, email, telefone, cpf, criado_em, visto_em,
     plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (new.id, v_marca,
     new.raw_user_meta_data->>'nome', v_real,
     new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'cpf',
     coalesce(new.created_at, now()), now(),
     'essencial', v_status, now(),
     case when v_status = 'ativo' then now() + interval '30 days' end)
  on conflict (user_id, marca) do nothing;
  return new;
end;
$function$;

-- a ficha vazia que a aba antiga criou na conta da Teeds do Tiago às 15:21
delete from public.clientes c
 using auth.users u
 where u.id = c.user_id and public.teeds_marca_da_conta(u.email) <> c.marca
   and c.criado_em >= '2026-10-20 15:20:00+00';
