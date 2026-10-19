import { useEffect, useMemo, useState } from 'react'
import { SERVIDOR } from '../core/teeds/config'
import './mercado.css'

/**
 * Notícias (19/10/2026): o radar do mercado, de fontes grátis e sem cadastro
 * (servidor/src/mercado.ts). Faixa de cotações, os indicadores do dia com o
 * desenho do pregão, o relógio dos centros financeiros e as notícias.
 *
 * As notícias abrem no site de origem (só manchete, resumo e foto aqui). O
 * Ibovespa grátis vem com o atraso que a B3 impõe; a tela mostra a hora de
 * cada preço. E fica dito, sem rodeio, que notícia não mexe nos índices
 * sintéticos que os robôs operam.
 */

type Categoria = 'bolsa' | 'cambio' | 'juros' | 'internacional' | 'cripto' | 'commodities' | 'economia'
interface Noticia { id: string; titulo: string; resumo: string; link: string; imagem: string | null; fonte: string; quando: string; categoria: Categoria }
interface Cotacao { id: string; nome: string; preco: number; variacao: number; moeda: string; hora: string; atrasada: boolean; serie?: number[] }
interface Dados { cotacoes: Cotacao[]; noticias: Noticia[]; portais?: Record<string, string>; atualizadoEm: string }

const CATEGORIAS: Array<{ id: Categoria | 'tudo'; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' }, { id: 'bolsa', nome: 'Bolsa' }, { id: 'cambio', nome: 'Câmbio' }, { id: 'juros', nome: 'Juros' },
  { id: 'internacional', nome: 'Internacional' }, { id: 'cripto', nome: 'Cripto' }, { id: 'commodities', nome: 'Commodities' }, { id: 'economia', nome: 'Economia' },
]
const NOME_DA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nome])) as Record<Categoria, string>

/**
 * Os centros financeiros, com o pregão da bolsa principal no fuso de cada um
 * (intervalo de almoço onde existe). Sem feriados: é pelo relógio.
 */
interface Centro { cidade: string; pais: string; bolsa: string; fuso: string; sessoes: Array<[number, number]> }
const h = (hh: number, mm = 0) => hh * 60 + mm
const CENTROS: Centro[] = [
  { cidade: 'Nova York', pais: 'EUA', bolsa: 'NYSE', fuso: 'America/New_York', sessoes: [[h(9, 30), h(16)]] },
  { cidade: 'São Paulo', pais: 'Brasil', bolsa: 'B3', fuso: 'America/Sao_Paulo', sessoes: [[h(10), h(17)]] },
  { cidade: 'Londres', pais: 'Reino Unido', bolsa: 'LSE', fuso: 'Europe/London', sessoes: [[h(8), h(16, 30)]] },
  { cidade: 'Frankfurt', pais: 'Alemanha', bolsa: 'Xetra', fuso: 'Europe/Berlin', sessoes: [[h(9), h(17, 30)]] },
  { cidade: 'Zurique', pais: 'Suíça', bolsa: 'SIX', fuso: 'Europe/Zurich', sessoes: [[h(9), h(17, 30)]] },
  { cidade: 'Dubai', pais: 'Emirados Árabes', bolsa: 'DFM', fuso: 'Asia/Dubai', sessoes: [[h(10), h(15)]] },
  { cidade: 'Singapura', pais: 'Singapura', bolsa: 'SGX', fuso: 'Asia/Singapore', sessoes: [[h(9), h(12)], [h(13), h(17)]] },
  { cidade: 'Hong Kong', pais: 'China', bolsa: 'HKEX', fuso: 'Asia/Hong_Kong', sessoes: [[h(9, 30), h(12)], [h(13), h(16)]] },
  { cidade: 'Mumbai', pais: 'Índia', bolsa: 'NSE', fuso: 'Asia/Kolkata', sessoes: [[h(9, 15), h(15, 30)]] },
  { cidade: 'Xangai', pais: 'China', bolsa: 'SSE', fuso: 'Asia/Shanghai', sessoes: [[h(9, 30), h(11, 30)], [h(13), h(15)]] },
  { cidade: 'Tóquio', pais: 'Japão', bolsa: 'TSE', fuso: 'Asia/Tokyo', sessoes: [[h(9), h(11, 30)], [h(12, 30), h(15, 30)]] },
  { cidade: 'Sydney', pais: 'Austrália', bolsa: 'ASX', fuso: 'Australia/Sydney', sessoes: [[h(10), h(16)]] },
]

