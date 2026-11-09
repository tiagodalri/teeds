import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { ApiEstudio } from '../../core/teeds/estudio'
import './interruptor.css'

/*
  O liga/desliga do Gerenciador dentro da plataforma (09/11/2026, Tiago: "sabe aquele seletorzinho de alternar de
  ativo ou desativo que tem no gerenciador original do facebook? queria trazer isso pro painel da plataforma").
  Como na Meta, muda na hora (sem janela de confirmar); embaixo aparece o aviso com "Desfazer" por alguns segundos.
  Quem grava é a função meta-estudio (acao 'status'): só mexe em campanhas da GF e anota quem fez no histórico.
  O botão mostra o status do próprio item (o Off/On da Meta); a entrega (No ar, Conjunto pausado...) continua no selo.
*/

export type TipoDoItem = 'campanha' | 'conjunto' | 'anuncio'
const NOME_DO_TIPO: Record<TipoDoItem, string> = { campanha: 'a campanha', conjunto: 'o conjunto', anuncio: 'o anúncio' }
const TITULO_DO_TIPO: Record<TipoDoItem, string> = { campanha: 'Campanha', conjunto: 'Conjunto', anuncio: 'Anúncio' }

/** Sem o `ligado` da Meta (leitura antiga guardada ou a ponte), o status de entrega diz o bastante. */
export const estaLigado = (ligado: boolean | undefined, status: string) => ligado ?? !['PAUSED', 'ARCHIVED', 'DELETED'].includes(status)

export function Interruptor({ ligado, indo, aoMudar, tipo, nome }: { ligado: boolean; indo?: boolean; aoMudar: (ligar: boolean) => void; tipo: TipoDoItem; nome: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} disabled={indo}
      className={`ip ${ligado ? 'on' : ''} ${indo ? 'indo' : ''}`}
      aria-label={`${ligado ? 'Desligar' : 'Ligar'} ${NOME_DO_TIPO[tipo]} ${nome}`}
      title={indo ? 'Mudando na Meta…' : `${ligado ? 'Ligado' : 'Desligado'} · clique para ${ligado ? 'desligar' : 'ligar'} ${NOME_DO_TIPO[tipo]}`}
      onClick={(e) => { e.stopPropagation(); aoMudar(!ligado) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}>
      <i aria-hidden="true" />
    </button>
  )
}

type Aviso = { texto: string; erro?: boolean; desfazer?: () => void; n: number }

/**
 * O estado dos botões de toda a tela. `trocas` guarda o que foi mudado aqui até a leitura da Meta confirmar
 * (a leitura fica guardada 5 minutos no banco: sem isso o botão voltaria sozinho).
 */
export function useLigaDesliga(api: ApiEstudio, sessao: SessaoTeeds, parceiro: string, depois: () => void) {
  const [trocas, setTrocas] = useState<Record<string, boolean>>({})
  const [indo, setIndo] = useState<Record<string, boolean>>({})
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const depoisRef = useRef(depois); depoisRef.current = depois
  const relogio = useRef<number>()
  useEffect(() => { setTrocas({}); setAviso(null) }, [parceiro])
  useEffect(() => () => window.clearTimeout(relogio.current), [])

  const alternar = useCallback(async (tipo: TipoDoItem, id: string, nome: string, ligar: boolean, voltando = false) => {
    setIndo((x) => ({ ...x, [id]: true }))
    setTrocas((x) => ({ ...x, [id]: ligar }))
    try {
      await api.status(sessao, parceiro, tipo, id, ligar)
      setAviso({
        n: Date.now(), texto: `${TITULO_DO_TIPO[tipo]} “${nome}” ${ligar ? 'ligad' : 'desligad'}${tipo === 'campanha' ? 'a' : 'o'}${voltando ? ' de novo' : ''}.`,
        desfazer: voltando ? undefined : () => { void alternar(tipo, id, nome, !ligar, true) },
      })
      // a Meta leva uns segundos para refletir a entrega (No ar / Pausado): lê de novo sem o guardado
      window.clearTimeout(relogio.current)
      relogio.current = window.setTimeout(() => depoisRef.current(), 2500)
    } catch (e) {
      setTrocas((x) => { const { [id]: _, ...resto } = x; return resto })
      setAviso({ n: Date.now(), erro: true, texto: `Não deu para ${ligar ? 'ligar' : 'desligar'} ${NOME_DO_TIPO[tipo]}: ${(e as Error).message}` })
    } finally {
      setIndo((x) => { const { [id]: _, ...resto } = x; return resto })
    }
  }, [api, sessao, parceiro])

  /** Quando a leitura da Meta já mostra o mesmo que foi mudado aqui, a troca guardada sai. */
  const conferir = useCallback((daMeta: Map<string, boolean>) => {
    setTrocas((x) => {
      const fica = Object.entries(x).filter(([id, v]) => daMeta.get(id) !== v)
      return fica.length === Object.keys(x).length ? x : Object.fromEntries(fica)
    })
  }, [])

  const ligadoDe = useCallback((id: string, daMeta: boolean) => trocas[id] ?? daMeta, [trocas])
  const fecharAviso = useCallback(() => setAviso(null), [])
  return { ligadoDe, indo, alternar, aviso, fecharAviso, conferir }
}

/** O aviso embaixo da tela, com Desfazer; some sozinho. */
export function AvisoDoInterruptor({ aviso, fechar }: { aviso: Aviso | null; fechar: () => void }) {
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(fechar, aviso.erro ? 9000 : 6500)
    return () => window.clearTimeout(t)
  }, [aviso, fechar])
  if (!aviso) return null
  return (
    <div key={aviso.n} className={`ip-aviso ${aviso.erro ? 'erro' : ''}`} role="status" aria-live="polite">
      <span>{aviso.texto}</span>
      {aviso.desfazer && <button type="button" onClick={() => { aviso.desfazer?.(); }}>Desfazer</button>}
      <button type="button" className="ip-fechar" aria-label="Fechar" onClick={fechar}>×</button>
    </div>
  )
}
