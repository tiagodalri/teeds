-- 16/11/2026 (Tiago: "teve alguém que clicou em algum botão do modal?"): o que cada Gold travado faz
-- na janela "Libere a sua conta" e quem libera depois. Só a administração lê (painel Contas travadas).

create table if not exists public.liberacao_eventos (
  id bigserial primary key,
  user_id uuid not null,
  marca text not null,
  tipo text not null check (tipo in ('abriu', 'depositar', 'conectar', 'verificar', 'black', 'prestige', 'suporte', 'fechar')),
  origem text,
  em timestamptz not null default now()
);
create index if not exists liberacao_eventos_marca_em on public.liberacao_eventos (marca, em);
create index if not exists liberacao_eventos_user on public.liberacao_eventos (user_id);
alter table public.liberacao_eventos enable row level security;
revoke all on public.liberacao_eventos from anon, authenticated;

-- quem estava travado quando a trava entrou (16/11/2026 10h50): a base do "quantos liberaram"
create table if not exists public.liberacao_travados_inicio (
  user_id uuid not null,
  marca text not null,
  em timestamptz not null default now(),
  primary key (user_id, marca)
);
alter table public.liberacao_travados_inicio enable row level security;
revoke all on public.liberacao_travados_inicio from anon, authenticated;
insert into public.liberacao_travados_inicio (user_id, marca, em)
select c.user_id, c.marca, timestamptz '2026-11-16 13:50:00+00'
  from public.clientes c
 where c.marca = 'globalfly' and c.status_acesso = 'ativo' and public.teeds_conta_travada(c.user_id, c.marca)
on conflict do nothing;

-- o site grava (só da própria pessoa, só travada de verdade)
create or replace function public.gf_registrar_liberacao(p_marca text, p_tipo text, p_origem text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or p_marca <> 'globalfly' then return; end if;
  if p_tipo not in ('abriu', 'depositar', 'conectar', 'verificar', 'black', 'prestige', 'suporte', 'fechar') then return; end if;
  -- o mesmo toque repetido no mesmo segundo conta uma vez
  if exists (select 1 from liberacao_eventos e where e.user_id = auth.uid() and e.marca = p_marca and e.tipo = p_tipo
              and e.em > now() - interval '1 second') then return; end if;
  insert into liberacao_eventos (user_id, marca, tipo, origem) values (auth.uid(), p_marca, p_tipo, left(p_origem, 20));
end $$;
revoke all on function public.gf_registrar_liberacao(text, text, text) from public, anon;
grant execute on function public.gf_registrar_liberacao(text, text, text) to authenticated;

-- o painel (Admin › Números › Contas travadas), no escopo de cada admin
create or replace function public.gf_painel_liberacao(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_par text;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê este painel'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');
  return (
    with escopo as (
      select c.user_id, c.nome, c.email, c.parceiro, pa.nome as parceiro_nome
        from clientes c left join parceiros pa on pa.marca = c.marca and pa.codigo = c.parceiro
       where c.marca = p_marca
         and not exists (select 1 from administradores a where a.user_id = c.user_id)
         and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
    ), ev as (
      select e.* from liberacao_eventos e join escopo s using (user_id) where e.marca = p_marca
    ), inicio as (
      select i.user_id, i.em from liberacao_travados_inicio i join escopo s using (user_id) where i.marca = p_marca
    ), envios as (
      select d.pessoa as user_id, d.disparo, d.aparelho
        from push_disparo_destinos d join push_disparos pd on pd.id = d.disparo
        join escopo s on s.user_id = d.pessoa
       where pd.marca = p_marca and pd.publico = 'travados'
    ), gente as (
      select s.user_id from escopo s
       where exists (select 1 from inicio i where i.user_id = s.user_id) or exists (select 1 from ev where ev.user_id = s.user_id)
    ), pessoas as (
      select s.user_id, s.nome, s.email, s.parceiro, s.parceiro_nome,
             public.teeds_conta_travada(s.user_id, p_marca) as travada,
             public.teeds_subplano_id(s.user_id, p_marca) as subplano,
             (select coalesce(sum(d.saldo), 0) from contas_deriv d where d.user_id = s.user_id and d.marca = p_marca and d.tipo = 'real' and d.saldo > 0) as saldo,
             exists (select 1 from contas_deriv d where d.user_id = s.user_id and d.marca = p_marca and d.tipo = 'real') as conta_real,
             exists (select 1 from inicio i where i.user_id = s.user_id) as no_inicio,
             (select jsonb_object_agg(t.tipo, t.n) from (select tipo, count(*) n from ev where ev.user_id = s.user_id group by tipo) t) as cliques,
             (select min(em) from ev where ev.user_id = s.user_id) as primeiro,
             (select max(em) from ev where ev.user_id = s.user_id) as ultimo,
             exists (select 1 from envios en where en.user_id = s.user_id) as push_enviado,
             exists (select 1 from envios en join push_eventos pe on pe.disparo = en.disparo and pe.aparelho = en.aparelho and pe.tipo = 'recebeu' where en.user_id = s.user_id) as push_recebeu,
             exists (select 1 from envios en join push_eventos pe on pe.disparo = en.disparo and pe.aparelho = en.aparelho and pe.tipo = 'clicou' where en.user_id = s.user_id) as push_clicou
        from escopo s join gente g using (user_id)
    )
    select jsonb_build_object(
      'agora', now(),
      'parceiro', v_par,
      'inicio', (select min(em) from liberacao_travados_inicio where marca = p_marca),
      'travados_agora', (select count(*) from escopo s join clientes c on c.user_id = s.user_id and c.marca = p_marca
                          where c.status_acesso = 'ativo' and public.teeds_conta_travada(s.user_id, p_marca)),
      'pessoas', (select coalesce(jsonb_agg(p order by p.ultimo desc nulls last, p.nome), '[]'::jsonb) from pessoas p),
      'dias', (select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
                 select (ev.em at time zone 'America/Sao_Paulo')::date as dia, ev.tipo, count(*) as cliques, count(distinct ev.user_id) as pessoas
                   from ev group by 1, 2) x),
      'push', (select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb) from (
                 select pd.id, pd.criado_em as em, pd.titulo,
                        (select count(distinct en.user_id) from envios en where en.disparo = pd.id) as pessoas,
                        (select count(*) from envios en where en.disparo = pd.id) as aparelhos,
                        (select count(distinct en.user_id) from envios en join push_eventos pe on pe.disparo = en.disparo and pe.aparelho = en.aparelho and pe.tipo = 'recebeu' where en.disparo = pd.id) as receberam,
                        (select count(distinct en.user_id) from envios en join push_eventos pe on pe.disparo = en.disparo and pe.aparelho = en.aparelho and pe.tipo = 'clicou' where en.disparo = pd.id) as clicaram
                   from push_disparos pd where pd.marca = p_marca and pd.publico = 'travados') x)
    )
  );
end $$;
revoke all on function public.gf_painel_liberacao(text, text) from public, anon;
grant execute on function public.gf_painel_liberacao(text, text) to authenticated;
