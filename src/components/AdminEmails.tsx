import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SERVIDOR } from '../core/teeds/config'
import './admin-emails.css'

interface Sinais { entregue:boolean;entregueEm:string|null;aberto:boolean;abertoEm:string|null;ultimaAberturaEm:string|null;aberturas:number;clicado:boolean;clicadoEm:string|null;ultimoCliqueEm:string|null;cliques:number }
interface Email { id:string;destinatarios:string[];assunto:string;data:string;status:string;sinais?:Sinais }
interface Rastreio { aberturas:boolean|null;cliques:boolean|null;eventos:boolean;desde:string|null }
const statusNome:Record<string,string>={sent:'Enviado',delivered:'Entregue',opened:'Abertura registrada',clicked:'Clique registrado',bounced:'Devolvido',failed:'Falhou',complained:'Marcado como spam',delivery_delayed:'Entrega atrasada',scheduled:'Agendado',canceled:'Cancelado',suppressed:'Suprimido',queued:'Na fila',unknown:'Sem informação'}
const quando=(d:string|null)=>d&&!Number.isNaN(Date.parse(d))?new Date(d).toLocaleString('pt-BR'):'Horário não disponível'
function sinais(e:Email):Sinais {return e.sinais||{entregue:e.status==='delivered',entregueEm:null,aberto:e.status==='opened',abertoEm:null,ultimaAberturaEm:null,aberturas:0,clicado:e.status==='clicked',clicadoEm:null,ultimoCliqueEm:null,cliques:0}}

