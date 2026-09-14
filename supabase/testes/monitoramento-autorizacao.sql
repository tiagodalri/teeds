-- Provas de autorização do espelho operacional.
--
-- COMO RODAR (em homologação, DEPOIS de aplicar a migração; nunca aqui):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/testes/monitoramento-autorizacao.sql
-- Sai com código 0 quando todas as provas passam e diferente de zero na
-- primeira que falhar (cada prova é um `raise exception`). Tudo roda numa
-- transação desfeita no fim: nenhuma fixture sobra no banco.
--
-- Precisa de um papel capaz de `set role anon/authenticated/service_role`
-- (o `postgres` do projeto tem). As fixtures são criadas aqui mesmo, com
-- UUIDs fixos: dois admins (um por marca), um cliente comum e uma sessão de
-- cada marca. Nenhum UUID manual é necessário.

begin;

-- ============================================================ fixtures
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prova-admin-teeds@teste.local', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prova-admin-omni@teste.local',  'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prova-cliente@teste.local',     'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prova-cliente-omni@teste.local','x', now(), '{"provider":"email"}', '{}', now(), now());
insert into public.administradores (user_id, marca) values ('11111111-1111-4111-8111-111111111111', 'teeds'), ('22222222-2222-4222-8222-222222222222', 'omni');
insert into public.clientes (user_id, marca, email, nome) values
  ('33333333-3333-4333-8333-333333333333', 'teeds', 'prova-cliente@teste.local', 'Cliente de prova'),
  ('44444444-4444-4444-8444-444444444444', 'omni',  'prova-cliente-omni@teste.local', 'Cliente OMNI de prova');
insert into public.sessoes_robos (id, sessao_ref, user_id, marca, conta_id, demo, moeda, robo_id, robo_nome, ativo, origem, entrada_inicial, entrada_atual, stop_loss, take_profit, situacao)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'prova-t', '33333333-3333-4333-8333-333333333333', 'teeds', 'CR000001', true, 'USD', 'superior5', 'Teeds - AG7', '1HZ75V', 'navegador', 1, 1, 10, 10, 'rodando'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'prova-o', '44444444-4444-4444-8444-444444444444', 'omni',  'CR000002', true, 'USD', 'ag2', 'OMNI Under', '1HZ75V', 'navegador', 1, 1, 10, 10, 'encerrada');
insert into public.sessoes_robos_ao_vivo (sessao_id, marca, user_id, seq, estado, config, emitido_em) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'teeds', '33333333-3333-4333-8333-333333333333', 1, '{"fase":"aguardando"}', '{}', 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'omni',  '44444444-4444-4444-8444-444444444444', 1, '{"fase":"parado"}', '{}', 1);
insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'teeds', 1, 'abertura', '{}', 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'omni',  1, 'abertura', '{}', 1);

-- helpers: assume um papel/usuário e conta o que ele enxerga
create or replace function pg_temp.como(p_papel text, p_uid text) returns void language plpgsql as $$
begin
  execute format('set local role %I', p_papel);
  if p_uid is null then perform set_config('request.jwt.claims', '', true);
  else perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_papel)::text, true); end if;
