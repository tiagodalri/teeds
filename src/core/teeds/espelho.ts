/**
 * O espelho operacional — a cabine do cliente, reconstruída de longe.
 *
 * O servidor que opera os robôs já sabe tudo que a cabine mostra: é ele
 * quem compra, liquida, conta e desenha o estado. Este módulo define o que
 * desse estado viaja até o painel de monitoramento, e como viaja:
 *
 *  - a FOTO compacta por sessão (a cabine inteira, para entrar ou reconectar
 *    sem depender de eventos antigos);
 *  - o PULSO, pequeno e periódico (fase, dígitos, contadores), no máximo um
 *    a cada `LIMITES.pulsoMs` por sessão — os ticks do intervalo vão nele;
 *  - os EVENTOS, só com o que mudou, numerados por sessão e permanentes —
 *    compra, liquidação, entrada seguinte, recuperação, troca de estratégia,
 *    falha, meta, stop, encerramento (o replay vive deles).
 *
 * Três camadas, de propósito separadas:
 *  1. `EstadoMotor` — o estado interno do motor. Fica no servidor.
 *  2. `EstadoEspelho` — o DTO sanitizado que viaja. Sem token, sem segredo,
 *     sem objeto bruto; só o que a cabine desenha.
 *  3. `paraEstadoMotor()` — o que a cabine compartilhada (`RobotLive`)
 *     consome, montado a partir do DTO.
 *
 * Nada aqui é captura de tela, e nada aqui toca no motor: quem chama é o
 * servidor, depois que a operação já aconteceu. Este arquivo é puro — sem
 * rede, sem banco, sem React — para o servidor, o painel e o teste
 * importarem o mesmo código.
 */

import type { ConfigEstrategia, EmCurso, EstadoMotor, OperacaoMotor, Registro, TelemetriaEstrategia } from '../deriv/engine'

/* ------------------------------------------------------------ o modelo */

export type FaseEspelho = 'aguardando' | 'enviando' | 'operando' | 'recuperando' | 'parado'

export interface OperacaoEspelho {
  n: number
  contractId: number
  valor: number
  entrada: number | null
  saida: number | null
  digitoEntrada: number | null
  digitoSaida: number | null
  lucro: number
  payout: number
  ganhou: boolean
  quando: number
  contractType: string
  barreira?: number
}

/** O DTO: a cabine, do jeito que cabe numa foto. */
export interface EstadoEspelho {
  rodando: boolean
  emOperacao: boolean
  fase: FaseEspelho
  operacoes: number
  vitorias: number
  derrotas: number
  perdasSeguidas: number
  resultado: number
  movimentado: number
  /** Markup acumulado da sessão, calculado localmente: 3% de cada payout. */
  markupCalculado: number
  valorAtual: number
  aguardando: string
  condicao: EstadoMotor['condicao']
  motivoParada: string | null
  emCurso: EmCurso | null
  /** Últimos dígitos do ativo — o que a fita mostra. */
  digitos: number[]
  /** Cauda da curva de resultado. */
  curva: number[]
  /** Últimas operações encerradas, da mais recente para a mais antiga. */
  historico: OperacaoEspelho[]
  /** Últimas linhas do registro técnico. */
  registros: Registro[]
  ticksAnalisados: number
  latenciaMedia: number | null
  falha: EstadoMotor['falha']
  /** Estado da conexão do servidor com a Deriv para esta sessão. */
  conexao: string
  /** O que a estratégia expõe de si (fase virtual, análise, troca). */
  estrategia: TelemetriaEstrategia | null
}

/** O pulso: o que muda entre eventos, pequeno o bastante para viajar sempre. */
export interface PulsoEspelho {
  fase: FaseEspelho
  digitos: number[]
  ticksAnalisados: number
  aguardando: string
  condicao: EstadoMotor['condicao']
  /** O dígito atual do contrato aberto, quando há um. */
  digitoAtual: number | null
  estrategia: TelemetriaEstrategia | null
}

export type OrigemDaMensagem = 'foto' | 'evento' | 'pulso' | 'lista'

/** A linha de `sessoes_robos_ao_vivo` (+ mãe em sessoes_robos), como o painel a lê. */
export interface SessaoEspelho {
  sessaoId: string
  sessaoRef: string
  marca: string
  userId: string
  contaId: string
  demo: boolean
  moeda: string
  roboId: string
  roboNome: string
  ativo: string
  config: ConfigEstrategia
  /** A última sequência ACEITA para esta sessão (foto, evento ou pulso). */
  seq: number
  /** De que tipo de mensagem veio a última sequência aceita. */
  origemDoSeq: OrigemDaMensagem
  estado: EstadoEspelho
  /** Situação da linha-mãe em sessoes_robos: rodando, encerrada, erro. */
  situacao: 'rodando' | 'encerrada' | 'erro'
  /** Epoch em ms, relógio do servidor, do último evento, pulso ou batimento. */
  emitidoEm: number
  /** Epoch em ms, relógio do painel, de quando a última mensagem chegou. */
  recebidoEm: number
  /** ISO, escrito pelo banco. */
  atualizadaEm: string
  criadaEm: string
}

