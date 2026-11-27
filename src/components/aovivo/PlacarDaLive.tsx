import { useEffect, useRef, useState } from 'react'
import { SUPABASE } from '../../core/teeds/config'
import { sessaoGuardada } from '../../core/teeds/conta'
import { MARCA } from '../../marca'
import { useTreino } from '../../core/live/treino'
import { useInicioDaLive } from './MembrosDaLive'
import './placar-da-live.css'

/**
 * O placar da live no topo do painel (27/11/2026, pedido do Tiago): números de caixa registradora
 * antiga, que rolam como roleta e soltam brilhos quando o markup sobe.
 *  - Markup nesta live (conta real): começa do zero quando a live começa e SÓ sobe, mesmo com
 *    gente saindo (o banco soma todos que passaram; aqui guardamos o maior valor já visto);
 *  - Entradas, saldo em conta real e pessoas operando: de quem está na sala agora (podem descer).
 * Os números vêm de teeds_placar_da_live, de 4 em 4 s. Só a equipe vê.
 */

export interface Placar { markup: number; operacoes: number; entradas: number; operando: number; saldo: number; comConta: number }
const ZERO: Placar = { markup: 0, operacoes: 0, entradas: 0, operando: 0, saldo: 0, comConta: 0 }

/** Só para o laboratório: um placar de exemplo, sem banco. */
let placarDoLab: (() => Placar) | null = null
export function simularPlacar(f: (() => Placar) | null): void { placarDoLab = f }

