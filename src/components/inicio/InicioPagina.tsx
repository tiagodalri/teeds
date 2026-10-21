import { useEffect, useMemo, useState } from 'react'
import type { WorkspacePage } from '../WorkspaceNav'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { acompanharVivas, type SessaoViva } from '../../core/teeds/servidorRobos'
import { listarSessoes, type SessaoServidor } from '../../core/teeds/sessoesServidor'
import { planoDoDia } from '../../core/teeds/planoDoDia'
import { aulasVistas, MODULOS } from '../../core/teeds/aulas'
import { SERVIDOR } from '../../core/teeds/config'
import { capaDaAula } from '../capasAulas'
import { MARCA } from '../../marca'
import { InicioPanel, type DadosDoInicio } from './InicioPanel'

/**
 * A home com os dados de verdade (20/10/2026):
 *  - I.A.s ligadas: o mesmo acompanhamento da tela de robôs;
 *  - o dia: as sessões das I.A.s de hoje, na conta escolhida (demo ou real);
 *  - meta e limite: o plano que a pessoa montou no Gerenciamento;
 *  - mercado: a mesma fonte da aba Notícias;
 *  - aula: a primeira que ainda não foi assistida;
 *  - jornada: o que esta pessoa já fez (e fica marcado neste aparelho).
 */

interface Props {
  sessao: SessaoTeeds | null
  nome: string
  conta: { conectada: boolean; demo: boolean; saldo: number | null; moeda: string }
  treino: { noAr: boolean; apresentador?: string } | null
  aoIr: (tela: WorkspacePage) => void
  aoConectar?: () => void
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
  return h < 24 ? `há ${h} h` : 'ontem'
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

export function InicioPagina({ sessao, nome, conta, treino, aoIr, aoConectar, vivas: vivasDeFora }: Props) {
  const [vivasProprias, setVivas] = useState<SessaoViva[]>([])
  const vivas = vivasDeFora ?? vivasProprias
  const [sessoesHoje, setSessoesHoje] = useState<SessaoServidor[] | null>(null)
  const [mercado, setMercado] = useState<{ cotacoes: Cotacao[]; noticias: Noticia[] } | null>(null)
  const [jornada, setJornada] = useState(jornadaGuardada)
  const plano = useMemo(() => planoDoDia(), [])

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
    const ler = () => listarSessoes(sessao, 24)
      .then((l) => { if (vivo) setSessoesHoje(l.filter((s) => Date.parse(s.criadaEm) >= inicioDoDia())) })
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
      .then((d) => { if (vivo && d) setMercado({ cotacoes: d.cotacoes ?? [], noticias: d.noticias ?? [] }) })
      .catch(() => undefined)
    ler()
    const t = window.setInterval(ler, 5 * 60_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [])

  // a jornada aprende com o que aparece: sessão em demo, primeira I.A.
  useEffect(() => {
    const todas = [...vivas.map((v) => ({ demo: v.demo })), ...(sessoesHoje ?? []).map((s) => ({ demo: s.demo }))]
    if (!todas.length) return
    const novo = { demo: jornada.demo || todas.some((s) => s.demo), primeiraIa: true }
    if (novo.demo !== jornada.demo || !jornada.primeiraIa) { marcarJornada(novo); setJornada((j) => ({ ...j, ...novo })) }
  }, [vivas, sessoesHoje]) // eslint-disable-line react-hooks/exhaustive-deps

  const ligadas = vivas.filter((v) => v.estado?.rodando || v.estado?.emOperacao)
  const daConta = (sessoesHoje ?? []).filter((s) => s.demo === conta.demo)
  const hoje: DadosDoInicio['hoje'] = sessoesHoje === null && !plano ? null : {
    resultado: daConta.reduce((t, s) => t + s.resultado, 0),
    operacoes: daConta.reduce((t, s) => t + s.operacoes, 0),
    vitorias: daConta.reduce((t, s) => t + s.ganhas, 0),
    derrotas: daConta.reduce((t, s) => t + s.perdidas, 0),
    meta: plano?.metaUsd ?? 0,
    limite: plano?.limiteUsd ?? 0,
  }
  const semNada = !daConta.length && !plano

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
    conta: { conectada: conta.conectada, demo: conta.demo, saldo: conta.saldo ?? 0, moeda: conta.moeda || 'USD' },
    hoje: semNada ? null : hoje,
    robos: ligadas.map((v) => ({
      id: v.roboId, nome: v.roboNome, situacao: v.estado.emOperacao ? 'operando' : 'aguardando',
      resultado: v.estado.resultado ?? 0, operacoes: v.estado.operacoes ?? 0, curva: v.estado.curva ?? [],
    })),
    cotacoes: IDS.map((id) => mercado?.cotacoes.find((c) => c.id === id)).filter((c): c is Cotacao => !!c)
      .map((c) => ({ id: c.id, nome: c.nome, valor: preco(c), variacao: c.variacao, serie: c.serie ?? [] })),
    manchetes: [...(mercado?.noticias ?? [])].sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando)).slice(0, 3)
      .map((n) => ({ titulo: n.titulo, fonte: n.fonte, quando: haQuanto(n.quando), link: n.link })),
    aula,
    treino,
    jornada: { deriv: conta.conectada, demo: !!jornada.demo, gestao: !!plano, primeiraIa: !!jornada.primeiraIa },
  }
  return <InicioPanel d={d} aoIr={aoIr} aoConectar={aoConectar} />
}
