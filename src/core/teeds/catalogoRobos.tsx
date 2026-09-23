import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from './conta'
import { SERVIDOR } from './config'
import { parametrosPadrao, type ParametrosDoRobo } from '../deriv/parametros'

/**
 * Um robô do catálogo da marca. Além do ligado/desligado, o servidor manda
 * (22/09/2026) os parâmetros vigentes que o painel de controle publicou:
 * é o que a tela de preparo, o Gerenciamento e a cabine usam para descrever
 * o robô do jeito que ele está hoje. Servidor antigo não manda esses campos
 * — por isso são opcionais e quem lê cai no padrão do código.
 */
export interface ItemCatalogo {
  id: string
  ativo: boolean
  parametros?: ParametrosDoRobo
  /** Versão publicada em vigor; null = padrão do código. */
  parametrosVersao?: number | null
  /** A regra em teste só nas contas demo, quando houver. */
  testeDemo?: ParametrosDoRobo | null
}
export async function consultarCatalogo(sessao: SessaoTeeds, alteracao?: Pick<ItemCatalogo, 'id' | 'ativo'>): Promise<ItemCatalogo[]> {
  const r = await fetch(`${SERVIDOR.url}/api/catalogo-robos`, { method: alteracao ? 'POST' : 'GET', headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }, ...(alteracao ? { body: JSON.stringify(alteracao) } : {}) })
  const dados = await r.json()
  if (!r.ok) throw new Error(dados.erro ?? 'Não foi possível carregar os robôs.')
  return dados
}

/** O que cada robô está rodando hoje, já com o padrão preenchido. */
export interface ParametrosDoCatalogo {
  parametros: ParametrosDoRobo
  versao: number | null
  testeDemo: ParametrosDoRobo | null
}
interface Catalogo {
  /** Ids dos robôs ligados — o contrato de sempre de useRobosDisponiveis. */
  ids: string[]
  /** A lista inteira; null enquanto o servidor não respondeu (ou sem sessão). */
  itens: ItemCatalogo[] | null
}
const Contexto = createContext<Catalogo | null>(null)
/** Ids dos robôs ativos; null = fora do provider (ainda não carregou). */
export const useRobosDisponiveis = (): string[] | null => useContext(Contexto)?.ids ?? null
/** A lista inteira do catálogo, para quem percorre vários robôs num map; null = ainda não carregou. */
export const useCatalogoCompleto = (): ItemCatalogo[] | null => useContext(Contexto)?.itens ?? null
/**
 * Os parâmetros vigentes de um robô. null = ainda não carregou (ou visitante
 * sem sessão): quem usa cai em parametrosPadrao(id). Servidor sem o campo
 * `parametros` (versão antiga) também vira o padrão, como sempre foi.
 */
export function useParametrosDoRobo(id: string): ParametrosDoCatalogo | null {
  const item = useContext(Contexto)?.itens?.find((i) => i.id === id)
  return useMemo(() => item
    ? { parametros: item.parametros ?? parametrosPadrao(id), versao: item.parametrosVersao ?? null, testeDemo: item.testeDemo ?? null }
    : null, [item, id])
}
export function CatalogoProvider({ sessao, children }: {sessao: SessaoTeeds | null; children: ReactNode}) {
  const [itens, setItens] = useState<ItemCatalogo[] | null>(null)
  useEffect(()=>{
    let vivo = true
    setItens(null)
    // Sem sessão não há catálogo: a lista fica vazia (ids) e sem parâmetros (null).
    // Erro de rede segue o comportamento antigo: nenhum robô disponível.
    const carregar = () => { if (sessao) void consultarCatalogo(sessao).then(r=>{if(vivo)setItens(r)}).catch(()=>{if(vivo)setItens([])}) }
    carregar(); const t=setInterval(carregar,10000)
    window.addEventListener('catalogo-alterado',carregar)
    return ()=>{vivo=false;clearInterval(t);window.removeEventListener('catalogo-alterado',carregar)}
  },[sessao?.token])
  // A lista de ids só muda quando o catálogo muda: evita efeitos rodando à toa em quem depende dela.
  const valor = useMemo<Catalogo>(() => ({ ids: (itens ?? []).filter(i=>i.ativo).map(i=>i.id), itens }), [itens])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
