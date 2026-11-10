-- 10/11/2026 (Tiago: "quero sempre horário de Brasília"): teeds_movimentacoes_periodo ganha p_fuso
-- ('UTC' padrão, para a versão antiga continuar igual; a tela manda 'America/Sao_Paulo').
drop function if exists public.teeds_movimentacoes_periodo(text, date, date, integer);
create or replace function public.teeds_movimentacoes_periodo(
  p_marca text default 'teeds', p_inicio date default null, p_fim date default null, p_limite integer default 5000,
  p_fuso text default 'UTC')
returns table(user_id uuid, nome text, email text, parceiro text, parceiro_nome text,
  conta_id text, transacao_id bigint, tipo text, valor numeric, moeda text,
  saldo_depois numeric, descricao text, ocorrida_em timestamptz)
language sql stable set search_path to 'public'
as $$
  with j as (
    select coalesce(p_inicio, current_date - 29) as ini,
           coalesce(p_fim, current_date) as fim,
           case when p_fuso in ('UTC', 'America/Sao_Paulo') then p_fuso else 'UTC' end as fuso
  )
  select m.user_id, c.nome, c.email, nullif(c.parceiro, ''), pa.nome,
         m.conta_id, m.transacao_id, m.tipo, m.valor, m.moeda,
         m.saldo_depois, m.descricao, m.ocorrida_em
  from public.movimentacoes_deriv m
  cross join j
  left join public.clientes c on c.user_id = m.user_id and c.marca = m.marca
  left join public.parceiros pa on pa.marca = m.marca and pa.codigo = nullif(c.parceiro, '')
  where m.marca = any(public.teeds_marcas_em_foco(p_marca)) and not m.demo
    and (m.marca = any(public.teeds_marcas_admin_total()) or m.user_id = any(public.teeds_clientes_do_escopo()))
    and (m.ocorrida_em at time zone j.fuso)::date between least(j.ini, j.fim) and greatest(j.ini, j.fim)
    and greatest(j.ini, j.fim) - least(j.ini, j.fim) <= 3650
  order by m.ocorrida_em desc
  limit greatest(1, least(coalesce(p_limite, 5000), 20000));
$$;
revoke all on function public.teeds_movimentacoes_periodo(text, date, date, integer, text) from public, anon;
grant execute on function public.teeds_movimentacoes_periodo(text, date, date, integer, text) to authenticated;
