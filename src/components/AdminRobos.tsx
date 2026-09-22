import { useEffect, useState } from 'react'
import { consultarCatalogo, type ItemCatalogo } from '../core/teeds/catalogoRobos'
import type { SessaoTeeds } from '../core/teeds/conta'
import { identidade } from '../core/deriv/branding'
export function AdminRobos({sessao}:{sessao:SessaoTeeds}) {
  const [lista,setLista]=useState<ItemCatalogo[]>([])
  const [erro,setErro]=useState('')
  const [salvando,setSalvando]=useState(false)
  useEffect(()=>{void consultarCatalogo(sessao).then(setLista).catch(e=>setErro(e.message))},[sessao.token])
  async function alterar(item:ItemCatalogo) {
    setSalvando(true);setErro('')
    try {setLista(await consultarCatalogo(sessao,{...item,ativo:!item.ativo}));window.dispatchEvent(new Event('catalogo-alterado'))}
    catch(e){setErro((e as Error).message)}finally{setSalvando(false)}
  }
  return <section className="admin-card"><h2>Robôs da plataforma</h2><p>Até 10 robôs simultâneos por cliente. Desativar oculta o modelo e impede novos inícios, sem interromper sessões em andamento.</p>{erro&&<p role="alert">{erro}</p>}{lista.map(item=><div className="admin-column-setting" key={item.id}><b>{identidade(item.id).nome}</b><button className="admin-refresh" role="switch" aria-checked={item.ativo} disabled={salvando} onClick={()=>void alterar(item)} aria-label={`Disponibilidade de ${identidade(item.id).nome}`}>{item.ativo?'Ativo · desativar':'Oculto · ativar'}</button></div>)}</section>
}
