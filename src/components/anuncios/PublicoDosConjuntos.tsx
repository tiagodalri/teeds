import { useMemo, useState, type ReactNode } from 'react'
import type { Alvo, Campanha, Conjunto, QuebraDoConjunto } from '../../core/teeds/anuncios'
import { estaLigado, Interruptor, type TipoDoItem } from './Interruptor'
import './publico-dos-conjuntos.css'

/*
  A aba Público conjunto por conjunto (09/11/2026, Tiago: "quero mais controles do público também, tá muito vago,
  raso!"). Antes eram só quatro barras da conta inteira. Agora cada conjunto abre com:
  - o liga/desliga e o orçamento (os mesmos da tabela);
  - quem pode ver: local, idade (e a sugestão do Advantage+), gênero, públicos incluídos e excluídos, interesses,
    onde aparece, aparelhos e sistemas, exatamente como está na Meta;
  - quem se cadastrou e onde apareceu, só daquele conjunto.
  Mudar a segmentação continua no Gerenciador (o link abre o conjunto): editar o público de um conjunto no ar
  manda os anúncios de volta para a análise da Meta, e com a chave da plataforma isso já derrubou anúncios
  (04/11/2026, "Sem permissão para o anunciante na Página").
*/

const TIPO_DE_INTERESSE: Record<string, string> = {
  interests: 'Interesse', behaviors: 'Comportamento', life_events: 'Momento de vida', family_statuses: 'Família', industries: 'Setor',
  income: 'Renda', work_positions: 'Cargo', work_employers: 'Empresa', education_statuses: 'Escolaridade', education_schools: 'Escola', education_majors: 'Curso',
  relationship_statuses: 'Relacionamento', user_adclusters: 'Grupo', interested_in: 'Interessado em',
}
const SISTEMA = (s: string) => s.replace(/^iOS_ver_/i, 'iOS ').replace(/^Android_ver_/i, 'Android ').replace(/_and_above$/i, ' ou mais').replace(/_to_/i, ' a ').replace(/_/g, ' ')
const APARELHO: Record<string, string> = { mobile: 'Celular', desktop: 'Computador' }
const PLATAFORMA: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads' }

type Ordem = 'gasto' | 'custo' | 'resultados'
type Filtro = 'todos' | 'ligados' | 'desligados'

function Chips({ itens, tom }: { itens: string[]; tom?: 'fora' | 'sugestao' }) {
  if (!itens.length) return <span className="pc-nada">—</span>
  return <span className="pc-chips">{itens.map((x, i) => <i key={`${x}${i}`} className={tom ?? ''}>{x}</i>)}</span>
}

/** Quem pode ver, linha por linha, na ordem do Gerenciador. */
function QuemPodeVer({ a, nomeDaPosicao }: { a: Alvo; nomeDaPosicao: (plataforma: string, posicao: string) => string }) {
  const sugestao = a.sugestaoIdade && a.advantage
  return (
    <dl className="pc-alvo">
      <div><dt>Locais</dt><dd><Chips itens={a.locais} />{a.tiposDeLocal.length > 0 && <small>Pessoas que {a.tiposDeLocal.length > 1 ? `${a.tiposDeLocal.slice(0, -1).join(', ')} ou ${a.tiposDeLocal[a.tiposDeLocal.length - 1]}` : a.tiposDeLocal[0]} no local</small>}{a.locaisFora.length > 0 && <><small>Fora:</small><Chips itens={a.locaisFora} tom="fora" /></>}</dd></div>
      <div><dt>Idade</dt><dd><b>{a.idade[0]} a {a.idade[1]}{a.idade[1] >= 65 ? '+' : ''} anos</b>{sugestao && <small>Sugestão para a Meta: {a.sugestaoIdade![0]} a {a.sugestaoIdade![1]}{a.sugestaoIdade![1] >= 65 ? '+' : ''}</small>}</dd></div>
      <div><dt>Gênero</dt><dd><b>{a.generos === 'todos' ? 'Todos' : a.generos === 'homens' ? 'Só homens' : 'Só mulheres'}</b></dd></div>
      <div><dt>Público Advantage+</dt><dd><b className={a.advantage ? 'pc-sim' : ''}>{a.advantage ? 'Ligado' : 'Desligado'}</b>
        <small>{a.advantage ? 'Públicos, interesses e idade viram sugestão: a Meta pode ir além deles. Local, idade mínima e exclusões continuam valendo.' : 'A Meta entrega só para o público escolhido.'}</small></dd></div>
      <div><dt>{a.advantage ? 'Públicos sugeridos' : 'Públicos incluídos'}</dt><dd><Chips itens={a.incluidos.map((x) => x.nome)} tom={a.advantage ? 'sugestao' : undefined} /></dd></div>
      <div><dt>Públicos excluídos</dt><dd><Chips itens={a.excluidos.map((x) => x.nome)} tom="fora" /></dd></div>
      <div><dt>Interesses e comportamentos</dt><dd>{a.interesses.length ? <Chips itens={a.interesses.map((x) => `${x.nome}${x.tipo !== 'interests' ? ` · ${TIPO_DE_INTERESSE[x.tipo] ?? x.tipo}` : ''}`)} tom={a.advantage ? 'sugestao' : undefined} /> : <span className="pc-nada">Nenhum (público aberto)</span>}
        {a.exclusoes.length > 0 && <><small>Excluindo:</small><Chips itens={a.exclusoes.map((x) => x.nome)} tom="fora" /></>}</dd></div>
      <div><dt>Onde aparece</dt><dd>{!a.plataformas && !a.posicoes.length ? <b>Automático (Advantage+)</b>
        : <Chips itens={a.posicoes.length ? a.posicoes.map((p) => { const [pl, po] = p.split(':'); return nomeDaPosicao(pl, po) }) : (a.plataformas ?? []).map((p) => PLATAFORMA[p] ?? p)} />}</dd></div>
      {(a.aparelhos.length > 0 || a.sistemas.length > 0 || a.modelos.length > 0 || a.soWifi) && (
        <div><dt>Aparelhos</dt><dd><Chips itens={[...a.aparelhos.map((x) => APARELHO[x] ?? x), ...a.sistemas.map(SISTEMA), ...a.modelos, ...(a.soWifi ? ['Só no Wi-Fi'] : [])]} /></dd></div>
      )}
      {a.idiomas > 0 && <div><dt>Idiomas</dt><dd><b>{a.idiomas} idioma{a.idiomas > 1 ? 's' : ''}</b></dd></div>}
    </dl>
  )
}