export type TipoEvento =
  | 'abertura' | 'compra' | 'liquidacao' | 'fase' | 'entrada' | 'estrategia'
  | 'falha' | 'conexao' | 'parada' | 'foto'

/** Eventos que nunca podem ser descartados nem coalescidos. */
export const EVENTOS_PERMANENTES: ReadonlySet<TipoEvento> = new Set<TipoEvento>([
  'abertura', 'compra', 'liquidacao', 'entrada', 'fase', 'estrategia', 'falha', 'parada', 'foto',
])

/**
 * O delta de um evento: as chaves que mudaram, com as listas de forma
 * incremental — só as operações e as linhas de registro NOVAS, e sem a
 * curva (que se deriva dos resultados). Abertura e foto trazem tudo.
 */
export type DeltaEspelho = Partial<Omit<EstadoEspelho, 'historico' | 'registros' | 'curva'>> & {
  historico?: OperacaoEspelho[]
  registros?: Registro[]
  curva?: number[]
  /** Operações que apareceram desde o evento anterior (da mais nova para a mais antiga). */
  historicoNovas?: OperacaoEspelho[]
  /** Linhas do registro técnico que apareceram desde o evento anterior. */
  registrosNovos?: Registro[]
}

export interface EventoEspelho {
  id?: number
  sessaoId: string
  marca: string
  seq: number
  tipo: TipoEvento
  delta: DeltaEspelho
  /** A configuração com que o robô foi ligado — só na abertura. */
  config?: ConfigEstrategia | null
  emitidoEm: number
  criadoEm?: string
}

/* --------------------------------------------------------- limites */

export const LIMITES = {
  digitos: 30,
  curva: 120,
  historico: 30,
  registros: 20,
  /**
   * O pulso (batimento visual + presença): no máximo um a cada 2 s por
   * sessão. Os ticks do intervalo chegam nele, em lote (a fita inteira).
   * Ver MONITORAMENTO.md, "Frequência de gravação".
   */
  pulsoMs: 2000,
  /** Uma foto completa vira evento a cada tanto, para o replay saltar e para lacunas não custarem tudo. */
  fotoPeriodicaMs: 300_000,
  /**
   * Saúde do sinal, medida pelo relógio LOCAL do painel a partir de quando a
   * última mensagem chegou (não do carimbo do servidor). Com pulso a cada 2 s,
   * "ao vivo" tolera 2,5 s; "atenção" até 6 s; depois "desatualizado".
   */
  aoVivoMs: 2500,
  atencaoMs: 6000,
  /** Retenção, em dias. A migração usa os mesmos valores. */
  retencaoEventosDias: 30,
  retencaoFotosDias: 30,
  retencaoAuditoriaDias: 365,
} as const

/* ----------------------------------------------------- compactação */

export function faseDoEstado(e: Pick<EstadoMotor, 'rodando' | 'emCurso' | 'emOperacao' | 'perdasSeguidas'>): FaseEspelho {
  if (!e.rodando) return 'parado'
  if (e.emCurso) return 'operando'
  if (e.emOperacao) return 'enviando'
  if (e.perdasSeguidas >= 1) return 'recuperando'
  return 'aguardando'
}

const arred = (v: number, casas = 2) => Number((Number(v) || 0).toFixed(casas))

/** Mesma regra usada pela escrituração e pelos relatórios da plataforma. */
export const TAXA_MARKUP = 0.03
export const calcularMarkup = (pagamento: number) => arred(Math.max(0, pagamento) * TAXA_MARKUP, 4)

function compactarOperacao(o: OperacaoMotor): OperacaoEspelho {
  return {
    n: o.n, contractId: o.contractId, valor: arred(o.valor), entrada: o.entrada, saida: o.saida,
    digitoEntrada: o.digitoEntrada, digitoSaida: o.digitoSaida, lucro: arred(o.lucro), payout: arred(o.payout),
    ganhou: o.ganhou, quando: o.quando, contractType: o.contractType, barreira: o.barreira,
  }
}