function relogioDe(fuso: string, agora: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuso, hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(agora).map((x) => [x.type, x.value]))
  const hora = Number(p.hour) % 24, min = Number(p.minute), seg = Number(p.second)
  return { hora, min, seg, minutos: hora * 60 + min, texto: `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}`, fimDeSemana: p.weekday === 'Sat' || p.weekday === 'Sun', dia: p.weekday as string }
}

type Situacao = 'aberta' | 'intervalo' | 'fechada' | 'fim-de-semana'
function situacao(c: Centro, r: ReturnType<typeof relogioDe>): Situacao {
  // Dubai negocia de segunda a sexta desde 2022, como as outras.
  if (r.fimDeSemana) return 'fim-de-semana'
  if (c.sessoes.some(([a, f]) => r.minutos >= a && r.minutos < f)) return 'aberta'
  const inicio = c.sessoes[0][0], fim = c.sessoes[c.sessoes.length - 1][1]
  return r.minutos >= inicio && r.minutos < fim ? 'intervalo' : 'fechada'
}
const ROTULO: Record<Situacao, string> = { aberta: 'Aberta', intervalo: 'Intervalo', fechada: 'Fechada', 'fim-de-semana': 'Fim de semana' }

function Relogio({ hora, min, seg }: { hora: number; min: number; seg: number }) {
  const a = (graus: number) => `rotate(${graus} 20 20)`
  return (
    <svg className="mc-relogio" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1="20" y1="3.6" x2="20" y2={i % 3 === 0 ? 7 : 5.4} transform={a(i * 30)} />)}
      <line className="ponteiro-h" x1="20" y1="20" x2="20" y2="10.5" transform={a((hora % 12) * 30 + min * 0.5)} />
      <line className="ponteiro-m" x1="20" y1="20" x2="20" y2="6.5" transform={a(min * 6 + seg * 0.1)} />
      <circle className="eixo" cx="20" cy="20" r="1.6" />
    </svg>
  )
}

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
function preco(c: Cotacao) {
  if (c.moeda === 'pts') return num(c.preco, 0)
  if (c.id === 'bitcoin') return `${c.moeda} ${num(c.preco, 0)}`
  return `${c.moeda} ${num(c.preco, c.moeda === 'R$' ? 3 : 2)}`
}
const variacao = (v: number) => `${v >= 0 ? '+' : ''}${num(v)}%`
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
function haQuanto(iso: string, agora: number) {
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const hh = Math.round(min / 60)
  return hh < 24 ? `há ${hh} h` : 'ontem'
}

function Grafico({ serie, sobe }: { serie: number[]; sobe: boolean }) {
  const min = Math.min(...serie), max = Math.max(...serie), faixa = max - min || 1
  const pontos = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${34 - ((v - min) / faixa) * 30}`).join(' ')
  return (
    <svg className={`mc-grafico ${sobe ? 'sobe' : 'cai'}`} viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,38 ${pontos} 100,38`} />
      <polyline points={pontos} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Indicador({ c }: { c?: Cotacao }) {
  if (!c) return <div className="mc-ind mc-esqueleto" />
  const sobe = c.variacao >= 0
  return (
    <article className="mc-ind">
      <header><span>{c.nome}</span><em className={sobe ? 'sobe' : 'cai'}>{sobe ? '▲' : '▼'} {variacao(c.variacao)}</em></header>
      <b>{preco(c)}</b>
      {c.serie && c.serie.length > 2 ? <Grafico serie={c.serie} sobe={sobe} /> : <div className="mc-grafico vazio" />}
      <small>Às {horaDe(c.hora)}</small>
    </article>
  )
}

