import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SERVIDOR } from '../core/teeds/config'
import './admin-pendentes.css'
import { PLANOS_CLIENTE } from '../core/teeds/planos'

interface Pendente {
  id: string; nome: string; email: string; telefone: string
  status: string; criado_em: string; email_enviado_em: string | null
}
export function AdminPendentes({ sessao, versao, onAprovado }: {sessao:SessaoTeeds; versao:number; onAprovado:()=>void}) {
  const [status,setStatus]=useState('pendente')
  const [plano,setPlano]=useState('essencial')
  const [pagina,setPagina]=useState(0)
  const [lista,setLista]=useState<Pendente[]>([])
  const [erro,setErro]=useState('')
  const [aviso,setAviso]=useState('')
  const [ocupado,setOcupado]=useState<string|null>(null)
  const [carregando,setCarregando]=useState(true)
  const [revisao,setRevisao]=useState(0)
  const [confirmar,setConfirmar]=useState<{p:Pendente;acao:'aprovar'|'recusar'}|null>(null)
  async function consultar(path: string, body?: unknown, signal?: AbortSignal) {
    const r=await fetch(`${SERVIDOR.url}/api/clientes-pendentes${path}`,{
      method:body?'POST':'GET',signal,
      headers:{Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),
    })
    const d=await r.json()
    if(!r.ok)throw new Error(d.erro||'Não foi possível consultar as aprovações.')
    return d
  }
  useEffect(()=>{
    const c=new AbortController()
    setCarregando(true);setErro('');setLista([])
    consultar(`?status=${status}&pagina=${pagina}`,undefined,c.signal)
      .then(setLista).catch(e=>{if(!c.signal.aborted)setErro(e.message)})
      .finally(()=>{if(!c.signal.aborted)setCarregando(false)})
    return()=>c.abort()
  },[sessao.token,status,pagina,versao,revisao])
  async function decidir() {
    if(!confirmar||ocupado)return
    const {p,acao}=confirmar
    setOcupado(p.id);setErro('');setAviso('')
    try {
      const r=await consultar('',{id:p.id,acao,plano})
      setAviso(r.status==='aprovado'?'Cadastro aprovado. O e-mail de acesso entrou na fila de envio.':'Cadastro recusado. O lead foi preservado e nenhum acesso foi criado.')
      setConfirmar(null);setRevisao(v=>v+1)
      if(r.status==='aprovado')onAprovado()
    }catch(e){setErro((e as Error).message)}finally{setOcupado(null)}
  }
  return <section className="admin-card admin-pendentes">
    <header><div><span className="rot">Cadastros pelo formulário</span><h3>Aprovação de clientes</h3><p>O lead permanece na captação. O acesso só é criado após sua aprovação.</p></div><button disabled={!!ocupado||carregando} onClick={()=>setRevisao(v=>v+1)}>Atualizar</button></header>
    <nav aria-label="Status da aprovação">{[['pendente','Pendentes'],['processando','Em aprovação'],['aprovado','Aprovados'],['recusado','Recusados']].map(([id,nome])=><button key={id} aria-pressed={status===id} disabled={!!ocupado} onClick={()=>{setStatus(id);setPagina(0);setConfirmar(null);setAviso('')}}>{nome}</button>)}</nav>
    {erro&&<p role="alert">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
    {confirmar?.acao==='aprovar' && confirmar.p.status==='pendente' && <label>Plano do novo cliente <select value={plano} disabled={!!ocupado} onChange={e=>setPlano(e.target.value)}>{PLANOS_CLIENTE.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}
    {confirmar&&<div className="pendente-confirmar"><b>{confirmar.acao==='aprovar'?'Aprovar':'Recusar'} {confirmar.p.nome}?</b><p>{confirmar.acao==='aprovar'?'Novos clientes recebem o plano escolhido por 30 dias e e-mail com as instruções. Contas existentes mantêm senha e condições atuais.':'O lead continuará disponível, sem criação de acesso ou envio de e-mail.'}</p><div><button disabled={!!ocupado} onClick={()=>setConfirmar(null)}>Cancelar</button><button className="admin-primary" disabled={!!ocupado} onClick={()=>void decidir()}>{ocupado?'Processando…':'Confirmar'}</button></div></div>}
    {carregando?<p>Carregando cadastros…</p>:lista.length===0&&!erro?<p>Nenhum cadastro nesta situação.</p>:lista.slice(0,50).map(p=><article key={p.id} className="pendente-linha"><div><b>{p.nome}</b><span>{p.email}</span><span>{p.telefone}</span></div><div><small>{new Date(p.criado_em).toLocaleString('pt-BR')}</small><span>{p.status==='aprovado'?(p.email_enviado_em?'E-mail enviado':'E-mail na fila de envio'):p.status==='processando'?'Aprovação iniciada; pode ser retomada após dois minutos.':p.status==='recusado'?'Recusado':'Pendente de aprovação'}</span></div>{['pendente','processando'].includes(p.status)&&<div className="pendente-acoes"><button disabled={!!ocupado} className="admin-primary" onClick={()=>setConfirmar({p,acao:'aprovar'})}>{p.status==='processando'?'Retomar aprovação':'Aprovar'}</button>{p.status==='pendente'&&<button disabled={!!ocupado} onClick={()=>setConfirmar({p,acao:'recusar'})}>Recusar</button>}</div>}</article>)}
    <footer><button disabled={pagina===0||!!ocupado||carregando} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>Página {pagina+1}</span><button disabled={lista.length<=50||!!ocupado||carregando} onClick={()=>setPagina(p=>p+1)}>Próxima</button></footer>
  </section>
}
