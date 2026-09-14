import type { EstadoMotor, ConfigEstrategia } from '../../src/core/deriv/engine'
import {
  EVENTOS_PERMANENTES, LIMITES, assinaturaDoPulso, delta, pulsoDoEstado, resumirEstado, tipoDoEvento,
  type DeltaEspelho, type EstadoEspelho, type PulsoEspelho, type TipoEvento,
} from '../../src/core/teeds/espelho'
import {
  escreverEventoDoEspelho, escreverFotoDoEspelho, escreverPulsoDoEspelho, limparEspelhoAntigo,
  supabaseConfigurado, type SessaoGravada,
} from './supabase'

/**
 * O publicador do espelho: leva o estado do motor até o banco sem nunca
 * segurar o motor.
 *
 * Regras que não se negociam (ver MONITORAMENTO.md):
 *  1. `aoEstado` devolve na hora. Nada de await no caminho do robô.
 *  2. EVENTOS são duráveis: abertura, compra, liquidação, entrada seguinte,
 *     fase/recuperação, troca de estratégia, falha, parada e foto. Ficam na
 *     fila até o banco CONFIRMAR. Em falha, o item continua na frente da
 *     fila com a mesma seq; a próxima tentativa vem com backoff exponencial
 *     e jitter. O banco tem unique (sessao_id, seq): repetição é idempotente.
 *  3. Só 'conexao' pode ser podado sob pressão de memória. Eventos
 *     permanentes nunca são descartados; a fila cresce até `FILA_MAXIMA`
 *     e, acima disso, o publicador para de aceitar estados NOVOS não
 *     críticos e registra a pressão — sem tocar no motor.
 *  4. FOTO e PULSO são "o estado mais recente": coalescer é só trocar o
 *     pendente pelo último; nada se perde, porque o evento já está na fila.
 *  5. O PULSO sai no máximo a cada `LIMITES.pulsoMs` e só se o conteúdo
 *     mudou (assinatura). Os ticks do intervalo vão nele em lote.
 *  6. Uma escrita em voo por sessão; sessões não compartilham fila, então
 *     uma sessão lenta não segura as outras.
 *  7. `encerrar()` para o batimento, enfileira a foto final (permanente) e
 *     DRENA: continua tentando até esvaziar ou até `PRAZO_DRENAGEM_MS`;
 *     estourado o prazo, registra sessão, seq e quantidade pendente.
 */

const FILA_MAXIMA = 5000
const PRAZO_DRENAGEM_MS = 120_000
const BACKOFF_BASE_MS = 500
const BACKOFF_MAXIMO_MS = 30_000

/** Consultado ao criar sessões; o desligamento exige reinício do processo. */
export function espelhoHabilitado(desligado = process.env.ESPELHO_DESLIGADO): boolean {
  return desligado !== '1'
}

export interface EscritoresDoEspelho {
  foto: typeof escreverFotoDoEspelho
  evento: typeof escreverEventoDoEspelho
  pulso: typeof escreverPulsoDoEspelho
  agora?: () => number
  /** Espera entre tentativas; injetável para o teste não dormir de verdade. */
  dormir?: (ms: number) => Promise<void>
  aleatorio?: () => number
}

const PADRAO: EscritoresDoEspelho = { foto: escreverFotoDoEspelho, evento: escreverEventoDoEspelho, pulso: escreverPulsoDoEspelho }

interface ItemEvento { seq: number; tipo: TipoEvento; delta: DeltaEspelho; config?: ConfigEstrategia; emitidoEm: number; tentativas: number }

export interface MedidasDoPublicador {
  estados: number; eventos: number; fotos: number; pulsos: number; pulsosIdenticos: number
  coalescidos: number; tentativas: number; falhas: number; podados: number; pressao: number
  drenagemEstourada: boolean; pendentesAoEstourar: number
}

