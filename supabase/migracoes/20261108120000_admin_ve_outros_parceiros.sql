-- 08/11/2026: o admin do parceiro que também vê outro parceiro (Tiago: "o Victor Cordeiro precisa
-- ter acesso também às informações do Naor, de anúncios, de comissionamento... todas as informações
-- da plataforma do Naor, o Victor tem que ver. E o Naor continua vendendo somente a dele").
--
-- administradores.ve_parceiros: a lista COMPLETA de parceiros que o admin do parceiro vê (o dele
-- incluído). null/vazio = só o dele (Naor, Saymonn, Victor Dias: nada muda).
--
-- Como escolhe: o painel manda x-teeds-vitrine com o parceiro em foco (o mesmo cabeçalho do filtro
-- do admin geral). Para o admin do parceiro o cabeçalho só vale se o código estiver na lista dele;
-- fora dela, continua preso ao dele. Sem cabeçalho (o canal ao vivo do Realtime), as listas por
-- escopo (teeds_escopos) trazem todos os da lista e o painel filtra pelo parceiro em foco.

alter table public.administradores add column if not exists ve_parceiros text[];

-- o parceiro pedido no cabeçalho, se quem pede é admin de parceiro e o código está na lista dele
create or replace function public.teeds_parceiro_extra_pedido(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select v.p from (select public.teeds_vitrine_pedida() as p) v
   where v.p is not null and exists (
     select 1 from public.administradores a
      where a.user_id = (select auth.uid()) and a.parceiro is not null
        and (p_marca is null or p_marca = 'todas' or a.marca = p_marca)
        and v.p = any (coalesce(a.ve_parceiros, '{}'))
        and public.teeds_parceiro_valido(a.marca, v.p) is not null);
$$;

-- os parceiros que o admin do parceiro vê nesta marca (o dele primeiro); vazio para o geral e para quem não é admin
create or replace function public.teeds_parceiros_que_vejo(p_marca text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((
    select array[a.parceiro] || array(select x from unnest(coalesce(a.ve_parceiros, '{}')) x
                                       where x <> a.parceiro and public.teeds_parceiro_valido(a.marca, x) is not null)
      from public.administradores a
     where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null
     order by a.marca limit 1), '{}');
$$;

revoke all on function public.teeds_parceiro_extra_pedido(text) from public, anon;
revoke all on function public.teeds_parceiros_que_vejo(text) from public, anon;
grant execute on function public.teeds_parceiro_extra_pedido(text) to authenticated, service_role;
grant execute on function public.teeds_parceiros_que_vejo(text) to authenticated, service_role;

-- o escopo (RLS): o admin do parceiro fica no pedido, se a lista dele permite; senão, no dele
create or replace function public.teeds_escopo_de(p_marca text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when public.teeds_sou_admin_da(p_marca) then (
      select case
        when v.p is null then null
        when v.p = 'direto' then ''
        else public.teeds_parceiro_valido(p_marca, v.p)
      end from (select public.teeds_vitrine_pedida() as p) v)
    else coalesce(public.teeds_parceiro_extra_pedido(p_marca),
           (select a.parceiro from public.administradores a
             where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1))
  end;
$$;

-- o parceiro forçado (as RPCs com p_parceiro e as funções de anúncios): a mesma regra
create or replace function public.teeds_parceiro_forcado(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and a.parceiro is null
                  and (p_marca is null or p_marca = 'todas' or a.marca = p_marca or a.marca = 'teeds')) then null
    else coalesce(public.teeds_parceiro_extra_pedido(p_marca),
           (select a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.parceiro is not null
             and (p_marca is null or p_marca = 'todas' or a.marca = p_marca) order by a.marca limit 1))
  end;
$$;

-- as listas por escopo (clientes, sessões, conversas, leads): sem cabeçalho, todos os parceiros da lista
create or replace function public.teeds_escopos()
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.m || ':' || c.codigo), '{}') from (
    select distinct m from (select unnest(array['teeds', 'omni', 'globalfly']) as m union select marca from public.administradores) t
  ) x
  cross join lateral unnest(case
    when public.teeds_escopo_de(x.m) is null then '{}'::text[]
    when public.teeds_parceiro_extra_pedido(x.m) is null and cardinality(public.teeds_parceiros_que_vejo(x.m)) > 1
      then public.teeds_parceiros_que_vejo(x.m)
    else array[public.teeds_escopo_de(x.m)]
  end) as c(codigo);
$$;

-- o papel que o site lê: 've' = os parceiros que ele pode escolher no topo do painel
create or replace function public.teeds_meu_papel(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when public.teeds_sou_admin_da(p_marca) then jsonb_build_object('admin', true, 'geral', true, 'parceiro', null, 'total', true, 've', '[]'::jsonb)
    when public.teeds_sou_equipe_da(p_marca) then jsonb_build_object('admin', true, 'geral', false,
      'parceiro', (select a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1),
      'total', public.teeds_admin_pleno_da(p_marca),
      've', to_jsonb(public.teeds_parceiros_que_vejo(p_marca)))
    else jsonb_build_object('admin', false, 'geral', false, 'parceiro', null, 'total', false, 've', '[]'::jsonb)
  end;
$$;

-- o nome dos parceiros da lista (o seletor do topo)
alter policy parceiros_leitura_admin on public.parceiros
  using (public.teeds_sou_admin_da(marca) or codigo = public.teeds_escopo_de(marca)
         or codigo = any (public.teeds_parceiros_que_vejo(marca)));

-- Victor Cordeiro: acesso total (as abas de anúncios, comissões etc.) e vê o /v e o /n
update public.administradores set acesso_total = true, ve_parceiros = array['v', 'n']
 where marca = 'globalfly' and user_id = 'c66b8863-97b3-44f5-ae7a-e7a4300504b7';
