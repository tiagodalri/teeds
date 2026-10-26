-- O parceiro vale pela URL (27/10/2026, Tiago: "podem ter clientes em comum
-- entre as plataformas, por isso o que deve valer é a URL: se for no /n é
-- Naor, se for no /v é Victor").
--
-- Até aqui o parceiro era da CONTA (o primeiro link, travado no banco), e
-- toda operação do cliente contava para ele. Agora cada sessão de I.A. e cada
-- operação manual guarda a VITRINE em que aconteceu:
--   'n', 'v'  = o endereço do parceiro (/n, /v)
--   ''        = direto (sem parceiro no endereço)
--   null      = registro de antes desta regra: vale o parceiro da conta
--
-- O parceiro da conta continua existindo: é quem trouxe o cliente (cliques,
-- leads, contas novas). Operações, volume e markup passam a contar pela vitrine.

alter table public.sessoes_robos         add column if not exists parceiro text;
alter table public.sessoes_robos_ao_vivo add column if not exists parceiro text;
alter table public.operacoes_robos       add column if not exists parceiro text;
alter table public.operacoes_manuais     add column if not exists parceiro text;

-- código desconhecido (ou de parceiro inativo) vira direto; null fica null (registro antigo/servidor antigo)
create or replace function public.teeds_vitrine_valida(p_marca text, p_codigo text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p_codigo is null then null
    when btrim(p_codigo) = '' or lower(btrim(p_codigo)) = 'direto' then ''
    else coalesce(public.teeds_parceiro_valido(p_marca, p_codigo), '')
  end;
$$;

create or replace function public.teeds_vitrine_normalizar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  new.parceiro := public.teeds_vitrine_valida(new.marca, new.parceiro);
  return new;
end $$;

-- a operação e a foto ao vivo herdam a vitrine da sessão
create or replace function public.teeds_vitrine_da_sessao() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.sessao_id is not null then
    select s.parceiro into new.parceiro from public.sessoes_robos s where s.id = new.sessao_id;
  else
    new.parceiro := public.teeds_vitrine_valida(new.marca, new.parceiro);
  end if;
  return new;
end $$;

drop trigger if exists sessoes_robos_vitrine on public.sessoes_robos;
create trigger sessoes_robos_vitrine before insert or update of parceiro on public.sessoes_robos
  for each row execute function public.teeds_vitrine_normalizar();
drop trigger if exists operacoes_manuais_vitrine on public.operacoes_manuais;
create trigger operacoes_manuais_vitrine before insert or update of parceiro on public.operacoes_manuais
  for each row execute function public.teeds_vitrine_normalizar();
drop trigger if exists operacoes_robos_vitrine on public.operacoes_robos;
create trigger operacoes_robos_vitrine before insert on public.operacoes_robos
  for each row execute function public.teeds_vitrine_da_sessao();
drop trigger if exists sessoes_ao_vivo_vitrine on public.sessoes_robos_ao_vivo;
create trigger sessoes_ao_vivo_vitrine before insert on public.sessoes_robos_ao_vivo
  for each row execute function public.teeds_vitrine_da_sessao();

create index if not exists sessoes_robos_marca_parceiro_idx on public.sessoes_robos (marca, parceiro, criada_em desc);

-- ------------------------------------------------------------- autorização da Deriv por app
-- Um cliente em comum usa o app do Naor no /n e o app da marca no /v. Cada app
-- tem a sua autorização (a Deriv credita o markup ao app que abriu o contrato).
-- A tabela antiga (uma por cliente) fica como está para o servidor antigo; o
-- servidor novo grava aqui e lê daqui primeiro.
create table if not exists public.deriv_autorizacoes_apps (
  user_id       uuid not null references auth.users(id) on delete cascade,
  app_id        text not null,
  marca         text not null,
  segredo       text not null,
  expira_em     timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, app_id)
);
alter table public.deriv_autorizacoes_apps enable row level security;
-- sem política: só o servidor (chave de serviço) lê e grava
revoke all on public.deriv_autorizacoes_apps from anon, authenticated;

-- o app de cada parceiro, só quando liberado
create or replace function public.teeds_apps_dos_parceiros()
returns table (marca text, codigo text, deriv_app_id text)
language sql stable security definer set search_path to 'public' as $$
  select marca, codigo, deriv_app_id from public.parceiros where deriv_app_id is not null and ativo and app_liberado;
$$;

-- ------------------------------------------------------------- relatório: operações pela vitrine
create or replace function public.teeds_relatorio_parceiros(p_marca text, p_de date, p_ate date, p_fuso text default 'America/Sao_Paulo')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral vê o relatório por parceiro.'; end if;
  with grupos as (
    select p.codigo, p.nome, 0 as ordem from public.parceiros p where p.marca = p_marca
    union all select '', 'Direto (sem link)', 1
  ),
  cli as (
    select c.user_id, coalesce(c.parceiro, '') as codigo, c.nome, c.email, c.criado_em, c.status_acesso, c.parceiro_fonte
    from public.clientes c where c.marca = p_marca
  ),
  -- cada operação conta para a vitrine em que aconteceu; registro antigo, para o parceiro da conta
  ops as (
    select o.user_id, coalesce(o.parceiro, cl.codigo, '') as vitrine, o.entrada, coalesce(o.markup_deriv, o.markup) as markup, o.resultado
    from public.operacoes_robos o left join cli cl on cl.user_id = o.user_id
    where o.marca = p_marca and not o.demo and (o.executada_em at time zone p_fuso)::date between p_de and p_ate
    union all
    select m.user_id, coalesce(m.parceiro, cl.codigo, ''), m.entrada, m.markup, m.resultado
    from public.operacoes_manuais m left join cli cl on cl.user_id = m.user_id
    where m.marca = p_marca and not m.demo and m.situacao <> 'aberta' and (m.comprada_em at time zone p_fuso)::date between p_de and p_ate
  ),
  por_cli as (
    select vitrine, user_id, count(*) n, sum(entrada) volume, sum(markup) markup, sum(resultado) resultado from ops group by vitrine, user_id
  ),
  linhas as (
    select g.codigo, g.nome, g.ordem,
      (select count(distinct t.visitante) from public.parceiro_toques t where t.marca = p_marca and t.codigo = g.codigo and t.dia between p_de and p_ate) as cliques,
      (select count(*) from public.leads_capturados l where l.marca = p_marca and coalesce(l.parceiro, '') = g.codigo
         and (coalesce(l.inscricao_recebida_em, l.convertido_em) at time zone p_fuso)::date between p_de and p_ate) as leads,
      (select count(*) from cli where cli.codigo = g.codigo and (cli.criado_em at time zone p_fuso)::date between p_de and p_ate) as contas_novas,
      (select count(*) from cli where cli.codigo = g.codigo) as clientes,
      (select count(*) from cli where cli.codigo = g.codigo and cli.status_acesso = 'ativo') as ativos,
      (select count(*) from por_cli pc where pc.vitrine = g.codigo) as operaram,
      (select coalesce(sum(pc.n), 0) from por_cli pc where pc.vitrine = g.codigo) as operacoes,
      (select coalesce(sum(pc.volume), 0) from por_cli pc where pc.vitrine = g.codigo) as volume,
      (select coalesce(sum(pc.markup), 0) from por_cli pc where pc.vitrine = g.codigo) as markup,
      (select coalesce(sum(pc.resultado), 0) from por_cli pc where pc.vitrine = g.codigo) as resultado,
      -- a lista: quem a conta trouxe e quem operou nesta vitrine
      (select coalesce(jsonb_agg(x.j order by x.m desc, x.c desc), '[]'::jsonb) from (
         select jsonb_build_object(
          'user_id', c2.user_id, 'nome', c2.nome, 'email', c2.email, 'criado_em', c2.criado_em, 'status', c2.status_acesso,
          'fonte', c2.parceiro_fonte, 'operacoes', coalesce(pc.n, 0), 'markup', round(coalesce(pc.markup, 0)::numeric, 2), 'volume', round(coalesce(pc.volume, 0)::numeric, 2)) j,
          coalesce(pc.markup, 0) m, c2.criado_em c
         from cli c2 left join por_cli pc on pc.user_id = c2.user_id and pc.vitrine = g.codigo
         where c2.codigo = g.codigo or pc.user_id is not null
         order by coalesce(pc.markup, 0) desc, c2.criado_em desc limit 300) x) as lista
    from grupos g
  )
  select jsonb_build_object('parceiros', coalesce(jsonb_agg(jsonb_build_object(
      'codigo', codigo, 'nome', nome, 'cliques', cliques, 'leads', leads, 'contas_novas', contas_novas, 'clientes', clientes,
      'ativos', ativos, 'operaram', operaram, 'operacoes', operacoes, 'volume', round(volume::numeric, 2),
      'markup', round(markup::numeric, 2), 'resultado', round(resultado::numeric, 2), 'lista', lista) order by ordem, codigo), '[]'::jsonb))
  into v from linhas;
  return v;
end $$;

revoke all on function public.teeds_vitrine_valida(text, text) from public, anon;
grant execute on function public.teeds_vitrine_valida(text, text) to authenticated;
