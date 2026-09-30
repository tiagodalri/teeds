import assert from 'node:assert/strict'
import { listarEmailsAdmin, resumirEmails } from './admin-emails'
const teeds={id:'email-1',from:'Teeds <nao-responda@teedscompany.com>',to:['teste@example.com'],subject:'Teste',created_at:'2026-09-30T12:00:00Z',last_event:'delivered',html:'SEGREDO',text:'SEGREDO'}
const omni={...teeds,id:'email-2',from:'OMNI <nao-responda@omnifinanc.com>'}
assert.equal(resumirEmails([teeds,omni],teeds.from).length,1)
assert.ok(!JSON.stringify(resumirEmails([teeds],teeds.from)).includes('SEGREDO'))
process.env.RESEND_LEITURA_CHAVE='somente-teste'
let chamadas=0
globalThis.fetch=async(input)=>{
 chamadas++
 const u=new URL(String(input))
 assert.equal(u.origin,'https://api.resend.com')
 return new Response(JSON.stringify({data:u.searchParams.has('after')?[teeds]:[omni],has_more:!u.searchParams.has('after')}),{status:200})
}
const primeira=await listarEmailsAdmin('teeds')
assert.deepEqual(primeira.emails,[])
assert.ok(primeira.proximo)
await assert.rejects(()=>listarEmailsAdmin('omni',primeira.proximo!),/Paginação inválida/)
await assert.rejects(()=>listarEmailsAdmin('teeds','fraudado'),/Paginação inválida/)
await assert.rejects(()=>listarEmailsAdmin('outra'),/Plataforma inválida/)
const segunda=await listarEmailsAdmin('teeds',primeira.proximo!)
assert.equal(segunda.emails.length,1);assert.equal(segunda.proximo,null)
await listarEmailsAdmin('teeds',primeira.proximo!);assert.equal(chamadas,2)
globalThis.fetch=async()=>new Response('{}',{status:403})
await assert.rejects(()=>listarEmailsAdmin('omni'),/credencial/)
globalThis.fetch=async()=>new Response('{}',{status:429})
await assert.rejects(()=>listarEmailsAdmin('omni'),/Limite/)
console.log('OK: separação de marcas, sem conteúdo sensível, paginação, cache, credenciais e limites.')
