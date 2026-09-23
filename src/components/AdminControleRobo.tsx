/**
 * O painel de um robô (23/09/2026): onde o admin ajusta as regras.
 *
 * Três colunas: as abas, o conteúdo e o placar. O placar recalcula a cada
 * tecla com a MESMA escada que o motor sobe (`avaliarPlano`/`escadaDoRobo`),
 * para o admin ver "hoje → novo" antes de decidir. Nada aqui chega ao
 * motor sem passar pela confirmação (tela 3): o rascunho vive na nuvem
 * (salvo 1 s depois da última tecla, só quando `validar()` não reclama) e
 * só vira regra ao publicar, testar no demo, promover ou restaurar.
 *
 * Vocabulário de tela: loss virtual, recuperação, escada, degrau, teto por
 * entrada, lucro ao fechar a sequência, segurança do payout, sessão em
 * andamento. Os nomes internos (galeApos, fatorGale) ficam só no código.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import './robot-cockpit.css'
import './admin-controle.css'
import { Emblema } from './RobotCard'
import { CampoNumero, EscadaEditavel, LIMITES_DA_TABELA } from './EscadaEditavel'
import { SimuladorDoRobo } from './SimuladorDoRobo'
import { identidade } from '../core/deriv/branding'
import {
  avisos, chanceDoContrato, descrever, diferencas, digitosQueGanham, esperaMediaEmTicks, mesclar, temModoAgressivo, validar,
  type DepoisDoUltimo, type Diferenca, type ParametrosDoRobo,
} from '../core/deriv/parametros'
import { avaliarPlano, chanceDaSequencia, ENTRADA_MINIMA, escadaDoRobo, lucroPorDolar, markupDaEscada, PAGAMENTO_POR_DOLAR, type Degrau } from '../core/deriv/escada'
import { NOME_DO_MODO, type Modo } from '../core/deriv/strategies'
import { cartoesDePerdaMaxima, type CartaoDePerdaMaxima } from '../core/deriv/simulacao'
import { MARCAS } from '../marca'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  descartarTeste, ErroDeParametros, lerHistorico, lerParametros, promoverDemo, publicarParametros, restaurarVersao, salvarRascunho, testarNoDemo,
  type DetalheDoRobo, type ItemHistorico, type RespostaAcao,
} from '../core/teeds/parametrosRobos'

/* ------------------------------------------------------------------ *
 * Formatação e textos, compartilhados com a lista de cartões.
 * ------------------------------------------------------------------ */
