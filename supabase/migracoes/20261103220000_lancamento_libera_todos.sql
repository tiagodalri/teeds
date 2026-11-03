-- Lançamento da GlobalFly (03/11/2026, Tiago: "por mais que o cara não assistiu a live inteira, eu
-- gostaria que depois da live, em torno das 20h30 do dia 9, todos tenham o acesso liberado e sejam
-- cadastrados como GF Member... válido até o dia 9 de novembro de 2027").
--
-- Antes: só quem ficou até o fim virava GF Member, 3 horas depois do início.
-- Agora:
--   * às 20h30 de 09/11 (o servidor chama teeds_lancamento_fechar_sozinha) ou no "Encerrar e liberar",
--     todo inscrito no plano "Aguardando live" que a equipe não recusou vira GF Member ('treino'),
--     com acesso até 09/11/2027, 23h59 de Brasília;
--   * quem já tinha acesso (cliente, não administrador) no "Sem simulador" ou no GF Member com
--     validade menor também vira GF Member até 09/11/2027, sem perder validade maior nem a vitalícia;
--   * a live continua no ar depois das 20h30; ela só fecha sozinha 3 horas depois, como antes.

create or replace function public.teeds_lancamento_liberar_agora(p_marca text, p_quem uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer := 0;
  r record;
  v_ate constant timestamptz := '2027-11-09 23:59:59-03';
begin
  for r in
    select c.user_id, cp.id as lead
      from public.clientes c
      left join lateral (
        select x.id from public.clientes_pendentes x
         where x.marca = p_marca and x.status = 'pendente'
           and (x.user_id = c.user_id or lower(x.email) = lower(c.email))
         order by (x.user_id = c.user_id) desc nulls last limit 1) cp on true
     where c.marca = p_marca and c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
       -- cadastro recusado pela equipe continua recusado
       and (cp.id is not null or not exists (
             select 1 from public.clientes_pendentes y
              where y.marca = p_marca and y.status = 'recusado'
                and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))
  loop
    update public.clientes
       set plano_id = 'treino', status_acesso = 'ativo', acesso_inicio = now(), acesso_expira_em = v_ate
     where user_id = r.user_id and marca = p_marca and status_acesso = 'pendente';
    if r.lead is not null then
      update public.clientes_pendentes
         set status = 'aprovado', plano_id = 'treino', user_id = r.user_id,
             decidido_em = now(), decidido_por = p_quem, trava = null, trava_ate = null
       where id = r.lead and status = 'pendente';
      update auth.users
         set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
               || jsonb_build_object('aprovacao_lead', r.lead)
               || case when coalesce((raw_app_meta_data->>'senha_propria')::boolean, false) = false
                            and raw_user_meta_data->>'trocar_senha' = 'true'
                       then jsonb_build_object('senha_aprovacao_versao', 'provisoria-v2') else '{}'::jsonb end
       where id = r.user_id;
    end if;
    v_n := v_n + 1;
  end loop;

  -- quem já tinha acesso e não é da equipe: GF Member até 09/11/2027, sem encurtar ninguém
  update public.clientes c
     set plano_id = 'treino',
         acesso_expira_em = case when c.acesso_expira_em is null and c.plano_id = 'treino' then null
                                 else greatest(coalesce(c.acesso_expira_em, v_ate), v_ate) end
   where c.marca = p_marca and c.status_acesso = 'ativo'
     and (c.plano_id = 'essencial' or (c.plano_id = 'treino' and c.acesso_expira_em < v_ate))
     and not exists (select 1 from public.administradores a where a.user_id = c.user_id and a.marca in (p_marca, 'teeds'));

  update public.lancamento_live
     set liberado_em = coalesce(liberado_em, now()), liberados = coalesce(liberados, 0) + v_n, atualizado_em = now()
   where marca = p_marca;
  return v_n;
end $function$;

revoke all on function public.teeds_lancamento_liberar_agora(text, uuid) from public, anon, authenticated;

-- O servidor chama a cada rodada do carteiro: das 20h30 até 3 h depois do início, libera quem
-- ainda estiver esperando (inclusive quem se inscrever durante a live); a live fecha sozinha às 3 h.
create or replace function public.teeds_lancamento_fechar_sozinha(p_marca text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.lancamento_live;
  v_n integer := 0;
  v_fim timestamptz;
begin
  select * into l from public.lancamento_live where marca = p_marca for update;
  if not found then return 0; end if;
  v_fim := greatest(l.inicio_previsto, coalesce(l.comecou_em, l.inicio_previsto)) + interval '3 hours';
  if now() >= l.inicio_previsto + interval '30 minutes' and now() < v_fim + interval '10 minutes' then
    v_n := public.teeds_lancamento_liberar_agora(p_marca, null);
  end if;
  if l.terminou_em is null and now() >= v_fim then
    update public.lancamento_live
       set comecou_em = coalesce(comecou_em, inicio_previsto), terminou_em = least(now(), v_fim), atualizado_em = now()
     where marca = p_marca;
  end if;
  return v_n;
end $function$;

revoke all on function public.teeds_lancamento_fechar_sozinha(text) from public, anon, authenticated;

update public.planos_da_marca
   set descricao = 'Inscritos na live de lançamento de 09/11. Veem a plataforma trancada, com contagem regressiva. Às 20h30 de 09/11 todos viram GF Member, com acesso até 09/11/2027.',
       atualizado_em = now()
 where marca = 'globalfly' and plano_id = 'globalfly-aguardando-live';
