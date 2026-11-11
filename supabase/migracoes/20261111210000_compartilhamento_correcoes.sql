-- Compartilhamento de receita: correções da revisão (11/11/2026, antes de publicar).
--  1. O plano que vale é o do FIM do mês trabalhado, não o do dia em que a equipe gera (um Gold que compra
--     o Prestige no dia 01 continua pagando os 10% do mês anterior). teeds_subplano_no_fim.
--  2. A manual conta no mês em que FECHOU (encerrada_em). Antes: comprada no dia 31 e fechada no dia 01
--     não entrava em mês nenhum.
--  3. Um contrato conta uma vez (mesma régua do markup): uma conta Deriv ligada em dois logins não soma 2x.
--  4. Gerar recebe a lista exata de clientes que a tela mostrou (p_usuarios) e pula quem teve a fatura
--     cancelada no mês, a não ser que peçam para refazer (p_refazer_canceladas).
--  5. "Abaixo do mínimo" não conta quem já tem fatura.
--  6. O painel traz a última fatura cancelada de cada cliente e as faturas vivas de quem saiu da base
--     (virou equipe ou mudou de parceiro), para a tabela bater com a carteira.

create or replace function public.teeds_subplano_no_fim(p_user uuid, p_marca text, p_fim timestamptz)
returns text language sql stable security definer set search_path to 'public' as $$
  select case when p_fim > now() then public.teeds_subplano_id(p_user, p_marca) else coalesce(
    (select case when bool_or(cp.produto_id = 'gf-prestige') then 'prestige' when bool_or(cp.produto_id = 'gf-black') then 'black' end
       from public.cliente_produtos cp
      where cp.user_id = p_user and cp.marca = p_marca and cp.produto_id in ('gf-black', 'gf-prestige')
        and cp.concedido_em < p_fim
        -- ativo e valendo no fim do mês, ou venceu sozinho depois do fim do mês (reembolso não conta)
        and ((cp.ativo and (cp.expira_em is null or cp.expira_em >= p_fim))
             or (not cp.ativo and cp.expira_em >= p_fim and cp.expira_em <= now()))),
    (select case
              -- a categoria acompanha a compra: se a compra veio depois do mês, no mês ele era Gold
              when exists (select 1 from public.cliente_produtos cp where cp.user_id = p_user and cp.marca = p_marca
                            and cp.produto_id in ('gf-black', 'gf-prestige') and cp.concedido_em >= p_fim) then 'gold'
              when c.categoria in ('black', 'prestige') then c.categoria else 'gold' end
       from public.clientes c where c.user_id = p_user and c.marca = p_marca),
    'gold') end;
