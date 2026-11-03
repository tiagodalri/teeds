/**
 * Montar o público (03/11/2026, Tiago: "está bem cru... cadê os interesses que a Meta fornece, o
 * aparelho, iOS, Android, iPhone 15, 16, 17, veicular no Insta ou no Face... quero uma central de
 * inteligência, com o poder do Gerenciador e a nossa cara").
 *
 * O passo "Para quem" do Estúdio. No topo, o tamanho estimado do público (ao vivo, com a chave), o
 * resumo em uma frase, os públicos salvos e "o que já funciona": a leitura dos cadastros de verdade
 * (idade, estado, lugar, aparelho) que preenche o público num clique. Embaixo, três jeitos de
 * montar (Advantage+, Eu escolho, Do pixel) e os blocos: onde estão, idade e gênero, interesses e
 * exclusões, aparelho, onde aparece, idioma e quem fica de fora.
 * Sem a chave, as buscas usam as listas da GF (estados, cidades, sugestões e modelos) e o número de
 * cada item é procurado na Meta na hora de criar.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import type { ApiEstudio, PublicoSalvo, ResultadoDaBusca, TipoDeBusca } from '../../../core/teeds/estudio'
import {
  ATALHOS_DE_MODELO, CIDADES_GRANDES, ESTADOS, FACEBOOK, INSTAGRAM, MODELOS, SUGESTOES, problemasDoPublico, publicoCompleto, resumoDoPublico, tamanhoLegivel,
  type Interesse, type Local, type Publico,
} from '../../../core/teeds/publicos'
import { LogoInstagram } from '../../comunidade/EscolherComunidade'
import { Icone } from './pecas'
import './publico.css'

/** O que os cadastros de verdade dizem (vem do painel, pelas quebras da Meta com cadastro). */
export interface Aprendizado {
  frases: string[]
  aplicar: Partial<Publico>
}

