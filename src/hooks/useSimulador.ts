import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SUPABASE } from '../core/teeds/config'
import { MARCA } from '../marca'
export function useSimulador(sessao: SessaoTeeds | null) {
  const [acesso,setAcesso]=useState<{token:string;permitido:boolean}|null>(null)
  useEffect(()=>{
    if(!sessao){setAcesso(null);return}
    let vivo=true
    const consultar=async()=>{
      try{
        const r=await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meu_simulador`,{method:'POST',headers:{apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_marca:MARCA.id})})
        if(!r.ok)throw new Error('Permissão indisponível')
        const permitido=(await r.json())===true
        if(vivo)setAcesso({token:sessao.token,permitido})
      }catch{if(vivo)setAcesso({token:sessao.token,permitido:false})}
    }
    void consultar();const t=setInterval(()=>void consultar(),30000)
    window.addEventListener('focus',consultar)
    return()=>{vivo=false;clearInterval(t);window.removeEventListener('focus',consultar)}
  },[sessao?.token])
  return !!sessao && acesso?.token===sessao.token && acesso.permitido
}
