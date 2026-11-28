import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { duracaoLegivel } from '../../core/teeds/aulasVideos'
import {
  FAIXAS, aulaParaOAluno, aulasDaFormacao, baixarPlanilha, curvaDeRetencao, faixasDaAula, fracaoDe, lerDadosDasAulas,
  linhasDaAula, numerosDaAula, numerosDoAluno, situacaoDe,
  type AlunoDaBase, type AulaNaCentral, type DadosDasAulas, type LinhaDoAluno, type NumerosDaAula, type NumerosDoAluno, type Situacao,
} from '../../core/teeds/dadosDasAulas'
import { useParceirosDaMarca } from '../../core/teeds/parceiroEmFoco'
import { FiltroDeParceiros } from '../parceiros/FiltroDeParceiros'
import { MARCA } from '../../marca'
import './central-das-aulas.css'

/**
 * Central de dados das aulas (27/11/2026): Administração › Aulas › Central de dados.
 * Por aula: quantos dos alunos abriram, concluíram e quanto assistiram de fato; clicando,
 * a curva de "até onde chegam", as faixas e a lista de quem concluiu, parou ou nem abriu.
 * Por aluno: quanto da formação cada um consumiu; clicando, aula por aula.
 * As contas estão em core/teeds/dadosDasAulas.ts.
 */

const pct = (f: number) => `${Math.round(f * 100)}%`
const fr = (a: number, b: number) => (b > 0 ? a / b : 0)
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const horas = (s: number) => {
  if (s < 3600) return duracaoLegivel(s) || '0 min'
  const h = s / 3600
  return `${h >= 100 ? Math.round(h) : h.toFixed(1).replace('.', ',')} h`
}
const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ROTULO: Record<Situacao, string> = { concluiu: 'Concluiu', parou: 'Parou no meio', nao: 'Não abriu' }

type Periodo = '' | '7' | '30' | '90'
type Vista = { tipo: 'aulas' } | { tipo: 'alunos' } | { tipo: 'aula'; id: string } | { tipo: 'aluno'; id: string }

