import { parceiroEmFoco, seloDoParceiro, type OpcaoDeParceiro } from '../core/teeds/parceiroEmFoco'
import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SERVIDOR, SUPABASE } from '../core/teeds/config'
import './admin-pendentes.css'
import { PLANOS_CLIENTE } from '../core/teeds/planos'
import type { PlanoRegistro } from '../core/teeds/clientes'
import { MARCAS } from '../marca'

const NOME_DA_MARCA: Record<string,string> = Object.fromEntries(Object.values(MARCAS).map(m=>[m.id,m.prosa]))

interface Pendente {
  id: string; nome: string; email: string; telefone: string
  status: string; criado_em: string; email_enviado_em: string | null
  recadastro?: boolean; ultima_inscricao_em?: string
  parceiro?: string | null
}
/*
  A MARCA VEM DE FORA, e não da origem do site.

  Esta tela fala com `/api/clientes-pendentes`, e a rota usava a marca da
  origem: com o painel aberto na Teeds e o seletor em OMNI, apareciam os
  cadastros da Teeds sob o título "OMNI Admin" (Tiago, 06/10/2026). Ler errado
  era confuso; aprovar errado criaria a conta na marca errada.

  Por isso a marca é prop obrigatória: quem renderiza decide, e a tela carrega
  o nome dela no cabeçalho para a dúvida nunca mais existir.
*/
/*
  O PARCEIRO NA APROVAÇÃO (30/10/2026, Tiago: "quando eu for aprovar um cliente,
  conseguir selecionar se ele é do Naor ou do Victor"). Ainda há quem se
  cadastre em globalflytrade.com sem o /n ou o /v. `parceiros` só chega para o
  admin geral (useParceirosDaMarca); para os outros a escolha nem aparece, e o
  banco confere de novo (teeds_parceiro_na_aprovacao).
*/
export function AdminPendentes({ sessao, marca, versao, onAprovado, planos, parceiros = [] }: {sessao:SessaoTeeds; marca:string; versao:number; onAprovado:()=>void; planos?: PlanoRegistro[]; parceiros?: OpcaoDeParceiro[]}) {
  // os planos disponíveis desta marca (Administração > Planos); sem eles ainda, os de reserva
  const opcoesDePlano = planos?.length ? planos.filter(p => p.ativo) : PLANOS_CLIENTE
  const planoPadrao = planos?.find(p => p.padrao && p.ativo)?.id ?? 'essencial'
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
  // o parceiro escolhido na confirmação ('' = direto); começa no que o cadastro trouxe
  const [parceiro,setParceiro]=useState('')
  useEffect(()=>{ setParceiro(confirmar?.p.parceiro ?? '') },[confirmar?.p.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // o plano sugerido é o padrão da marca (o de quem se cadastra sozinho)
  useEffect(() => { setPlano(planoPadrao) }, [planoPadrao])
  async function consultar(path: string, body?: unknown, signal?: AbortSignal) {
    // A marca vai nos dois sentidos: na busca e na decisão. Aprovar é o que
    // cria conta e dispara e-mail — não pode depender de qual site está aberto.
    const junta=path.includes('?')?'&':'?'
    const foco=parceiroEmFoco()
    const r=await fetch(`${SERVIDOR.url}/api/clientes-pendentes${path}${junta}marca=${encodeURIComponent(marca)}${foco?`&parceiro=${encodeURIComponent(foco)}`:''}`,{
      method:body?'POST':'GET',signal,
      headers:{Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify({...(body as object),marca})}:{}),
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
  },[sessao.token,marca,status,pagina,versao,revisao])
  async function decidir() {
    if(!confirmar||ocupado)return
    const {p,acao}=confirmar
    setOcupado(p.id);setErro('');setAviso('')
    try {
      // o parceiro primeiro: se o banco recusar, nada foi aprovado ainda
      if(acao==='aprovar'&&parceiros.length&&parceiro!==(p.parceiro??'')){
        const t=await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_parceiro_na_aprovacao`,{method:'POST',
          headers:{apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},
          body:JSON.stringify({p_id:p.id,p_codigo:parceiro})})
        if(!t.ok){const d=await t.json().catch(()=>null);throw new Error(d?.message||'Não foi possível definir o parceiro. Nada foi aprovado.')}
      }
      const r=await consultar('',{id:p.id,acao,plano})
      const doParceiro=parceiros.length&&acao==='aprovar'?` Parceiro: ${seloDoParceiro(parceiros,parceiro||null)?.texto}.`:''
      setAviso(r.status==='aprovado'?`Cadastro aprovado. O e-mail de acesso entrou na fila de envio.${doParceiro}`:'Cadastro recusado. O pedido foi guardado e nenhum e-mail foi enviado.')
      setConfirmar(null);setRevisao(v=>v+1)
      if(r.status==='aprovado')onAprovado()
    }catch(e){setErro((e as Error).message)}finally{setOcupado(null)}
  }
  return <section className="admin-card admin-pendentes">
    <header><div><span className="rot">Cadastros pelo formulário</span><h3>Aprovação de clientes <em className="pendente-marca">{NOME_DA_MARCA[marca] ?? marca}</em></h3><p>Novos cadastros e recadastros aguardam sua aprovação. Cada marca tem a sua conta: quem já é cliente de outra plataforma ganha uma conta nova aqui, com senha própria.</p></div><button disabled={!!ocupado||carregando} onClick={()=>setRevisao(v=>v+1)}>Atualizar</button></header>
    <nav aria-label="Status da aprovação">{[['pendente','Pendentes'],['processando','Em aprovação'],['aprovado','Aprovados'],['recusado','Recusados']].map(([id,nome])=><button key={id} aria-pressed={status===id} disabled={!!ocupado} onClick={()=>{setStatus(id);setPagina(0);setConfirmar(null);setAviso('')}}>{nome}</button>)}</nav>
    {erro&&<p role="alert">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
    {carregando?<p>Carregando cadastros…</p>:lista.length===0&&!erro?<p>Nenhum cadastro nesta situação.</p>:lista.slice(0,50).map(p=><article key={p.id} className="pendente-linha">
      <div><b>{p.nome}{(()=>{const selo=seloDoParceiro(parceiros,p.parceiro??null);return selo&&<em className={`pendente-parceiro ${selo.codigo}`}>{selo.texto}</em>})()}</b><span>{p.email}</span><span>{p.telefone}</span>
        {p.recadastro&&<strong className="pendente-recadastro">Já estava na base: recadastro{p.status==='pendente'?' aguardando aprovação':''}</strong>}
      </div>
      <div><small>Último cadastro: {new Date(p.ultima_inscricao_em||p.criado_em).toLocaleString('pt-BR')}</small><span>{p.status==='aprovado'?(p.email_enviado_em?'E-mail enviado':'E-mail na fila de envio'):p.status==='processando'?'Aprovação iniciada; pode ser retomada após dois minutos.':p.status==='recusado'?'Recusado':'Pendente de aprovação'}</span></div>
      {['pendente','processando'].includes(p.status)&&confirmar?.p.id!==p.id&&<div className="pendente-acoes"><button disabled={!!ocupado} className="admin-primary" onClick={()=>setConfirmar({p,acao:'aprovar'})}>{p.status==='processando'?'Retomar aprovação':'Aprovar'}</button>{p.status==='pendente'&&<button disabled={!!ocupado} onClick={()=>setConfirmar({p,acao:'recusar'})}>Recusar</button>}</div>}
      {/* A confirmação nasce na linha do próprio cadastro (29/10/2026): no topo
          da lista, quem clicava no 30º cadastro não via a pergunta. */}
      {confirmar?.p.id===p.id&&<div className="pendente-confirmar" role="group" aria-label={`Confirmar: ${confirmar.acao==='aprovar'?'aprovar':'recusar'} ${p.nome}`}>
        <b>{confirmar.acao==='aprovar'?'Aprovar':'Recusar'} {p.nome}?</b>
        {confirmar.acao==='aprovar' && (p.status==='pendente' || parceiros.length>0) && <div className="pendente-escolhas">
          {p.status==='pendente' && <label>Plano do cliente <select value={plano} disabled={!!ocupado} onChange={e=>setPlano(e.target.value)}>{opcoesDePlano.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>}
          {parceiros.length>0 && <label>Parceiro do cliente <select value={parceiro} disabled={!!ocupado} onChange={e=>setParceiro(e.target.value)}>
            <option value="">Direto (sem parceiro)</option>
            {parceiros.map(o=><option key={o.codigo} value={o.codigo}>{o.nome.split(' ')[0]} /{o.codigo}</option>)}
          </select></label>}
        </div>}
        {confirmar.acao==='aprovar' && parceiros.length>0 && <p className="pendente-dica">{p.parceiro ? `Veio pelo link /${p.parceiro}.` : 'Cadastrou-se sem /n nem /v.'} O parceiro escolhido fica na ficha: em aparelho que nunca abriu um link de parceiro, o cliente passa a entrar pela página dele, e as operações contam para ele.</p>}
        {/* Fiel a servidor/src/aprovacao-leads.ts (decidirLead) e à função teeds_finalizar_lead:
            o plano escolhido sempre passa a valer; situação e validade só mudam para quem estava em análise;
            a senha só é regravada (para a provisória) em conta que não tem senha própria do cadastro. */}
        <p>{confirmar.acao==='aprovar'
          ? 'O plano escolhido passa a valer e o cliente recebe o e-mail de aprovação. Quem criou a senha no cadastro continua com ela. Quem já tinha conta antes deste cadastro passa a entrar com a senha provisória do e-mail e cria uma nova no primeiro acesso: a senha antiga deixa de valer. Quem já tinha acesso liberado nesta plataforma mantém a situação e a validade atuais.'
          : 'Nenhum e-mail é enviado e o pedido fica guardado na aba Recusados. A conta criada no cadastro continua só com a tela de análise.'}</p>
        <div><button disabled={!!ocupado} onClick={()=>setConfirmar(null)}>Cancelar</button><button className="admin-primary" disabled={!!ocupado} onClick={()=>void decidir()}>{ocupado?'Processando…':confirmar.acao==='aprovar'?'Aprovar':'Recusar'}</button></div>
      </div>}
    </article>)}
    <footer><button disabled={pagina===0||!!ocupado||carregando} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>Página {pagina+1}</span><button disabled={lista.length<=50||!!ocupado||carregando} onClick={()=>setPagina(p=>p+1)}>Próxima</button></footer>
  </section>
}
