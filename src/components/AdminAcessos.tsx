import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { listarClientes, type ClienteRegistro } from '../core/teeds/clientes'

const tempo = (s:number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s/60)} min` : `${Math.floor(s/3600)}h ${Math.round((s%3600)/60)}min`

export function AdminAcessos({sessao}:{sessao:SessaoTeeds}) {
  const [clientes,setClientes]=useState<ClienteRegistro[]>([])
  useEffect(()=>{ void listarClientes(sessao).then(setClientes) },[sessao])
  return <section className="admin-card full admin-acessos">
    <header><div><span className="rot">Comportamento de uso</span><h3>Acessos e permanência</h3></div><small>Atualização a cada minuto enquanto a plataforma está aberta</small></header>
    <div className="rc-tabela acessos"><div className="cab"><span>Cliente</span><span>Último acesso</span><span>Acessos</span><span>Tempo total</span><span>Região aproximada</span></div>
      {clientes.map(c=><div key={c.userId}><span><b>{c.nome||'Sem nome'}</b><small>{c.email}</small></span><span>{new Date(c.vistoEm).toLocaleString('pt-BR')}</span><strong>{c.totalAcessos}</strong><span>{tempo(c.tempoTotalSegundos)}</span><span>{c.fusoHorario||'Ainda não medida'}<small>{c.idioma||''}</small></span></div>)}
    </div>
  </section>
}
