/**
 * A cabine de verdade no cadastro (11/11/2026, reunião Tiago + Victor: "a animação da operação está feia,
 * parece feita no Paint. Use o layout real da plataforma, como se estivesse operando dentro dela, sem mudar
 * nada"). É o mesmo RobotLive da tela das I.A. e do Monitoramento (cabine só de leitura, sem botões),
 * alimentado pela reprise das sessões gravadas na plataforma (SESSOES, as mesmas da página antiga):
 * uma operação por segundo, a curva, a fita de dígitos, a meta. Ao bater a meta, espera e passa para a próxima I.A.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { RobotLive } from '../RobotLive'
import type { ConfigEstrategia, EstadoMotor, OperacaoMotor, Registro } from '../../core/deriv/engine'
import { ESTRATEGIAS_LOCAIS } from '../../core/deriv/strategies'
import { identidade } from '../../core/deriv/branding'
import { parametrosPadrao } from '../../core/deriv/parametros'
import { MARCA } from '../../marca'
import { SESSOES, type Sessao } from '../../casca/globalfly/cadastro/comoFunciona'

/** O id da I.A. no motor a partir do nome da sessão gravada. */
const ID_DO_ROBO: Record<string, string> = { falcon: 'falcon', phenom: 'ag2', legacy: 'legacy', raptor: 'goreme', gulf: 'superior5' }
const PASSO_MS = 1000
const PAUSA_NA_META_MS = 4500

const din = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function regrasDoRobo(roboId: string) {
  const est = ESTRATEGIAS_LOCAIS.find((e) => e.id === roboId)
  const ident = (() => { try { return identidade(roboId) } catch { return null } })()
  const b = est?.barreira ?? 5
  const tipo = est?.contractType ?? 'DIGITUNDER'
  const regra = ({ DIGITOVER: `maior que ${b}`, DIGITUNDER: `menor que ${b}` } as Record<string, string>)[tipo] ?? tipo
  const ganhaCom = (d: number) => (tipo === 'DIGITOVER' ? d > b : d < b)
  return { tipo, barreira: b, regra, ganhaCom, cor: ident?.cor ?? MARCA.cor.escuro, corSuave: ident?.corSuave ?? 'transparent' }
}

/** Um dígito final coerente com o resultado gravado (ganhou = dígito que a regra paga). */
function digitoDoResultado(ganhou: boolean, ganhaCom: (d: number) => boolean, semente: number): number {
  const opcoes = Array.from({ length: 10 }, (_, d) => d).filter((d) => ganhaCom(d) === ganhou)
  return opcoes[(semente * 7 + 3) % opcoes.length]
}
const comDigito = (preco: number, digito: number) => Math.floor(preco * 10) / 10 + digito / 100

/** O estado do motor depois de `k` operações da sessão (a k+1ª em andamento, se houver). */
function estadoDaReprise(s: Sessao, k: number, inicio: number, regras: ReturnType<typeof regrasDoRobo>): EstadoMotor {
  const { tipo, barreira, ganhaCom } = regras
  const vitoriasValor = s.ops.filter((o) => o[2] > 0)
  const taxa = vitoriasValor.length ? vitoriasValor.reduce((a, o) => a + o[2] / o[0], 0) / vitoriasValor.length : 0.9
  const feitas = s.ops.slice(0, k)
  let acum = 0, perdasSeguidas = 0, movimentado = 0
  const curva: number[] = []
  const historico: OperacaoMotor[] = []
  // a fita começa cheia: os dígitos que o mercado já tinha mostrado antes da primeira entrada
  const digitos: number[] = Array.from({ length: 27 }, (_, i) => Math.floor(s.ops[0][3] * 100 + i * 37) % 10)
  const registros: Registro[] = [{ hora: inicio, texto: `I.A. ligada · Volatility 75 Index`, tipo: 'info' }]
  feitas.forEach((o, i) => {
    const [valor, , lucro, preco] = o
    const ganhou = lucro > 0
    acum = +(acum + lucro).toFixed(2); curva.push(acum); movimentado += valor
    perdasSeguidas = ganhou ? 0 : perdasSeguidas + 1
    const dEntrada = Math.floor(preco * 100) % 10
    const dSaida = digitoDoResultado(ganhou, ganhaCom, i)
    const quando = inicio + (i + 1) * PASSO_MS
    // a fita: dois dígitos lidos antes de cada entrada e o dígito que decidiu
    digitos.push((dEntrada + i) % 10, dEntrada, dSaida)
    historico.unshift({
      n: i + 1, contractId: 41_000_000 + i, valor, entrada: preco, saida: comDigito(preco + ((i % 5) - 2) * 0.37, dSaida),
      digitoEntrada: dEntrada, digitoSaida: dSaida, lucro, payout: +(valor * (1 + taxa)).toFixed(2), markupDeriv: null,
      ganhou, quando, esperou: 1, contractType: tipo, barreira, pipSize: 2,
    })
    registros.push({ hora: quando - 400, texto: `Compra: ${regras.regra} · ${din(valor)}`, tipo: 'compra' })
    registros.push({ hora: quando, texto: ganhou ? `Ganhou +${din(lucro)}` : `Perdeu −${din(-lucro)} · recuperação`, tipo: ganhou ? 'ganho' : 'perda' })
  })
  const terminou = k >= s.ops.length
  const prox = terminou ? null : s.ops[k]
  if (terminou) registros.push({ hora: inicio + k * PASSO_MS + 200, texto: 'Parou: meta de ganho atingida', tipo: 'parada' })
  return {
    rodando: !terminou, emOperacao: !terminou, operacoes: k, vitorias: feitas.filter((o) => o[2] > 0).length, derrotas: feitas.filter((o) => o[2] <= 0).length,
    perdasSeguidas, resultado: acum, movimentado: +movimentado.toFixed(2), valorAtual: prox ? prox[0] : s.ops[0][0], aguardando: '',
    motivoParada: terminou ? `Meta de ganho atingida: +${din(acum)}` : null,
    registros: registros.slice(-40), digitos: digitos.slice(-30), curva, condicao: null,
    ultimoLucro: feitas.length ? feitas[feitas.length - 1][2] : null, historico,
    emCurso: prox ? {
      contractId: 41_000_000 + k, valor: prox[0], payout: +(prox[0] * (1 + taxa)).toFixed(2), entrada: prox[3], digitoEntrada: Math.floor(prox[3] * 100) % 10,
      spot: prox[3], digitoAtual: Math.floor(prox[3] * 100) % 10, lucro: 0, comprouEm: inicio + k * PASSO_MS + 300, latencia: 386, contractType: tipo, barreira,
    } : null,
    ticksAnalisados: k * 3 + 12, latenciaMedia: 391, falha: null, estrategia: null,
  }
}

