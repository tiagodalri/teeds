/**
 * Traduz o que a Deriv responde para o que o cliente consegue ler.
 *
 * A API devolve em inglês, com um código na frente ("[ContractBuyValidationError]
 * Minimum stake of 0.35..."). Ninguém aqui opera em inglês, e o código não
 * ajuda quem está com o dedo no botão. Os erros mais comuns ganham uma frase
 * clara; o resto sai sem o código, para não parecer defeito da plataforma.
 */
export function traduzirErro(texto: string): string {
  const cru = String(texto ?? '')
  const codigo = /^\[([A-Za-z]+)\]/.exec(cru)?.[1] ?? ''
  const msg = cru.replace(/^\[[A-Za-z]+\]\s*/, '').trim()
  const baixo = (codigo + ' ' + msg).toLowerCase()

  if (codigo === 'LinhaFechada') return msg
  if (/insufficientbalance|insufficient balance|not enough/.test(baixo))
    return 'Saldo insuficiente para essa entrada.'
  if (/marketisclosed|market is closed|closed for trading/.test(baixo))
    return 'Esse mercado está fechado agora.'
  if (/pricemoved|price has changed|has moved|price moved/.test(baixo))
    return 'O preço mudou enquanto você clicava. Tente de novo.'
  if (/invalidcontractproposal|proposal.*expired|expired.*proposal|no longer valid/.test(baixo))
    return 'A cotação venceu. Tente de novo.'
  if (/ratelimit|rate limit|too many requests/.test(baixo))
    return 'Muitos pedidos de uma vez. Espere um instante e tente de novo.'
  if (/invalidtoken|authorizationrequired|please log in|not authorized/.test(baixo))
    return 'A autorização da Deriv venceu. Conecte a Deriv de novo.'
  if (/tempo esgotado/.test(baixo))
    return 'A Deriv demorou demais para responder. Confira em "Posições" antes de tentar de novo.'
  if (/minimum stake|stake.*minimum|amount.*minimum/.test(baixo))
    return `Valor abaixo do mínimo que a Deriv aceita. (${msg})`
  if (/maximum stake|stake.*maximum|maximum purchase|exceeds/.test(baixo))
    return `Valor acima do máximo permitido para esse contrato. (${msg})`
  if (/duration|expiry/.test(baixo))
    return `Duração fora do que a Deriv permite para esse ativo. (${msg})`
  if (/contractbuyvalidationerror|contractcreationfailure/.test(baixo))
    return `A Deriv recusou a entrada: ${msg}`
  return msg || 'A Deriv recusou o pedido, sem explicar o motivo.'
}