export class PublicadorEspelho {
  private seq = 0
  private ultima: EstadoEspelho | null = null
  private fotoPendente: { seq: number; estado: EstadoEspelho; emitidoEm: number; urgente: boolean } | null = null
  private ultimaFotoEscritaEm = 0
  private pulsoPendente: { seq: number; pulso: PulsoEspelho; emitidoEm: number } | null = null
  private ultimaAssinaturaDoPulso = ''
  private ultimoPulsoEm = 0
  private eventos: ItemEvento[] = []
  private escrevendo = false
  private janela: ReturnType<typeof setTimeout> | null = null
  private batimento: ReturnType<typeof setInterval> | null = null
  private ultimaFotoEm = 0
  private encerrado = false
  private drenagemIniciadaEm = 0
  private resolvedoresDaDrenagem: Array<() => void> = []
  readonly medidas: MedidasDoPublicador = { estados: 0, eventos: 0, fotos: 0, pulsos: 0, pulsosIdenticos: 0, coalescidos: 0, tentativas: 0, falhas: 0, podados: 0, pressao: 0, drenagemEstourada: false, pendentesAoEstourar: 0 }

  constructor(
    private readonly sessao: SessaoGravada,
    private readonly config: ConfigEstrategia,
    private readonly conexao: () => string,
    private readonly escritores: EscritoresDoEspelho = PADRAO,
    private readonly ligado: () => boolean = supabaseConfigurado,
  ) {
    this.batimento = setInterval(() => this.bater(), LIMITES.pulsoMs)
    this.batimento.unref?.()
  }

  private agora() { return this.escritores.agora?.() ?? Date.now() }
  private dormir(ms: number) { return this.escritores.dormir ? this.escritores.dormir(ms) : new Promise<void>((r) => { const t = setTimeout(r, ms); (t as any).unref?.() }) }
  private aleatorio() { return this.escritores.aleatorio?.() ?? Math.random() }
  get pendentes() { return this.eventos.length + (this.fotoPendente ? 1 : 0) + (this.pulsoPendente ? 1 : 0) }
  /** O que precisa ser escrito AGORA (a foto fora da janela espera o batimento). */
  private get devidos() { return this.eventos.length + (this.fotoPendente && (this.fotoPendente.urgente || this.encerrado) ? 1 : 0) + (this.pulsoPendente ? 1 : 0) }
  get sequencia() { return this.seq }

  /** Chamado pelo servidor a cada estado do motor. Devolve na hora. */
  aoEstado(e: EstadoMotor): void {
    if (this.encerrado || !this.ligado()) return
    this.medidas.estados += 1
    const agora = resumirEstado(e, this.conexao())
    const tipo = tipoDoEvento(this.ultima, agora)
    const quando = this.agora()
    if (tipo) {
      if (!this.aceitaNovoEvento(tipo)) { this.ultima = agora; return }
      this.seq += 1
      this.medidas.eventos += 1
      this.eventos.push({ seq: this.seq, tipo, delta: delta(this.ultima, agora), config: tipo === 'abertura' ? this.config : undefined, emitidoEm: quando, tentativas: 0 })
      if (tipo === 'abertura') this.ultimaFotoEm = quando
      if (this.fotoPendente) this.medidas.coalescidos += 1
      // Abertura e parada são urgentes; as outras fotos esperam a janela de 2 s (ver escrever()).
      this.fotoPendente = { seq: this.seq, estado: agora, emitidoEm: quando, urgente: tipo === 'abertura' || tipo === 'parada' }
      this.ultima = agora
      this.agendar(0)
      return
    }
    if (quando - this.ultimaFotoEm >= LIMITES.fotoPeriodicaMs && this.ultima && this.aceitaNovoEvento('foto')) {
      // Foto periódica: um evento completo de tempos em tempos, para o replay saltar.
      this.seq += 1
      this.eventos.push({ seq: this.seq, tipo: 'foto', delta: { ...agora }, emitidoEm: quando, tentativas: 0 })
      this.fotoPendente = { seq: this.seq, estado: agora, emitidoEm: quando, urgente: true }
      this.ultimaFotoEm = quando
      this.ultima = agora
      this.agendar(0)
      return
    }
    // Só a fita andou: fica como último estado; o batimento leva, se mudou.
    this.ultima = agora
  }

  /**
   * A sessão acabou: para o batimento, enfileira a foto final (permanente)
   * e drena. Devolve uma promessa que resolve quando a fila esvaziou ou o
   * prazo estourou — quem chama pode aguardar (limitado) ou só disparar.
   */
  encerrar(): Promise<void> {
    if (this.encerrado) return this.promessaDaDrenagem()
    this.encerrado = true
    if (this.batimento) clearInterval(this.batimento)
    if (this.janela) { clearTimeout(this.janela); this.janela = null }
    this.drenagemIniciadaEm = this.agora()
    if (this.ultima) {
      const quando = this.agora()
      this.seq += 1
      this.eventos.push({ seq: this.seq, tipo: 'foto', delta: { ...this.ultima }, emitidoEm: quando, tentativas: 0 })
      this.fotoPendente = { seq: this.seq, estado: this.ultima, emitidoEm: quando, urgente: true }
      this.pulsoPendente = { seq: this.seq, pulso: pulsoDoEstado(this.ultima), emitidoEm: quando }
    }
    void this.escrever()
    return this.promessaDaDrenagem()
  }

