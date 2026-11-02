-- 02/11/2026 (Tiago): "consigo rastrear quem recebeu a notificação e quem clicou?"
-- Cada aparelho que o disparo do painel alcançou fica em push_disparo_destinos (o
-- endereço do aparelho guardado só como sha256). O próprio app avisa o banco quando a
-- notificação aparece no aparelho ('recebeu') e quando a pessoa toca nela ('clicou').

create table if not exists public.push_disparo_destinos (
  disparo uuid not null references public.push_disparos(id) on delete cascade,
  aparelho text not null,          -- sha256 do endpoint
  pessoa uuid,
  primary key (disparo, aparelho)
);
alter table public.push_disparo_destinos enable row level security;

create table if not exists public.push_eventos (
  disparo uuid not null references public.push_disparos(id) on delete cascade,
  aparelho text not null,
  tipo text not null check (tipo in ('recebeu', 'clicou')),
  em timestamptz not null default now(),
  primary key (disparo, aparelho, tipo)
);
alter table public.push_eventos enable row level security;

-- Chamado pelo service worker do app (sem login): só vale para um aparelho que o disparo alcançou.
create or replace function public.teeds_push_evento(p_disparo uuid, p_endpoint text, p_tipo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_aparelho text := encode(sha256(convert_to(coalesce(p_endpoint, ''), 'UTF8')), 'hex');
begin
  if p_tipo not in ('recebeu', 'clicou') then return false; end if;
  if not exists (select 1 from public.push_disparo_destinos d where d.disparo = p_disparo and d.aparelho = v_aparelho) then return false; end if;
  insert into public.push_eventos (disparo, aparelho, tipo) values (p_disparo, v_aparelho, p_tipo) on conflict do nothing;
  -- quem tocou recebeu, mesmo que o aviso de "recebeu" tenha se perdido
  if p_tipo = 'clicou' then
    insert into public.push_eventos (disparo, aparelho, tipo) values (p_disparo, v_aparelho, 'recebeu') on conflict do nothing;
  end if;
  return true;
end $$;
revoke all on function public.teeds_push_evento(uuid, text, text) from public;
grant execute on function public.teeds_push_evento(uuid, text, text) to anon, authenticated;

-- O histórico do painel com os números de cada disparo.
create or replace function public.teeds_push_historico(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê os disparos'; end if;
  return coalesce((select jsonb_agg(x order by x.criado_em desc) from (
    select d.id, d.criado_em, d.titulo, d.corpo, d.publico, d.parceiro, d.aparelhos, d.enviados, d.falhas, d.teste,
           (select count(distinct t.pessoa) from public.push_disparo_destinos t where t.disparo = d.id) as pessoas,
           (select count(*) from public.push_eventos e where e.disparo = d.id and e.tipo = 'recebeu') as recebidos,
           (select count(*) from public.push_eventos e where e.disparo = d.id and e.tipo = 'clicou') as abertos,
           (select count(distinct t.pessoa) from public.push_eventos e join public.push_disparo_destinos t on t.disparo = e.disparo and t.aparelho = e.aparelho
             where e.disparo = d.id and e.tipo = 'clicou') as pessoas_abriram
      from public.push_disparos d
     where d.marca = p_marca
     order by d.criado_em desc limit 30) x), '[]'::jsonb);
end $$;
revoke all on function public.teeds_push_historico(text) from public, anon;
grant execute on function public.teeds_push_historico(text) to authenticated;

-- Quem recebeu e quem abriu um disparo, pessoa por pessoa.
create or replace function public.teeds_push_quem(p_disparo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_marca text;
begin
  select marca into v_marca from public.push_disparos where id = p_disparo;
  if v_marca is null or not public.teeds_admin_geral_da(v_marca) then raise exception 'Só o administrador geral vê os disparos'; end if;
  return coalesce((select jsonb_agg(x order by x.abriu_em desc nulls last, x.recebeu_em desc nulls last, x.nome) from (
    select t.pessoa, c.nome, c.email, nullif(c.parceiro, '') as parceiro, count(*) as aparelhos,
           min(r.em) as recebeu_em, min(k.em) as abriu_em
      from public.push_disparo_destinos t
      left join public.clientes c on c.user_id = t.pessoa and c.marca = v_marca
      left join public.push_eventos r on r.disparo = t.disparo and r.aparelho = t.aparelho and r.tipo = 'recebeu'
      left join public.push_eventos k on k.disparo = t.disparo and k.aparelho = t.aparelho and k.tipo = 'clicou'
     where t.disparo = p_disparo
     group by t.pessoa, c.nome, c.email, c.parceiro) x), '[]'::jsonb);
end $$;
revoke all on function public.teeds_push_quem(uuid) from public, anon;
grant execute on function public.teeds_push_quem(uuid) to authenticated;