/** A foto compacta: o que a cabine precisa, e só isso. Nunca o objeto bruto. */
export function resumirEstado(e: EstadoMotor, conexao = 'open'): EstadoEspelho {
  return {
    rodando: Boolean(e.rodando),
    emOperacao: Boolean(e.emOperacao),
    fase: faseDoEstado(e),
    operacoes: e.operacoes ?? 0,
    vitorias: e.vitorias ?? 0,
    derrotas: e.derrotas ?? 0,
    perdasSeguidas: e.perdasSeguidas ?? 0,
    resultado: arred(e.resultado ?? 0),
    movimentado: arred(e.movimentado ?? 0),
    markupCalculado: arred((e.historico ?? []).reduce((total, op) => total + calcularMarkup(op.payout), 0), 4),
    valorAtual: arred(e.valorAtual ?? 0),
    aguardando: e.aguardando ?? '',
    condicao: e.condicao ?? null,
    motivoParada: e.motivoParada ?? null,
    emCurso: e.emCurso ? { ...e.emCurso } : null,
    digitos: (e.digitos ?? []).slice(-LIMITES.digitos),
    curva: (e.curva ?? []).slice(-LIMITES.curva).map((v) => arred(v)),
    historico: (e.historico ?? []).slice(0, LIMITES.historico).map(compactarOperacao),
    registros: (e.registros ?? []).slice(0, LIMITES.registros),
    ticksAnalisados: e.ticksAnalisados ?? 0,
    latenciaMedia: e.latenciaMedia ?? null,
    falha: e.falha ?? null,
    conexao,
    estrategia: e.estrategia ?? null,
  }
}

/** O pulso, tirado da foto. */
export function pulsoDoEstado(e: EstadoEspelho): PulsoEspelho {
  return {
    fase: e.fase, digitos: e.digitos, ticksAnalisados: e.ticksAnalisados, aguardando: e.aguardando,
    condicao: e.condicao, digitoAtual: e.emCurso?.digitoAtual ?? null, estrategia: e.estrategia,
  }
}

/** Aplica um pulso sobre a foto que o painel já tem. Só os campos efêmeros. */
export function aplicarPulso(base: EstadoEspelho, p: PulsoEspelho): EstadoEspelho {
  return {
    ...base, fase: p.fase, digitos: p.digitos, ticksAnalisados: p.ticksAnalisados, aguardando: p.aguardando,
    condicao: p.condicao, estrategia: p.estrategia,
    emCurso: base.emCurso ? { ...base.emCurso, digitoAtual: p.digitoAtual } : base.emCurso,
  }
}

/** Uma assinatura barata do pulso, para não gravar conteúdo idêntico. */
export function assinaturaDoPulso(p: PulsoEspelho): string {
  return `${p.fase}|${p.ticksAnalisados}|${p.digitos.join('')}|${p.aguardando}|${p.digitoAtual ?? ''}|${p.estrategia?.fase ?? ''}`
}

/* ------------------------------------------------------ significância */

const marcaDaEstrategia = (e: EstadoEspelho) => e.estrategia ? `${e.estrategia.fase}|${e.estrategia.anterior ?? ''}|${e.estrategia.motivo ?? ''}|${e.estrategia.contrato ?? ''}|${e.estrategia.barreira ?? ''}` : ''

/**
 * O que mudou de verdade entre duas fotos.
 *
 * Um tick novo não é evento: muda a fita e o contador de ticks, e viaja no
 * pulso. Vira evento o que muda a operação — compra, liquidação, entrada
 * seguinte, recuperação/fase, troca de estratégia, falha, conexão, parada.
 */
export function tipoDoEvento(antes: EstadoEspelho | null, agora: EstadoEspelho): TipoEvento | null {
  if (!antes) return 'abertura'
  if (antes.rodando && !agora.rodando) return 'parada'
  if (!antes.emCurso && agora.emCurso) return 'compra'
  if (antes.emCurso && agora.emCurso && antes.emCurso.contractId !== agora.emCurso.contractId) return 'compra'
  if (agora.operacoes > antes.operacoes) return 'liquidacao'
  if ((agora.falha?.quando ?? 0) !== (antes.falha?.quando ?? 0)) return 'falha'
  if (marcaDaEstrategia(agora) !== marcaDaEstrategia(antes)) return 'estrategia'
  if (agora.conexao !== antes.conexao) return 'conexao'
  if (agora.fase !== antes.fase) return 'fase'
  if (agora.valorAtual !== antes.valorAtual) return 'entrada'
  return null
}

/** Chaves escalares comparadas por valor; as listas têm comparação própria. */
const CHAVES = Object.freeze([
  'rodando', 'emOperacao', 'fase', 'operacoes', 'vitorias', 'derrotas', 'perdasSeguidas', 'resultado', 'movimentado',
  'markupCalculado', 'valorAtual', 'aguardando', 'motivoParada', 'ticksAnalisados', 'latenciaMedia', 'conexao',
] as const)