  private promessaDaDrenagem(): Promise<void> {
    if (!this.pendentes && !this.escrevendo) return Promise.resolve()
    return new Promise((r) => this.resolvedoresDaDrenagem.push(r))
  }
  private avisarDrenagem() { const rs = this.resolvedoresDaDrenagem; this.resolvedoresDaDrenagem = []; rs.forEach((r) => r()) }

  /** Pressão de memória: acima do limite, só eventos críticos entram. */
  private aceitaNovoEvento(tipo: TipoEvento): boolean {
    if (this.eventos.length < FILA_MAXIMA) return true
    this.podar()
    if (this.eventos.length < FILA_MAXIMA) return true
    if (EVENTOS_PERMANENTES.has(tipo)) return true   // crítico entra mesmo assim: memória antes de perda
    this.medidas.pressao += 1
    if (this.medidas.pressao === 1 || this.medidas.pressao % 500 === 0) console.error(`[espelho ${this.sessao.id.slice(0, 8)}] fila cheia (${this.eventos.length}); evento leve "${tipo}" não enfileirado`)
    return false
  }

  /** Só os eventos não permanentes cedem lugar. */
  private podar() {
    const antes = this.eventos.length
    this.eventos = this.eventos.filter((ev) => EVENTOS_PERMANENTES.has(ev.tipo))
    this.medidas.podados += antes - this.eventos.length
  }

  /** O batimento: no máximo um pulso a cada `pulsoMs`, e só se o conteúdo mudou. */
  private bater() {
    if (this.encerrado || !this.ultima) return
    const pulso = pulsoDoEstado(this.ultima)
    const assinatura = assinaturaDoPulso(pulso)
    const quando = this.agora()
    // Presença: mesmo sem mudança, renova o carimbo uma vez a cada 5 pulsos (10 s) para o painel saber que o servidor vive.
    const presenca = quando - this.ultimoPulsoEm >= LIMITES.pulsoMs * 5
    if (assinatura === this.ultimaAssinaturaDoPulso && !presenca) {
      this.medidas.pulsosIdenticos += 1
      if (this.fotoPendente) this.agendar(0)   // a foto que esperava a janela sai agora
      return
    }
    if (this.pulsoPendente) this.medidas.coalescidos += 1
    this.pulsoPendente = { seq: this.seq, pulso, emitidoEm: quando }
    this.ultimaAssinaturaDoPulso = assinatura
    this.agendar(0)
  }

  private agendar(ms: number) {
    if (ms === 0) { if (this.janela) { clearTimeout(this.janela); this.janela = null }; void this.escrever(); return }
    if (this.janela) return
    this.janela = setTimeout(() => { this.janela = null; void this.escrever() }, ms)
    ;(this.janela as any).unref?.()
  }

  private backoff(tentativas: number): number {
    const base = Math.min(BACKOFF_MAXIMO_MS, BACKOFF_BASE_MS * 2 ** Math.min(tentativas, 6))
    return Math.round(base * (0.5 + this.aleatorio()))   // jitter: 50%–150% do passo
  }

  private prazoEstourou(): boolean {
    return this.encerrado && this.drenagemIniciadaEm > 0 && this.agora() - this.drenagemIniciadaEm > PRAZO_DRENAGEM_MS
  }

