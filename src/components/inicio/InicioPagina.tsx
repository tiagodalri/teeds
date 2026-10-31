import { useEffect, useMemo, useState } from 'react'
import { ConvitesDoInicio } from '../notificacoes/Notificacoes'
import type { WorkspacePage } from '../WorkspaceNav'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { acompanharVivas, type SessaoViva } from '../../core/teeds/servidorRobos'
import { listarSessoes, type SessaoServidor } from '../../core/teeds/sessoesServidor'
import { planoDoDia, planoSimples, sincronizarPlanoDoDia } from '../../core/teeds/planoDoDia'
import { identidade } from '../../core/deriv/branding'
import { useRobosDisponiveis } from '../../core/teeds/catalogoRobos'
import { contagemDoEstado } from '../RobotResumo'
import { pedirModeloDaVitrine } from '../RobotSetup'
import { pedirPreparo } from '../RobotsPanel'
import { aulasVistas, MODULOS } from '../../core/teeds/aulas'
import { SERVIDOR } from '../../core/teeds/config'
import { capaDaAula } from '../capasAulas'
import { MARCA } from '../../marca'
import { InicioPanel, type DadosDoInicio } from './InicioPanel'

/**
 * A home com os dados de verdade (20/10/2026):
 *  - I.A.s ligadas: o mesmo acompanhamento da tela de robôs;
 *  - o dia: as sessões das I.A.s de hoje, na conta escolhida (demo ou real);
 *  - meta e limite: o plano do dia (instrumento da home ou Gerenciamento),
 *    guardado também na conta para valer em todos os aparelhos;
 *  - mercado: a mesma fonte da aba Notícias;
 *  - aula: a primeira que ainda não foi assistida;
 *  - jornada: o que esta pessoa já fez (e fica marcado neste aparelho).
 */

interface Props {
  sessao: SessaoTeeds | null
  nome: string
  /**
   * demo: como a conta aparece na tela (rótulo). operaEmDemo: a conta de verdade
   * em que as I.A.s operam (null enquanto a corretora não respondeu). São
   * diferentes no acesso somente-demo e nos rótulos trocados.
   */
  conta: { conectada: boolean; demo: boolean; operaEmDemo?: boolean | null; saldo: number | null; moeda: string }
  treino: { noAr: boolean; apresentador?: string } | null
  aoIr: (tela: WorkspacePage) => void
  aoConectar?: () => void
  aoAbrirCarteira?: () => void
  /** As sessões vivas que a tela de robôs já busca: a home não consulta de novo. */
  vivas?: SessaoViva[]
}

type Cotacao = { id: string; nome: string; preco: number; variacao: number; moeda: string; serie?: number[] }
type Noticia = { id: string; titulo: string; fonte: string; quando: string; link: string }

const num = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
function preco(c: Cotacao) {
  if (c.moeda === 'pts') return num(c.preco, 0)
  if (c.id === 'bitcoin') return `${c.moeda} ${num(c.preco, 0)}`
  return `${c.moeda} ${num(c.preco, c.moeda === 'R$' ? 3 : 2)}`
}
function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : h < 48 ? 'ontem' : `há ${Math.round(h / 24)} dias`
}

// o que a pessoa já fez fica marcado (a jornada não volta a pedir)
const CHAVE_JORNADA = `${MARCA.id}.jornada`
function jornadaGuardada(): { demo?: boolean; primeiraIa?: boolean } {
  try { return JSON.parse(localStorage.getItem(CHAVE_JORNADA) || '{}') } catch { return {} }
}
function marcarJornada(p: { demo?: boolean; primeiraIa?: boolean }) {
  try { localStorage.setItem(CHAVE_JORNADA, JSON.stringify({ ...jornadaGuardada(), ...p })) } catch { /* só agora */ }
}

const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
// o último dia lido fica guardado enquanto o app está aberto: voltar ao Início
// mostra o Hoje na hora, sem passar pelo vazio até a próxima consulta
// 31/10/2026: também fica no aparelho, para o app reaberto já mostrar o dia
// enquanto a consulta nova chega
const CHAVE_DIA = `${MARCA.id}.inicio.dia`
let diaGuardado: { userId: string; desde: number; sessoes: SessaoServidor[] } | null = (() => {
  try { return JSON.parse(localStorage.getItem(CHAVE_DIA) || 'null') } catch { return null }
})()
const diaJaLido = (userId?: string) =>
  diaGuardado && diaGuardado.userId === userId && diaGuardado.desde === inicioDoDia() ? diaGuardado.sessoes : null