export function CentralDasAulas({ sessao, marca = MARCA.id }: { sessao: SessaoTeeds; marca?: string }) {
  const [dados, setDados] = useState<DadosDasAulas | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [parceiro, setParceiro] = useState('')
  const [plano, setPlano] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('')
  const [vista, setVista] = useState<Vista>({ tipo: 'aulas' })
  const parceiros = useParceirosDaMarca(sessao, marca)

  const pedido = useRef(0)
  const carregar = () => {
    const meu = ++pedido.current
    setCarregando(true); setErro('')
    lerDadosDasAulas(sessao, marca)
      .then((d) => { if (meu === pedido.current) setDados(d) })
      .catch((e) => { if (meu === pedido.current) setErro((e as Error).message) })
      .finally(() => { if (meu === pedido.current) setCarregando(false) })
  }
  useEffect(() => { setDados(null); setParceiro(''); setPlano(''); setVista({ tipo: 'aulas' }); carregar() }, [sessao.token, marca]) // eslint-disable-line react-hooks/exhaustive-deps
  // abrir uma aula ou um aluno leva a tela até o detalhe
  useEffect(() => {
    if (vista.tipo === 'aula' || vista.tipo === 'aluno') requestAnimationFrame(() => document.querySelector('.cda-cabeca')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [vista])

  // os filtros valem para tudo: a base de alunos muda, as porcentagens acompanham
  const alunos = useMemo(() => {
    if (!dados) return []
    const desde = periodo ? Date.now() - Number(periodo) * 864e5 : 0
    return dados.alunos.filter((a) =>
      (!parceiro || (parceiro === 'direto' ? !a.parceiro : a.parceiro === parceiro)) &&
      (!plano || a.planoId === plano) &&
      (!desde || Date.parse(a.criadoEm) >= desde))
  }, [dados, parceiro, plano, periodo])

  const formacao = useMemo(() => (dados ? aulasDaFormacao(dados.aulas) : []), [dados])
  const porAula = useMemo(() => (dados ? dados.aulas.map((a) => numerosDaAula(a, alunos, dados.mapa)) : []), [dados, alunos])
  const porAluno = useMemo(() => (dados ? alunos.map((a) => numerosDoAluno(a, formacao, dados.mapa)) : []), [dados, alunos, formacao])

  const opcoesDeParceiro = useMemo(() => {
    if (!dados) return []
    const cont = new Map<string, number>()
    for (const a of dados.alunos) cont.set(a.parceiro ?? 'direto', (cont.get(a.parceiro ?? 'direto') ?? 0) + 1)
    const lista = [...cont.keys()].filter((c) => c !== 'direto').sort()
    return [
      { id: '', nome: 'Todos', quantidade: dados.alunos.length },
      ...lista.map((c) => { const p = parceiros.find((x) => x.codigo === c); return { id: c, nome: p ? p.nome.split(' ')[0] : c, codigo: c, pessoa: p?.nome, quantidade: cont.get(c) } }),
      ...(cont.get('direto') ? [{ id: 'direto', nome: 'Direto', quantidade: cont.get('direto') }] : []),
    ]
  }, [dados, parceiros])
  const planos = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of dados?.alunos ?? []) if (a.planoId) m.set(a.planoId, a.plano || a.planoId)
    return [...m.entries()]
  }, [dados])

  if (!dados) {
    return (
      <section className="admin-card full cda">
        <div className="cda-vazio">{erro ? <>Não consegui ler os dados das aulas: {erro} <button type="button" className="cda-link" onClick={carregar}>Tentar de novo</button></> : 'Lendo as aulas e os alunos…'}</div>
      </section>
    )
  }

  const ativos = porAluno.filter((n) => n.iniciadas > 0).length
  const viramTudo = porAluno.filter((n) => n.total > 0 && n.concluidas >= n.total).length
  const consumoMedio = porAluno.length ? porAluno.reduce((s, n) => s + n.consumo, 0) / porAluno.length : 0
  const segundos = porAluno.reduce((s, n) => s + n.segundos, 0)
  const daFormacao = porAula.filter((n) => !n.aula.extra && !n.aula.estreiaEm)
  const maisFraca = [...daFormacao].filter((n) => n.elegiveis).sort((a, b) => fr(a.abriram, a.elegiveis) - fr(b.abriram, b.elegiveis))[0]

  const aulaAberta = vista.tipo === 'aula' ? porAula.find((n) => n.aula.id === vista.id) : null
  const alunoAberto = vista.tipo === 'aluno' ? porAluno.find((n) => n.aluno.userId === vista.id) ?? (() => { const a = dados.alunos.find((x) => x.userId === vista.id); return a ? numerosDoAluno(a, formacao, dados.mapa) : null })() : null

  return (
    <div className="cda">
      <section className="admin-card full cda-topo">
        <div className="cda-filtros">
          {opcoesDeParceiro.length > 2 && <FiltroDeParceiros rotulo="Alunos de" valor={parceiro} onTrocar={setParceiro} opcoes={opcoesDeParceiro} />}
          {planos.length > 1 && (
            <label className="cda-campo"><span>Plano</span>
              <select value={plano} onChange={(e) => setPlano(e.target.value)}>
                <option value="">Todos</option>
                {planos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </label>
          )}
          <label className="cda-campo"><span>Cadastro</span>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="">Desde o início</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </label>
          <span className="cda-lido">Atualizado {quando(new Date(dados.lidoEm).toISOString())}</span>
          <button type="button" className="cda-botao" disabled={carregando} onClick={carregar}>{carregando ? 'Atualizando…' : 'Atualizar'}</button>
        </div>

        <div className="cda-kpis">
          <Kpi rotulo="Alunos ativos" valor={alunos.length.toLocaleString('pt-BR')} nota="com acesso, sem a equipe" />
          <Kpi rotulo="Assistiram alguma aula" valor={pct(fr(ativos, alunos.length))} nota={`${ativos.toLocaleString('pt-BR')} de ${alunos.length.toLocaleString('pt-BR')}`} barra={fr(ativos, alunos.length)} />
          <Kpi rotulo="Consumo médio da formação" valor={pct(consumoMedio)} nota={`${formacao.length} aulas, assistido de fato`} barra={consumoMedio} />
          <Kpi rotulo="Viram tudo" valor={viramTudo.toLocaleString('pt-BR')} nota={`${pct(fr(viramTudo, alunos.length))} concluíram todas as aulas`} tom="ok" />
          <Kpi rotulo="Tempo assistido" valor={horas(segundos)} nota={ativos ? `${duracaoLegivel(segundos / ativos) || '0 min'} por aluno que assistiu` : 'só com o vídeo tocando'} />
          {maisFraca && <Kpi rotulo="Aula menos vista" valor={pct(fr(maisFraca.abriram, maisFraca.elegiveis))} nota={maisFraca.aula.titulo} tom="alerta" aoClicar={() => setVista({ tipo: 'aula', id: maisFraca.aula.id })} />}
        </div>

        {(vista.tipo === 'aulas' || vista.tipo === 'alunos') && (
          <div className="cda-abas" role="tablist">
            <button type="button" role="tab" aria-selected={vista.tipo === 'aulas'} onClick={() => setVista({ tipo: 'aulas' })}>Por aula <b>{formacao.length}</b></button>
            <button type="button" role="tab" aria-selected={vista.tipo === 'alunos'} onClick={() => setVista({ tipo: 'alunos' })}>Por aluno <b>{alunos.length.toLocaleString('pt-BR')}</b></button>
          </div>
        )}
      </section>

      {vista.tipo === 'aulas' && <PorAula numeros={porAula} aoAbrir={(id) => setVista({ tipo: 'aula', id })} />}
      {vista.tipo === 'alunos' && <PorAluno numeros={porAluno} aulas={dados.aulas} aoAbrir={(id) => setVista({ tipo: 'aluno', id })} />}
      {aulaAberta && <DetalheDaAula key={aulaAberta.aula.id} n={aulaAberta} alunos={alunos} dados={dados} aoVoltar={() => setVista({ tipo: 'aulas' })} aoAbrirAluno={(id) => setVista({ tipo: 'aluno', id })} />}
      {alunoAberto && <DetalheDoAluno n={alunoAberto} dados={dados} aoVoltar={() => setVista({ tipo: 'alunos' })} aoAbrirAula={(id) => setVista({ tipo: 'aula', id })} />}
    </div>
  )
}

