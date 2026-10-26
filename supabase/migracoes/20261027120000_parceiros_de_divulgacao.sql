-- Parceiros de divulgação (27/10/2026). Tiago: "preciso ter uma separação
-- completa dos clientes de cada um... um link específico para divulgação...
-- rastrear quanto gerou de comissão de markup dos clientes dele de forma
-- separada... não pode ter mistura".
--
-- GlobalFly: Naor Bezerra (/n) e Victor Cordeiro (/v). O link abre o cadastro
-- e guarda o código do parceiro no navegador (primeiro toque, 90 dias).
--
-- Regras:
--  * um cliente, um parceiro. Vale o primeiro: o lead guarda o parceiro com
--    que chegou e um cadastro repetido não troca;
--  * o cliente herda o parceiro do lead quando a conta nasce (aprovação);
--  * quem chega sem link fica sem parceiro ("Direto");
--  * o parceiro de um cliente só muda pela função de troca, só pelo admin
--    geral (o da marca teeds), e toda troca fica registrada;
--  * o relatório por parceiro é só do admin geral (o Victor é admin da GF e
--    também parceiro: não vê os números do outro por aqui).
--
-- O servidor das I.A. não muda (não pode reiniciar com cliente operando): o
-- código do parceiro chega dentro do endereço da página que ele já grava no
-- lead (`pagina`, ...?parceiro=n...), e o banco lê de lá.

create table if not exists public.parceiros (
  marca text not null,
  codigo text not null check (codigo ~ '^[a-z0-9]{1,20}$'),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (marca, codigo)
);
alter table public.parceiros enable row level security;
drop policy if exists parceiros_leitura_admin on public.parceiros;
create policy parceiros_leitura_admin on public.parceiros for select to authenticated using (public.teeds_sou_admin_da(marca));

insert into public.parceiros (marca, codigo, nome) values
  ('globalfly', 'n', 'Naor Bezerra'),
  ('globalfly', 'v', 'Victor Cordeiro')
on conflict (marca, codigo) do update set nome = excluded.nome;

alter table public.leads_capturados add column if not exists parceiro text;
alter table public.clientes add column if not exists parceiro text;
alter table public.clientes add column if not exists parceiro_em timestamptz;
alter table public.clientes add column if not exists parceiro_fonte text;
create index if not exists clientes_parceiro_idx on public.clientes (marca, parceiro);
create index if not exists leads_parceiro_idx on public.leads_capturados (marca, parceiro);

-- Cada clique num link de parceiro (um por navegador, por dia, por link).
create table if not exists public.parceiro_toques (
  marca text not null,
  codigo text not null,
  visitante text not null,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  link text,
  criado_em timestamptz not null default now(),
  primary key (marca, codigo, visitante, dia)
);
alter table public.parceiro_toques enable row level security;
-- ninguém lê direto: só pelo relatório

-- Toda troca de parceiro de um cliente, com quem e por quê.
create table if not exists public.parceiro_trocas (
  id bigint generated always as identity primary key,
  marca text not null,
  user_id uuid not null,
  de text,
  para text,
  motivo text,
  por uuid,
  fonte text not null,
  quando timestamptz not null default now()
);
alter table public.parceiro_trocas enable row level security;
drop policy if exists parceiro_trocas_leitura on public.parceiro_trocas;
create policy parceiro_trocas_leitura on public.parceiro_trocas for select to authenticated
  using (exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and a.marca = 'teeds'));

-- O admin geral: o da marca teeds (o Tiago).
create or replace function public.teeds_sou_admin_geral()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and a.marca = 'teeds');
$$;

-- O código que veio no endereço da página (só se for um parceiro ativo desta marca).
create or replace function public.teeds_parceiro_valido(p_marca text, p_codigo text)
returns text language sql stable security definer set search_path to 'public' as $$
  select p.codigo from public.parceiros p where p.marca = p_marca and p.codigo = lower(trim(p_codigo)) and p.ativo;
$$;
create or replace function public.teeds_parceiro_da_pagina(p_marca text, p_pagina text)
returns text language sql stable security definer set search_path to 'public' as $$
  select public.teeds_parceiro_valido(p_marca, substring(coalesce(p_pagina, '') from '[?&]parceiro=([a-zA-Z0-9]{1,20})'));
