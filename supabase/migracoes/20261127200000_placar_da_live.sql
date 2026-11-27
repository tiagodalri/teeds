-- O placar da live no topo do painel (27/11/2026, pedido do Tiago): um contador de roleta com
-- o markup em conta real gerado NESTA live, o valor das entradas, o saldo em conta real de quem
-- está na sala e quantas pessoas estão operando.
--  - markup: de todos que passaram pela live (quem está agora + as presenças gravadas na
--    transmissão aberta), então quem sai não derruba o número;
--  - entradas, saldo e pessoas: só de quem está na sala agora (podem descer).
-- Só a equipe; cada administrador soma só os clientes do escopo dele (teeds_ve_cliente).
create or replace function public.teeds_placar_da_live(p_marca text, p_ids uuid[], p_desde timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := greatest(coalesce(p_desde, now()), now() - interval '12 hours');
  r jsonb;
begin
  if not public.teeds_sou_equipe_da(p_marca) then return null; end if;
  with agora as (
    select distinct u from unnest(coalesce(p_ids, '{}'::uuid[])) u limit 1000
  ),
  passaram as (
    select distinct split_part(e->>'id', '~', 1)::uuid as u
      from (select t.presencas from public.transmissoes t
             where t.marca = p_marca and t.encerrada_em is null
               and t.iniciada_em between v_desde - interval '3 minutes' and v_desde + interval '3 minutes'
             order by t.iniciada_em desc limit 1) t,
           jsonb_array_elements(case when jsonb_typeof(t.presencas) = 'array' then t.presencas else '[]'::jsonb end) e
     where split_part(e->>'id', '~', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  todos as (
    select c.user_id, exists (select 1 from agora where agora.u = c.user_id) as na_sala
      from public.clientes c
     where c.marca = p_marca
       and c.user_id in (select u from agora union select u from passaram)
       and public.teeds_ve_cliente(p_marca, c.user_id)
  ),
  ops as (
    select distinct on (x.user_id, x.contract_id) x.* from (
      select o.user_id, 'ia'::text as origem, o.contract_id, coalesce(o.entrada, 0) as entrada, coalesce(o.markup, 0) as mk
        from public.operacoes_robos o join todos on todos.user_id = o.user_id
       where o.marca = p_marca and not o.demo and o.executada_em >= v_desde
      union all
      select m.user_id, 'manual', m.contract_id, coalesce(m.entrada, 0), coalesce(m.markup, 0)
        from public.operacoes_manuais m join todos on todos.user_id = m.user_id
       where m.marca = p_marca and not m.demo and coalesce(m.pagamento, 0) > 0 and m.comprada_em >= v_desde
    ) x
    order by x.user_id, x.contract_id, x.origem
  ),
  saldo as (
    select d.user_id, sum(d.saldo) as saldo
      from public.contas_deriv d join todos on todos.user_id = d.user_id and todos.na_sala
     where d.tipo = 'real' and (d.marca is null or d.marca = p_marca)
     group by d.user_id
  )
  select jsonb_build_object(
    'markup',     (select coalesce(sum(mk), 0) from ops),
    'operacoes',  (select count(*) from ops),
    'entradas',   (select coalesce(sum(ops.entrada), 0) from ops join todos on todos.user_id = ops.user_id and todos.na_sala),
    'operando',   (select count(distinct ops.user_id) from ops join todos on todos.user_id = ops.user_id and todos.na_sala),
    'saldo',      (select coalesce(sum(saldo), 0) from saldo),
    'com_conta',  (select count(*) from saldo where saldo > 0),
    'passaram',   (select count(*) from todos),
    'desde',      v_desde
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_placar_da_live(text, uuid[], timestamptz) from public, anon;
grant execute on function public.teeds_placar_da_live(text, uuid[], timestamptz) to authenticated;
