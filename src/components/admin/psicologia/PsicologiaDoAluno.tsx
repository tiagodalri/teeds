/**
 * Psicologia do aluno (27/11/2026, Tiago: "indicadores, interpretações e sacadas ligadas à psicologia depois
 * de analisar dados minuciosamente... microcomportamentos infinitos"). Administração › Números.
 *
 * A primeira dobra é resposta em palavras: as sacadas mais fortes, cada uma com o número, a frase, o que
 * fazer e o tamanho da amostra. Depois: os perfis de comportamento, os temas (cada um com as suas sacadas
 * e um gráfico), as histórias reais (um aluno, um fato) e a lista de alunos com a linha do tempo de cada um.
 * Tabelas ficam em gavetas fechadas. Tudo é correlação: a tela diz isso. Prefixo psi-.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { lerAlunosDaPsicologia, lerPsicologia, type AlunoDaPsicologia, type FimDaSessao, type Historia, type PerfilDoAluno, type Psicologia } from '../../../core/teeds/psicologia'
import { SeloDoParceiro } from '../../parceiros/SeloDoParceiro'
import { Icone } from '../../Icone'
import { LinhaDoTempo } from './LinhaDoTempo'
import { PERFIS, TEMAS, inteiro, montarSacadas, pc, pct, plural, tempoCurto, usd, type Sacada, type Tema } from './sacadas'
import './psicologia.css'

const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
const fmtDiaHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const num = (v: unknown) => Number(v ?? 0)
const haQuanto = (iso: string | null) => {
  if (!iso) return 'Nunca'
  const h = (Date.now() - Date.parse(iso)) / 3_600_000
  return h < 1 ? 'Agora há pouco' : h < 24 ? `Há ${Math.round(h)} h` : `Há ${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? '' : 's'}`
}

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  return <span className="psi-av" aria-hidden="true">{foto ? <img src={foto} alt="" loading="lazy" /> : iniciais(nome)}</span>
}

/** Duas barras lado a lado: este grupo contra aquele. */
function Duelo({ a, b }: NonNullable<Sacada['duelo']>) {
  const max = Math.max(a.pct, b.pct, 1)
  return (
    <div className="psi-duelo" role="img" aria-label={`${a.rotulo}: ${Math.round(a.pct)}%. ${b.rotulo}: ${Math.round(b.pct)}%.`}>
      {[a, b].map((x, i) => (
        <div key={x.rotulo} className={i === 0 ? 'a' : 'b'}>
          <span>{x.rotulo}</span>
          <i><u style={{ width: `${Math.max(2, (x.pct / max) * 100)}%` }} /></i>
          <b>{Math.round(x.pct)}%</b>
        </div>
      ))}
    </div>
  )
}

function CartaoDaSacada({ s, grande }: { s: Sacada; grande?: boolean }) {
  const [aberta, setAberta] = useState(false)
  return (
    <article className={`psi-sacada ${s.tom}${grande ? ' grande' : ''}`}>
      <span className="psi-rot">{TEMAS.find((t) => t.id === s.tema)?.nome}</span>
      <h4>{s.titulo}</h4>
      <strong>{s.numero}</strong>
      <small className="psi-leg">{s.legenda}</small>
      {s.duelo && <Duelo {...s.duelo} />}
      <p>{s.texto}</p>
      {(grande || aberta) && <p className="psi-fazer"><b>O que fazer</b>{s.acao}</p>}
      <footer>
        <span title="Tamanho da amostra">Base: {s.base}</span>
        {!grande && <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>{aberta ? 'Fechar' : 'O que fazer'}</button>}
      </footer>
    </article>
  )
}