$$;
revoke all on function public.teeds_subplano_no_fim(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.teeds_compartilhamento_base(p_marca text, p_mes date, p_parceiro text)
returns table (user_id uuid, nome text, email text, telefone text, foto_url text, parceiro text, parceiro_nome text,
               subplano text, percentual numeric, operacoes bigint, ganhas bigint, manuais bigint, volume numeric,
               resultado numeric, valor_usd numeric)
language sql stable security definer set search_path to 'public' as $$
  with lim as (
    select (date_trunc('month', p_mes)::date)::timestamp at time zone 'America/Sao_Paulo' as ini,
           ((date_trunc('month', p_mes)::date) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo' as fim
  ), robos as (
    select distinct on (coalesce(o.contract_id::text, o.ctid::text))
           o.user_id, o.resultado, o.entrada, coalesce(o.ganhou, o.resultado > 0) as ganhou, false as manual
      from public.operacoes_robos o, lim
     where o.marca = p_marca and not o.demo and coalesce(o.moeda, 'USD') = 'USD'
       and o.executada_em >= lim.ini and o.executada_em < lim.fim and o.resultado is not null
     order by coalesce(o.contract_id::text, o.ctid::text), o.criado_em
  ), manuais as (
    select distinct on (coalesce(m.contract_id::text, m.ctid::text))
           m.user_id, m.resultado, m.entrada, m.resultado > 0 as ganhou, true as manual
      from public.operacoes_manuais m, lim
     where m.marca = p_marca and not m.demo and coalesce(m.moeda, 'USD') = 'USD' and m.situacao <> 'aberta'
       and m.comprada_em >= lim.ini - interval '120 days' and m.comprada_em < lim.fim
       and coalesce(m.encerrada_em, m.comprada_em) >= lim.ini and coalesce(m.encerrada_em, m.comprada_em) < lim.fim
       and m.resultado is not null
     order by coalesce(m.contract_id::text, m.ctid::text), m.criado_em
  ), ops as (select * from robos union all select * from manuais),
  por as (
    select ops.user_id, count(*) n, count(*) filter (where ganhou) ganhas, count(*) filter (where manual) manuais,
           coalesce(sum(entrada), 0) volume, round(sum(resultado)::numeric, 2) resultado
      from ops group by ops.user_id
  ), base as (
    select p.*, c.nome, c.email, c.telefone, c.foto_url, c.parceiro, pa.nome as parceiro_nome,
           public.teeds_subplano_no_fim(p.user_id, p_marca, (select fim from lim)) as sub
      from por p
      join public.clientes c on c.user_id = p.user_id and c.marca = p_marca
      left join public.parceiros pa on pa.marca = p_marca and pa.codigo = c.parceiro
     where not exists (select 1 from public.administradores a where a.user_id = p.user_id)
       and (p_parceiro is null or (p_parceiro = 'direto' and c.parceiro is null) or c.parceiro = p_parceiro)
  )
  select b.user_id, b.nome, b.email, b.telefone, b.foto_url, b.parceiro, b.parceiro_nome, b.sub,
         coalesce(s.compartilhamento, 0.10), b.n, b.ganhas, b.manuais, round(b.volume::numeric, 2), b.resultado,
         round(greatest(b.resultado, 0) * coalesce(s.compartilhamento, 0.10), 2)
    from base b left join public.subplanos s on s.marca = p_marca and s.id = b.sub;
$$;
revoke all on function public.teeds_compartilhamento_base(text, date, text) from public, anon, authenticated;

create or replace function public.teeds_compartilhamento(p_marca text, p_mes date, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare
  v_par text;
  v_mes date := date_trunc('month', p_mes)::date;
  v_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o compartilhamento de receita'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  return jsonb_build_object(
    'agora', now(), 'hoje', v_hoje, 'mes', v_mes, 'mes_atual', v_atual, 'fechado', v_mes < v_atual,
    'vencimento', greatest((v_mes + interval '1 month')::date, v_hoje),
    'parceiro', v_par, 'geral', public.teeds_admin_geral_da(p_marca),
    'percentuais', (select coalesce(jsonb_object_agg(s.id, s.compartilhamento), '{}'::jsonb) from public.subplanos s where s.marca = p_marca),
    'clientes', (with b0 as materialized (select * from public.teeds_compartilhamento_base(p_marca, v_mes, v_par))
      select coalesce(jsonb_agg(x.j order by (x.j->>'resultado')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'user_id', b.user_id, 'nome', b.nome, 'email', b.email, 'telefone', b.telefone, 'foto_url', b.foto_url,
          'parceiro', b.parceiro, 'parceiro_nome', b.parceiro_nome, 'subplano', b.subplano, 'percentual', b.percentual,
          'operacoes', b.operacoes, 'ganhas', b.ganhas, 'manuais', b.manuais, 'volume', b.volume,
          'resultado', b.resultado, 'valor_usd', b.valor_usd, 'fora_da_base', false,
          'fatura', (select public.teeds_fatura_json(f) from public.compartilhamento_faturas f
                      where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao <> 'cancelada' limit 1),
          'cancelada', (select public.teeds_fatura_json(f) from public.compartilhamento_faturas f
                      where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao = 'cancelada'
                      order by f.cancelada_em desc nulls last limit 1),
          'canceladas', (select count(*) from public.compartilhamento_faturas f
                      where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao = 'cancelada')) j
          from b0 b
        union all
        -- faturas vivas de quem não está mais na base de hoje (virou equipe ou trocou de parceiro)
        select jsonb_build_object(
          'user_id', f.user_id, 'nome', f.nome, 'email', f.email, 'telefone', c.telefone, 'foto_url', c.foto_url,
          'parceiro', f.parceiro, 'parceiro_nome', pa.nome, 'subplano', f.subplano, 'percentual', f.percentual,
          'operacoes', f.operacoes, 'ganhas', 0, 'manuais', 0, 'volume', 0,
          'resultado', f.lucro_usd, 'valor_usd', f.valor_usd, 'fora_da_base', true,
          'fatura', public.teeds_fatura_json(f), 'cancelada', null, 'canceladas', 0)
          from public.compartilhamento_faturas f
          left join public.clientes c on c.user_id = f.user_id and c.marca = f.marca
          left join public.parceiros pa on pa.marca = f.marca and pa.codigo = f.parceiro
         where f.marca = p_marca and f.mes = v_mes and f.situacao <> 'cancelada'
           and (v_par is null or (v_par = 'direto' and f.parceiro is null) or f.parceiro = v_par)
           and not exists (select 1 from b0 where b0.user_id = f.user_id)
      ) x),
    'carteira', (select jsonb_build_object(
          'abertas', count(*) filter (where f.situacao = 'aberta'),
          'a_receber_brl', coalesce(sum(f.valor_brl) filter (where f.situacao = 'aberta'), 0),
          'vencidas', count(*) filter (where f.situacao = 'aberta' and f.vencimento < v_hoje),
          'vencidas_brl', coalesce(sum(f.valor_brl) filter (where f.situacao = 'aberta' and f.vencimento < v_hoje), 0),
          'pagas', count(*) filter (where f.situacao = 'paga'),
          'recebido_brl', coalesce(sum(f.valor_brl) filter (where f.situacao = 'paga'), 0))
        from public.compartilhamento_faturas f
       where f.marca = p_marca and (v_par is null or (v_par = 'direto' and f.parceiro is null) or f.parceiro = v_par)),
    'meses', (select coalesce(jsonb_agg(x order by x->>'mes' desc), '[]'::jsonb) from (
        select jsonb_build_object('mes', f.mes,
          'faturas', count(*) filter (where f.situacao <> 'cancelada'),
          'valor_brl', coalesce(sum(f.valor_brl) filter (where f.situacao <> 'cancelada'), 0),
          'abertas', count(*) filter (where f.situacao = 'aberta'),
          'pagas', count(*) filter (where f.situacao = 'paga'),
          'recebido_brl', coalesce(sum(f.valor_brl) filter (where f.situacao = 'paga'), 0)) x
          from public.compartilhamento_faturas f
         where f.marca = p_marca and (v_par is null or (v_par = 'direto' and f.parceiro is null) or f.parceiro = v_par)
         group by f.mes) t)
  );
end $f$;
revoke all on function public.teeds_compartilhamento(text, date, text) from public, anon;
grant execute on function public.teeds_compartilhamento(text, date, text) to authenticated;

drop function if exists public.teeds_gerar_faturas_compartilhamento(text, date, numeric, text, timestamptz, numeric, uuid[]);
create or replace function public.teeds_gerar_faturas_compartilhamento(
  p_marca text, p_mes date, p_cotacao numeric, p_fonte text default null, p_cotacao_em timestamptz default null,
  p_minimo_brl numeric default 0, p_usuarios uuid[] default null, p_refazer_canceladas boolean default false)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $f$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc date;
  v_n integer := 0; v_brl numeric := 0; v_usd numeric := 0; v_abaixo integer := 0;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o admin geral gera faturas'; end if;
  if v_mes >= v_atual then raise exception 'O mês ainda não fechou: as faturas saem a partir do dia 01 do mês seguinte'; end if;
  if p_cotacao is null or p_cotacao < 2 or p_cotacao > 20 then raise exception 'Cotação do dólar inválida'; end if;
  v_venc := greatest((v_mes + interval '1 month')::date, v_hoje);

  with alvo as (
    select b.* from public.teeds_compartilhamento_base(p_marca, v_mes, null) b
     where b.resultado > 0 and b.percentual > 0 and b.valor_usd > 0
       and (p_usuarios is null or b.user_id = any(p_usuarios))
       and not exists (select 1 from public.compartilhamento_faturas f
                        where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao <> 'cancelada')
       and (p_refazer_canceladas or not exists (select 1 from public.compartilhamento_faturas f
                        where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao = 'cancelada'))
  ), abaixo as (
    select count(*) n from alvo where round(alvo.valor_usd * p_cotacao, 2) < greatest(coalesce(p_minimo_brl, 0), 0.01)
  ), novas as (
    insert into public.compartilhamento_faturas (marca, user_id, mes, parceiro, nome, email, subplano, percentual, operacoes,
        lucro_usd, valor_usd, cotacao, cotacao_fonte, cotacao_em, valor_brl, vencimento, gerada_por, historico)
    select p_marca, a.user_id, v_mes, a.parceiro, a.nome, a.email, a.subplano, a.percentual, a.operacoes,
           a.resultado, a.valor_usd, p_cotacao, p_fonte, coalesce(p_cotacao_em, now()), round(a.valor_usd * p_cotacao, 2), v_venc, auth.uid(),
           jsonb_build_array(jsonb_build_object('acao', 'gerada', 'em', now(), 'por', auth.uid(),
             'motivo', 'Mínimo R$ ' || round(coalesce(p_minimo_brl, 0), 2)::text))
      from alvo a
     where round(a.valor_usd * p_cotacao, 2) >= greatest(coalesce(p_minimo_brl, 0), 0.01)
    on conflict do nothing
    returning valor_brl, valor_usd)
  select (select count(*) from novas), (select coalesce(sum(valor_brl), 0) from novas), (select coalesce(sum(valor_usd), 0) from novas), (select n from abaixo)
    into v_n, v_brl, v_usd, v_abaixo;

  return jsonb_build_object('geradas', v_n, 'total_brl', v_brl, 'total_usd', v_usd, 'abaixo_minimo', v_abaixo, 'vencimento', v_venc);
end $f$;
revoke all on function public.teeds_gerar_faturas_compartilhamento(text, date, numeric, text, timestamptz, numeric, uuid[], boolean) from public, anon;
grant execute on function public.teeds_gerar_faturas_compartilhamento(text, date, numeric, text, timestamptz, numeric, uuid[], boolean) to authenticated;