async function lerPlacar(ids: string[], desde: number): Promise<Placar | null> {
  if (placarDoLab) return placarDoLab()
  const s = sessaoGuardada()
  if (!s) return null
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_placar_da_live`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_ids: ids, p_desde: new Date(desde).toISOString() }),
  })
  if (!r.ok) throw new Error(`placar ${r.status}`)
  const l = (await r.json()) as Record<string, unknown> | null
  if (!l) return null
  const n = (v: unknown) => Number(v ?? 0) || 0
  return { markup: n(l.markup), operacoes: n(l.operacoes), entradas: n(l.entradas), operando: n(l.operando), saldo: n(l.saldo), comConta: n(l.com_conta) }
}

const chaveDoMaior = (inicio: number) => `${MARCA.id}.placar.${inicio}`
function maiorGuardado(inicio: number): number {
  try { return Number(localStorage.getItem(chaveDoMaior(inicio))) || 0 } catch { return 0 }
}
function guardarMaior(inicio: number, v: number): void {
  try { localStorage.setItem(chaveDoMaior(inicio), String(v)) } catch { /* sem armazenamento: só não lembra ao recarregar */ }
}

function usePlacar(inicio: number): Placar {
  const t = useTreino()
  const [p, setP] = useState<Placar>(ZERO)
  const ids = useRef<string[]>([])
  ids.current = t.membrosNaSala.map((m) => m.id)
  useEffect(() => {
    setP(ZERO)
    if (!inicio) return
    let vivo = true
    let timer = 0
    let maior = maiorGuardado(inicio)
    const ler = async () => {
      try {
        const novo = await lerPlacar(ids.current, inicio)
        if (!vivo || !novo) return
        // o markup nunca desce: quem sai da sala não leva o que já gerou
        if (novo.markup > maior) { maior = novo.markup; guardarMaior(inicio, maior) }
        setP({ ...novo, markup: maior })
      } catch { /* tenta de novo na próxima volta */ } finally {
        if (vivo) timer = window.setTimeout(() => void ler(), document.hidden ? 15000 : 4000)
      }
    }
    void ler()
    return () => { vivo = false; window.clearTimeout(timer) }
  }, [inicio])
  return p
}

/* ------------------------------------------------------------ a roleta */

const FITA = Array.from({ length: 30 }, (_, i) => i % 10)

/** Um rolo de caixa registradora: sempre gira para a frente quando o número sobe. */
function Rolo({ digito, subindo }: { digito: number; subindo: boolean }) {
  const [pos, setPos] = useState(10 + digito)
  const [solto, setSolto] = useState(false)
  const atual = useRef(10 + digito)
  useEffect(() => {
    const de = atual.current % 10
    if (de === digito) return
    let alvo: number
    if (subindo) alvo = atual.current + (digito > de ? digito - de : 10 - de + digito)
    else alvo = atual.current - (digito < de ? de - digito : de + 10 - digito)
    atual.current = alvo
    setSolto(false)
    setPos(alvo)
  }, [digito, subindo])
  // terminou de girar: volta para o meio da fita sem animar, pronto para a próxima volta
  const assentar = () => {
    const meio = 10 + (atual.current % 10 + 10) % 10
    if (meio === atual.current) return
    atual.current = meio
    setSolto(true)
    setPos(meio)
  }
  return (
    <span className="pl-rolo" aria-hidden>
      <span className={`pl-fita ${solto ? 'solto' : ''}`} style={{ transform: `translateY(calc(${-pos} * var(--pl-h)))` }} onTransitionEnd={assentar}>
        {FITA.map((d, i) => <span key={i}>{d}</span>)}
      </span>
    </span>
  )
}

function Roleta({ valor, inteiros = 1, casas = 2, classe = '' }: { valor: number; inteiros?: number; casas?: number; classe?: string }) {
  const antes = useRef(valor)
  const subindo = valor >= antes.current
  useEffect(() => { antes.current = valor }, [valor])
  const [int, dec] = Math.max(0, valor).toFixed(casas).split('.')
  const cheio = int.padStart(inteiros, '0')
  // ponto de milhar à moda brasileira, contando da direita
  const partes: string[] = []
  for (let i = 0; i < cheio.length; i++) {
    if (i > 0 && (cheio.length - i) % 3 === 0) partes.push('.')
    partes.push(cheio[i])
  }
  if (casas) partes.push(',', ...dec)
  // os zeros à esquerda (só enfeite, como na registradora) ficam apagados
  const primeiro = partes.findIndex((c) => /[1-9]/.test(c))
  const virgula = partes.indexOf(',')
  const limite = primeiro === -1 || (virgula !== -1 && primeiro > virgula) ? (virgula === -1 ? partes.length - 1 : virgula - 1) : primeiro
  return (
    <span className={`pl-roleta ${classe}`}>
      {partes.map((c, i) => {
        const chave = partes.length - i
        const apagado = i < limite
        return /\d/.test(c)
          ? <span key={chave} className={`pl-casa ${apagado ? 'apagado' : ''}`}><Rolo digito={Number(c)} subindo={subindo} /></span>
          : <span key={chave} className={`pl-sep ${apagado ? 'apagado' : ''}`} aria-hidden>{c}</span>
      })}
    </span>
  )
}

/* ------------------------------------------------------------ os brilhos */

interface Estouro { id: number; ganho: number; faiscas: Array<{ x: number; y: number; d: number; t: number; s: number }> }

function useEstouros(markup: number, ligado: boolean): Estouro[] {
  const [lista, setLista] = useState<Estouro[]>([])
  const antes = useRef(markup)
  const seq = useRef(0)
  useEffect(() => {
    const ganho = markup - antes.current
    antes.current = markup
    if (!ligado || ganho <= 1e-9) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = ++seq.current
    const faiscas = Array.from({ length: 18 }, (_, i) => {
      const ang = (i / 18) * Math.PI * 2 + Math.random() * .5
      const dist = 26 + Math.random() * 46
      return { x: Math.cos(ang) * dist * 1.6, y: Math.sin(ang) * dist * .75, d: Math.random() * 160, t: 700 + Math.random() * 600, s: 2 + Math.random() * 3.5 }
    })
    setLista((l) => [...l.slice(-2), { id, ganho, faiscas }])
    const timer = window.setTimeout(() => setLista((l) => l.filter((e) => e.id !== id)), 2200)
    return () => window.clearTimeout(timer)
  }, [markup, ligado])
  return lista
}

const dolar = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ------------------------------------------------------------ o placar */

export function PlacarDaLive() {
  const inicio = useInicioDaLive()
  const noAr = inicio > 0
  const p = usePlacar(inicio)
  const estouros = useEstouros(p.markup, noAr)
  const brilhando = estouros.length > 0
  const desde = noAr ? new Date(inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <section className={`pl-placar ${noAr ? 'no-ar' : 'parado'} ${brilhando ? 'brilhando' : ''}`}
      aria-label={noAr ? `Placar da live desde ${desde}` : 'Placar da live, começa do zero quando a live começar'}>
      <div className="pl-maquina" title={noAr ? `Markup em conta real gerado nesta live, desde ${desde}. Só sobe: quem sai da sala não leva o que já gerou.` : 'Começa do zero quando a live começar'}>
        <span className="pl-reflexo" aria-hidden />
        <span className="pl-estrelas" aria-hidden><i /><i /><i /></span>
        {estouros.slice(-1).map((e) => <b key={e.id} className="pl-ganho" aria-hidden>+US$ {dolar(e.ganho)}</b>)}
        <span className="pl-rotulo">
          <small>Markup nesta live</small>
          <em>{noAr ? `Conta real · desde ${desde}` : 'Começa na live'}</em>
        </span>
        <span className="pl-visor">
          <span className="pl-moeda">US$</span>
          <Roleta valor={p.markup} inteiros={4} classe="grande" />
          <span className="av-oculto" role="status">{noAr ? `Markup nesta live: US$ ${dolar(p.markup)}` : ''}</span>
          {estouros.map((e) => (
            <span key={e.id} className="pl-estouro" aria-hidden>
              {e.faiscas.map((f, i) => (
                <i key={i} style={{ '--x': `${f.x}px`, '--y': `${f.y}px`, '--d': `${f.d}ms`, '--t': `${f.t}ms`, '--s': `${f.s}px` } as React.CSSProperties} />
              ))}
            </span>
          ))}
        </span>
      </div>
      <div className="pl-mini pl-mini-entradas" title="Soma do valor das entradas em conta real de quem está na sala, desde o começo da live">
        <small>Entradas</small>
        <span className="pl-linha">
          <span className="pl-visor pequeno"><span className="pl-moeda">US$</span><Roleta valor={p.entradas} classe="pequena" /></span>
          {noAr && <em>{p.operacoes} {p.operacoes === 1 ? 'operação' : 'operações'}</em>}
        </span>
      </div>
      <div className="pl-mini pl-mini-saldo" title="Soma do saldo em conta real de quem está na sala agora">
        <small>Saldo em conta real</small>
        <span className="pl-linha">
          <span className="pl-visor pequeno"><span className="pl-moeda">US$</span><Roleta valor={p.saldo} classe="pequena" /></span>
          {noAr && <em>{p.comConta} {p.comConta === 1 ? 'conta' : 'contas'}</em>}
        </span>
      </div>
      <div className="pl-mini pl-mini-pessoas" title="Pessoas na sala que já operaram em conta real nesta live">
        <small>Operando</small>
        <span className="pl-linha">
          <span className="pl-visor pequeno"><Roleta valor={p.operando} casas={0} classe="pequena" /></span>
        </span>
      </div>
    </section>
  )
}
