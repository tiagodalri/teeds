/**
 * A boleta do Operar manual (22/10/2026, proposta 2 aprovada pelo Tiago):
 * o ativo ao vivo no topo, valor e duração como os mostradores do Plano de
 * voo (número grande, − e + nas pontas, atalhos embaixo) e os dois botões de
 * compra lado a lado, com quanto recebe dentro.
 *
 * Só a apresentação mora aqui. Cotação, compra, confirmação na conta real e
 * limites da Deriv continuam no App, iguais a antes.
 */
import { useEffect, useRef, useState } from 'react'
import { useClock } from '../../hooks/useClock'
import { dinheiro, simboloMoeda } from '../../core/dinheiro'
import { dataComHora } from '../../core/datas'
import './boleta.css'

const fmtPreco = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

/* ------------------------------------------------ o ativo, ao vivo */
export function BoletaAtivo({ nome, preco, pipSize, direcao, sintetico, aberto }: {
  nome: string; preco: number | null; pipSize: number; direcao: 'up' | 'down' | null; sintetico: boolean; aberto: boolean
}) {
  const sigla = nome.match(/\d+/)?.[0] ?? nome.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
  return (
    <div className="bl-ativo">
      <span className="bl-ativo-ic" aria-hidden="true">{sigla}</span>
      <div className="bl-ativo-nome">
        <b>{nome || 'Ativo'}</b>
        <small>{!aberto ? 'Mercado fechado agora' : sintetico ? 'Aberto 24 h' : 'Mercado aberto'}</small>
      </div>
      <span className="bl-ativo-preco" aria-live="off">
        <b className={direcao === 'up' ? 'sobe' : direcao === 'down' ? 'cai' : ''}>{preco === null ? '—' : fmtPreco(preco, pipSize)}</b>
        <small><i className={preco !== null && aberto ? 'vivo' : ''} aria-hidden="true" />{!aberto ? 'Fechado' : preco !== null ? 'Ao vivo' : 'Aguardando'}</small>
      </span>
    </div>
  )
}

/* ------------------------------------------------ o mostrador do valor */
/** Os degraus do − e do +: o mesmo valor da Deriv, em passos que fazem sentido. */
const DEGRAUS = [0.35, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2000, 5000]
const proximo = (v: number, sobe: boolean) => sobe
  ? DEGRAUS.find((d) => d > v + 1e-9) ?? v
  : [...DEGRAUS].reverse().find((d) => d < v - 1e-9) ?? 0.35

/**
 * Um campo só, em pílula: − e + dentro dele, o valor no meio (dá para tocar e
 * digitar). Embaixo, a régua de atalhos com botões do mesmo tamanho.
 * (22/10/2026, segunda versão: os círculos soltos e o número flutuando no
 * meio pareciam desalinhados.)
 */
/** O menor valor que a Deriv aceita numa entrada. */
export const VALOR_MINIMO = 0.35
// a mesma leitura do App (lerValor): vírgula decimal, ou ponto quando não é milhar
const lerTexto = (t: string) => Number(t.includes(',') || /^[1-9]\d{0,2}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)