function Kpi({ rotulo, valor, nota, barra, tom, aoClicar }: { rotulo: string; valor: string; nota?: string; barra?: number; tom?: 'ok' | 'alerta'; aoClicar?: () => void }) {
  const corpo = <>
    <span>{rotulo}</span>
    <strong>{valor}</strong>
    {barra != null && <i className="cda-mini"><i style={{ width: pct(barra) }} /></i>}
    {nota && <small>{nota}</small>}
  </>
  return aoClicar
    ? <button type="button" className={`cda-kpi ${tom ?? ''}`} onClick={aoClicar}>{corpo}</button>
    : <div className={`cda-kpi ${tom ?? ''}`}>{corpo}</div>
}

/** A barra empilhada: concluiu (cheia) + abriu e parou (clara), sobre todos que veem a aula. */
function BarraDaAula({ n }: { n: NumerosDaAula }) {
  const c = fr(n.concluiram, n.elegiveis), p = fr(n.abriram - n.concluiram, n.elegiveis)
  return (
    <span className="cda-barra" title={`${n.concluiram} concluíram · ${n.abriram - n.concluiram} pararam no meio · ${n.elegiveis - n.abriram} não abriram`}>
      <i className="c" style={{ width: pct(c) }} /><i className="p" style={{ width: pct(p) }} />
    </span>
  )
}

/* ------------------------------------------------------------- por aula */