/** As barrinhas de quem viu e se cadastrou (por gasto, com os cadastros ao lado), só do conjunto. */
function Barrinhas({ titulo, linhas, nome, brl }: { titulo: string; linhas: QuebraDoConjunto[]; nome: (chave: string) => string; brl: (v: number) => string }) {
  const juntas = new Map<string, { gasto: number; cadastros: number }>()
  for (const q of linhas) { const k = nome(q.chave), j = juntas.get(k) ?? { gasto: 0, cadastros: 0 }; j.gasto += q.gasto; j.cadastros += q.cadastros; juntas.set(k, j) }
  const lista = [...juntas].sort((a, b) => b[1].gasto - a[1].gasto).slice(0, 6)
  const max = Math.max(1, ...lista.map(([, v]) => v.gasto))
  return (
    <div className="pc-barras">
      <h5>{titulo}</h5>
      {!lista.length ? <p className="pc-nada">Ainda sem entrega no período.</p> : (
        <ul>{lista.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <i><b style={{ width: `${(v.gasto / max) * 100}%` }} /></i>
            <em>{brl(v.gasto)}{v.cadastros ? <small> · {v.cadastros} cad. · {brl(v.gasto / v.cadastros)}</small> : null}</em>
          </li>
        ))}</ul>
      )}
    </div>
  )
}

