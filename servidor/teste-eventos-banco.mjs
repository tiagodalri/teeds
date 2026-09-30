import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {PGlite}=await import(process.env.PGLITE_MODULE)
const db=new PGlite()
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
await db.exec(readFileSync(new URL('./sql/eventos-resend.sql',import.meta.url),'utf8'))
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
await db.exec(`insert into email_eventos_resend(evento_id,email_id,marca,tipo,ocorrido_em) values
('msg_1','${id}','teeds','opened','2026-09-30T10:00:00Z'),
('msg_2','${id}','teeds','opened','2026-09-30T11:00:00Z'),
('msg_3','${id}','omni','clicked','2026-09-30T12:00:00Z');
insert into email_eventos_resend(evento_id,email_id,marca,tipo,ocorrido_em) values
('msg_1','${id}','teeds','opened','2026-09-30T10:00:00Z') on conflict(evento_id) do nothing;`)
const {rows}=await db.query("select * from email_eventos_resumo where marca='teeds'")
assert.equal(Number(rows[0].aberturas),2);assert.equal(Number(rows[0].cliques),0)
assert.equal(rows[0].aberto_em.toISOString(),'2026-09-30T10:00:00.000Z')
assert.equal(rows[0].ultima_abertura_em.toISOString(),'2026-09-30T11:00:00.000Z')
for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role)
  await assert.rejects(db.query('select * from email_eventos_resumo'),/permission denied/)
  await assert.rejects(db.query('select * from email_eventos_resend'),/permission denied/)
  await db.exec('reset role')
}
await db.close()
console.log('OK: deduplicação, horários, separação de marcas e bloqueio de acesso público/cliente.')