function PorAula({ numeros, aoAbrir }: { numeros: NumerosDaAula[]; aoAbrir: (id: string) => void }) {
  const [ordem, setOrdem] = useState<'grade' | 'menos' | 'mais'>('grade')
  const formacao = numeros.filter((n) => !n.aula.extra)
  const extras = numeros.filter((n) => n.aula.extra)
  const ordenadas = ordem === 'grade' ? formacao : [...formacao].sort((a, b) => (ordem === 'menos' ? 1 : -1) * (fr(a.abriram, a.elegiveis) - fr(b.abriram, b.elegiveis)))
  const grupos: Array<{ modulo: AulaNaCentral['modulo']; itens: NumerosDaAula[] }> = []
  for (const n of ordenadas) {
    const g = ordem === 'grade' ? grupos.find((x) => x.modulo.id === n.aula.modulo.id) : grupos[0]
    if (g) g.itens.push(n)
    else grupos.push({ modulo: ordem === 'grade' ? n.aula.modulo : { id: 'todas', titulo: ordem === 'menos' ? 'Da menos vista para a mais vista' : 'Da mais vista para a menos vista', cor: 'var(--primary)' }, itens: [n] })
  }

  return (
    <>
      <section className="admin-card full">
        <header><div><span className="rot">Funil da formação</span><h3>Quantos chegam em cada aula</h3></div><small>Cada coluna é uma aula, na ordem da grade. Clara: abriram. Cheia: concluíram.</small></header>
        <div className="cda-funil" role="list">
          {formacao.map((n) => (
            <button type="button" role="listitem" key={n.aula.id} className={n.aula.estreiaEm ? 'estreia' : ''} onClick={() => aoAbrir(n.aula.id)}
              title={`${n.aula.numero}. ${n.aula.titulo}\n${pct(fr(n.abriram, n.elegiveis))} abriram · ${pct(fr(n.concluiram, n.elegiveis))} concluíram`}>
              <span className="cda-coluna" style={{ ['--cor' as string]: n.aula.modulo.cor }}>
                <i className="a" style={{ height: pct(fr(n.abriram, n.elegiveis)) }} />
                <i className="c" style={{ height: pct(fr(n.concluiram, n.elegiveis)) }} />
              </span>
              <small>{n.aula.numero}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-card full">
        <header>
          <div><span className="rot">Todas as aulas</span><h3>Quem assistiu cada aula</h3></div>
          <div className="cda-seg" role="group" aria-label="Ordem">
            {([['grade', 'Ordem da grade'], ['menos', 'Menos vistas'], ['mais', 'Mais vistas']] as const).map(([v, t]) => (
              <button type="button" key={v} aria-pressed={ordem === v} onClick={() => setOrdem(v)}>{t}</button>
            ))}
          </div>
        </header>
        <div className="cda-legenda"><span><i className="c" />Concluíram</span><span><i className="p" />Abriram e pararam</span><span><i className="n" />Não abriram</span></div>
        <div className="cda-lista">
          {grupos.map((g) => {
            const el = g.itens.reduce((s, n) => s + n.elegiveis, 0), ab = g.itens.reduce((s, n) => s + n.abriram, 0)
            return (
              <div key={g.modulo.id} className="cda-modulo" style={{ ['--cor' as string]: g.modulo.cor }}>
                <h4><i />{g.modulo.titulo}<small>{g.itens.length} {g.itens.length === 1 ? 'aula' : 'aulas'}{ordem === 'grade' ? ` · ${pct(fr(ab, el))} abriram, em média` : ''}</small></h4>
                {g.itens.map((n) => <LinhaDaAula key={n.aula.id} n={n} aoAbrir={aoAbrir} />)}
              </div>
            )
          })}
          {extras.length > 0 && (
            <div className="cda-modulo extra">
              <h4><i />Fora da formação<small>não conta no consumo da formação</small></h4>
              {extras.map((n) => <LinhaDaAula key={n.aula.id} n={n} aoAbrir={aoAbrir} />)}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function LinhaDaAula({ n, aoAbrir }: { n: NumerosDaAula; aoAbrir: (id: string) => void }) {
  return (
    <button type="button" className="cda-aula" onClick={() => aoAbrir(n.aula.id)}>
      <span className="cda-num">{n.aula.extra ? '★' : n.aula.numero}</span>
      <span className="cda-nome"><b>{n.aula.titulo}</b><small>{n.aula.estreiaEm ? `Estreia ${diaCurto(n.aula.estreiaEm)}` : [n.aula.duracao, n.aula.planos.length || n.aula.curso ? 'só alguns planos' : ''].filter(Boolean).join(' · ') || ' '}</small></span>
      <span className="cda-bloco-barra"><BarraDaAula n={n} /><small><b>{pct(fr(n.abriram, n.elegiveis))}</b> abriram · <b>{pct(fr(n.concluiram, n.elegiveis))}</b> concluíram</small></span>
      <span className="cda-dado"><b>{n.abriram ? pct(n.mediaAssistida) : '—'}</b><small>assistido de fato</small></span>
      <span className="cda-dado"><b>{n.abriram.toLocaleString('pt-BR')}</b><small>de {n.elegiveis.toLocaleString('pt-BR')}</small></span>
      <span className="cda-dado"><b>{horas(n.segundos)}</b><small>assistidas</small></span>
      <span className="cda-seta" aria-hidden="true">›</span>
    </button>
  )
}

/* --------------------------------------------------------- uma aula aberta */

function DetalheDaAula({ n, alunos, dados, aoVoltar, aoAbrirAluno }: { n: NumerosDaAula; alunos: AlunoDaBase[]; dados: DadosDasAulas; aoVoltar: () => void; aoAbrirAluno: (id: string) => void }) {
  const [quem, setQuem] = useState<Situacao | ''>('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'recente' | 'menos' | 'mais' | 'nome'>('recente')
  const [limite, setLimite] = useState(100)
  const linhas = useMemo(() => linhasDaAula(n.aula, alunos, dados.mapa), [n.aula, alunos, dados.mapa])
  const curva = useMemo(() => curvaDeRetencao(linhas), [linhas])
  const faixas = useMemo(() => faixasDaAula(linhas), [linhas])
  const conta = { concluiu: 0, parou: 0, nao: 0 }
  for (const l of linhas) conta[l.situacao]++
  const termo = semAcento(busca.trim())
  const filtradas = linhas
    .filter((l) => (!quem || l.situacao === quem) && (!termo || semAcento(l.aluno.nome).includes(termo) || l.aluno.email.toLowerCase().includes(termo)))
    .sort((a, b) => ordem === 'nome' ? a.aluno.nome.localeCompare(b.aluno.nome)
      : ordem === 'menos' ? a.fracao - b.fracao
      : ordem === 'mais' ? b.fracao - a.fracao
      : (b.progresso?.ultimaVez ?? '').localeCompare(a.progresso?.ultimaVez ?? ''))
  const maxFaixa = Math.max(1, ...faixas)
  // onde mais gente desiste: a maior queda entre dois pontos seguidos da curva (sem contar o fim)
  let queda = { em: -1, quanto: 0 }
  for (let i = 1; i < curva.length - 1; i++) if (curva[i - 1] - curva[i] > queda.quanto) queda = { em: i, quanto: curva[i - 1] - curva[i] }

  const planilha = () => baixarPlanilha(`aula-${n.aula.id}.csv`,
    ['Aluno', 'E-mail', 'Plano', 'Parceiro', 'Situação', 'Assistido de fato (%)', 'Minutos assistidos', 'Chegou até (%)', 'Aberturas', 'Primeira vez', 'Última vez'],
    filtradas.map((l) => [l.aluno.nome, l.aluno.email, l.aluno.plano, l.aluno.parceiro ?? 'direto', ROTULO[l.situacao], Math.round(l.fracao * 100),
      l.progresso ? Math.round(l.progresso.segundos / 60) : 0, l.progresso ? Math.round((l.progresso.concluida ? 1 : l.progresso.posicaoMax) * 100) : 0,
      l.progresso?.aberturas ?? 0, l.progresso ? quando(l.progresso.primeiraVez) : '', l.progresso ? quando(l.progresso.ultimaVez) : '']))

  return (
    <>
      <section className="admin-card full cda-cabeca" style={{ ['--cor' as string]: n.aula.modulo.cor }}>
        <button type="button" className="cda-voltar" onClick={aoVoltar}>‹ Todas as aulas</button>
        <div className="cda-titulo">
          <span className="rot">{n.aula.extra ? 'Fora da formação' : `Aula ${n.aula.numero} · ${n.aula.modulo.titulo}`}</span>
          <h2>{n.aula.titulo}</h2>
          {n.aula.estreiaEm && <p className="cda-nota">Estreia em {diaCurto(n.aula.estreiaEm)}: ainda fora das contas da formação.</p>}
        </div>
        <div className="cda-kpis">
          <Kpi rotulo="Abriram" valor={pct(fr(n.abriram, n.elegiveis))} nota={`${n.abriram.toLocaleString('pt-BR')} de ${n.elegiveis.toLocaleString('pt-BR')} alunos`} barra={fr(n.abriram, n.elegiveis)} />
          <Kpi rotulo="Concluíram" valor={pct(fr(n.concluiram, n.elegiveis))} nota={`${n.concluiram.toLocaleString('pt-BR')} alunos`} barra={fr(n.concluiram, n.elegiveis)} tom="ok" />
          <Kpi rotulo="Assistido de fato" valor={n.abriram ? pct(n.mediaAssistida) : '—'} nota="média de quem abriu" barra={n.mediaAssistida} />
          <Kpi rotulo="Tempo assistido" valor={horas(n.segundos)} nota={n.abriram ? `${duracaoLegivel(n.segundos / n.abriram) || '0 min'} por aluno` : undefined} />
          <Kpi rotulo="Aberturas" valor={n.aberturas.toLocaleString('pt-BR')} nota={n.abriram ? `${(n.aberturas / n.abriram).toFixed(1).replace('.', ',')} por aluno` : undefined} />
          <Kpi rotulo="Não abriram" valor={conta.nao.toLocaleString('pt-BR')} nota="alunos que veem a aula" tom="alerta" aoClicar={() => setQuem('nao')} />
        </div>
      </section>

      <div className="cda-dois">
        <section className="admin-card">
          <header><div><span className="rot">Retenção</span><h3>Até onde chegam no vídeo</h3></div><small>De quem abriu</small></header>
          {curva.length ? <Curva valores={curva} queda={queda.em} /> : <p className="cda-vazio">Ninguém abriu esta aula ainda.</p>}
          {queda.em > 0 && queda.quanto >= 0.05 && <p className="cda-nota">A maior saída é perto de <b>{Math.round((queda.em / (curva.length - 1)) * 100)}%</b> do vídeo: {pct(queda.quanto)} de quem abriu para ali.</p>}
        </section>
        <section className="admin-card">
          <header><div><span className="rot">Quanto assistiram</span><h3>Assistido de fato, por faixa</h3></div><small>Avançar o vídeo não conta</small></header>
          <div className="cda-faixas">
            {FAIXAS.map((f, i) => (
              <div key={f.nome}><span>{f.nome}</span><i><i style={{ width: pct(faixas[i] / maxFaixa) }} className={i === FAIXAS.length - 1 ? 'fim' : ''} /></i><b>{faixas[i].toLocaleString('pt-BR')}</b></div>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-card full">
        <header>
          <div><span className="rot">Alunos</span><h3>Quem viu e quem não viu</h3></div>
          <button type="button" className="cda-botao" onClick={planilha}>Baixar planilha</button>
        </header>
        <div className="cda-filtros linha">
          <div className="cda-seg" role="group" aria-label="Situação">
            <button type="button" aria-pressed={quem === ''} onClick={() => setQuem('')}>Todos <b>{linhas.length}</b></button>
            <button type="button" aria-pressed={quem === 'concluiu'} onClick={() => setQuem('concluiu')}><i className="pt c" />Concluíram <b>{conta.concluiu}</b></button>
            <button type="button" aria-pressed={quem === 'parou'} onClick={() => setQuem('parou')}><i className="pt p" />Pararam no meio <b>{conta.parou}</b></button>
            <button type="button" aria-pressed={quem === 'nao'} onClick={() => setQuem('nao')}><i className="pt n" />Não abriram <b>{conta.nao}</b></button>
          </div>
          <label className="cda-busca"><input value={busca} placeholder="Procurar aluno por nome ou e-mail" onChange={(e) => { setBusca(e.target.value); setLimite(100) }} /></label>
          <label className="cda-campo"><span>Ordem</span>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
              <option value="recente">Assistiu por último</option><option value="menos">Menos assistido</option><option value="mais">Mais assistido</option><option value="nome">Nome</option>
            </select>
          </label>
        </div>
        <ListaDeAlunosDaAula linhas={filtradas.slice(0, limite)} aoAbrir={aoAbrirAluno} />
        {filtradas.length > limite && <button type="button" className="cda-mais" onClick={() => setLimite((l) => l + 200)}>Mostrar mais ({(filtradas.length - limite).toLocaleString('pt-BR')})</button>}
        {!filtradas.length && <p className="cda-vazio">Nenhum aluno aqui.</p>}
      </section>
    </>
  )
}

function Pessoa({ aluno }: { aluno: AlunoDaBase }) {
  return (
    <span className="cda-pessoa">
      {aluno.foto ? <img src={aluno.foto} alt="" loading="lazy" /> : <i>{iniciais(aluno.nome)}</i>}
      <span><b>{aluno.nome}</b><small>{aluno.email}</small></span>
    </span>
  )
}

function ListaDeAlunosDaAula({ linhas, aoAbrir }: { linhas: LinhaDoAluno[]; aoAbrir: (id: string) => void }) {
  return (
    <div className="cda-tabela">
      <div className="cda-tr cab"><span>Aluno</span><span>Plano</span><span>Assistido de fato</span><span>Chegou até</span><span>Abriu</span><span>Última vez</span></div>
      {linhas.map((l) => {
        const p = l.progresso
        return (
          <button type="button" className="cda-tr" key={l.aluno.userId} onClick={() => aoAbrir(l.aluno.userId)}>
            <Pessoa aluno={l.aluno} />
            <span className="cda-plano">{l.aluno.plano || '—'}{l.aluno.parceiro && <em>/{l.aluno.parceiro}</em>}</span>
            <span className="cda-prog">{p ? <><i className={`cda-mini ${l.situacao}`}><i style={{ width: pct(l.fracao) }} /></i><b>{pct(l.fracao)}</b><small>{duracaoLegivel(p.segundos) || '0 min'}{p.duracaoSeg ? ` de ${duracaoLegivel(p.duracaoSeg)}` : ''}</small></> : <em className="cda-selo nao">Não abriu</em>}</span>
            <span className="num">{p ? (p.concluida ? <em className="cda-selo concluiu">Concluiu</em> : pct(p.posicaoMax)) : '—'}</span>
            <span className="num">{p ? `${p.aberturas}×` : '—'}</span>
            <span className="num">{p ? quando(p.ultimaVez) : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A curva de retenção em SVG: eixo x = ponto do vídeo, eixo y = % de quem abriu. */
function Curva({ valores, queda }: { valores: number[]; queda: number }) {
  const L = 560, A = 180, m = { e: 34, d: 10, t: 10, b: 24 }
  const x = (i: number) => m.e + (i / (valores.length - 1)) * (L - m.e - m.d)
  const y = (v: number) => m.t + (1 - v) * (A - m.t - m.b)
  const linha = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg className="cda-curva" viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Curva de retenção da aula">
      {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} /><text x={m.e - 6} y={y(v) + 3} textAnchor="end">{Math.round(v * 100)}%</text></g>)}
      {[0, 25, 50, 75, 100].map((v) => <text key={v} className="x" x={x((v / 100) * (valores.length - 1))} y={A - 6} textAnchor="middle">{v}%</text>)}
      <path className="area" d={`${linha}L${x(valores.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} />
      <path className="traco" d={linha} />
      {queda > 0 && <circle cx={x(queda)} cy={y(valores[queda])} r="4.5" />}
    </svg>
  )
}

/* ------------------------------------------------------------ por aluno */

function PorAluno({ numeros, aulas, aoAbrir }: { numeros: NumerosDoAluno[]; aulas: AulaNaCentral[]; aoAbrir: (id: string) => void }) {
  const [quem, setQuem] = useState<'' | 'tudo' | 'comecou' | 'nunca'>('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'recente' | 'menos' | 'mais' | 'nome' | 'novo'>('mais')
  const [limite, setLimite] = useState(100)
  const titulo = (id: string | null) => (id ? aulas.find((a) => a.id === id)?.titulo ?? id : '')
  const conta = { tudo: 0, comecou: 0, nunca: 0 }
  const grupo = (n: NumerosDoAluno) => (n.total > 0 && n.concluidas >= n.total ? 'tudo' : n.iniciadas ? 'comecou' : 'nunca')
  for (const n of numeros) conta[grupo(n)]++
  const termo = semAcento(busca.trim())
  const filtrados = numeros
    .filter((n) => (!quem || grupo(n) === quem) && (!termo || semAcento(n.aluno.nome).includes(termo) || n.aluno.email.toLowerCase().includes(termo)))
    .sort((a, b) => ordem === 'nome' ? a.aluno.nome.localeCompare(b.aluno.nome)
      : ordem === 'menos' ? a.consumo - b.consumo
      : ordem === 'mais' ? b.consumo - a.consumo || b.segundos - a.segundos
      : ordem === 'novo' ? b.aluno.criadoEm.localeCompare(a.aluno.criadoEm)
      : (b.ultimaVez ?? '').localeCompare(a.ultimaVez ?? ''))
  // quantos alunos em cada faixa de consumo (0%, 1–25%, … 100%)
  const faixas = [0, 0, 0, 0, 0, 0]
  for (const n of numeros) faixas[n.consumo <= 0 ? 0 : n.consumo >= 0.995 ? 5 : 1 + Math.min(3, Math.floor(n.consumo * 4))]++
  const nomesFaixa = ['Nada', 'Até 25%', '25 a 50%', '50 a 75%', '75 a 99%', 'Tudo']
  const maxF = Math.max(1, ...faixas)

  const planilha = () => baixarPlanilha('alunos-aulas.csv',
    ['Aluno', 'E-mail', 'Plano', 'Parceiro', 'Cadastro', 'Aulas concluídas', 'Aulas iniciadas', 'Aulas da formação', 'Consumo da formação (%)', 'Minutos assistidos', 'Última aula', 'Última vez'],
    filtrados.map((n) => [n.aluno.nome, n.aluno.email, n.aluno.plano, n.aluno.parceiro ?? 'direto', diaCurto(n.aluno.criadoEm), n.concluidas, n.iniciadas, n.total,
      Math.round(n.consumo * 100), Math.round(n.segundos / 60), titulo(n.ultimaAula), quando(n.ultimaVez)]))

  return (
    <>
      <section className="admin-card full">
        <header><div><span className="rot">Distribuição</span><h3>Quanto da formação cada aluno consumiu</h3></div><small>Assistido de fato, somando todas as aulas</small></header>
        <div className="cda-histo">
          {faixas.map((q, i) => (
            <div key={i} className={i === 0 ? 'zero' : i === 5 ? 'tudo' : ''}>
              <b>{q.toLocaleString('pt-BR')}</b>
              <span><i style={{ height: pct(q / maxF) }} /></span>
              <small>{nomesFaixa[i]}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card full">
        <header>
          <div><span className="rot">Alunos</span><h3>Consumo de cada aluno</h3></div>
          <button type="button" className="cda-botao" onClick={planilha}>Baixar planilha</button>
        </header>
        <div className="cda-filtros linha">
          <div className="cda-seg" role="group" aria-label="Situação">
            <button type="button" aria-pressed={quem === ''} onClick={() => setQuem('')}>Todos <b>{numeros.length}</b></button>
            <button type="button" aria-pressed={quem === 'tudo'} onClick={() => setQuem('tudo')}><i className="pt c" />Viram tudo <b>{conta.tudo}</b></button>
            <button type="button" aria-pressed={quem === 'comecou'} onClick={() => setQuem('comecou')}><i className="pt p" />Começaram <b>{conta.comecou}</b></button>
            <button type="button" aria-pressed={quem === 'nunca'} onClick={() => setQuem('nunca')}><i className="pt n" />Nunca abriram <b>{conta.nunca}</b></button>
          </div>
          <label className="cda-busca"><input value={busca} placeholder="Procurar aluno por nome ou e-mail" onChange={(e) => { setBusca(e.target.value); setLimite(100) }} /></label>
          <label className="cda-campo"><span>Ordem</span>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
              <option value="mais">Mais consumo</option><option value="menos">Menos consumo</option><option value="recente">Assistiu por último</option><option value="novo">Cadastro mais novo</option><option value="nome">Nome</option>
            </select>
          </label>
        </div>
        <div className="cda-tabela alunos">
          <div className="cda-tr cab"><span>Aluno</span><span>Plano</span><span>Consumo da formação</span><span>Aulas concluídas</span><span>Tempo</span><span>Última aula</span></div>
          {filtrados.slice(0, limite).map((n) => (
            <button type="button" className="cda-tr" key={n.aluno.userId} onClick={() => aoAbrir(n.aluno.userId)}>
              <Pessoa aluno={n.aluno} />
              <span className="cda-plano">{n.aluno.plano || '—'}{n.aluno.parceiro && <em>/{n.aluno.parceiro}</em>}</span>
              <span className="cda-prog"><i className={`cda-mini ${grupo(n) === 'tudo' ? 'concluiu' : 'parou'}`}><i style={{ width: pct(n.consumo) }} /></i><b>{pct(n.consumo)}</b></span>
              <span className="num"><b>{n.concluidas}</b> de {n.total}{n.iniciadas > n.concluidas && <small>{n.iniciadas - n.concluidas} pela metade</small>}</span>
              <span className="num">{n.segundos ? horas(n.segundos) : '—'}</span>
              <span className="cda-ultima">{n.ultimaAula ? <><b>{titulo(n.ultimaAula)}</b><small>{quando(n.ultimaVez)}</small></> : <small>Nunca abriu uma aula</small>}</span>
            </button>
          ))}
        </div>
        {filtrados.length > limite && <button type="button" className="cda-mais" onClick={() => setLimite((l) => l + 200)}>Mostrar mais ({(filtrados.length - limite).toLocaleString('pt-BR')})</button>}
        {!filtrados.length && <p className="cda-vazio">Nenhum aluno aqui.</p>}
      </section>
    </>
  )
}

/* -------------------------------------------------------- um aluno aberto */

function DetalheDoAluno({ n, dados, aoVoltar, aoAbrirAula }: { n: NumerosDoAluno; dados: DadosDasAulas; aoVoltar: () => void; aoAbrirAula: (id: string) => void }) {
  const meus = dados.mapa.get(n.aluno.userId)
  const aulas = dados.aulas.filter((a) => aulaParaOAluno(a, n.aluno))
  const grupos: Array<{ modulo: AulaNaCentral['modulo']; aulas: AulaNaCentral[] }> = []
  for (const a of aulas) {
    const g = grupos.find((x) => x.modulo.id === a.modulo.id)
    if (g) g.aulas.push(a); else grupos.push({ modulo: a.modulo, aulas: [a] })
  }
  return (
    <>
      <section className="admin-card full cda-cabeca">
        <button type="button" className="cda-voltar" onClick={aoVoltar}>‹ Todos os alunos</button>
        <div className="cda-titulo cda-titulo-aluno">
          <Pessoa aluno={n.aluno} />
          <p className="cda-nota">{n.aluno.plano || 'Sem plano'}{n.aluno.parceiro ? ` · aluno do /${n.aluno.parceiro}` : ' · direto'} · cadastro em {diaCurto(n.aluno.criadoEm)}{n.aluno.vistoEm ? ` · na plataforma ${quando(n.aluno.vistoEm)}` : ''}</p>
        </div>
        <div className="cda-kpis">
          <Kpi rotulo="Consumo da formação" valor={pct(n.consumo)} nota="assistido de fato" barra={n.consumo} />
          <Kpi rotulo="Aulas concluídas" valor={`${n.concluidas} de ${n.total}`} barra={fr(n.concluidas, n.total)} tom="ok" />
          <Kpi rotulo="Pela metade" valor={String(n.iniciadas - n.concluidas)} nota="abriu e não terminou" />
          <Kpi rotulo="Não abriu" valor={String(n.total - n.iniciadas)} nota="aulas da formação" tom="alerta" />
          <Kpi rotulo="Tempo assistido" valor={n.segundos ? horas(n.segundos) : '—'} nota="só com o vídeo tocando" />
          <Kpi rotulo="Última aula" valor={quando(n.ultimaVez)} nota={n.ultimaAula ? dados.aulas.find((a) => a.id === n.ultimaAula)?.titulo : 'nunca abriu'} />
        </div>
      </section>
      <section className="admin-card full">
        <header><div><span className="rot">Aula por aula</span><h3>O que {n.aluno.nome.split(' ')[0]} assistiu</h3></div><small>Clique numa aula para ver a turma inteira nela</small></header>
        <div className="cda-lista">
          {grupos.map((g) => (
            <div key={g.modulo.id} className="cda-modulo" style={{ ['--cor' as string]: g.modulo.cor }}>
              <h4><i />{g.modulo.titulo}</h4>
              {g.aulas.map((a) => {
                const p = meus?.get(a.id), s = situacaoDe(p), f = fracaoDe(p)
                return (
                  <button type="button" key={a.id} className="cda-aula do-aluno" onClick={() => aoAbrirAula(a.id)}>
                    <span className="cda-num">{a.extra ? '★' : a.numero}</span>
                    <span className="cda-nome"><b>{a.titulo}</b><small>{a.estreiaEm ? `Estreia ${diaCurto(a.estreiaEm)}` : a.duracao || ' '}</small></span>
                    <span className="cda-bloco-barra"><i className={`cda-mini grande ${s}`}><i style={{ width: pct(f) }} /></i><small><b>{p ? pct(f) : '—'}</b> assistido de fato{p ? ` · chegou até ${pct(p.concluida ? 1 : p.posicaoMax)}` : ''}</small></span>
                    <span className="cda-dado"><em className={`cda-selo ${s}`}>{ROTULO[s]}</em></span>
                    <span className="cda-dado"><b>{p ? `${p.aberturas}×` : '—'}</b><small>abriu</small></span>
                    <span className="cda-dado"><b>{p ? duracaoLegivel(p.segundos) || '0 min' : '—'}</b><small>{p ? quando(p.ultimaVez) : ' '}</small></span>
                    <span className="cda-seta" aria-hidden="true">›</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
