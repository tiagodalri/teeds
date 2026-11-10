-- 09/11/2026, depois da live (Tiago): toda vez que um cliente da GF operar em conta real, chega uma
-- notificação no celular da administração ("Atenção: uma comissão está sendo gerada", com o nome, a banca
-- e o que ele ligou). No máximo 1 aviso por cliente a cada 10 min; operações dos próprios admins não contam.
-- Quem manda é a função notificacoes (ação operacao_real), pelo mesmo segredo do gatilho dos outros avisos.
-- Aplicada em produção em 09/11/2026 ~23h30.
create table if not exists public.avisos_operacao_real (
  user_id uuid primary key,
  ultimo timestamptz not null default now()
);
alter table public.avisos_operacao_real enable row level security;
revoke all on public.avisos_operacao_real from anon, authenticated;

create or replace function public.teeds_avisar_operacao_real()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  segredo text;
  v_origem text := case when tg_table_name = 'operacoes_manuais' then 'manual' else 'ia' end;
begin
  if new.marca is distinct from 'globalfly' or coalesce(new.demo, true) then return new; end if;
  if exists (select 1 from public.administradores a where a.user_id = new.user_id) then return new; end if;
  insert into public.avisos_operacao_real as av (user_id, ultimo) values (new.user_id, now())
  on conflict (user_id) do update set ultimo = now() where av.ultimo < now() - interval '10 minutes';
  if not found then return new; end if;
  begin
    select valor into segredo from public.config_servicos where chave = 'PUSH_GATILHO';
    perform net.http_post(
      url := 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/notificacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-gatilho', segredo),
      body := jsonb_build_object('acao', 'operacao_real', 'origem', v_origem, 'user_id', new.user_id, 'conta_id', new.conta_id,
        'robo', case when v_origem = 'ia' then to_jsonb(new) ->> 'robo_nome' else null end,
        'entrada', case when v_origem = 'manual' then to_jsonb(new) ->> 'entrada' else to_jsonb(new) ->> 'entrada_inicial' end)
    );
  exception when others then
    raise warning 'notificacoes: aviso de operação real não enviado (%)', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.teeds_avisar_operacao_real() from public, anon, authenticated;

drop trigger if exists teeds_aviso_operacao_real on public.sessoes_robos;
create trigger teeds_aviso_operacao_real after insert on public.sessoes_robos
  for each row execute function public.teeds_avisar_operacao_real();
drop trigger if exists teeds_aviso_operacao_real on public.operacoes_manuais;
create trigger teeds_aviso_operacao_real after insert on public.operacoes_manuais
  for each row execute function public.teeds_avisar_operacao_real();