$$;

-- Liga um cliente a um parceiro (só se ainda não tem; só contas criadas depois do parceiro existir).
create or replace function public.teeds_ligar_cliente_ao_parceiro(p_user uuid, p_marca text, p_codigo text, p_fonte text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_codigo text := public.teeds_parceiro_valido(p_marca, p_codigo); v_ok boolean := false;
begin
  if v_codigo is null then return false; end if;
  perform set_config('teeds.troca_parceiro', '1', true);
  update public.clientes c set parceiro = v_codigo, parceiro_em = now(), parceiro_fonte = p_fonte
   where c.user_id = p_user and c.marca = p_marca and c.parceiro is null
     and c.criado_em >= (select p.criado_em from public.parceiros p where p.marca = p_marca and p.codigo = v_codigo)
  returning true into v_ok;
  perform set_config('teeds.troca_parceiro', '', true);
  if coalesce(v_ok, false) then
    insert into public.parceiro_trocas (marca, user_id, de, para, fonte) values (p_marca, p_user, null, v_codigo, p_fonte);
  end if;
  return coalesce(v_ok, false);
end $$;

-- Lead: o parceiro sai da página gravada; o primeiro que chegou fica.
create or replace function public.teeds_lead_parceiro()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid;
begin
  new.parceiro := coalesce(
    case when tg_op = 'UPDATE' then old.parceiro end,
    public.teeds_parceiro_valido(new.marca, new.parceiro),
    public.teeds_parceiro_da_pagina(new.marca, new.pagina));
  return new;
end $$;
drop trigger if exists teeds_lead_parceiro on public.leads_capturados;
create trigger teeds_lead_parceiro before insert or update on public.leads_capturados
  for each row execute function public.teeds_lead_parceiro();

-- Se a conta já existia quando o lead chegou, liga também.
create or replace function public.teeds_lead_parceiro_no_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid;
begin
  if new.parceiro is null then return new; end if;
  -- só conta recente (até 14 dias): cliente antigo, que veio direto, não vira de parceiro por clicar num link depois
  for v_user in select c.user_id from public.clientes c where c.marca = new.marca and lower(c.email) = new.email_normalizado and c.parceiro is null and c.criado_em >= now() - interval '14 days' loop
    perform public.teeds_ligar_cliente_ao_parceiro(v_user, new.marca, new.parceiro, 'cadastro');
  end loop;
  return new;
end $$;
drop trigger if exists teeds_lead_parceiro_no_cliente on public.leads_capturados;
create trigger teeds_lead_parceiro_no_cliente after insert or update on public.leads_capturados
  for each row execute function public.teeds_lead_parceiro_no_cliente();

-- Conta nova: herda o parceiro do lead desta marca e deste e-mail.
create or replace function public.teeds_cliente_herda_parceiro()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_codigo text;
begin
  if new.parceiro is not null then
    -- só entra pela ligação oficial
    if coalesce(current_setting('teeds.troca_parceiro', true), '') <> '1' then new.parceiro := null; new.parceiro_em := null; new.parceiro_fonte := null; end if;
    return new;
  end if;
  select l.parceiro into v_codigo from public.leads_capturados l
   where l.marca = new.marca and l.email_normalizado = lower(new.email) and l.parceiro is not null limit 1;
  if v_codigo is not null and new.criado_em >= (select p.criado_em from public.parceiros p where p.marca = new.marca and p.codigo = v_codigo) then
    new.parceiro := v_codigo; new.parceiro_em := now(); new.parceiro_fonte := 'cadastro';
  end if;
  return new;
end $$;
drop trigger if exists teeds_cliente_herda_parceiro on public.clientes;
create trigger teeds_cliente_herda_parceiro before insert on public.clientes
  for each row execute function public.teeds_cliente_herda_parceiro();

create or replace function public.teeds_cliente_registra_parceiro()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.parceiro is not null then
    insert into public.parceiro_trocas (marca, user_id, de, para, fonte) values (new.marca, new.user_id, null, new.parceiro, coalesce(new.parceiro_fonte, 'cadastro'));
  end if;
  return new;
end $$;
drop trigger if exists teeds_cliente_registra_parceiro on public.clientes;
create trigger teeds_cliente_registra_parceiro after insert on public.clientes
  for each row execute function public.teeds_cliente_registra_parceiro();

-- Trava: nenhuma edição comum (painel, ficha, scripts) mexe no parceiro.
create or replace function public.teeds_cliente_trava_parceiro()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if (new.parceiro is distinct from old.parceiro or new.parceiro_fonte is distinct from old.parceiro_fonte or new.parceiro_em is distinct from old.parceiro_em)
     and coalesce(current_setting('teeds.troca_parceiro', true), '') <> '1' then
    new.parceiro := old.parceiro; new.parceiro_em := old.parceiro_em; new.parceiro_fonte := old.parceiro_fonte;
  end if;
  return new;
end $$;
drop trigger if exists teeds_cliente_trava_parceiro on public.clientes;
create trigger teeds_cliente_trava_parceiro before update on public.clientes
  for each row execute function public.teeds_cliente_trava_parceiro();

-- Público: anota o clique no link (sem dado pessoal; um por navegador/dia/link).
create or replace function public.teeds_toque_parceiro(p_marca text, p_codigo text, p_visitante text, p_link text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_codigo text := public.teeds_parceiro_valido(p_marca, p_codigo);
begin
  if v_codigo is null or p_visitante !~ '^[a-zA-Z0-9]{8,40}$' then return; end if;
  insert into public.parceiro_toques (marca, codigo, visitante, link)
  values (p_marca, v_codigo, p_visitante, left(nullif(trim(coalesce(p_link, '')), ''), 60))
  on conflict do nothing;
end $$;
revoke all on function public.teeds_toque_parceiro(text, text, text, text) from public;
grant execute on function public.teeds_toque_parceiro(text, text, text, text) to anon, authenticated;

-- Logado: a conta nova que chegou por um link (ex.: comprou direto, sem passar pelo cadastro)
-- é ligada ao parceiro guardado no navegador. Só contas de até 14 dias, só se ainda sem parceiro.
create or replace function public.teeds_vincular_parceiro(p_marca text, p_codigo text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from public.clientes c where c.user_id = v_uid and c.marca = p_marca and c.parceiro is null and c.criado_em >= now() - interval '14 days') then return false; end if;
  return public.teeds_ligar_cliente_ao_parceiro(v_uid, p_marca, p_codigo, 'navegador');
end $$;
revoke all on function public.teeds_vincular_parceiro(text, text) from public;
grant execute on function public.teeds_vincular_parceiro(text, text) to authenticated;

-- Admin geral: troca (ou tira) o parceiro de um cliente, com motivo.
create or replace function public.teeds_trocar_parceiro(p_user uuid, p_marca text, p_codigo text, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_de text; v_para text := nullif(trim(coalesce(p_codigo, '')), '');
begin
  if not public.teeds_sou_admin_geral() then raise exception 'Só o admin geral troca o parceiro de um cliente.'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo da troca.'; end if;
  if v_para is not null and public.teeds_parceiro_valido(p_marca, v_para) is null then raise exception 'Parceiro desconhecido.'; end if;
  select parceiro into v_de from public.clientes where user_id = p_user and marca = p_marca;
  if not found then raise exception 'Cliente não encontrado nesta marca.'; end if;
  perform set_config('teeds.troca_parceiro', '1', true);
  update public.clientes set parceiro = v_para, parceiro_em = now(), parceiro_fonte = 'manual' where user_id = p_user and marca = p_marca;
  perform set_config('teeds.troca_parceiro', '', true);
  insert into public.parceiro_trocas (marca, user_id, de, para, motivo, por, fonte) values (p_marca, p_user, v_de, v_para, trim(p_motivo), auth.uid(), 'manual');
end $$;
revoke all on function public.teeds_trocar_parceiro(uuid, text, text, text) from public;
grant execute on function public.teeds_trocar_parceiro(uuid, text, text, text) to authenticated;

-- O relatório: cada parceiro (e o "Direto") lado a lado no período, e os clientes de cada um.
-- Markup = I.A. (markup informado pela Deriv quando há, senão o estimado) + operações manuais. Demo fica fora.
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
  ops as (
    select o.user_id, count(*) n, sum(o.entrada) volume, sum(coalesce(o.markup_deriv, o.markup)) markup, sum(o.resultado) resultado
    from public.operacoes_robos o
    where o.marca = p_marca and not o.demo and (o.executada_em at time zone p_fuso)::date between p_de and p_ate
    group by o.user_id
    union all
    select m.user_id, count(*), sum(m.entrada), sum(m.markup), sum(m.resultado)
    from public.operacoes_manuais m
    where m.marca = p_marca and not m.demo and (m.comprada_em at time zone p_fuso)::date between p_de and p_ate
    group by m.user_id
  ),
  por_cli as (
    select user_id, sum(n) n, sum(volume) volume, sum(markup) markup, sum(resultado) resultado from ops group by user_id
  ),
  linhas as (
    select g.codigo, g.nome, g.ordem,
      (select count(distinct t.visitante) from public.parceiro_toques t where t.marca = p_marca and t.codigo = g.codigo and t.dia between p_de and p_ate) as cliques,
      (select count(*) from public.leads_capturados l where l.marca = p_marca and coalesce(l.parceiro, '') = g.codigo
         and (coalesce(l.inscricao_recebida_em, l.convertido_em) at time zone p_fuso)::date between p_de and p_ate) as leads,
      (select count(*) from cli where cli.codigo = g.codigo and (cli.criado_em at time zone p_fuso)::date between p_de and p_ate) as contas_novas,
      (select count(*) from cli where cli.codigo = g.codigo) as clientes,
      (select count(*) from cli where cli.codigo = g.codigo and cli.status_acesso = 'ativo') as ativos,
      (select count(*) from cli join por_cli pc using (user_id) where cli.codigo = g.codigo) as operaram,
      (select coalesce(sum(pc.n), 0) from cli join por_cli pc using (user_id) where cli.codigo = g.codigo) as operacoes,
      (select coalesce(sum(pc.volume), 0) from cli join por_cli pc using (user_id) where cli.codigo = g.codigo) as volume,
      (select coalesce(sum(pc.markup), 0) from cli join por_cli pc using (user_id) where cli.codigo = g.codigo) as markup,
      (select coalesce(sum(pc.resultado), 0) from cli join por_cli pc using (user_id) where cli.codigo = g.codigo) as resultado,
      -- até 300 clientes por grupo, os que mais geraram primeiro
      (select coalesce(jsonb_agg(x.j order by x.m desc, x.c desc), '[]'::jsonb) from (
         select jsonb_build_object(
          'user_id', cli.user_id, 'nome', cli.nome, 'email', cli.email, 'criado_em', cli.criado_em, 'status', cli.status_acesso,
          'fonte', cli.parceiro_fonte, 'operacoes', coalesce(pc.n, 0), 'markup', round(coalesce(pc.markup, 0)::numeric, 2), 'volume', round(coalesce(pc.volume, 0)::numeric, 2)) j,
          coalesce(pc.markup, 0) m, cli.criado_em c
         from cli left join por_cli pc using (user_id) where cli.codigo = g.codigo
         order by coalesce(pc.markup, 0) desc, cli.criado_em desc limit 300) x) as lista
    from grupos g
  )
  select jsonb_build_object('parceiros', coalesce(jsonb_agg(jsonb_build_object(
      'codigo', codigo, 'nome', nome, 'cliques', cliques, 'leads', leads, 'contas_novas', contas_novas, 'clientes', clientes,
      'ativos', ativos, 'operaram', operaram, 'operacoes', operacoes, 'volume', round(volume::numeric, 2),
      'markup', round(markup::numeric, 2), 'resultado', round(resultado::numeric, 2), 'lista', lista) order by ordem, codigo), '[]'::jsonb))
  into v from linhas;
  return v;
end $$;
revoke all on function public.teeds_relatorio_parceiros(text, date, date, text) from public;
grant execute on function public.teeds_relatorio_parceiros(text, date, date, text) to authenticated;