export function CabineDeDemonstracao({ escolhida, aoTrocar }: { escolhida: number; aoTrocar: (i: number) => void }) {
  const s = SESSOES[escolhida] ?? SESSOES[0]
  const roboId = ID_DO_ROBO[s.f] ?? 'falcon'
  const regras = useMemo(() => regrasDoRobo(roboId), [roboId])
  const [k, setK] = useState(3) // cada sessão já entra com três operações (nunca começa vazia)
  const [inicio, setInicio] = useState(() => Date.now() - 3 * PASSO_MS)
  const caixa = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)

  // recomeça a reprise quando troca a I.A.
  useEffect(() => { setK(3); setInicio(Date.now() - 3 * PASSO_MS) }, [escolhida])
  // só anda na tela (e com a aba aberta)
  useEffect(() => {
    const el = caixa.current
    if (!el || !('IntersectionObserver' in window)) { setVisivel(true); return }
    const io = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!visivel || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const terminou = k >= s.ops.length
    const t = window.setTimeout(() => {
      if (document.hidden) { setK((x) => x); return }
      if (terminou) aoTrocar((escolhida + 1) % SESSOES.length)
      else setK((x) => x + 1)
    }, terminou ? PAUSA_NA_META_MS : PASSO_MS)
    return () => window.clearTimeout(t)
  }, [visivel, k, s.ops.length, escolhida, aoTrocar])

  const estado = useMemo(() => estadoDaReprise(s, Math.min(k, s.ops.length), inicio, regras), [s, k, inicio, regras])
  const config: ConfigEstrategia = useMemo(() => ({
    valorInicial: s.ops[0][0], valorAoVencer: s.ops[0][0], fatorGale: 0.05, galeApos: 1, valorMaximo: 0,
    takeProfit: s.meta, stopLoss: Math.round(s.meta * 2.5), maxOperacoes: 0, parametros: parametrosPadrao(roboId), parametrosVersao: 3,
  }), [s, roboId])
  const parametros = [
    { rot: 'Ativo', valor: 'Volatility 75' },
    { rot: 'Entrada', valor: din(s.ops[0][0]) },
    { rot: 'Para se ganhar', valor: din(s.meta) },
  ]
  return (
    <div className="cpl-cabine-real" ref={caixa}>
      <div className={`cabine-caixa expandido ${estado.rodando ? 'rodando' : 'parado'} mon-somente-leitura`}
        style={{ ['--robo' as string]: regras.cor, ['--robo-suave' as string]: regras.corSuave } as React.CSSProperties}>
        <RobotLive
          estado={estado} config={config} moeda="USD" contaDaSessao={null}
          estrategiaId={roboId} nomeEstrategia={s.n} ativo="Volatility 75 Index"
          titulo={`Reprise de ${s.dia}`} regra={regras.regra} cor={regras.cor} ganhaCom={regras.ganhaCom}
          parametros={parametros} conexao="open" expandido
        />
      </div>
    </div>
  )
}
