/**
 * O rádio do monitoramento (13/11/2026).
 *
 * Até aqui, o lance de cada I.A. chegava na tela do admin assim: o servidor
 * gravava no banco e o Realtime do Supabase RELIA cada gravação (o diário do
 * banco, o WAL) para avisar as telas abertas. Essa releitura era metade do
 * trabalho do banco num dia calmo e 71% na live de 09/11; na live de 12/11,
 * com ~30 I.A. ligadas no mesmo minuto, o banco foi de 0,2 s para 1,5–4 s por
 * consulta e o play levou 10–25 s.
 *
 * Agora o servidor TRANSMITE o lance direto para as telas, pelo Broadcast do
 * Realtime (canal privado, a regra de quem ouve mora em realtime.messages):
 * o banco não relê nada. A gravação no banco continua exatamente igual — é a
 * súmula do jogo, de onde a tela se completa ao abrir e ao reconectar.
 *
 * Os canais:
 *   espelho:<marca>              foto e pulso de todas as sessões da marca (admin geral)
 *   espelho:<marca>:<parceiro>   as do parceiro ('-' = direto), para o admin do parceiro
 *   espelho-sessao:<id>          os eventos de UMA sessão, para a cabine aberta
 *
 * Nunca segura o motor: junta tudo a cada `esperaMs` num POST só, não espera
 * resposta de ninguém e, se o Realtime engasgar, descarta o mais antigo
 * (a tela se acerta pela foto). RADIO_DESLIGADO=1 desliga sem mexer no código.
 */

export interface Transmissao {
  topic: string
  event: string
  payload: unknown
  private: true
}

interface OpcoesDoRadio {
  /** Manda um pacote. Erro aqui só vira log. */
  enviar: (mensagens: Transmissao[]) => Promise<void>
  esperaMs?: number
  /** Mensagens por POST. */
  maximo?: number
  /** Teto da fila: acima disso o mais antigo cai (a foto seguinte cobre). */
  teto?: number
  /** Pacotes no ar ao mesmo tempo. */
  emVoo?: number
  avisar?: (m: string) => void
}

export function criarRadio(o: OpcoesDoRadio) {
  const espera = o.esperaMs ?? 40
  const maximo = o.maximo ?? 100
  const teto = o.teto ?? 5000
  const limiteEmVoo = o.emVoo ?? 4
  const avisar = o.avisar ?? ((m: string) => console.warn(m))
  let fila: Transmissao[] = []
  let relogio: ReturnType<typeof setTimeout> | null = null
  let emVoo = 0
  let ultimoAviso = 0
  const medidas = { mensagens: 0, pacotes: 0, falhas: 0, descartadas: 0 }

  const despachar = () => {
    while (fila.length && emVoo < limiteEmVoo) {
      const pacote = fila.splice(0, maximo)
      emVoo += 1
      medidas.pacotes += 1
      o.enviar(pacote)
        .catch((e) => {
          medidas.falhas += 1
          // um aviso por minuto basta: o motor não para por causa do rádio
          if (Date.now() - ultimoAviso > 60_000) { ultimoAviso = Date.now(); avisar(`[radio] transmissão falhou (${medidas.falhas} no total): ${(e as Error).message}`) }
        })
        .finally(() => { emVoo -= 1; if (fila.length) agendar(0) })
    }
  }

  function agendar(ms: number) {
    if (relogio || !fila.length) return
    relogio = setTimeout(() => { relogio = null; despachar() }, ms)
    ;(relogio as { unref?: () => void }).unref?.()
  }

  function transmitir(topicos: string[], event: string, payload: unknown) {
    for (const topic of topicos) {
      fila.push({ topic, event, payload, private: true })
      medidas.mensagens += 1
    }
    if (fila.length > teto) {
      const fora = fila.length - teto
      fila.splice(0, fora)
      medidas.descartadas += fora
    }
    agendar(espera)
  }

  return Object.assign(transmitir, { medidas })
}

/** O código do parceiro no nome do canal: '' (direto) vira '-', para o nome não terminar em ':'. */
export const parceiroNoCanal = (p: string) => (p === '' ? '-' : p)

/** Os canais de foto e pulso de uma sessão. Parceiro desconhecido (null/undefined) só vai ao canal da marca. */
export function canaisDaSessao(marca: string, parceiro: string | null | undefined): string[] {
  const l = [`espelho:${marca}`]
  if (typeof parceiro === 'string') l.push(`espelho:${marca}:${parceiroNoCanal(parceiro)}`)
  return l
}

export const canalDosEventos = (sessaoId: string) => `espelho-sessao:${sessaoId}`
