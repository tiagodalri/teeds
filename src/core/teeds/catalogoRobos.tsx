import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from './conta'
import { SERVIDOR } from './config'
export interface ItemCatalogo { id: string; ativo: boolean }
export async function consultarCatalogo(sessao: SessaoTeeds, alteracao?: ItemCatalogo): Promise<ItemCatalogo[]> {
  const r = await fetch(`${SERVIDOR.url}/api/catalogo-robos`, { method: alteracao ? 'POST' : 'GET', headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }, ...(alteracao ? { body: JSON.stringify(alteracao) } : {}) })
  const dados = await r.json()
  if (!r.ok) throw new Error(dados.erro ?? 'Não foi possível carregar os robôs.')
  return dados
}
const Contexto = createContext<string[] | null>(null)
export const useRobosDisponiveis = () => useContext(Contexto)
export function CatalogoProvider({ sessao, children }: {sessao: SessaoTeeds | null; children: ReactNode}) {
  const [ids,setIds] = useState<string[]>([])
  useEffect(()=>{
    let vivo = true
    setIds([])
    const carregar = () => { if (sessao) void consultarCatalogo(sessao).then(r=>{if(vivo)setIds(r.filter(i=>i.ativo).map(i=>i.id))}).catch(()=>{if(vivo)setIds([])}) }
    carregar(); const t=setInterval(carregar,10000)
    window.addEventListener('catalogo-alterado',carregar)
    return ()=>{vivo=false;clearInterval(t);window.removeEventListener('catalogo-alterado',carregar)}
  },[sessao?.token])
  return <Contexto.Provider value={ids}>{children}</Contexto.Provider>
}