const rotuloDaCondicao = (c: EstadoMotor['condicao']) => c ? `${c.rotulo}|${c.itens.map((i) => `${i.valor}:${i.ok ? 1 : 0}`).join(',')}` : ''
const igualEmCurso = (a: EmCurso | null, b: EmCurso | null) =>
  (a?.contractId ?? 0) === (b?.contractId ?? 0) && (a?.digitoAtual ?? -1) === (b?.digitoAtual ?? -1) && (a?.lucro ?? 0) === (b?.lucro ?? 0) && (a?.spot ?? 0) === (b?.spot ?? 0)
const igualFalha = (a: EstadoMotor['falha'], b: EstadoMotor['falha']) => (a?.quando ?? 0) === (b?.quando ?? 0) && (a?.texto ?? '') === (b?.texto ?? '')
const igualDigitos = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])
const chaveDoRegistro = (r: Registro) => `${r.hora}|${r.tipo}|${r.texto}`
const assinaturaDaEstrategia = (t: TelemetriaEstrategia | null) => t ? `${t.fase}|${t.anterior ?? ''}|${t.motivo ?? ''}|${t.contrato ?? ''}|${t.barreira ?? ''}|${t.virtual ? 1 : 0}|${Object.values(t.detalhes ?? {}).join(',')}` : ''

/**
 * Só o que mudou. Vazio = nada mudou.
 *
 * As listas viajam de forma incremental: `historicoNovas` (operações que
 * não existiam antes) e `registrosNovos`. A curva não viaja — ela é a soma
 * dos lucros, e quem aplica o delta a estende sozinho. É isto que mantém
 * uma liquidação em centenas de bytes, e não em quilobytes. Sem
 * JSON.stringify: comparações por campo, baratas o bastante para rodar a
 * cada estado do motor.
 */
export function delta(antes: EstadoEspelho | null, agora: EstadoEspelho): DeltaEspelho {
  if (!antes) return { ...agora }
  const d: DeltaEspelho = {}
  for (const k of CHAVES) if (antes[k] !== agora[k]) (d as any)[k] = agora[k]
  if (rotuloDaCondicao(antes.condicao) !== rotuloDaCondicao(agora.condicao)) d.condicao = agora.condicao
  if (!igualEmCurso(antes.emCurso, agora.emCurso)) d.emCurso = agora.emCurso
  if (!igualFalha(antes.falha, agora.falha)) d.falha = agora.falha
  if (!igualDigitos(antes.digitos, agora.digitos)) d.digitos = agora.digitos
  if (assinaturaDaEstrategia(antes.estrategia) !== assinaturaDaEstrategia(agora.estrategia)) d.estrategia = agora.estrategia
  const vistos = new Set(antes.historico.map((o) => o.contractId))
  const novas = agora.historico.filter((o) => !vistos.has(o.contractId))
  if (novas.length) d.historicoNovas = novas
  const linhas = new Set(antes.registros.map(chaveDoRegistro))
  const novos = agora.registros.filter((r) => !linhas.has(chaveDoRegistro(r)))
  if (novos.length) d.registrosNovos = novos
  return d
}

/** Aplica um delta sobre uma foto. Não muta a base. Estende as listas em vez de trocá-las. */
export function aplicarDelta(base: EstadoEspelho, d: DeltaEspelho): EstadoEspelho {
  const { historicoNovas, registrosNovos, ...resto } = d
  const estado: EstadoEspelho = { ...base, ...(resto as Partial<EstadoEspelho>) }
  if (historicoNovas?.length) {
    const ids = new Set(base.historico.map((o) => o.contractId))
    const ineditas = historicoNovas.filter((o) => !ids.has(o.contractId))
    estado.historico = [...ineditas, ...base.historico].slice(0, LIMITES.historico)
    // a curva é a soma dos lucros: um ponto por operação nova, da mais antiga para a mais nova
    let acumulado = base.curva.length ? base.curva[base.curva.length - 1] : 0
    const pontos = [...ineditas].reverse().map((o) => (acumulado = arred(acumulado + o.lucro)))
    estado.curva = [...base.curva, ...pontos].slice(-LIMITES.curva)
  }
  if (registrosNovos?.length) {
    const chaves = new Set(base.registros.map(chaveDoRegistro))
    estado.registros = [...registrosNovos.filter((r) => !chaves.has(chaveDoRegistro(r))), ...base.registros].slice(0, LIMITES.registros)
  }
  return estado
}

/* -------------------------------------------------------- ordenação */

