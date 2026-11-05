-- 05/11/2026 (Tiago, reunião de 04/11): o GF Member é o plano de todos e, dentro dele, o SUBPLANO:
-- Gold (aquisição zero, 10%, 3 I.A., 1 h de simulador), Black (R$ 997/ano, 5%, 5 I.A., 12 h, sala extra)
-- e Prestige (R$ 1.997/ano, sem compartilhamento, tudo, assessor e GFT Lab).
-- O subplano mora em clientes.categoria (o selo do topo, que já existia como Silver/Gold); uma compra
-- ativa de gf-black ou gf-prestige (cliente_produtos) vale por cima da categoria.
-- As travas valem no banco: teeds_robo_liberado (Gulf e Phenom) e teeds_simulador_permitido (horas
-- por dia) são as funções que o servidor das I.A. consulta antes de ligar cada sessão.

alter table public.clientes drop constraint if exists clientes_categoria_check;
alter table public.clientes add constraint clientes_categoria_check check (categoria = any (array['silver', 'gold', 'black', 'prestige']));

create table if not exists public.subplanos (
  marca text not null,
  id text not null,
  nome text not null,
  ordem int not null default 0,
  chamada text,
  preco_referencia numeric,
  preco numeric,
  cobranca text not null default 'anual',
  compartilhamento numeric not null default 0.10,
  ias text[],
  simulador_horas numeric,
  sala_extra boolean not null default false,
  assessor boolean not null default false,
  lab boolean not null default false,
  checkout_url text,
  assessor_whatsapp text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (marca, id)
);
alter table public.subplanos enable row level security;
drop policy if exists "logados veem os subplanos" on public.subplanos;
create policy "logados veem os subplanos" on public.subplanos for select to authenticated using (true);
drop policy if exists "admin geral edita os subplanos" on public.subplanos;
create policy "admin geral edita os subplanos" on public.subplanos for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

insert into public.subplanos (marca, id, nome, ordem, chamada, preco_referencia, preco, cobranca, compartilhamento, ias, simulador_horas, sala_extra, assessor, lab) values
  ('globalfly', 'gold', 'Gold', 1, 'A entrada no GF Member, com participação nos lucros.', 997, 0, 'aquisicao-zero', 0.10, array['goreme', 'falcon', 'legacy'], 1, false, false, false),
  ('globalfly', 'black', 'Black', 2, 'Todas as I.A., mais simulador e a sala extra.', 1997, 997, 'anual', 0.05, null, 12, true, false, false),
  ('globalfly', 'prestige', 'Prestige', 3, 'Tudo liberado, sem compartilhamento, com assessor e GFT Lab.', 2997, 1997, 'anual', 0, null, null, true, true, true)
on conflict (marca, id) do nothing;

-- o subplano de uma pessoa: a compra ativa mais alta; senão a categoria; senão Gold
create or replace function public.teeds_subplano_id(p_user uuid, p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when bool_or(cp.produto_id = 'gf-prestige') then 'prestige' when bool_or(cp.produto_id = 'gf-black') then 'black' end
       from cliente_produtos cp where cp.user_id = p_user and cp.marca = p_marca and cp.ativo
        and (cp.expira_em is null or cp.expira_em > now()) and cp.produto_id in ('gf-black', 'gf-prestige')),
    (select case when c.categoria in ('black', 'prestige') then c.categoria else 'gold' end from clientes c where c.user_id = p_user and c.marca = p_marca),
    'gold')
$$;

-- minutos de simulador (sessões na conta demo) usados hoje, no horário de Brasília
create or replace function public.teeds_simulador_minutos_hoje(p_user uuid, p_marca text)
returns numeric language sql stable security definer set search_path = public as $$
  with dia as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as ini)
  select coalesce(sum(extract(epoch from (least(coalesce(s.encerrada_em, now()), now()) - greatest(s.criada_em, dia.ini))) / 60), 0)
    from sessoes_robos s, dia
   where s.user_id = p_user and s.marca = p_marca and s.demo
     and coalesce(s.encerrada_em, now()) > dia.ini and s.criada_em < now()
$$;

create or replace function public.teeds_simulador_permitido(p_user uuid, p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from administradores where user_id = p_user and marca = p_marca)
      or (exists(select 1 from clientes c where c.user_id = p_user and c.marca = p_marca
            and public.teeds_plano_tem(c.marca, c.plano_id, 'simulador')
            and c.status_acesso = 'ativo' and (c.acesso_expira_em is null or c.acesso_expira_em > now()))
          and coalesce((select s.simulador_horas * 60 > public.teeds_simulador_minutos_hoje(p_user, p_marca)
                          from subplanos s where s.marca = p_marca and s.id = public.teeds_subplano_id(p_user, p_marca) and s.simulador_horas is not null), true));
$$;

-- Gulf e Phenom: liberados pelo subplano (ias nulo = todas) ou por uma compra avulsa, como antes
create or replace function public.teeds_robo_liberado(p_user uuid, p_marca text, p_robo text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_marca <> 'globalfly'
      or p_robo not in ('superior5', 'ag2')
      or exists (select 1 from administradores where user_id = p_user and marca = p_marca)
      or exists (select 1 from subplanos s where s.marca = p_marca and s.id = public.teeds_subplano_id(p_user, p_marca)
                   and (s.ias is null or p_robo = any(s.ias)))
      or exists (
        select 1 from cliente_produtos cp
         where cp.user_id = p_user and cp.marca = p_marca and cp.ativo
           and (cp.expira_em is null or cp.expira_em > now())
           and cp.produto_id in ('gf-base-stark', 'gf-pack', case p_robo when 'superior5' then 'gf-gulf' else 'gf-phenom' end));
$$;

-- a tela "Meu plano": o meu subplano, o uso do simulador hoje e todos os subplanos para comparar
create or replace function public.teeds_meu_subplano(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'atual', public.teeds_subplano_id(auth.uid(), p_marca),
    'admin', exists(select 1 from administradores where user_id = auth.uid() and marca = p_marca),
    'minutos_hoje', round(public.teeds_simulador_minutos_hoje(auth.uid(), p_marca)),
    'subplanos', coalesce((select jsonb_agg(to_jsonb(s) - 'marca' order by s.ordem) from subplanos s where s.marca = p_marca and s.ativo), '[]'::jsonb))
$$;
revoke all on function public.teeds_meu_subplano(text) from public;
grant execute on function public.teeds_meu_subplano(text) to authenticated;