  private async escrever(): Promise<void> {
    if (this.escrevendo) return
    this.escrevendo = true
    try {
      while (true) {
        // 1) eventos, em ordem, um a um — o item só sai da fila depois de confirmado
        const ev = this.eventos[0]
        if (ev) {
          this.medidas.tentativas += 1
          try {
            await this.escritores.evento(this.sessao, ev)
            this.eventos.shift()
          } catch (e) {
            const texto = (e as Error).message
            if (/23505|duplicate/i.test(texto)) { this.eventos.shift(); continue }   // já estava lá: idempotente
            this.medidas.falhas += 1
            ev.tentativas += 1
            if (ev.tentativas === 1 || ev.tentativas % 10 === 0) console.error(`[espelho ${this.sessao.id.slice(0, 8)}] evento ${ev.seq} (${ev.tipo}) falhou ${ev.tentativas}x: ${texto}`)
            if (this.prazoEstourou()) { this.registrarEstouro(); return }
            await this.dormir(this.backoff(ev.tentativas))
            if (this.prazoEstourou()) { this.registrarEstouro(); return }
          }
          continue
        }
        // 2) a foto mais recente (coalescida), no máximo uma a cada `pulsoMs` — salvo abertura, parada e
        //    encerramento, que saem na hora. A foto que ficou esperando sai no próximo batimento. Em falha,
        //    volta a ficar pendente se nenhuma mais nova chegou.
        const fotoDevida = this.fotoPendente && (this.fotoPendente.urgente || this.encerrado || this.agora() - this.ultimaFotoEscritaEm >= LIMITES.pulsoMs)
        const foto = fotoDevida ? this.fotoPendente : null
        if (foto) {
          this.fotoPendente = null
          this.medidas.tentativas += 1
          try {
            await this.escritores.foto(this.sessao, { seq: foto.seq, estado: foto.estado, config: this.config, emitidoEm: foto.emitidoEm })
            this.medidas.fotos += 1; this.ultimaFotoEscritaEm = this.agora()
          } catch (e) {
            this.medidas.falhas += 1
            console.error(`[espelho ${this.sessao.id.slice(0, 8)}] foto ${foto.seq}: ${(e as Error).message}`)
            if (!this.fotoPendente) this.fotoPendente = foto
            if (this.prazoEstourou()) { this.registrarEstouro(); return }
            await this.dormir(this.backoff(1))
          }
          continue
        }
        // 3) o pulso mais recente
        const pulso = this.pulsoPendente; this.pulsoPendente = null
        if (pulso) {
          this.medidas.tentativas += 1
          try {
            await this.escritores.pulso(this.sessao, pulso)
            this.medidas.pulsos += 1; this.ultimoPulsoEm = pulso.emitidoEm
          } catch (e) {
            this.medidas.falhas += 1
            console.error(`[espelho ${this.sessao.id.slice(0, 8)}] pulso ${pulso.seq}: ${(e as Error).message}`)
            // pulso é efêmero: se falhar, o próximo batimento manda um mais novo; não se retenta
          }
          continue
        }
        break
      }
    } finally {
      this.escrevendo = false
      if (!this.pendentes) this.avisarDrenagem()
      // Prazo de drenagem estourado: o que sobrou fica registrado (seq e quantidade),
      // sem reagendar em laço. Fora disso, o que chegou durante a escrita sai agora;
      // a foto que só espera a janela de 2 s fica para o batimento.
      else if (!this.medidas.drenagemEstourada && this.devidos) this.agendar(0)
    }
  }

  private registrarEstouro() {
    if (!this.medidas.drenagemEstourada) {
      this.medidas.drenagemEstourada = true
      this.medidas.pendentesAoEstourar = this.pendentes
      console.error(`[espelho ${this.sessao.id.slice(0, 8)}] drenagem estourou ${PRAZO_DRENAGEM_MS / 1000}s: ${this.eventos.length} evento(s) pendente(s) a partir da seq ${this.eventos[0]?.seq ?? '-'}; foto pendente=${this.fotoPendente ? 'sim' : 'não'}`)
    }
    this.avisarDrenagem()
  }
}

/* ------------------------------------------------------------ retenção */

/** Uma vez por dia o servidor apaga o que já não serve. Nunca derruba nada se falhar. */
export function ligarFaxinaDoEspelho(intervaloMs = 24 * 3600_000): () => void {
  const rodar = async () => {
    try {
      const r = await limparEspelhoAntigo()
      console.log(`[espelho] faxina: ${JSON.stringify(r)}`)
    } catch (e) {
      console.error('[espelho] faxina falhou:', (e as Error).message)
    }
  }
  const primeira = setTimeout(() => void rodar(), 60_000)
  primeira.unref?.()
  const relogio = setInterval(() => void rodar(), intervaloMs)
  relogio.unref?.()
  return () => { clearTimeout(primeira); clearInterval(relogio) }
}
