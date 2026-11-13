/**
 * A fila das operações das I.A. (13/11/2026).
 *
 * Cada operação liquidada gravava em duas idas ao banco (operacoes_robos e o
 * placar em sessoes_robos), e se o banco estivesse fora a operação sumia do
 * histórico (04/11: 28 de 44 perdidas na troca do computador do Supabase).
 *
 * Aqui as operações de todas as sessões se juntam e vão numa ida só, a cada
 * `esperaMs`, pela função teeds_gravar_operacoes. Garantias:
 *  - Nada some por falha de rede ou banco fora: o pacote volta para a fila e
 *    é tentado de novo (1 s, 2 s, 4 s… até 30 s), enquanto o processo viver.
 *  - Um item ruim não derruba os outros: se o banco recusar o pacote por um
 *    erro de dado, ele é refeito item a item pelo caminho antigo (`umAUm`).
 *  - Sem a função no banco, cai para o caminho antigo e avisa uma vez.
 *  - O placar de cada sessão vai com o estado mais novo do pacote.
 *  - `esvaziar(sessaoId)` espera as operações daquela sessão gravarem —
 *    o encerramento da sessão chama antes, para o aviso de comissão (gatilho
 *    no encerramento) já enxergar as operações.
 *  - `esvaziarTudo()` no desligamento do processo.
 */

export interface LinhaDeOperacao { contract_id: number; user_id: string; sessao_id: string; [k: string]: unknown }
export interface PlacarDaSessao { id: string; operacoes: number; ganhas: number; perdidas: number; resultado: number; movimentado: number; entrada_atual: number }
interface Item { linha: LinhaDeOperacao; placar: PlacarDaSessao; tentativas: number }

interface Opcoes {
  /** Grava um pacote (a função do banco). Erro com `code` = recusa do banco; sem = rede. */
  enviar: (operacoes: LinhaDeOperacao[], sessoes: PlacarDaSessao[]) => Promise<void>
  /** O caminho antigo, uma operação por vez (para o pacote recusado e sem a função no banco). */
  umAUm: (linha: LinhaDeOperacao, placar: PlacarDaSessao) => Promise<void>
  esperaMs?: number
  maximo?: number
  teto?: number
  avisar?: (m: string) => void
  agendar?: (fn: () => void, ms: number) => unknown
}

const semFuncao = (e: unknown) => {
  const c = String((e as { code?: unknown })?.code ?? '')
  const m = String((e as Error)?.message ?? '')
  return c === 'PGRST202' || c === '42883' || /Could not find the function|404/.test(m)
}
/** Recusa por DADO (22xxx dado inválido, 23xxx restrição): refazer igual não adianta, vai um a um.
 *  Qualquer outra coisa (banco fora, PGRST0xx de conexão, 5xx, rede) é passageira: tenta de novo. */
const recusaDoBanco = (e: unknown) => /^(22|23)/.test(String((e as { code?: unknown })?.code ?? ''))