export function AdminEmails({sessao,marca}:{sessao:SessaoTeeds;marca:string}) {
  const [emails,setEmails]=useState<Email[]>([]),[cursor,setCursor]=useState<string|null>(null)
  const [erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false)
  const [busca,setBusca]=useState(''),[status,setStatus]=useState('todos'),[automatico,setAutomatico]=useState(true)
  const [atualizado,setAtualizado]=useState(''),[rastreio,setRastreio]=useState<Rastreio|null>(null)
  const pedido=useRef<AbortController|null>(null),emCurso=useRef(false)
  async function carregar(mais=false,silencioso=false) {
    if(silencioso&&emCurso.current)return
    pedido.current?.abort()
    const c=new AbortController();pedido.current=c;emCurso.current=true
    setOcupado(true);setErro('')
    try {
      const p=new URLSearchParams({marca});if(mais&&cursor)p.set('cursor',cursor)
      const r=await fetch(SERVIDOR.url+'/api/admin/emails?'+p,{headers:{Authorization:'Bearer '+sessao.token},signal:c.signal})
      const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível consultar os e-mails.')
      if(c.signal.aborted)return
      setEmails(anterior=>[...new Map([...(mais?anterior:[]),...d.emails].map((e:Email)=>[e.id,e])).values()] as Email[])
      setCursor(d.proximo);setAtualizado(new Date().toLocaleTimeString('pt-BR'));setAviso(d.aviso||'');setRastreio(d.rastreio||null)
    }catch(e){if(!c.signal.aborted)setErro(e instanceof Error?e.message:'Não foi possível consultar os e-mails.')}
    finally{if(!c.signal.aborted){setOcupado(false);emCurso.current=false}}
  }
  useEffect(()=>{setEmails([]);setCursor(null);setAtualizado('');setRastreio(null);setAviso('');setBusca('');setStatus('todos');void carregar();return()=>pedido.current?.abort()},[marca,sessao.token])
  useEffect(()=>{
    if(!automatico)return
    const t=window.setInterval(()=>{if(document.visibilityState==='visible')void carregar(false,true)},30000)
    return()=>window.clearInterval(t)
  },[automatico,marca,sessao.token])
  const visiveis=emails.filter(e=>{
    const s=sinais(e)
    const atende=status==='todos'||(status==='opened'?s.aberto:status==='clicked'?s.clicado:status==='delivered'?s.entregue:status==='sem-abertura'?!s.aberto:e.status===status)
    return atende&&(e.destinatarios.join(' ')+' '+e.assunto).toLowerCase().includes(busca.toLowerCase())
  })
  const contagem=(campo:'entregue'|'aberto'|'clicado')=>emails.filter(e=>sinais(e)[campo]).length
  const config=(v:boolean|null|undefined)=>v===true?'Ativo':v===false?'Desativado':'Não confirmado'
  return <section className="admin-card admin-emails">
    <header><div><h3>Acompanhamento de e-mails</h3><p>Entrega, aberturas e cliques da plataforma selecionada.</p></div><button disabled={ocupado} onClick={()=>void carregar()}>↻ Atualizar e-mails</button></header>
    <div className="email-resumo" aria-label="Resumo dos registros carregados">
      {[['E-mails carregados',emails.length],['Entrega confirmada',contagem('entregue')],['Com abertura registrada',contagem('aberto')],['Com clique registrado',contagem('clicado')]].map(([nome,n])=><div key={nome}><span>{nome}</span><b>{n}</b></div>)}
    </div>
    <div className="email-rastreio">
      <span>Aberturas: <b>{config(rastreio?.aberturas)}</b></span>
      <span>Cliques: <b>{config(rastreio?.cliques)}</b></span>
      <span>Recepção de eventos: <b>{rastreio?.eventos?'Configurada':'Não confirmada'}</b></span>
      <label><input type="checkbox" checked={automatico} onChange={e=>setAutomatico(e.target.checked)}/>Atualizar a cada 30 segundos</label>
    </div>
    <div className="email-filtros">
      <label>Buscar nos registros carregados<input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Destinatário ou assunto"/></label>
      <label>Filtrar por evento<select value={status} onChange={e=>setStatus(e.target.value)}><option value="todos">Todos</option><option value="sem-abertura">Sem abertura registrada</option>{Object.entries(statusNome).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
    </div>
    <p className="email-nota">{visiveis.length} encontrados nos {emails.length} registros carregados{atualizado&&' · Consultado às '+atualizado}. Ao atualizar, a lista volta aos envios mais recentes.</p>
    <p className="email-nota">Abertura não comprova leitura: aplicativos podem carregar o e-mail automaticamente ou bloquear o rastreamento. Cliques também podem vir de verificadores automáticos. “Sem registro” não significa “não leu”.</p>
    <p className="email-nota">Horários e contagens de eventos{rastreio?.desde?' a partir de '+quando(rastreio.desde):' a partir da ativação da integração'}. Não há recuperação retroativa de aberturas não rastreadas. A lista de envios depende da retenção do Resend.</p>
    {aviso&&<p role="status" className="email-aviso">{aviso}</p>}
    {erro&&<p role="alert" className="email-erro">{erro} Os dados exibidos podem estar desatualizados.</p>}
    <div className="email-lista" aria-busy={ocupado}>
      {visiveis.map(e=>{const s=sinais(e);return <article key={e.id}>
        <div className="email-identidade"><b>{e.assunto}</b><span>{e.destinatarios.join(', ')}</span><small>Envio: {quando(e.data)}</small>
          <span className={'email-status '+(['failed','bounced','complained','suppressed'].includes(e.status)?'falha':e.status==='delivered'?'entregue':'')}>{statusNome[e.status]||e.status}</span>
        </div>
        <div className="email-sinais">
          <div className={s.entregue?'registrado':''}><b>Entrega</b><span>{s.entregue?'Confirmada pelo servidor':'Sem confirmação registrada'}</span>{s.entregue&&<small>{quando(s.entregueEm)}</small>}</div>
          <div className={s.aberto?'registrado':''}><b>Abertura</b><span>{s.aberto?'Abertura registrada':'Sem registro'}</span>{s.aberto&&<small>Primeira: {quando(s.abertoEm)}</small>}</div>
          <div className={s.clicado?'registrado':''}><b>Clique</b><span>{s.clicado?'Clique registrado':'Sem registro'}</span>{s.clicado&&<small>Primeiro: {quando(s.clicadoEm)}</small>}</div>
          {(s.aberto||s.clicado)&&<details><summary>Ver detalhes dos eventos</summary><p>Aberturas recebidas: {s.aberturas||'Contagem indisponível'} · Última: {quando(s.ultimaAberturaEm)}</p><p>Cliques recebidos: {s.cliques||'Contagem indisponível'} · Último: {quando(s.ultimoCliqueEm)}</p><p>Contagem de eventos, não de pessoas. Reentregas do mesmo evento não são contadas novamente.</p></details>}
        </div>
      </article>})}
      {!ocupado&&!erro&&!visiveis.length&&<p>Nenhum e-mail encontrado nesta consulta.{cursor?' Carregue mais registros para continuar a busca.':''}</p>}
      {ocupado&&<p role="status">Consultando e-mails…</p>}
    </div>
    {cursor&&<button className="email-mais" disabled={ocupado} onClick={()=>{setAutomatico(false);void carregar(true)}}>Carregar mais registros</button>}
    {!automatico&&<p className="email-nota">Atualização automática pausada para permitir a consulta ao histórico.</p>}
  </section>
}