/** "Investing.com" → IN, "Money Times" → MT. */
const sigla = (fonte: string) => {
  const partes = fonte.replace(/\.com$/i, '').split(/[\s-]+/).filter(Boolean)
  return (partes.length > 1 ? partes.map((p) => p[0]).join('') : partes[0]?.slice(0, 2) ?? '').slice(0, 2).toUpperCase()
}

/** O ícone oficial de cada portal, para a capa de notícia sem foto nenhuma. */
let ICONES: Record<string, string> = {}

function Capa({ n, className }: { n: Noticia; className?: string }) {
  const [falhou, setFalhou] = useState(false)
  const [iconeFalhou, setIconeFalhou] = useState(false)
  if (!n.imagem || falhou) {
    const icone = !iconeFalhou ? ICONES[n.fonte] : undefined
    return (
      <span className={`mc-capa vazia ${className ?? ''}`} aria-hidden="true">
        {icone
          ? <img src={icone} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconeFalhou(true)} />
          : <i className="mc-sigla">{sigla(n.fonte)}</i>}
        <b>{n.fonte}</b>
        <small>{NOME_DA_CATEGORIA[n.categoria]}</small>
      </span>
    )
  }
  return <img className={`mc-capa ${className ?? ''}`} src={n.imagem} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
}

