-- Admins da Legacy Pro (25/11/2026, pedido do Tiago): Raman e o próprio Tiago,
-- admins gerais SÓ da Legacy Pro (como o Tiago e o Victor Cordeiro na GF).
--
-- Uma conta por marca: o acesso vai para a conta da Legacy Pro de cada um
-- (e-mail com a etiqueta +marca-legacypro), nunca para as contas das outras
-- marcas. Como as contas ainda não existem, o acesso fica reservado e é dado
-- no momento em que a conta é criada (gatilho em auth.users).

-- 1) A Legacy Pro sai da conta da Teeds do Tiago (posta na criação da marca).
delete from public.administradores
 where user_id = '7679630d-54dc-439d-a0b5-f2e8d8f5a7aa' and marca = 'legacypro';

-- 2) Reservas: e-mail da conta (com a etiqueta) + marca.
create table if not exists public.administradores_reservados (
  email_conta text primary key,
  marca text not null,
  criado_em timestamptz not null default now()
);
alter table public.administradores_reservados enable row level security;
revoke all on public.administradores_reservados from anon, authenticated;

insert into public.administradores_reservados (email_conta, marca) values
  (public.teeds_email_da_conta('ramanramos651@gmail.com', 'legacypro'), 'legacypro'),
  (public.teeds_email_da_conta('tiagodalri1@live.com', 'legacypro'), 'legacypro')
on conflict (email_conta) do update set marca = excluded.marca;

-- 3) Conta criada com e-mail reservado vira admin geral da marca da reserva,
--    só se a etiqueta da conta for dessa mesma marca.
create or replace function public.teeds_admin_reservado()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.administradores_reservados where email_conta = lower(new.email);
  if found and public.teeds_marca_da_conta(new.email) = r.marca then
    insert into public.administradores (user_id, marca) values (new.id, r.marca) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.teeds_admin_reservado() from public, anon, authenticated;

drop trigger if exists teeds_admin_reservado on auth.users;
create trigger teeds_admin_reservado after insert on auth.users
  for each row execute function public.teeds_admin_reservado();

-- 4) Se a conta já existir quando a reserva for feita, vale na hora.
insert into public.administradores (user_id, marca)
select u.id, r.marca from public.administradores_reservados r
  join auth.users u on lower(u.email) = r.email_conta
 where public.teeds_marca_da_conta(u.email) = r.marca
on conflict do nothing;
