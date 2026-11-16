-- 16/11/2026 (Tiago: "um pouco mais para baixo a gente pode ter mais alguns indicadores, alguns gráficos para
-- enxergar melhor o negócio. Quero uma comparação do markup gerado nas operações manuais e nas feitas com
-- I.A.... lucro dos clientes, prejuízo dos clientes, markup gerado, o valor de conta de cada um... quanto
-- vale a pena investir numa operação manual, numa automatizada... recomendações geradas pela I.A. ... quais
-- foram as lives que renderam mais markup, o dia, o horário").
--
-- 1. lives_historico: a página "Iniciar transmissão" (transmissao_ao_vivo) guarda só a última. Daqui em
--    diante cada início e cada fim fica guardado por um gatilho que NUNCA derruba o controle da live.
--    As lives de antes são reconstruídas pelos cliques no aviso (eventos_cliente) e marcadas como
--    estimadas; a de lançamento (09/11) e a última do link entram com o horário exato.
-- 2. teeds_painel_negocio: o cruzamento manual x I.A. (mesma contagem de markup da tela inteira,
--    teeds_markup_operacoes: só conta real, equipe fora, parceiro do topo) com resultado dos clientes,
--    banca, depósitos, cada I.A., cada tipo de contrato, faixas de banca, dias, horas e as lives.
-- 3. negocio_analises: as leituras da I.A. (função negocio-analise), uma por pedido.

-- ------------------------------------------------------------------ 1. o histórico das lives
create table if not exists public.lives_historico (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  inicio timestamptz not null,
  fim timestamptz,
  origem text not null default 'link',      -- link (Iniciar transmissão) | lancamento | estimada (pelos cliques)
  estimada boolean not null default false,
  link text,
  iniciada_por text,
  encerrada_por text,
  criada_em timestamptz not null default now(),
  unique (marca, inicio)
);
alter table public.lives_historico enable row level security;
revoke all on public.lives_historico from anon, authenticated;

create or replace function public.teeds_transmissao_para_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.iniciada_em is not null and (tg_op = 'INSERT' or new.iniciada_em is distinct from old.iniciada_em) then
      -- a anterior que ninguém encerrou termina quando a nova começa (ou nas 6 horas em que sai sozinha)
      update public.lives_historico set fim = least(new.iniciada_em, inicio + interval '6 hours')
       where marca = new.marca and origem = 'link' and fim is null and inicio < new.iniciada_em;
      insert into public.lives_historico (marca, inicio, origem, link, iniciada_por)
      values (new.marca, new.iniciada_em, 'link', new.link, new.iniciada_por_nome)
      on conflict (marca, inicio) do nothing;
    end if;
    if new.encerrada_em is not null and new.iniciada_em is not null
       and (tg_op = 'INSERT' or new.encerrada_em is distinct from old.encerrada_em) then
      update public.lives_historico set fim = new.encerrada_em, encerrada_por = new.encerrada_por_nome
       where marca = new.marca and inicio = new.iniciada_em and fim is null;
    end if;
  exception when others then
    null;  -- o histórico nunca impede iniciar ou encerrar a transmissão
  end;
  return new;
end $$;
revoke all on function public.teeds_transmissao_para_historico() from public, anon, authenticated;

drop trigger if exists transmissao_para_historico on public.transmissao_ao_vivo;
create trigger transmissao_para_historico after insert or update on public.transmissao_ao_vivo
  for each row execute function public.teeds_transmissao_para_historico();

-- o que já aconteceu: a live de lançamento e a última do link, com o horário exato
insert into public.lives_historico (marca, inicio, fim, origem, estimada)
select l.marca, l.comecou_em, l.terminou_em, 'lancamento', false from public.lancamento_live l
 where l.comecou_em is not null and l.terminou_em is not null
on conflict (marca, inicio) do nothing;

insert into public.lives_historico (marca, inicio, fim, origem, estimada, link, iniciada_por, encerrada_por)
select t.marca, t.iniciada_em, t.encerrada_em, 'link', false, t.link, t.iniciada_por_nome, t.encerrada_por_nome
  from public.transmissao_ao_vivo t where t.iniciada_em is not null
on conflict (marca, inicio) do nothing;

-- as de antes: ilhas de cliques no aviso da transmissão (pausa de 30 min separa uma live da outra);
-- só as que juntaram gente (8 cliques, 10 pessoas) e que não batem com uma live de horário exato
with cl as (
  select e.marca, e.user_id, e.primeira_em as t from public.eventos_cliente e
   where e.alvo in ('Clique aqui para entrar', 'Entrar na live ao vivo', 'Ao vivoao vivo')
  union all
  select e.marca, e.user_id, e.ultima_em from public.eventos_cliente e
   where e.alvo in ('Clique aqui para entrar', 'Entrar na live ao vivo', 'Ao vivoao vivo') and e.ultima_em > e.primeira_em + interval '5 minutes'
), m as (
  select *, case when lag(t) over w is null or t - lag(t) over w > interval '30 minutes' then 1 else 0 end as novo
    from cl window w as (partition by marca order by t)
), g as (
  select *, sum(novo) over (partition by marca order by t) as ilha from m
), il as (
  select marca, ilha, min(t) as inicio, max(t) as fim, count(*) as cliques, count(distinct user_id) as pessoas from g group by 1, 2
)
insert into public.lives_historico (marca, inicio, fim, origem, estimada)
select il.marca, il.inicio, il.fim, 'estimada', true from il
 where il.cliques >= 8 and il.pessoas >= 10 and il.fim - il.inicio >= interval '10 minutes'
   and not exists (select 1 from public.lives_historico h
                    where h.marca = il.marca and h.inicio < il.fim and coalesce(h.fim, h.inicio + interval '6 hours') > il.inicio)
on conflict (marca, inicio) do nothing;

-- ------------------------------------------------------------------ 2. o painel do negócio
create or replace function public.teeds_painel_negocio(p_marca text, p_de timestamptz, p_ate timestamptz, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
  v_de timestamptz := least(p_de, p_ate);
  v_ate timestamptz := greatest(p_de, p_ate);
  r jsonb;
begin
  if p_de is null or p_ate is null then raise exception 'Escolha o início e o fim do período'; end if;
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  if v_ate - v_de > interval '400 days' then v_de := v_ate - interval '400 days'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with ops as materialized (
    select * from public.teeds_markup_operacoes(array[p_marca], v_par, v_de, v_ate)
  ),
  det as materialized (
    select o.origem, o.contract_id, o.user_id, o.quando, o.markup, o.entrada, o.resultado,
           (o.quando at time zone 'America/Sao_Paulo')::date as dia,
           extract(hour from o.quando at time zone 'America/Sao_Paulo')::int as hora,
           case when o.origem = 'ia' then coalesce(nullif(trim(r.robo_nome), ''), 'Sem nome')
                when m.tipo_contrato in ('CALL', 'PUT', 'CALLE', 'PUTE') then 'Sobe ou Desce'
                when m.tipo_contrato like 'DIGIT%' then 'Dígitos'
                when m.tipo_contrato like 'MULT%' then 'Multiplicadores'
                else 'Outros contratos' end as rotulo
      from ops o
      left join public.operacoes_robos r on o.origem = 'ia' and r.contract_id = o.contract_id and r.user_id = o.user_id
      left join public.operacoes_manuais m on o.origem = 'manual' and m.contract_id = o.contract_id and m.user_id = o.user_id
  ),
  pes as (
    select user_id,
           count(*) filter (where origem = 'ia') as ops_ia, count(*) filter (where origem = 'manual') as ops_man,
           coalesce(sum(markup) filter (where origem = 'ia'), 0) as mk_ia, coalesce(sum(markup) filter (where origem = 'manual'), 0) as mk_man,
           coalesce(sum(resultado) filter (where origem = 'ia'), 0) as res_ia, coalesce(sum(resultado) filter (where origem = 'manual'), 0) as res_man,
           count(distinct dia) filter (where origem = 'ia') as dias_ia, count(distinct dia) filter (where origem = 'manual') as dias_man,
           sum(entrada) as volume, sum(markup) as markup, sum(resultado) as resultado, count(*) as ops, count(distinct dia) as dias
      from det group by 1
  ),
  banca as (
    select k.user_id, sum(coalesce(k.saldo, 0)) as saldo from public.contas_deriv k
     where k.marca = p_marca and k.tipo = 'real' and k.user_id in (select user_id from pes) group by 1
  ),
  dep as (
    select v.user_id, coalesce(sum(abs(v.valor)) filter (where v.tipo = 'deposit'), 0) as depositos,
           coalesce(sum(abs(v.valor)) filter (where v.tipo = 'withdrawal'), 0) as saques
      from public.movimentacoes_deriv v
     where v.marca = p_marca and not v.demo and v.tipo in ('deposit', 'withdrawal')
       and v.ocorrida_em >= v_de and v.ocorrida_em < v_ate and v.user_id in (select user_id from pes)
     group by 1
  ),
  pp as materialized (
    select p.*, coalesce(b.saldo, 0) as saldo, coalesce(d.depositos, 0) as depositos, coalesce(d.saques, 0) as saques,
           case when p.ops_ia > 0 and p.ops_man > 0 then 'duas' when p.ops_ia > 0 then 'ia' else 'manual' end as perfil,
           case when coalesce(b.saldo, 0) <= 0 then 0 when b.saldo < 50 then 1 when b.saldo < 200 then 2
                when b.saldo < 1000 then 3 when b.saldo < 5000 then 4 else 5 end as faixa
      from pes p left join banca b on b.user_id = p.user_id left join dep d on d.user_id = p.user_id
  ),
  orig as (
    select o.origem,
           count(*) as operacoes, count(distinct o.user_id) as pessoas, sum(o.markup) as markup, sum(o.entrada) as volume,
           sum(o.resultado) as resultado,
           coalesce(sum(o.resultado) filter (where o.resultado > 0), 0) as ganhos,
           coalesce(sum(o.resultado) filter (where o.resultado < 0), 0) as perdas,
           count(*) filter (where o.resultado > 0) as ganhas, count(distinct o.dia) as dias
      from det o group by 1
  ),
  orig_p as (
    select x.origem,
           sum(x.saldo) as banca, count(*) filter (where x.saldo > 0) as com_saldo,
           count(*) filter (where x.res > 0) as lucrando, count(*) filter (where x.res < 0) as perdendo,
           coalesce(sum(x.res) filter (where x.res > 0), 0) as lucro, coalesce(sum(x.res) filter (where x.res < 0), 0) as prejuizo,
           sum(x.depositos) as depositos, avg(x.dias) as dias_media,
           percentile_cont(0.5) within group (order by x.mk) as markup_mediano
      from (
        select 'ia'::text as origem, saldo, res_ia as res, depositos, dias_ia as dias, mk_ia as mk from pp where ops_ia > 0
        union all
        select 'manual', saldo, res_man, depositos, dias_man, mk_man from pp where ops_man > 0
      ) x group by 1
  ),
  rot as (
    select origem, rotulo, count(*) as operacoes, count(distinct user_id) as pessoas, sum(markup) as markup, sum(entrada) as volume,
           sum(resultado) as resultado, count(*) filter (where resultado > 0) as ganhas
      from det group by 1, 2
  ),
  dias as (
    select dia, coalesce(sum(markup) filter (where origem = 'ia'), 0) as ia, coalesce(sum(markup) filter (where origem = 'manual'), 0) as manual,
           count(*) filter (where origem = 'ia') as ia_ops, count(*) filter (where origem = 'manual') as manual_ops,
           count(distinct user_id) filter (where origem = 'ia') as ia_pessoas, count(distinct user_id) filter (where origem = 'manual') as manual_pessoas
      from det group by 1
  ),
  horas as (
    select hora, coalesce(sum(markup) filter (where origem = 'ia'), 0) as ia, coalesce(sum(markup) filter (where origem = 'manual'), 0) as manual
      from det group by 1
  ),
  cli as (
    select c.user_id from public.clientes c
     where c.marca = p_marca
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  -- as lives do período: as do link (histórico), as estimadas pelos cliques e as feitas dentro da plataforma
  lv as materialized (
    select x.inicio, least(x.fim, now()) as fim, x.origem, x.estimada from (
      select h.inicio, coalesce(h.fim, h.inicio + interval '6 hours') as fim, h.origem, h.estimada
        from public.lives_historico h where h.marca = p_marca
      union all
      select t.iniciada_em, coalesce(t.encerrada_em, t.iniciada_em + interval '6 hours'), 'plataforma', false
        from public.transmissoes t where t.marca = p_marca and not t.teste and t.iniciada_em is not null
    ) x
    where x.inicio < v_ate and least(x.fim, now()) > v_de and least(x.fim, now()) - x.inicio >= interval '10 minutes'
  ),
  -- cada hora dos dias com operação: o markup e quanto dela esteve em live
  ph as (select date_trunc('hour', quando) as ini, sum(markup) as markup from det group by 1),
  bal as (
    select g as ini from generate_series(
      date_trunc('hour', greatest(v_de, (select min(quando) from det))),
      date_trunc('hour', least(v_ate, now()) - interval '1 microsecond'), interval '1 hour') g
     -- só os dias em que houve operação: dia parado (antes da abertura, por exemplo) não entra na régua
     where (g at time zone 'America/Sao_Paulo')::date in (select dia from det)
  ),
  bl as materialized (
    select b.ini, extract(hour from b.ini at time zone 'America/Sao_Paulo')::int as h, coalesce(p.markup, 0) as markup,
           least(1, coalesce((select sum(extract(epoch from (least(l.fim, b.ini + interval '1 hour') - greatest(l.inicio, b.ini)))) / 3600.0
                                from lv l where l.inicio < b.ini + interval '1 hour' and l.fim > b.ini), 0)) as frac
      from bal b left join ph p on p.ini = b.ini
  ),
  -- o típico de cada hora do dia quando NÃO há live (a régua para dizer quanto a live rendeu a mais)
  tip as (select h, avg(markup) as markup from bl where frac = 0 group by 1),
  tip_g as (select avg(markup) as markup from bl where frac = 0),
  lst as (
    select l.inicio, l.fim, l.origem, l.estimada, s.markup, s.operacoes, s.pessoas, s.volume, s.markup_ia, s.markup_manual, s.resultado,
           (select coalesce(sum(sub.parte * coalesce(t.markup, g.markup, 0)), 0)
              from (select b.h, extract(epoch from (least(l.fim, b.ini + interval '1 hour') - greatest(l.inicio, b.ini))) / 3600.0 as parte
                      from bl b where l.inicio < b.ini + interval '1 hour' and l.fim > b.ini) sub
              left join tip t on t.h = sub.h cross join tip_g g) as tipico,
           (select coalesce(sum(abs(v.valor)), 0) from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
             where v.marca = p_marca and not v.demo and v.tipo = 'deposit' and v.ocorrida_em >= l.inicio and v.ocorrida_em < l.fim) as depositos,
           (select count(distinct e.user_id) from public.eventos_cliente e join cli on cli.user_id = e.user_id
             where e.marca = p_marca and e.alvo in ('Clique aqui para entrar', 'Entrar na live ao vivo', 'Ao vivoao vivo')
               and e.primeira_em >= l.inicio - interval '10 minutes' and e.primeira_em < l.fim) as entraram
      from lv l
      cross join lateral (
        select coalesce(sum(o.markup), 0) as markup, count(*) as operacoes, count(distinct o.user_id) as pessoas,
               coalesce(sum(o.entrada), 0) as volume,
               coalesce(sum(o.markup) filter (where o.origem = 'ia'), 0) as markup_ia,
               coalesce(sum(o.markup) filter (where o.origem = 'manual'), 0) as markup_manual,
               coalesce(sum(o.resultado), 0) as resultado
          from det o where o.quando >= l.inicio and o.quando < l.fim
      ) s
  ),
  semana as (
    select extract(isodow from dia)::int as d, coalesce(sum(markup) filter (where origem = 'ia'), 0) as ia,
           coalesce(sum(markup) filter (where origem = 'manual'), 0) as manual, count(distinct dia) as vezes
      from det group by 1
  )
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'parceiro', v_par, 'lido_em', now(),
    'origens', (select coalesce(jsonb_object_agg(o.origem, jsonb_build_object(
        'operacoes', o.operacoes, 'pessoas', o.pessoas, 'markup', o.markup, 'volume', o.volume, 'resultado', o.resultado,
        'ganhos', o.ganhos, 'perdas', o.perdas, 'ganhas', o.ganhas, 'dias', o.dias,
        'banca', coalesce(q.banca, 0), 'com_saldo', coalesce(q.com_saldo, 0), 'lucrando', coalesce(q.lucrando, 0), 'perdendo', coalesce(q.perdendo, 0),
        'lucro', coalesce(q.lucro, 0), 'prejuizo', coalesce(q.prejuizo, 0), 'depositos', coalesce(q.depositos, 0),
        'dias_media', round(coalesce(q.dias_media, 0), 2), 'markup_mediano', coalesce(q.markup_mediano, 0))), '{}'::jsonb)
      from orig o left join orig_p q on q.origem = o.origem),
    'perfis', (select coalesce(jsonb_agg(jsonb_build_object(
        'perfil', x.perfil, 'pessoas', x.pessoas, 'markup', x.markup, 'markup_ia', x.mk_ia, 'markup_manual', x.mk_man, 'operacoes', x.ops,
        'volume', x.volume, 'resultado', x.resultado, 'lucrando', x.lucrando, 'perdendo', x.perdendo, 'banca', x.banca,
        'depositos', x.depositos, 'saques', x.saques, 'dias_media', round(x.dias_media, 2)) order by x.markup desc), '[]'::jsonb)
      from (select perfil, count(*) as pessoas, sum(markup) as markup, sum(mk_ia) as mk_ia, sum(mk_man) as mk_man, sum(ops) as ops, sum(volume) as volume,
                   sum(resultado) as resultado, count(*) filter (where resultado > 0) as lucrando, count(*) filter (where resultado < 0) as perdendo,
                   sum(saldo) as banca, sum(depositos) as depositos, sum(saques) as saques, avg(dias) as dias_media
              from pp group by 1) x),
    'faixas', (select coalesce(jsonb_agg(jsonb_build_object(
        'faixa', x.faixa, 'pessoas', x.pessoas, 'banca', x.banca, 'markup', x.markup, 'markup_ia', x.mk_ia, 'markup_manual', x.mk_man,
        'resultado', x.resultado, 'volume', x.volume, 'operacoes', x.ops) order by x.faixa), '[]'::jsonb)
      from (select faixa, count(*) as pessoas, sum(saldo) as banca, sum(markup) as markup, sum(mk_ia) as mk_ia, sum(mk_man) as mk_man,
                   sum(resultado) as resultado, sum(volume) as volume, sum(ops) as ops from pp group by 1) x),
    'clientes', (select jsonb_build_object(
        'lucrando', jsonb_build_object('pessoas', count(*) filter (where resultado > 0), 'markup', coalesce(sum(markup) filter (where resultado > 0), 0),
                                       'resultado', coalesce(sum(resultado) filter (where resultado > 0), 0), 'banca', coalesce(sum(saldo) filter (where resultado > 0), 0)),
        'perdendo', jsonb_build_object('pessoas', count(*) filter (where resultado < 0), 'markup', coalesce(sum(markup) filter (where resultado < 0), 0),
                                       'resultado', coalesce(sum(resultado) filter (where resultado < 0), 0), 'banca', coalesce(sum(saldo) filter (where resultado < 0), 0)),
        'zerados', count(*) filter (where resultado = 0),
        'sem_saldo', count(*) filter (where saldo <= 0), 'markup_sem_saldo', coalesce(sum(markup) filter (where saldo <= 0), 0),
        'um_dia_so', count(*) filter (where dias = 1), 'tres_dias_ou_mais', count(*) filter (where dias >= 3),
        'markup_tres_dias', coalesce(sum(markup) filter (where dias >= 3), 0)) from pp),
    'rotulos', (select coalesce(jsonb_agg(jsonb_build_object(
        'origem', origem, 'nome', rotulo, 'operacoes', operacoes, 'pessoas', pessoas, 'markup', markup, 'volume', volume,
        'resultado', resultado, 'ganhas', ganhas) order by markup desc), '[]'::jsonb) from rot),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'ia', ia, 'manual', manual, 'ia_ops', ia_ops, 'manual_ops', manual_ops,
        'ia_pessoas', ia_pessoas, 'manual_pessoas', manual_pessoas) order by dia), '[]'::jsonb) from dias),
    'horas', (select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'ia', ia, 'manual', manual) order by hora), '[]'::jsonb) from horas),
    'top', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', t.user_id, 'nome', c.nome, 'foto_url', c.foto_url, 'parceiro', c.parceiro, 'perfil', t.perfil, 'markup', t.markup,
        'markup_ia', t.mk_ia, 'markup_manual', t.mk_man, 'resultado', t.resultado, 'saldo', t.saldo, 'operacoes', t.ops, 'dias', t.dias,
        'depositos', t.depositos) order by t.markup desc), '[]'::jsonb)
      from (select * from pp order by markup desc limit 10) t join public.clientes c on c.user_id = t.user_id and c.marca = p_marca),
    'semana', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'ia', ia, 'manual', manual, 'vezes', vezes) order by d), '[]'::jsonb) from semana),
    'lives', (select coalesce(jsonb_agg(jsonb_build_object(
        'inicio', inicio, 'fim', fim, 'origem', origem, 'estimada', estimada, 'markup', markup, 'markup_ia', markup_ia, 'markup_manual', markup_manual,
        'operacoes', operacoes, 'pessoas', pessoas, 'volume', volume, 'resultado', resultado, 'tipico', tipico, 'depositos', depositos,
        'entraram', entraram) order by inicio desc), '[]'::jsonb) from lst),
    'lives_resumo', jsonb_build_object(
        'lives', (select count(*) from lst),
        'horas_live', (select coalesce(sum(frac), 0) from bl),
        'horas_fora', (select count(*) from bl where frac = 0),
        'markup_live', (select coalesce(sum(o.markup), 0) from det o where exists (select 1 from lv l where o.quando >= l.inicio and o.quando < l.fim)),
        'markup_fora', (select coalesce(sum(markup), 0) from bl where frac = 0),
        'tipico_live', (select coalesce(sum(tipico), 0) from lst))
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_painel_negocio(text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.teeds_painel_negocio(text, timestamptz, timestamptz, text) to authenticated;

-- ------------------------------------------------------------------ 3. as leituras da I.A.
create table if not exists public.negocio_analises (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  parceiro text not null default '',
  de timestamptz not null,
  ate timestamptz not null,
  periodo text,
  situacao text not null default 'analisando',   -- analisando | pronta | erro
  dados jsonb,
  erro text,
  modelo text,
  uso jsonb,
  quem uuid,
  quem_nome text,
  criado_em timestamptz not null default now(),
  pronta_em timestamptz
);
create index if not exists negocio_analises_ultima on public.negocio_analises (marca, parceiro, criado_em desc);
alter table public.negocio_analises enable row level security;
revoke all on public.negocio_analises from anon, authenticated;
