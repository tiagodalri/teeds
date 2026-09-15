import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { clientesPorId, type ClienteRegistro } from '../core/teeds/clientes'
import {
  EstimadorDeDesvio, MedidorDeRtt, ROTULO_EVENTO, ROTULO_FASE, aplicarMensagem, descreverEvento, idadeDaAtualizacao, integridadeDoHistorico,
  marcadorDoEvento, mascararConta, mascararEmail, ordenarEventos, paraEstadoMotor, reconstruir, saudeDoSinal, semaforo,
  type EstadoEspelho, type EventoEspelho, type Integridade, type MensagemEspelho, type PassoReplay, type Saude, type SessaoEspelho,
} from '../core/teeds/espelho'
import { assinarMudancas, type EstadoDoCanal } from '../core/teeds/realtime'
import {
  ErroDoMonitoramento, auditar, auditarNegado, carregarEventos, eventosDaSessao, lerEspelho, lerSessaoMae, listarAuditoria, listarEncerradas, listarEspelhos,
  paraEvento, paraSessaoEspelho, type RegistroAuditoria, type SessaoEncerrada,
} from '../core/teeds/monitoramento'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'
import { identidade } from '../core/deriv/branding'
import { MARCA } from '../marca'
import { RobotLive } from './RobotLive'
import { IconeFechar } from './IconeFechar'

/**
 * Monitoramento ao vivo — a central administrativa.
 *
 * Um mosaico com a cabine de cada cliente que está operando, montado a
 * partir da telemetria que o servidor dos robôs publica (nunca da tela do
 * cliente). Clicar num cartão abre a cabine espelho: o MESMO componente
 * que o cliente vê (`RobotLive`), sem nenhum controle — não há handler
 * algum por trás, porque nenhum é passado (nada é escondido por CSS).
 *
 * Toda mensagem que chega (foto, pulso, evento, lista de reconciliação)
 * passa por UMA regra, `aplicarMensagem`, que decide se é mais nova; a
 * tela nunca decide isso sozinha.
 *
 * Só administradores chegam aqui (o menu e a rota já filtram), e o banco
 * confere de novo em cada leitura: um admin da Teeds não recebe uma linha
 * da OMNI nem forjando a marca na consulta. Sem registro de auditoria a
 * cabine e o replay não abrem.
 */

type Aba = 'ao-vivo' | 'replay' | 'auditoria'
type Visao = 'compacto' | 'confortavel' | 'lista'
type Ordem = 'atividade' | 'risco' | 'resultado' | 'nome' | 'operacoes' | 'inicio'
type Periodo = '1' | '6' | '12' | '24' | '72'
type EstadoDaTela = 'carregando' | 'pronto' | 'sem-permissao' | 'indisponivel' | 'erro'