export function PublicoDosConjuntos({ conjuntos, campanhas, quebras, contaId, brl, int, nomeDaPosicao, orcamento, ligadoDe, indo, alternar }: {
  conjuntos: Conjunto[]; campanhas: Campanha[]; quebras: QuebraDoConjunto[]; contaId: string
  brl: (v: number) => string; int: (v: number) => string; nomeDaPosicao: (plataforma: string, posicao: string) => string
  orcamento: (c: Conjunto) => ReactNode
  ligadoDe: (id: string, daMeta: boolean) => boolean; indo: Record<string, boolean>
  alternar: (tipo: TipoDoItem, id: string, nome: string, ligar: boolean) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('gasto')
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const campanhaDe = useMemo(() => new Map(campanhas.map((c) => [c.id, c])), [campanhas])
  const porConjunto = useMemo(() => {
    const m = new Map<string, QuebraDoConjunto[]>()
    for (const q of quebras) m.set(q.conjunto, [...(m.get(q.conjunto) ?? []), q])
    return m
  }, [quebras])
  const ligado = (c: Conjunto) => ligadoDe(c.id, estaLigado(c.ligado, c.status))
  const contagem = { todos: conjuntos.length, ligados: conjuntos.filter(ligado).length, desligados: conjuntos.filter((c) => !ligado(c)).length }
  const custo = (c: Conjunto) => (c.m.cadastros ? c.m.gasto / c.m.cadastros : Infinity)
  const lista = conjuntos.filter((c) => filtro === 'todos' || (filtro === 'ligados') === ligado(c))
    .sort((a, b) => ordem === 'gasto' ? b.m.gasto - a.m.gasto : ordem === 'resultados' ? b.m.cadastros - a.m.cadastros : custo(a) - custo(b))
  const alternarAberto = (id: string) => setAbertos((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosAbertos = lista.length > 0 && lista.every((c) => abertos.has(c.id))
  const genero = (g: string) => (g === 'male' ? 'Homens' : g === 'female' ? 'Mulheres' : 'Outros')

  return (
    <section className="aa-cartao pc">
      <header className="pc-topo">
        <div><span className="rot">Público de cada conjunto</span><h3>Quem pode ver e quem se cadastrou</h3></div>
        <div className="pc-controles">
          <div className="aa-troca" role="group" aria-label="Quais conjuntos">
            {(['todos', 'ligados', 'desligados'] as const).map((f) => (
              <button key={f} type="button" className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f === 'todos' ? 'Todos' : f === 'ligados' ? 'Ligados' : 'Desligados'} <small>{contagem[f]}</small></button>
            ))}
          </div>
          <label className="pc-ordem">Ordem
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
              <option value="gasto">Mais gasto</option><option value="custo">Menor custo por resultado</option><option value="resultados">Mais resultados</option>
            </select>
          </label>
          <button type="button" className="pc-abrir-todos" onClick={() => setAbertos(todosAbertos ? new Set() : new Set(lista.map((c) => c.id)))}>{todosAbertos ? 'Fechar todos' : 'Abrir todos'}</button>
        </div>
      </header>

      {!lista.length && <p className="aa-vazio">Nenhum conjunto {filtro === 'ligados' ? 'ligado' : filtro === 'desligados' ? 'desligado' : ''} neste período.</p>}
      <ol className="pc-lista">
        {lista.map((c) => {
          const aberto = abertos.has(c.id), lig = ligado(c), q = porConjunto.get(c.id) ?? []
          const campanha = campanhaDe.get(c.campanhaId)
          return (
            <li key={c.id} className={`pc-conj ${aberto ? 'aberto' : ''} ${lig ? '' : 'desligado'}`}>
              <div className="pc-linha" role="button" tabIndex={0} aria-expanded={aberto} onClick={() => alternarAberto(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarAberto(c.id) } }}>
                <Interruptor ligado={lig} indo={indo[c.id]} tipo="conjunto" nome={c.nome} aoMudar={(v) => alternar('conjunto', c.id, c.nome, v)} />
                <div className="pc-nome"><b>{c.nome}</b><small>{campanha?.nome ?? ''}{c.alvo ? ` · ${c.alvo.advantage ? 'Advantage+' : 'público fechado'}` : ''}</small></div>
                <div className="pc-orc" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{orcamento(c)}</div>
                <dl className="pc-num">
                  <div><dt>Gasto</dt><dd>{brl(c.m.gasto)}</dd></div>
                  <div><dt>Resultados</dt><dd>{int(c.m.cadastros)}</dd></div>
                  <div><dt>Custo/res.</dt><dd>{c.m.cadastros ? brl(c.m.gasto / c.m.cadastros) : '—'}</dd></div>
                </dl>
                <span className="pc-seta" aria-hidden="true" />
              </div>
              {aberto && (
                <div className="pc-corpo">
                  <div className="pc-col">
                    <h4>Quem pode ver</h4>
                    {c.alvo ? <QuemPodeVer a={c.alvo} nomeDaPosicao={nomeDaPosicao} /> : <p className="pc-nada">{c.publico || 'A Meta não mandou a segmentação deste conjunto.'}</p>}
                  </div>
                  <div className="pc-col">
                    <h4>Como está indo</h4>
                    <dl className="pc-mini">
                      <div><dt>Alcance</dt><dd>{int(c.m.alcance)}</dd></div><div><dt>Frequência</dt><dd>{c.m.frequencia.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</dd></div>
                      <div><dt>CPM</dt><dd>{brl(c.m.cpm)}</dd></div><div><dt>CTR do link</dt><dd>{c.m.ctrLink.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</dd></div>
                      <div><dt>Cliques no link</dt><dd>{int(c.m.cliquesLink)}</dd></div><div><dt>Visitas à página</dt><dd>{int(c.m.lpv)}</dd></div>
                    </dl>
                    <Barrinhas titulo="Idade e gênero" brl={brl} linhas={q.filter((x) => x.tipo === 'idade')} nome={(k) => { const [idade, g] = k.split('|'); return `${idade} · ${genero(g)}` }} />
                    <Barrinhas titulo="Onde apareceu" brl={brl} linhas={q.filter((x) => x.tipo === 'posicao')} nome={(k) => { const [pl, po] = k.split('|'); return nomeDaPosicao(pl, po) }} />
                  </div>
                  <footer>
                    <a href={`https://adsmanager.facebook.com/adsmanager/manage/adsets/edit?act=${contaId}&selected_adset_ids=${c.id}`} target="_blank" rel="noreferrer">Editar o público no Gerenciador <span aria-hidden="true">↗</span></a>
                    <small>Mudar o público de um conjunto no ar manda os anúncios dele de volta para a análise da Meta. Por isso essa troca é feita no Gerenciador.</small>
                  </footer>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
