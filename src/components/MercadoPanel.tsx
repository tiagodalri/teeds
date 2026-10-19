import { useEffect, useMemo, useState } from 'react'
import { SERVIDOR } from '../core/teeds/config'
import './mercado.css'

/**
 * Notícias (19/10/2026): o radar do mercado, de fontes grátis e sem cadastro
 * (servidor/src/mercado.ts). Faixa de cotações, dólar e Ibovespa com o
 * desenho do dia, as bolsas abertas agora e as notícias dos portais.
 *
 * As notícias abrem no site de origem (só manchete, resumo e foto aqui). O
 * Ibovespa grátis vem com o atraso que a B3 impõe; a tela mostra a hora de
 * cada preço. E fica dito, sem rodeio, que notícia não mexe nos índices
 * sintéticos que os robôs operam.
 */

type Categoria = 'bolsa' | 'cambio' | 'juros' | 'internacional' | 'cripto' | 'commodities' | 'economia'
interface Noticia { id: string; titulo: string; resumo: string; link: string; imagem: string | null; fonte: string; quando: string; categoria: Categoria }
interface Cotacao { id: string; nome: string; preco: number; variacao: number; moeda: string; hora: string; atrasada: boolean; serie?: number[] }
interface Dados { cotacoes: Cotacao[]; noticias: Noticia[]; atualizadoEm: string }

const CATEGORIAS: Array<{ id: Categoria | 'tudo'; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' }, { id: 'bolsa', nome: 'Bolsa' }, { id: 'cambio', nome: 'Câmbio' }, { id: 'juros', nome: 'Juros' },
  { id: 'internacional', nome: 'Internacional' }, { id: 'cripto', nome: 'Cripto' }, { id: 'commodities', nome: 'Commodities' }, { id: 'economia', nome: 'Economia' },
]

/** Horário de pregão de cada bolsa, no fuso dela (sem feriados: é pelo relógio). */
const BOLSAS = [
  { nome: 'São Paulo', sigla: 'B3', fuso: 'America/Sao_Paulo', abre: 10 * 60, fecha: 17 * 60 },
  { nome: 'Nova York', sigla: 'NYSE', fuso: 'America/New_York', abre: 9 * 60 + 30, fecha: 16 * 60 },
  { nome: 'Londres', sigla: 'LSE', fuso: 'Europe/London', abre: 8 * 60, fecha: 16 * 60 + 30 },
  { nome: 'Frankfurt', sigla: 'Xetra', fuso: 'Europe/Berlin', abre: 9 * 60, fecha: 17 * 60 + 30 },
  { nome: 'Tóquio', sigla: 'TSE', fuso: 'Asia/Tokyo', abre: 9 * 60, fecha: 15 * 60 + 30 },
  { nome: 'Hong Kong', sigla: 'HKEX', fuso: 'Asia/Hong_Kong', abre: 9 * 60 + 30, fecha: 16 * 60 },
]

function relogioDe(fuso: string, agora: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuso, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(agora).map((x) => [x.type, x.value]))
  const h = Number(p.hour) % 24, m = Number(p.minute)
  return { minutos: h * 60 + m, hora: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, fimDeSemana: p.weekday === 'Sat' || p.weekday === 'Sun' }
}

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
function preco(c: Cotacao) {
  if (c.moeda === 'pts') return num(c.preco, 0)
  if (c.id === 'bitcoin') return `R$ ${num(c.preco, 0)}`
  return `${c.moeda} ${num(c.preco, c.moeda === 'R$' ? 3 : 2)}`
}
const variacao = (v: number) => `${v >= 0 ? '+' : ''}${num(v)}%`
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
function haQuanto(iso: string, agora: number) {
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : 'ontem'
}

