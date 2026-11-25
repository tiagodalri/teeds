-- 25/11/2026 (Tiago: "pode liberar o acesso de todo mundo a partir de hoje já. libera TODOS que estão
-- bloqueados, autorizo! todos do gold etc"). Chave geral por marca que desliga a trava do Gold sem saldo
-- (teeds_conta_travada). Religar: delete from trava_sem_saldo_desligada where marca = 'globalfly'.
create table if not exists public.trava_sem_saldo_desligada (
  marca text primary key,
  desde timestamptz not null default now(),
  nota text
);
alter table public.trava_sem_saldo_desligada enable row level security;

create or replace function public.teeds_conta_travada(p_user uuid, p_marca text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p_user is not null
     and p_marca in ('globalfly', 'legacypro')
     and not exists (select 1 from trava_sem_saldo_desligada t where t.marca = p_marca)
     and not exists (select 1 from administradores a where a.user_id = p_user and a.marca = p_marca)
     and exists (select 1 from clientes c where c.user_id = p_user and c.marca = p_marca)
     and not exists (select 1 from clientes c where c.user_id = p_user and c.marca = p_marca and c.liberado_sem_saldo)
     and public.teeds_subplano_id(p_user, p_marca) = 'gold'
     and not exists (select 1 from contas_deriv d
                      where d.user_id = p_user and d.marca = p_marca and d.tipo = 'real' and d.saldo > 0);
$function$;

insert into public.trava_sem_saldo_desligada (marca, nota)
values ('globalfly', '25/11 Tiago: liberar todos a partir de hoje (Super Live 29/11)')
on conflict (marca) do nothing;
