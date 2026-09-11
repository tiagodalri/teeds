import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { listarClientes, type ClienteRegistro } from '../core/teeds/clientes'

const tempo = (s:number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s/60)} min` : `${Math.floor(s/3600)}h ${Math.round((s%3600)/60)}min`

/** Quantos clientes cabem numa página. */
const POR_PAGINA = 50

export function AdminAcessos({sessao}:{sessao:SessaoTeeds}) {
  const [clientes,setClientes]=useState<ClienteRegistro[]>([])
  const [pagina,setPagina]=useState(0)
  useEffect(()=>{ void listarClientes(sessao).then(setClientes) },[sessao])
  // Quem já entrou vem primeiro, do acesso mais recente para o mais antigo. As
  // contas que nunca entraram (as 11 mil importadas em 11/09, por exemplo)
  // ficam no fim — senão elas enterrariam quem de fato usa a plataforma.
  const ordenados = useMemo(()=>[...clientes].sort((a,b)=>(b.totalAcessos>0?1:0)-(a.totalAcessos>0?1:0) || Date.parse(b.vistoEm)-Date.parse(a.vistoEm)),[clientes])
  const acessaram = clientes.filter(c=>c.totalAcessos>0).length
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const naPagina = ordenados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const n = (x: number) => x.toLocaleString('pt-BR')
  return <section className="admin-card full admin-acessos">
    <header><div><span className="rot">Comportamento de uso</span><h3>Acessos e permanência</h3></div><small>{n(acessaram)} de {n(clientes.length)} clientes já entraram · atualização a cada minuto enquanto a plataforma está aberta</small></header>
    <div className="rc-tabela acessos"><div className="cab"><span>Cliente</span><span>Último acesso</span><span>Acessos</span><span>Tempo total</span><span>Região aproximada</span></div>
      {naPagina.map(c=><div key={c.userId}><span><b>{c.nome||'Sem nome'}</b><small>{c.email}</small></span><span>{c.totalAcessos>0 ? new Date(c.vistoEm).toLocaleString('pt-BR') : 'Nunca acessou'}</span><strong>{c.totalAcessos}</strong><span>{tempo(c.tempoTotalSegundos)}</span><span>{c.fusoHorario||'Ainda não medida'}<small>{c.idioma||''}</small></span></div>)}
    </div>
    {ordenados.length > POR_PAGINA && <div className="adm-paginas"><span>{n(paginaAtual * POR_PAGINA + 1)}–{n(Math.min(ordenados.length, (paginaAtual + 1) * POR_PAGINA))} de {n(ordenados.length)} clientes</span><div><button onClick={() => setPagina(0)} disabled={paginaAtual === 0}>« Primeira</button><button onClick={() => setPagina(paginaAtual - 1)} disabled={paginaAtual === 0}>‹ Anterior</button><b>Página {n(paginaAtual + 1)} de {n(totalPaginas)}</b><button onClick={() => setPagina(paginaAtual + 1)} disabled={paginaAtual >= totalPaginas - 1}>Próxima ›</button><button onClick={() => setPagina(totalPaginas - 1)} disabled={paginaAtual >= totalPaginas - 1}>Última »</button></div></div>}
  </section>
}
