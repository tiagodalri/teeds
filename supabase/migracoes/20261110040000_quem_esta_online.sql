-- 10/11/2026 (Tiago, no Monitoramento ao vivo): "clicar no card Clientes online e ver quais clientes estão
-- online, de forma bem imersiva". Quem está na plataforma agora (a presença grava clientes.visto_em a cada
-- minuto com a aba aberta), com plano, aparelho, tempo de uso hoje, a banca da conta real e se está operando.
-- Só a administração da marca (o admin do parceiro vê só os clientes do parceiro dele). Equipe fica de fora.
create or replace function public.teeds_quem_esta_online(p_marca text, p_parceiro text default null, p_minutos integer default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde timestamptz := now() - make_interval(mins => greatest(1, least(coalesce(p_minutos, 3), 60)));
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê quem está online'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');
  return (select coalesce(jsonb_agg(x order by x.visto_em desc), '[]'::jsonb) from (
    select c.user_id, c.nome, c.email, c.foto_url, c.plano_id, pm.nome as plano, c.categoria, c.parceiro, c.status_acesso,
           c.visto_em, c.criado_em, c.acesso_expira_em, c.cidade, c.regiao,
           ad.dispositivo, coalesce(ad.segundos, 0) as segundos_hoje, coalesce(ad.acessos, 0) as acessos_hoje,
           (select jsonb_build_object('saldo', k.saldo, 'moeda', k.moeda, 'conta', k.conta_id)
              from public.contas_deriv k where k.user_id = c.user_id and k.marca = c.marca and k.tipo = 'real'
             order by k.saldo desc nulls last limit 1) as real,
           exists (select 1 from public.contas_deriv k where k.user_id = c.user_id and k.marca = c.marca and k.tipo = 'demo') as tem_demo,
           (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'robo', s.robo_nome, 'demo', s.demo, 'resultado', s.resultado,
                     'operacoes', s.operacoes, 'desde', s.criada_em, 'moeda', s.moeda) order by s.criada_em desc), '[]'::jsonb)
              from public.sessoes_robos s where s.user_id = c.user_id and s.marca = c.marca and s.situacao = 'rodando') as ias
      from public.clientes c
      left join public.planos_da_marca pm on pm.marca = c.marca and pm.plano_id = c.plano_id
      left join public.acessos_diarios ad on ad.marca = c.marca and ad.user_id = c.user_id and ad.dia = v_dia
     where c.marca = p_marca and c.visto_em >= v_desde
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
     order by c.visto_em desc
     limit 500
  ) x);
end $$;
revoke all on function public.teeds_quem_esta_online(text, text, integer) from public, anon;
grant execute on function public.teeds_quem_esta_online(text, text, integer) to authenticated;
