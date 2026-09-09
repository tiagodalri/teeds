alter table public.clientes
  add column if not exists total_acessos integer not null default 0,
  add column if not exists tempo_total_segundos bigint not null default 0,
  add column if not exists sessao_atual text,
  add column if not exists sessao_atual_segundos integer not null default 0,
  add column if not exists fuso_horario text,
  add column if not exists idioma text;

create or replace function public.teeds_registrar_acesso(p_marca text, p_sessao text, p_segundos integer default 0, p_fuso text default null, p_idioma text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare v_nova boolean;
begin
  if auth.uid() is null or p_marca not in ('teeds','omni') or length(coalesce(p_sessao,''))<8 then raise exception 'acesso invalido'; end if;
  select sessao_atual is distinct from p_sessao into v_nova from public.clientes where user_id=auth.uid() and marca=p_marca;
  update public.clientes set visto_em=now(), total_acessos=total_acessos+case when v_nova then 1 else 0 end,
    tempo_total_segundos=tempo_total_segundos+case when v_nova then greatest(0,least(coalesce(p_segundos,0),300)) else greatest(0,least(coalesce(p_segundos,0)-sessao_atual_segundos,300)) end,
    sessao_atual=p_sessao, sessao_atual_segundos=greatest(0,coalesce(p_segundos,0)),
    fuso_horario=left(coalesce(p_fuso,fuso_horario),80), idioma=left(coalesce(p_idioma,idioma),30)
  where user_id=auth.uid() and marca=p_marca;
end $$;
revoke all on function public.teeds_registrar_acesso(text,text,integer,text,text) from public,anon;
grant execute on function public.teeds_registrar_acesso(text,text,integer,text,text) to authenticated;
