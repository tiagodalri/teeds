import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MARCA } from '../../marca'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { pararNoServidor, type SessaoViva } from '../../core/teeds/servidorRobos'
import { carregarMeuSubplano, precoLegivel, subplanoAtual, useMeuSubplano, type MeuSubplano, type Subplano } from '../../core/teeds/subplanos'
import { comComprador, type CompradorDoCheckout } from '../../core/teeds/checkout'
import './limite-simulador.css'

/*
 * O tempo de simulador do dia (GlobalFly, 10/11/2026, pedido do Tiago).
 *
 * SÓ A CONTA DEMO. Quem opera em conta real nunca vê relógio, aviso nem
 * janela, e nada da conta real é parado aqui. O que diz se a sessão é demo é
 * o servidor (SessaoViva.demo = tipo da conta na Deriv), nunca o rótulo que a
 * tela mostra (os admins têm os rótulos trocados de propósito).
 *
 * Gold tem 1 h por dia e Black 12 h (tabela subplanos, editável em Admin ›
 * Planos); Prestige e administradores não têm limite e não veem nada disto.
 * O dia é o de Brasília (00h00 às 23h59). O banco soma o tempo das sessões
 * demo (teeds_simulador_minutos_hoje, duas I.A. ao mesmo tempo contam uma
 * vez) e o servidor já recusa ligar demo sem tempo (teeds_simulador_permitido).
 *
 * Aqui: o relógio discreto no topo, o aviso dos 10 minutos finais e, ao
 * zerar, a parada das sessões DEMO desta pessoa e a janela de upgrade.
 * Antes de parar, o tempo é conferido de novo no banco: um relógio local
 * errado nunca derruba a sessão de ninguém.
 */

