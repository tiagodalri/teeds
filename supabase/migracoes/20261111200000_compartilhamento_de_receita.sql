-- Compartilhamento de receita (11/11/2026, Tiago: "quem é do Gold paga 10% do que lucrou no mês, Black 5%,
-- Prestige nada... converter para reais com a cotação do dia e gerar uma fatura").
--
-- Regras decididas pelo Tiago em 11/11/2026:
--   * cada mês zera: o prejuízo de um mês NÃO abate no seguinte;
--   * lucro do mês = soma do resultado das operações em conta REAL feitas pela plataforma (I.A. em
--     operacoes_robos + manuais encerradas em operacoes_manuais), mês de Brasília, só em USD;
--   * percentual = subplanos.compartilhamento do subplano do cliente (teeds_subplano_id): Gold 10%,
--     Black 5%, Prestige 0% (sem fatura). A fatura guarda o subplano e o % do dia em que foi gerada;
--   * a fatura vence todo dia 01 do mês seguinte (gerada depois disso, vence no dia em que foi gerada);
--   * a cotação do dólar (comercial, AwesomeAPI) é a do momento em que a equipe gera, e fica gravada;
--   * equipe (administradores) fora; o admin do parceiro vê só os clientes dele, mas só o admin geral
--     gera, dá baixa e cancela;
--   * por enquanto só a equipe vê as faturas (visivel_cliente = false). Pagamento por Pix automático
--     depende da conta do gateway: as colunas gateway/cobranca_id/pix_* já ficam prontas.

create table if not exists public.compartilhamento_faturas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  marca text not null,
  user_id uuid not null,
  mes date not null check (extract(day from mes) = 1),
  parceiro text,
  nome text,
  email text,
  subplano text not null,
  percentual numeric(6,4) not null check (percentual > 0 and percentual <= 1),
  operacoes integer not null default 0,
  lucro_usd numeric(14,2) not null check (lucro_usd > 0),
  valor_usd numeric(14,2) not null check (valor_usd > 0),
  cotacao numeric(10,4) not null check (cotacao > 0),
  cotacao_fonte text,
  cotacao_em timestamptz,
  valor_brl numeric(14,2) not null check (valor_brl > 0),
  vencimento date not null,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  paga_em timestamptz,
  baixa_forma text check (baixa_forma in ('manual', 'pix')),
  baixa_por uuid,
  cancelada_em timestamptz,
  motivo text,
  gateway text,
  cobranca_id text,
  pix_copia_cola text,
  pix_qr text,
  link_pagamento text,
  visivel_cliente boolean not null default false,
  gerada_em timestamptz not null default now(),
  gerada_por uuid,
  historico jsonb not null default '[]'::jsonb
);
-- uma fatura viva por cliente e mês (cancelada não conta: dá para cancelar e gerar de novo)
create unique index if not exists compartilhamento_faturas_uma_por_mes
  on public.compartilhamento_faturas (marca, user_id, mes) where situacao <> 'cancelada';
create index if not exists compartilhamento_faturas_marca_mes on public.compartilhamento_faturas (marca, mes);
create index if not exists compartilhamento_faturas_user on public.compartilhamento_faturas (user_id);
alter table public.compartilhamento_faturas enable row level security;
-- sem políticas: tudo passa pelas funções abaixo
revoke all on public.compartilhamento_faturas from anon, authenticated;

-- Quem pode mexer em dinheiro: admin geral da marca (sem parceiro), ou o da Teeds.
create or replace function public.teeds_admin_geral_da(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.administradores a
                  where a.user_id = (select auth.uid()) and a.parceiro is null and (a.marca = p_marca or a.marca = 'teeds'));
$$;
revoke all on function public.teeds_admin_geral_da(text) from public, anon;
grant execute on function public.teeds_admin_geral_da(text) to authenticated;

-- O resultado de cada cliente no mês (interna: sem grant; quem chama já conferiu quem pede).
create or replace function public.teeds_compartilhamento_base(p_marca text, p_mes date, p_parceiro text)
returns table (user_id uuid, nome text, email text, telefone text, foto_url text, parceiro text, parceiro_nome text,
               subplano text, percentual numeric, operacoes bigint, ganhas bigint, manuais bigint, volume numeric,
               resultado numeric, valor_usd numeric)
