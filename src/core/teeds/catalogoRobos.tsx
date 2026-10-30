import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /** O servidor aceita o cliente escolher o loss virtual deste robô (servidor antigo não manda). */
  lossVirtualAjustavel?: boolean
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
  lossVirtualAjustavel: boolean
}
interface Catalogo {
  /** Ids dos robôs ligados — o contrato de sempre de useRobosDisponiveis. */
  ids: string[]
  /** A lista inteira; null enquanto o servidor não respondeu (ou sem sessão). */
  itens: ItemCatalogo[] | null
  /** A última consulta falhou e não há lista boa guardada (a vitrine diz isso em vez de ficar vazia). */
  falhou: boolean
}
const Contexto = createContext<Catalogo | null>(null)
/** Ids dos robôs ativos; null = fora do provider (ainda não carregou). */
export const useRobosDisponiveis = (): string[] | null => useContext(Contexto)?.ids ?? null
/** A lista inteira do catálogo, para quem percorre vários robôs num map; null = ainda não carregou. */
export const useCatalogoCompleto = (): ItemCatalogo[] | null => useContext(Contexto)?.itens ?? null
/** O catálogo não carregou (servidor fora do ar ou acesso recusado) e não há lista guardada. */
export const useCatalogoFalhou = (): boolean => useContext(Contexto)?.falhou ?? false
/** Pede o catálogo de novo agora (o botão "Tentar de novo" da vitrine). */
export const recarregarCatalogo = () => window.dispatchEvent(new Event('catalogo-alterado'))
/**
 * Os parâmetros vigentes de um robô. null = ainda não carregou (ou visitante
 * sem sessão): quem usa cai em parametrosPadrao(id). Servidor sem o campo
 * `parametros` (versão antiga) também vira o padrão, como sempre foi.
 */
export function useParametrosDoRobo(id: string): ParametrosDoCatalogo | null {
  const item = useContext(Contexto)?.itens?.find((i) => i.id === id)
  return useMemo(() => item
    ? { parametros: item.parametros ?? parametrosPadrao(id), versao: item.parametrosVersao ?? null, testeDemo: item.testeDemo ?? null, lossVirtualAjustavel: item.lossVirtualAjustavel === true }
    : null, [item, id])
}
export function CatalogoProvider({ sessao, children }: {sessao: SessaoTeeds | null; children: ReactNode}) {
  const [itens, setItens] = useState<ItemCatalogo[] | null>(null)
  const [falhou, setFalhou] = useState(false)
  const guardados = useRef<ItemCatalogo[] | null>(null)
  useEffect(()=>{ guardados.current = itens }, [itens])
  useEffect(()=>{
    let vivo = true
    setItens(null); setFalhou(false)
    // Sem sessão não há catálogo: a lista fica vazia (ids) e sem parâmetros (null).
    // Erro de rede segue o comportamento antigo: nenhum robô disponível.
    // com o app em segundo plano a consulta de 10 s pausa (bateria e dados do celular); volta ao reabrir
    // 30/10/2026: uma falha não apaga a lista boa (a vitrine ficava vazia, "0 estratégias");
    // sem lista guardada, a vitrine mostra o aviso com "Tentar de novo"
    const carregar = () => { if (sessao && document.visibilityState !== 'hidden') void consultarCatalogo(sessao).then(r=>{if(vivo){setItens(r);setFalhou(false)}}).catch(()=>{if(vivo&&!guardados.current)setFalhou(true)}) }
    carregar(); const t=setInterval(carregar,10000)
    window.addEventListener('catalogo-alterado',carregar)
    document.addEventListener('visibilitychange',carregar)
    return ()=>{vivo=false;clearInterval(t);window.removeEventListener('catalogo-alterado',carregar);document.removeEventListener('visibilitychange',carregar)}
  },[sessao?.token])
  // A lista de ids só muda quando o catálogo muda: evita efeitos rodando à toa em quem depende dela.
  const valor = useMemo<Catalogo>(() => ({ ids: (itens ?? []).filter(i=>i.ativo).map(i=>i.id), itens, falhou }), [itens, falhou])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Laboratório: um catálogo fixo, sem servidor (as telas de preparo com dados de exemplo). */
export function CatalogoDeExemplo({ itens, children }: { itens: ItemCatalogo[]; children: ReactNode }) {
  const valor = useMemo<Catalogo>(() => ({ ids: itens.filter((i) => i.ativo).map((i) => i.id), itens, falhou: false }), [itens])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
