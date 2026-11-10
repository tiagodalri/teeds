/**
 * A grade da Multitela (10/11/2026): 2, 4 ou 6 quadros no computador; no
 * celular, até 4 ativos em abas, 1 ou 2 visíveis. Cada quadro é independente
 * (Quadro.tsx); aqui ficam o layout, o quadro em foco, os atalhos do teclado,
 * "Mesmo valor em todos" e a lista das posições abertas de todos os ativos.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { ActiveSymbol, Granularity } from '../../../core/deriv/types'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { nomeDoAtivo } from '../../../core/deriv/market'
import { DERIV } from '../../../core/deriv/config'
import { dinheiro, dinheiroComSinal } from '../../../core/dinheiro'
import { pedeDeposito } from '../../../core/deriv/erros'
import { naPagina } from '../../../core/escala'
import { PositionCard } from '../../PositionCard'
import { IconeAtivo } from '../../IconeAtivo'
import { MARCA } from '../../../marca'
import { MAXIMO_NO_CELULAR, trocarItem, useMultitela, type Quadros, type Unidade } from './estado'
import { SeletorDeQuadros } from './SeletorDeQuadros'
import { Quadro, type AtalhosDoQuadro, type ContaDaMultitela } from './Quadro'
import './multitela.css'

/** A ordem de preferência para preencher quadros vazios. */
const PREFERIDOS = ['R_75', '1HZ100V', '1HZ75V', 'frxEURUSD', '1HZ50V', 'frxXAUUSD', '1HZ10V', '1HZ25V', 'frxGBPUSD', '1HZ90V']
const FINAIS = /^(won|lost|sold|cancelled)$/

function useTelaEstreita(consulta: string) {
  const [sim, setSim] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const mudar = () => setSim(m.matches)
    m.addEventListener('change', mudar)
    return () => m.removeEventListener('change', mudar)
  }, [consulta])
  return sim
}