/** O relógio dos centros financeiros bate o próprio segundo: o resto da página não redesenha junto. */
function CentrosFinanceiros() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setAgora(new Date()), 1000); return () => window.clearInterval(t) }, [])
  return (
    <section className="mc-mundo" aria-labelledby="mc-mundo-titulo">
        <header className="mc-secao">
          <h3 id="mc-mundo-titulo">Centros financeiros</h3>
          <span>Hora local e situação da bolsa principal, pelo horário de pregão</span>
        </header>
        <ul className="mc-centros">
          {CENTROS.map((c) => {
            const r = relogioDe(c.fuso, agora)
            const s = situacao(c, r)
            const noite = r.hora < 6 || r.hora >= 18
            return (
              <li key={c.cidade} className={s}>
                <Relogio hora={r.hora} min={r.min} seg={r.seg} />
                <div className="mc-centro-texto">
                  <b>{c.cidade}</b>
                  <span>{c.bolsa} · {c.pais}</span>
                </div>
                <div className="mc-centro-hora">
                  <time>{r.texto}</time>
                  <em className={s}>{ROTULO[s]}</em>
                </div>
                <i className={`mc-ceu ${noite ? 'noite' : 'dia'}`} title={noite ? 'Noite' : 'Dia'} aria-hidden="true" />
              </li>
            )
          })}
        </ul>
      </section>
  )
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
    // A primeira resposta pode chegar antes das fotos buscadas por trás: uma segunda leitura em 20 s.
    const segunda = window.setTimeout(carregar, 20_000)
    const t = window.setInterval(carregar, 60_000)
    const relogio = window.setInterval(() => setAgora(Date.now()), 30_000)
    const voltou = () => { if (!document.hidden) carregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => { vivo = false; window.clearTimeout(segunda); window.clearInterval(t); window.clearInterval(relogio); document.removeEventListener('visibilitychange', voltou) }
  }, [])

  ICONES = dados?.portais ?? ICONES
  const todas = dados?.noticias ?? []
  const noticias = useMemo(() => todas.filter((n) => filtro === 'tudo' || n.categoria === filtro), [todas, filtro])
  const presentes = useMemo(() => new Set(todas.map((n) => n.categoria)), [todas])
  const destaque = noticias.find((n) => n.imagem) ?? noticias[0]
  const resto = noticias.filter((n) => n !== destaque)
  const ultimas = resto.slice(0, 6)
  const grade = resto.slice(6, 30)
  const cot = dados?.cotacoes ?? []
  const achar = (id: string) => cot.find((c) => c.id === id)
  const relogio = new Date(agora)
  const hoje = relogio.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="mc">
      <header className="mc-cabeca">
        <div>
          <span className="mc-sobre"><i className="mc-pulso" aria-hidden="true" />Mercado agora</span>
          <h2>Cotações, bolsas e as notícias que movem a economia</h2>
        </div>
        <p><b>{hoje.charAt(0).toUpperCase() + hoje.slice(1)}</b>{dados && <> · atualizado às {horaDe(dados.atualizadoEm)}</>}</p>
      </header>

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

      <section className="mc-indicadores" aria-label="Indicadores do dia">
        {['dolar', 'ibovespa', 'sp500', 'bitcoin'].map((id) => <Indicador key={id} c={achar(id)} />)}
      </section>

      <CentrosFinanceiros />

      <p className="mc-aviso">
        Notícias e cotações para você acompanhar a economia. Os índices sintéticos que os robôs operam são gerados pela corretora e não se movem com notícias.
      </p>

      <section className="mc-noticias" aria-labelledby="mc-noticias-titulo">
        <header className="mc-secao">
          <h3 id="mc-noticias-titulo">Notícias</h3>
          <nav className="mc-filtros" aria-label="Assuntos">
            {CATEGORIAS.filter((c) => c.id === 'tudo' || presentes.has(c.id)).map((c) => (
              <button key={c.id} type="button" className={filtro === c.id ? 'on' : ''} aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>{c.nome}</button>
            ))}
          </nav>
        </header>

        {!dados && !erro && <div className="mc-carregando">Buscando as notícias do dia…</div>}
        {erro && !dados && <div className="mc-carregando">Os portais não responderam agora. Tentamos de novo em 1 minuto.</div>}

        {destaque && (
          <div className="mc-principal">
            <a className="mc-destaque" href={destaque.link} target="_blank" rel="noopener noreferrer">
              <Capa n={destaque} className="grande" />
              <div className="mc-destaque-texto">
                <span className="mc-tag">{NOME_DA_CATEGORIA[destaque.categoria]}</span>
                <h4>{destaque.titulo}</h4>
                {destaque.resumo && <p>{destaque.resumo}</p>}
                <span className="mc-meta"><b>{destaque.fonte}</b> · {haQuanto(destaque.quando, agora)} <i>Ler no {destaque.fonte} ↗</i></span>
              </div>
            </a>
            <aside className="mc-ultimas" aria-label="Últimas">
              <h5>Últimas</h5>
              <ol>
                {ultimas.map((n) => (
                  <li key={n.id}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer">
                      <span className="mc-meta"><b>{n.fonte}</b> · {haQuanto(n.quando, agora)}</span>
                      <strong>{n.titulo}</strong>
                    </a>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        )}

        {grade.length > 0 && (
          <div className="mc-grade">
            {grade.map((n) => (
              <a key={n.id} className="mc-cartao" href={n.link} target="_blank" rel="noopener noreferrer">
                <span className="mc-cartao-capa"><Capa n={n} /><span className="mc-tag">{NOME_DA_CATEGORIA[n.categoria]}</span></span>
                <span className="mc-meta"><b>{n.fonte}</b> · {haQuanto(n.quando, agora)}</span>
                <strong>{n.titulo}</strong>
              </a>
            ))}
          </div>
        )}
      </section>

      {dados && (
        <p className="mc-fontes">
          Fontes: {[...new Set(todas.map((n) => n.fonte))].join(', ')}. Câmbio pela AwesomeAPI e Yahoo Finance; bolsas, ouro e petróleo pelo Yahoo Finance. As notícias abrem no site de origem.
        </p>
      )}
    </div>
  )
}
