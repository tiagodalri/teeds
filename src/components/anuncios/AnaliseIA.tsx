/**
 * A leitura da I.A. no topo da Visão geral (04/11/2026, Tiago: "um panorama interpretado pela I.A., bem
 * objetivo, para entender o cenário logo que a gente bate o olho; embaixo, um plano de ação; e um botão
 * Otimizar campanhas: um modal com todas as alterações e o porquê, aprovo, confirmo, e aí aplica no Gerenciador").
 *
 * Três passos antes de qualquer coisa mudar na Meta: a lista (desmarca o que não quer), a confirmação
 * (o resumo do que vai acontecer) e o resultado (o que a Meta respondeu, mudança a mudança).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { ErroSemIA, type Analise, type ApiAnalise, type Mudanca, type ResultadoDaMudanca } from '../../core/teeds/analise'
import { int } from './Indicadores'
import './analise.css'

const hora = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const TIPO: Record<Mudanca['tipo'], string> = { orcamento: 'Orçamento', pausar: 'Pausar', ligar: 'Ligar', duplicar: 'Duplicar', novo_publico: 'Público novo' }
const ALVO: Record<Mudanca['alvoTipo'], string> = { campanha: 'campanha', conjunto: 'conjunto', anuncio: 'anúncio' }
const IMPACTO = { alto: 'Impacto alto', medio: 'Impacto médio', baixo: 'Impacto baixo' }
const QUANDO = { agora: 'Agora', 'esta-semana': 'Esta semana', 'depois-da-live': 'Depois da live' }
const ONDE: Record<string, string> = { instagram_reels: 'Reels do Instagram', instagram_stories: 'Stories do Instagram', instagram_feed: 'Feed do Instagram', facebook_feed: 'Feed do Facebook', facebook_reels: 'Reels do Facebook' }

/** O que a mudança faz, em uma linha. */
function oQueMuda(m: Mudanca, moeda: (v: number) => string): string {
  if (m.tipo === 'orcamento') return `${moeda(m.diarioDe)} → ${moeda(m.diarioPara)} por dia`
  if (m.tipo === 'pausar') return m.alvoTipo === 'conjunto' && m.diarioDe ? `Pausar (libera ${moeda(m.diarioDe)} por dia)` : 'Pausar'
  if (m.tipo === 'ligar') return m.alvoTipo === 'conjunto' && m.diarioDe ? `Ligar (${moeda(m.diarioDe)} por dia)` : 'Ligar'
  const base = `Conjunto novo "GF | ${m.nome || m.alvoNome.replace(/^GF \| /, '')}" com ${moeda(m.diarioPara)} por dia, ${m.ligar ? 'já ligado' : 'pausado'}`
  if (m.tipo === 'duplicar') return `${base}, igual ao original`
  const p = m.publico
  const partes = [`${p.idadeMin}–${p.idadeMax} anos`, p.genero === 'todos' ? 'todos' : p.genero, p.estados.length ? p.estados.join(', ') : 'Brasil', p.ondeAparece.length ? p.ondeAparece.map((x) => ONDE[x] ?? x).join(', ') : 'onde a Meta quiser']
  return `${base}, público: ${partes.join(' · ')}`
}
/** Quanto a mudança soma (ou tira) do orçamento por dia da conta. */
const deltaDia = (m: Mudanca) => (m.tipo === 'orcamento' ? m.diarioPara - m.diarioDe : m.tipo === 'duplicar' || m.tipo === 'novo_publico' ? (m.ligar ? m.diarioPara : 0) : m.alvoTipo === 'conjunto' ? (m.tipo === 'pausar' ? -m.diarioDe : m.diarioDe) : 0)