language sql stable security definer set search_path to 'public' as $$
  with lim as (
    select (date_trunc('month', p_mes)::date)::timestamp at time zone 'America/Sao_Paulo' as ini,
           ((date_trunc('month', p_mes)::date) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo' as fim
  ), ops as (
    select o.user_id, o.resultado, o.entrada, coalesce(o.ganhou, o.resultado > 0) as ganhou, false as manual
      from public.operacoes_robos o, lim
     where o.marca = p_marca and not o.demo and coalesce(o.moeda, 'USD') = 'USD'
       and o.executada_em >= lim.ini and o.executada_em < lim.fim and o.resultado is not null
    union all
    select m.user_id, m.resultado, m.entrada, m.resultado > 0, true
      from public.operacoes_manuais m, lim
     where m.marca = p_marca and not m.demo and coalesce(m.moeda, 'USD') = 'USD' and m.situacao <> 'aberta'
       and m.comprada_em >= lim.ini and m.comprada_em < lim.fim and m.resultado is not null
  ), por as (
    select ops.user_id, count(*) n, count(*) filter (where ganhou) ganhas, count(*) filter (where manual) manuais,
           coalesce(sum(entrada), 0) volume, round(sum(resultado)::numeric, 2) resultado
      from ops group by ops.user_id
  ), base as (
    select p.*, c.nome, c.email, c.telefone, c.foto_url, c.parceiro, pa.nome as parceiro_nome,
           public.teeds_subplano_id(p.user_id, p_marca) as sub
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

create or replace function public.teeds_fatura_json(f public.compartilhamento_faturas)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', f.id, 'numero', f.numero, 'mes', f.mes, 'situacao', f.situacao, 'subplano', f.subplano,
    'percentual', f.percentual, 'operacoes', f.operacoes, 'lucro_usd', f.lucro_usd, 'valor_usd', f.valor_usd,
    'cotacao', f.cotacao, 'cotacao_fonte', f.cotacao_fonte, 'cotacao_em', f.cotacao_em, 'valor_brl', f.valor_brl,
    'vencimento', f.vencimento, 'paga_em', f.paga_em, 'baixa_forma', f.baixa_forma, 'cancelada_em', f.cancelada_em,
    'motivo', f.motivo, 'gateway', f.gateway, 'pix_copia_cola', f.pix_copia_cola, 'pix_qr', f.pix_qr,
    'link_pagamento', f.link_pagamento, 'visivel_cliente', f.visivel_cliente, 'gerada_em', f.gerada_em,
    'historico', f.historico, 'user_id', f.user_id, 'nome', f.nome, 'email', f.email, 'parceiro', f.parceiro);
$$;
revoke all on function public.teeds_fatura_json(public.compartilhamento_faturas) from public, anon, authenticated;

-- O painel: cada cliente do mês, a fatura de cada um, a carteira (todas as faturas) e o resumo por mês.
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
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', b.user_id, 'nome', b.nome, 'email', b.email, 'telefone', b.telefone, 'foto_url', b.foto_url,
          'parceiro', b.parceiro, 'parceiro_nome', b.parceiro_nome, 'subplano', b.subplano, 'percentual', b.percentual,
          'operacoes', b.operacoes, 'ganhas', b.ganhas, 'manuais', b.manuais, 'volume', b.volume,
          'resultado', b.resultado, 'valor_usd', b.valor_usd,
          'fatura', (select public.teeds_fatura_json(f) from public.compartilhamento_faturas f
                      where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao <> 'cancelada' limit 1),
          'canceladas', (select count(*) from public.compartilhamento_faturas f
                      where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao = 'cancelada'))
        order by b.resultado desc), '[]'::jsonb)
        from public.teeds_compartilhamento_base(p_marca, v_mes, v_par) b),
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

