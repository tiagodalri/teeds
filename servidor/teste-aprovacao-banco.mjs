// PGLITE_MODULE aponta para a instalação isolada de @electric-sql/pglite.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb default '{}');
create table public.administradores(user_id uuid,marca text);
create function public.teeds_sou_admin_da(m text) returns boolean language sql as $$ select m=current_setting('test.marca',true) $$;
create table public.clientes(user_id uuid,marca text,nome text,email text,telefone text,plano_id text,status_acesso text,acesso_inicio timestamptz,acesso_expira_em timestamptz,primary key(user_id,marca));
create table public.leads_capturados(id uuid default gen_random_uuid(),marca text,email text,nome text,telefone text);
create table public.auditoria_admin(id uuid default gen_random_uuid(),marca text,acao text,detalhes jsonb);
insert into auth.users(id,email,raw_user_meta_data) values('11111111-1111-4111-8111-111111111111','adm@example.invalid','{}');
insert into administradores values('11111111-1111-4111-8111-111111111111','teeds');
`)
await db.exec(await readFile(new URL('../supabase/migracoes/20260918160000_aprovacao_de_leads.sql',import.meta.url),'utf8'))
const rows=async(s,p=[])=>(await db.query(s,p)).rows
await db.exec(`insert into leads_capturados(marca,email,nome,telefone) values('teeds','lead@example.invalid','Lead','11999999999'),('omni','lead@example.invalid','Outro','11988888888');`)
assert.equal((await rows('select * from clientes_pendentes')).length,2)
assert.equal((await rows('select * from clientes')).length,0)
assert.equal((await rows('select * from auth.users')).length,1)
const [{id}]=await rows("select id from clientes_pendentes where marca='teeds'")
const adm='11111111-1111-4111-8111-111111111111', lock='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333'
await assert.rejects(rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[id,'omni',adm,'aprovar',lock]))
await rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[id,'teeds',adm,'aprovar',lock])
await assert.rejects(rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[id,'teeds',adm,'aprovar',lock]))
await rows('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[user,'lead@example.invalid','{}'])
await rows('select teeds_finalizar_lead($1,$2,$3)',[id,lock,user])
assert.equal((await rows('select * from clientes')).length,1)
assert.equal((await rows('select status from clientes_pendentes where id=$1',[id]))[0].status,'aprovado')
await rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[id,'teeds',adm,'aprovar',lock])
assert.equal((await rows('select * from clientes')).length,1)
await db.exec(`insert into leads_capturados(marca,email,nome,telefone) values('teeds','lead@example.invalid','Mudou','11999999999');`)
assert.equal((await rows('select nome from clientes_pendentes where id=$1',[id]))[0].nome,'Lead')
await db.exec(`insert into auditoria_admin(marca,acao,detalhes) values('teeds','lead_capturado','{"email":"fallback@example.invalid","nome":"Alternativo","telefone":"11999999999"}');`)
assert.equal((await rows('select * from clientes_pendentes')).length,3)
await db.exec(`set role authenticated; set test.marca='omni';`)
assert.equal((await rows('select * from clientes_pendentes')).length,1)
await assert.rejects(db.exec("update clientes_pendentes set status='aprovado'"))
await assert.rejects(rows('select teeds_decidir_lead($1,$2,$3,$4,$5)',[id,'teeds',adm,'aprovar',lock]))
await db.exec('reset role;set role anon;')
await assert.rejects(db.exec('select * from clientes_pendentes'))
await db.exec(`reset role;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
create table public.planos(id text primary key,nome text,duracao_dias integer,ativo boolean,recursos jsonb,marcas text[]);
create table public.cliente_produtos(user_id uuid,marca text,produto_id text,ativo boolean,expira_em timestamptz);
insert into planos values('vitalicio','Vitalício',null,true,'{}','{teeds}');
update clientes set plano_id='vitalicio',acesso_expira_em=null;
insert into cliente_produtos values('${user}','teeds','simulador-treino',true,null);
insert into clientes(user_id,marca,email,plano_id,status_acesso) values('${user}','omni','lead@example.invalid','vitalicio','ativo');
`)
await db.exec(await readFile(new URL('../supabase/migracoes/20260918170000_dois_planos_clientes.sql',import.meta.url),'utf8'))
assert.equal((await rows('select * from planos where ativo')).length,2)
assert.equal((await rows("select plano_id from clientes where marca='teeds'"))[0].plano_id,'pro')
assert.equal((await rows("select acesso_expira_em from clientes where marca='teeds'"))[0].acesso_expira_em,null)
assert.equal((await rows("select plano_id from clientes where marca='omni'"))[0].plano_id,'essencial')
assert.equal((await rows('select teeds_simulador_permitido($1,$2) as ok',[user,'teeds']))[0].ok,true)
assert.equal((await rows('select teeds_simulador_permitido($1,$2) as ok',[user,'omni']))[0].ok,false)
assert.equal((await rows('select teeds_simulador_permitido($1,$2) as ok',[adm,'teeds']))[0].ok,true)
assert.equal((await rows('select teeds_simulador_permitido($1,$2) as ok',[adm,'omni']))[0].ok,false)
await db.exec("update clientes set status_acesso='suspenso' where marca='teeds'")
assert.equal((await rows('select teeds_simulador_permitido($1,$2) as ok',[user,'teeds']))[0].ok,false)
await db.exec("set test.role='authenticated';set test.marca='nenhuma';")
await assert.rejects(db.exec("update clientes set plano_id='pro' where marca='omni'"))
await assert.rejects(db.exec("update clientes set status_acesso='ativo' where marca='teeds'"))
await db.exec("set test.marca='teeds';update clientes set status_acesso='ativo' where marca='teeds';")
console.log('Planos: dois ativos, migração preserva direitos e validade, ADM separado, marcas isoladas e autopromoção bloqueada.')
await db.close()
console.log('Banco: captura sem login, isolamento por marca, aprovação única, preservação de conta, fallback e permissões validados.')
