/**
 * O carteiro em lote do monitoramento (08/11/2026).
 *
 * Cada robô grava no espelho cerca de 1,3 vez por segundo (evento, foto,
 * pulso). Uma ida ao banco por gravação, cada uma com o seu fetch, a sua
 * promessa e o seu relógio, era o maior custo do motor no teste de carga da
 * véspera da live da GlobalFly: com o monitoramento ligado, o servidor
 * aguentava ~150 robôs; sem ele, 450.
 *
 * Aqui as gravações de todas as sessões se juntam e vão numa ida só, a cada
 * `esperaMs`. Para o publicador nada muda: cada chamada ainda devolve uma
 * promessa que só resolve quando o banco confirmou AQUELE item, e falha do
 * mesmo jeito de antes, então a fila, a ordem por sessão e as novas
 * tentativas do PublicadorEspelho continuam valendo.
 *
 * Isolamento: se o banco recusar o pacote por causa de UM item (uma sessão
 * que não existe, por exemplo), o pacote é refeito item a item, pelo caminho
 * antigo, e só o culpado falha. Falha de rede (sem código do banco) recusa
 * todos, como recusaria cada um sozinho.
 */

export interface OpcoesDoLote<T> {
  /** Grava vários de uma vez (um POST com a lista). */
  enviar: (itens: T[]) => Promise<void>
  /** Grava um só: o caminho antigo, usado quando o pacote é recusado. */
  enviarUm: (item: T) => Promise<void>
  /** Itens que não podem ir juntos no mesmo pacote (mesma linha num upsert). */
  chave?: (item: T) => string
  esperaMs?: number
  maximo?: number
  /** Pacotes no ar ao mesmo tempo. */
  emVoo?: number
}

interface Pendente<T> { item: T; ok: () => void; falha: (e: unknown) => void }

/** Erro que veio do banco (tem código), e não da rede. */
const recusaDoBanco = (e: unknown) => Boolean((e as { code?: unknown })?.code)

export function criarLote<T>(o: OpcoesDoLote<T>) {
  const espera = o.esperaMs ?? 250
  const maximo = o.maximo ?? 200
  const limiteEmVoo = o.emVoo ?? 4
  let fila: Array<Pendente<T>> = []
  let relogio: ReturnType<typeof setTimeout> | null = null
  let emVoo = 0
  const medidas = { pacotes: 0, itens: 0, recusados: 0, umAUm: 0 }

  const agendar = (ms: number) => {
    if (relogio || !fila.length) return
    // Sem unref de propósito: gravação esperando o pacote segura o processo
    // aberto por no máximo `esperaMs`, para nada ficar para trás.
    relogio = setTimeout(() => { relogio = null; despachar() }, ms)
  }

  const separar = (): Array<Pendente<T>> => {
    if (!o.chave) return fila.splice(0, maximo)
    const vistas = new Set<string>()
    const vai: Array<Pendente<T>> = []
    const fica: Array<Pendente<T>> = []
    for (const p of fila) {
      const k = o.chave(p.item)
      if (vai.length < maximo && !vistas.has(k)) { vistas.add(k); vai.push(p) } else fica.push(p)
    }
    fila = fica
    return vai
  }

  const umAUm = async (pacote: Array<Pendente<T>>) => {
    medidas.umAUm += pacote.length
    await Promise.all(pacote.map((p) => o.enviarUm(p.item).then(p.ok, p.falha)))
  }

  const despachar = () => {
    while (fila.length && emVoo < limiteEmVoo) {
      const pacote = separar()
      if (!pacote.length) break
      emVoo += 1
      medidas.pacotes += 1
      medidas.itens += pacote.length
      void o.enviar(pacote.map((p) => p.item))
        .then(() => pacote.forEach((p) => p.ok()))
        .catch(async (e) => {
          medidas.recusados += 1
          if (pacote.length > 1 && recusaDoBanco(e)) await umAUm(pacote)
          else pacote.forEach((p) => p.falha(e))
        })
        .finally(() => {
          emVoo -= 1
          if (fila.length) agendar(fila.length >= maximo ? 0 : espera)
        })
    }
    if (fila.length) agendar(espera)
  }

  const gravar = (item: T): Promise<void> => new Promise<void>((ok, falha) => {
    fila.push({ item, ok, falha })
    if (fila.length >= maximo) { if (relogio) { clearTimeout(relogio); relogio = null } despachar() }
    else agendar(espera)
  })
  return Object.assign(gravar, { medidas })
}
