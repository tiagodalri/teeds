import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SERVIDOR } from '../core/teeds/config'
import './admin-emails.css'

interface Email { id: string; destinatarios: string[]; assunto: string; data: string; status: string }
const statusNome: Record<string,string> = { sent:'Enviado', delivered:'Entregue', opened:'Abertura registrada', clicked:'Clique registrado', bounced:'Devolvido', failed:'Falhou', complained:'Marcado como spam', delivery_delayed:'Entrega atrasada', scheduled:'Agendado', canceled:'Cancelado', suppressed:'Suprimido', queued:'Na fila', unknown:'Sem informação' }
export function AdminEmails({sessao,marca}:{sessao:SessaoTeeds;marca:string}) {
  const [emails,setEmails]=useState<Email[]>([]),[cursor,setCursor]=useState<string|null>(null)
  const [erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[busca,setBusca]=useState(''),[status,setStatus]=useState('todos')
  const [atualizado,setAtualizado]=useState('')
  const pedido=useRef<AbortController|null>(null)
  async function carregar(mais=false) {
    pedido.current?.abort()
    const c=new AbortController();pedido.current=c
    setOcupado(true);setErro('')
    try {
      const p=new URLSearchParams({marca});if(mais&&cursor)p.set('cursor',cursor)
      const r=await fetch(`${SERVIDOR.url}/api/admin/emails?${p}`,{headers:{Authorization:`Bearer ${sessao.token}`},signal:c.signal})
      const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível consultar os e-mails.')
      if(c.signal.aborted)return
      setEmails(anterior=>[...new Map([...(mais?anterior:[]),...d.emails].map((e:Email)=>[e.id,e])).values()] as Email[])
      setCursor(d.proximo);setAtualizado(new Date().toLocaleTimeString('pt-BR'))
    } catch(e) {if(!c.signal.aborted)setErro(e instanceof Error?e.message:'Não foi possível consultar os e-mails.')}
    finally {if(!c.signal.aborted)setOcupado(false)}
  }
  useEffect(()=>{setEmails([]);setCursor(null);setAtualizado('');void carregar();return()=>pedido.current?.abort()},[marca,sessao.token])
  const visiveis=emails.filter(e=>(status==='todos'||e.status===status)&&`${e.destinatarios.join(' ')} ${e.assunto}`.toLowerCase().includes(busca.toLowerCase()))
  return <section className="admin-card admin-emails">
    <header><div><h3>Histórico de e-mails</h3><p>Disparos da plataforma selecionada, consultados diretamente no serviço de envio.</p></div><button disabled={ocupado} onClick={()=>void carregar()}>↻ Atualizar e-mails</button></header>
    <div className="email-filtros"><label>Buscar nos registros carregados<input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Destinatário ou assunto"/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="todos">Todos os status</option>{Object.entries(statusNome).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label></div>
    <p className="email-nota">{emails.length} registros carregados · {visiveis.length} encontrados{atualizado&&` · Consultado às ${atualizado}`}. Histórico limitado ao período retido pelo provedor.</p>
    <p className="email-nota">“Enviado” não confirma entrega. Aberturas e cliques só aparecem quando registrados pelo provedor e não comprovam leitura humana. Envios ainda pendentes de aprovação ficam em Clientes.</p>
    {erro&&<p role="alert" className="email-erro">{erro}</p>}
    <div className="email-lista" aria-busy={ocupado}>
      {visiveis.map(e=><article key={e.id}><div><b>{e.assunto}</b><span>{e.destinatarios.join(', ')}</span><small>{Number.isNaN(Date.parse(e.data))?'Data indisponível':new Date(e.data).toLocaleString('pt-BR')}</small></div><span className={`email-status ${['failed','bounced','complained','suppressed'].includes(e.status)?'falha':e.status==='delivered'?'entregue':''}`}>{statusNome[e.status]||e.status}</span></article>)}
      {!ocupado&&!erro&&!visiveis.length&&<p>Nenhum e-mail encontrado nesta consulta.{cursor?' Carregue mais registros para continuar a busca.':''}</p>}
      {ocupado&&<p role="status">Consultando e-mails…</p>}
    </div>
    {cursor&&<button className="email-mais" disabled={ocupado} onClick={()=>void carregar(true)}>Carregar mais registros</button>}
  </section>
}
