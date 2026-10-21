import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarPerguntas, CATEGORIAS, PERGUNTAS, type Pergunta } from '../../core/teeds/faq'
import { abrirSuporte } from '../../core/teeds/suporte'
import { TEMA_DA_CATEGORIA } from '../../core/teeds/triagem'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import './ajuda.css'

/**
 * Central de ajuda (FAQ, 20/10/2026): busca que entende acento e erro de
 * digitação, categorias, respostas que abrem no lugar, um atalho para a
 * tela certa e, no fim de cada resposta, "isso ajudou?". Não ajudou: o chat
 * do suporte abre já sabendo de qual pergunta a pessoa veio.
 */

interface Props { aoIr: (tela: string) => void; suporte?: boolean }

const CHAVE_VOTOS = `${MARCA.id}.ajuda.votos`
const votosGuardados = (): Record<string, 'sim' | 'nao'> => { try { return JSON.parse(localStorage.getItem(CHAVE_VOTOS) || '{}') } catch { return {} } }
const POPULARES = ['por-onde-comecar', 'conectar-deriv', 'como-sacar', 'fechar-tela', 'meta-limite']
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

function Resposta({ p, aoIr, suporte }: { p: Pergunta; aoIr: (t: string) => void; suporte: boolean }) {
  const [voto, setVoto] = useState(() => votosGuardados()[p.id])
  const votar = (v: 'sim' | 'nao') => {
    setVoto(v)
    try { localStorage.setItem(CHAVE_VOTOS, JSON.stringify({ ...votosGuardados(), [p.id]: v })) } catch { /* só agora */ }
    if (v === 'nao' && suporte) abrirSuporte({ tema: TEMA_DA_CATEGORIA[p.categoria] ?? 'outro', resposta: p.pergunta, faq: p.id })
  }
  const blocos: Array<string | string[]> = []
  for (const r of p.resposta) {
    if (r.startsWith('• ')) { const ult = blocos[blocos.length - 1]; if (Array.isArray(ult)) ult.push(r.slice(2)); else blocos.push([r.slice(2)]) }
    else blocos.push(r)
  }
  return (
    <div className="aj-resposta">
      {blocos.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((x) => <li key={x}>{x}</li>)}</ul> : <p key={i}>{b}</p>))}
      <div className="aj-resposta-fim">
        {p.ir && <button type="button" className="aj-ir" onClick={() => aoIr(p.ir!.tela)}>{p.ir.rotulo}<Ic d="M9 6l6 6-6 6" /></button>}
        <div className="aj-voto" role="group" aria-label="Esta resposta ajudou?">
          {voto ? <span className={voto}>{voto === 'sim' ? 'Que bom! Obrigado.' : suporte ? 'Abrimos o chat para você.' : 'Obrigado pelo aviso.'}</span> : (
            <><span>Ajudou?</span><button type="button" onClick={() => votar('sim')}>Sim</button><button type="button" onClick={() => votar('nao')}>Não</button></>
          )}
        </div>
      </div>
    </div>
  )
}