/**
 * Coloca os eventos em ordem e joga fora o que veio repetido.
 *
 * A rede não promete ordem nem unicidade: um evento pode chegar duas vezes
 * (reconexão) ou o 12 antes do 11. A regra é simples — por sessão, um evento
 * por número de sequência, em ordem crescente. O que já foi aplicado (seq
 * menor ou igual ao último visto) é descartado, nunca reaplicado.
 */
export function ordenarEventos(eventos: EventoEspelho[], ultimoSeqAplicado = 0): EventoEspelho[] {
  const vistos = new Set<number>()
  return eventos
    .filter((e) => {
      if (e.seq <= ultimoSeqAplicado || vistos.has(e.seq)) return false
      vistos.add(e.seq); return true
    })
    .sort((a, b) => a.seq - b.seq)
}

export interface PassoReplay {
  evento: EventoEspelho
  estado: EstadoEspelho
  /** Quantos números de sequência faltaram antes deste evento. 0 = contínuo. */
  lacuna: number
}

/**
 * Reconstrói a foto em cada passo, para o replay.
 *
 * Começa na abertura (foto inteira) ou, se ela se perdeu, na primeira foto
 * periódica. Uma lacuna de sequência é contada e mostrada — nunca
 * preenchida com estado inventado; a próxima foto completa realinha.
 */
export function reconstruir(eventos: EventoEspelho[]): PassoReplay[] {
  const passos: PassoReplay[] = []
  let atual: EstadoEspelho | null = null
  let ultimoSeq = 0
  for (const ev of ordenarEventos(eventos)) {
    const lacuna = ultimoSeq ? Math.max(0, ev.seq - ultimoSeq - 1) : 0
    if (ev.tipo === 'abertura' || ev.tipo === 'foto') atual = ev.delta as EstadoEspelho
    else if (atual) atual = aplicarDelta(atual, ev.delta)
    else continue   // sem uma foto antes, não há como reconstruir com segurança
    ultimoSeq = ev.seq
    passos.push({ evento: ev, estado: atual, lacuna })
  }
  return passos
}

/** Integridade de um histórico carregado: o que o replay diz ao admin. */
export type Integridade = 'completo' | 'carregando' | 'lacunas' | 'indisponivel' | 'em-andamento'
export function integridadeDoHistorico(eventos: EventoEspelho[], passos: PassoReplay[], carregando: boolean, sessaoRodando: boolean): Integridade {
  if (carregando) return 'carregando'
  if (!passos.length) return 'indisponivel'
  if (sessaoRodando) return 'em-andamento'
  const semFotoInicial = eventos.length > passos.length || passos[0].evento.tipo !== 'abertura'
  if (semFotoInicial || passos.some((p) => p.lacuna > 0)) return 'lacunas'
  return 'completo'
}

/* ------------------------------------------ a regra central: é mais nova? */

export type Decisao =
  | { aceitar: false; motivo: 'antiga' | 'repetida' | 'desconhecida' | 'encerrada' }
  | { aceitar: true; motivo: 'nova' | 'mesma-seq-mais-completa' | 'mesma-seq-efemera' | 'lacuna' }

/**
 * A ÚNICA regra de "esta atualização é mais nova?", usada por foto, evento,
 * pulso e pela reconciliação periódica (lista).
 *
 *  - seq menor que a última aceita: antiga, fora.
 *  - mesma seq: foto e evento têm precedência sobre pulso. Um pulso da mesma
 *    seq só atualiza os campos efêmeros (fita, análise), nunca contadores —
 *    é o que garante que um evento não é substituído por um pulso. Uma foto
 *    (ou a lista da reconciliação) com a mesma seq é aceita quando o que
 *    temos veio de evento ou pulso (é mais completa); evento repetido é
 *    idempotente: ignorado.
 *  - seq maior: nova. Se pulou números e a mensagem é um evento (delta),
 *    é "lacuna": quem chama pede a foto em vez de aplicar delta sobre
 *    estado desconhecido.
 *  - sessão encerrada: pulso nenhum é aceito depois da parada (um batimento
 *    atrasado não reabre a cabine). Foto e evento mais novos continuam valendo.
 */
