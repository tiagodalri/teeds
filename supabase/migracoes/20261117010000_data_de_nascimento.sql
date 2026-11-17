-- Data de nascimento dos clientes (17/11/2026, Tiago: "temos a data de nascimento dos usuários?" → não; "sim, buscar na
-- Deriv e também pedir no cadastro, lá na parte do meu perfil").
--
--  * clientes.data_nascimento + de onde veio (nascimento_fonte: 'cliente' = digitou no Meu perfil; 'deriv' = veio da
--    conta Deriv) e quando (nascimento_em).
--  * O cliente grava pela própria ficha (o mesmo PATCH do Meu perfil): o gatilho marca a fonte como 'cliente'.
--  * A Deriv só preenche quem ainda não tem a data (teeds_nascimento_da_deriv), e o que o cliente digitou vale por cima.
--  * nascimento_deriv_tentativas: o último resultado da busca na Deriv por pessoa (para saber se a API nova responde).
--  * A ficha do admin (teeds_cliente_ficha) passa a devolver a data e a fonte.

alter table public.clientes
  add column if not exists data_nascimento date,
  add column if not exists nascimento_fonte text,
  add column if not exists nascimento_em timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_nascimento_fonte_ck') then
    alter table public.clientes add constraint clientes_nascimento_fonte_ck check (nascimento_fonte is null or nascimento_fonte in ('cliente', 'deriv'));
  end if;
end $$;

-- a data muda: confere a faixa, carimba quando e marca de onde veio (a função da Deriv avisa pela configuração da transação)
create or replace function public.teeds_nascimento_na_ficha()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.data_nascimento is not distinct from old.data_nascimento then
    new.nascimento_fonte := old.nascimento_fonte;
    new.nascimento_em := old.nascimento_em;
    return new;
  end if;
  if new.data_nascimento is null then
    new.nascimento_fonte := null; new.nascimento_em := null;
    return new;
  end if;
  if new.data_nascimento < date '1900-01-01' or new.data_nascimento > current_date then
    raise exception 'Data de nascimento fora do possível.' using errcode = '22008';
  end if;
  new.nascimento_fonte := case when current_setting('teeds.nascimento_fonte', true) = 'deriv' then 'deriv' else 'cliente' end;
  new.nascimento_em := now();
  return new;
end $$;

drop trigger if exists teeds_nascimento_na_ficha on public.clientes;
create trigger teeds_nascimento_na_ficha before insert or update of data_nascimento, nascimento_fonte, nascimento_em on public.clientes
  for each row execute function public.teeds_nascimento_na_ficha();

create table if not exists public.nascimento_deriv_tentativas (
  user_id uuid primary key,
  em timestamptz not null default now(),
  resultado text not null
);
alter table public.nascimento_deriv_tentativas enable row level security;

-- a busca na Deriv, feita pelo app com a conta já conectada: preenche só as fichas sem data e anota o resultado
create or replace function public.teeds_nascimento_da_deriv(p_data date, p_resultado text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); n integer := 0;
begin
  if v_user is null then return 0; end if;
  if p_data is not null and p_data between date '1900-01-01' and current_date then
    perform set_config('teeds.nascimento_fonte', 'deriv', true);
    update public.clientes set data_nascimento = p_data where user_id = v_user and data_nascimento is null;
    get diagnostics n = row_count;
    perform set_config('teeds.nascimento_fonte', '', true);
  end if;
  insert into public.nascimento_deriv_tentativas (user_id, em, resultado)
    values (v_user, now(), left(coalesce(p_resultado, case when p_data is null then 'sem data' else 'ok' end), 200))
    on conflict (user_id) do update set em = excluded.em, resultado = excluded.resultado;
  return n;
end $$;
revoke all on function public.teeds_nascimento_da_deriv(date, text) from public, anon;
grant execute on function public.teeds_nascimento_da_deriv(date, text) to authenticated;

-- a ficha do admin passa a trazer a data e a fonte (troca só a linha de 'observacoes' da definição em vigor)
do $$
declare d text; novo text;
begin
  select pg_get_functiondef('public.teeds_cliente_ficha(text,uuid)'::regprocedure) into d;
  if position('data_nascimento' in d) > 0 then return; end if;
  novo := replace(d, '''observacoes'', c.observacoes),',
    '''observacoes'', c.observacoes, ''data_nascimento'', c.data_nascimento, ''nascimento_fonte'', c.nascimento_fonte),');
  if novo = d then raise exception 'teeds_cliente_ficha: não achei a linha de observacoes para acrescentar a data de nascimento'; end if;
  execute novo;
end $$;