const LogoFacebook = ({ tam = 18 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#1877F2" /><path fill="#fff" d="M18.2 31v-10.4h3.5l.5-4.1h-4V14c0-1.2.3-2 2-2h2.1V8.4a28 28 0 00-3.1-.2c-3.1 0-5.2 1.9-5.2 5.3v3h-3.5v4.1H14V31z" /></svg>
)

function Bloco({ icone, titulo, resumo, children, aberto, alternar }: { icone: ReactNode; titulo: string; resumo: string; children: ReactNode; aberto: boolean; alternar: () => void }) {
  return (
    <section className={`pq-bloco ${aberto ? 'aberto' : ''}`}>
      <button type="button" className="pq-bloco-cab" onClick={alternar} aria-expanded={aberto}>
        <span className="pq-bloco-ic">{icone}</span>
        <span className="pq-bloco-txt"><b>{titulo}</b><small>{resumo}</small></span>
        <i aria-hidden="true">{aberto ? '−' : '+'}</i>
      </button>
      {aberto && <div className="pq-bloco-corpo">{children}</div>}
    </section>
  )
}

/** Uma busca: ao vivo na Meta (com a chave) ou na lista da GF (sem). */
function Busca({ placeholder, tipo, local, api, sessao, parceiro, semChave, escolher, ja }: {
  placeholder: string; tipo: TipoDeBusca; local: ResultadoDaBusca[]; api: ApiEstudio; sessao: SessaoTeeds; parceiro: string; semChave: boolean
  escolher: (r: ResultadoDaBusca) => void; ja: (r: ResultadoDaBusca) => boolean
}) {
  const [q, setQ] = useState('')
  const [itens, setItens] = useState<ResultadoDaBusca[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  useEffect(() => {
    setErro(null)
    if (q.trim().length < 2) { setItens(null); setBuscando(false); return }
    if (semChave) { setItens(local.filter((x) => normal(x.nome).includes(normal(q.trim()))).slice(0, 20)); return }
    // a resposta de uma busca antiga não passa por cima da atual
    let valendo = true
    setBuscando(true)
    const t = setTimeout(() => {
      api.buscar(sessao, parceiro, tipo, q.trim())
        .then((r) => { if (valendo) setItens(r) })
        .catch((e) => { if (valendo) { setErro((e as Error).message); setItens(local.filter((x) => normal(x.nome).includes(normal(q.trim())))) } })
        .finally(() => { if (valendo) setBuscando(false) })
    }, 350)
    return () => { valendo = false; clearTimeout(t) }
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const livre = semChave && q.trim().length >= 2 && !(itens ?? []).some((x) => normal(x.nome) === normal(q.trim()))
  return (
    <div className="pq-busca">
      <label className="pq-busca-campo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {buscando && <span className="es-giro" aria-hidden="true" />}
      </label>
      {itens && (
        <ul className="pq-resultados" role="listbox">
          {itens.map((r) => (
            <li key={`${r.tipo}-${r.nome}-${'id' in r ? r.id : ''}${'chave' in r ? r.chave : ''}`}>
              <button type="button" role="option" aria-selected={ja(r)} className={ja(r) ? 'on' : ''} onClick={() => { escolher(r); setQ('') }}>
                <span><b>{r.nome}</b>{(r.caminho || r.detalhe) && <small>{r.caminho || r.detalhe}</small>}</span>
                {r.tamanho && <em>{tamanhoLegivel(r.tamanho)}</em>}
                <i aria-hidden="true">{ja(r) ? '✓' : '+'}</i>
              </button>
            </li>
          ))}
          {livre && (
            <li><button type="button" onClick={() => { escolher((tipo === 'local' ? { tipo: 'cidade', nome: q.trim() } : tipo === 'aparelho' ? { tipo: 'aparelho', nome: q.trim() } : { tipo: tipo === 'comportamento' ? 'comportamento' : 'interesse', nome: q.trim() }) as ResultadoDaBusca); setQ('') }}>
              <span><b>Usar “{q.trim()}”</b><small>A Meta procura esse nome na hora de criar</small></span><i aria-hidden="true">+</i>
            </button></li>
          )}
          {!itens.length && !livre && <li className="pq-nada">Nada com esse nome.</li>}
        </ul>
      )}
      {erro && <p className="pq-aviso">{erro}</p>}
      {semChave && <p className="pq-nota">Sem a chave, a busca usa a lista da GlobalFly. Com a chave, ela procura direto na Meta, com o tamanho de cada público.</p>}
    </div>
  )
}

export function MontarPublico({ publico: entrada, mudar, sessao, api, parceiro, semChave, aprendizado }: {
  publico: Publico; mudar: (p: Partial<Publico>) => void; sessao: SessaoTeeds; api: ApiEstudio; parceiro: string; semChave: boolean
  aprendizado?: Aprendizado | null
}) {
  const p = publicoCompleto(entrada)
  const modo = p.modo === 'personalizado' ? 'detalhado' : p.modo
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ local: true, idade: true, interesses: true, pixel: true })
  const alternar = (k: string) => setAbertos((a) => ({ ...a, [k]: !a[k] }))
  const [tamanho, setTamanho] = useState<{ v: [number, number] | null; avisos: string[]; erro?: string; indo?: boolean } | null>(null)
  const [salvos, setSalvos] = useState<PublicoSalvo[]>([])
  const [salvando, setSalvando] = useState<{ nome: string; indo?: boolean; ok?: boolean; erro?: string } | null>(null)
  const [sugestoes, setSugestoes] = useState<ResultadoDaBusca[]>([])
  const [verExcluir, setVerExcluir] = useState(!!p.excluirInteresses?.length)

  useEffect(() => { api.publicos(sessao, parceiro).then(setSalvos).catch(() => setSalvos([])) }, [parceiro]) // eslint-disable-line react-hooks/exhaustive-deps
  // o tamanho do público, ao vivo (com a chave), um pouco depois da última mudança
  const chaveDoPublico = JSON.stringify(p)
  useEffect(() => {
    if (semChave) return
    setTamanho((t) => ({ v: t?.v ?? null, avisos: [], indo: true }))
    let valendo = true
    const t = setTimeout(() => {
      api.estimar(sessao, parceiro, p).then((r) => { if (valendo) setTamanho({ v: r.tamanho, avisos: r.avisos }) }).catch((e) => { if (valendo) setTamanho({ v: null, avisos: [], erro: (e as Error).message }) })
    }, 900)
    return () => { valendo = false; clearTimeout(t) }
  }, [chaveDoPublico, semChave]) // eslint-disable-line react-hooks/exhaustive-deps
  // "também pode gostar": interesses parecidos com os escolhidos (com a chave)
  const nomesEscolhidos = (p.interesses ?? []).filter((i) => i.tipo === 'interesse').map((i) => i.nome).join('|')
  useEffect(() => {
    if (semChave || !nomesEscolhidos) { setSugestoes([]); return }
    let valendo = true
    const t = setTimeout(() => api.sugerir(sessao, parceiro, nomesEscolhidos.split('|')).then((r) => { if (valendo) setSugestoes(r) }).catch(() => { if (valendo) setSugestoes([]) }), 700)
    return () => { valendo = false; clearTimeout(t) }
  }, [nomesEscolhidos, semChave]) // eslint-disable-line react-hooks/exhaustive-deps

  const problemas = problemasDoPublico(p)
  const resumo = resumoDoPublico(p)
  const ehIgual = (a: { nome: string }, b: { nome: string }) => a.nome.toLowerCase() === b.nome.toLowerCase()

  /* ---------------- local */
  const locais = p.locais ?? []
  const listaDeLocais: ResultadoDaBusca[] = useMemo(() => [...ESTADOS.map((nome) => ({ tipo: 'estado' as const, nome, detalhe: 'Estado' })), ...CIDADES_GRANDES.map((nome) => ({ tipo: 'cidade' as const, nome, detalhe: 'Cidade' }))], [])
  const temLocal = (r: { nome: string; tipo: string }) => locais.some((l) => ehIgual(l, r) && l.tipo === r.tipo)
  const alternarLocal = (r: ResultadoDaBusca) => {
    if (r.tipo !== 'estado' && r.tipo !== 'cidade') return
    const l: Local = { tipo: r.tipo, nome: r.nome, chave: 'chave' in r ? r.chave : undefined, ...(r.tipo === 'cidade' ? { raio: 25 } : {}) }
    mudar({ locais: temLocal(r) ? locais.filter((x) => !(ehIgual(x, r) && x.tipo === r.tipo)) : [...locais, l] })
  }

  /* ---------------- interesses */
  const interesses = p.interesses ?? [], excluir = p.excluirInteresses ?? []
  const listaDeInteresses: ResultadoDaBusca[] = useMemo(() => SUGESTOES.flatMap((g) => g.itens.map((i) => ({ ...i, caminho: g.grupo }))), [])
  const temInteresse = (r: { nome: string }, lista = interesses) => lista.some((i) => ehIgual(i, r))
  const alternarInteresse = (r: ResultadoDaBusca, chaveLista: 'interesses' | 'excluirInteresses' = 'interesses') => {
    if (r.tipo !== 'interesse' && r.tipo !== 'comportamento') return
    const lista = chaveLista === 'interesses' ? interesses : excluir
    const novo: Interesse = { tipo: r.tipo, nome: r.nome, id: 'id' in r ? r.id : undefined, tamanho: r.tamanho, caminho: r.caminho }
    mudar({ [chaveLista]: temInteresse(r, lista) ? lista.filter((i) => !ehIgual(i, r)) : [...lista, novo] })
  }

  /* ---------------- aparelho */
  const modelos = p.modelos ?? []
  const alternarModelo = (nome: string) => {
    const tem = modelos.includes(nome)
    const marca = MODELOS.find((m) => m.nomes.includes(nome))?.marca
    mudar({ modelos: tem ? modelos.filter((m) => m !== nome) : [...modelos, nome], ...(tem || p.sistema !== 'todos' ? {} : { sistema: marca === 'Apple' ? 'ios' : 'android' }) })
  }
  const listaDeModelos: ResultadoDaBusca[] = useMemo(() => MODELOS.flatMap((m) => m.nomes.map((nome) => ({ tipo: 'aparelho' as const, nome, detalhe: m.marca }))), [])

  /* ---------------- onde aparece */
  const pos = p.posicionamentos!
  const alternarLugar = (rede: 'instagram' | 'facebook', id: string) => {
    const lista = pos[rede]
    mudar({ posicionamentos: { ...pos, [rede]: lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id] } })
  }

  const salvarPublico = async () => {
    if (!salvando?.nome.trim()) return
    setSalvando({ ...salvando, indo: true, erro: undefined })
    try {
      await api.salvarPublico(sessao, parceiro, null, salvando.nome.trim(), p, tamanho?.v ?? null)
      setSalvando({ nome: '', ok: true }); setTimeout(() => setSalvando(null), 1800)
      api.publicos(sessao, parceiro).then(setSalvos).catch(() => {})
    } catch (e) { setSalvando({ ...salvando, indo: false, erro: (e as Error).message }) }
  }

  const MODOS = [
    { id: 'padrao', nome: 'A Meta encontra', dica: 'Advantage+: você dá o local e a idade mínima, a Meta acha quem tem mais chance de se cadastrar.', tag: 'Recomendado para começar' },
    { id: 'detalhado', nome: 'Eu escolho', dica: 'Interesses, comportamentos, aparelho, idade, gênero e exclusões, do jeito do Gerenciador.', tag: '' },
    { id: 'inteligente', nome: 'Do pixel', dica: 'Semelhantes a quem já se cadastrou, ou quem visitou a página e não se cadastrou.', tag: '' },
  ] as const

  return (
    <div className="pq">
      {/* o painel de cima: tamanho, resumo e o que já funciona */}
      <div className="pq-topo">
        <div className="pq-medidor">
          <small>Público estimado</small>
          {semChave ? <b className="mudo">Aparece com a chave</b>
            : tamanho?.indo && !tamanho.v ? <b className="mudo">Calculando…</b>
              : tamanho?.v ? <b>{tamanhoLegivel(tamanho.v)} <span>pessoas por mês</span></b>
                : <b className="mudo">{tamanho?.erro ? 'Sem estimativa agora' : '—'}</b>}
          {tamanho?.v && <span className={`pq-regua ${tamanho.v[1] < 50e3 ? 'estreito' : tamanho.v[0] > 30e6 ? 'amplo' : 'bom'}`} aria-hidden="true"><i /></span>}
          {tamanho?.v && <em>{tamanho.v[1] < 50e3 ? 'Estreito: a Meta pode ter pouca gente para entregar.' : tamanho.v[0] > 30e6 ? 'Amplo: a Meta tem espaço para achar quem se cadastra.' : 'Bom tamanho para cadastro.'}</em>}
        </div>
        <p className="pq-resumo">{resumo}</p>
      </div>
      {tamanho?.avisos?.map((a) => <p key={a} className="pq-aviso">{a}</p>)}

      {aprendizado && aprendizado.frases.length > 0 && (
        <div className="pq-aprendeu">
          <div><small>O que já funciona nos seus anúncios</small><b>{aprendizado.frases.join(' · ')}</b><span>Pelos cadastros que os anúncios já trouxeram.</span></div>
          <button type="button" className="es-btn fino principal" onClick={() => mudar({ ...aprendizado.aplicar, modo: modo === 'padrao' ? 'detalhado' : modo })}>Usar no público</button>
        </div>
      )}

      <div className="pq-salvos">
        {salvos.length > 0 && <span className="pq-salvos-rot">Meus públicos</span>}
        {salvos.map((s) => (
          <span key={s.id} className="pq-salvo">
            <button type="button" onClick={() => mudar(publicoCompleto(s.publico))} title={resumoDoPublico(s.publico)}>{s.nome}{s.tamanho ? <em>{tamanhoLegivel(s.tamanho)}</em> : null}</button>
            <button type="button" className="x" aria-label={`Tirar ${s.nome} dos públicos salvos`} onClick={() => api.arquivarPublico(sessao, s.id).then(() => setSalvos((l) => l.filter((x) => x.id !== s.id))).catch(() => {})}>×</button>
          </span>
        ))}
        {salvando && !salvando.ok ? (
          <span className="pq-salvar">
            <input autoFocus value={salvando.nome} onChange={(e) => setSalvando({ ...salvando, nome: e.target.value })} placeholder="Nome do público" aria-label="Nome do público" onKeyDown={(e) => { if (e.key === 'Enter') void salvarPublico() }} />
            <button type="button" className="es-btn fino principal" onClick={() => void salvarPublico()} disabled={!salvando.nome.trim() || salvando.indo}>{salvando.indo ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" className="es-btn fino" onClick={() => setSalvando(null)}>Cancelar</button>
          </span>
        ) : salvando?.ok ? <span className="pq-ok">Público salvo</span>
          : <button type="button" className="pq-salvar-botao" onClick={() => setSalvando({ nome: '' })}>+ Salvar este público</button>}
        {salvando?.erro && <p className="pq-aviso">{salvando.erro}</p>}
      </div>

      <div className="pq-modos" role="radiogroup" aria-label="Como montar o público">
        {MODOS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} className={`pq-modo ${modo === m.id ? 'on' : ''}`}
            onClick={() => mudar({ modo: m.id, ...(m.id === 'inteligente' && !p.inteligente ? { inteligente: { tipo: 'semelhantes', percentual: 1, dias: 30 } } : {}), ...(m.id === 'padrao' && p.idadeMin > 25 ? { idadeMin: 25 } : {}) })}>
            <span className="es-radio" aria-hidden="true" />
            <b>{m.nome}</b>{m.tag && <em className="es-rec">{m.tag}</em>}
            <small>{m.dica}</small>
          </button>
        ))}
      </div>

      {modo === 'inteligente' && (
        <Bloco icone={<Icone nome="publico" tam={18} />} titulo="Público do pixel" resumo={p.inteligente?.tipo === 'remarketing' ? `Visitou nos últimos ${p.inteligente.dias} dias e não se cadastrou` : `Semelhantes a quem se cadastrou (${p.inteligente?.percentual ?? 1}%)`} aberto={abertos.pixel} alternar={() => alternar('pixel')}>
          <div className="pq-duas-opcoes">
            {(['semelhantes', 'remarketing'] as const).map((t) => (
              <button key={t} type="button" className={`es-opcao ${p.inteligente?.tipo === t ? 'on' : ''}`} aria-pressed={p.inteligente?.tipo === t} onClick={() => mudar({ inteligente: { percentual: 1, dias: 30, ...p.inteligente, tipo: t } })}>
                <span className="es-radio" aria-hidden="true" />
                <div><b>{t === 'semelhantes' ? 'Semelhantes a quem se cadastrou' : 'Quem visitou e não se cadastrou'}</b><small>{t === 'semelhantes' ? 'A Meta procura no Brasil gente parecida com os cadastros que o pixel já viu.' : 'Para trazer de volta quem chegou na página e parou no meio.'}</small></div>
              </button>
            ))}
          </div>
          {p.inteligente?.tipo === 'semelhantes' ? (
            <div className="es-campo"><span>Quão parecido</span>
              <div className="es-chips">{[1, 2, 3, 5, 10].map((n) => <button key={n} type="button" className={p.inteligente?.percentual === n ? 'on' : ''} aria-pressed={p.inteligente?.percentual === n} onClick={() => mudar({ inteligente: { ...p.inteligente!, percentual: n } })}>{n}%</button>)}</div>
              <small className="es-dica">1% é o mais parecido e o menor. A partir de 3% fica maior e menos parecido.</small>
            </div>
          ) : (
            <div className="es-campo"><span>Visitou nos últimos</span>
              <div className="es-chips">{[7, 14, 30, 60, 90].map((n) => <button key={n} type="button" className={p.inteligente?.dias === n ? 'on' : ''} aria-pressed={p.inteligente?.dias === n} onClick={() => mudar({ inteligente: { ...p.inteligente!, dias: n } })}>{n} dias</button>)}</div>
            </div>
          )}
          <p className="pq-nota">A Meta monta esses públicos pelo próprio pixel: nenhum e-mail ou telefone sai da plataforma. O semelhante precisa de pelo menos 100 cadastros vistos pelo pixel.</p>
        </Bloco>
      )}

      <Bloco icone={<Icone nome="destino" tam={18} />} titulo="Onde as pessoas estão" resumo={locais.length ? `${locais.length} ${locais.length === 1 ? 'lugar' : 'lugares'}` : 'Brasil todo'} aberto={abertos.local} alternar={() => alternar('local')}>
        <div className="es-chips">
          <button type="button" className={!locais.length ? 'on' : ''} aria-pressed={!locais.length} onClick={() => mudar({ locais: [] })}>Brasil todo</button>
          {['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Santa Catarina', 'Rio Grande do Sul'].map((e) => <button key={e} type="button" className={temLocal({ nome: e, tipo: 'estado' }) ? 'on' : ''} aria-pressed={temLocal({ nome: e, tipo: 'estado' })} onClick={() => alternarLocal({ tipo: 'estado', nome: e })}>{e}</button>)}
        </div>
        <Busca placeholder="Procurar estado ou cidade" tipo="local" local={listaDeLocais} api={api} sessao={sessao} parceiro={parceiro} semChave={semChave} escolher={alternarLocal} ja={(r) => temLocal(r as { nome: string; tipo: string })} />
        {locais.length > 0 && (
          <ul className="pq-escolhidos">
            {locais.map((l) => (
              <li key={`${l.tipo}-${l.nome}`}>
                <span><b>{l.nome}</b><small>{l.tipo === 'estado' ? 'Estado' : 'Cidade'}</small></span>
                {l.tipo === 'cidade' && (
                  <select value={l.raio ?? 0} aria-label={`Raio em volta de ${l.nome}`} onChange={(e) => mudar({ locais: locais.map((x) => (x === l ? { ...x, raio: Number(e.target.value) || undefined } : x)) })}>
                    <option value={0}>Só a cidade</option>{[17, 25, 40, 60, 80].map((r) => <option key={r} value={r}>+{r} km</option>)}
                  </select>
                )}
                <button type="button" aria-label={`Tirar ${l.nome}`} onClick={() => mudar({ locais: locais.filter((x) => x !== l) })}>×</button>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco icone={<Icone nome="publico" tam={18} />} titulo={modo === 'padrao' ? 'Idade mínima' : 'Idade e gênero'} resumo={modo === 'padrao' ? `A partir de ${p.idadeMin} anos` : `${p.idadeMin} a ${p.idadeMax}${p.idadeMax === 65 ? '+' : ''} anos · ${p.genero === 'todos' ? 'todos' : p.genero}`} aberto={abertos.idade} alternar={() => alternar('idade')}>
        <div className="pq-idade">
          <label>De<input type="number" min={18} max={modo === 'padrao' ? 25 : p.idadeMax} value={p.idadeMin} onChange={(e) => mudar({ idadeMin: Math.min(modo === 'padrao' ? 25 : p.idadeMax, Math.max(18, Number(e.target.value) || 18)) })} /></label>
          {modo !== 'padrao' && <label>Até<input type="number" min={p.idadeMin} max={65} value={p.idadeMax} onChange={(e) => mudar({ idadeMax: Math.max(p.idadeMin, Math.min(65, Number(e.target.value) || 65)) })} /></label>}
          <div className="es-chips">{[[18, 65], [25, 45], [25, 55], [30, 60], [35, 65]].filter(() => modo !== 'padrao').map(([a, b]) => <button key={`${a}-${b}`} type="button" className={p.idadeMin === a && p.idadeMax === b ? 'on' : ''} onClick={() => mudar({ idadeMin: a, idadeMax: b })}>{a}–{b}{b === 65 ? '+' : ''}</button>)}</div>
        </div>
        {modo === 'padrao' ? <p className="pq-nota">No Advantage+ a idade mínima é a única trava (até 25 anos). Para travar idade máxima e gênero, use "Eu escolho".</p> : (
          <div className="es-campo"><span>Gênero</span>
            <div className="es-chips">{(['todos', 'homens', 'mulheres'] as const).map((g) => <button key={g} type="button" className={p.genero === g ? 'on' : ''} aria-pressed={p.genero === g} onClick={() => mudar({ genero: g })}>{g === 'todos' ? 'Todos' : g === 'homens' ? 'Homens' : 'Mulheres'}</button>)}</div>
          </div>
        )}
      </Bloco>

      {modo === 'detalhado' && (
        <Bloco icone={<Icone nome="olho" tam={18} />} titulo="Interesses e comportamentos" resumo={interesses.length ? `${interesses.length} escolhidos${excluir.length ? ` · ${excluir.length} excluídos` : ''}` : 'Nenhum: público aberto'} aberto={abertos.interesses} alternar={() => alternar('interesses')}>
          <Busca placeholder="Procurar interesse ou comportamento (ex.: Forex, Day trading)" tipo="interesse" local={listaDeInteresses} api={api} sessao={sessao} parceiro={parceiro} semChave={semChave} escolher={(r) => alternarInteresse(r)} ja={(r) => temInteresse(r)} />
          {interesses.length > 0 && (
            <ul className="pq-escolhidos">
              {interesses.map((i) => (
                <li key={i.nome}><span><b>{i.nome}</b><small>{i.tipo === 'comportamento' ? 'Comportamento' : 'Interesse'}{i.caminho ? ` · ${i.caminho}` : ''}{i.tamanho ? ` · ${tamanhoLegivel(i.tamanho)}` : ''}</small></span>
                  <button type="button" aria-label={`Tirar ${i.nome}`} onClick={() => mudar({ interesses: interesses.filter((x) => x !== i) })}>×</button></li>
              ))}
            </ul>
          )}
          {sugestoes.length > 0 && (
            <div className="pq-grupo"><small>Também pode funcionar</small>
              <div className="es-chips">{sugestoes.filter((x) => !temInteresse(x)).slice(0, 10).map((x) => <button key={x.nome} type="button" onClick={() => alternarInteresse(x)}>+ {x.nome}{x.tamanho ? <i>{tamanhoLegivel(x.tamanho)}</i> : null}</button>)}</div>
            </div>
          )}
          {SUGESTOES.map((g) => (
            <div key={g.grupo} className="pq-grupo"><small>{g.grupo}</small>
              <div className="es-chips">{g.itens.map((i) => <button key={i.nome} type="button" className={temInteresse(i) ? 'on' : ''} aria-pressed={temInteresse(i)} onClick={() => alternarInteresse({ ...i, caminho: g.grupo })}>{temInteresse(i) ? '✓ ' : '+ '}{i.nome}</button>)}</div>
            </div>
          ))}
          <button type="button" className="pq-link" onClick={() => setVerExcluir((x) => !x)}>{verExcluir ? 'Esconder exclusões' : 'Excluir pessoas por interesse'}</button>
          {verExcluir && (
            <div className="pq-excluir">
              <Busca placeholder="Não mostrar para quem se interessa por…" tipo="interesse" local={listaDeInteresses} api={api} sessao={sessao} parceiro={parceiro} semChave={semChave} escolher={(r) => alternarInteresse(r, 'excluirInteresses')} ja={(r) => temInteresse(r, excluir)} />
              {excluir.length > 0 && <ul className="pq-escolhidos fora">{excluir.map((i) => <li key={i.nome}><span><b>{i.nome}</b><small>Excluído</small></span><button type="button" aria-label={`Tirar ${i.nome} das exclusões`} onClick={() => mudar({ excluirInteresses: excluir.filter((x) => x !== i) })}>×</button></li>)}</ul>}
            </div>
          )}
          <p className="pq-nota">Interesses diferentes somam (a pessoa precisa ter um deles). Os excluídos tiram gente do público.</p>
        </Bloco>
      )}

      {modo !== 'padrao' && (
        <Bloco icone={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>} titulo="Aparelho"
          resumo={modelos.length ? `${modelos.length} ${modelos.length === 1 ? 'modelo' : 'modelos'}` : p.sistema === 'ios' ? 'Só iPhone' : p.sistema === 'android' ? 'Só Android' : 'Todos os celulares e computadores'} aberto={!!abertos.aparelho} alternar={() => alternar('aparelho')}>
          <div className="es-campo"><span>Sistema</span>
            <div className="es-chips">{([['todos', 'Todos'], ['ios', 'iPhone (iOS)'], ['android', 'Android']] as const).map(([id, nome]) => <button key={id} type="button" className={p.sistema === id ? 'on' : ''} aria-pressed={p.sistema === id} onClick={() => mudar({ sistema: id, ...(id === 'todos' ? { modelos: [] } : { modelos: modelos.filter((m) => (MODELOS.find((x) => x.nomes.includes(m))?.marca === 'Apple') === (id === 'ios')) }) })}>{nome}</button>)}</div>
          </div>
          <div className="pq-grupo"><small>Atalhos</small>
            <div className="es-chips">{ATALHOS_DE_MODELO.map((a) => { const todos = a.modelos.every((m) => modelos.includes(m)); return <button key={a.nome} type="button" className={todos ? 'on' : ''} onClick={() => mudar({ sistema: a.sistema, modelos: todos ? modelos.filter((m) => !a.modelos.includes(m)) : [...new Set([...modelos.filter((m) => (MODELOS.find((x) => x.nomes.includes(m))?.marca === 'Apple') === (a.sistema === 'ios')), ...a.modelos])] })}>{a.nome}</button> })}</div>
          </div>
          {MODELOS.filter((m) => p.sistema === 'todos' || (p.sistema === 'ios') === (m.marca === 'Apple')).map((m) => (
            <div key={m.marca} className="pq-grupo"><small>{m.marca}</small>
              <div className="es-chips pq-modelos">{m.nomes.map((n) => <button key={n} type="button" className={modelos.includes(n) ? 'on' : ''} aria-pressed={modelos.includes(n)} onClick={() => alternarModelo(n)}>{n.replace(/^Galaxy /, 'Galaxy ')}</button>)}</div>
            </div>
          ))}
          <Busca placeholder="Procurar outro modelo" tipo="aparelho" local={listaDeModelos} api={api} sessao={sessao} parceiro={parceiro} semChave={semChave} escolher={(r) => alternarModelo(r.nome)} ja={(r) => modelos.includes(r.nome)} />
          <label className="pq-interruptor"><input type="checkbox" checked={!!p.soWifi} onChange={(e) => mudar({ soWifi: e.target.checked })} /><span><b>Só quando estiver no Wi-Fi</b><small>Bom para vídeos longos: a pessoa não gasta o plano de dados.</small></span></label>
          {modelos.length > 0 && <p className="pq-nota">Escolher modelos deixa o público bem menor. Use para testar, não para o anúncio principal.</p>}
        </Bloco>
      )}

      <Bloco icone={<LogoInstagram tam={18} />} titulo="Onde o anúncio aparece" resumo={pos.modo === 'auto' ? 'Automático: Instagram, Facebook e onde render mais' : `${pos.instagram.length + pos.facebook.length + (pos.messenger ? 1 : 0) + (pos.audienceNetwork ? 1 : 0)} lugares escolhidos`} aberto={!!abertos.lugares} alternar={() => alternar('lugares')}>
        <div className="pq-duas-opcoes">
          <button type="button" className={`es-opcao ${pos.modo === 'auto' ? 'on' : ''}`} aria-pressed={pos.modo === 'auto'} onClick={() => mudar({ posicionamentos: { ...pos, modo: 'auto' } })}><span className="es-radio" aria-hidden="true" /><div><b>Automático <em className="es-rec">Recomendado</em></b><small>A Meta põe onde o cadastro sai mais barato (Advantage+).</small></div></button>
          <button type="button" className={`es-opcao ${pos.modo === 'manual' ? 'on' : ''}`} aria-pressed={pos.modo === 'manual'} onClick={() => mudar({ posicionamentos: { ...pos, modo: 'manual' } })}><span className="es-radio" aria-hidden="true" /><div><b>Escolher os lugares</b><small>Só Instagram, só Reels, só Stories…</small></div></button>
        </div>
        {pos.modo === 'manual' && (
          <div className="pq-lugares">
            <div className="pq-rede"><header><LogoInstagram tam={22} /><b>Instagram</b><button type="button" onClick={() => mudar({ posicionamentos: { ...pos, instagram: pos.instagram.length === INSTAGRAM.length ? [] : INSTAGRAM.map((x) => x.id) } })}>{pos.instagram.length === INSTAGRAM.length ? 'Nenhum' : 'Todos'}</button></header>
              {INSTAGRAM.map((x) => <label key={x.id}><input type="checkbox" checked={pos.instagram.includes(x.id)} onChange={() => alternarLugar('instagram', x.id)} />{x.nome}</label>)}</div>
            <div className="pq-rede"><header><LogoFacebook tam={22} /><b>Facebook</b><button type="button" onClick={() => mudar({ posicionamentos: { ...pos, facebook: pos.facebook.length === FACEBOOK.length ? [] : FACEBOOK.map((x) => x.id) } })}>{pos.facebook.length === FACEBOOK.length ? 'Nenhum' : 'Todos'}</button></header>
              {FACEBOOK.map((x) => <label key={x.id}><input type="checkbox" checked={pos.facebook.includes(x.id)} onChange={() => alternarLugar('facebook', x.id)} />{x.nome}</label>)}</div>
            <div className="pq-rede"><header><b>Outros</b></header>
              <label><input type="checkbox" checked={pos.messenger} onChange={(e) => mudar({ posicionamentos: { ...pos, messenger: e.target.checked } })} />Messenger</label>
              <label><input type="checkbox" checked={pos.audienceNetwork} onChange={(e) => mudar({ posicionamentos: { ...pos, audienceNetwork: e.target.checked } })} />Audience Network (apps e sites)</label>
              <small className="pq-sub">Aparelho</small>
              {([['mobile', 'Celular'], ['desktop', 'Computador']] as const).map(([id, nome]) => <label key={id}><input type="checkbox" checked={pos.aparelhos.includes(id)} onChange={() => mudar({ posicionamentos: { ...pos, aparelhos: pos.aparelhos.includes(id) ? pos.aparelhos.filter((x) => x !== id) : [...pos.aparelhos, id] } })} />{nome}</label>)}
            </div>
          </div>
        )}
      </Bloco>

      <Bloco icone={<Icone nome="conferir" tam={18} />} titulo="Quem fica de fora e idioma" resumo={[p.excluirCadastrados ? 'Sem quem já se cadastrou' : 'Inclui quem já se cadastrou', p.portugues ? 'em português' : ''].filter(Boolean).join(' · ')} aberto={!!abertos.fora} alternar={() => alternar('fora')}>
        <label className="pq-interruptor"><input type="checkbox" checked={!!p.excluirCadastrados} onChange={(e) => mudar({ excluirCadastrados: e.target.checked })} /><span><b>Não mostrar para quem já se cadastrou</b><small>Pelo pixel (últimos 180 dias). Não gasta dinheiro com quem já está dentro.</small></span></label>
        {modo !== 'padrao' && <label className="pq-interruptor"><input type="checkbox" checked={!!p.portugues} onChange={(e) => mudar({ portugues: e.target.checked })} /><span><b>Só quem usa o Instagram e o Facebook em português</b><small>Tira estrangeiros que moram no Brasil e usam outro idioma.</small></span></label>}
      </Bloco>

      {problemas.map((x) => <p key={x} className="es-dica amarelo">{x}</p>)}
    </div>
  )
}