function Grafico({ serie, sobe }: { serie: number[]; sobe: boolean }) {
  const min = Math.min(...serie), max = Math.max(...serie), faixa = max - min || 1
  const pontos = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${36 - ((v - min) / faixa) * 32}`).join(' ')
  return (
    <svg className={`mc-grafico ${sobe ? 'sobe' : 'cai'}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,40 ${pontos} 100,40`} />
      <polyline points={pontos} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Painel({ c }: { c: Cotacao }) {
  const sobe = c.variacao >= 0
  return (
    <article className="mc-painel">
      <header><span>{c.nome}</span><em className={sobe ? 'sobe' : 'cai'}>{variacao(c.variacao)}</em></header>
      <b>{preco(c)}</b>
      {c.serie && c.serie.length > 2 && <Grafico serie={c.serie} sobe={sobe} />}
      <small>{c.atrasada ? `Às ${hora(c.hora)} · a B3 libera de graça com ~15 min de atraso` : `Atualizado às ${hora(c.hora)}`}</small>
    </article>
  )
}

function Capa({ n, grande = false }: { n: Noticia; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  if (!n.imagem || falhou) return <span className={`mc-capa vazia ${grande ? 'grande' : ''}`} aria-hidden="true"><b>{n.fonte}</b></span>
  return <img className={`mc-capa ${grande ? 'grande' : ''}`} src={n.imagem} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
}

export function MercadoPanel() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState(false)
  const [filtro, setFiltro] = useState<Categoria | 'tudo'>('tudo')
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    const carregar = () => {
      if (document.hidden) return
      fetch(`${SERVIDOR.url}/publico/mercado`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Dados) => { if (vivo) { setDados(d); setErro(false) } })
        .catch(() => { if (vivo) setErro(true) })
    }
    carregar()
    const t = window.setInterval(carregar, 60_000)
    const relogio = window.setInterval(() => setAgora(Date.now()), 30_000)
    const voltou = () => { if (!document.hidden) carregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => { vivo = false; window.clearInterval(t); window.clearInterval(relogio); document.removeEventListener('visibilitychange', voltou) }
  }, [])

  const noticias = useMemo(() => (dados?.noticias ?? []).filter((n) => filtro === 'tudo' || n.categoria === filtro), [dados, filtro])
  const presentes = useMemo(() => new Set((dados?.noticias ?? []).map((n) => n.categoria)), [dados])
  const destaque = noticias.find((n) => n.imagem) ?? noticias[0]
  const resto = noticias.filter((n) => n !== destaque)
  const lateral = resto.slice(0, 5)
  const grade = resto.slice(5, 29)
  const cot = dados?.cotacoes ?? []
  const painel = (id: string) => cot.find((c) => c.id === id)
  const relogio = new Date(agora)

  return (
    <div className="mc">
      {/* faixa de cotações: duplicada para correr sem emenda */}
      <div className="mc-faixa" aria-label="Cotações">
        {cot.length ? (
          <div className="mc-faixa-trilho">
            {[0, 1].map((k) => (
              <ul key={k} aria-hidden={k === 1}>
                {cot.map((c) => (
                  <li key={c.id}><span>{c.nome}</span><b>{preco(c)}</b><em className={c.variacao >= 0 ? 'sobe' : 'cai'}>{c.variacao >= 0 ? '▲' : '▼'} {variacao(c.variacao)}</em></li>
                ))}
              </ul>
            ))}
          </div>
        ) : <p className="mc-faixa-vazia">{erro ? 'Cotações indisponíveis agora.' : 'Carregando cotações…'}</p>}
      </div>

      <section className="mc-topo">
        {painel('dolar') ? <Painel c={painel('dolar')!} /> : <div className="mc-painel mc-esqueleto" />}
        {painel('ibovespa') ? <Painel c={painel('ibovespa')!} /> : <div className="mc-painel mc-esqueleto" />}
        <article className="mc-bolsas">
          <header><span>Bolsas agora</span><small>pelo horário local</small></header>
          <ul>
            {BOLSAS.map((b) => {
              const r = relogioDe(b.fuso, relogio)
              const aberta = !r.fimDeSemana && r.minutos >= b.abre && r.minutos < b.fecha
              return (
                <li key={b.sigla}>
                  <i className={aberta ? 'aberta' : ''} aria-hidden="true" />
                  <span><b>{b.nome}</b><small>{b.sigla}</small></span>
                  <time>{r.hora}</time>
                  <em className={aberta ? 'aberta' : ''}>{aberta ? 'Aberta' : 'Fechada'}</em>
                </li>
              )
            })}
          </ul>
        </article>
      </section>

      <p className="mc-aviso">
        Notícias e cotações para você acompanhar a economia. Os índices sintéticos que os robôs operam são gerados pela corretora e não se movem com notícias.
      </p>

      <nav className="mc-filtros" aria-label="Assuntos">
        {CATEGORIAS.filter((c) => c.id === 'tudo' || presentes.has(c.id)).map((c) => (
          <button key={c.id} type="button" className={filtro === c.id ? 'on' : ''} aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>{c.nome}</button>
        ))}
        {dados && <small>Atualizado às {hora(dados.atualizadoEm)}</small>}
      </nav>

      {!dados && !erro && <div className="mc-carregando">Buscando as notícias do dia…</div>}
      {erro && !dados && <div className="mc-carregando">Os portais não responderam agora. Tentamos de novo em 1 minuto.</div>}

      {destaque && (
        <section className="mc-principal">
          <a className="mc-destaque" href={destaque.link} target="_blank" rel="noopener noreferrer">
            <Capa n={destaque} grande />
            <div>
              <span className="mc-meta"><b>{destaque.fonte}</b> · {haQuanto(destaque.quando, agora)}</span>
              <h3>{destaque.titulo}</h3>
              {destaque.resumo && <p>{destaque.resumo}</p>}
              <span className="mc-ler">Ler no {destaque.fonte} ↗</span>
            </div>
          </a>
          <ol className="mc-lateral">
            {lateral.map((n) => (
              <li key={n.id}>
                <a href={n.link} target="_blank" rel="noopener noreferrer">
                  <span className="mc-meta"><b>{n.fonte}</b> · {haQuanto(n.quando, agora)}</span>
                  <strong>{n.titulo}</strong>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {grade.length > 0 && (
        <section className="mc-grade">
          {grade.map((n) => (
            <a key={n.id} className="mc-cartao" href={n.link} target="_blank" rel="noopener noreferrer">
              <Capa n={n} />
              <span className="mc-meta"><b>{n.fonte}</b> · {haQuanto(n.quando, agora)}</span>
              <strong>{n.titulo}</strong>
            </a>
          ))}
        </section>
      )}

      {dados && (
        <p className="mc-fontes">
          Fontes: {[...new Set(dados.noticias.map((n) => n.fonte))].join(', ')}. Câmbio pela AwesomeAPI; bolsas, ouro e petróleo pelo Yahoo Finance. As notícias abrem no site de origem.
        </p>
      )}
    </div>
  )
}
