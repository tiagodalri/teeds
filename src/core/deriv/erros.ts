/**
 * Traduz o que a Deriv responde para o que o cliente consegue ler.
 *
 * A API devolve em inglês, com um código na frente ("[ContractBuyValidationError]
 * Minimum stake of 0.35..."). Ninguém aqui opera em inglês, e o código não
 * ajuda quem está com o dedo no botão. Os erros mais comuns ganham uma frase
 * clara; o resto sai sem o código, para não parecer defeito da plataforma.
 */
/** O texto do saldo insuficiente: quem mostra o aviso põe o link de depósito (DERIV.deposito) junto. */
export const SALDO_INSUFICIENTE = 'Saldo insuficiente para essa entrada.'

/** Este aviso (já traduzido) pede o link de depósito da Deriv ao lado. */
export const pedeDeposito = (textoTraduzido: string | null | undefined): boolean => textoTraduzido === SALDO_INSUFICIENTE

/**
 * Nunca devolve o inglês da Deriv: a mensagem crua não entra no texto (29/10/2026,
 * revisão: ela aparecia dentro do botão de compra, em inglês e em várias linhas).
 * Quem precisar do original para suporte usa o erro antes de traduzir.
 */
export function traduzirErro(texto: string): string {
  const cru = String(texto ?? '')
  const codigo = /^\[([A-Za-z]+)\]/.exec(cru)?.[1] ?? ''
  const msg = cru.replace(/^\[[A-Za-z]+\]\s*/, '').trim()
  const baixo = (codigo + ' ' + msg).toLowerCase()

  // as nossas próprias mensagens (já em português) passam como estão
  if (codigo === 'LinhaFechada') return msg
  if (/insufficientbalance|insufficient balance|not enough/.test(baixo))
    return SALDO_INSUFICIENTE
  if (/marketisclosed|market is closed|closed for trading/.test(baixo))
    return 'Esse mercado está fechado agora.'
  if (/pricemoved|price has changed|has moved|price moved/.test(baixo))
    return 'O preço mudou no meio do pedido. Tente de novo.'
  if (/invalidcontractproposal|proposal.*expired|expired.*proposal|no longer valid/.test(baixo))
    return 'A cotação venceu. Tente de novo.'
  if (/ratelimit|rate limit|too many requests/.test(baixo))
    return 'Muitos pedidos de uma vez. Espere um instante e tente de novo.'
  if (/invalidtoken|authorizationrequired|please log in|not authorized/.test(baixo))
    return 'A autorização da Deriv venceu. Conecte a Deriv de novo.'
  if (/tempo esgotado/.test(baixo))
    return 'A Deriv demorou para responder. Confira suas posições abertas antes de tentar de novo.'
  // multiplicadores (30/10/2026)
  if (/multiplier is not in acceptable range/.test(baixo))
    return 'Este multiplicador não está disponível neste ativo. Escolha outro.'
  if (/either (stop loss|take profit) or deal cancellation/.test(baixo))
    return 'Use o cancelamento ou o take profit e o stop loss, não os dois juntos.'
  if (/deal cancellation/.test(baixo) && /expired|not available|no longer/.test(baixo))
    return 'O prazo do cancelamento já acabou. Para sair, feche a operação.'
  if (/deal cancellation/.test(baixo))
    return 'O cancelamento não está disponível neste ativo agora.'
  if (/take profit/.test(baixo))
    return 'O take profit está fora do que a Deriv aceita. Ajuste o valor.'
  if (/stop loss/.test(baixo))
    return 'O stop loss está fora do que a Deriv aceita: ele vai de US$ 0,30 até o valor da entrada.'
  if (/minimum stake|stake.*minimum|amount.*minimum|stake amount that.s at least|at least \d/.test(baixo)) {
    const minimo = /at least\s+([\d.]+)/.exec(baixo)?.[1]
    return `Valor abaixo do mínimo de US$ ${minimo ? Number(minimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,35'}.`
  }
  if (/maximum stake|stake.*maximum|maximum purchase|exceeds/.test(baixo))
    return 'Valor acima do máximo para esta operação.'
  if (/duration|expiry/.test(baixo))
    return 'Esta duração não está disponível neste ativo.'
  if (/contractbuyvalidationerror|contractcreationfailure/.test(baixo))
    return 'A Deriv recusou esta entrada. Tente outro valor ou outra duração.'
  // sem código na frente é texto nosso (já em português) e segue igual; com código
  // é a Deriv falando inglês, e vira uma frase clara. Falha de rede do navegador também.
  if (msg && !codigo && !/failed to fetch|load failed|networkerror|network error/i.test(msg)) return msg
  return 'A Deriv recusou o pedido. Tente de novo em instantes.'
}