function Gaveta({ titulo, resumo, children }: { titulo: string; resumo: ReactNode; children: ReactNode }) {
  const [aberta, setAberta] = useState(false)
  return (
    <div className={`psi-gaveta${aberta ? ' aberta' : ''}`}>
      <button type="button" className="psi-gaveta-cab" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
        <span><b>{titulo}</b><small>{resumo}</small></span>
        <em>{aberta ? 'Fechar' : 'Ver detalhe'}</em>
      </button>
      {aberta && <div className="psi-gaveta-corpo">{children}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- os gráficos de cada tema */
const NOME_DO_FIM: Record<FimDaSessao, string> = {
  stop: 'Bateu o limite de perda', meta: 'Bateu a meta', zerou: 'O saldo acabou', parou_ganhando: 'Parou na mão, ganhando',
  parou_perdendo: 'Parou na mão, perdendo', parou_zero: 'Parou na mão, no zero',
}

/** Depois de cada fim de sessão: religou em 2 min, entre 2 e 10 min, ou parou. */
function DepoisDaSessao({ p, so }: { p: Psicologia; so: FimDaSessao[] }) {
  const linhas = (p.sessoes.fins ?? []).filter((f) => so.includes(f.fim) && f.n >= 10)
  if (!linhas.length) return null
  return (
    <div className="psi-bloco">
      <h4>O que o aluno faz depois que a sessão termina <small>sessões de I.A. em conta real</small></h4>
      <div className="psi-legenda"><span><i className="q" />Religou em menos de 2 min</span><span><i className="m" />Entre 2 e 10 min</span><span><i className="f" />Não voltou em 10 min</span></div>
      {linhas.map((f) => {
        const a = pct(f.volta2, f.n), b = pct(f.volta10 - f.volta2, f.n)
        return (
          <div className="psi-fim" key={f.fim}>
            <span><b>{NOME_DO_FIM[f.fim]}</b><small>{inteiro(f.n)} vezes · {inteiro(f.pessoas)} alunos · sessão típica de {tempoCurto(f.seg_mediano / 60)}</small></span>
            <div className="psi-pilha" role="img" aria-label={`${Math.round(a)}% religaram em menos de 2 minutos, ${Math.round(b)}% entre 2 e 10 minutos, ${Math.round(100 - a - b)}% pararam`}>
              <u className="q" style={{ width: `${a}%` }}>{a >= 9 ? `${Math.round(a)}%` : ''}</u>
              <u className="m" style={{ width: `${b}%` }}>{b >= 9 ? `${Math.round(b)}%` : ''}</u>
              <u className="f" style={{ width: `${100 - a - b}%` }}>{100 - a - b >= 9 ? `${Math.round(100 - a - b)}%` : ''}</u>
            </div>
            <small className="psi-fim-pe">As voltas em até 10 min somaram <b className={f.resultado_volta < 0 ? 'psi-neg' : 'psi-pos'}>{usd(f.resultado_volta)}</b>{f.trocou > 0 ? ` · ${pc(f.trocou, f.volta10)} trocaram de I.A.` : ''}</small>
          </div>
        )
      })}
    </div>
  )
}

function AulasQueViramDeposito({ p }: { p: Psicologia }) {
  const lista = (p.aulas.lista ?? []).filter((a) => a.sem_dep >= 15)
  const ordenada = [...lista].sort((a, b) => b.d24h / b.sem_dep - a.d24h / a.sem_dep)
  if (!ordenada.length) return null
  const Linha = ({ a }: { a: typeof ordenada[number] }) => (
    <div className="psi-aula" key={a.aula_id}>
      <span><b>{a.titulo}</b><small>{a.modulo ?? 'Trilha'} · {inteiro(a.sem_dep)} abriram sem ter depositado</small></span>
      <div className="psi-aula-barras">
        <i title="Depositaram em até 24 h"><u style={{ width: `${pct(a.d24h, a.sem_dep)}%` }} /><u className="rapido" style={{ width: `${pct(a.d30m, a.sem_dep)}%` }} /></i>
      </div>
      <b className="psi-aula-n">{pc(a.d24h, a.sem_dep)}</b>
      <small className="psi-aula-x">{inteiro(a.d30m)} em 30 min{a.min_mediano != null ? ` · típico ${tempoCurto(a.min_mediano)}` : ''}</small>
    </div>
  )
  return (
    <div className="psi-bloco">
      <h4>Depois de abrir a aula, quantos fazem o 1º depósito <small>só quem ainda não tinha depositado</small></h4>
      <div className="psi-legenda"><span><i className="forte" />Em até 30 min</span><span><i className="fraco" />Em até 24 h</span></div>
      {ordenada.slice(0, 6).map((a) => <Linha a={a} key={a.aula_id} />)}
      {ordenada.length > 6 && (
        <Gaveta titulo="Todas as aulas" resumo={<>Mais <b>{ordenada.length - 6}</b> aulas, da que mais antecede depósito para a que menos</>}>
          {ordenada.slice(6).map((a) => <Linha a={a} key={a.aula_id} />)}
        </Gaveta>
      )}
      <p className="psi-pe">Aulas do começo da trilha aparecem mais porque todo aluno novo passa por elas. A barra mostra o que acontece depois da aula, não o que a aula causa.</p>
    </div>
  )
}

type MedidaDaHora = 'deps' | 'aulas' | 'ops' | 'resultado'
const MEDIDAS: Array<{ id: MedidaDaHora; nome: string }> = [{ id: 'deps', nome: 'Depósitos' }, { id: 'aulas', nome: 'Aulas abertas' }, { id: 'ops', nome: 'Operações' }, { id: 'resultado', nome: 'Resultado dos alunos' }]

function RelogioDoAluno({ p }: { p: Psicologia }) {
  const [medida, setMedida] = useState<MedidaDaHora>('deps')
  const horas = useMemo(() => Array.from({ length: 24 }, (_, h) => (p.tempo.horas ?? []).find((x) => x.hora === h) ?? { hora: h, ops: 0, pessoas: 0, resultado: 0, deps: 0, dep_valor: 0, saques: 0, aulas: 0 }), [p])
  const max = Math.max(1, ...horas.map((h) => Math.abs(h[medida])))
  const topo = [...horas].sort((a, b) => (medida === 'resultado' ? a.resultado - b.resultado : b[medida] - a[medida]))[0]
  const texto = (h: typeof horas[number]) => (medida === 'resultado' ? usd(h.resultado) : medida === 'deps' ? `${inteiro(h.deps)} depósitos (${usd(h.dep_valor)})` : medida === 'aulas' ? `${inteiro(h.aulas)} aulas` : `${inteiro(h.ops)} operações de ${inteiro(h.pessoas)} alunos`)
  return (
    <div className="psi-bloco">
      <h4>O dia do aluno, hora a hora <small>hora de Brasília, tudo desde o começo</small></h4>
      <div className="psi-chips" role="group" aria-label="O que mostrar">
        {MEDIDAS.map((m) => <button type="button" key={m.id} aria-pressed={medida === m.id} onClick={() => setMedida(m.id)}>{m.nome}</button>)}
      </div>
      <div className={`psi-horas${medida === 'resultado' ? ' psi-horas-saldo' : ''}`}>
        {horas.map((h) => {
          const v = h[medida], alt = (Math.abs(v) / max) * 100
          return (
            <div key={h.hora} className={`psi-hora${h.hora === topo.hora ? ' topo' : ''}${v < 0 ? ' psi-neg' : ''}`} title={`${h.hora}h: ${texto(h)}`}>
              <i><u style={{ height: `${Math.max(v === 0 ? 0 : 3, alt)}%` }} /></i>
              <span>{h.hora % 3 === 0 ? `${h.hora}h` : ''}</span>
            </div>
          )
        })}
      </div>
      <p className="psi-pe"><b>{topo.hora}h</b> é {medida === 'resultado' ? 'a hora com o pior resultado' : 'o pico'}: {texto(topo)}.</p>
    </div>
  )
}

const FAIXAS_DEP = ['Menos de US$ 10', 'US$ 10 a 25', 'US$ 25 a 50', 'US$ 50 a 100', 'US$ 100 ou mais']
const FAIXAS_ESTUDO = ['Nenhuma aula concluída', '1 a 3 aulas', '4 a 9 aulas', '10 aulas ou mais']

function Dinheiro({ p }: { p: Psicologia }) {
  const j = p.jornada
  const passos = [{ n: j.dia0, r: 'No mesmo dia' }, { n: j.dia1a3, r: '1º ao 3º dia' }, { n: j.dia4a7, r: '4º ao 7º dia' }, { n: j.dia8, r: 'Do 8º em diante' }]
  const tot = passos.reduce((t, x) => t + x.n, 0), max = Math.max(1, ...passos.map((x) => x.n))
  const fx = p.dep1_faixas ?? []
  return (
    <>
      {tot > 0 && (
        <div className="psi-bloco">
          <h4>Quantos dias depois do cadastro vem o 1º depósito <small>{inteiro(tot)} primeiros depósitos</small></h4>
          <div className="psi-colunas">
            {passos.map((x) => (
              <div key={x.r}><b>{pc(x.n, tot)}</b><i><u style={{ height: `${(x.n / max) * 100}%` }} /></i><span>{x.r}</span><small>{inteiro(x.n)} alunos</small></div>
            ))}
          </div>
        </div>
      )}
      {fx.length > 0 && (
        <Gaveta titulo="Pelo tamanho do 1º depósito" resumo="Quantos voltam a depositar, quantos dias operam e quanto markup geram em cada faixa">
          <div className="psi-tabela" role="table">
            <div className="cab" role="row"><span>1º depósito</span><span>Alunos</span><span>Depositaram de novo</span><span>Dias operando</span><span>Markup</span><span>Resultado deles</span></div>
            {fx.map((f) => (
              <div role="row" key={f.ordem}><span>{FAIXAS_DEP[f.ordem]}</span><span>{inteiro(f.pessoas)}</span><span>{pc(f.voltaram, f.pessoas)}</span><span>{f.dias_media ?? '–'}</span><span>{usd(f.markup)}</span><span className={f.resultado < 0 ? 'psi-neg' : 'psi-pos'}>{usd(f.resultado)}</span></div>
            ))}
          </div>
        </Gaveta>
      )}
    </>
  )
}

function Estudo({ p }: { p: Psicologia }) {
  const e = p.estudo ?? []
  if (!e.length) return null
  return (
    <Gaveta titulo="Pelo número de aulas concluídas" resumo="Depósito, markup e impulso em cada degrau de estudo">
      <div className="psi-tabela" role="table">
        <div className="cab" role="row"><span>Estudo</span><span>Alunos</span><span>Depositaram</span><span>Total depositado</span><span>Markup</span><span>Religam no calor</span></div>
        {e.map((x) => (
          <div role="row" key={x.ordem}><span>{FAIXAS_ESTUDO[x.ordem]}</span><span>{inteiro(x.pessoas)}</span><span>{pc(x.depositaram, x.pessoas)}</span><span>{usd(x.dep_total)}</span><span>{usd(x.markup)}</span><span>{x.perdas >= 20 ? pc(x.revanches, x.perdas) : '–'}</span></div>
        ))}
      </div>
    </Gaveta>
  )
}

function IasNoImpulso({ p }: { p: Psicologia }) {
  const r = (p.sessoes.robos ?? []).filter((x) => x.perdas >= 20)
  if (!r.length) return null
  return (
    <Gaveta titulo="I.A. por I.A." resumo="Em qual delas o aluno mais religa depois de perder">
      <div className="psi-tabela c5" role="table">
        <div className="cab" role="row"><span>I.A.</span><span>Sessões</span><span>Alunos</span><span>Religam no calor</span><span>Resultado deles</span></div>
        {r.map((x) => (
          <div role="row" key={x.nome}><span>{x.nome}</span><span>{inteiro(x.n)}</span><span>{inteiro(x.pessoas)}</span><span>{pc(x.revanches, x.perdas)}</span><span className={x.resultado < 0 ? 'psi-neg' : 'psi-pos'}>{usd(x.resultado)}</span></div>
        ))}
      </div>
    </Gaveta>
  )
}

function Lives({ p }: { p: Psicologia }) {
  const top = (p.lives.top ?? []).filter((l) => l.deps > 0)
  const avisos = p.extras.avisos ?? []
  return (
    <>
      {top.length > 0 && (
        <Gaveta titulo="As lives com mais depósito" resumo={<>A primeira trouxe <b>{usd(top[0].valor)}</b> em {inteiro(top[0].deps)} depósitos</>}>
          <div className="psi-tabela c4" role="table">
            <div className="cab" role="row"><span>Live</span><span>Duração</span><span>Depósitos</span><span>Valor</span></div>
            {top.map((l) => <div role="row" key={l.inicio}><span>{fmtDiaHora.format(new Date(l.inicio))}</span><span>{tempoCurto(l.minutos)}</span><span>{inteiro(l.deps)}</span><span>{usd(l.valor)}</span></div>)}
          </div>
          <p className="psi-pe">Conta o depósito feito durante a live e até 30 minutos depois de ela terminar.</p>
        </Gaveta>
      )}
      {avisos.length > 0 && (
        <Gaveta titulo="Aviso por aviso" resumo="Quem tocou, quem abriu a plataforma em 1 hora e quem depositou em 24 h">
          <div className="psi-tabela c5" role="table">
            <div className="cab" role="row"><span>Aviso</span><span>Receberam</span><span>Tocaram</span><span>Abriram em 1 h</span><span>Depositaram em 24 h</span></div>
            {avisos.map((a) => <div role="row" key={`${a.criado_em}${a.titulo}`}><span>{a.titulo}<small>{fmtDiaHora.format(new Date(a.criado_em))}</small></span><span>{inteiro(a.pessoas)}</span><span>{inteiro(a.clicaram)}</span><span>{pc(a.abriram, a.pessoas)}</span><span>{inteiro(a.depositaram)}</span></div>)}
          </div>
        </Gaveta>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- as histórias reais */
function fraseDaHistoria(h: Historia): { rotulo: string; frase: ReactNode; tom: Sacada['tom'] } {
  const d = h.d
  switch (h.tipo) {
    case 'aula_deposito': return { rotulo: 'Aula e depósito', tom: 'ouro', frase: <>Assistiu a <b>«{String(d.aula)}»</b> e, {tempoCurto(num(d.minutos))} depois, depositou <b>{usd(num(d.valor), 2)}</b>{d.primeiro ? ' (o 1º depósito)' : ''}.{num(d.operacoes) > 0 ? <> Nos 7 dias seguintes fez {plural(num(d.operacoes), 'operação', 'operações')} e gerou <b>{usd(num(d.markup), 2)}</b> de markup.</> : ' Ainda não operou depois disso.'}</> }
    case 'cadeia': return { rotulo: 'Sequência no impulso', tom: 'alerta', frase: <>Ligou a I.A. <b>{inteiro(num(d.sessoes))} vezes seguidas</b> em {tempoCurto(Math.max(1, num(d.minutos)))}, cada uma menos de 2 minutos depois de perder a anterior. Terminou em <b>{usd(num(d.resultado), 2)}</b>.</> }
    case 'zerou_deposito': return { rotulo: 'Recarga no calor', tom: 'alerta', frase: <>Perdeu <b>{usd(num(d.perdeu), 2)}</b> na {String(d.ia)} e, {tempoCurto(num(d.minutos))} depois, depositou <b>{usd(num(d.valor), 2)}</b>.</> }
    case 'passou_da_meta': return { rotulo: 'Passou da meta', tom: 'ouro', frase: <>Bateu a meta com <b>{usd(num(d.ganhou), 2)}</b> na {String(d.ia)}, religou {tempoCurto(num(d.segundos) / 60)} depois e devolveu <b>{usd(num(d.devolveu), 2)}</b>.</> }
    case 'perda_aula': return { rotulo: 'Perdeu e foi estudar', tom: 'bom', frase: <>Perdeu <b>{usd(num(d.perdeu), 2)}</b> e, {tempoCurto(num(d.minutos))} depois, abriu a aula <b>«{String(d.aula)}»</b>.</> }
    default: return { rotulo: 'Sacou e voltou', tom: 'neutro', frase: <>Sacou <b>{usd(num(d.sacou), 2)}</b> e, {tempoCurto(num(d.horas) * 60)} depois, depositou <b>{usd(num(d.valor), 2)}</b> de novo.</> }
  }
}

function Historias({ lista, abrir }: { lista: Historia[]; abrir: (id: string) => void }) {
  const tipos = useMemo(() => {
    const vistos = new Set<string>(), porTipo = new Map<string, Historia[]>()
    for (const h of lista) {
      const chave = `${h.tipo}:${h.user_id}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      porTipo.set(h.tipo, [...(porTipo.get(h.tipo) ?? []), h])
    }
    return porTipo
  }, [lista])
  const [tipo, setTipo] = useState<string>('')
  const escolhidas = tipo ? (tipos.get(tipo) ?? []).slice(0, 12) : [...tipos.values()].flatMap((l) => l.slice(0, 2))
  if (!lista.length) return null
  return (
    <section className="psi-secao">
      <header><span className="psi-rot">Um aluno, um fato</span><h3>Histórias reais</h3><p>Os microcomportamentos um a um, com nome, hora e valor. Toque para abrir a linha do tempo do aluno.</p></header>
      <div className="psi-chips" role="group" aria-label="Tipo de história">
        <button type="button" aria-pressed={tipo === ''} onClick={() => setTipo('')}>Todas</button>
        {[...tipos.keys()].map((t) => <button type="button" key={t} aria-pressed={tipo === t} onClick={() => setTipo(t)}>{fraseDaHistoria({ tipo: t, d: {} } as Historia).rotulo}</button>)}
      </div>
      <div className="psi-historias">
        {escolhidas.map((h, i) => {
          const f = fraseDaHistoria(h)
          return (
            <button type="button" className={`psi-historia ${f.tom}`} key={`${h.tipo}${h.user_id}${i}`} onClick={() => abrir(h.user_id)}>
              <Avatar nome={h.nome} foto={h.foto_url} />
              <span>
                <small><b>{f.rotulo}</b> · {fmtDiaHora.format(new Date(h.quando))}</small>
                <strong>{h.nome}{h.parceiro ? <SeloDoParceiro codigo={h.parceiro} /> : null}</strong>
                <em>{f.frase}</em>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- a lista de alunos */
type Ordem = 'markup' | 'dep_total' | 'concl' | 'revanches' | 'resultado' | 'madrugada'
const ORDENS: Array<{ id: Ordem; nome: string }> = [{ id: 'markup', nome: 'Markup' }, { id: 'dep_total', nome: 'Depósitos' }, { id: 'concl', nome: 'Aulas' }, { id: 'revanches', nome: 'Impulso' }, { id: 'resultado', nome: 'Maior perda' }, { id: 'madrugada', nome: 'Madrugada' }]

function sinalDoAluno(a: AlunoDaPsicologia): string {
  if (a.perdas >= 3) return `Religou no calor em ${inteiro(a.revanches)} de ${inteiro(a.perdas)} perdas`
  if (a.man_apos_perda >= 5) return `Aumentou a entrada em ${inteiro(a.man_dobras)} de ${inteiro(a.man_apos_perda)} perdas na manual`
  if (a.ops > 0) return `${inteiro(a.ops)} operações em ${inteiro(a.dias)} dia${a.dias === 1 ? '' : 's'}`
  if (a.dep_n > 0) return 'Depositou e ainda não operou'
  if (a.demo_n > 0) return `${plural(a.demo_n, 'vez', 'vezes')} no treino`
  return a.concl > 0 ? plural(a.concl, 'aula concluída', 'aulas concluídas') : plural(a.abertas, 'aula aberta', 'aulas abertas')
}

function Alunos({ alunos, perfil, setPerfil, abrir }: { alunos: AlunoDaPsicologia[] | null; perfil: PerfilDoAluno | ''; setPerfil: (p: PerfilDoAluno | '') => void; abrir: (id: string) => void }) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('markup')
  const [limite, setLimite] = useState(25)
  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR')
    const l = (alunos ?? []).filter((a) => (!perfil || a.perfil === perfil) && (!q || (a.nome ?? '').toLocaleLowerCase('pt-BR').includes(q)))
    return l.sort((x, y) => (ordem === 'resultado' ? x.resultado - y.resultado : y[ordem] - x[ordem]))
  }, [alunos, busca, perfil, ordem])
  useEffect(() => setLimite(25), [busca, perfil, ordem])
  return (
    <section className="psi-secao" id="psi-alunos">
      <header><span className="psi-rot">Aluno por aluno</span><h3>{perfil ? PERFIS[perfil].nome : 'Todos os alunos'} <small>{alunos ? inteiro(filtrados.length) : ''}</small></h3>
        <p>{perfil ? PERFIS[perfil].frase : 'Toque num aluno para ver a linha do tempo dele: cada aula, depósito, sessão e o intervalo entre uma coisa e outra.'}</p></header>
      <div className="psi-filtros">
        <label className="psi-busca"><Icone nome="buscar" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar aluno pelo nome" /></label>
        <div className="psi-chips" role="group" aria-label="Ordenar por">
          {ORDENS.map((o) => <button type="button" key={o.id} aria-pressed={ordem === o.id} onClick={() => setOrdem(o.id)}>{o.nome}</button>)}
        </div>
        {perfil && <button type="button" className="psi-limpar" onClick={() => setPerfil('')}>Ver todos os perfis</button>}
      </div>
      {!alunos ? <p className="psi-vazio">Carregando os alunos…</p> : !filtrados.length ? <p className="psi-vazio">Nenhum aluno com esse filtro.</p> : (
        <div className="psi-alunos">
          {filtrados.slice(0, limite).map((a) => (
            <button type="button" className="psi-aluno" key={a.user_id} onClick={() => abrir(a.user_id)}>
              <Avatar nome={a.nome} foto={a.foto_url} />
              <span className="psi-aluno-nome"><b>{a.nome}{a.parceiro ? <SeloDoParceiro codigo={a.parceiro} /> : null}</b><small>{sinalDoAluno(a)}</small></span>
              <span className={`psi-tag ${(PERFIS[a.perfil] ?? PERFIS.operando).tom}`}>{(PERFIS[a.perfil] ?? PERFIS.operando).nome}</span>
              <span className="psi-aluno-n"><small>Aulas</small><b>{inteiro(a.concl)}</b></span>
              <span className="psi-aluno-n"><small>Depósitos</small><b>{a.dep_n ? usd(a.dep_total) : '–'}</b></span>
              <span className="psi-aluno-n"><small>Markup</small><b>{a.markup ? usd(a.markup, 2) : '–'}</b></span>
              <span className="psi-aluno-n"><small>Resultado</small><b className={a.resultado < 0 ? 'psi-neg' : a.resultado > 0 ? 'psi-pos' : ''}>{a.ops ? usd(a.resultado, 2) : '–'}</b></span>
              <span className="psi-aluno-n visto"><small>Visto</small><b>{haQuanto(a.visto_em)}</b></span>
            </button>
          ))}
          {filtrados.length > limite && <button type="button" className="psi-mais" onClick={() => setLimite((n) => n + 50)}>Mostrar mais {inteiro(Math.min(50, filtrados.length - limite))}</button>}
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- a tela */
const ORDEM_DOS_PERFIS: PerfilDoAluno[] = ['revanche', 'sumiu_na_perda', 'estuda_nao_deposita', 'depositou_parado', 'disciplinado', 'lucrando', 'operando', 'so_no_treino', 'curioso', 'parado_no_cadastro']

export function PsicologiaDoAluno({ sessao, marca, parceiro, pedido = 0 }: { sessao: SessaoTeeds; marca: string; parceiro: string; pedido?: number }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const par = parceiro === 'todos' ? '' : parceiro
  const [dados, setDados] = useState<Psicologia | null>(null)
  const [alunos, setAlunos] = useState<AlunoDaPsicologia[] | null>(null)
  const [erro, setErro] = useState('')
  const [tema, setTema] = useState<Tema>('aulas')
  const [perfil, setPerfil] = useState<PerfilDoAluno | ''>('')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setErro('')
    lerPsicologia(sessaoRef.current, marca, par).then((d) => { if (!vivo) return; if (d) setDados(d); else setErro('Não foi possível ler o comportamento dos alunos agora. Toque em Atualizar para tentar de novo.') }).catch(() => { if (vivo) setErro('Não foi possível ler o comportamento dos alunos agora. Toque em Atualizar para tentar de novo.') })
    lerAlunosDaPsicologia(sessaoRef.current, marca, par).then((l) => { if (vivo) setAlunos(l) }).catch(() => { if (vivo) setAlunos([]) })
    return () => { vivo = false }
  }, [marca, par, pedido])

  const sacadas = useMemo(() => (dados ? montarSacadas(dados) : []), [dados])
  const destaques = useMemo(() => {
    // as mais fortes, sem repetir tema mais de duas vezes
    const conta = new Map<Tema, number>(), l: Sacada[] = []
    for (const s of sacadas) { const n = conta.get(s.tema) ?? 0; if (n < 2 && l.length < 6) { l.push(s); conta.set(s.tema, n + 1) } }
    return l
  }, [sacadas])
  const doTema = sacadas.filter((s) => s.tema === tema)
  const verPerfil = (p: PerfilDoAluno) => { setPerfil(p); requestAnimationFrame(() => document.getElementById('psi-alunos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }

  if (erro && !dados) return <section className="psi"><p className="psi-erro" role="alert">{erro}</p></section>
  if (!dados) return <section className="psi" aria-busy="true"><div className="psi-esqueleto" /><div className="psi-esqueleto baixo" /><p className="psi-vazio">Cruzando aulas, depósitos, sessões e acessos de cada aluno…</p></section>

  const b = dados.base
  const perfis = dados.perfis ?? []
  const totalPerfis = perfis.reduce((t, x) => t + x.pessoas, 0)
  if (b.alunos === 0) return <section className="psi"><p className="psi-vazio">Ainda não há alunos ativos neste filtro.</p></section>

  return (
    <section className="psi">
      {erro && <p className="psi-erro" role="alert">{erro}</p>}
      <div className="psi-topo">
        <p className="psi-frase">Li o comportamento de <b>{inteiro(b.alunos)} alunos</b>: {inteiro(b.com_aula)} abriram aula, <b>{inteiro(b.depositaram)} depositaram</b> ({usd(b.dep_total)}) e {inteiro(b.operaram)} operaram em conta real, gerando <b>{usd(b.markup)}</b> de markup. Abaixo, o que eles fazem antes e depois de cada passo.</p>
        <p className="psi-aviso"><Icone nome="inteligencia" />Tudo aqui mostra o que acontece junto (quem fez uma coisa também fez a outra), não prova que uma causa a outra. Cada cartão traz o tamanho da amostra. A equipe fica fora da conta. Lido às {fmtHora.format(new Date(dados.lido_em))}.</p>
      </div>

      <section className="psi-secao">
        <header><span className="psi-rot">O que mais chama atenção hoje</span><h3>As sacadas mais fortes</h3></header>
        <div className="psi-destaques">{destaques.map((s) => <CartaoDaSacada s={s} grande key={s.id} />)}</div>
      </section>

      <section className="psi-secao">
        <header><span className="psi-rot">Cada aluno cai em um</span><h3>Perfis de comportamento</h3><p>Toque num perfil para ver quem são os alunos.</p></header>
        <div className="psi-perfis">
          {ORDEM_DOS_PERFIS.map((id) => {
            const x = perfis.find((q) => q.perfil === id)
            if (!x) return null
            const info = PERFIS[id]
            return (
              <button type="button" className={`psi-perfil ${info.tom}`} key={id} onClick={() => verPerfil(id)}>
                <span><b>{info.nome}</b><strong>{inteiro(x.pessoas)}</strong></span>
                <i><u style={{ width: `${Math.max(1.5, pct(x.pessoas, totalPerfis))}%` }} /></i>
                <small>{info.frase}</small>
                <em>{x.markup > 0 ? `${usd(x.markup)} de markup · ` : ''}{x.dep_total > 0 ? `${usd(x.dep_total)} depositados · ` : ''}{inteiro(x.vistos_7d)} vistos em 7 dias</em>
                <small className="psi-fazer-curto"><b>O que fazer</b>{info.fazer}</small>
              </button>
            )
          })}
        </div>
      </section>

      <section className="psi-secao">
        <header><span className="psi-rot">Tema por tema</span><h3>Todas as sacadas</h3></header>
        <div className="psi-temas" role="tablist" aria-label="Temas">
          {TEMAS.map((t) => <button type="button" role="tab" key={t.id} aria-selected={tema === t.id} onClick={() => setTema(t.id)}>{t.nome}<small>{sacadas.filter((s) => s.tema === t.id).length}</small></button>)}
        </div>
        <p className="psi-tema-frase">{TEMAS.find((t) => t.id === tema)?.frase}</p>
        {tema === 'aulas' && <AulasQueViramDeposito p={dados} />}
        {tema === 'perda' && <DepoisDaSessao p={dados} so={['stop', 'parou_perdendo', 'zerou']} />}
        {tema === 'ganho' && <DepoisDaSessao p={dados} so={['meta', 'parou_ganhando']} />}
        {tema === 'relogio' && <RelogioDoAluno p={dados} />}
        {tema === 'dinheiro' && <Dinheiro p={dados} />}
        {doTema.length ? <div className="psi-grade">{doTema.map((s) => <CartaoDaSacada s={s} key={s.id} />)}</div> : <p className="psi-vazio">Ainda não há dados suficientes para este tema neste filtro.</p>}
        <div className="psi-gavetas">
          {tema === 'aulas' && <Estudo p={dados} />}
          {tema === 'perda' && <IasNoImpulso p={dados} />}
          {tema === 'lives' && <Lives p={dados} />}
        </div>
      </section>

      <Historias lista={dados.historias ?? []} abrir={setAberto} />
      <Alunos alunos={alunos} perfil={perfil} setPerfil={setPerfil} abrir={setAberto} />
      {aberto && <LinhaDoTempo sessao={sessao} marca={marca} userId={aberto} resumo={alunos?.find((a) => a.user_id === aberto) ?? null} fechar={() => setAberto(null)} />}
      <p className="psi-pe fim">Histórico desde o começo da plataforma, só conta real (o treino aparece onde está escrito). Horas em Brasília. {fmtDia.format(new Date(dados.lido_em))}.</p>
    </section>
  )
}