-- Gerar as faturas de um mês fechado (só admin geral). Só quem lucrou e tem % > 0; quem já tem fatura
-- viva no mês fica de fora; abaixo do valor mínimo em reais não gera. p_usuarios = só esses clientes.
create or replace function public.teeds_gerar_faturas_compartilhamento(
  p_marca text, p_mes date, p_cotacao numeric, p_fonte text default null, p_cotacao_em timestamptz default null,
  p_minimo_brl numeric default 0, p_usuarios uuid[] default null)
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

  select count(*) into v_abaixo from public.teeds_compartilhamento_base(p_marca, v_mes, null) b
   where b.valor_usd > 0 and round(b.valor_usd * p_cotacao, 2) < coalesce(p_minimo_brl, 0)
     and (p_usuarios is null or b.user_id = any(p_usuarios));

  with novas as (
    insert into public.compartilhamento_faturas (marca, user_id, mes, parceiro, nome, email, subplano, percentual, operacoes,
        lucro_usd, valor_usd, cotacao, cotacao_fonte, cotacao_em, valor_brl, vencimento, gerada_por, historico)
    select p_marca, b.user_id, v_mes, b.parceiro, b.nome, b.email, b.subplano, b.percentual, b.operacoes,
           b.resultado, b.valor_usd, p_cotacao, p_fonte, coalesce(p_cotacao_em, now()), round(b.valor_usd * p_cotacao, 2), v_venc, auth.uid(),
           jsonb_build_array(jsonb_build_object('acao', 'gerada', 'em', now(), 'por', auth.uid()))
      from public.teeds_compartilhamento_base(p_marca, v_mes, null) b
     where b.resultado > 0 and b.percentual > 0 and b.valor_usd > 0
       and round(b.valor_usd * p_cotacao, 2) >= greatest(coalesce(p_minimo_brl, 0), 0.01)
       and (p_usuarios is null or b.user_id = any(p_usuarios))
       and not exists (select 1 from public.compartilhamento_faturas f
                        where f.marca = p_marca and f.user_id = b.user_id and f.mes = v_mes and f.situacao <> 'cancelada')
    on conflict do nothing
    returning valor_brl, valor_usd)
  select count(*), coalesce(sum(valor_brl), 0), coalesce(sum(valor_usd), 0) into v_n, v_brl, v_usd from novas;

  return jsonb_build_object('geradas', v_n, 'total_brl', v_brl, 'total_usd', v_usd, 'abaixo_minimo', v_abaixo, 'vencimento', v_venc);
end $f$;
revoke all on function public.teeds_gerar_faturas_compartilhamento(text, date, numeric, text, timestamptz, numeric, uuid[]) from public, anon;
grant execute on function public.teeds_gerar_faturas_compartilhamento(text, date, numeric, text, timestamptz, numeric, uuid[]) to authenticated;

-- Dar baixa, cancelar ou reabrir uma fatura (só admin geral). Tudo vai para o histórico da fatura.
create or replace function public.teeds_fatura_compartilhamento_acao(p_id uuid, p_acao text, p_motivo text default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $f$
declare
  f public.compartilhamento_faturas;
begin
  select * into f from public.compartilhamento_faturas where id = p_id for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if not public.teeds_admin_geral_da(f.marca) then raise exception 'Só o admin geral mexe nas faturas'; end if;

  if p_acao = 'pagar' then
    if f.situacao <> 'aberta' then raise exception 'Só uma fatura em aberto pode ser marcada como paga'; end if;
    update public.compartilhamento_faturas set situacao = 'paga', paga_em = now(), baixa_forma = 'manual', baixa_por = auth.uid()
     where id = p_id returning * into f;
  elsif p_acao = 'cancelar' then
    if f.situacao <> 'aberta' then raise exception 'Só uma fatura em aberto pode ser cancelada'; end if;
    if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga o motivo do cancelamento'; end if;
    update public.compartilhamento_faturas set situacao = 'cancelada', cancelada_em = now(), motivo = trim(p_motivo)
     where id = p_id returning * into f;
  elsif p_acao = 'reabrir' then
    if f.situacao = 'aberta' then raise exception 'A fatura já está em aberto'; end if;
    if f.situacao = 'cancelada' and exists (select 1 from public.compartilhamento_faturas o where o.marca = f.marca and o.user_id = f.user_id
         and o.mes = f.mes and o.situacao <> 'cancelada' and o.id <> f.id) then
      raise exception 'Este cliente já tem outra fatura viva neste mês';
    end if;
    update public.compartilhamento_faturas set situacao = 'aberta', paga_em = null, baixa_forma = null, baixa_por = null, cancelada_em = null
     where id = p_id returning * into f;
  else
    raise exception 'Ação desconhecida';
  end if;

  update public.compartilhamento_faturas
     set historico = historico || jsonb_build_array(jsonb_build_object('acao', p_acao, 'em', now(), 'por', auth.uid(), 'motivo', nullif(trim(coalesce(p_motivo, '')), '')))
   where id = p_id returning * into f;
  return public.teeds_fatura_json(f);
end $f$;
revoke all on function public.teeds_fatura_compartilhamento_acao(uuid, text, text) from public, anon;
grant execute on function public.teeds_fatura_compartilhamento_acao(uuid, text, text) to authenticated;
