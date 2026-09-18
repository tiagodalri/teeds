import assert from 'node:assert/strict'
import { decidirLead, listarPendentes, enviarAprovacoes, senhaDoPendente } from './aprovacao-leads'

process.env.SUPABASE_URL='https://banco.invalid'
process.env.SUPABASE_SECRET='somente-teste-sem-credencial-real'
process.env.RESEND_CHAVE='somente-teste'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const uid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let passos:Array<{path:string;body?:(b:any)=>void;data?:unknown;status?:number}>=[]
globalThis.fetch=(async (url:any,init:any={})=>{
  const p=passos.shift()
  assert.ok(p,`Chamada inesperada: ${url}`)
  assert.ok(String(url).includes(p.path),`${url} != ${p.path}`)
  p.body?.(init.body?JSON.parse(init.body):undefined)
  return new Response(JSON.stringify(p.data===undefined?{}:p.data),{status:p.status??200,headers:{'Content-Type':'application/json'}})
}) as typeof fetch
const ficha={id,marca:'teeds',nome:'Teste',email:'teste@example.invalid',telefone:'11999999999',status:'processando'}
let total=0
async function teste(nome:string,fn:()=>Promise<void>){await fn();assert.equal(passos.length,0);total++;console.log(`✓ ${nome}`)}

await teste('senha recuperável, forte e diferente por ficha',async()=>{
  const a=senhaDoPendente(id,'chave')
  assert.equal(a,senhaDoPendente(id,'chave'));assert.equal(a.length,28)
  assert.notEqual(a,senhaDoPendente(uid,'chave'));assert.throws(()=>senhaDoPendente(id,''))
})
await teste('aprovação cria usuário só após a trava e finaliza sem expor senha',async()=>{
  passos=[
    {path:'teeds_decidir_lead',body:b=>{assert.equal(b.p_marca,'teeds');assert.equal(b.p_admin,uid);assert.equal(b.p_plano,'pro')},data:ficha},
    {path:'teeds_auth_do_pendente',data:null},
    {path:'/auth/v1/admin/users',body:b=>{assert.equal(b.email_confirm,true);assert.equal(b.user_metadata.trocar_senha,true);assert.equal(b.app_metadata.aprovacao_lead,id)},data:{id:uid}},
    {path:'teeds_finalizar_lead',body:b=>assert.equal(b.p_user,uid)},
  ]
  assert.deepEqual(await decidirLead(id,'teeds',uid,'aprovar','pro'),{status:'aprovado'})
})
await teste('conta existente não recebe alteração de senha',async()=>{
  passos=[{path:'teeds_decidir_lead',data:ficha},{path:'teeds_auth_do_pendente',data:{id:uid}},{path:'teeds_finalizar_lead'}]
  await decidirLead(id,'omni',uid,'aprovar')
})
await teste('aprovação repetida não cria usuário nem reenvia e-mail',async()=>{
  passos=[{path:'teeds_decidir_lead',data:{status:'aprovado'}}]
  await decidirLead(id,'teeds',uid,'aprovar')
})
await teste('recusa não toca em Auth nem envia e-mail',async()=>{
  passos=[{path:'teeds_decidir_lead',data:{status:'recusado'}}]
  assert.deepEqual(await decidirLead(id,'teeds',uid,'recusar'),{status:'recusado'})
})
await teste('timeout de criação consulta a conta antes de repetir',async()=>{
  passos=[{path:'teeds_decidir_lead',data:ficha},{path:'teeds_auth_do_pendente',data:null},{path:'/auth/v1/admin/users',status:500},{path:'teeds_auth_do_pendente',data:{id:uid}},{path:'teeds_finalizar_lead'}]
  await decidirLead(id,'teeds',uid,'aprovar')
})
await teste('entrada inválida não consulta banco',async()=>{
  await assert.rejects(decidirLead('errado','teeds',uid,'aprovar'))
  await assert.rejects(decidirLead(id,'teeds',uid,'apagar'))
  await assert.rejects(decidirLead(id,'teeds',uid,'aprovar','vitalicio'))
  await assert.rejects(listarPendentes('teeds','todos',0))
})
await teste('consulta paginada é filtrada por marca',async()=>{
  passos=[{path:'marca=eq.omni&status=eq.pendente',body:()=>{},data:[]}]
  assert.deepEqual(await listarPendentes('omni','pendente',1),[])
})
await teste('e-mail aprovado usa senha provisória e marca correta',async()=>{
  passos=[{path:'status=eq.aprovado',data:[{id,marca:'omni',email:'teste@example.invalid',user_id:uid}]},
    {path:`/auth/v1/admin/users/${uid}`,data:{app_metadata:{aprovacao_lead:id},user_metadata:{trocar_senha:true}}},
    {path:'api.resend.com/emails',body:b=>{assert.match(b.subject,/OMNI/i);assert.ok(b.text.includes(senhaDoPendente(id,process.env.SUPABASE_SECRET!)));assert.ok(!b.html.includes('teedscompany.com'))}},
    {path:`clientes_pendentes?id=eq.${id}`,body:b=>assert.ok(b.email_enviado_em)}]
  await enviarAprovacoes()
})
await teste('senha já trocada não é incluída no e-mail',async()=>{
  passos=[{path:'status=eq.aprovado',data:[{id,marca:'teeds',email:'teste@example.invalid',user_id:uid}]},
    {path:'/auth/v1/admin/users/',data:{app_metadata:{aprovacao_lead:id},user_metadata:{trocar_senha:false}}},
    {path:'api.resend.com/emails',body:b=>{assert.ok(b.text.includes('senha atual'));assert.ok(!b.text.includes(senhaDoPendente(id,process.env.SUPABASE_SECRET!)))}},
    {path:'clientes_pendentes?id='}]
  await enviarAprovacoes()
})
await teste('falha de envio permanece na fila',async()=>{
  passos=[{path:'status=eq.aprovado',data:[{id,marca:'teeds',email:'teste@example.invalid',user_id:uid}]},{path:'/auth/v1/admin/users/',data:{}},{path:'api.resend.com/emails',status:500}]
  await enviarAprovacoes()
})
console.log(`${total} testes de aprovação concluídos.`)
