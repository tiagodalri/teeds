import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb default '{}');
create table public.administradores(user_id uuid,marca text);
create function public.teeds_sou_admin_da(m text) returns boolean language sql as $$ select m=current_setting('test.marca',true) $$;
create table public.clientes(user_id uuid,marca text,nome text,email text,telefone text,plano_id text,status_acesso text,acesso_inicio timestamptz,acesso_expira_em timestamptz,primary key(user_id,marca));
create table public.leads_capturados(id uuid default gen_random_uuid(),marca text,email text,nome text,telefone text);
create table public.auditoria_admin(id uuid default gen_random_uuid(),marca text,acao text,detalhes jsonb);
`)
// Original schema retained in Git history; export later removed this local file.
await db.exec(execFileSync('git',['show','36cddfe:supabase/migracoes/20260918160000_aprovacao_de_leads.sql'],{cwd:new URL('..',import.meta.url),encoding:'utf8'}))
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows
const admin='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',lock='33333333-3333-4333-8333-333333333333'
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('${admin}','admin@example.invalid','{}'),('${user}','antigo@example.invalid','{"senha":"preservada"}');
insert into administradores values('${admin}','teeds');
insert into clientes values('${user}','teeds','Nome antigo','antigo@example.invalid','telefone antigo','pro','ativo',now(),null);
insert into leads_capturados(marca,email,nome,telefone) values('teeds','antigo@example.invalid','Antigo','11999999999');`)
assert.equal((await rows('select * from clientes_pendentes')).length,0)
const original=await rows('select * from clientes')
await db.exec(await readFile(new URL('./sql/recadastro-aprovacao.sql',import.meta.url),'utf8'))
assert.equal((await rows('select * from clientes_pendentes')).length,0,'does not enroll historical base automatically')
await db.exec("update leads_capturados set nome='Recadastro',inscricao_recebida_em=clock_timestamp()")
let [pedido]=await rows('select * from clientes_pendentes')
assert.equal(pedido.recadastro,true);assert.equal(pedido.status,'pendente')
assert.deepEqual(await rows('select * from clientes'),original)
assert.equal((await rows('select * from auth.users')).length,2)
await db.exec("update leads_capturados set nome='Mais recente',inscricao_recebida_em=clock_timestamp()")
assert.equal((await rows('select * from clientes_pendentes')).length,1)
assert.equal((await rows('select nome from clientes_pendentes'))[0].nome,'Mais recente')
await rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[pedido.id,'teeds',admin,'aprovar',lock])
await db.exec("update leads_capturados set nome='Durante aprovação',inscricao_recebida_em=clock_timestamp()")
assert.equal((await rows('select nome from clientes_pendentes'))[0].nome,'Mais recente','processing snapshot remains stable')
await rows('select teeds_finalizar_lead($1,$2,$3)',[pedido.id,lock,user])
assert.deepEqual(await rows('select * from clientes'),original,'approval preserves plan, validity, status and profile')
assert.equal((await rows('select * from auth.users')).length,2,'no duplicate auth')
await db.exec("update leads_capturados set nome='Edição administrativa'")
assert.equal((await rows('select * from clientes_pendentes')).length,1,'admin edit is not signup')
await db.exec("update leads_capturados set inscricao_recebida_em=clock_timestamp()")
let all=await rows('select * from clientes_pendentes')
assert.equal(all.length,2);assert.equal(all.filter(p=>p.status==='aprovado').length,1)
const novo=all.find(p=>p.status==='pendente');assert.notEqual(novo.id,pedido.id)
await rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[novo.id,'teeds',admin,'recusar',lock])
await db.exec("insert into auditoria_admin(marca,acao,detalhes) values('teeds','lead_capturado','{\"email\":\" ANTIGO@example.invalid \",\"nome\":\"Fallback\",\"telefone\":\"11988888888\"}')")
all=await rows('select * from clientes_pendentes')
assert.equal(all.length,3);assert.equal(all.filter(p=>p.status==='pendente').length,1)
await db.exec("insert into leads_capturados(marca,email,nome,telefone) values('omni','antigo@example.invalid','Outra marca','11999999999'),('teeds','novo@example.invalid','Novo','11999999999')")
assert.equal((await rows("select recadastro from clientes_pendentes where marca='omni'"))[0].recadastro,false,'no cross-brand history disclosure')
assert.equal((await rows("select recadastro from clientes_pendentes where email='novo@example.invalid'"))[0].recadastro,false)
await db.exec("set role authenticated;set test.marca='omni'")
assert.equal((await rows('select * from clientes_pendentes')).length,1)
await assert.rejects(db.exec("update clientes_pendentes set status='aprovado'"))
await db.exec('reset role;set role anon')
await assert.rejects(db.exec('select * from clientes_pendentes'))
await db.close()
console.log('Recadastro: base antiga, aprovação, histórico, reenvio, recusa, fallback, normalização, marcas e permissões validados.')