const DEZ_MIN = 600
const diaDeBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
function ateMeiaNoite(): string {
  const agora = new Date(), bsb = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const meia = new Date(bsb); meia.setHours(24, 0, 0, 0)
  const s = Math.max(0, Math.floor((meia.getTime() - bsb.getTime()) / 1000))
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}
export function formatarRestante(seg: number): string {
  const s = Math.max(0, Math.ceil(seg)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + `:${String(x).padStart(2, '0')}`
}
const horasLegivel = (h: number) => (h === 1 ? '1 hora diária' : `${h.toLocaleString('pt-BR')} horas diárias`)
const lembrar = (chave: string) => { try { if (localStorage.getItem(chave)) return true; localStorage.setItem(chave, '1') } catch { /* sem armazenamento: avisa de novo, sem problema */ } return false }

/** Os segundos que restam hoje, com o relógio andando só enquanto há demo rodando. */
function useRestante(dados: MeuSubplano | null, demoRodando: boolean) {
  const sub = subplanoAtual(dados)
  const limiteMin = dados && !dados.admin && sub && sub.simuladorHoras != null ? sub.simuladorHoras * 60 : null
  const leitura = useRef({ min: 0, em: Date.now() })
  useEffect(() => { leitura.current = { min: dados?.minutosHoje ?? 0, em: Date.now() } }, [dados])
  const [, setTique] = useState(0)
  useEffect(() => {
    if (limiteMin == null) return
    const t = setInterval(() => setTique((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [limiteMin])
  if (limiteMin == null) return { limiteMin: null, restante: null as number | null, sub }
  const usadoMin = leitura.current.min + (demoRodando ? (Date.now() - leitura.current.em) / 60000 : 0)
  return { limiteMin, restante: Math.max(0, limiteMin * 60 - usadoMin * 60), sub }
}

export function LimiteDoSimulador({ sessao, vivas, contaDemo, comprador }: {
  sessao: SessaoTeeds | null
  vivas: SessaoViva[]
  /** A conta da Deriv conectada agora é demo (tipo da conta, não o rótulo). */
  contaDemo: boolean | undefined
  comprador?: CompradorDoCheckout | null
}) {
  const dados = useMeuSubplano()
  const demos = useMemo(() => vivas.filter((v) => v.demo === true && v.estado?.rodando && (!v.marca || v.marca === MARCA.id)), [vivas])
  const demoRodando = demos.length > 0
  const { limiteMin, restante, sub } = useRestante(dados, demoRodando)
  const [janela, setJanela] = useState(false)
  const [aviso, setAviso] = useState(false)
  const conferindo = useRef(false)
  const paradas = useRef(new Set<string>())
  const uid = sessao?.usuario.id ?? ''

  // relê o tempo no banco: a cada minuto com demo rodando, quando uma demo liga ou desliga e quando vira o dia
  const qtdDemos = demos.length
  const qtdAnterior = useRef<number | null>(null)
  useEffect(() => {
    if (!sessao || limiteMin == null) return
    // o App já leu ao entrar; aqui só relê quando uma demo liga ou desliga (sem consulta extra na abertura)
    if (qtdAnterior.current !== null && qtdAnterior.current !== qtdDemos) void carregarMeuSubplano(sessao)
    qtdAnterior.current = qtdDemos
    if (!demoRodando) return
    const t = setInterval(() => { void carregarMeuSubplano(sessao) }, 60_000)
    return () => clearInterval(t)
  }, [sessao?.token, limiteMin, qtdDemos]) // eslint-disable-line react-hooks/exhaustive-deps
  const dia = useRef(diaDeBrasilia())
  useEffect(() => {
    if (!sessao || limiteMin == null) return
    const t = setInterval(() => { const d = diaDeBrasilia(); if (d !== dia.current) { dia.current = d; void carregarMeuSubplano(sessao) } }, 30_000)
    return () => clearInterval(t)
  }, [sessao?.token, limiteMin]) // eslint-disable-line react-hooks/exhaustive-deps

  // o servidor recusou ligar a demo por falta de tempo: abre a janela (só se o tempo acabou mesmo)
  useEffect(() => {
    const aoRecusar = () => { if (sessao) void carregarMeuSubplano(sessao).then((d) => { const s = subplanoAtual(d); if (d && !d.admin && s?.simuladorHoras != null && d.minutosHoje >= s.simuladorHoras * 60 - 0.05) setJanela(true) }) }
    window.addEventListener('plataforma:simulador-sem-tempo', aoRecusar)
    return () => window.removeEventListener('plataforma:simulador-sem-tempo', aoRecusar)
  }, [sessao?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // os 10 minutos finais: um aviso discreto, uma vez por dia
  useEffect(() => {
    if (restante == null || !demoRodando || restante > DEZ_MIN || restante <= 0) return
    if (!lembrar(`gf.simulador.aviso10.${uid}.${diaDeBrasilia()}`)) { setAviso(true); setTimeout(() => setAviso(false), 14_000) }
  }, [restante != null && restante <= DEZ_MIN, demoRodando]) // eslint-disable-line react-hooks/exhaustive-deps

  // zerou com demo rodando: confere no banco e só então para as sessões DEMO e abre a janela
  useEffect(() => {
    if (restante == null || restante > 0 || !demoRodando || !sessao || conferindo.current) return
    conferindo.current = true
    void carregarMeuSubplano(sessao).then(async (d) => {
      const s = subplanoAtual(d)
      const acabou = !!d && !d.admin && s?.simuladorHoras != null && d.minutosHoje >= s.simuladorHoras * 60 - 0.05
      if (!acabou) return
      for (const v of demos) {
        if (v.demo !== true || paradas.current.has(v.id)) continue // nunca a conta real
        paradas.current.add(v.id)
        try { await pararNoServidor(sessao, v.id) } catch { paradas.current.delete(v.id) }
      }
      setJanela(true)
    }).finally(() => { setTimeout(() => { conferindo.current = false }, 15_000) })
  }, [restante != null && restante <= 0, demoRodando, qtdDemos]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!MARCA.seloCategoria || !sessao || limiteMin == null || restante == null || !sub) return null
  const visivel = contaDemo === true || demoRodando
  return (
    <>
      {visivel && <RelogioDoSimulador restante={restante} total={limiteMin * 60} correndo={demoRodando} aoAbrir={() => setJanela(true)} />}
      {aviso && createPortal(<AvisoDezMinutos horas={sub.simuladorHoras ?? 1} aoVer={() => { setAviso(false); setJanela(true) }} aoFechar={() => setAviso(false)} />, document.body)}
      {janela && dados && createPortal(<JanelaSemTempo dados={dados} atual={sub} comprador={comprador} aoFechar={() => setJanela(false)} />, document.body)}
    </>
  )
}

/** O relógio discreto do topo. */
export function RelogioDoSimulador({ restante, total, correndo, aoAbrir }: { restante: number; total: number; correndo: boolean; aoAbrir: () => void }) {
  const faixa = restante <= 0 ? 'zerado' : restante <= 120 ? 'acabando' : restante <= DEZ_MIN ? 'pouco' : ''
  const k = total ? Math.max(0, Math.min(1, restante / total)) : 0
  return (
    <button type="button" className={`lsim-relogio ${faixa} ${correndo ? 'correndo' : ''}`} onClick={aoAbrir}
      title={restante <= 0 ? 'O simulador de hoje acabou' : `Simulador (conta demo): restam ${formatarRestante(restante)} hoje`}
      aria-label={restante <= 0 ? 'Simulador de hoje esgotado. Ver os planos' : `Simulador na conta demo: restam ${formatarRestante(restante)} hoje. Ver os planos`}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle className="t" cx="8" cy="8" r="6.5" /><circle className="p" cx="8" cy="8" r="6.5" style={{ strokeDashoffset: 40.84 * (1 - k) }} /></svg>
      <b>{formatarRestante(restante)}</b>
    </button>
  )
}

function AvisoDezMinutos({ horas, aoVer, aoFechar }: { horas: number; aoVer: () => void; aoFechar: () => void }) {
  return (
    <div className="lsim-aviso" role="status">
      <button type="button" className="lsim-aviso-x" onClick={aoFechar} aria-label="Fechar">×</button>
      <b>Faltam 10 minutos de simulador hoje</b>
      <span>O seu plano inclui {horas === 1 ? '1 hora' : `${horas} horas`} por dia na conta demo. A conta real não tem limite.</span>
      <button type="button" className="lsim-aviso-ver" onClick={aoVer}>Ver os planos</button>
    </div>
  )
}

const ESTRELA = 'M8 1.2l1.55 4.1 4.25.35-3.25 2.75 1.02 4.15L8 10.25 4.43 12.55l1.02-4.15L2.2 5.65l4.25-.35z'

export function JanelaSemTempo({ dados, atual, comprador, aoFechar }: { dados: MeuSubplano; atual: Subplano; comprador?: CompradorDoCheckout | null; aoFechar: () => void }) {
  const [volta, setVolta] = useState(ateMeiaNoite())
  useEffect(() => { const t = setInterval(() => setVolta(ateMeiaNoite()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc) }, [aoFechar])
  const acima = dados.subplanos.filter((s) => s.ordem > atual.ordem && s.ativo)
  const horas = atual.simuladorHoras ?? 1
  const quero = (s: Subplano) => { if (s.checkoutUrl) window.open(comComprador(s.checkoutUrl, comprador), '_blank', 'noopener,noreferrer') }
  return (
    <div className="lsim-fundo" onMouseDown={aoFechar}>
      <section className="lsim-caixa" role="dialog" aria-modal="true" aria-labelledby="lsim-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="lsim-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        <div className="lsim-cabeca">
          <div className="lsim-anel" aria-hidden="true">
            <svg viewBox="0 0 104 104"><circle className="t" cx="52" cy="52" r="46" /><circle className="p" cx="52" cy="52" r="46" /></svg>
            <div><b>{horas === 1 ? '60:00' : `${horas} h`}</b><span>usados hoje</span></div>
          </div>
          <div>
            <span className="lsim-atencao"><i aria-hidden="true" />Atenção</span>
            <h2 id="lsim-titulo">Você consumiu a sua <em>{horasLegivel(horas)}</em> de acesso ao simulador.</h2>
            <p>Para continuar operando com o simulador, faça o <b>upgrade do seu plano</b>.</p>
          </div>
        </div>
        {acima.length > 0 && (
          <div className={`lsim-planos ${acima.length === 1 ? 'um' : ''}`}>
            {acima.map((s) => (
              <article key={s.id} className={`lsim-plano ${s.id}`}>
                <div className="lsim-plano-topo">
                  <span className="lsim-nome"><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ESTRELA} /></svg><b>GF Member {s.nome}</b></span>
                  <span className="lsim-tag">{s.simuladorHoras == null ? 'Sem limites' : 'Todas as I.A.'}</span>
                </div>
                <div className="lsim-preco">
                  {s.precoReferencia ? <s>de {precoLegivel(s.precoReferencia)}</s> : null}
                  <strong>{precoLegivel(s.preco)}<small>{s.cobranca === 'mensal' ? '/mês' : '/ano'}</small></strong>
                </div>
                <div className="lsim-destaque">{s.simuladorHoras == null ? <>Simulador <b>ilimitado</b></> : <><b>{s.simuladorHoras} horas</b> de simulador por dia</>}</div>
                <ul>
                  <li>{s.ias == null ? 'As 5 I.A. liberadas' : `${s.ias.length} I.A. liberadas`}</li>
                  <li>{s.compartilhamento > 0 ? `Compartilhamento de ${Math.round(s.compartilhamento * 1000) / 10}% do lucro` : 'Sem compartilhamento: 0% do lucro'}</li>
                  <li>{s.assessor && s.lab ? 'Assessor dedicado e GFT Lab' : s.salaExtra ? 'Sala extra ao vivo' : 'Aulas e sala ao vivo'}</li>
                </ul>
                <button type="button" className="lsim-cta" onClick={() => quero(s)} disabled={!s.checkoutUrl}>Quero o {s.nome}</button>
              </article>
            ))}
          </div>
        )}
        <div className="lsim-rodape">
          <span className="lsim-real"><i aria-hidden="true" />Suas I.A. em conta real seguem liberadas normalmente.</span>
          <span>O simulador volta em <b>{volta}</b> <button type="button" className="lsim-link" onClick={aoFechar}>Fechar</button></span>
        </div>
      </section>
    </div>
  )
}
