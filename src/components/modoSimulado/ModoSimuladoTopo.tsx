/**
 * Modo simulado geral (12/11/2026): o botão do topo (só admin) e a tag única
 * "Simulado". Desligado, o admin vê "Simular" (some com o olhinho dos itens
 * de admin). Ligado, a tag fica SEMPRE à vista (Tiago: "sempre aparecendo uma
 * tag única lá em cima") e abre o painel: saldo, conta real/demo e sair.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  definirContaSimulada, definirSaldoSimulado, desligarModoSimulado, ligarModoSimulado, useLivroSimulado, useModoSimulado, usePodeSimular, zerarLivro,
} from '../../core/teeds/modoSimulado'
import { MARCA } from '../../marca'
import './modo-simulado.css'

const SALDOS = [10, 20, 50, 100, 500, 2000]
const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$/g, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) && x >= 0 ? x : null
}

/** Abre o painel de qualquer lugar (o seletor de conta e a carteira, no modo simulado). */
export const abrirPainelSimulado = () => window.dispatchEvent(new CustomEvent('modo-simulado:abrir'))

export function ModoSimuladoTopo({ ocultarBotao = false }: { ocultarBotao?: boolean }) {
  const pode = usePodeSimular()
  const sim = useModoSimulado()
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    const abrir = () => setAberto(true)
    window.addEventListener('modo-simulado:abrir', abrir)
    return () => window.removeEventListener('modo-simulado:abrir', abrir)
  }, [])
  useEffect(() => { if (!sim) setAberto(false) }, [sim])
  if (!pode) return null
  if (!sim) {
    if (ocultarBotao) return null
    return (
      <button type="button" className="msim-ligar" onClick={() => { ligarModoSimulado(); setAberto(true) }}
        title="Ligar o modo simulado (só administradores)" aria-label="Ligar o modo simulado">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v5.5L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.5V3" /><path d="M7.5 14h9" /></svg>
        <span>Simular</span>
      </button>
    )
  }
  return (
    <>
      <button type="button" className={`msim-tag ${aberto ? 'aberta' : ''}`} onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-haspopup="dialog"
        title="Modo simulado: toque para o saldo e para sair">
        <i aria-hidden="true" />Simulado
      </button>
      {aberto && createPortal(<Painel aoFechar={() => setAberto(false)} />, document.body)}
    </>
  )
}

function Painel({ aoFechar }: { aoFechar: () => void }) {
  const sim = useModoSimulado()
  const livro = useLivroSimulado()
  const caixa = useRef<HTMLDivElement>(null)
  const [texto, setTexto] = useState('')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement
      if (caixa.current && !caixa.current.contains(alvo) && !alvo.closest('.msim-tag')) aoFechar()
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('mousedown', fora)
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('mousedown', fora) }
  }, [aoFechar])
  if (!sim) return null
  const valorDigitado = ler(texto)
  const resultado = livro.reduce((s, o) => s + o.resultado, 0)
  return (
    <div className="msim-painel" role="dialog" aria-label="Modo simulado" ref={caixa}>
      <header>
        <div><b>Modo simulado</b><small>Só os administradores veem</small></div>
        <button type="button" onClick={aoFechar} aria-label="Fechar">×</button>
      </header>

      <section>
        <span className="msim-rot">Saldo da conta</span>
        <div className="msim-saldo-grande">{usd(sim.saldo)}</div>
        <div className="msim-chips" role="group" aria-label="Saldos prontos">
          {SALDOS.map((v) => (
            <button key={v} type="button" className={sim.saldo === v ? 'on' : ''} onClick={() => definirSaldoSimulado(v)}>
              US$ {v.toLocaleString('pt-BR')}
            </button>
          ))}
        </div>
        <form className="msim-outro" onSubmit={(e) => { e.preventDefault(); if (valorDigitado !== null) { definirSaldoSimulado(valorDigitado); setTexto('') } }}>
          <input inputMode="decimal" placeholder="Outro valor (US$)" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Outro saldo em dólares" />
          <button type="submit" disabled={valorDigitado === null}>Usar</button>
        </form>
      </section>

      <section>
        <span className="msim-rot">A conta aparece como</span>
        <div className="msim-seg" role="group" aria-label="Conta">
          <button type="button" className={sim.conta === 'real' ? 'on' : ''} onClick={() => definirContaSimulada('real')}>Real</button>
          <button type="button" className={sim.conta === 'demo' ? 'on' : ''} onClick={() => definirContaSimulada('demo')}>Demo</button>
        </div>
      </section>

      <section className="msim-lista">
        <span className="msim-rot">O que fica simulado</span>
        <ul>
          <li><b>Saldo do topo</b> e de todas as telas.</li>
          <li><b>{IA === 'I.A.' ? 'I.A.' : 'Robôs'}:</b> no play, você escolhe como a sessão termina e ela roda com os parâmetros do preparo.</li>
          <li><b>Operar:</b> as compras usam a cotação e o preço reais, com o saldo simulado.</li>
          <li><b>Relatório:</b> mostra as operações simuladas.</li>
        </ul>
        <small>Nada é comprado na Deriv, nada vai para o banco nem para a cobrança.</small>
      </section>

      {livro.length > 0 && (
        <section className="msim-livro">
          <span>{livro.length} {livro.length === 1 ? 'operação simulada' : 'operações simuladas'} · <b className={resultado < 0 ? 'cai' : 'sobe'}>{resultado < 0 ? '−' : '+'}{usd(Math.abs(resultado))}</b></span>
          <button type="button" onClick={zerarLivro}>Zerar</button>
        </section>
      )}

      <footer>
        <button type="button" className="msim-sair" onClick={() => { desligarModoSimulado(); aoFechar() }}>Sair do modo simulado</button>
      </footer>
    </div>
  )
}