export function criarFilaDeOperacoes(o: Opcoes) {
  const espera = o.esperaMs ?? 500
  const maximo = o.maximo ?? 300
  const teto = o.teto ?? 50_000
  const avisar = o.avisar ?? ((m: string) => console.warn(m))
  const agendar = o.agendar ?? ((fn: () => void, ms: number) => { const t = setTimeout(fn, ms); (t as { unref?: () => void }).unref?.(); return t })
  let fila: Item[] = []
  let relogio: unknown = null
  let enviando = false
  let falhasSeguidas = 0
  let soCaminhoAntigo = false
  const esperando: Array<{ sessaoId: string | null; ok: () => void }> = []
  const medidas = { recebidas: 0, gravadas: 0, pacotes: 0, novasTentativas: 0, umAUm: 0, descartadas: 0 }

  const pendentesDa = (sessaoId: string | null) => fila.some((i) => sessaoId === null || i.linha.sessao_id === sessaoId)
  const avisarQuemEspera = () => {
    for (let k = esperando.length - 1; k >= 0; k--) {
      if (!pendentesDa(esperando[k].sessaoId) && !enviando) { esperando[k].ok(); esperando.splice(k, 1) }
    }
  }

  const marcar = (ms: number) => {
    if (relogio || !fila.length) return
    const fn = () => { relogio = null; void despachar() }
    relogio = esperando.length ? setTimeout(fn, ms) : agendar(fn, ms)
  }

  async function caminhoAntigo(pacote: Item[]) {
    medidas.umAUm += pacote.length
    for (const i of pacote) {
      try { await o.umAUm(i.linha, i.placar); medidas.gravadas += 1 }
      catch (e) { avisar(`[operacoes] não gravei a operação ${i.linha.contract_id}: ${(e as Error).message}`) }
    }
  }

  async function despachar() {
    if (enviando || !fila.length) return
    enviando = true
    const pacote = fila.splice(0, maximo)
    // o placar mais novo de cada sessão no pacote (mais operações = mais novo)
    const placares = new Map<string, PlacarDaSessao>()
    for (const i of pacote) {
      const atual = placares.get(i.placar.id)
      if (!atual || i.placar.operacoes >= atual.operacoes) placares.set(i.placar.id, i.placar)
    }
    try {
      if (soCaminhoAntigo) await caminhoAntigo(pacote)
      else {
        medidas.pacotes += 1
        await o.enviar(pacote.map((i) => i.linha), [...placares.values()])
        medidas.gravadas += pacote.length
      }
      falhasSeguidas = 0
    } catch (e) {
      if (semFuncao(e)) {
        soCaminhoAntigo = true
        avisar('[operacoes] a função teeds_gravar_operacoes não existe no banco: gravando uma a uma, como antes')
        await caminhoAntigo(pacote)
      } else if (recusaDoBanco(e)) {
        // um item com dado ruim: refaz um a um, só o culpado fica de fora (e vira aviso)
        avisar(`[operacoes] o banco recusou um pacote de ${pacote.length} (${(e as Error).message}); refazendo um a um`)
        await caminhoAntigo(pacote)
      } else {
        // rede ou banco fora: nada se perde, o pacote volta para a frente da fila
        falhasSeguidas += 1
        medidas.novasTentativas += 1
        pacote.forEach((i) => { i.tentativas += 1 })
        fila = [...pacote, ...fila]
        if (falhasSeguidas === 1 || falhasSeguidas % 10 === 0) avisar(`[operacoes] banco não respondeu (${(e as Error).message}); ${fila.length} operação(ões) guardada(s), tentando de novo`)
      }
    } finally {
      enviando = false
    }
    avisarQuemEspera()
    if (fila.length) marcar(falhasSeguidas ? Math.min(30_000, 1000 * 2 ** Math.min(falhasSeguidas - 1, 5)) : 0)
  }

  function gravar(linha: LinhaDeOperacao, placar: PlacarDaSessao) {
    medidas.recebidas += 1
    fila.push({ linha, placar, tentativas: 0 })
    if (fila.length > teto) {
      const fora = fila.splice(0, fila.length - teto)
      medidas.descartadas += fora.length
      avisar(`[operacoes] fila passou de ${teto}: ${fora.length} operação(ões) antiga(s) descartada(s)`)
    }
    marcar(espera)
  }

  /** Espera as operações desta sessão (ou de todas, com null) gravarem; desiste em `limiteMs`. */
  function esvaziar(sessaoId: string | null, limiteMs = 15_000): Promise<boolean> {
    if (!pendentesDa(sessaoId) && !enviando) return Promise.resolve(true)
    return new Promise<boolean>((ok) => {
      let feito = false
      const item = { sessaoId, ok: () => { if (!feito) { feito = true; ok(true) } } }
      esperando.push(item)
      // sem esperar o relógio: o encerramento quer o pacote agora
      if (!enviando) void despachar()   // o relógio que estiver marcado acha a fila vazia depois
      // relógio comum (não unref): quem espera o esvaziamento precisa da resposta, mesmo com o processo saindo
      setTimeout(() => { if (!feito) { feito = true; const k = esperando.indexOf(item); if (k >= 0) esperando.splice(k, 1); ok(false) } }, limiteMs)
    })
  }

  return Object.assign(gravar, { esvaziar, medidas, tamanho: () => fila.length })
}