function guardarDia(d: NonNullable<typeof diaGuardado>) {
  diaGuardado = d
  try { localStorage.setItem(CHAVE_DIA, JSON.stringify(d)) } catch { /* só agora */ }
}

// o último mercado lido aparece na hora; o novo chega por trás
const CHAVE_MERCADO = `${MARCA.id}.inicio.mercado`
function mercadoGuardado(): { cotacoes: Cotacao[]; noticias: Noticia[] } | null {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_MERCADO) || 'null')
    return m && Date.now() - m.em < 6 * 3600_000 ? { cotacoes: m.cotacoes ?? [], noticias: m.noticias ?? [] } : null
  } catch { return null }
}

export function InicioPagina({ sessao, nome, conta, treino, aoIr, aoConectar, aoAbrirCarteira, vivas: vivasDeFora }: Props) {
  const [vivasProprias, setVivas] = useState<SessaoViva[]>([])
  const vivas = vivasDeFora ?? vivasProprias
  const [sessoesHoje, setSessoesHoje] = useState<SessaoServidor[] | null>(() => diaJaLido(sessao?.usuario.id))
  const [mercado, setMercado] = useState<{ cotacoes: Cotacao[]; noticias: Noticia[] } | null>(mercadoGuardado)
  // a leitura do mercado falhou (o bloco deixa de "carregar" para sempre e oferece tentar de novo)
  const [mercadoFalhou, setMercadoFalhou] = useState(false)
  const [rodadaMercado, setRodadaMercado] = useState(0)
  const [jornada, setJornada] = useState(jornadaGuardada)
  const [plano, setPlano] = useState(planoDoDia)
  const disponiveis = useRobosDisponiveis()

  // o plano que está na conta (feito em outro aparelho) passa a valer aqui
  useEffect(() => {
    if (!sessao) return
    let vivo = true
    void sincronizarPlanoDoDia(sessao).then((p) => { if (vivo) setPlano(p) })
    return () => { vivo = false }
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // I.A.s ligadas agora (o mesmo compasso da tela de robôs)
  useEffect(() => {
    if (vivasDeFora) return
    if (!sessao) { setVivas([]); return }
    return acompanharVivas(sessao, setVivas)
  }, [sessao?.usuario.id, !!vivasDeFora]) // eslint-disable-line react-hooks/exhaustive-deps

  // o dia: sessões de hoje (as que já pararam também contam)
  useEffect(() => {
    if (!sessao) return
    let vivo = true
    // desde a meia-noite (com folga de 1 h), e espaço para um dia cheio de sessões
    const ler = () => listarSessoes(sessao, (Date.now() - inicioDoDia()) / 3600_000 + 1, 300)
      .then((l) => {
        const doDia = l.filter((s) => Date.parse(s.criadaEm) >= inicioDoDia())
        guardarDia({ userId: sessao.usuario.id, desde: inicioDoDia(), sessoes: doDia })
        if (vivo) setSessoesHoje(doDia)
      })
      .catch(() => undefined)
    ler()
    const t = window.setInterval(ler, 30_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // mercado: a mesma fonte da aba Notícias, a cada 5 min
  useEffect(() => {
    if (!MARCA.noticias) return
    let vivo = true
    const ler = () => fetch(`${SERVIDOR.url}/publico/mercado`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return
        if (d) {
          const m = { cotacoes: d.cotacoes ?? [], noticias: d.noticias ?? [] }
          try { localStorage.setItem(CHAVE_MERCADO, JSON.stringify({ ...m, em: Date.now() })) } catch { /* só agora */ }
          setMercado(m); setMercadoFalhou(false)
        } else setMercadoFalhou(true)
      })
      .catch(() => { if (vivo) setMercadoFalhou(true) })
    setMercadoFalhou(false)
    ler()
    const t = window.setInterval(ler, 5 * 60_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [rodadaMercado])

  // a jornada aprende com o que aparece: sessão em demo, primeira I.A.
  useEffect(() => {
    const todas = [...vivas.map((v) => ({ demo: v.demo })), ...(sessoesHoje ?? []).map((s) => ({ demo: s.demo }))]
    if (!todas.length) return
    const novo = { demo: jornada.demo || todas.some((s) => s.demo), primeiraIa: true }
    if (novo.demo !== jornada.demo || !jornada.primeiraIa) { marcarJornada(novo); setJornada((j) => ({ ...j, ...novo })) }
  }, [vivas, sessoesHoje]) // eslint-disable-line react-hooks/exhaustive-deps

  const ligadas = vivas.filter((v) => v.estado?.rodando || v.estado?.emOperacao)
  // O dia soma a conta em que as I.A.s operam de verdade, não o rótulo da tela
  // (29/10/2026, Victor: com rótulos trocados o Início comparava a sessão demo
  // com a conta "real" da tela e o Hoje zerava; piscava enquanto a corretora
  // respondia). Antes de a corretora responder, vale a conta da sessão mais recente.
  const demoDoDia = conta.operaEmDemo ?? sessoesHoje?.[0]?.demo ?? conta.demo
  const daConta = (sessoesHoje ?? []).filter((s) => s.demo === demoDoDia)
  const hoje: DadosDoInicio['hoje'] = !daConta.length ? null : {
    resultado: daConta.reduce((t, s) => t + s.resultado, 0),
    operacoes: daConta.reduce((t, s) => t + s.operacoes, 0),
    vitorias: daConta.reduce((t, s) => t + s.ganhas, 0),
    derrotas: daConta.reduce((t, s) => t + s.perdidas, 0),
  }
  const planoValido = plano && plano.metaUsd > 0 && plano.limiteUsd > 0 ? { meta: plano.metaUsd, limite: plano.limiteUsd } : null

  // a frota: as I.A.s da casa que estão no catálogo; as que estão no ar somam as sessões delas
  const frota: DadosDoInicio['frota'] = MARCA.robos
    .filter((id) => !disponiveis || disponiveis.includes(id) || ligadas.some((v) => v.roboId === id))
    .map((id) => {
      const ident = identidade(id)
      const delas = ligadas.filter((v) => v.roboId === id)
      const primeira = delas[0]?.estado
      const c = primeira ? contagemDoEstado(primeira) : null
      return {
        id, nome: ident.nome, chamada: ident.chamada, noAr: delas.length > 0,
        operando: delas.some((v) => v.estado.emOperacao),
        resultado: delas.reduce((t, v) => t + (v.estado.resultado ?? 0), 0),
        analise: c && !c.sequencia && c.alvo > 0 ? { n: c.n, alvo: c.alvo } : null,
      }
    })

  // a próxima aula: a primeira que ainda não foi assistida
  const aula = useMemo(() => {
    const vistas = aulasVistas()
    for (const m of MODULOS) {
      const i = m.aulas.findIndex((a) => !vistas.has(a.id))
      if (i >= 0) {
        const n = MODULOS.indexOf(m) + 1
        return { modulo: `Módulo ${n} · ${m.titulo}`, titulo: m.aulas[i].titulo, capa: capaDaAula(m.aulas[i].id), feitas: m.aulas.filter((a) => vistas.has(a.id)).length, total: m.aulas.length }
      }
    }
    return null
  }, [])

  const IDS = ['dolar', 'ibovespa', 'sp500', 'bitcoin']
  const d: DadosDoInicio = {
    nome,
    conta: { conectada: conta.conectada, demo: conta.demo, operaEmDemo: conta.operaEmDemo, saldo: conta.saldo, moeda: conta.moeda || 'USD' },
    hoje,
    plano: planoValido,
    frota,
    cotacoes: IDS.map((id) => mercado?.cotacoes.find((c) => c.id === id)).filter((c): c is Cotacao => !!c)
      .map((c) => ({ id: c.id, nome: c.nome, valor: preco(c), variacao: c.variacao, serie: c.serie ?? [] })),
    mercadoFalhou,
    manchetes: [...(mercado?.noticias ?? [])].sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando)).slice(0, 3)
      .map((n) => ({ titulo: n.titulo, fonte: n.fonte, quando: haQuanto(n.quando), link: n.link })),
    aula,
    treino,
    jornada: { deriv: conta.conectada, demo: !!jornada.demo, gestao: !!planoValido, primeiraIa: !!jornada.primeiraIa },
  }
  return (
    <InicioPanel d={d} aoIr={aoIr} aoConectar={aoConectar} aoAbrirCarteira={aoAbrirCarteira} aoRecarregarMercado={() => setRodadaMercado((n) => n + 1)}
      topo={(MARCA.notificacoes || MARCA.biometria) && sessao ? <ConvitesDoInicio sessao={sessao} aoAbrirPerfil={() => aoIr('perfil')} /> : null}
      aoSalvarPlano={(meta, limite) => setPlano(planoSimples(meta, limite, sessao))}
      aoPrepararRobo={(id) => { pedirModeloDaVitrine(id); pedirPreparo(); aoIr('robos') }} />
  )
}