export function decidir(atual: Pick<SessaoEspelho, 'seq' | 'origemDoSeq' | 'situacao'> | null, chegada: { origem: OrigemDaMensagem; seq: number }): Decisao {
  if (!atual) return { aceitar: true, motivo: 'nova' }
  if (chegada.seq < atual.seq) return { aceitar: false, motivo: 'antiga' }
  const encerrada = atual.situacao !== 'rodando'
  if (chegada.origem === 'pulso' && encerrada) return { aceitar: false, motivo: 'encerrada' }
  if (chegada.seq === atual.seq) {
    if (chegada.origem === 'pulso') return { aceitar: true, motivo: 'mesma-seq-efemera' }
    if (chegada.origem === 'foto' || chegada.origem === 'lista') return atual.origemDoSeq === 'foto' || atual.origemDoSeq === 'lista' ? { aceitar: false, motivo: 'repetida' } : { aceitar: true, motivo: 'mesma-seq-mais-completa' }
    return { aceitar: false, motivo: 'repetida' }   // evento com a mesma seq já aplicada
  }
  if (chegada.seq > atual.seq + 1 && chegada.origem === 'evento') return { aceitar: true, motivo: 'lacuna' }
  return { aceitar: true, motivo: 'nova' }
}

/** Mensagens que o painel recebe, já no formato interno. */
export type MensagemEspelho =
  | { origem: 'foto' | 'lista'; sessao: SessaoEspelho }
  | { origem: 'pulso'; sessaoId: string; seq: number; pulso: PulsoEspelho; emitidoEm: number; recebidoEm: number }
  | { origem: 'evento'; evento: EventoEspelho; recebidoEm: number }

export interface ResultadoDaAplicacao {
  sessoes: Map<string, SessaoEspelho>
  /** Sessões cuja foto completa precisa ser pedida (lacuna ou sessão desconhecida). */
  pedirFoto: string[]
  decisao: Decisao
}

/**
 * Aplica uma mensagem ao mapa de sessões, respeitando `decidir()`. Puro:
 * devolve um mapa novo (o antigo não muda) e a lista de fotos a pedir.
 * A sequência é por sessão — uma sessão nunca interfere na outra.
 */
export function aplicarMensagem(sessoes: Map<string, SessaoEspelho>, m: MensagemEspelho): ResultadoDaAplicacao {
  const pedirFoto: string[] = []
  const id = m.origem === 'evento' ? m.evento.sessaoId : m.origem === 'pulso' ? m.sessaoId : m.sessao.sessaoId
  const atual = sessoes.get(id) ?? null
  const seq = m.origem === 'evento' ? m.evento.seq : m.origem === 'pulso' ? m.seq : m.sessao.seq

  if (!atual && m.origem !== 'foto' && m.origem !== 'lista') {
    pedirFoto.push(id)
    return { sessoes, pedirFoto, decisao: { aceitar: false, motivo: 'desconhecida' } }
  }
  const decisao = decidir(atual, { origem: m.origem, seq })
  if (!decisao.aceitar) return { sessoes, pedirFoto, decisao }
  const novo = new Map(sessoes)

  if (m.origem === 'foto' || m.origem === 'lista') {
    const s = m.sessao
    // Encerramento já visto prevalece sobre uma foto/lista da mesma seq que ainda diga "rodando".
    const situacao = atual && atual.situacao !== 'rodando' && s.situacao === 'rodando' && s.seq <= atual.seq ? atual.situacao : s.situacao
    novo.set(id, { ...s, situacao, origemDoSeq: m.origem, recebidoEm: atual && decisao.motivo === 'mesma-seq-mais-completa' ? Math.max(atual.recebidoEm, s.recebidoEm) : s.recebidoEm })
    return { sessoes: novo, pedirFoto, decisao }
  }
  if (m.origem === 'pulso') {
    const a = atual!
    novo.set(id, { ...a, estado: aplicarPulso(a.estado, m.pulso), seq: m.seq, origemDoSeq: a.seq === m.seq ? a.origemDoSeq : 'pulso', emitidoEm: m.emitidoEm || a.emitidoEm, recebidoEm: m.recebidoEm })
    return { sessoes: novo, pedirFoto, decisao }
  }
  if (m.origem !== 'evento') return { sessoes, pedirFoto, decisao }
  const a = atual!
  const ev = m.evento
  if (decisao.motivo === 'lacuna' && ev.tipo !== 'abertura' && ev.tipo !== 'foto') {
    pedirFoto.push(id)
    return { sessoes, pedirFoto, decisao }
  }
  const estado = (ev.tipo === 'abertura' || ev.tipo === 'foto') ? (ev.delta as EstadoEspelho) : aplicarDelta(a.estado, ev.delta)
  const encerrou = ev.tipo === 'parada' || !estado.rodando
  novo.set(id, { ...a, estado, seq: ev.seq, origemDoSeq: 'evento', situacao: encerrou && a.situacao === 'rodando' ? 'encerrada' : a.situacao, emitidoEm: ev.emitidoEm, recebidoEm: m.recebidoEm })
  return { sessoes: novo, pedirFoto, decisao }
}

/* ------------------------------------------------------ saúde do sinal */

