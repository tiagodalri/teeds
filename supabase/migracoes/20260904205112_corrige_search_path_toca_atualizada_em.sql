create or replace function public.teeds_toca_atualizada_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizada_em := now();
  return new;
end $$;
