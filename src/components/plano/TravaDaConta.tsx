import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { Subplano } from '../../core/teeds/subplanos'
import type { CompradorDoCheckout } from '../../core/teeds/checkout'
import type { SessaoViva } from '../../core/teeds/servidorRobos'
import { registrarContaDeriv } from '../../core/teeds/clientes'
import { abrirSuporte } from '../../core/teeds/suporte'
import { EVENTO_LIBERAR, cliqueLivre, definirTravada, lerMinhaLiberacao, registrarLiberacao, type Liberacao } from '../../core/teeds/liberacao'
import { JanelaLiberarConta } from './LiberarConta'

type ContaDaDeriv = { accountId: string; type: string; currency: string; balance: number }

/*
 * A trava do Gold sem saldo (GlobalFly, 16/11/2026). Ver core/teeds/liberacao.ts.
 *
 * Trava SÓ quando as três coisas batem:
 *   1. o banco respondeu "travada" (Gold, não admin, nenhuma conta real com saldo > 0);
 *   2. nenhuma conta real que a Deriv mostra ao vivo neste aparelho tem saldo > 0;
 *   3. não há I.A. ligada em conta real.
 * Sem resposta do banco (erro, rede, sessão vencida) = liberado.
 * Quando a Deriv mostra saldo e o banco ainda não sabe, o saldo é gravado e o banco é relido
 * (assim o servidor também libera o simulador).
 */
export function TravaDaConta({ sessao, marca, tela, contas, derivConectada, vivas, planos, comprador, aoConectar, aoAtualizarContas }: {
  sessao: SessaoTeeds
  marca: string
  tela: string
  contas: ContaDaDeriv[]
  derivConectada: boolean
  vivas: SessaoViva[]
  planos: Subplano[]
  comprador?: CompradorDoCheckout | null
  aoConectar: () => void
  aoAtualizarContas: () => Promise<void>
}) {
  const [info, setInfo] = useState<Liberacao | null>(null)
  const [aberta, setAbertaCru] = useState(false)
  // cada abertura fica registrada com o motivo: entrada (1ª vez), clique (botão travado) ou tela (link/aba travada)
  const abertaRef = useRef(false)
  const setAberta = useCallback((v: boolean, origem?: 'entrada' | 'clique' | 'tela') => {
    if (v && !abertaRef.current && origem) registrarLiberacao(sessaoRef.current, marca, 'abriu', origem)
    abertaRef.current = v
    setAbertaCru(v)
  }, [marca])
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao

  const reais = useMemo(() => contas.filter((c) => c.type === 'real'), [contas])
  const comSaldoAoVivo = reais.filter((c) => Number.isFinite(c.balance) && c.balance > 0)
  const temSessaoReal = vivas.some((v) => !v.demo)
  const travada = info?.travada === true && comSaldoAoVivo.length === 0 && !temSessaoReal

  const reler = useCallback(async () => {
    const r = await lerMinhaLiberacao(sessaoRef.current, marca)
    setInfo(r)   // null (erro) = liberado
    return r
  }, [marca])

  // lê ao entrar, ao trocar de login e ao voltar para a aba; de minuto em minuto se travada, 5 min se não
  useEffect(() => { void reler() }, [reler, sessao.usuario.id])
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') void reler() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [reler])
  useEffect(() => {
    const t = window.setInterval(() => { void reler() }, info?.travada ? 60_000 : 300_000)
    return () => window.clearInterval(t)
  }, [reler, info?.travada])

  // a Deriv mostra saldo e o banco diz que não: grava o saldo dessas contas e relê
  const gravadas = useRef(new Set<string>())
  const chaveSaldo = comSaldoAoVivo.map((c) => `${c.accountId}:${c.balance}`).join(',')
  useEffect(() => {
    if (!info?.travada || !comSaldoAoVivo.length) return
    const novas = comSaldoAoVivo.filter((c) => !gravadas.current.has(`${c.accountId}:${c.balance}`))
    if (!novas.length) return
    novas.forEach((c) => gravadas.current.add(`${c.accountId}:${c.balance}`))
    void Promise.all(novas.map((c) => registrarContaDeriv(sessaoRef.current, c))).then(() => reler())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.travada, chaveSaldo])

  // o resto do app lê daqui
  useEffect(() => { definirTravada(travada) }, [travada])
  useEffect(() => () => definirTravada(false), [])

  // o aviso aparece uma vez ao entrar travado; depois, a cada clique travado
  const avisou = useRef(false)
  useEffect(() => {
    if (travada && !avisou.current) { avisou.current = true; setAberta(true, 'entrada') }
    if (!travada) setAberta(false)
  }, [travada, setAberta])
  useEffect(() => {
    const abrir = () => { if (travada) setAberta(true, 'tela') }
    window.addEventListener(EVENTO_LIBERAR, abrir)
    return () => window.removeEventListener(EVENTO_LIBERAR, abrir)
  }, [travada, setAberta])

  // os cliques: antes de qualquer componente (fase de captura na janela)
  const telaRef = useRef(tela)
  telaRef.current = tela
  useEffect(() => {
    if (!travada) return
    const segurar = (e: Event) => {
      const alvo = e.target
      if (!(alvo instanceof Element) || cliqueLivre(alvo, telaRef.current)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setAberta(true, 'clique')
    }
    window.addEventListener('click', segurar, true)
    return () => window.removeEventListener('click', segurar, true)
  }, [travada, setAberta])

  const verificar = useCallback(async () => {
    await aoAtualizarContas().catch(() => undefined)
    const r = await reler()
    return !r?.travada
  }, [aoAtualizarContas, reler])

  if (!travada || !aberta) return null
  const saldoAoVivo = derivConectada ? reais.reduce((t, c) => t + (Number.isFinite(c.balance) && c.balance > 0 ? c.balance : 0), 0) : null
  return createPortal(
    <JanelaLiberarConta planos={planos} derivConectada={derivConectada} saldoReal={saldoAoVivo} comprador={comprador}
      aoFechar={() => setAberta(false)}
      aoVerificar={verificar}
      aoConectar={() => { setAberta(false); aoConectar() }}
      aoSuporte={() => { setAberta(false); abrirSuporte() }}
      aoRegistrar={(tipo, origem) => registrarLiberacao(sessaoRef.current, marca, tipo, origem)} />,
    document.body,
  )
}