export function AjudaPagina({ aoIr, suporte = !!MARCA.suporte }: Props) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(location.hash.startsWith('#faq-') ? [location.hash.slice(5)] : []))
  const campo = useRef<HTMLInputElement>(null)

  // link direto para uma pergunta (#faq-id)
  useEffect(() => {
    const id = location.hash.startsWith('#faq-') ? location.hash.slice(5) : null
    if (id) window.setTimeout(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
  }, [])

  const achados = useMemo(() => (busca.trim() ? buscarPerguntas(busca, 12).map((a) => a.p) : null), [busca])
  const lista = achados ?? PERGUNTAS.filter((p) => !categoria || p.categoria === categoria)
  const grupos = achados ? [{ c: null, ps: achados }] : CATEGORIAS.filter((c) => !categoria || c.id === categoria).map((c) => ({ c, ps: lista.filter((p) => p.categoria === c.id) })).filter((g) => g.ps.length)

  const alternar = (id: string) => setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // a busca abre a melhor resposta sozinha
  useEffect(() => { if (achados?.[0]) setAbertas(new Set([achados[0].id])) }, [achados?.[0]?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const item = (p: Pergunta) => {
    const aberta = abertas.has(p.id)
    return (
      <article key={p.id} id={`faq-${p.id}`} className={`aj-item ${aberta ? 'aberta' : ''}`}>
        <h3><button type="button" onClick={() => alternar(p.id)} aria-expanded={aberta} aria-controls={`faq-r-${p.id}`}>
          <span>{p.pergunta}</span><i aria-hidden="true" />
        </button></h3>
        {aberta && <div id={`faq-r-${p.id}`}><Resposta p={p} aoIr={aoIr} suporte={suporte} /></div>}
      </article>
    )
  }

  return (
    <div className="aj">
      <header className="aj-topo">
        <Monograma variante="marca-dagua" tamanho={300} className="aj-topo-marca" />
        <span className="aj-sobre"><Monograma tamanho={20} />Central de ajuda</span>
        <h1>Como podemos ajudar?</h1>
        <p>As respostas para as dúvidas mais comuns sobre a {MARCA.prosa}.</p>
        <label className="aj-busca">
          <Ic d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
          <input ref={campo} id="aj-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: como faço um saque?" enterKeyHint="search" autoComplete="off" />
          {busca && <button type="button" onClick={() => { setBusca(''); campo.current?.focus() }} aria-label="Limpar a busca"><Ic d="M6 6l12 12M18 6L6 18" /></button>}
        </label>
        {!busca && (
          <div className="aj-populares">
            <span>Mais procuradas:</span>
            {POPULARES.map((id) => PERGUNTAS.find((p) => p.id === id)).filter((p): p is Pergunta => !!p).map((p) => (
              <button type="button" key={p.id} onClick={() => { setCategoria(null); setAbertas(new Set([p.id])); window.setTimeout(() => document.getElementById(`faq-${p.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60) }}>{p.pergunta}</button>
            ))}
          </div>
        )}
      </header>

      {!busca && (
        <nav className="aj-categorias" aria-label="Categorias">
          {CATEGORIAS.map((c) => (
            <button type="button" key={c.id} className={categoria === c.id ? 'on' : ''} onClick={() => setCategoria((a) => (a === c.id ? null : c.id))} aria-pressed={categoria === c.id}>
              <Ic d={c.icone} /><b>{c.nome}</b><small>{PERGUNTAS.filter((p) => p.categoria === c.id).length} respostas</small>
            </button>
          ))}
        </nav>
      )}

      <div className="aj-lista" aria-live="polite">
        {categoria && !busca && <button type="button" className="aj-todas" onClick={() => setCategoria(null)}>Ver todas as {PERGUNTAS.length} respostas</button>}
        {achados && <p className="aj-contagem">{achados.length ? `${achados.length} resposta${achados.length === 1 ? '' : 's'} para "${busca.trim()}"` : `Nada encontrado para "${busca.trim()}".`}</p>}
        {grupos.map((g) => (
          <section key={g.c?.id ?? 'busca'} className="aj-grupo">
            {g.c && <h2><Ic d={g.c.icone} />{g.c.nome}</h2>}
            {g.ps.map(item)}
          </section>
        ))}
      </div>

      {suporte && (
        <section className="aj-falar">
          <Monograma variante="marca-dagua" tamanho={160} className="aj-falar-marca" />
          <span className="aj-falar-avatar"><Monograma tamanho={30} /></span>
          <div>
            <b>{achados && !achados.length ? 'Não achou? A gente responde.' : 'Ainda com dúvida?'}</b>
            <p>Fale com a equipe {MARCA.prosa} pelo chat. A resposta chega aqui mesmo, na plataforma.</p>
          </div>
          <button type="button" onClick={() => abrirSuporte(busca.trim() ? { mensagem: busca.trim() } : {})}>Falar com o suporte</button>
        </section>
      )}
    </div>
  )
}
