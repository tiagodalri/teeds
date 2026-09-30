import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {eventoSeguro,receberEventoResend} from './eventos-resend'
import {sinaisDoEmail} from './admin-emails'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const dados={type:'email.opened',created_at:'2026-09-30T12:00:00Z',data:{email_id:id,from:'Teeds <nao-responda@teedscompany.com>',to:['segredo@example.com'],html:'senha secreta',click:{link:'https://exemplo.com/?token=segredo'}}}
const evento=eventoSeguro(dados,'msg_1')!
assert.equal(evento.marca,'teeds');assert.equal(evento.tipo,'opened')
assert.ok(!JSON.stringify(evento).includes('segredo'))
assert.equal(eventoSeguro({...dados,data:{...dados.data,from:'outra@example.com'}},'msg_1'),null)
assert.equal(eventoSeguro({...dados,type:'email.received'},'msg_1'),null)
assert.throws(()=>eventoSeguro({...dados,created_at:'invalido'},'msg_1'))
assert.throws(()=>eventoSeguro({...dados,data:{...dados.data,email_id:'invalid'}},'msg_1'))
const secret=Buffer.from('segredo-isolado-somente-teste').toString('base64')
process.env.RESEND_EVENTOS_SEGREDO='whsec_'+secret
process.env.SUPABASE_URL='https://banco.invalid';process.env.SUPABASE_SECRET='teste'
const cru=JSON.stringify(dados),ts=String(Math.floor(Date.now()/1000))
const headers={'svix-id':'msg_1','svix-timestamp':ts,'svix-signature':'v1,'+createHmac('sha256',Buffer.from(secret,'base64')).update('msg_1.'+ts+'.'+cru).digest('base64')}
let chamadas=0
globalThis.fetch=async(u,init)=>{chamadas++;assert.ok(String(u).includes('on_conflict=evento_id'));assert.deepEqual(JSON.parse(String(init?.body)),evento);assert.equal((init?.headers as any).Prefer,'resolution=ignore-duplicates,return=minimal');return new Response(null,{status:201})}
assert.equal((await receberEventoResend(cru,{})).status,401)
assert.equal((await receberEventoResend(cru+' ',headers)).status,401)
assert.equal(chamadas,0)
assert.equal((await receberEventoResend(cru,headers)).status,200)
assert.equal(chamadas,1)
globalThis.fetch=async()=>new Response(null,{status:500})
assert.equal((await receberEventoResend(cru,headers)).status,503)
const base={id,destinatarios:[],assunto:'Teste',data:'',status:'delivered'}
assert.equal(sinaisDoEmail(base).aberto,false)
assert.equal(sinaisDoEmail({...base,status:'opened'}).abertoEm,null)
assert.equal(sinaisDoEmail({...base,status:'clicked'}).aberto,false)
assert.equal(sinaisDoEmail(base,{aberto_em:dados.created_at,aberturas:2}).aberto,true)
console.log('OK: assinatura, corpo adulterado, dados mínimos, falha recuperável e ausência de leitura presumida.')
