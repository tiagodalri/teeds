import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { listarClientesPagina, type ClienteRegistro } from '../core/teeds/clientes'

const tempo = (s:number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s/60)} min` : `${Math.floor(s/3600)}h ${Math.round((s%3600)/60)}min`

/** Quantos clientes cabem numa página. */
const POR_PAGINA = 50

export function AdminAcessos({sessao}:{sessao:SessaoTeeds}) {
  const [naPagina,setNaPagina]=useState<ClienteRegistro[]>([])
  const [total,setTotal]=useState(0)
  const [acessaram,setAcessaram]=useState(0)
  const [pagina,setPagina]=useState(0)
  const [carregando,setCarregando]=useState(true)
  // Quem já entrou vem primeiro, do acesso mais recente para o mais antigo. As
  // contas que nunca entraram (as 11 mil importadas em 11/09, por exemplo)
  // ficam no fim — senão elas enterrariam quem de fato usa a plataforma.
  // Quem ordena é o banco, que devolve só a página pedida.
  useEffect(()=>{
    let vivo = true
    setCarregando(true)
    listarClientesPagina(sessao,{ordem:'acessos',limite:POR_PAGINA,deslocamento:pagina*POR_PAGINA})
      .then(r=>{ if(!vivo) return; setNaPagina(r.pagina); setTotal(r.total); setAcessaram(r.acessaram) })
      .catch(()=>{})
      .finally(()=>{ if(vivo) setCarregando(false) })
    return ()=>{ vivo = false }
  },[sessao.usuario.id,pagina]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const n = (x: number) => x.toLocaleString('pt-BR')
  return <section className="admin-card full admin-acessos">
    <header><div><span className="rot">Comportamento de uso</span><h3>Acessos e permanência</h3></div><small>{n(acessaram)} de {n(total)} clientes já entraram · atualização a cada minuto enquanto a plataforma está aberta</small></header>
    <div className="rc-tabela acessos"><div className="cab"><span>Cliente</span><span>Último acesso</span><span>Acessos</span><span>Tempo total</span><span>Região aproximada</span></div>
      {naPagina.map(c=><div key={c.userId}><span><b>{c.nome||'Sem nome'}</b><small>{c.email}</small></span><span>{c.totalAcessos>0 ? new Date(c.vistoEm).toLocaleString('pt-BR') : 'Nunca acessou'}</span><strong>{c.totalAcessos}</strong><span>{tempo(c.tempoTotalSegundos)}</span><span>{c.fusoHorario||'Ainda não medida'}<small>{c.idioma||''}</small></span></div>)}
      {carregando && !naPagina.length && <div className="adm-vazio">Carregando…</div>}
    </div>
    {total > POR_PAGINA && <div className="adm-paginas"><span>{n(pagina * POR_PAGINA + 1)}–{n(Math.min(total, pagina * POR_PAGINA + naPagina.length))} de {n(total)} clientes</span><div><button onClick={() => setPagina(0)} disabled={pagina === 0}>« Primeira</button><button onClick={() => setPagina(pagina - 1)} disabled={pagina === 0}>‹ Anterior</button><b>Página {n(pagina + 1)} de {n(totalPaginas)}</b><button onClick={() => setPagina(pagina + 1)} disabled={pagina >= totalPaginas - 1}>Próxima ›</button><button onClick={() => setPagina(totalPaginas - 1)} disabled={pagina >= totalPaginas - 1}>Última »</button></div></div>}
  </section>
}