export function AnaliseIA({ sessao, api, parceiro, de, ate, nomeDoPeriodo, contaNome, totalDiaAtual, moeda, pronta, recarregar }: {
  sessao: SessaoTeeds; api: ApiAnalise; parceiro: string; de: string; ate: string; nomeDoPeriodo: string; contaNome: string
  /** a soma dos orçamentos por dia ligados hoje (para mostrar o antes → depois) */
  totalDiaAtual: number; moeda: (v: number) => string
  /** os números da Meta já estão na tela (sem chave, a I.A. não tem o que ler) */
  pronta: boolean; recarregar: () => void
}) {
  const [estado, setEstado] = useState<{ temIA: boolean; analise: Analise | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [semIA, setSemIA] = useState<string | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [modal, setModal] = useState<'' | 'lista' | 'confirmar' | 'aplicando' | 'feito'>('')
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [resultado, setResultado] = useState<ResultadoDaMudanca[]>([])
  const [erroAplicar, setErroAplicar] = useState<string | null>(null)
  const vivo = useRef(0)

  // a última análise do período; enquanto estiver "analisando", pergunta de novo a cada 3 s
  useEffect(() => {
    const minha = ++vivo.current
    setEstado(null); setErro(null); setModal('')
    if (!pronta) return
    let t: ReturnType<typeof setTimeout> | undefined
    const ler = async () => {
      try {
        const e = await api.ultima(sessao, parceiro, de, ate)
        if (vivo.current !== minha) return
        setEstado(e)
        if (!e.temIA && !e.analise) setSemIA('O servidor ainda não tem a chave.')
        if (e.analise?.situacao === 'analisando' && Date.now() - Date.parse(e.analise.criadoEm) < 6 * 60e3) t = setTimeout(ler, 3000)
        else if (e.analise?.situacao === 'analisando') setErro('A análise demorou demais. Tente de novo.')
      } catch (x) { if (vivo.current === minha) setErro((x as Error).message) }
    }
    void ler()
    return () => { if (t) clearTimeout(t) }
  }, [parceiro, de, ate, pronta, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = async (forcar: boolean) => {
    setPedindo(true); setErro(null); setSemIA(null)
    const minha = vivo.current
    try {
      let e = await api.analisar(sessao, parceiro, de, ate, forcar)
      if (vivo.current !== minha) return
      setEstado(e)
      const inicio = Date.now()
      while (e.analise?.situacao === 'analisando' && Date.now() - inicio < 6 * 60e3) {
        await new Promise((r) => setTimeout(r, 3000))
        if (vivo.current !== minha) return
        e = await api.ultima(sessao, parceiro, de, ate)
        setEstado(e)
      }
      if (e.analise?.situacao === 'analisando') setErro('A análise demorou demais. Tente de novo.')
    } catch (x) {
      if (vivo.current !== minha) return
      if (x instanceof ErroSemIA) setSemIA(x.message); else setErro((x as Error).message)
    } finally { if (vivo.current === minha) setPedindo(false) }
  }

  const analise = estado?.analise ?? null
  const dados = analise?.dados ?? null
  const mudancas = useMemo(() => dados?.mudancas ?? [], [dados])
  const feitas = useMemo(() => new Set((analise?.resultado ?? []).filter((r) => r.ok).map((r) => r.id)), [analise])
  const pendentes = useMemo(() => mudancas.filter((m) => !feitas.has(m.id)), [mudancas, feitas])
  const abrir = () => { setEscolhidas(new Set(pendentes.map((m) => m.id))); setErroAplicar(null); setModal('lista') }
  const escolhidasLista = pendentes.filter((m) => escolhidas.has(m.id))
  const delta = escolhidasLista.reduce((s, m) => s + deltaDia(m), 0)
  const aplicar = useCallback(async () => {
    if (!analise) return
    setModal('aplicando'); setErroAplicar(null)
    try {
      const r = await api.aplicar(sessao, parceiro, analise.id, [...escolhidas])
      setResultado(r.resultado)
      setEstado((e) => (e?.analise ? { ...e, analise: { ...e.analise, situacao: r.situacao, resultado: r.resultado, aplicadoEm: new Date().toISOString() } } : e))
      setModal('feito')
    } catch (x) { setErroAplicar((x as Error).message); setModal('confirmar') }
  }, [analise, api, sessao, parceiro, escolhidas])
  const fecharFeito = () => { setModal(''); recarregar() }

  useEffect(() => {
    if (!modal) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && modal !== 'aplicando') setModal('') }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [modal])

  if (!pronta) return null
  const analisando = analise?.situacao === 'analisando' || pedindo
  const aplicada = analise?.situacao === 'aplicada'

  return (
    <section className="aa-cartao ia-cartao" aria-busy={analisando}>
      <header>
        <div><span className="rot">Leitura da I.A. · {nomeDoPeriodo}</span><h3>O que a I.A. vê nos anúncios</h3></div>
        {analise && dados && !analisando && (
          <div className="ia-quando">
            <small>Analisada às {hora(analise.prontaEm ?? analise.criadoEm)}{analise.quem ? ` por ${analise.quem}` : ''}</small>
            <button type="button" className="aa-atualizar" onClick={() => void analisar(true)}>Analisar de novo</button>
          </div>
        )}
      </header>

      {semIA && (
        <div className="ia-sem">
          <b>Falta a chave da I.A. no servidor.</b>
          <p>No Supabase, em <b>Edge Functions › Secrets</b>, crie o segredo <code>ANTHROPIC_API_KEY</code> com uma chave da Anthropic (console.anthropic.com › API keys). Depois, volte aqui e toque em Analisar. A chave fica só no servidor.</p>
          <small>{semIA}</small>
        </div>
      )}
      {erro && <p className="aa-erro">{erro}</p>}

      {!estado && !erro && !semIA && <p className="aa-vazio">Procurando a última leitura…</p>}

      {estado && !analise && !analisando && !semIA && (
        <div className="ia-vazio">
          <p>A I.A. lê os números da Meta e da plataforma neste período, explica o que está acontecendo em cada campanha e conjunto, e monta um plano de ação. As mudanças só acontecem no Gerenciador depois que você aprova e confirma.</p>
          <button type="button" className="ia-principal" onClick={() => void analisar(false)}>Analisar com a I.A.</button>
        </div>
      )}

      {analisando && (
        <div className="ia-lendo"><i aria-hidden="true" /><span>A I.A. está lendo os números do período: campanhas, conjuntos, anúncios, público e a jornada de quem se cadastrou. Costuma levar cerca de um minuto.</span></div>
      )}

      {analise?.situacao === 'erro' && !analisando && (
        <div className="ia-vazio">
          <p className="aa-erro">A análise não terminou: {analise.erro}</p>
          <button type="button" className="aa-atualizar" onClick={() => void analisar(true)}>Tentar de novo</button>
        </div>
      )}

      {dados && !analisando && (
        <>
          <p className="ia-resumo">{dados.resumo}</p>
          {dados.panorama.length > 0 && (
            <ul className="ia-panorama">
              {dados.panorama.map((p, i) => <li key={i} className={p.tipo}><i aria-hidden="true" /><div><b>{p.titulo}</b><span>{p.texto}</span></div></li>)}
            </ul>
          )}
          {dados.plano.length > 0 && (
            <div className="ia-plano">
              <h4>Plano de ação</h4>
              <ol>
                {dados.plano.map((p, i) => (
                  <li key={i}>
                    <div className="ia-plano-topo"><b>{p.titulo}</b><em className={`ia-impacto ${p.impacto}`}>{IMPACTO[p.impacto]}</em><small>{QUANDO[p.quando]}</small></div>
                    <span>{p.porque}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {dados.alerta && <p className="ia-alerta"><b>Antes de aprovar:</b> {dados.alerta}</p>}
          <div className="ia-rodape">
            {aplicada ? (
              <>
                <span className="ia-feito-aviso"><i aria-hidden="true" />Mudanças aplicadas{analise?.aplicadoEm ? ` às ${hora(analise.aplicadoEm)}` : ''}. Os números novos chegam com o tempo: analise de novo mais tarde.</span>
                <button type="button" className="aa-atualizar" onClick={() => { setResultado(analise?.resultado ?? []); setModal('feito') }}>Ver o que foi feito</button>
              </>
            ) : pendentes.length ? (
              <>
                <span>{pendentes.length === 1 ? 'A I.A. propõe 1 mudança nas campanhas.' : `A I.A. propõe ${pendentes.length} mudanças nas campanhas.`} Nada muda até você aprovar e confirmar.</span>
                <button type="button" className="ia-principal" onClick={abrir}>Otimizar campanhas</button>
              </>
            ) : <span>A I.A. não vê mudança para fazer agora nas campanhas: o plano acima é o que importa.</span>}
          </div>
        </>
      )}

      {modal && analise && (
        <div className="aa-gaveta-fundo ia-fundo" onMouseDown={() => { if (modal !== 'aplicando') setModal('') }}>
          <section className="ia-modal" role="dialog" aria-modal="true" aria-labelledby="ia-modal-titulo" onMouseDown={(e) => e.stopPropagation()}>
            {modal === 'lista' && (
              <>
                <header>
                  <div><span className="rot">Passo 1 de 2</span><h3 id="ia-modal-titulo">O que a I.A. quer mudar</h3><small>Desmarque o que não quiser. Nada muda até você confirmar no próximo passo.</small></div>
                  <button type="button" className="ia-fechar" onClick={() => setModal('')} aria-label="Fechar">×</button>
                </header>
                <ul className="ia-mudancas">
                  {pendentes.map((m) => (
                    <li key={m.id} className={escolhidas.has(m.id) ? 'on' : ''}>
                      <label>
                        <input type="checkbox" checked={escolhidas.has(m.id)} onChange={(e) => setEscolhidas((s) => { const n = new Set(s); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n })} />
                        <div>
                          <div className="ia-m-topo"><em className={`ia-tipo ${m.tipo}`}>{TIPO[m.tipo]}</em><b>{m.alvoNome}</b><small>{ALVO[m.alvoTipo]}</small><em className={`ia-risco ${m.risco}`}>risco {m.risco}</em></div>
                          <strong>{oQueMuda(m, moeda)}</strong>
                          <span>{m.porque}</span>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
                <footer>
                  <div className="ia-total"><small>Orçamento por dia da conta</small><b>{moeda(totalDiaAtual)} → {moeda(Math.max(0, totalDiaAtual + delta))}</b></div>
                  <div className="ia-botoes">
                    <button type="button" className="aa-atualizar" onClick={() => setModal('')}>Agora não</button>
                    <button type="button" className="ia-principal" disabled={!escolhidasLista.length} onClick={() => setModal('confirmar')}>{escolhidasLista.length === 1 ? 'Aprovar 1 mudança' : `Aprovar ${int(escolhidasLista.length)} mudanças`}</button>
                  </div>
                </footer>
              </>
            )}
            {(modal === 'confirmar' || modal === 'aplicando') && (
              <>
                <header>
                  <div><span className="rot">Passo 2 de 2</span><h3 id="ia-modal-titulo">Confirme as mudanças</h3><small>Ao confirmar, a plataforma faz isto na conta <b>{contaNome}</b> agora, com a chave da conta de anúncios. Tudo fica no histórico do Estúdio.</small></div>
                  {modal === 'confirmar' && <button type="button" className="ia-fechar" onClick={() => setModal('')} aria-label="Fechar">×</button>}
                </header>
                <ol className="ia-resumo-lista">
                  {escolhidasLista.map((m) => (
                    <li key={m.id}>
                      <em className={`ia-tipo ${m.tipo}`}>{TIPO[m.tipo]}</em>
                      <div><b>{m.alvoNome}</b><span>{oQueMuda(m, moeda)}</span></div>
                      {modal === 'aplicando' && <i className="ia-girando" aria-label="Aplicando" />}
                    </li>
                  ))}
                </ol>
                {erroAplicar && <p className="aa-erro">{erroAplicar}</p>}
                <footer>
                  <div className="ia-total"><small>Orçamento por dia da conta</small><b>{moeda(totalDiaAtual)} → {moeda(Math.max(0, totalDiaAtual + delta))}</b></div>
                  <div className="ia-botoes">
                    <button type="button" className="aa-atualizar" disabled={modal === 'aplicando'} onClick={() => setModal('lista')}>Voltar</button>
                    <button type="button" className="ia-principal" disabled={modal === 'aplicando'} onClick={() => void aplicar()}>{modal === 'aplicando' ? 'Aplicando na Meta…' : 'Confirmar e aplicar'}</button>
                  </div>
                </footer>
              </>
            )}
            {modal === 'feito' && (
              <>
                <header>
                  <div><span className="rot">Feito</span><h3 id="ia-modal-titulo">{resultado.every((r) => r.ok) ? 'Mudanças aplicadas no Gerenciador' : resultado.some((r) => r.ok) ? 'Parte das mudanças foi aplicada' : 'A Meta não aceitou as mudanças'}</h3><small>O que a Meta respondeu, uma a uma. Ao fechar, o painel relê os números.</small></div>
                  <button type="button" className="ia-fechar" onClick={fecharFeito} aria-label="Fechar">×</button>
                </header>
                <ol className="ia-resumo-lista">
                  {resultado.map((r) => {
                    const m = mudancas.find((x) => x.id === r.id)
                    return (
                      <li key={r.id} className={r.ok ? 'ok' : 'falhou'}>
                        <i aria-hidden="true">{r.ok ? '✓' : '✗'}</i>
                        <div><b>{m ? (m.tipo === 'duplicar' || m.tipo === 'novo_publico' ? `GF | ${m.nome || m.alvoNome.replace(/^GF \| /, '')}` : m.alvoNome) : r.id}</b><span>{r.mensagem}</span></div>
                      </li>
                    )
                  })}
                </ol>
                <footer>
                  <div className="ia-botoes"><button type="button" className="ia-principal" onClick={fecharFeito}>Fechar</button></div>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