export function MostradorValor({ stake, texto, moeda, alerta, saldo = null, conta = null, aoMudarTexto, aoMudar, aoSair }: {
  stake: number; texto: string | null; moeda: string; alerta: boolean; saldo?: number | null
  /** O tipo da conta como a tela mostra (com rótulos trocados, já trocado): o selo fica ao lado do saldo. */
  conta?: 'real' | 'demo' | null
  aoMudarTexto: (t: string) => void; aoMudar: (v: number) => void; aoSair: () => void
}) {
  const visto = texto ?? stake.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  // digitando um valor abaixo do mínimo: diz na hora, em vez de corrigir calado ao sair do campo
  const abaixo = texto !== null && texto.trim() !== '' && Number.isFinite(lerTexto(texto)) && lerTexto(texto) < VALOR_MINIMO
  return (
    <div className={`bl-most ${alerta || abaixo ? 'alerta' : ''}`}>
      <div className="bl-most-cab">
        <span className="bl-rot" id="bl-valor-rot">Valor da entrada</span>
        {(saldo !== null || conta) && (
          <span className="bl-saldo">
            {conta && <i className={`bl-conta ${conta}`}>{conta === 'real' ? 'Conta real' : 'Conta demo'}</i>}
            {saldo !== null && <>Saldo <b>{dinheiro(saldo, moeda)}</b></>}
          </span>
        )}
      </div>
      <div className="bl-campo">
        <button type="button" className="bl-campo-pm" aria-label="Diminuir o valor" disabled={stake <= 0.35} onClick={() => aoMudar(proximo(stake, false))}>−</button>
        <label className="bl-campo-valor">
          <small>{simboloMoeda(moeda)}</small>
          <input type="text" inputMode="decimal" autoComplete="off" aria-labelledby="bl-valor-rot" aria-invalid={abaixo || undefined} value={visto}
            style={{ width: `${Math.max(3, visto.length) + 0.3}ch` }}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => aoMudarTexto(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={aoSair} />
        </label>
        <button type="button" className="bl-campo-pm" aria-label="Aumentar o valor" onClick={() => aoMudar(proximo(stake, true))}>+</button>
      </div>
      {abaixo && <p className="bl-alerta" role="status">O valor mínimo é {dinheiro(VALOR_MINIMO, moeda)}.</p>}
      <div className="bl-regua" role="group" aria-label="Valores rápidos">
        {[0.35, 1, 5, 10, 50].map((v) => (
          <button key={v} type="button" className={stake === v ? 'on' : ''} aria-pressed={stake === v} onClick={() => aoMudar(v)}>{v.toLocaleString('pt-BR')}</button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------ o mostrador da duração */
type Unidade = 't' | 's' | 'm'
// tick é cada nova cotação do ativo: na tela, "cotação" (jargão só no botão, com a explicação no title)
const NOME_UNIDADE: Record<Unidade, [string, string]> = { t: ['cotação', 'cotações'], s: ['seg', 'seg'], m: ['min', 'min'] }
const ATALHOS: Record<Unidade, number[]> = { t: [1, 3, 5, 7, 10], s: [15, 30, 60, 120, 300], m: [1, 5, 15, 30, 60] }

export function MostradorDuracao({ duracao, unidade, faixa, disponiveis, aoMudar, aoTrocarUnidade, aoSair }: {
  duracao: number; unidade: Unidade; faixa: readonly [number, number] | null | undefined
  disponiveis: Record<Unidade, boolean>
  aoMudar: (d: number) => void; aoTrocarUnidade: (u: Unidade) => void; aoSair: () => void
}) {
  const [min, max] = faixa ?? [1, 1440]
  const passo = unidade === 's' ? 5 : 1
  const atalhos = ATALHOS[unidade].filter((v) => v >= min && v <= max)
  const nome = NOME_UNIDADE[unidade][duracao === 1 ? 0 : 1]
  return (
    <div className="bl-most">
      <div className="bl-most-cab">
        <span className="bl-rot" id="bl-dur-rot">Duração</span>
        <span className="bl-unid" role="group" aria-label="Unidade da duração">
          {(['t', 's', 'm'] as const).map((u) => (
            <button key={u} type="button" disabled={!disponiveis[u]} className={unidade === u ? 'on' : ''}
              title={u === 't' ? 'Ticks: cada tick é uma nova cotação do ativo' : u === 's' ? 'Segundos' : 'Minutos'}
              onClick={() => aoTrocarUnidade(u)}>{u === 't' ? 'Ticks' : u === 's' ? 'Seg' : 'Min'}</button>
          ))}
        </span>
      </div>
      <div className="bl-campo">
        <button type="button" className="bl-campo-pm" aria-label="Diminuir a duração" disabled={duracao <= min} onClick={() => aoMudar(Math.max(min, duracao - passo))}>−</button>
        <label className="bl-campo-valor">
          <input type="text" inputMode="numeric" autoComplete="off" aria-labelledby="bl-dur-rot" value={duracao || ''}
            style={{ width: `${Math.max(1, String(duracao || '').length) + 0.3}ch` }}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => aoMudar(Number(e.target.value.replace(/\D/g, '')) || 0)}
            onBlur={aoSair} />
          <small>{nome}</small>
        </label>
        <button type="button" className="bl-campo-pm" aria-label="Aumentar a duração" disabled={duracao >= max} onClick={() => aoMudar(Math.min(max, duracao + passo))}>+</button>
      </div>
      {atalhos.length > 0 && (
        <div className="bl-regua" role="group" aria-label="Durações rápidas">
          {atalhos.map((v) => (
            <button key={v} type="button" className={duracao === v ? 'on' : ''} aria-pressed={duracao === v} onClick={() => aoMudar(v)}>{v.toLocaleString('pt-BR')}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------ os botões de compra */
/** Celular e tablet tocam; computador clica. */
const TOQUE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

export function BotaoCompra({ tipo, payout, moeda, carregando, erro, podeOperar, motivoBloqueio, comprando, confirmando, stake, aoComprar, semDizerReal = false }: {
  tipo: 'sobe' | 'desce'; payout: number | null; moeda: string; carregando: boolean; erro: string | null
  podeOperar: boolean; motivoBloqueio: string | null; comprando: boolean; confirmando: boolean; stake: number
  aoComprar: () => void
  /** Rótulos trocados (exercícios internos): a confirmação continua, sem dizer "dinheiro real". */
  semDizerReal?: boolean
}) {
  // o preço mudou: só o número ganha um realce rápido, no máximo a cada 2 s
  // (a cotação muda quase todo segundo; acender o botão inteiro o deixava desbotado)
  const [pisca, setPisca] = useState(false)
  const antes = useRef<number | null>(null)
  const ultimo = useRef(0)
  useEffect(() => {
    if (payout === null) { setPisca(false); return }
    const mudou = antes.current !== null && Math.abs(antes.current - payout) >= 0.005
    antes.current = payout
    if (!mudou || Date.now() - ultimo.current < 2000) return
    ultimo.current = Date.now()
    setPisca(true)
    const t = window.setTimeout(() => setPisca(false), 420)
    return () => window.clearTimeout(t)
  }, [payout])

  const titulo = tipo === 'sobe' ? 'Comprar' : 'Vender'
  const pct = payout !== null && stake > 0 ? Math.round(((payout - stake) / stake) * 100) : null
  const travado = !podeOperar || comprando
  const valor = erro ? null : payout
  return (
    <button type="button" className={`bl-botao ${tipo} ${confirmando ? 'confirmando' : ''}`}
      disabled={travado} onClick={aoComprar}
      aria-label={comprando ? `${titulo}: enviando` : motivoBloqueio ? `${titulo}: ${motivoBloqueio}` : erro ? `${titulo}: ${erro}`
        : confirmando ? `Confirmar ${titulo} de ${dinheiro(stake, moeda)}${semDizerReal ? '' : ' com dinheiro real'}` : `${titulo}${valor !== null ? `, recebe ${dinheiro(valor, moeda)} se acertar` : ''}`}>
      <span className="bl-botao-lin">
        <span className="bl-seta" aria-hidden="true">{tipo === 'sobe' ? '▲' : '▼'}</span>
        <span className="bl-dir">{titulo}</span>
        {pct !== null && !erro && <span className="bl-pct">{pct}%</span>}
      </span>
      {comprando ? <span className="bl-estado">Enviando…</span>
        : motivoBloqueio ? <span className="bl-estado">{motivoBloqueio}</span>
        : confirmando ? <span className="bl-estado">{TOQUE ? 'Toque' : 'Clique'} de novo para confirmar {dinheiro(stake, moeda)}{!semDizerReal && <small>Dinheiro real</small>}</span>
        : erro ? <span className="bl-estado" title={erro}>{erro}</span>
        : <>
            <small>Recebe</small>
            <strong className={pisca ? 'pisca' : ''}>{valor !== null ? dinheiro(valor, moeda) : carregando ? '…' : '—'}</strong>
          </>}
    </button>
  )
}

/* ------------------------------------------------ a linha embaixo dos botões */
export function ResumoDaCompra({ payouts, stake, moeda, duracao, unidade }: {
  payouts: Array<number | null>; stake: number; moeda: string; duracao: number; unidade: Unidade
}) {
  const agora = useClock()
  const lucros = payouts.filter((p): p is number => p !== null).map((p) => p - stake)
  // os dois lados quase sempre diferem por centavos: vale o maior, com "até"
  const lucro = !lucros.length ? null : dinheiro(Math.max(...lucros), moeda)
  const ate = lucros.length > 1 && Math.abs(Math.max(...lucros) - Math.min(...lucros)) >= 0.005
  const fecha = unidade === 't'
    ? <>Fecha após <b>{duracao} {duracao === 1 ? 'cotação' : 'cotações'}</b></>
    : (() => {
        const fim = new Date(agora + duracao * (unidade === 'm' ? 60_000 : 1000))
        const hora = fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        // passou da meia-noite: a data entra junto
        return <>Fecha {fim.toDateString() === new Date(agora).toDateString() ? <>às <b>{hora}</b></> : <>em <b>{dataComHora(fim)}</b></>}</>
      })()
  return (
    <div className="bl-resumo">
      {/* a condição nunca some (29/10/2026): sem ela, "Lucro até US$ X" soava como promessa */}
      <span>Se acertar: {ate ? 'até ' : ''}<b>{lucro ? `+${lucro}` : '—'}</b></span>
      <span>{fecha}</span>
    </div>
  )
}
