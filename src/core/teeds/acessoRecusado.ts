import { SERVIDOR } from './config'

/**
 * O servidor recusou o acesso (30/10/2026).
 *
 * O Victor saiu da conta no iPhone e o login do Mac dele morreu junto, mas o
 * Mac seguia com a tela aberta: o servidor respondia "sua sessão expirou" a
 * tudo e a vitrine das I.A. aparecia vazia, sem aviso. Agora toda resposta 401
 * do nosso servidor avisa o app (evento `teeds-acesso-recusado`), e o
 * useTeedsAuth confere o login: se ele caiu de verdade, leva a pessoa para
 * entrar de novo.
 */
export const ACESSO_RECUSADO = 'teeds-acesso-recusado'

let instalado = false
export function vigiarAcessoRecusado(): void {
  if (instalado || typeof window === 'undefined' || typeof window.fetch !== 'function' || !SERVIDOR.url) return
  instalado = true
  const original = window.fetch.bind(window)
  window.fetch = async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const resposta = await original(entrada, opcoes)
    if (resposta.status === 401) {
      const endereco = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      if (endereco.startsWith(SERVIDOR.url)) window.dispatchEvent(new Event(ACESSO_RECUSADO))
    }
    return resposta
  }
}