const NOME_DO_ATIVO: Record<string, string> = { 'R_75': 'Volatility 75 Index', '1HZ75V': 'Volatility 75 (1s) Index', '1HZ10V': 'Volatility 10 (1s) Index', '1HZ100V': 'Volatility 100 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index' }
const din = (v: number, m = 'USD') => `${m} ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const segundos = (s: number) => s.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ROTULO_SAUDE: Record<Saude, string> = { 'ao-vivo': 'Ao vivo', atencao: 'Atenção', desatualizado: 'Desatualizado', encerrada: 'Encerrada' }
const ROTULO_CANAL: Record<EstadoDoCanal, string> = { 'ao-vivo': 'Canal ao vivo', reconectando: 'Reconectando…', conectando: 'Conectando…', 'token-expirado': 'Sessão expirada — entre de novo', fechado: 'Canal fechado' }
const ROTULO_INTEGRIDADE: Record<Integridade, string> = { completo: 'Histórico completo', carregando: 'Carregando histórico…', lacunas: 'Histórico com lacunas', indisponivel: 'Histórico indisponível', 'em-andamento': 'Sessão em andamento' }

/** O que a cabine precisa saber do robô: a mesma regra que a tela do cliente usa. */
function regrasDoRobo(roboId: string) {
  const est = ESTRATEGIAS_LOCAIS.find((e) => e.id === roboId)
  const ident = (() => { try { return identidade(roboId) } catch { return null } })()
  const b = est?.barreira ?? 5
  const regra = est ? ({ DIGITOVER: `maior que ${b}`, DIGITUNDER: `menor que ${b}`, DIGITMATCH: `igual a ${b}`, DIGITDIFF: `diferente de ${b}`, DIGITEVEN: 'par', DIGITODD: 'ímpar' } as Record<string, string>)[est.contractType] ?? est.contractType : '—'
  const ganhaCom = (d: number) => {
    switch (est?.contractType) {
      case 'DIGITOVER': return d > b
      case 'DIGITUNDER': return d < b
      case 'DIGITMATCH': return d === b
      case 'DIGITDIFF': return d !== b
      case 'DIGITEVEN': return d % 2 === 0
      case 'DIGITODD': return d % 2 === 1
      default: return false
    }
  }
  return { regra, ganhaCom, cor: ident?.cor ?? MARCA.cor.escuro, corSuave: ident?.corSuave ?? 'transparent' }
}

function mensagemDoErro(e: unknown): { estado: EstadoDaTela; texto: string } {
  if (e instanceof ErroDoMonitoramento) {
    if (e.semPermissao) return { estado: 'sem-permissao', texto: 'Sem permissão para o monitoramento desta marca.' }
    if (e.status === 0 || e.status >= 500) return { estado: 'indisponivel', texto: 'Supabase indisponível no momento. Nada foi perdido: o servidor continua gravando.' }
  }
  return { estado: 'erro', texto: (e as Error)?.message || 'Falha inesperada.' }
}

/* ============================================================ cartão */

const Cartao = memo(function Cartao({ s, cliente, saude, visao, aoAbrir }: { s: SessaoEspelho; cliente?: ClienteRegistro; saude: Saude; visao: Visao; aoAbrir: (id: string) => void }) {
  const e = s.estado
  const cor = semaforo(s, saude === 'ao-vivo' ? s.recebidoEm : saude === 'atencao' ? s.recebidoEm + 3000 : s.recebidoEm + 10_000)
  const { cor: corRobo } = regrasDoRobo(s.roboId)
  const nome = cliente?.nome || mascararEmail(cliente?.email)
  const ultimoDigito = e.digitos?.[e.digitos.length - 1]
  const margem = s.config.stopLoss > 0 ? Math.max(0, s.config.stopLoss + e.resultado) : 0
  const falta = s.config.takeProfit > 0 ? Math.max(0, s.config.takeProfit - e.resultado) : 0
  // Fotos antigas não tinham este campo. A cauda do histórico mantém um
  // fallback útil até o servidor publicar a próxima foto completa.
  const markup = Number.isFinite(e.markupCalculado) ? e.markupCalculado : (e.historico ?? []).reduce((t, op) => t + Math.max(0, op.payout) * .03, 0)
  return (
    <button className={`mon-cartao ${cor} ${visao}`} onClick={() => aoAbrir(s.sessaoId)} style={{ ['--robo' as string]: corRobo }}
      aria-label={`Abrir a cabine espelho de ${nome}, ${s.roboNome}, ${ROTULO_SAUDE[saude]}. Somente visualização.`}>
      <header>
        <i className="mon-farol" aria-hidden />
        <span className="mon-cartao-quem"><b>{nome}</b><small>{mascararEmail(cliente?.email)} · {mascararConta(s.contaId)} · <em className={s.demo ? 'demo' : 'real'}>{s.demo ? 'demo' : 'real'}</em></small></span>
        <span className={`mon-saude ${saude}`}><i aria-hidden />{ROTULO_SAUDE[saude]}</span>
      </header>
      <div className="mon-cartao-robo">
        <span><b>{s.roboNome}</b><small>{NOME_DO_ATIVO[s.ativo] ?? s.ativo}</small></span>
        <em>{ROTULO_FASE[e.fase] ?? e.fase}{e.estrategia ? ` · ${e.estrategia.detalhes?.estrategiaAtual ?? e.estrategia.fase}` : ''}</em>
      </div>
      <div className="mon-cartao-principais">
        <span><i>Resultado</i><b className={e.resultado >= 0 ? 'up' : 'down'}>{assinado(e.resultado)} <small>{s.moeda}</small></b><small>nesta sessão</small></span>
        <span className="markup"><i>Markup</i><b>{din(markup, s.moeda)}</b><small>{s.demo ? 'projeção simulada' : 'calculado em tempo real'}</small></span>
        <span><i>Operações</i><b>{e.operacoes}</b><small><em className="up">{e.vitorias} ganhas</em><em className="down">{e.derrotas} perdidas</em></small></span>
      </div>
      <div className="mon-cartao-resumo">
        <span><i>Entrada atual</i><b>{din(e.emCurso?.valor ?? e.valorAtual, s.moeda)}</b></span>
        <span><i>Recuperação</i><b>{e.perdasSeguidas ? `Nível ${e.perdasSeguidas}` : 'Sem recuperação'}</b></span>
        <span><i>Último dígito</i><b>{ultimoDigito ?? '—'}</b></span>
      </div>
      {visao !== 'compacto' && <div className="mon-cartao-limites">
        <span><i className="down" /><small>Margem até o stop</small><b className="down">{din(margem, s.moeda)}</b></span>
        <span><i className="up" /><small>Falta para a meta</small><b className="up">{din(falta, s.moeda)}</b></span>
      </div>}
      <footer><span>{s.emitidoEm ? `Atualizado às ${hora(s.emitidoEm)}` : '—'}</span><span>{s.demo ? 'Projeção — não é receita real' : e.conexao !== 'open' ? 'Deriv: ' + e.conexao : e.falha ? 'recusa da Deriv' : 'Markup local · 3% do pagamento'}</span></footer>
    </button>
  )
})
// O cartão só redesenha quando a SESSÃO muda (nova mensagem), a ficha do
// cliente chega, a disposição troca ou a saúde muda de faixa — nunca a cada
// segundo do relógio.

/* ===================================================== cabine espelho */

function CabineEspelho({ s, estado, cliente, modo, saude, idade, rtt, desvio, eventos, aoFechar, passo, integridade }: {
  s: SessaoEspelho; estado: EstadoEspelho; cliente?: ClienteRegistro; modo: 'ao-vivo' | 'replay'; saude: Saude; idade: number | null; rtt: number | null; desvio: number | null
  eventos: EventoEspelho[]; aoFechar: () => void; passo?: { indice: number; total: number; horaOriginal: number; lacuna: number }; integridade?: Integridade
}) {
  const { regra, ganhaCom, cor, corSuave } = regrasDoRobo(s.roboId)
  const nomeAtivo = NOME_DO_ATIVO[s.ativo] ?? s.ativo
  const parametros = [
    { rot: 'Ativo', valor: nomeAtivo.replace(' Index', '') },
    { rot: 'Entrada', valor: din(s.config.valorAoVencer || s.config.valorInicial, s.moeda) },
    { rot: 'Recuperação', valor: s.config.fatorGale === 0 ? 'desligado' : `automática ${MARCA.prosa}` },
    { rot: 'Teto', valor: s.config.valorMaximo > 0 ? din(s.config.valorMaximo, s.moeda) : 'sem teto' },
    { rot: 'Para se ganhar', valor: din(s.config.takeProfit, s.moeda) },
    { rot: 'Para se perder', valor: din(s.config.stopLoss, s.moeda) },
  ]
  const nome = cliente?.nome || mascararEmail(cliente?.email)
  const est = estado.estrategia
  const titulo = useRef<HTMLButtonElement>(null)
  useEffect(() => { titulo.current?.focus() }, [])
  const linhas = useMemo(() => {
    const ordenados = ordenarEventos(eventos)
    const saida: Array<{ ev: EventoEspelho; lacuna: number }> = []
    for (let i = 0; i < ordenados.length; i++) saida.push({ ev: ordenados[i], lacuna: i ? Math.max(0, ordenados[i].seq - ordenados[i - 1].seq - 1) : 0 })
    return saida.reverse().slice(0, 80)
  }, [eventos])
  return (
    <section className={`mon-foco ${modo}`} role="region" aria-label={`Cabine espelho de ${nome}, somente visualização`}>
      <header className="mon-foco-topo">
        <button ref={titulo} className="mon-voltar" onClick={aoFechar}>← Mosaico</button>
        <div className="mon-foco-quem">
          <b>{nome}</b>
          <small>{mascararEmail(cliente?.email)} · conta {mascararConta(s.contaId)} · <em className={s.demo ? 'demo' : 'real'}>{s.demo ? 'demo' : 'real'}</em> · {s.moeda} · {MARCA.prosa}</small>
        </div>
        {modo === 'replay'
          ? <span className="mon-selo replay">REPLAY{passo ? ` · ${hora(passo.horaOriginal)} · evento ${passo.indice + 1}/${passo.total}${passo.lacuna ? ` · lacuna de ${passo.lacuna}` : ''}` : ''}{integridade ? ` · ${ROTULO_INTEGRIDADE[integridade]}` : ''}</span>
          : <span className={`mon-selo ${saude}`} role="status"><i aria-hidden />{ROTULO_SAUDE[saude]}{idade != null && saude !== 'encerrada' ? ` · atualizado há ${segundos(idade)} s` : ''}{rtt != null ? ` · canal ~${rtt} ms` : ''}{desvio != null && Math.abs(desvio) >= 2 ? ` · relógio do servidor ≈ ${desvio > 0 ? '−' : '+'}${segundos(Math.abs(desvio))} s` : ''}</span>}
        <span className="mon-selo leitura" aria-label="Somente visualização">Somente visualização</span>
        <button className="mon-fechar" onClick={aoFechar} aria-label="Fechar a cabine espelho"><IconeFechar /></button>
      </header>

      <div className={`cabine-caixa expandido ${estado.rodando ? 'rodando' : 'parado'} mon-somente-leitura`} style={{ ['--robo' as any]: cor, ['--robo-suave' as any]: corSuave }}>
        {/* Sem onDesligar, onLigarDeNovo, onRemover, onDigitos, onExpandir: a cabine não desenha botão nenhum (a barra de ações fica vazia — não é escondida por CSS). */}
        <RobotLive
          estado={paraEstadoMotor(estado)}
          config={s.config}
          moeda={s.moeda}
          contaDaSessao={{ contaId: s.contaId, demo: s.demo, moeda: s.moeda }}
          estrategiaId={s.roboId}
          nomeEstrategia={s.roboNome}
          ativo={nomeAtivo}
          titulo={`${nome} · ${mascararConta(s.contaId)}`}
          regra={regra}
          cor={cor}
          ganhaCom={ganhaCom}
          parametros={parametros}
          conexao={estado.conexao}
          expandido
        />
      </div>

      <div className="mon-foco-extras">
        <section className="admin-card mon-estrategia">
          <header><div><span className="rot">Estratégia</span><h3>{est ? `Fase: ${est.fase}` : 'Sem telemetria de estratégia'}</h3></div>{est && <small>{est.virtual ? 'virtual (sem entrada real)' : 'entrada liberada'}</small>}</header>
          {est && (
            <dl>
              <div><dt>Contrato</dt><dd>{est.contrato ?? '—'}{est.barreira != null ? ` · barreira ${est.barreira}` : ''}</dd></div>
              <div><dt>Anterior</dt><dd>{est.anterior ?? '—'}</dd></div>
              <div><dt>Motivo da troca</dt><dd>{est.motivo ?? '—'}</dd></div>
              {Object.entries(est.detalhes ?? {}).filter(([k]) => k !== 'trocadaEm').map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
              {Number(est.detalhes?.trocadaEm) > 0 && <div><dt>Trocou às</dt><dd>{hora(Number(est.detalhes.trocadaEm))}</dd></div>}
            </dl>
          )}
        </section>
        <section className="admin-card mon-eventos">
          <header><div><span className="rot">Linha do tempo</span><h3>Eventos da sessão</h3></div><small>{eventos.length} evento{eventos.length === 1 ? '' : 's'}</small></header>
          <ol className="mon-eventos-lista">
            {linhas.map(({ ev, lacuna }) => (
              <li key={`${ev.sessaoId}-${ev.seq}`} className={`mon-ev ${ev.tipo}${lacuna ? ' lacuna' : ''}`}>
                <time>{hora(ev.emitidoEm)}</time><b>#{ev.seq} {ROTULO_EVENTO[ev.tipo] ?? ev.tipo}{lacuna ? ` · faltam ${lacuna}` : ''}</b><span>{descreverEvento(ev, s.moeda)}</span>
              </li>
            ))}
            {!eventos.length && <li className="mon-ev vazio"><span>Nenhum evento carregado ainda.</span></li>}
          </ol>
        </section>
      </div>
    </section>
  )
}

/* ============================================================ replay */

const VELOCIDADES = [0.25, 0.5, 1, 2, 4]
/** Um intervalo maior que isto entre eventos é inatividade: o replay salta e avisa. */
const INATIVIDADE_MS = 8000

function Replay({ sessao, encerrada, clientes, aoFechar, aoErro }: { sessao: SessaoTeeds; encerrada: SessaoEncerrada; clientes: Map<string, ClienteRegistro>; aoFechar: () => void; aoErro: (e: unknown) => void }) {
  const [passos, setPassos] = useState<PassoReplay[]>([])
  const [eventos, setEventos] = useState<EventoEspelho[]>([])
  const [cabecalho, setCabecalho] = useState<SessaoEspelho | null>(null)
  const [indice, setIndice] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [carregados, setCarregados] = useState(0)
  const [autorizado, setAutorizado] = useState<boolean | null>(null)
  const [saltou, setSaltou] = useState<number | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const aborto = new AbortController()
    setPassos([]); setEventos([]); setCabecalho(null); setIndice(0); setTocando(false); setCarregando(true); setCarregados(0); setAutorizado(null); setSaltou(null)
    ;(async () => {
      // 1) auditoria ANTES de ler qualquer coisa. Sem registro, sem replay.
      try { await auditar(sessao, { tipo: 'replay', acao: 'abriu', sessaoId: encerrada.id, clienteId: encerrada.userId }) }
      catch (e) { if (!aborto.signal.aborted) { setAutorizado(false); setCarregando(false); aoErro(e) }; return }
      if (aborto.signal.aborted) return
      setAutorizado(true)
      try {
        const todos = await carregarEventos(sessao, encerrada.id, aborto.signal, setCarregados)
        const mae = await lerSessaoMae(sessao, encerrada.id, aborto.signal)
        if (aborto.signal.aborted) return
        const abertura = todos.find((e) => e.tipo === 'abertura')
        const config = abertura?.config ?? { valorInicial: Number(mae?.entrada_inicial ?? 0), valorAoVencer: Number(mae?.entrada_inicial ?? 0), fatorGale: 0, galeApos: 0, valorMaximo: 0, takeProfit: Number(mae?.take_profit ?? 0), stopLoss: Number(mae?.stop_loss ?? 0), maxOperacoes: Number(mae?.max_operacoes ?? 0) }
        const ps = reconstruir(todos)
        setEventos(todos); setPassos(ps); setIndice(0)
        setCabecalho(paraSessaoEspelho({ sessao_id: encerrada.id, marca: MARCA.id, user_id: encerrada.userId, seq: 0, estado: ps[0]?.estado ?? {}, config, emitido_em: 0, atualizada_em: '' }, mae ?? { sessao_ref: encerrada.sessaoRef, conta_id: encerrada.contaId, demo: encerrada.demo, moeda: encerrada.moeda, robo_id: encerrada.roboId, robo_nome: encerrada.roboNome, ativo: encerrada.ativo, situacao: encerrada.situacao, criada_em: encerrada.criadaEm }))
      } catch (e) { if ((e as Error).name !== 'AbortError' && !aborto.signal.aborted) aoErro(e) }
      finally { if (!aborto.signal.aborted) setCarregando(false) }
    })()
    return () => {
      aborto.abort()
      // O fechamento é registrado; se falhar, fica no console — o replay já foi visto, não há o que "fechar" de novo.
      auditar(sessao, { tipo: 'replay', acao: 'fechou', sessaoId: encerrada.id, clienteId: encerrada.userId }).catch((e) => console.error('[monitoramento] auditoria de fechamento falhou:', (e as Error).message))
    }
  }, [sessao, encerrada, aoErro])

  // Toca no ritmo original dividido pela velocidade; inatividade longa é saltada e avisada.
  useEffect(() => {
    if (!tocando) { if (relogio.current) clearTimeout(relogio.current); return }
    if (indice >= passos.length - 1) { setTocando(false); return }
    const real = Math.max(80, passos[indice + 1].evento.emitidoEm - passos[indice].evento.emitidoEm)
    const salta = real > INATIVIDADE_MS
    const dt = (salta ? 1200 : real) / velocidade
    relogio.current = setTimeout(() => { setSaltou(salta ? Math.round(real / 1000) : null); setIndice((i) => Math.min(passos.length - 1, i + 1)) }, dt)
    return () => { if (relogio.current) clearTimeout(relogio.current) }
  }, [tocando, indice, passos, velocidade])

  const irPara = useCallback((i: number) => { setSaltou(null); setIndice(Math.max(0, Math.min(passos.length - 1, i))) }, [passos.length])
  const proximaOperacao = useCallback((sentido: 1 | -1) => {
    const opera = (p: PassoReplay) => p.evento.tipo === 'compra' || p.evento.tipo === 'liquidacao'
    for (let i = indice + sentido; i >= 0 && i < passos.length; i += sentido) if (opera(passos[i])) { irPara(i); return }
  }, [indice, passos, irPara])
  const irParaHora = useCallback((valor: string) => {
    if (!passos.length || !valor) return
    const [h, m, s] = valor.split(':').map((x) => Number(x) || 0)
    const base = new Date(passos[0].evento.emitidoEm); base.setHours(h, m, s, 0)
    const alvo = base.getTime()
    let melhor = 0
    for (let i = 0; i < passos.length; i++) if (passos[i].evento.emitidoEm <= alvo) melhor = i
    irPara(melhor)
  }, [passos, irPara])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      if (e.key === ' ') { e.preventDefault(); setTocando((t) => !t) }
      if (e.key === 'ArrowRight') irPara(indice + 1)
      if (e.key === 'ArrowLeft') irPara(indice - 1)
      if (e.key === 'Home') irPara(0)
      if (e.key === 'End') irPara(passos.length - 1)
    }
    document.addEventListener('keydown', tecla); return () => document.removeEventListener('keydown', tecla)
  }, [passos.length, indice, irPara])

  const passo = passos[indice]
  const integridade = integridadeDoHistorico(eventos, passos, carregando, encerrada.situacao === 'rodando')
  const marcadores = useMemo(() => passos.map((p, i) => ({ i, tipo: marcadorDoEvento(p.evento) })).filter((m) => m.tipo), [passos])
  const horaAtual = passo ? new Date(passo.evento.emitidoEm) : null
  const valorHora = horaAtual ? `${String(horaAtual.getHours()).padStart(2, '0')}:${String(horaAtual.getMinutes()).padStart(2, '0')}:${String(horaAtual.getSeconds()).padStart(2, '0')}` : ''

  return (
    <div className="mon-replay">
      {autorizado === false && <div className="mon-estado erro" role="alert"><b>Replay não aberto</b>Não foi possível registrar a auditoria deste acesso. Sem registro, a sessão não é exibida.<button onClick={aoFechar}>Voltar</button></div>}
      {autorizado && carregando && <div className="mon-estado" role="status"><b>Carregando histórico…</b>{carregados ? `${carregados} eventos lidos` : 'lendo a sessão'}<button onClick={aoFechar}>Cancelar</button></div>}
      {autorizado && !carregando && !passos.length && <div className="mon-estado" role="status"><b>Histórico indisponível</b>Esta sessão não tem eventos guardados: é anterior ao espelho, ou os eventos já passaram da retenção.<button onClick={aoFechar}>Voltar</button></div>}
      {cabecalho && passo && (
        <CabineEspelho s={cabecalho} estado={passo.estado} cliente={clientes.get(encerrada.userId)} modo="replay" saude="encerrada" idade={null} rtt={null} desvio={null}
          eventos={passos.slice(0, indice + 1).map((p) => p.evento)} aoFechar={aoFechar} integridade={integridade}
          passo={{ indice, total: passos.length, horaOriginal: passo.evento.emitidoEm, lacuna: passo.lacuna }} />
      )}
      {passos.length > 0 && (
        <div className="mon-replay-controles" role="group" aria-label="Controles do replay">
          <button onClick={() => irPara(0)} aria-label="Reiniciar" title="Reiniciar (Home)">⏮</button>
          <button onClick={() => proximaOperacao(-1)} aria-label="Operação anterior" title="Operação anterior">⏪</button>
          <button onClick={() => irPara(indice - 1)} aria-label="Evento anterior" title="Evento anterior (←)">◀</button>
          <button className="mon-play" onClick={() => setTocando((t) => !t)} aria-label={tocando ? 'Pausar' : 'Reproduzir'} aria-pressed={tocando} title="Espaço">{tocando ? '❚❚' : '▶'}</button>
          <button onClick={() => irPara(indice + 1)} aria-label="Próximo evento" title="Próximo evento (→)">▶|</button>
          <button onClick={() => proximaOperacao(1)} aria-label="Próxima operação" title="Próxima operação">⏩</button>
          <div className="mon-replay-barra">
            <input type="range" min={0} max={passos.length - 1} value={indice} onChange={(e) => irPara(Number(e.target.value))} aria-label="Linha do tempo" aria-valuetext={`evento ${indice + 1} de ${passos.length}, ${hora(passo.evento.emitidoEm)}`} />
            <div className="mon-marcadores" aria-hidden>{marcadores.map((m) => <i key={m.i} className={m.tipo!} style={{ left: `${passos.length > 1 ? (m.i / (passos.length - 1)) * 100 : 0}%` }} />)}</div>
          </div>
          <label className="mon-ir">Ir para<input type="time" step={1} value={valorHora} onChange={(e) => irParaHora(e.target.value)} aria-label="Ir para o instante" /></label>
          <div className="mon-vel" role="group" aria-label="Velocidade">{VELOCIDADES.map((v) => <button key={v} className={v === velocidade ? 'on' : ''} onClick={() => setVelocidade(v)} aria-pressed={v === velocidade}>{v}×</button>)}</div>
        </div>
      )}
      {passos.length > 0 && (
        <div className="mon-replay-info" role="status">
          <span className={`mon-selo ${integridade === 'completo' ? 'ao-vivo' : integridade === 'lacunas' ? 'atencao' : ''}`}>{ROTULO_INTEGRIDADE[integridade]}</span>
          <span>{passo ? `${hora(passo.evento.emitidoEm)} · ${ROTULO_EVENTO[passo.evento.tipo]}` : '—'}</span>
          {passo?.lacuna ? <span className="lacuna">lacuna: {passo.lacuna} evento{passo.lacuna === 1 ? '' : 's'} não recebido{passo.lacuna === 1 ? '' : 's'} antes deste</span> : null}
          {saltou ? <span className="salto">inatividade de {saltou} s saltada</span> : null}
          <span>Espaço reproduz · ← → evento · Home/End</span>
        </div>
      )}
    </div>
  )
}

/* ============================================================ painel */

export function MonitoramentoPanel({ sessao }: { sessao: SessaoTeeds }) {
  const [aba, setAba] = useState<Aba>('ao-vivo')
  const [sessoes, setSessoes] = useState<Map<string, SessaoEspelho>>(new Map())
  const [clientes, setClientes] = useState<Map<string, ClienteRegistro>>(new Map())
  const [eventos, setEventos] = useState<Map<string, EventoEspelho[]>>(new Map())
  const [canal, setCanal] = useState<EstadoDoCanal>('conectando')
  const [tela, setTela] = useState<EstadoDaTela>('carregando')
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [foco, setFoco] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroConta, setFiltroConta] = useState<'todas' | 'demo' | 'real'>('todas')
  const [filtroOnline, setFiltroOnline] = useState<'todas' | 'online' | 'offline'>('online')
  const [filtroRobo, setFiltroRobo] = useState('todos')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'positivo' | 'negativo'>('todos')
  const [periodo, setPeriodo] = useState<Periodo>('12')
  const [ordem, setOrdem] = useState<Ordem>('atividade')
  const [visao, setVisao] = useState<Visao>('confortavel')
  const [limite, setLimite] = useState(60)
  const [encerradas, setEncerradas] = useState<SessaoEncerrada[]>([])
  const [replayDe, setReplayDe] = useState<SessaoEncerrada | null>(null)
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([])
  const rtt = useRef(new MedidorDeRtt())
  const desvio = useRef(new EstimadorDeDesvio())
  const [rttMs, setRttMs] = useState<number | null>(null)
  const [desvioS, setDesvioS] = useState<number | null>(null)
  const clientesPedidos = useRef(new Set<string>())
  const fotosPedidas = useRef(new Set<string>())
  const focoAnterior = useRef<HTMLElement | null>(null)

  const falhar = useCallback((e: unknown) => {
    if ((e as Error)?.name === 'AbortError') return
    const m = mensagemDoErro(e)
    setErro(m.texto)
    if (m.estado === 'sem-permissao') { setTela('sem-permissao'); void auditarNegado(sessao) }
    else if (m.estado === 'indisponivel') setTela((t) => (t === 'carregando' ? 'indisponivel' : t))
  }, [sessao])

  /* ------------------------------------------------ fichas dos clientes */
  const garantirClientes = useCallback(async (ids: string[]) => {
    const novos = ids.filter((id) => id && !clientesPedidos.current.has(id))
    if (!novos.length) return
    novos.forEach((id) => clientesPedidos.current.add(id))
    try {
      const fichas = await clientesPorId(sessao, novos)
      setClientes((m) => { const n = new Map(m); fichas.forEach((f) => n.set(f.userId, f)); return n })
    } catch { novos.forEach((id) => clientesPedidos.current.delete(id)) }
  }, [sessao])

  /* ------------------------------------------------ a única porta de entrada */
  const receber = useCallback((m: MensagemEspelho) => {
    setSessoes((mapa) => {
      const r = aplicarMensagem(mapa, m)
      for (const id of r.pedirFoto) {
        if (fotosPedidas.current.has(id)) continue
        fotosPedidas.current.add(id)
        lerEspelho(sessao, id).then((nova) => {
          fotosPedidas.current.delete(id)
          if (nova) { receber({ origem: 'foto', sessao: nova }); void garantirClientes([nova.userId]) }
        }).catch(() => fotosPedidas.current.delete(id))
      }
      return r.sessoes
    })
  }, [sessao, garantirClientes])

  /* -------------------------------------------- snapshot completo */
  const carregarTudo = useCallback(async (horas = Number(periodo)) => {
    try {
      const lista = await listarEspelhos(sessao, horas)
      for (const s of lista) receber({ origem: 'lista', sessao: s })
      void garantirClientes(lista.map((s) => s.userId))
      setErro(null); setTela('pronto')
    } catch (e) { falhar(e) }
  }, [sessao, periodo, receber, garantirClientes, falhar])

  useEffect(() => { setTela('carregando'); void carregarTudo() }, [carregarTudo])
  // Reconciliação leve, a cada 20 s — o Realtime é o transporte; isto só confere.
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible') void carregarTudo() }, 20_000); return () => clearInterval(id) }, [carregarTudo])
  useEffect(() => { const id = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { auditar(sessao, { tipo: 'painel', acao: 'abriu' }).catch(falhar); return () => { auditar(sessao, { tipo: 'painel', acao: 'fechou' }).catch(() => { /* a tela já fechou */ }) } }, [sessao, falhar])

  /* -------------------------------------------------- tempo real */
  useEffect(() => {
    const canalId = `monitor-${MARCA.id}-${Math.random().toString(36).slice(2, 8)}`
    const assinatura = assinarMudancas({
      token: sessao.token, canal: canalId,
      tabelas: [
        { tabela: 'sessoes_robos_ao_vivo', filtro: `marca=eq.${MARCA.id}` },
        { tabela: 'pulsos_robos_ao_vivo', filtro: `marca=eq.${MARCA.id}` },
        { tabela: 'eventos_robos_ao_vivo', filtro: `marca=eq.${MARCA.id}`, evento: 'INSERT' },
      ],
      // Ao (re)entrar no canal, a foto completa vem ANTES de a tela dizer "ao vivo".
      aoEstado: (e) => { if (e === 'ao-vivo') { void carregarTudo().then(() => setCanal('ao-vivo')) } else setCanal(e) },
      aoRtt: (ms) => setRttMs(rtt.current.registrar(ms)),
      aoMudar: (m) => {
        const recebidoEm = Date.now()
        const emitidoEm = Number(m.linha.emitido_em ?? 0)
        if (emitidoEm) { desvio.current.registrar(emitidoEm, recebidoEm); setDesvioS(desvio.current.desvioSegundos) }
        if (m.tabela === 'pulsos_robos_ao_vivo') {
          receber({ origem: 'pulso', sessaoId: m.linha.sessao_id, seq: Number(m.linha.seq ?? 0), pulso: m.linha.pulso ?? {}, emitidoEm, recebidoEm })
        } else if (m.tabela === 'sessoes_robos_ao_vivo') {
          if (m.tipo === 'DELETE') { setSessoes((mapa) => { const n = new Map(mapa); n.delete(m.antiga?.sessao_id); return n }); return }
          // A linha do Realtime não traz a mãe (sessoes_robos): a foto completa é pedida pelo REST, que traz.
          setSessoes((mapa) => {
            const s = mapa.get(m.linha.sessao_id)
            if (!s) { receber({ origem: 'evento', evento: { sessaoId: m.linha.sessao_id, marca: m.linha.marca, seq: Number(m.linha.seq ?? 0), tipo: 'foto', delta: m.linha.estado ?? {}, emitidoEm }, recebidoEm }); return mapa }
            const foto = paraSessaoEspelho(m.linha, { sessao_ref: s.sessaoRef, conta_id: s.contaId, demo: s.demo, moeda: s.moeda, robo_id: s.roboId, robo_nome: s.roboNome, ativo: s.ativo, situacao: (m.linha.estado?.rodando === false) ? (s.situacao === 'rodando' ? 'encerrada' : s.situacao) : s.situacao, criada_em: s.criadaEm }, recebidoEm)
            queueMicrotask(() => receber({ origem: 'foto', sessao: foto }))
            return mapa
          })
        } else if (m.tabela === 'eventos_robos_ao_vivo' && m.tipo === 'INSERT') {
          const ev = paraEvento(m.linha)
          setEventos((mapa) => { const n = new Map(mapa); n.set(ev.sessaoId, ordenarEventos([...(n.get(ev.sessaoId) ?? []), ev])); return n })
          receber({ origem: 'evento', evento: ev, recebidoEm })
        }
      },
    })
    return () => assinatura.fechar()
  }, [sessao.token, receber]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------- foco */
  const [focoAutorizado, setFocoAutorizado] = useState<'pendente' | 'sim' | 'nao'>('sim')
  const abrirFoco = useCallback(async (id: string) => {
    focoAnterior.current = document.activeElement as HTMLElement
    const s = sessoes.get(id)
    setFocoAutorizado('pendente'); setFoco(id)
    try { await auditar(sessao, { tipo: 'ao-vivo', acao: 'abriu', sessaoId: id, clienteId: s?.userId }) }
    catch (e) { setFocoAutorizado('nao'); falhar(e); return }
    setFocoAutorizado('sim')
    try { const evs = await eventosDaSessao(sessao, id, 0, 500); setEventos((m) => { const n = new Map(m); n.set(id, ordenarEventos([...(n.get(id) ?? []), ...evs])); return n }) }
    catch (e) { falhar(e) }
  }, [sessao, sessoes, falhar])
  const fecharFoco = useCallback(() => {
    if (foco && focoAutorizado === 'sim') { const s = sessoes.get(foco); auditar(sessao, { tipo: 'ao-vivo', acao: 'fechou', sessaoId: foco, clienteId: s?.userId }).catch((e) => console.error('[monitoramento] auditoria de fechamento falhou:', (e as Error).message)) }
    setFoco(null)
    setTimeout(() => focoAnterior.current?.focus?.(), 0)
  }, [foco, focoAutorizado, sessao, sessoes])
  useEffect(() => { const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && foco) fecharFoco() }; document.addEventListener('keydown', tecla); return () => document.removeEventListener('keydown', tecla) }, [foco, fecharFoco])

  /* ------------------------------------------------ replay e auditoria */
  useEffect(() => {
    const aborto = new AbortController()
    if (aba === 'replay') listarEncerradas(sessao, undefined, undefined, aborto.signal).then((l) => { setEncerradas(l); void garantirClientes(l.map((x) => x.userId)) }).catch(falhar)
    if (aba === 'auditoria') listarAuditoria(sessao, undefined, aborto.signal).then((l) => { setAuditoria(l); void garantirClientes(l.flatMap((x) => [x.clienteId, x.adminId].filter(Boolean) as string[])) }).catch(falhar)
    return () => aborto.abort()
  }, [aba, sessao, garantirClientes, falhar])
  const buscaRegistrada = useRef('')
  useEffect(() => {
    const termo = busca.trim()
    if (termo.length < 3 || termo === buscaRegistrada.current) return
    const t = setTimeout(() => { buscaRegistrada.current = termo; auditar(sessao, { tipo: 'busca', acao: 'buscou' }).catch(() => { /* a busca é local; a auditoria dela é informativa */ }) }, 1500)
    return () => clearTimeout(t)
  }, [busca, sessao])

  /* ------------------------------------------------- filtros e ordem */
  const saudes = useMemo(() => { const m = new Map<string, Saude>(); for (const s of sessoes.values()) m.set(s.sessaoId, saudeDoSinal(s, agora)); return m }, [sessoes, agora])
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const arr = [...sessoes.values()].filter((s) => {
      const c = clientes.get(s.userId)
      const online = s.situacao === 'rodando' && s.estado.rodando !== false
      if (filtroOnline === 'online' && !online) return false
      if (filtroOnline === 'offline' && online) return false
      if (filtroConta === 'demo' && !s.demo) return false
      if (filtroConta === 'real' && s.demo) return false
      if (filtroRobo !== 'todos' && s.roboId !== filtroRobo) return false
      if (filtroResultado === 'positivo' && s.estado.resultado < 0) return false
      if (filtroResultado === 'negativo' && s.estado.resultado >= 0) return false
      if (termo && !`${c?.nome ?? ''} ${c?.email ?? ''} ${mascararConta(s.contaId)} ${s.contaId.slice(-4)} ${s.roboNome}`.toLowerCase().includes(termo)) return false
      return true
    })
    const peso = (s: SessaoEspelho) => ({ verde: 3, marca: 2, amarelo: 1, vermelho: 0, cinza: 4 })[semaforo(s, agora)]
    arr.sort((a, b) => {
      if (ordem === 'risco') return peso(a) - peso(b)
      if (ordem === 'resultado') return a.estado.resultado - b.estado.resultado
      if (ordem === 'operacoes') return b.estado.operacoes - a.estado.operacoes
      if (ordem === 'inicio') return (b.criadaEm || '').localeCompare(a.criadaEm || '')
      if (ordem === 'nome') return (clientes.get(a.userId)?.nome ?? '').localeCompare(clientes.get(b.userId)?.nome ?? '')
      return b.emitidoEm - a.emitidoEm
    })
    return arr
  }, [sessoes, clientes, busca, filtroConta, filtroOnline, filtroRobo, filtroResultado, ordem, agora])

  const online = [...sessoes.values()].filter((s) => s.situacao === 'rodando' && s.estado.rodando !== false)
  const clientesOnline = new Set(online.map((s) => s.userId)).size
  const resultadoTotal = lista.reduce((t, s) => t + (s.estado.resultado ?? 0), 0)
  const alertas = online.filter((s) => semaforo(s, agora) === 'vermelho')
  const desatualizadas = online.filter((s) => saudes.get(s.sessaoId) === 'desatualizado').length
  const robos = [...new Set([...sessoes.values()].map((s) => `${s.roboId}|${s.roboNome}`))].map((x) => x.split('|'))
  const emFoco = foco ? sessoes.get(foco) ?? null : null
  const canalRuim = canal === 'reconectando' || canal === 'token-expirado' || canal === 'fechado'

  return (
    <div className="ger monitoramento">
      <header className="mon-topo">
        <div>
          <span className="rot">{MARCA.prosa} · Administração</span>
          <h2>Monitoramento ao vivo</h2>
          <p>A cabine de cada cliente, reconstruída da telemetria do servidor. Somente visualização — nenhuma ação sobre o robô é possível daqui.</p>
        </div>
        <div className="mon-topo-direita">
          <span className={`mon-canal ${canal}`} role="status"><i aria-hidden />{ROTULO_CANAL[canal]}{rttMs != null && canal === 'ao-vivo' ? ` · ida e volta ~${rttMs} ms` : ''}</span>
          <nav className="mon-abas" role="tablist">
            {(['ao-vivo', 'replay', 'auditoria'] as Aba[]).map((a) => <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? 'on' : ''} onClick={() => { setAba(a); setFoco(null); setReplayDe(null) }}>{a === 'ao-vivo' ? 'Ao vivo' : a === 'replay' ? 'Sessões encerradas' : 'Auditoria'}</button>)}
          </nav>
        </div>
      </header>

      {erro && tela !== 'sem-permissao' && <div className={`mon-aviso ${tela === 'erro' ? 'erro' : ''}`} role="alert"><span>{erro}</span><button className="mon-fechar" onClick={() => setErro(null)} aria-label="Fechar aviso"><IconeFechar /></button></div>}
      {canalRuim && tela === 'pronto' && <div className="mon-aviso" role="status">{canal === 'token-expirado' ? 'A sessão do administrador expirou: o canal ao vivo foi fechado. Entre de novo para continuar.' : 'Reconectando ao canal ao vivo… Os dados na tela podem estar desatualizados; a idade de cada atualização aparece nos cartões.'}</div>}

      {tela === 'sem-permissao' && <div className="mon-estado erro" role="alert"><b>Sem permissão</b>Esta conta não é administradora da {MARCA.prosa}. A tentativa foi registrada.</div>}
      {tela === 'indisponivel' && <div className="mon-estado erro" role="alert"><b>Supabase indisponível</b>Não foi possível ler o espelho agora. O servidor dos robôs continua gravando; nada se perde.<button onClick={() => void carregarTudo()}>Tentar de novo</button></div>}
      {tela === 'carregando' && <div className="mon-estado" role="status"><b>Carregando…</b>lendo as sessões desta marca</div>}

      {tela === 'pronto' && aba === 'ao-vivo' && !emFoco && (
        <>
          <div className="adm-kpis mon-kpis">
            <article className="ok"><span>Clientes online</span><strong>{clientesOnline}</strong><small>{online.length} rob{online.length === 1 ? 'ô' : 'ôs'} operando</small></article>
            <article><span>Na visualização</span><strong>{lista.length}</strong><small>de {sessoes.size} {sessoes.size === 1 ? 'sessão' : 'sessões'} no período</small></article>
            <article className={resultadoTotal >= 0 ? 'ok' : 'perigo'}><span>Resultado agregado</span><strong>{assinado(resultadoTotal)}</strong><small>das sessões na visualização</small></article>
            <article className={alertas.length ? 'perigo' : ''}><span>Alertas</span><strong>{alertas.length}</strong><small>perto do stop, recusa ou sem sinal{desatualizadas ? ` · ${desatualizadas} sem atualização` : ''}</small></article>
          </div>
          {alertas.length > 0 && (
            <div className="mon-alertas" aria-live="polite">
              {alertas.slice(0, 5).map((s) => <button key={s.sessaoId} onClick={() => void abrirFoco(s.sessaoId)}><i aria-hidden />{clientes.get(s.userId)?.nome || mascararEmail(clientes.get(s.userId)?.email)} · {s.roboNome} · {s.estado.falha ? 'recusa da Deriv' : saudes.get(s.sessaoId) === 'desatualizado' ? 'sem atualização' : s.estado.conexao !== 'open' ? 'Deriv desconectada' : 'perto do stop'}</button>)}
            </div>
          )}
          <div className="mon-filtros">
            <label className="mon-busca">⌕<input placeholder="Buscar nome, e-mail, conta ou robô" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" /></label>
            <select value={filtroOnline} onChange={(e) => setFiltroOnline(e.target.value as any)} aria-label="Online ou offline"><option value="online">Operando agora</option><option value="offline">Encerradas recentes</option><option value="todas">Todas</option></select>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período"><option value="1">Última hora</option><option value="6">Últimas 6 h</option><option value="12">Últimas 12 h</option><option value="24">Últimas 24 h</option><option value="72">Últimos 3 dias</option></select>
            <select value={filtroConta} onChange={(e) => setFiltroConta(e.target.value as any)} aria-label="Tipo de conta"><option value="todas">Demo e real</option><option value="real">Só real</option><option value="demo">Só demo</option></select>
            <select value={filtroRobo} onChange={(e) => setFiltroRobo(e.target.value)} aria-label="Robô"><option value="todos">Todos os robôs</option>{robos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>
            <select value={filtroResultado} onChange={(e) => setFiltroResultado(e.target.value as any)} aria-label="Resultado"><option value="todos">Qualquer resultado</option><option value="positivo">Positivo</option><option value="negativo">Negativo</option></select>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar"><option value="atividade">Atualização mais recente</option><option value="risco">Maior risco</option><option value="resultado">Pior resultado</option><option value="operacoes">Mais operações</option><option value="inicio">Início mais recente</option><option value="nome">Nome</option></select>
            <div className="mon-visao" role="group" aria-label="Disposição">{(['compacto', 'confortavel', 'lista'] as Visao[]).map((v) => <button key={v} className={visao === v ? 'on' : ''} aria-pressed={visao === v} aria-label={v} onClick={() => setVisao(v)}>{v === 'compacto' ? '▦' : v === 'confortavel' ? '▣' : '☰'}</button>)}</div>
          </div>
          <div className={`mon-mosaico ${visao}`}>
            {lista.slice(0, limite).map((s) => <Cartao key={s.sessaoId} s={s} cliente={clientes.get(s.userId)} saude={saudes.get(s.sessaoId) ?? 'desatualizado'} visao={visao} aoAbrir={abrirFoco} />)}
            {!lista.length && <div className="mon-estado">{sessoes.size ? <><b>Nenhuma sessão passa pelos filtros.</b>Ajuste o período ou os filtros acima.</> : <><b>Nenhum robô operando nesta marca agora.</b>Quando um cliente ligar um robô, a cabine aparece aqui sozinha.</>}</div>}
          </div>
          {lista.length > limite && <button className="mon-mais" onClick={() => setLimite((l) => l + 60)}>Mostrar mais {Math.min(60, lista.length - limite)} de {lista.length - limite} restantes</button>}
        </>
      )}

      {tela === 'pronto' && aba === 'ao-vivo' && emFoco && focoAutorizado === 'pendente' && <div className="mon-estado" role="status"><b>Registrando o acesso…</b></div>}
      {tela === 'pronto' && aba === 'ao-vivo' && emFoco && focoAutorizado === 'nao' && <div className="mon-estado erro" role="alert"><b>Cabine não aberta</b>Não foi possível registrar a auditoria deste acesso. Sem registro, a cabine não é exibida.<button onClick={() => setFoco(null)}>Voltar ao mosaico</button></div>}
      {tela === 'pronto' && aba === 'ao-vivo' && emFoco && focoAutorizado === 'sim' && (
        <CabineEspelho s={emFoco} estado={emFoco.estado} cliente={clientes.get(emFoco.userId)} modo="ao-vivo"
          saude={saudeDoSinal(emFoco, agora)} idade={idadeDaAtualizacao(emFoco, agora)} rtt={rttMs} desvio={desvioS} eventos={eventos.get(emFoco.sessaoId) ?? []} aoFechar={fecharFoco} />
      )}

      {tela === 'pronto' && aba === 'replay' && !replayDe && (
        <section className="admin-card full mon-encerradas">
          <header><div><span className="rot">Últimos 30 dias</span><h3>Sessões encerradas</h3></div><small>{encerradas.length} {encerradas.length === 1 ? 'sessão' : 'sessões'}</small></header>
          <div className="ins-tabela mon-tabela">
            <div className="cab"><span>Cliente</span><span>Robô</span><span>Conta</span><span>Operações</span><span>Resultado</span><span>Encerrada</span><span /></div>
            {encerradas.map((s) => { const c = clientes.get(s.userId); return (
              <button key={s.id} className="ins-linha mon-linha" onClick={() => setReplayDe(s)}>
                <span className="adm-pessoa"><i>{(c?.nome || c?.email || '?')[0].toUpperCase()}</i><b>{c?.nome || 'Sem nome'}<small>{mascararEmail(c?.email)}</small></b></span>
                <span>{s.roboNome}</span><span>{mascararConta(s.contaId)} · {s.demo ? 'demo' : 'real'}</span>
                <span>{s.operacoes} <small className="up">{s.ganhas}</small> <small className="down">{s.perdidas}</small></span>
                <span className={s.resultado >= 0 ? 'up' : 'down'}>{assinado(s.resultado)} {s.moeda}</span>
                <span>{s.encerradaEm ? dataHora(s.encerradaEm) : '—'}<small>{s.motivoDaParada ?? s.situacao}</small></span>
                <span className="adm-seta">▶</span>
              </button>
            ) })}
            {!encerradas.length && <div className="mon-estado"><b>Nenhuma sessão encerrada nos últimos 30 dias.</b></div>}
          </div>
        </section>
      )}
      {tela === 'pronto' && aba === 'replay' && replayDe && <Replay key={replayDe.id} sessao={sessao} encerrada={replayDe} clientes={clientes} aoFechar={() => setReplayDe(null)} aoErro={falhar} />}

      {tela === 'pronto' && aba === 'auditoria' && (
        <section className="admin-card full">
          <header><div><span className="rot">Quem abriu o quê</span><h3>Auditoria do monitoramento</h3></div><small>{auditoria.length} registro{auditoria.length === 1 ? '' : 's'}</small></header>
          <div className="ins-tabela mon-auditoria">
            <div className="cab"><span>Quando</span><span>Administrador</span><span>Ação</span><span>Cliente</span><span>Sessão</span></div>
            {auditoria.map((r) => (
              <div key={r.id} className="ins-linha"><span>{dataHora(r.criadoEm)}</span><span>{clientes.get(r.adminId)?.nome || (r.adminId === sessao.usuario.id ? 'você' : r.adminId.slice(0, 8) + '…')}</span><span>{r.acao} · {r.tipo}</span><span>{clientes.get(r.clienteId ?? '')?.nome || mascararEmail(clientes.get(r.clienteId ?? '')?.email)}</span><span>{r.sessaoId ? r.sessaoId.slice(0, 8) + '…' : '—'}</span></div>
            ))}
            {!auditoria.length && <div className="mon-estado"><b>Nenhum acesso registrado ainda.</b></div>}
          </div>
        </section>
      )}
    </div>
  )
}