export type Saude = 'ao-vivo' | 'atencao' | 'desatualizado' | 'encerrada'

/**
 * Quão fresca está a telemetria de uma sessão, pelo relógio local: a idade
 * é medida de quando a última mensagem CHEGOU, não do carimbo do servidor
 * (relógios diferentes não podem inventar atraso). Os limites são os de
 * `LIMITES` e são os mesmos que a tela mostra.
 */
export function saudeDoSinal(s: Pick<SessaoEspelho, 'recebidoEm' | 'situacao'>, agora = Date.now()): Saude {
  if (s.situacao !== 'rodando') return 'encerrada'
  const idade = agora - s.recebidoEm
  if (idade <= LIMITES.aoVivoMs) return 'ao-vivo'
  if (idade <= LIMITES.atencaoMs) return 'atencao'
  return 'desatualizado'
}

/** Idade da última atualização, em segundos com uma casa — "há 1,2 s". Nunca negativa. */
export function idadeDaAtualizacao(s: Pick<SessaoEspelho, 'recebidoEm'>, agora = Date.now()): number {
  return Math.max(0, Math.round((agora - s.recebidoEm) / 100) / 10)
}

/**
 * Tempo de ida e volta do canal, medido pelo batimento do próprio socket
 * (o painel manda um heartbeat com ref e mede a resposta). É RTT de verdade:
 * não depende do relógio do servidor. Guarda as últimas amostras e devolve a
 * mediana arredondada a 50 ms — a precisão que o método sustenta.
 */
export class MedidorDeRtt {
  private amostras: number[] = []
  registrar(rttMs: number): number | null {
    if (!Number.isFinite(rttMs) || rttMs < 0) return this.mediana
    this.amostras.push(rttMs); if (this.amostras.length > 20) this.amostras.shift()
    return this.mediana
  }
  get mediana(): number | null {
    if (!this.amostras.length) return null
    const s = [...this.amostras].sort((a, b) => a - b)
    return Math.round(s[Math.floor(s.length / 2)] / 50) * 50
  }
  limpar() { this.amostras = [] }
}

/**
 * Desvio aproximado entre o relógio do servidor e o do painel: a mediana de
 * (recebido − emitido). Serve para informação ("relógio do servidor ≈ −2 s"),
 * nunca para medir saúde nem latência: inclui a latência de rede e muda
 * bruscamente se algum relógio for acertado — por isso a janela é curta.
 */
export class EstimadorDeDesvio {
  private amostras: number[] = []
  registrar(emitidoEm: number, recebidoEm: number): void {
    if (!emitidoEm || !recebidoEm) return
    this.amostras.push(recebidoEm - emitidoEm); if (this.amostras.length > 15) this.amostras.shift()
  }
  /** Em segundos, com uma casa; null sem amostras suficientes. Positivo = carimbo do servidor atrás do relógio do painel. */
  get desvioSegundos(): number | null {
    if (this.amostras.length < 3) return null
    const s = [...this.amostras].sort((a, b) => a - b)
    return Math.round(s[Math.floor(s.length / 2)] / 100) / 10
  }
  limpar() { this.amostras = [] }
}

/** A cor do cartão: o que pede olho primeiro. */
export type Semaforo = 'verde' | 'marca' | 'amarelo' | 'vermelho' | 'cinza'
export function semaforo(s: SessaoEspelho, agora = Date.now()): Semaforo {
  const e = s.estado
  if (s.situacao !== 'rodando' || !e.rodando) return 'cinza'
  const saude = saudeDoSinal(s, agora)
  if (saude === 'desatualizado' || e.falha || e.conexao !== 'open') return 'vermelho'
  const margem = s.config.stopLoss > 0 ? (s.config.stopLoss + e.resultado) / s.config.stopLoss : 1
  if (margem <= 0.25) return 'vermelho'
  if (saude === 'atencao' || e.perdasSeguidas >= 2 || margem <= 0.5) return 'amarelo'
  if (e.fase === 'operando' || e.fase === 'enviando') return 'verde'
  return 'marca'
}

/* ----------------------------------------------------------- máscaras */