export const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usd4 = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const pctDe = (fracao: number) => `${(Math.round(fracao * 1000) / 10).toLocaleString('pt-BR')}%`
const tempoDeTicks = (ticks: number) => {
  const s = ticks * 2 // o R_75 tica a cada ~2 s
  if (s < 90) return `${Math.round(s)} s`
  if (s < 5400) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

/** "22/09 14:10" — o formato curto que o admin já lê nas outras telas. */
export function quando(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

const ACOES: Record<string, string> = {
  publicou: 'Publicou para todos',
  testou_demo: 'Testou no demo',
  promoveu: 'Promoveu o teste para todos',
  promoveu_demo: 'Promoveu o teste para todos',
  descartou_teste: 'Descartou o teste',
  descartou_demo: 'Descartou o teste',
  restaurou: 'Voltou para uma versão anterior',
  restaurou_versao: 'Voltou para uma versão anterior',
  restaurou_padrao: 'Restaurou o padrão da plataforma',
  rascunho: 'Salvou um rascunho',
}
export const traduzirAcao = (acao: string | null | undefined) => (acao ? ACOES[acao] ?? acao.replace(/_/g, ' ') : 'Publicou para todos')

const NOME_DO_CAMPO: Record<string, string> = {
  'entrada.lossVirtual': 'Loss virtual',
  'entrada.sequenciaSemAnalise': 'Sequência',
  contrato: 'Contrato',
  'recuperacao.galeApos': 'Recuperação',
  'recuperacao.descontoRetorno': 'Segurança do payout',
  'recuperacao.lucroMinimo': 'Lucro mínimo',
  'recuperacao.modos.conservador': 'Modo conservador',
  'recuperacao.modos.agressivo': 'Modo agressivo',
  'recuperacao.escada': 'Escada',
  'recuperacao.escada.degraus': 'Degraus',
  'limites.valorMaximoPorEntrada': 'Teto por entrada',
  'palm.limiteNove': 'Dígito 9',
  'palm.limiteBaixos': '0 a 4',
  'palm.retornoInicial': 'Retorno presumido',
  'palm.desconto': 'Segurança do Palm',
  'palm.margem': 'Lucro ao fechar do Palm',
}
export const nomeDoCampo = (campo: string) => NOME_DO_CAMPO[campo] ?? campo

/** "loss virtual 4 → 3": tira da segunda metade o que ela repete da primeira. */
export function resumirDiferenca(d: Diferenca): string {
  const a = d.de.split(' '), b = d.para.split(' ')
  let i = 0
  while (i < a.length - 1 && i < b.length - 1 && a[i] === b[i]) i++
  const texto = i > 0 ? `${d.de} → ${b.slice(i).join(' ')}` : `${d.de} → ${d.para}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const listaDeDigitos = (ds: number[]) => {
  if (ds.length === 0) return '—'
  if (ds.length > 5) return `de ${ds[0]} a ${ds[ds.length - 1]}`
  return ds.length === 1 ? String(ds[0]) : `${ds.slice(0, -1).join(', ')} ou ${ds[ds.length - 1]}`
}
const textoDoContrato = (c: ParametrosDoRobo['contrato']) => `${c.contractType === 'DIGITOVER' ? 'Over' : 'Under'} ${c.barreira}`

/** O payout medido (bruto por dólar) que a escada usa para este contrato. */
function payoutMedido(id: string, contrato: ParametrosDoRobo['contrato']): number {
  const P = PAGAMENTO_POR_DOLAR
  const porQuantos: Record<number, number> = { 3: P.tresDigitos, 5: P.cincoDigitos, 6: P.seisDigitos, 9: P.noveDigitos }
  return porQuantos[digitosQueGanham(contrato).length] ?? Number((1 + lucroPorDolar(id)).toFixed(4))
}

/** "Contrato: ganha em 7, 8 ou 9 (Over 6) · 1 tick · fixo · payout medido 2,9225". */
export function linhaDoContrato(id: string, p: ParametrosDoRobo): string {
  const c = p.contrato
  const payout = payoutMedido(id, c).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  if (id === 'thepalm') return `Contrato: Under 9 na entrada e Under 5 na recuperação · 1 tick · fixo · payout medido ${PAGAMENTO_POR_DOLAR.noveDigitos.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} / ${PAGAMENTO_POR_DOLAR.cincoDigitos.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}`
  return `Contrato: ganha em ${listaDeDigitos(digitosQueGanham(c))} (${textoDoContrato(c)}) · 1 tick · fixo · payout medido ${payout}`
}

/** A escada calculada sem deixar um parâmetro torto derrubar a tela. */
function escadaSegura(id: string, base: number, passos: number, modo: Modo, p: ParametrosDoRobo): Degrau[] {
  try { return escadaDoRobo(id, base, passos, modo, p) } catch { return [] }
}

/**
 * Os três cartões de perda máxima (bases 0,35 / 1 / 5 com stop de 20× a base).
 * Vêm do simulador (`cartoesDePerdaMaxima`). Se um parâmetro torto fizer o
 * simulador lançar, a conta cai na mesma escada de `avaliarPlano` — assim a
 * confirmação nunca fica sem números, e nunca com um número inventado.
 */
export function cartoesSeguros(id: string, p: ParametrosDoRobo, modo: Modo): CartaoDePerdaMaxima[] {
  try {
    const c = cartoesDePerdaMaxima(id, p, modo)
    if (Array.isArray(c) && c.length) return c
  } catch { /* parâmetro fora da faixa no meio da digitação: cai na conta local abaixo */ }
  try {
    return [0.35, 1, 5].map((base) => {
      const stop = Math.round(base * 20 * 100) / 100
      const plano = avaliarPlano(id, base, stop, modo, p)
      return {
        base, stop,
        custoMaximo: plano.custoMaximo,
        errosSeguidos: plano.errosSeguidos,
        maiorEntrada: Math.max(plano.maiorEntrada, plano.entradaAparada ?? 0),
        chanceDaSequencia: chanceDaSequencia(id, plano.errosSeguidos + (plano.entradaAparada ? 1 : 0)),
        paraAntesDoStop: plano.paraAntesDoStop,
      }
    })
  } catch { return [] }
}

/** Os avisos em âmbar, já com o "não cobre" da escada calculada. */
export function avisosDe(id: string, p: ParametrosDoRobo, modo: Modo, base = 0.35): string[] {
  try { return avisos(p, id, escadaSegura(id, base, 12, modo, p)) } catch { return [] }
}

/** Os 8 degraus que a fórmula calcula hoje, como multiplicadores da base: o jeito mais fácil de começar uma tabela. */
export function degrausDaFormula(id: string, base: number, modo: Modo, p: ParametrosDoRobo, quantos = 8): Array<{ multiplicador: number }> {
  const pFormula: ParametrosDoRobo = { ...p, recuperacao: { ...p.recuperacao, escada: { tipo: 'formula' } } }
  return escadaSegura(id, base, quantos + 1, modo, pFormula)
    .slice(1)
    .filter((d) => !d.esgotada)
    .map((d) => ({ multiplicador: Math.min(LIMITES_DA_TABELA.multiplicador.max, Math.max(LIMITES_DA_TABELA.multiplicador.min, Math.round((d.valor / base) * 100) / 100)) }))
}

/* ------------------------------------------------------------------ *
 * TELA 3 — a confirmação. Também usada pela lista (Restaurar padrão).
 * ------------------------------------------------------------------ */
export interface AcaoConfirmavel {
  titulo: string
  descricao: string
  botao: string
  diff: Diferenca[]
  cartoes: CartaoDePerdaMaxima[]
  sessoesVivas: number
  /** Só as sessões de conta demo recebem a regra (Testar no demo). */
  soDemo?: boolean
  avisos: string[]
  /** Digitar o nome do robô na marca (não exigido em "Testar no demo"). */
  exigirNome: boolean
  /** "Por que mudou" obrigatório (as rotas de restaurar não recebem observação). */
  pedirMotivo: boolean
  nome: string
  executar: (observacao: string) => Promise<RespostaAcao>
}

export function ConfirmacaoDeAcao({ acao, onFechar, onConcluido }: { acao: AcaoConfirmavel; onFechar: () => void; onConcluido: (r: RespostaAcao) => void }) {
  const [observacao, setObservacao] = useState('')
  const [digitado, setDigitado] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const nomeOk = !acao.exigirNome || digitado.trim() === acao.nome
  const motivoOk = !acao.pedirMotivo || observacao.trim().length > 0
  const confirmar = async () => {
    setEnviando(true); setErros([])
    try { onConcluido(await acao.executar(observacao.trim())) }
    catch (e) {
      setErros(e instanceof ErroDeParametros && e.erros.length ? e.erros : [(e as Error).message || 'O servidor não respondeu.'])
      setEnviando(false)
    }
  }
  return (
    <div className="ac ac-confirm-fundo" onMouseDown={onFechar} role="dialog" aria-modal="true" aria-label={acao.titulo}>
      <section className="ac-confirm" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div><h3>{acao.titulo}</h3><p>{acao.descricao}</p></div>
          <button type="button" className="ac-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </header>
        <div className="ac-confirm-corpo">
          <section>
            <h4>O que muda em relação ao publicado</h4>
            {acao.diff.length
              ? <ul className="ac-diff">{acao.diff.map((d) => <li key={d.campo}><span>{nomeDoCampo(d.campo)}:</span><s>{d.de}</s><span>→</span><b>{d.para}</b></li>)}</ul>
              : <p className="ac-nota">Nenhuma diferença nos parâmetros — a versão nova repete a regra de hoje.</p>}
          </section>
          {acao.cartoes.length > 0 && (
            <section>
              <h4>Perda máxima de referência (stop de 20× a base)</h4>
              <div className="ac-cartoes">
                {acao.cartoes.map((c) => (
                  <article key={c.base}>
                    <span>Base {usd(c.base)} · stop {usd(c.stop)}</span>
                    <strong>{usd(c.custoMaximo)}</strong>
                    <small>
                      <b>{c.errosSeguidos}</b> erros seguidos cabem · maior entrada <b>{usd(c.maiorEntrada)}</b><br />
                      chance da sequência <b>{pctDe(c.chanceDaSequencia)}</b>{c.paraAntesDoStop ? <><br /><b>a tabela para antes do stop</b></> : null}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          )}
          <p className="ac-confirm-sessoes">{acao.soDemo
            ? <>Das <b>{acao.sessoesVivas}</b> {acao.sessoesVivas === 1 ? 'sessão em andamento' : 'sessões em andamento'}, só as de conta demo recebem a regra de teste na próxima operação. As contas reais seguem a versão publicada.</>
            : <><b>{acao.sessoesVivas}</b> {acao.sessoesVivas === 1 ? 'sessão em andamento recebe' : 'sessões em andamento recebem'} a regra nova na próxima operação. Vale também para os próximos inícios.</>}</p>
          {acao.avisos.length > 0 && <ul className="ac-avisos">{acao.avisos.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}
          {acao.pedirMotivo && (
            <label className="ac-campo">
              <span className="rot">Por que mudou (fica no histórico)</span>
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: loss virtual 3 deixou o AG7 mais rápido no demo sem aumentar a perda máxima." />
            </label>
          )}
          {acao.exigirNome && (
            <label className="ac-campo">
              <span className="rot">Digite <b style={{ textTransform: 'none' }}>{acao.nome}</b> para confirmar</span>
              <input className="ac-input nome" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={acao.nome} autoComplete="off" />
            </label>
          )}
          {erros.length > 0 && <ul className="ac-erros">{erros.map((e) => <li key={e}>✕ {e}</li>)}</ul>}
        </div>
        <footer>
          <button type="button" className="ac-btn leve" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button type="button" className="ac-btn primario" onClick={() => void confirmar()} disabled={enviando || !nomeOk || !motivoOk}>{enviando ? 'Enviando…' : acao.botao}</button>
        </footer>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Peças pequenas.
 * ------------------------------------------------------------------ */
function Stepper({ valor, min, max, onChange, rotulo, grande = false, desabilitado = false }: { valor: number; min: number; max: number; onChange: (v: number) => void; rotulo: string; grande?: boolean; desabilitado?: boolean }) {
  return (
    <div className={`ac-stepper ${grande ? 'grande' : ''}`} role="group" aria-label={rotulo}>
      <button type="button" onClick={() => onChange(Math.max(min, valor - 1))} disabled={desabilitado || valor <= min} aria-label={`${rotulo}: menos`}>−</button>
      <b aria-live="polite">{valor}</b>
      <button type="button" onClick={() => onChange(Math.min(max, valor + 1))} disabled={desabilitado || valor >= max} aria-label={`${rotulo}: mais`}>+</button>
    </div>
  )
}

function Interruptor({ ligado, onChange, rotulo, desabilitado = false }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; desabilitado?: boolean }) {
  return (
    <button type="button" className="ac-switch" role="switch" aria-checked={ligado} aria-label={rotulo} disabled={desabilitado} onClick={() => onChange(!ligado)}>
      <i />{ligado ? 'Sim' : 'Não'}
    </button>
  )
}

function LinhaInterruptor({ ligado, onChange, titulo, descricao }: { ligado: boolean; onChange: (v: boolean) => void; titulo: string; descricao: string }) {
  return (
    <button type="button" className="ac-toggle" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}>
      <span className="ac-switch" aria-hidden="true"><i />{ligado ? 'Sim' : 'Não'}</span>
      <span>{titulo}<small>{descricao}</small></span>
    </button>
  )
}

/** Campo em % na tela, gravado como fração (5% ↔ 0,05). */
function CampoPct({ valor, onChange, rotulo, max, sufixo = '%' }: { valor: number; onChange: (fracao: number) => void; rotulo: string; max: number; sufixo?: string }) {
  return (
    <span className="ac-input-grupo">
      <CampoNumero rotulo={rotulo} valor={Math.round(valor * 10000) / 100} min={0} max={max} passo={1} onChange={(n) => onChange(Math.round(n * 100) / 10000)} />
      <b>{sufixo}</b>
    </span>
  )
}

/** A fita de exemplo: "ganha / perde" fixo, com os dígitos do contrato de cada robô. */
const PADRAO_DA_FITA = [true, false, false, true, false, true, false, true, false, true, false, false]
function PreviaDaRegua({ contrato, n }: { contrato: ParametrosDoRobo['contrato']; n: number }) {
  const ganham = digitosQueGanham(contrato)
  const perdem = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !ganham.includes(d))
  let g = 0, p = 0
  const fita = PADRAO_DA_FITA.map((ganha) => (ganha
    ? { d: ganham.length ? ganham[g++ % ganham.length] : 0, ganha }
    : { d: perdem.length ? perdem[p++ % perdem.length] : 9, ganha }))
  let seguidos = 0
  for (let i = fita.length - 1; i >= 0 && !fita[i].ganha; i--) seguidos++
  const contagem = Math.min(seguidos, n)
  return (
    <>
      <div className="ac-fita" aria-label="Fita de dígitos de exemplo">{fita.map((f, i) => <i key={i} className={f.ganha ? 'ganha' : 'perde'} title={f.ganha ? 'teria ganhado' : 'teria perdido'}>{f.d}</i>)}</div>
      {n > 0 ? (
        <>
          <div className="ac-regua-rotulo"><b>Loss virtual — {contagem} de {n}</b><span>{contagem >= n ? 'entra agora' : `faltam ${n - contagem}`}</span></div>
          <div className="tv-analise-degraus" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < contagem ? (contagem >= n ? 'ok' : 'on') : ''} />)}</div>
        </>
      ) : (
        <div className="ac-regua-rotulo"><b>Entra em toda operação</b><span>sem contagem</span></div>
      )}
      <p className="ac-nota">Os dígitos destacados são os que teriam perdido. A cabine do cliente mostra esta mesma régua.</p>
    </>
  )
}

/** Escada de hoje × escada nova: 12 degraus em escala log, com a linha do stop de referência. */
function GraficoEscadas({ id, base, stop, modo, hoje, novo }: { id: string; base: number; stop: number; modo: Modo; hoje: ParametrosDoRobo; novo: ParametrosDoRobo }) {
  const N = 12
  const eh = useMemo(() => escadaSegura(id, base, N, modo, hoje), [id, base, modo, hoje])
  const en = useMemo(() => escadaSegura(id, base, N, modo, novo), [id, base, modo, novo])
  const valores = [...eh, ...en].filter((d) => !d.esgotada).map((d) => d.valor)
  const minV = Math.max(ENTRADA_MINIMA * 0.8, Math.min(base, ...valores) * 0.8)
  const maxV = Math.max(stop, ...valores, minV * 4)
  const altura = (v: number) => (v <= 0 ? 0 : Math.min(100, Math.max(2, ((Math.log(v) - Math.log(minV)) / (Math.log(maxV) - Math.log(minV))) * 100)))
  return (
    <div className="ac-grafico" aria-label="Escada de hoje comparada com a escada nova">
      <div className="ac-grafico-area">
        <div className="ac-grafico-stop" style={{ bottom: `${altura(stop)}%` }}><small>stop {usd(stop)}</small></div>
        {Array.from({ length: N }, (_, i) => {
          const a = eh[i], b = en[i]
          const titulo = `Degrau ${i + 1} · hoje ${a ? (a.esgotada ? 'para' : usd(a.valor)) : '—'} · novo ${b ? (b.esgotada ? 'para' : usd(b.valor)) : '—'}`
          return (
            <div key={i} className="ac-grafico-par" title={titulo}>
              <i className={a?.esgotada ? 'para' : 'hoje'} style={{ height: `${a ? (a.esgotada ? 14 : altura(a.valor)) : 0}%` }} />
              <i className={b?.esgotada ? 'para' : 'novo'} style={{ height: `${b ? (b.esgotada ? 14 : altura(b.valor)) : 0}%` }} />
            </div>
          )
        })}
      </div>
      <div className="ac-grafico-eixo">{Array.from({ length: N }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <div className="ac-legenda"><span><i /> hoje (publicado)</span><span><i className="novo" /> nova (rascunho)</span><span><i className="stop" /> stop de referência</span><span>altura em escala logarítmica</span></div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * As abas.
 * ------------------------------------------------------------------ */
type Patch = Record<string, unknown>

function AbaEntrada({ id, p, atualizar }: { id: string; p: ParametrosDoRobo; atualizar: (patch: Patch) => void }) {
  const n = p.entrada.lossVirtual
  const espera = esperaMediaEmTicks(n, chanceDoContrato(p.contrato))
  return (
    <>
      <div><h3>Entrada</h3><p>Quando o robô entra. Muda a cadência (operações por hora), não a escada.</p></div>
      <div className="ac-bloco">
        <header><div><h4>Loss virtual</h4><p>Quantos dígitos seguidos que teriam perdido o robô espera antes de entrar. 0 = entra em toda operação.</p></div></header>
        <div className="ac-mostrador">
          <Stepper grande valor={n} min={0} max={12} onChange={(v) => atualizar({ entrada: { lossVirtual: v } })} rotulo="Loss virtual" />
          <div>
            <div className="ac-presets" aria-label="Valores comuns">{[2, 3, 4, 5].map((v) => <button type="button" key={v} className={n === v ? 'on' : ''} onClick={() => atualizar({ entrada: { lossVirtual: v } })}>{v}</button>)}</div>
            <p className="ac-frase">{descrever(id, p)}</p>
            <p className="ac-nota">
              {n === 0
                ? 'Espera média estimada: nenhuma — entra na primeira operação.'
                : <>Espera média estimada: <b>~{Math.round(espera).toLocaleString('pt-BR')} ticks</b> (~{tempoDeTicks(espera)}) antes de cada entrada.</>}
            </p>
          </div>
        </div>
      </div>
      <LinhaInterruptor
        ligado={p.entrada.sequenciaSemAnalise}
        onChange={(v) => atualizar({ entrada: { sequenciaSemAnalise: v } })}
        titulo="Depois de entrar, seguir a sequência sem nova análise até uma vitória"
        descricao="Desligado, cada entrada da sequência exige o loss virtual completo de novo."
      />
      <div className="ac-bloco">
        <header><div><h4>Prévia da régua</h4><p>Como a cabine mostra a contagem, numa fita de dígitos de exemplo.</p></div></header>
        <PreviaDaRegua contrato={p.contrato} n={n} />
      </div>
    </>
  )
}

function AbaRecuperacao({ id, p, atualizar }: { id: string; p: ParametrosDoRobo; atualizar: (patch: Patch) => void }) {
  const rec = p.recuperacao
  const tabela = rec.escada.tipo === 'tabela'
  const palm = id === 'thepalm'
  const ag = rec.modos.agressivo
  return (
    <>
      <div><h3>Recuperação</h3><p>Como o robô sobe depois de uma perda. Nunca mexe no stop, no take nem no teto do cliente.</p></div>
      {palm && <p className="ac-nota">A recuperação do The Palm (retorno presumido, segurança do payout e lucro ao fechar) fica na aba The Palm. Aqui só o teto por entrada vale para ele.</p>}
      {!palm && (<>
      <div className="ac-bloco">
        <header><div><h4>Recuperar a partir de quantas perdas seguidas?</h4><p>{tabela ? 'Na tabela, o degrau 1 já é recuperação: a entrada após a 1ª perda.' : '0 vale como 1: o robô recupera desde a primeira perda.'}</p></div></header>
        <Stepper valor={tabela ? 1 : rec.galeApos} min={0} max={10} desabilitado={tabela} onChange={(v) => atualizar({ recuperacao: { galeApos: v } })} rotulo="Perdas seguidas antes de recuperar" />
      </div>
      <div className="ac-grade2">
        <div className="ac-bloco">
          <header><div><h4>Modo conservador</h4><p>O modo padrão de todo cliente.</p></div></header>
          <div className="ac-campo"><label>Lucro ao fechar a sequência</label><span className="ac-campo-linha"><CampoPct rotulo="Lucro ao fechar a sequência (conservador)" valor={rec.modos.conservador.margem} max={200} onChange={(f) => atualizar({ recuperacao: { modos: { conservador: { margem: f } } } })} sufixo="% da entrada base" /></span></div>
          <div className="ac-campo"><label>Parte do prejuízo que vira lucro</label><span className="ac-campo-linha"><CampoPct rotulo="Parte do prejuízo que vira lucro (conservador)" valor={rec.modos.conservador.sobrePrejuizo} max={100} onChange={(f) => atualizar({ recuperacao: { modos: { conservador: { sobrePrejuizo: f } } } })} /></span></div>
        </div>
        {!palm && (
          <div className={`ac-bloco ${ag ? '' : 'desligado'}`}>
            <header>
              <div><h4>Modo agressivo</h4><p>Oferecer este modo ao cliente</p></div>
              <Interruptor ligado={ag !== null} rotulo="Oferecer o modo agressivo ao cliente" onChange={(v) => atualizar({ recuperacao: { modos: { agressivo: v ? { margem: 1, sobrePrejuizo: 0.2 } : null } } })} />
            </header>
            <div className="ac-campo"><label>Lucro ao fechar a sequência</label><span className="ac-campo-linha"><CampoPct rotulo="Lucro ao fechar a sequência (agressivo)" valor={ag?.margem ?? 1} max={200} onChange={(f) => atualizar({ recuperacao: { modos: { agressivo: { margem: f, sobrePrejuizo: ag?.sobrePrejuizo ?? 0.2 } } } })} sufixo="% da entrada base" /></span></div>
            <div className="ac-campo"><label>Parte do prejuízo que vira lucro</label><span className="ac-campo-linha"><CampoPct rotulo="Parte do prejuízo que vira lucro (agressivo)" valor={ag?.sobrePrejuizo ?? 0.2} max={100} onChange={(f) => atualizar({ recuperacao: { modos: { agressivo: { margem: ag?.margem ?? 1, sobrePrejuizo: f } } } })} /></span></div>
          </div>
        )}
      </div>
      </>)}
      <div className="ac-bloco">
        <header><div><h4>Teto por entrada (da plataforma)</h4><p>Só adiciona freio: nunca aumenta o teto que o cliente definiu. 0 = sem teto.</p></div></header>
        <span className="ac-input-grupo"><b>US$</b><CampoNumero rotulo="Teto por entrada em dólares" valor={p.limites.valorMaximoPorEntrada} min={0} max={50000} passo={0.05} onChange={(n) => atualizar({ limites: { valorMaximoPorEntrada: n } })} /><b>{p.limites.valorMaximoPorEntrada > 0 ? 'por entrada' : 'sem teto'}</b></span>
      </div>
      {!palm && <details className="ac-mais">
        <summary>Mais opções</summary>
        <div>
          <div className="ac-campo"><label>Segurança do payout</label><span className="ac-campo-linha"><CampoPct rotulo="Segurança do payout" valor={1 - rec.descontoRetorno} max={20} onChange={(f) => atualizar({ recuperacao: { descontoRetorno: Math.round((1 - f) * 10000) / 10000 } })} /></span><p className="ac-nota">Desconto sobre o payout real da compra anterior ao calcular a próxima entrada. 3% é o de sempre.</p></div>
          <div className="ac-campo"><label>Lucro mínimo em dólares</label><span className="ac-input-grupo"><b>US$</b><CampoNumero rotulo="Lucro mínimo em dólares" valor={rec.lucroMinimo} min={0.01} max={1} passo={0.01} onChange={(n) => atualizar({ recuperacao: { lucroMinimo: n } })} /></span><p className="ac-nota">Piso absoluto do lucro exigido ao fechar a sequência.</p></div>
        </div>
      </details>}
    </>
  )
}

const DEPOIS: Array<[DepoisDoUltimo, string, string]> = [
  ['formula', 'Cair na fórmula (recomendado)', 'Passado o último degrau, a entrada volta a ser calculada pelo payout real.'],
  ['repetir', 'Repetir o último degrau', 'Repete o mesmo valor do último degrau, sem compor.'],
  ['parar', 'Parar o robô', 'A sessão desliga quando a tabela acaba — pode ser antes do stop do cliente.'],
]

function AbaEscada({ id, p, atualizar, base, stop, modo, publicado }: { id: string; p: ParametrosDoRobo; atualizar: (patch: Patch) => void; base: number; stop: number; modo: Modo; publicado: ParametrosDoRobo }) {
  const escada = p.recuperacao.escada
  const escolher = (tipo: 'formula' | 'tabela') => {
    if (tipo === 'formula') { atualizar({ recuperacao: { escada: { tipo: 'formula' } } }); return }
    if (escada.tipo === 'tabela') return
    const degraus = degrausDaFormula(id, base, modo, p)
    atualizar({ recuperacao: { escada: { tipo: 'tabela', degraus: degraus.length ? degraus : [{ multiplicador: 2 }], depoisDoUltimo: 'formula' } } })
  }
  return (
    <>
      <div><h3>Escada</h3><p>Quanto o robô entra a cada perda seguida. A tabela começa a partir da escada de hoje (nenhum degrau fica abaixo de 1× a base).</p></div>
      <div className="segmented" role="tablist" aria-label="Tipo de escada">
        <button type="button" role="tab" aria-selected={escada.tipo === 'formula'} className={escada.tipo === 'formula' ? 'on' : ''} onClick={() => escolher('formula')}>Calculada pelo payout real (recomendado)</button>
        <button type="button" role="tab" aria-selected={escada.tipo === 'tabela'} className={escada.tipo === 'tabela' ? 'on' : ''} onClick={() => escolher('tabela')}>Tabela, degrau a degrau</button>
      </div>
      {escada.tipo === 'tabela' ? (
        <>
          <EscadaEditavel id={id} parametros={p} base={base} modo={modo} onChange={(e) => atualizar({ recuperacao: { escada: e } })} />
          <div className="ac-bloco">
            <header><div><h4>Depois do último degrau</h4><p>O que acontece quando a sequência passa da tabela.</p></div></header>
            <div className="ac-radios">
              {DEPOIS.map(([valor, titulo, explicacao]) => (
                <label key={valor} className={escada.depoisDoUltimo === valor ? 'on' : ''}>
                  <input type="radio" name="depoisDoUltimo" checked={escada.depoisDoUltimo === valor} onChange={() => atualizar({ recuperacao: { escada: { ...escada, depoisDoUltimo: valor } } })} />
                  <span>{titulo}<small>{explicacao}</small></span>
                </label>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="ac-nota">A recuperação de sempre: cada entrada é calculada pelo payout real da compra anterior, com o lucro ao fechar definido na aba Recuperação.</p>
      )}
      <div className="ac-bloco">
        <header><div><h4>Escada de hoje × escada nova</h4><p>Base {usd(base)} e stop {usd(stop)} do placar.</p></div></header>
        <GraficoEscadas id={id} base={base} stop={stop} modo={modo} hoje={publicado} novo={p} />
      </div>
    </>
  )
}

function AbaPalm({ p, atualizar }: { p: ParametrosDoRobo; atualizar: (patch: Patch) => void }) {
  const palm = p.palm
  if (!palm) return <p className="ac-vazio">Este robô não usa a análise do The Palm.</p>
  return (
    <>
      <div><h3>The Palm</h3><p>Os limites da janela de 25 dígitos que armam o ciclo Under 9 e liberam a recuperação Under 5.</p></div>
      <div className="ac-bloco">
        <div className="ac-campo"><label>Dígito 9 no máximo {palm.limiteNove}%</label><input type="range" className="ac-range" min={0} max={100} value={palm.limiteNove} aria-label="Máximo de dígito 9 na janela" onChange={(e) => atualizar({ palm: { limiteNove: Number(e.target.value) } })} /><p className="ac-nota">Acima disso o ciclo real Under 9 não arma.</p></div>
        <div className="ac-campo"><label>0 a 4 no mínimo {palm.limiteBaixos}%</label><input type="range" className="ac-range" min={0} max={100} value={palm.limiteBaixos} aria-label="Mínimo de dígitos 0 a 4 na janela" onChange={(e) => atualizar({ palm: { limiteBaixos: Number(e.target.value) } })} /><p className="ac-nota">Abaixo disso a recuperação Under 5 não é liberada.</p></div>
        <p className="ac-nota">Janela: <b>25 dígitos (fixa)</b> nesta versão.</p>
      </div>
      <details className="ac-mais">
        <summary>Mais opções</summary>
        <div>
          <div className="ac-campo"><label>Retorno presumido do Under 5</label><CampoNumero rotulo="Retorno presumido do Under 5" valor={palm.retornoInicial} min={0.5} max={1.5} passo={0.01} onChange={(n) => atualizar({ palm: { retornoInicial: n } })} /><p className="ac-nota">Payout presumido antes da primeira compra Under 5 (0,50 a 1,50).</p></div>
          <div className="ac-campo"><label>Segurança do payout</label><span className="ac-campo-linha"><CampoPct rotulo="Segurança do payout do The Palm" valor={1 - palm.desconto} max={20} onChange={(f) => atualizar({ palm: { desconto: Math.round((1 - f) * 10000) / 10000 } })} /></span></div>
          <div className="ac-campo"><label>Lucro ao fechar a sequência</label><span className="ac-campo-linha"><CampoPct rotulo="Lucro ao fechar do The Palm" valor={palm.margem} max={200} onChange={(f) => atualizar({ palm: { margem: f } })} sufixo="% da entrada base" /></span></div>
        </div>
      </details>
    </>
  )
}

function AbaHistorico({ sessao, roboId, detalhe, base, modo, chave, onVoltar }: { sessao: SessaoTeeds; roboId: string; detalhe: DetalheDoRobo; base: number; modo: Modo; chave: number; onVoltar: (item: ItemHistorico) => void }) {
  const [itens, setItens] = useState<ItemHistorico[] | null>(null)
  const [erro, setErro] = useState('')
  const [escadaAberta, setEscadaAberta] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    setErro('')
    lerHistorico(sessao, roboId).then((r) => { if (vivo) setItens(r) }).catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
  }, [sessao.token, roboId, chave])
  if (erro) return <p className="ac-erro">{erro}</p>
  if (itens === null) return <p className="ac-vazio">Carregando o histórico…</p>
  if (!itens.length) return <p className="ac-vazio">Este robô ainda roda o padrão da plataforma: nenhuma versão publicada.</p>
  const ordenados = [...itens].sort((a, b) => b.versao - a.versao)
  return (
    <>
      <div><h3>Histórico</h3><p>Cada publicação vira uma versão. Voltar para uma versão gera uma versão nova — nada é apagado.</p></div>
      <div className="ac-hist">
        {ordenados.map((item) => {
          const atual = item.versao === detalhe.versao
          const escada = escadaAberta === item.versao ? escadaSegura(roboId, base, 8, modo, item.parametros) : null
          return (
            <article key={`${item.versao}-${item.alteradoEm}`} className={`ac-hist-item ${atual ? 'atual' : ''}`}>
              <header>
                <h4>v{item.versao}</h4>
                <span className={`ac-estado ${atual ? 'verde' : ''}`}>{atual ? 'em vigor' : traduzirAcao(item.acao)}</span>
                <small>{item.alteradoPor.nome ?? 'sistema'} · {quando(item.alteradoEm)}</small>
              </header>
              {atual && <small className="ac-nota" style={{ margin: 0 }}>{traduzirAcao(item.acao)}</small>}
              {item.observacao && <blockquote>{item.observacao}</blockquote>}
              {item.diff.length > 0 && <ul className="ac-diff">{item.diff.map((d, i) => <li key={i}><span>{nomeDoCampo(d.campo)}:</span><s>{d.de}</s><span>→</span><b>{d.para}</b></li>)}</ul>}
              {escada && (
                <div className="ac-escadinha" aria-label={`Escada da versão ${item.versao} com base ${usd(base)}`}>
                  <div className="cab"><span>Degrau</span><span>Entrada</span><span>Lucro</span><span>Perdido</span><span>Cobre?</span></div>
                  {escada.map((d) => <div key={d.n} className={d.cobre ? '' : 'nao'}><span>{d.n}</span><b>{d.esgotada ? 'para' : usd(d.valor)}</b><span>{d.esgotada ? '—' : usd(d.lucro)}</span><span>{usd(d.perdido)}</span><b>{d.esgotada ? '—' : d.cobre ? '✓' : '✕'}</b></div>)}
                </div>
              )}
              <footer>
                <span>Sessões que rodaram: <b>{item.sessoesQueRodaram.toLocaleString('pt-BR')}</b></span>
                <button type="button" className="ac-btn mini leve" onClick={() => setEscadaAberta(escadaAberta === item.versao ? null : item.versao)}>{escada ? 'Esconder a escada' : 'Ver a escada desta versão'}</button>
                {!atual && <button type="button" className="ac-btn mini" onClick={() => onVoltar(item)}>Voltar para esta versão</button>}
              </footer>
            </article>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * O placar (coluna 3): hoje → novo, recalculado a cada tecla.
 * ------------------------------------------------------------------ */
interface Medida { custoMaximo: number; erros: number; maior: number; markup: number; escada: Degrau[]; paraAntes: boolean }
function medir(id: string, base: number, stop: number, modo: Modo, p: ParametrosDoRobo): Medida | null {
  try {
    const plano = avaliarPlano(id, base, stop, modo, p)
    const escada = escadaDoRobo(id, base, 60, modo, p)
    const mk = markupDaEscada(id, escada)
    return { custoMaximo: plano.custoMaximo, erros: plano.errosSeguidos, maior: Math.max(plano.maiorEntrada, plano.entradaAparada ?? 0), markup: mk.esperado, escada, paraAntes: plano.paraAntesDoStop }
  } catch { return null }
}
const PRESETS_REF: Array<[number, number]> = [[0.35, 20], [1, 50], [5, 100]]

function Placar({ id, marca, base, stop, modo, setRef, setModo, temModo, hoje, novo, difere, avisosNovo, sessoes }: {
  id: string; marca: string; base: number; stop: number; modo: Modo; setRef: (b: number, s: number) => void; setModo: (m: Modo) => void; temModo: boolean
  hoje: Medida | null; novo: Medida | null; difere: boolean; avisosNovo: string[]; sessoes: number
}) {
  const [aberto, setAberto] = useState(false)
  const sentido = (h: number | undefined, n: number | undefined, maiorMelhor: boolean) => {
    if (!difere || h === undefined || n === undefined || Math.abs(h - n) < 1e-9) return ''
    return (n > h) === maiorMelhor ? 'melhora' : 'piora'
  }
  const kpis: Array<{ rotulo: string; h: string; n: string; classe: string }> = [
    { rotulo: 'Perda máxima', h: hoje ? usd(hoje.custoMaximo) : '—', n: novo ? usd(novo.custoMaximo) : '—', classe: sentido(hoje?.custoMaximo, novo?.custoMaximo, false) },
    { rotulo: 'Erros seguidos que cabem', h: hoje ? String(hoje.erros) : '—', n: novo ? String(novo.erros) : '—', classe: sentido(hoje?.erros, novo?.erros, true) },
    { rotulo: 'Maior entrada', h: hoje ? usd(hoje.maior) : '—', n: novo ? usd(novo.maior) : '—', classe: sentido(hoje?.maior, novo?.maior, false) },
    { rotulo: 'Markup esperado por sequência', h: hoje ? usd4(hoje.markup) : '—', n: novo ? usd4(novo.markup) : '—', classe: sentido(hoje?.markup, novo?.markup, true) },
  ]
  const nomeDaMarca = MARCAS[marca]?.prosa ?? marca
  return (
    <aside className={`ac-placar ${aberto ? 'aberto' : ''}`} aria-label="Placar: hoje comparado com o rascunho">
      <button type="button" className="ac-placar-alcar" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span><small>Perda máxima</small><b className={kpis[0].classe}>{kpis[0].n}</b></span>
        <span><small>Markup por sequência</small><b className={kpis[3].classe}>{kpis[3].n}</b></span>
        <i>{aberto ? '▾' : '▴'}</i>
      </button>
      <header>
        <h4>Placar · {difere ? 'hoje → novo' : 'hoje'}</h4>
        <div className="ac-placar-ref">
          <div className="ac-presets" aria-label="Base e stop de referência">
            {PRESETS_REF.map(([b, s]) => <button type="button" key={b} className={b === base && s === stop ? 'on' : ''} onClick={() => setRef(b, s)}>{b.toLocaleString('pt-BR')} / {s}</button>)}
          </div>
          <span className="ac-campo-linha">
            <span className="ac-input-grupo"><b>base</b><CampoNumero rotulo="Entrada base de referência" valor={base} min={0.35} passo={0.05} onChange={(n) => { if (n >= ENTRADA_MINIMA) setRef(n, stop) }} className="mini" /></span>
            <span className="ac-input-grupo"><b>stop</b><CampoNumero rotulo="Stop de referência" valor={stop} min={0.35} passo={1} onChange={(n) => { if (n > 0) setRef(base, n) }} className="mini" /></span>
          </span>
          {temModo && (
            <select className="ac-select" value={modo} aria-label="Modo de recuperação do placar" onChange={(e) => setModo(e.target.value as Modo)}>
              <option value="conservador">{NOME_DO_MODO.conservador}</option>
              <option value="agressivo">{NOME_DO_MODO.agressivo}</option>
            </select>
          )}
        </div>
      </header>
      <div className="ac-placar-kpis">
        {kpis.map((k) => (
          <div key={k.rotulo} className={`ac-kpi ${k.classe}`}>
            <span>{k.rotulo}</span>
            <div>{difere ? <><small>{k.h}</small><i>→</i><b>{k.n}</b></> : <b>{k.h}</b>}</div>
          </div>
        ))}
        {(novo?.paraAntes || hoje?.paraAntes) && <p className="ac-nota" style={{ margin: 0 }}>⚠ A tabela para antes do stop de referência.</p>}
      </div>
      {avisosNovo.length > 0 && <ul className="ac-avisos">{avisosNovo.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}
      <p className="ac-placar-impacto">
        <b>Impacto ao publicar:</b> {sessoes} {sessoes === 1 ? 'sessão em andamento recebe' : 'sessões em andamento recebem'} a regra nova na próxima operação · vale para os próximos inícios · só na <b>{nomeDaMarca}</b>.
      </p>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * TELA 2 — o painel.
 * ------------------------------------------------------------------ */
export interface PropsControle {
  sessao: SessaoTeeds
  roboId: string
  /** A marca administrada (a Teeds master pode estar ajustando a OMNI). */
  marca: string
  detalhe: DetalheDoRobo
  onFechar: () => void
  /** Depois de publicar/testar/promover/restaurar: a lista recarrega. */
  onAtualizado: () => void
}
type Aba = 'entrada' | 'recuperacao' | 'escada' | 'palm' | 'simulacao' | 'historico'
const abaDoCampo = (campo: string): Aba => (campo.startsWith('entrada') ? 'entrada' : campo.startsWith('recuperacao.escada') ? 'escada' : campo.startsWith('palm') ? 'palm' : 'recuperacao')
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function AdminControleRobo({ sessao, roboId, marca, detalhe: detalheInicial, onFechar, onAtualizado }: PropsControle) {
  const ehPalm = roboId === 'thepalm'
  const ident = identidade(roboId)
  const [detalhe, setDetalhe] = useState(detalheInicial)
  const [rascunho, setRascunho] = useState<ParametrosDoRobo>(() => detalheInicial.rascunho ?? detalheInicial.publicado)
  const [aba, setAba] = useState<Aba>(ehPalm ? 'palm' : 'entrada')
  const [ref, setRefEstado] = useState({ base: 0.35, stop: 20 })
  const [modo, setModo] = useState<Modo>('conservador')
  const [confirmacao, setConfirmacao] = useState<AcaoConfirmavel | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState('')
  const [chaveHistorico, setChaveHistorico] = useState(0)
  const [estadoRascunho, setEstadoRascunho] = useState<'ok' | 'salvando' | 'erro' | 'invalido'>('ok')
  const [salvoEm, setSalvoEm] = useState<string | null>(detalheInicial.rascunhoEm)
  const ultimoSalvo = useRef<string | null>(detalheInicial.rascunho ? JSON.stringify(detalheInicial.rascunho) : null)
  // O que ainda não foi para a nuvem (o salvamento tem 1 s de espera). Se o
  // admin fechar o painel antes disso, o desmonte manda o pendente mesmo assim.
  const pendente = useRef<ParametrosDoRobo | null>(null)
  useEffect(() => () => { if (pendente.current) void salvarRascunho(sessao, roboId, pendente.current).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const publicado = detalhe.publicado
  const erros = useMemo(() => validar(rascunho, roboId), [rascunho, roboId])
  const difere = useMemo(() => !igual(rascunho, publicado), [rascunho, publicado])
  const diffs = useMemo(() => (difere ? diferencas(rascunho, publicado) : []), [difere, rascunho, publicado])
  const abasComMudanca = useMemo(() => new Set(diffs.map((d) => abaDoCampo(d.campo))), [diffs])
  const temModo = temModoAgressivo(rascunho) || temModoAgressivo(publicado)
  const modoEfetivo: Modo = temModo ? modo : 'conservador'
  const hoje = useMemo(() => medir(roboId, ref.base, ref.stop, modoEfetivo, publicado), [roboId, ref, modoEfetivo, publicado])
  const novo = useMemo(() => (difere ? medir(roboId, ref.base, ref.stop, modoEfetivo, rascunho) : hoje), [roboId, ref, modoEfetivo, rascunho, difere, hoje])
  const avisosNovo = useMemo(() => avisosDe(roboId, rascunho, modoEfetivo, ref.base), [roboId, rascunho, modoEfetivo, ref.base])

  const atualizar = (patch: Patch) => setRascunho((r) => ({ ...mesclar(r, patch), v: 1 }))
  const setRef = (base: number, stop: number) => setRefEstado({ base, stop })

  // Rascunho na nuvem: 1 s depois da última tecla, só quando válido. Igual ao publicado = descarta o da nuvem.
  useEffect(() => {
    if (!difere) {
      setEstadoRascunho('ok')
      if (ultimoSalvo.current === null) return
      pendente.current = null
      const t = setTimeout(() => {
        ultimoSalvo.current = null
        salvarRascunho(sessao, roboId, null).then(() => setSalvoEm(null)).catch(() => {})
      }, 1000)
      return () => clearTimeout(t)
    }
    if (erros.length) { setEstadoRascunho('invalido'); pendente.current = null; return }
    const json = JSON.stringify(rascunho)
    if (json === ultimoSalvo.current) { setEstadoRascunho('ok'); pendente.current = null; return }
    pendente.current = rascunho
    const t = setTimeout(async () => {
      setEstadoRascunho('salvando')
      try {
        const r = await salvarRascunho(sessao, roboId, rascunho)
        ultimoSalvo.current = json
        if (pendente.current === rascunho) pendente.current = null
        setSalvoEm(r.salvoEm)
        setEstadoRascunho('ok')
      } catch { setEstadoRascunho('erro') }
    }, 1000)
    return () => clearTimeout(t)
  }, [rascunho, difere, erros.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirmacao) onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [confirmacao, onFechar])

  const recarregar = async () => {
    try {
      const d = await lerParametros(sessao, roboId)
      setDetalhe(d)
      setRascunho(d.rascunho ?? d.publicado)
      ultimoSalvo.current = d.rascunho ? JSON.stringify(d.rascunho) : null
      setSalvoEm(d.rascunhoEm)
    } catch (e) { setErroAcao((e as Error).message) }
  }

  const concluir = async (r: RespostaAcao, texto: string, semContagem = false) => {
    setConfirmacao(null)
    const n = r.sessoesAtualizadas ?? 0
    setToast(semContagem
      ? `${texto} · vale para as contas demo nos próximos inícios${n > 0 ? ` e em ${n} ${n === 1 ? 'sessão demo em andamento' : 'sessões demo em andamento'}` : ''}`
      : `${texto} · ${n} ${n === 1 ? 'sessão em andamento atualizada' : 'sessões em andamento atualizadas'} · vale para os próximos inícios`)
    window.dispatchEvent(new Event('catalogo-alterado'))
    await recarregar()
    setChaveHistorico((k) => k + 1)
    onAtualizado()
  }

  const fotoDaSimulacao = (alvo: ParametrosDoRobo) => ({
    referencia: { base: ref.base, stop: ref.stop, modo: modoEfetivo },
    cartoes: cartoesSeguros(roboId, alvo, modoEfetivo),
    placar: {
      hoje: hoje ? { custoMaximo: hoje.custoMaximo, errosSeguidos: hoje.erros, maiorEntrada: hoje.maior, markupEsperado: hoje.markup } : null,
      novo: (() => { const m = medir(roboId, ref.base, ref.stop, modoEfetivo, alvo); return m ? { custoMaximo: m.custoMaximo, errosSeguidos: m.erros, maiorEntrada: m.maior, markupEsperado: m.markup } : null })(),
    },
  })

  const montar = (parte: Pick<AcaoConfirmavel, 'titulo' | 'descricao' | 'botao' | 'exigirNome' | 'pedirMotivo' | 'executar' | 'soDemo'>, alvo: ParametrosDoRobo): AcaoConfirmavel => ({
    ...parte,
    diff: diferencas(alvo, publicado),
    cartoes: cartoesSeguros(roboId, alvo, modoEfetivo),
    sessoesVivas: detalhe.sessoesVivas.total,
    avisos: avisosDe(roboId, alvo, modoEfetivo, ref.base),
    nome: detalhe.nomeNaMarca,
  })

  const publicar = () => setConfirmacao(montar({
    titulo: 'Publicar para todos', descricao: `${detalhe.nomeNaMarca} · contas reais e demo desta plataforma`, botao: 'Publicar para todos', exigirNome: true, pedirMotivo: true,
    executar: async (obs) => { const r = await publicarParametros(sessao, roboId, rascunho, obs, detalhe.nomeNaMarca, fotoDaSimulacao(rascunho)); void concluir(r, `v${r.versao ?? ''} publicada`); return r },
  }, rascunho))
  const testar = () => setConfirmacao(montar({
    titulo: 'Testar no demo', descricao: `${detalhe.nomeNaMarca} · só as contas demo rodam a regra nova; a conta real segue a publicada`, botao: 'Testar no demo', exigirNome: false, pedirMotivo: true, soDemo: true,
    executar: async (obs) => { const r = await testarNoDemo(sessao, roboId, rascunho, obs); void concluir(r, 'Regra em teste nas contas demo', true); return r },
  }, rascunho))
  const promover = () => { const alvo = detalhe.testeDemo; if (!alvo) return; setConfirmacao(montar({
    titulo: 'Promover para todos', descricao: `${detalhe.nomeNaMarca} · a regra em teste no demo passa a valer para todas as contas`, botao: 'Promover para todos', exigirNome: true, pedirMotivo: true,
    executar: async (obs) => { const r = await promoverDemo(sessao, roboId, obs, detalhe.nomeNaMarca); void concluir(r, `v${r.versao ?? ''} promovida para todos`); return r },
  }, alvo)) }
  const restaurarPadrao = () => setConfirmacao(montar({
    titulo: 'Restaurar o padrão da plataforma', descricao: `${detalhe.nomeNaMarca} · volta às regras de fábrica do robô`, botao: 'Restaurar padrão', exigirNome: true, pedirMotivo: false,
    executar: async () => { const r = await restaurarVersao(sessao, roboId, 'padrao', detalhe.nomeNaMarca); void concluir(r, 'Padrão da plataforma restaurado'); return r },
  }, detalhe.padrao))
  const voltarPara = (item: ItemHistorico) => setConfirmacao(montar({
    titulo: `Voltar para a v${item.versao}`, descricao: `${detalhe.nomeNaMarca} · publica uma versão nova com as regras da v${item.versao}`, botao: `Voltar para a v${item.versao}`, exigirNome: true, pedirMotivo: false,
    executar: async () => { const r = await restaurarVersao(sessao, roboId, item.versao, detalhe.nomeNaMarca); void concluir(r, `v${r.versao ?? ''} publicada (regras da v${item.versao})`); return r },
  }, item.parametros))
  const descartarRascunho = async () => {
    const haviaNaNuvem = ultimoSalvo.current !== null || salvoEm !== null
    setRascunho(publicado)
    ultimoSalvo.current = null
    pendente.current = null
    if (!haviaNaNuvem) return
    try { await salvarRascunho(sessao, roboId, null); setSalvoEm(null) } catch (e) { setErroAcao((e as Error).message) }
  }
  const descartarOTeste = async () => {
    setErroAcao('')
    try { await concluir(await descartarTeste(sessao, roboId), 'Teste no demo descartado') } catch (e) { setErroAcao((e as Error).message) }
  }

  const abas: Array<[Aba, string, string]> = [
    ...(ehPalm ? [] : [['entrada', 'Entrada', '◔'] as [Aba, string, string]]),
    ['recuperacao', 'Recuperação', '↻'],
    ['escada', 'Escada', '▤'],
    ...(ehPalm ? [['palm', 'The Palm', '✦'] as [Aba, string, string]] : []),
    ['simulacao', 'Simulação', '≈'],
    ['historico', 'Histórico', '◷'],
  ]
  const versaoTexto = detalhe.versao === null
    ? 'Padrão da plataforma'
    : `Versão ${detalhe.versao} · publicada em ${quando(detalhe.publicadoEm ?? detalhe.atualizadoEm) || '—'}${detalhe.atualizadoPor?.nome ? ` por ${detalhe.atualizadoPor.nome}` : ''}`
  const igualAoPadrao = detalhe.versao !== null && diferencas(publicado, detalhe.padrao).length === 0
  const podeAgir = difere && erros.length === 0

  return (
    <div className="ac ac-modal-fundo" role="dialog" aria-modal="true" aria-label={`Controle do ${detalhe.nomeNaMarca}`}>
      <section className="ac-modal">
        <header className="ac-cab">
          <div className="ac-cab-linha">
            <Emblema id={ident} tamanho={44} />
            <div>
              <h2>{detalhe.nomeNaMarca}</h2>
              <p>{linhaDoContrato(roboId, rascunho)}</p>
            </div>
            <button type="button" className="ac-fechar" onClick={onFechar} aria-label="Fechar o painel">✕</button>
          </div>
          <div className="ac-cab-versao">
            <span className={`ac-estado ${detalhe.versao === null ? '' : 'verde'}`}>{versaoTexto}</span>
            {igualAoPadrao && <span className="ac-estado">igual ao padrão da plataforma</span>}
            {detalhe.sessoesVivas.total > 0 && <span className="ac-estado">{detalhe.sessoesVivas.total} {detalhe.sessoesVivas.total === 1 ? 'sessão em andamento' : 'sessões em andamento'}</span>}
          </div>
          {detalhe.testeDemo && (
            <div className="ac-faixa azul">
              <span><b>Versão em teste nas contas demo.</b> A conta real segue a publicada.
                {(() => { const d = diferencas(detalhe.testeDemo, publicado); return d.length ? <small>{d.map(resumirDiferenca).join(' · ')}</small> : null })()}
              </span>
              <div>
                <button type="button" className="ac-btn mini azul" onClick={promover}>Promover para todos</button>
                <button type="button" className="ac-btn mini" onClick={() => { if (detalhe.testeDemo) setRascunho(detalhe.testeDemo) }}>Editar a partir do teste</button>
                <button type="button" className="ac-btn mini leve" onClick={() => void descartarOTeste()}>Descartar teste</button>
              </div>
            </div>
          )}
          {difere && (
            <div className="ac-faixa ambar">
              <span>
                <b>Você tem alterações não publicadas em {diffs.length} {diffs.length === 1 ? 'campo' : 'campos'}:</b> {diffs.map(resumirDiferenca).join(' · ')}
                <small>
                  {estadoRascunho === 'invalido' ? 'rascunho com erros: corrija para salvar'
                    : estadoRascunho === 'salvando' ? 'salvando o rascunho na nuvem…'
                    : estadoRascunho === 'erro' ? 'não deu para salvar o rascunho na nuvem — vamos tentar de novo na próxima alteração'
                    : salvoEm ? `rascunho salvo na nuvem às ${quando(salvoEm).slice(-5)}` : 'rascunho ainda não salvo'}
                </small>
              </span>
            </div>
          )}
          {erros.length > 0 && <ul className="ac-erros">{erros.map((e) => <li key={e}>✕ {e}</li>)}</ul>}
          {erroAcao && <div className="ac-faixa vermelha"><span>{erroAcao}</span><button type="button" className="ac-btn mini leve" onClick={() => setErroAcao('')}>fechar</button></div>}
          <div className="ac-cab-acoes">
            {difere && <button type="button" className="ac-btn leve" onClick={() => void descartarRascunho()}>Descartar rascunho</button>}
            {detalhe.versao !== null && <button type="button" className="ac-btn leve" onClick={restaurarPadrao}>Restaurar padrão</button>}
            <button type="button" className="ac-btn azul" onClick={testar} disabled={!podeAgir} title={!difere ? 'O rascunho é igual ao publicado' : erros.length ? 'Corrija os erros antes' : ''}>Testar no demo</button>
            <button type="button" className="ac-btn primario" onClick={publicar} disabled={!podeAgir} title={!difere ? 'O rascunho é igual ao publicado' : erros.length ? 'Corrija os erros antes' : ''}>Publicar para todos</button>
          </div>
        </header>

        <div className="ac-corpo">
          <nav className="segmented ac-abas" aria-label="Seções do painel">
            {abas.map(([id, nome, icone]) => (
              <button type="button" key={id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)} aria-current={aba === id ? 'page' : undefined}>
                <i>{icone}</i><span>{nome}</span>{abasComMudanca.has(id) && <em title="tem alteração não publicada" />}
              </button>
            ))}
          </nav>
          <div className="ac-conteudo">
            {aba === 'entrada' && <AbaEntrada id={roboId} p={rascunho} atualizar={atualizar} />}
            {aba === 'recuperacao' && <AbaRecuperacao id={roboId} p={rascunho} atualizar={atualizar} />}
            {aba === 'escada' && <AbaEscada id={roboId} p={rascunho} atualizar={atualizar} base={ref.base} stop={ref.stop} modo={modoEfetivo} publicado={publicado} />}
            {aba === 'palm' && <AbaPalm p={rascunho} atualizar={atualizar} />}
            {aba === 'simulacao' && (
              <>
                <div><h3>Simulação</h3><p>Hoje (publicado) × com esta mudança (rascunho). Estimativa: a conferência oficial é a da Deriv.</p></div>
                <SimuladorDoRobo id={roboId} hoje={publicado} novo={difere ? rascunho : null} />
              </>
            )}
            {aba === 'historico' && <AbaHistorico sessao={sessao} roboId={roboId} detalhe={detalhe} base={ref.base} modo={modoEfetivo} chave={chaveHistorico} onVoltar={voltarPara} />}
          </div>
          <Placar
            id={roboId} marca={marca} base={ref.base} stop={ref.stop} modo={modoEfetivo} setRef={setRef} setModo={setModo} temModo={temModo}
            hoje={hoje} novo={novo} difere={difere} avisosNovo={avisosNovo} sessoes={detalhe.sessoesVivas.total}
          />
        </div>
      </section>
      {confirmacao && <ConfirmacaoDeAcao acao={confirmacao} onFechar={() => setConfirmacao(null)} onConcluido={() => { /* `executar` já chama concluir() */ }} />}
      {toast && <div className="ac-toast" role="status">✓ <b>{toast.split(' · ')[0]}</b>{toast.includes(' · ') ? ` · ${toast.split(' · ').slice(1).join(' · ')}` : ''}</div>}
    </div>
  )
}
