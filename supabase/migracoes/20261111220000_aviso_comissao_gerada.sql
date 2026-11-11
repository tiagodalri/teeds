-- Comissão gerada (11/11/2026, Tiago: "uma notificação apenas de comissão gerada... quando alguém encerrar uma
-- operação, seja manual ou com alguma I.A.... nenhum cliente pode receber"). Substitui o aviso de 09/11
-- (teeds_avisar_operacao_real, "uma comissão está sendo gerada", ao LIGAR, 1 por cliente a cada 10 min).
-- Agora: um aviso por encerramento, só para a administração da GF (a função `notificacoes`, ação 'comissao',
-- monta a lista a partir da tabela administradores). Ele escolheu "uma por encerramento" sabendo do volume.

-- Um aviso por encerramento: a chave impede repetir (upsert da manual, gravação dupla do fim da sessão).
-- 'base:<sessão>' guarda quando a sessão foi avisada (sessão continuada conta só o que veio depois).
create table if not exists public.avisos_comissao (
  chave text primary key,
  avisado_em timestamptz not null default now()
);
alter table public.avisos_comissao enable row level security;  -- sem política: só a chave de serviço

create or replace function public.teeds_avisar_comissao()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  segredo text;
  n jsonb := to_jsonb(new);
  v_chave text;
  v_corpo jsonb;
begin
  -- só GlobalFly, só conta real, só quando acabou de encerrar
  if new.marca is distinct from 'globalfly' or coalesce(new.demo, true) then return new; end if;
  if new.encerrada_em is null then return new; end if;
  if tg_op = 'UPDATE' and old.encerrada_em is not null then return new; end if;
  -- operação da equipe não gera aviso
  if exists (select 1 from public.administradores a where a.user_id = new.user_id) then return new; end if;

  if tg_table_name = 'operacoes_manuais' then
    -- a mesma regra da contagem oficial (teeds_markup_operacoes): manual conta com pagamento > 0
    if coalesce((n ->> 'pagamento')::numeric, 0) <= 0 or coalesce((n ->> 'markup')::numeric, 0) <= 0 then return new; end if;
    v_chave := 'm:' || (n ->> 'contract_id');
    v_corpo := jsonb_build_object('acao', 'comissao', 'origem', 'manual', 'user_id', new.user_id,
      'contract_id', n ->> 'contract_id', 'markup', (n ->> 'markup')::numeric, 'moeda', n ->> 'moeda');
  else
    if coalesce((n ->> 'operacoes')::int, 0) <= 0 then return new; end if;
    v_chave := 's:' || (n ->> 'id') || '@' || (n ->> 'encerrada_em');
    v_corpo := jsonb_build_object('acao', 'comissao', 'origem', 'ia', 'user_id', new.user_id,
      'sessao_id', n ->> 'id', 'robo', n ->> 'robo_nome', 'moeda', n ->> 'moeda');
  end if;

  insert into public.avisos_comissao (chave) values (v_chave) on conflict do nothing;
  if not found then return new; end if;

  begin
    select valor into segredo from public.config_servicos where chave = 'PUSH_GATILHO';
    perform net.http_post(
      url := 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/notificacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-gatilho', segredo),
      body := v_corpo,
      -- a função espera 8 s pelas últimas operações da sessão: o padrão de 5 s cortava a chamada
      timeout_milliseconds := 20000
    );
  exception when others then
    -- o aviso nunca atrapalha a gravação da operação
    raise warning 'notificacoes: aviso de comissão não enviado (%)', sqlerrm;
  end;
  return new;
end $$;

-- sai o aviso antigo (ao ligar), entra o novo (ao encerrar)
drop trigger if exists teeds_aviso_operacao_real on public.sessoes_robos;
drop trigger if exists teeds_aviso_operacao_real on public.operacoes_manuais;
drop trigger if exists teeds_aviso_comissao on public.sessoes_robos;
drop trigger if exists teeds_aviso_comissao on public.operacoes_manuais;
create trigger teeds_aviso_comissao after update of encerrada_em on public.sessoes_robos
  for each row execute function public.teeds_avisar_comissao();
create trigger teeds_aviso_comissao after insert or update of encerrada_em on public.operacoes_manuais
  for each row execute function public.teeds_avisar_comissao();
