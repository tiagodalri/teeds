// Executar somente no servidor: node --env-file=.env configurar-eventos-resend.mjs
// Depois de reiniciar o serviço: repetir com --ativar para ligar o rastreamento.
// Não imprime segredos nem lê conteúdo de e-mails.
import {readFileSync,writeFileSync,renameSync} from 'node:fs'
const chave=process.env.RESEND_LEITURA_CHAVE||process.env.RESEND_CHAVE
if(!chave)throw new Error('Credencial Resend ausente')
async function api(path,method='GET',body){
  const r=await fetch('https://api.resend.com'+path,{method,headers:{Authorization:'Bearer '+chave,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const d=await r.json();if(!r.ok)throw new Error('Resend '+r.status+' em '+path)
  await new Promise(resolve=>setTimeout(resolve,600))
  return d
}
const endpoint='https://motor.teedscompany.com/gancho/resend-eventos'
const eventos=['email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.failed','email.delivery_delayed','email.suppressed','email.scheduled']
const domains=await api('/domains')
const marcas={teeds:'teedscompany.com',omni:'omnifinanc.com'}
const config={}
for(const [marca,nome] of Object.entries(marcas)){
 const domain=domains.data.find(d=>d.name===nome&&d.status==='verified')
 if(!domain)throw new Error('Domínio verificado não encontrado: '+nome)
 config['RESEND_DOMINIO_'+marca.toUpperCase()]=domain.id
}
if(process.argv.includes('--ativar')){
 for(const [marca,nome] of Object.entries(marcas)){
  const id=config['RESEND_DOMINIO_'+marca.toUpperCase()]
  await api('/domains/'+id,'PATCH',{open_tracking:true,click_tracking:true})
  const d=await api('/domains/'+id)
  if(!d.open_tracking||!d.click_tracking)throw new Error('Ativação não confirmada: '+nome)
  console.log(nome+': aberturas e cliques ativados')
 }
}else{
 const lista=await api('/webhooks')
 let hook=lista.data.find(h=>h.endpoint===endpoint)
 if(hook)hook=await api('/webhooks/'+hook.id)
 else hook=await api('/webhooks','POST',{endpoint,events:eventos})
 if(!hook.signing_secret)throw new Error('Segredo do webhook não retornado')
 config.RESEND_EVENTOS_SEGREDO=hook.signing_secret
 config.RESEND_EVENTOS_DESDE=process.env.RESEND_EVENTOS_DESDE||new Date().toISOString()
 let env=readFileSync('.env','utf8')
 for(const [nome,valor] of Object.entries(config)){
  if(!/^[\w:+.\/=-]+$/.test(valor))throw new Error('Configuração inválida')
  const re=new RegExp('^'+nome+'=.*$','m')
  env=re.test(env)?env.replace(re,nome+'='+valor):env.trimEnd()+'\n'+nome+'='+valor+'\n'
 }
 writeFileSync('.env.resend.tmp',env,{mode:0o600});renameSync('.env.resend.tmp','.env')
 console.log('Webhook configurado. Segredo salvo somente no servidor. Reinicie o serviço antes de --ativar.')
}
