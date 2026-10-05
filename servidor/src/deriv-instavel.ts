/**
 * Quando a Deriv cai, as rotinas de fundo saem da frente.
 *
 * O QUE ACONTECEU EM 05/10/2026. Das 14h26 às 14h40 (UTC) a Deriv parou de
 * responder — REST e WebSocket juntos, para todos os clientes. Enquanto isso,
 * a sincronia de comissões varreu os vinte clientes da lista, um por um,
 * esperando o tempo inteiro de cada um estourar: a passada que leva 41 s
 * levou 492 s e terminou com zero contas e vinte erros. O extrato fez o
 * mesmo logo depois.
 *
 * Isso não derrubou nada, mas foi oito minutos de martelada numa porta que
 * já estava fechada — e no mesmo minuto em que o Tiago tentava ligar um robô
 * e via "Iniciando… 122 s" na tela. O que o cliente pede ao vivo vale mais
 * que um número de administração que pode esperar cinco minutos.
 *
 * A regra aqui é curta: três falhas de tempo seguidas e a rotina desiste da
 * passada e fica de molho. Três porque uma é azar e duas é coincidência; a
 * terceira já é padrão. E de molho porque, se a Deriv está fora, a próxima
 * passada daqui a cinco minutos só repetiria o desperdício.
 *
 * Erro de verdade (conta sem autorização, dinheiro insuficiente, parâmetro
 * errado) NÃO conta: esse é problema de um cliente só e a varredura tem que
 * continuar nos outros. Só o engasgo de tempo entra na conta.
 */

/** Falhas de tempo seguidas que bastam para considerar a Deriv fora do ar. */
export const FALHAS_PARA_DESISTIR = 3
/** Quanto tempo as rotinas de fundo esperam depois de desistir. */
export const DESCANSO_MS = 5 * 60_000

/**
 * O texto de um engasgo de tempo da Deriv.
 *
 * Vem da mesma família de mensagens que o `ligarInsistindo` do servidor já
 * reconhece — se um dia mudarem, mudam juntos.
 */
const ENGASGO = /não respondeu a tempo|não abriu a conexão|instável|tempo esgotado|timed? ?out/i

export const ehEngasgoDaDeriv = (e: unknown): boolean =>
  ENGASGO.test(e instanceof Error ? e.message : String(e ?? ''))

let deMolhoAte = 0

/** A rotina desistiu: ninguém mais incomoda a Deriv por um tempo. */
export function poremDeMolho(quem: string, agora = Date.now()): void {
  deMolhoAte = agora + DESCANSO_MS
  console.warn(
    `[${quem}] a Deriv falhou ${FALHAS_PARA_DESISTIR} vezes seguidas por tempo — ` +
    `passada abortada. As rotinas de fundo ficam de molho por ${Math.round(DESCANSO_MS / 60_000)} min ` +
    'para não disputar a Deriv com quem está operando.',
  )
}

/** Ainda está de molho? */
export const deMolho = (agora = Date.now()): boolean => agora < deMolhoAte

/** Quantos segundos faltam para voltar. Zero quando já pode. */
export const faltamSegundos = (agora = Date.now()): number =>
  Math.max(0, Math.ceil((deMolhoAte - agora) / 1000))

/** Só para os testes: volta ao estado de quem nunca falhou. */
export function esquecerParaTeste(): void { deMolhoAte = 0 }

/**
 * Conta as falhas seguidas de uma varredura.
 *
 * Fica aqui, e não solto em cada rotina, porque as duas precisam contar do
 * mesmo jeito — e porque "seguidas" é a parte que se erra sozinho: um acerto
 * no meio zera a conta, senão vinte erros espalhados ao longo de uma hora
 * acabariam abortando uma passada que estava indo bem.
 */
export function contadorDeFalhas(quem: string) {
  let seguidas = 0
  return {
    acertou(): void { seguidas = 0 },
    /** Devolve true quando é hora de abortar a passada. */
    falhou(e: unknown): boolean {
      if (!ehEngasgoDaDeriv(e)) { seguidas = 0; return false }
      seguidas += 1
      if (seguidas < FALHAS_PARA_DESISTIR) return false
      poremDeMolho(quem)
      return true
    },
  }
}