/** "arthur.lessa@gmail.com" → "ar•••••@gmail.com" */
export function mascararEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [u, d] = email.split('@')
  if (!d) return email.slice(0, 2) + '•••'
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(3, Math.min(6, u.length - 2)))}@${d}`
}

/** "CR1234567" → "CR•••4567" */
export function mascararConta(contaId: string | null | undefined): string {
  if (!contaId) return '—'
  if (contaId.length <= 4) return contaId
  const letras = contaId.match(/^[A-Za-z]+/)?.[0] ?? ''
  return `${letras}•••${contaId.slice(-4)}`
}

/* ----------------------------------------------------- descrição de evento */

const dinheiro = (v: number, m: string) => `${m} ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const horaCurta = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const ROTULO_FASE: Record<string, string> = { aguardando: 'Procurando entrada', enviando: 'Enviando ordem', operando: 'Contrato aberto', recuperando: 'Recuperando', parado: 'Parado' }
export const ROTULO_EVENTO: Record<TipoEvento, string> = { abertura: 'Sessão aberta', compra: 'Compra', liquidacao: 'Liquidação', fase: 'Mudança de fase', entrada: 'Próxima entrada', estrategia: 'Troca de estratégia', falha: 'Recusa da Deriv', conexao: 'Conexão', parada: 'Encerramento', foto: 'Foto completa' }

/**
 * Uma linha legível para a linha do tempo e para os marcadores do replay.
 * A liquidação lê `historicoNovas` — o campo que o delta realmente carrega.
 */
export function descreverEvento(ev: EventoEspelho, moeda: string): string {
  const d = ev.delta
  switch (ev.tipo) {
    case 'compra': return d.emCurso ? `contrato ${d.emCurso.contractId} · ${dinheiro(d.emCurso.valor, moeda)}${d.emCurso.digitoEntrada != null ? ` · entrada no dígito ${d.emCurso.digitoEntrada}` : ''}` : 'contrato aberto'
    case 'liquidacao': {
      const o = d.historicoNovas?.[0] ?? d.historico?.[0]
      if (!o) return `liquidada · ${d.operacoes ?? '?'} operações`
      const rotulo = o.lucro > 0 ? 'ganho' : o.lucro < 0 ? 'perda' : 'empate'
      const acumulado = d.resultado != null ? ` · acumulado ${comSinal(d.resultado)}` : ''
      return `${rotulo} ${comSinal(o.lucro)} ${moeda} · valor ${dinheiro(o.valor, moeda)} · dígitos ${o.digitoEntrada ?? '—'} → ${o.digitoSaida ?? '—'}${acumulado} · ${horaCurta(o.quando)}`
    }
    case 'entrada': return d.valorAtual != null ? `próxima entrada ${dinheiro(d.valorAtual, moeda)}` : ''
    case 'fase': return ROTULO_FASE[d.fase ?? ''] ?? d.fase ?? ''
    case 'estrategia': return d.estrategia ? `${d.estrategia.anterior ?? '—'} → ${d.estrategia.fase}${d.estrategia.motivo ? ` · ${d.estrategia.motivo}` : ''}` : ''
    case 'falha': return d.falha?.texto ?? ''
    case 'conexao': return `conexão com a Deriv: ${d.conexao ?? '—'}`
    case 'parada': return d.motivoParada ?? 'encerrada'
    case 'abertura': return 'configuração inicial gravada'
    case 'foto': return 'foto completa da cabine'
    default: return ''
  }
}

/** Marcador do replay: só os tipos que valem um ponto na barra. */
export type Marcador = 'compra' | 'ganho' | 'perda' | 'fase' | 'estrategia' | 'erro' | 'parada'
export function marcadorDoEvento(ev: EventoEspelho): Marcador | null {
  switch (ev.tipo) {
    case 'compra': return 'compra'
    case 'liquidacao': { const o = ev.delta.historicoNovas?.[0]; return o ? (o.lucro >= 0 ? 'ganho' : 'perda') : 'ganho' }
    case 'fase': return 'fase'
    case 'estrategia': return 'estrategia'
    case 'falha': return 'erro'
    case 'parada': return 'parada'
    default: return null
  }
}

/* ------------------------------------------ de volta ao formato da cabine */

/** A foto no formato que `RobotLive` já entende (a camada visual). */
export function paraEstadoMotor(e: EstadoEspelho): EstadoMotor {
  return {
    rodando: e.rodando, emOperacao: e.emOperacao, operacoes: e.operacoes, vitorias: e.vitorias, derrotas: e.derrotas,
    perdasSeguidas: e.perdasSeguidas, resultado: e.resultado, movimentado: e.movimentado, valorAtual: e.valorAtual,
    aguardando: e.aguardando, motivoParada: e.motivoParada, registros: e.registros ?? [], digitos: e.digitos ?? [], curva: e.curva ?? [],
    condicao: e.condicao, ultimoLucro: e.historico?.[0]?.lucro ?? null,
    historico: (e.historico ?? []).map((o) => ({ ...o, markupDeriv: null, esperou: 0 })),
    emCurso: e.emCurso, ticksAnalisados: e.ticksAnalisados, latenciaMedia: e.latenciaMedia, falha: e.falha,
    estrategia: e.estrategia,
  }
}