export function Multitela({ conta, ativos, sessao, ativoInicial, extraNaBarra }: {
  conta: ContaDaMultitela; ativos: ActiveSymbol[]; sessao: SessaoTeeds | null; ativoInicial: string | null
  /** O botão da janela solta (só no computador). */
  extraNaBarra?: ReactNode
}) {
  const [estado, mudar] = useMultitela()
  const celular = useTelaEstreita('(max-width: 900px)')
  const raiz = useRef<HTMLDivElement>(null)
  const grade = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(1400)
  const estreito = !celular && largura < 1080
  // no celular, até 4 ativos; numa tela estreita do computador, o 6 vira 4
  const n: number = celular ? Math.min(estado.n, MAXIMO_NO_CELULAR) : estado.n === 6 && estreito ? 4 : estado.n
  const [foco, setFoco] = useState(0)
  const [ampliado, setAmpliado] = useState<number | null>(null)
  const [aba, setAba] = useState(0)
  const [piscando, setPiscando] = useState<number | null>(null)

  // os ativos de cada quadro: o escolhido; vazio ou fora da lista, o próximo preferido que ainda não está na tela
  const lista = useMemo(() => {
    if (!ativos.length) return estado.ativos.slice(0, 6)
    const existe = (s: string) => ativos.some((a) => a.symbol === s)
    const usados = new Set<string>()
    const candidatos = [...(ativoInicial ? [ativoInicial] : []), ...PREFERIDOS, ...ativos.map((a) => a.symbol)].filter(existe)
    return estado.ativos.slice(0, 6).map((s) => {
      const escolhido = s && existe(s) && !usados.has(s) ? s : candidatos.find((c) => !usados.has(c)) ?? ''
      usados.add(escolhido)
      return escolhido
    })
  }, [estado.ativos, ativos, ativoInicial])
  // guarda o preenchimento automático, para o quadro não trocar de ativo sozinho depois
  useEffect(() => {
    if (ativos.length && lista.some((s, i) => s !== estado.ativos[i])) mudar((e) => ({ ...e, ativos: lista }))
  }, [lista]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (foco >= n) setFoco(0); if (aba >= n) setAba(0); if (ampliado !== null && ampliado >= n) setAmpliado(null) }, [n]) // eslint-disable-line react-hooks/exhaustive-deps

  // a grade ocupa a altura da tela (tela de trabalho), medida em px da página (escala do computador)
  const [altura, setAltura] = useState<number | null>(null)
  useLayoutEffect(() => {
    const medir = () => {
      if (raiz.current) setLargura(naPagina(raiz.current.getBoundingClientRect().width))
      if (!grade.current || celular) { setAltura(null); return }
      const topo = naPagina(grade.current.getBoundingClientRect().top + window.scrollY)
      setAltura(Math.max(560, Math.round(naPagina(window.innerHeight) - topo - 18)))
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (raiz.current) ro.observe(raiz.current)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [celular])

  const apis = useRef(new Map<number, AtalhosDoQuadro>())
  const visiveis = celular
    ? (estado.porVez === 2 && n > 1 ? [aba, (aba + 1) % n] : [aba])
    : ampliado !== null ? [ampliado] : Array.from({ length: n }, (_, i) => i)

  // a troca de layout desliza (View Transitions, onde o navegador tem); sem ela, troca na hora
  const comTransicao = (fazer: () => void) => {
    const doc = document as Document & { startViewTransition?: (f: () => void) => unknown }
    if (celular || !doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fazer(); return }
    try { doc.startViewTransition(() => flushSync(fazer)) } catch { fazer() }
  }
  const trocarQuadros = (q: Quadros) => comTransicao(() => { setAmpliado(null); mudar((e) => ({ ...e, n: q })) })
  const ampliar = (i: number) => comTransicao(() => setAmpliado((a) => (a === i ? null : i)))
  const mudarValor = (i: number, v: number) => mudar((e) => ({ ...e, valores: e.mesmoValor ? e.valores.map(() => v) : trocarItem(e.valores, i, v) }))
  const mudarTempo = (i: number, g: Granularity) => mudar((e) => ({ ...e, tempos: trocarItem(e.tempos, i, g) }))
  const mudarDuracao = (i: number, d: number, u: Unidade) => mudar((e) => ({ ...e, duracoes: trocarItem(e.duracoes, i, d), unidades: trocarItem(e.unidades, i, u) }))
  const ondeEsta = (simbolo: string) => {
    const j = lista.slice(0, n).indexOf(simbolo)
    return j >= 0 ? j + 1 : null
  }
  const escolherAtivo = (i: number, simbolo: string) => {
    const j = lista.slice(0, n).indexOf(simbolo)
    if (j >= 0 && j !== i) {
      // já está aberto noutro quadro: leva até ele em vez de repetir
      if (celular) setAba(j); else { setFoco(j); setAmpliado((a) => (a === null ? null : j)) }
      setPiscando(j); window.setTimeout(() => setPiscando(null), 900)
      return
    }
    mudar((e) => ({ ...e, ativos: trocarItem(e.ativos, i, simbolo) }))
  }

  // teclado (computador): 1–6 escolhem o quadro; Shift ↑/↓ compram nele; + e − mudam o valor dele; Esc volta da ampliação
  const teclado = useRef<(e: KeyboardEvent) => void>(() => {})
  teclado.current = (e: KeyboardEvent) => {
    if (celular || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    const alvo = e.target as HTMLElement | null
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], .mtl-menu, .gp-modal')) return
    if (alvo?.closest('dialog, [role="dialog"]')) return
    if (e.key === 'Escape' && ampliado !== null) { ampliar(ampliado); return }
    if (!e.shiftKey && /^[1-6]$/.test(e.key)) {
      const i = Number(e.key) - 1
      if (ampliado === null && i < n) { e.preventDefault(); setFoco(i) }
      return
    }
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      apis.current.get(foco)?.comprar(e.key === 'ArrowUp' ? 'CALL' : 'PUT')
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault()
      apis.current.get(foco)?.passo(e.key !== '-')
    }
  }
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => teclado.current(e)
    window.addEventListener('keydown', ouvir)
    return () => window.removeEventListener('keydown', ouvir)
  }, [])

  // as posições abertas de todos os ativos
  const abertas = conta.contratos.filter((c) => !FINAIS.test(c.status))
  const total = abertas.reduce((t, c) => t + c.profit, 0)
  const investido = abertas.reduce((t, c) => t + c.buyPrice, 0)
  const [listaAberta, setListaAberta] = useState(false)
  const caixaLista = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!listaAberta) return
    const fora = (e: PointerEvent) => { if (!caixaLista.current?.contains(e.target as Node)) setListaAberta(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setListaAberta(false) }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla) }
  }, [listaAberta])
  const nomeDe = (simbolo: string) => nomeDoAtivo(ativos.find((a) => a.symbol === simbolo)?.name ?? simbolo)
  const resultadoDe = (simbolo: string) => abertas.filter((c) => c.symbol === simbolo)

  const posicoes = (
    <div className="mtl-posicoes" ref={caixaLista}>
      <button type="button" className="mtl-pos-bt" aria-expanded={listaAberta} aria-haspopup="dialog" onClick={() => setListaAberta((x) => !x)}>
        {abertas.length
          ? <><span>{abertas.length} {abertas.length === 1 ? 'posição aberta' : 'posições abertas'}</span><span className="mtl-pos-agora">Agora <b className={total >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(total, conta.moeda)}</b></span></>
          : <span>Nenhuma posição aberta</span>}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {listaAberta && (
        <div className="mtl-pos-lista" role="dialog" aria-label="Posições abertas">
          {abertas.length > 0 && (
            <div className="mtl-pos-cab"><span>Investido <b>{dinheiro(investido, conta.moeda)}</b></span><span>Agora <b className={total >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(total, conta.moeda)}</b></span></div>
          )}
          {abertas.length === 0 && <p className="mtl-pos-vazio">As entradas que você fizer nos quadros aparecem aqui, com o resultado ao vivo.</p>}
          {abertas.map((c) => {
            const q = ondeEsta(c.symbol)
            return (
              <div key={c.contractId} className="mtl-pos-item">
                <button type="button" className="mtl-pos-ir" disabled={!q} onClick={() => { if (q) { if (celular) setAba(q - 1); else { setFoco(q - 1); setAmpliado((a) => (a === null ? null : q - 1)) } setListaAberta(false) } }}>
                  {q ? `Ir ao quadro ${q}` : 'Fora da tela'}
                </button>
                <PositionCard contrato={c} nomeAtivo={nomeDe(c.symbol)} onEncerrar={conta.encerrar} real={conta.real} encerrando={conta.vendendo === c.contractId} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const avisoGeral = conta.aviso && (
    <p role="status" aria-live="polite" className={`mtl-aviso-geral ${conta.aviso.tipo === 'ok' ? 'ok' : 'erro'}`}>
      {conta.aviso.texto}{pedeDeposito(conta.aviso.texto) && <> <a href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv</a></>}
    </p>
  )

  const quadro = (i: number, variante: 'coluna' | 'faixa' | 'celular') => (
    <div key={`q${i}`} className={`mtl-celula${piscando === i ? ' mtl-piscando' : ''}`} style={celular ? undefined : { viewTransitionName: `mtl-q${i}` } as CSSProperties}>
      <Quadro numero={i + 1} simbolo={lista[i]} ativos={ativos} conta={conta} sessao={sessao}
        stake={estado.valores[i]} aoMudarStake={(v) => mudarValor(i, v)} tempo={estado.tempos[i]} aoMudarTempo={(g) => mudarTempo(i, g)}
        duracao={estado.duracoes[i]} unidade={estado.unidades[i]} aoMudarDuracao={(d, u) => mudarDuracao(i, d, u)}
        variante={variante} emFoco={!celular && foco === i} aoFocar={() => setFoco(i)} semNumero={celular}
        ondeEsta={ondeEsta} aoEscolherAtivo={(s) => escolherAtivo(i, s)}
        ampliado={ampliado === i} aoAmpliar={celular ? undefined : () => ampliar(i)}
        registrar={(api) => { if (api) apis.current.set(i, api); else apis.current.delete(i) }} />
    </div>
  )

  if (celular) {
    return (
      <div className="mtl mtl-no-celular" ref={raiz}>
        <div className="mtl-abas-topo">
          <div className="mtl-abas" role="tablist" aria-label="Ativos na tela">
            {Array.from({ length: n }, (_, i) => {
              const minhas = resultadoDe(lista[i])
              const r = minhas.reduce((t, c) => t + c.profit, 0)
              return (
                <button key={i} type="button" role="tab" aria-selected={visiveis.includes(i)} className={`mtl-aba${visiveis.includes(i) ? ' on' : ''}${piscando === i ? ' mtl-piscando' : ''}`} onClick={() => setAba(i)}>
                  {MARCA.iconesDeAtivos && lista[i] && <IconeAtivo simbolo={lista[i]} tamanho={24} />}
                  <span>{lista[i] ? nomeDe(lista[i]) : 'Ativo'}</span>
                  {minhas.length > 0 && <em className={r >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(r, conta.moeda)}</em>}
                </button>
              )
            })}
            {n < MAXIMO_NO_CELULAR && (
              <button type="button" className="mtl-aba mais" onClick={() => { trocarQuadros(n < 2 ? 2 : 4); setAba(n) }} aria-label="Adicionar ativo" title="Adicionar ativo">+</button>
            )}
          </div>
        </div>
        {avisoGeral}
        <div className={`mtl-grade-celular por-${visiveis.length}`}>
          {visiveis.map((i) => quadro(i, visiveis.length === 1 ? 'celular' : 'faixa'))}
        </div>
        <div className="mtl-celular-pe">
          {posicoes}
          <div className="mtl-pe-linha">
            <small id="mtl-porvez-rot">Ativos na tela</small>
            <div className="mtl-porvez" role="radiogroup" aria-labelledby="mtl-porvez-rot">
              {([1, 2] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={estado.porVez === v} className={estado.porVez === v ? 'on' : ''} disabled={v === 2 && n < 2}
                  onClick={() => mudar((e) => ({ ...e, porVez: v }))}>{v === 1 ? 'Um por vez' : 'Dois por vez'}</button>
              ))}
            </div>
          </div>
          <button type="button" className="mtl-voltar-um" onClick={() => trocarQuadros(1)}>Voltar para um ativo</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mtl" ref={raiz}>
      <div className="mtl-barra">
        <SeletorDeQuadros valor={(estado.n === 6 && estreito ? 4 : estado.n)} aoTrocar={trocarQuadros} desativados={estreito ? [6] : []} />
        <span className="mtl-sep" aria-hidden="true" />
        <button type="button" className="mtl-chave" aria-pressed={estado.mesmoValor}
          title="Mudar o valor de um quadro muda o de todos"
          onClick={() => mudar((e) => ({ ...e, mesmoValor: !e.mesmoValor, valores: !e.mesmoValor ? e.valores.map(() => e.valores[foco] ?? 10) : e.valores }))}>
          <i aria-hidden="true" />Mesmo valor em todos
        </button>
        {extraNaBarra}
        {avisoGeral}
        <span className="mtl-dica" aria-hidden="true">Atalhos: <kbd>1</kbd>–<kbd>{n}</kbd> Quadro · <kbd>Shift</kbd><kbd>↑</kbd> Comprar · <kbd>Shift</kbd><kbd>↓</kbd> Vender</span>
        {posicoes}
      </div>
      <div className="mtl-grade" ref={grade} data-n={ampliado !== null ? 1 : n} style={altura ? { height: altura } : undefined}>
        {visiveis.map((i) => quadro(i, ampliado !== null || n <= 2 ? 'coluna' : 'faixa'))}
      </div>
    </div>
  )
}
