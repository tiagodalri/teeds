-- 16/11/2026 (Tiago e Victor): na GlobalFly, o GF Member Gold sem saldo na conta real da Deriv
-- fica com a plataforma travada (só Início, Suporte, Meu perfil, depósitos e Marketplace) e sem
-- simulador. Com qualquer saldo acima de zero em alguma conta real, tudo volta (Gold = 1 h de
-- simulador por dia). Black, Prestige e administradores nunca travam.
--
-- O saldo é o de contas_deriv: o servidor relê as contas reais de quem autorizou a cada 30 min,
-- e o site grava o saldo da conta aberta (e, quando trava, o de toda real com saldo que a Deriv
-- mostra ao vivo). O site só trava com a resposta do banco E sem saldo ao vivo: na dúvida, libera.

create or replace function public.teeds_conta_travada(p_user uuid, p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
     and p_marca = 'globalfly'
     and not exists (select 1 from administradores a where a.user_id = p_user and a.marca = p_marca)
     and exists (select 1 from clientes c where c.user_id = p_user and c.marca = p_marca)
     and public.teeds_subplano_id(p_user, p_marca) = 'gold'
     and not exists (select 1 from contas_deriv d
                      where d.user_id = p_user and d.marca = p_marca and d.tipo = 'real' and d.saldo > 0);
$$;
revoke all on function public.teeds_conta_travada(uuid, text) from public, anon, authenticated;
grant execute on function public.teeds_conta_travada(uuid, text) to service_role;

-- o que o site pergunta (só sobre quem está logado)
create or replace function public.gf_minha_liberacao(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'travada', public.teeds_conta_travada(auth.uid(), p_marca),
    'saldo', (select coalesce(sum(d.saldo), 0) from contas_deriv d
               where d.user_id = auth.uid() and d.marca = p_marca and d.tipo = 'real' and d.saldo > 0),
    'conta_real', exists (select 1 from contas_deriv d where d.user_id = auth.uid() and d.marca = p_marca and d.tipo = 'real'));
$$;
revoke all on function public.gf_minha_liberacao(text) from public, anon;
grant execute on function public.gf_minha_liberacao(text) to authenticated;

-- simulador: o Gold travado não liga I.A. na demo (o servidor já consulta esta função ao ligar)
create or replace function public.teeds_simulador_permitido(p_user uuid, p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from administradores where user_id = p_user and marca = p_marca)
      or (exists(select 1 from clientes c where c.user_id = p_user and c.marca = p_marca
            and public.teeds_plano_tem(c.marca, c.plano_id, 'simulador')
            and c.status_acesso = 'ativo' and (c.acesso_expira_em is null or c.acesso_expira_em > now()))
          and not public.teeds_conta_travada(p_user, p_marca)
          and coalesce((select s.simulador_horas * 60 > public.teeds_simulador_minutos_hoje(p_user, p_marca)
                          from subplanos s where s.marca = p_marca and s.id = public.teeds_subplano_id(p_user, p_marca) and s.simulador_horas is not null), true));
$$;

-- notificação para quem está travado (público 'travados' no disparo)
create or replace function public.teeds_push_destinos(p_marca text, p_publico text, p_parceiro text default null, p_eu uuid default null)
returns table(tabela text, chave text, endpoint text, p256dh text, auth text, parceiro text, pessoa text)
language sql stable security definer set search_path = public as $$
  with pessoas as (
    select c.user_id, lower(c.email) as email, nullif(c.parceiro, '') as parceiro
      from public.clientes c
     where c.marca = p_marca and p_publico <> 'eu'
       and case p_publico
             when 'todos' then true
             when 'aguardando' then c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
             when 'membros' then c.status_acesso = 'ativo' and c.plano_id = 'treino'
             when 'ativos' then c.status_acesso = 'ativo'
             when 'travados' then c.status_acesso = 'ativo' and public.teeds_conta_travada(c.user_id, c.marca)
             else false end
       and (p_parceiro is null or (p_parceiro = 'direto' and coalesce(c.parceiro, '') = '') or c.parceiro = p_parceiro)
  ), todos as (
    select 'push_assinaturas' as tabela, a.id::text as chave, a.endpoint, a.p256dh, a.auth, p.parceiro, p.user_id::text as pessoa
      from public.push_assinaturas a join pessoas p on p.user_id = a.user_id
     where a.marca = p_marca
    union all
    select 'lancamento_push', l.endpoint, l.endpoint, l.p256dh, l.auth, coalesce(l.parceiro, p.parceiro), p.user_id::text
      from public.lancamento_push l join pessoas p on p.email = lower(l.email)
     where l.marca = p_marca
    union all
    select 'push_assinaturas', a.id::text, a.endpoint, a.p256dh, a.auth, null, a.user_id::text
      from public.push_assinaturas a
     where p_publico = 'eu' and a.marca = p_marca and a.user_id = p_eu
  )
  select distinct on (endpoint) tabela, chave, endpoint, p256dh, auth, parceiro, pessoa from todos order by endpoint, tabela desc;
$$;