end $$;
create or replace function pg_temp.conferir(p_nome text, p_ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_nome; end if;
  raise notice 'ok: %', p_nome;
end $$;
-- executa um comando esperando que ele seja RECUSADO (qualquer exceção); falha se passar
create or replace function pg_temp.deve_falhar(p_nome text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok (recusado): % — %', p_nome, sqlerrm; return;
  end;
  raise exception 'FALHOU: % — deveria ter sido recusado', p_nome;
end $$;

-- ============================================================ 1. anônimo
select pg_temp.como('anon', null);
select pg_temp.conferir('anon nao ve fotos',     (select count(*) from public.sessoes_robos_ao_vivo) = 0);
select pg_temp.conferir('anon nao ve pulsos',    (select count(*) from public.pulsos_robos_ao_vivo) = 0);
select pg_temp.conferir('anon nao ve eventos',   (select count(*) from public.eventos_robos_ao_vivo) = 0);
select pg_temp.conferir('anon nao ve auditoria', (select count(*) from public.auditoria_monitoramento_admin) = 0);
select pg_temp.deve_falhar('anon nao audita', $q$select public.teeds_auditar_monitoramento('teeds','painel','abriu')$q$);
reset role;

-- ============================================================ 2. cliente comum
select pg_temp.como('authenticated', '33333333-3333-4333-8333-333333333333');
select pg_temp.conferir('cliente nao ve fotos (nem a propria)', (select count(*) from public.sessoes_robos_ao_vivo) = 0);
select pg_temp.conferir('cliente nao ve pulsos',   (select count(*) from public.pulsos_robos_ao_vivo) = 0);
select pg_temp.conferir('cliente nao ve eventos',  (select count(*) from public.eventos_robos_ao_vivo) = 0);
select pg_temp.conferir('cliente nao ve auditoria',(select count(*) from public.auditoria_monitoramento_admin) = 0);
select pg_temp.deve_falhar('cliente nao insere evento',  $q$insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','teeds',99,'compra','{}',1)$q$);
select pg_temp.deve_falhar('cliente nao atualiza foto',  $q$update public.sessoes_robos_ao_vivo set seq = 99$q$);
select pg_temp.deve_falhar('cliente nao apaga evento',   $q$delete from public.eventos_robos_ao_vivo$q$);
select pg_temp.deve_falhar('cliente nao audita',         $q$select public.teeds_auditar_monitoramento('teeds','ao-vivo','abriu')$q$);
select pg_temp.deve_falhar('cliente nao limpa',          $q$select public.teeds_limpar_espelho()$q$);
-- update/delete sem política não lançam erro: afetam 0 linhas. Conferimos pelo efeito.
update public.sessoes_robos_ao_vivo set seq = 77 where sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.eventos_robos_ao_vivo where sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
reset role;
select pg_temp.conferir('update do cliente nao teve efeito', (select seq from public.sessoes_robos_ao_vivo where sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
select pg_temp.conferir('delete do cliente nao teve efeito', (select count(*) from public.eventos_robos_ao_vivo where sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
-- a tentativa negada pode ser registrada pelo próprio cliente, sem detalhes
select pg_temp.como('authenticated', '33333333-3333-4333-8333-333333333333');
select public.teeds_auditar_negado('teeds');
reset role;
select pg_temp.conferir('tentativa negada registrada uma vez', (select count(*) from public.auditoria_monitoramento_admin where admin_id = '33333333-3333-4333-8333-333333333333' and acao = 'negado') = 1);

-- ============================================================ 3. admin Teeds
select pg_temp.como('authenticated', '11111111-1111-4111-8111-111111111111');
select pg_temp.conferir('admin teeds ve a sessao teeds',            (select count(*) from public.sessoes_robos_ao_vivo where marca = 'teeds') = 1);
select pg_temp.conferir('admin teeds NAO ve omni (filtro forjado)', (select count(*) from public.sessoes_robos_ao_vivo where marca = 'omni') = 0);
select pg_temp.conferir('admin teeds NAO ve omni (sem filtro)',     (select count(*) filter (where marca = 'omni') from public.sessoes_robos_ao_vivo) = 0);
select pg_temp.conferir('admin teeds ve eventos so da teeds',       (select count(*) from public.eventos_robos_ao_vivo) = 1 and (select bool_and(marca = 'teeds') from public.eventos_robos_ao_vivo));
select pg_temp.conferir('admin teeds audita a teeds',               (select public.teeds_auditar_monitoramento('teeds','ao-vivo','abriu','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333')) > 0);
select pg_temp.deve_falhar('admin teeds nao audita como omni',           $q$select public.teeds_auditar_monitoramento('omni','ao-vivo','abriu')$q$);
select pg_temp.deve_falhar('auditoria cruzada: sessao omni na teeds',    $q$select public.teeds_auditar_monitoramento('teeds','ao-vivo','abriu','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$);
select pg_temp.deve_falhar('auditoria cruzada: cliente omni na teeds',   $q$select public.teeds_auditar_monitoramento('teeds','ao-vivo','abriu',null,'44444444-4444-4444-8444-444444444444')$q$);
select pg_temp.deve_falhar('auditoria: sessao e cliente que nao combinam', $q$select public.teeds_auditar_monitoramento('teeds','ao-vivo','abriu','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111')$q$);
select pg_temp.deve_falhar('admin nao insere evento',  $q$insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','teeds',98,'compra','{}',1)$q$);
select pg_temp.deve_falhar('admin nao limpa',          $q$select public.teeds_limpar_espelho()$q$);
update public.sessoes_robos_ao_vivo set seq = 66 where marca = 'teeds';
reset role;
select pg_temp.conferir('update do admin nao teve efeito', (select seq from public.sessoes_robos_ao_vivo where marca = 'teeds') = 1);
select pg_temp.conferir('auditoria do admin gravada com marca e admin certos', (select count(*) from public.auditoria_monitoramento_admin where admin_id = '11111111-1111-4111-8111-111111111111' and marca = 'teeds' and sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);

-- ============================================================ 4. admin OMNI
select pg_temp.como('authenticated', '22222222-2222-4222-8222-222222222222');
select pg_temp.conferir('admin omni ve a sessao omni', (select count(*) from public.sessoes_robos_ao_vivo where marca = 'omni') = 1);
select pg_temp.conferir('admin omni NAO ve teeds',    (select count(*) filter (where marca = 'teeds') from public.sessoes_robos_ao_vivo) = 0);
select pg_temp.conferir('admin omni ve so auditoria da omni', (select count(*) filter (where marca <> 'omni') from public.auditoria_monitoramento_admin) = 0);
reset role;

-- ============================================================ 5. service role escreve; integridade relacional
select pg_temp.como('service_role', null);
insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','teeds',2,'compra','{}',2);
select pg_temp.conferir('service role grava evento', (select count(*) from public.eventos_robos_ao_vivo where sessao_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2);
select pg_temp.deve_falhar('evento repetido (mesma seq) e recusado',        $q$insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','teeds',2,'compra','{}',2)$q$);
select pg_temp.deve_falhar('evento teeds apontando para sessao omni',      $q$insert into public.eventos_robos_ao_vivo (sessao_id, marca, seq, tipo, delta, emitido_em) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','teeds',9,'compra','{}',2)$q$);
select pg_temp.deve_falhar('foto de outro usuario na sessao',              $q$insert into public.sessoes_robos_ao_vivo (sessao_id, marca, user_id, seq, estado, config, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','teeds','44444444-4444-4444-8444-444444444444',5,'{}','{}',1) on conflict (sessao_id) do update set user_id = excluded.user_id$q$);
select pg_temp.deve_falhar('pulso com marca errada',                       $q$insert into public.pulsos_robos_ao_vivo (sessao_id, marca, seq, pulso, emitido_em) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','omni',1,'{}',1)$q$);
select pg_temp.conferir('service role limpa (0 linhas velhas)', (select (public.teeds_limpar_espelho())::text) like '{%');
reset role;

-- ============================================================ 6. inventário das políticas (nenhuma permissiva genérica)
select pg_temp.conferir('nenhuma politica usa "true" como condicao',
  (select count(*) from pg_policies where tablename in ('sessoes_robos_ao_vivo','pulsos_robos_ao_vivo','eventos_robos_ao_vivo','auditoria_monitoramento_admin') and (qual = 'true' or with_check = 'true')) = 0);
select pg_temp.conferir('so ha politicas de SELECT nas tabelas do espelho',
  (select count(*) from pg_policies where tablename in ('sessoes_robos_ao_vivo','pulsos_robos_ao_vivo','eventos_robos_ao_vivo','auditoria_monitoramento_admin') and cmd <> 'SELECT') = 0);
select pg_temp.conferir('funcoes definer fixam search_path',
  (select bool_and(coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('teeds_auditar_monitoramento','teeds_auditar_negado','teeds_limpar_espelho') and p.prosecdef));
select pg_temp.conferir('anon nao executa nenhuma das funcoes',
  not has_function_privilege('anon', 'public.teeds_auditar_monitoramento(text,text,text,uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.teeds_auditar_negado(text)', 'execute')
  and not has_function_privilege('anon', 'public.teeds_limpar_espelho(integer,integer,integer)', 'execute'));
select pg_temp.conferir('authenticated nao executa a limpeza',
  not has_function_privilege('authenticated', 'public.teeds_limpar_espelho(integer,integer,integer)', 'execute'));

raise notice 'TODAS AS PROVAS PASSARAM';
rollback;
