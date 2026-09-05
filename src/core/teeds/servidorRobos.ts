import { RITMO_ROBOS, SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import type { ConfigEstrategia, EstadoMotor } from '../deriv/engine'

/**
 * Ligar e acompanhar um robô que roda no servidor.
 *
 * Até aqui o botão "Ligar robô" acendia um motor dentro do navegador: ele
 * morria quando a aba fechava e não deixava rastro nenhum no histórico.
 * Agora o botão pede ao servidor, que é o mesmo caminho que o chat já usa.
 * Um só lugar executa; a tela virou visor.
 *
 * O que volta em cada consulta é o estado do motor — o mesmo formato que a
 * tela já sabia desenhar quando o motor era local. Foi de propósito: assim
 * o acompanhamento ao vivo, a curva e a lista de operações continuam
 * exatamente iguais, sem uma tela nova para aprender.
 */

export interface SessaoNoServidor {
  id: string
  contaId: string
  demo: boolean
  moeda: string
  erro?: string | null
  estado: EstadoMotor
}

async function api<T>(
  sessao: SessaoTeeds, caminho: string, init: RequestInit = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}/api${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${sessao.token}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> ?? {}),
      },
    })
  } catch {
    // servidor fora do ar, wi-fi caiu, certificado recusado — para quem
    // está olhando é tudo a mesma coisa: não deu para falar com ele
    throw new Error('Não consegui falar com o servidor da Teeds. Tente de novo em instantes.')
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
  return corpo as T
}

/** Liga o robô no servidor e devolve a sessão recém-nascida. */
export function ligarNoServidor(
  sessao: SessaoTeeds,
  pedido: { roboId: string; contaId: string; config: ConfigEstrategia },
): Promise<SessaoNoServidor> {
  return api<SessaoNoServidor>(sessao, '/sessao', {
    method: 'POST',
    body: JSON.stringify(pedido),
  })
}

/** Como está a sessão agora. */
export function verNoServidor(sessao: SessaoTeeds, id: string): Promise<SessaoNoServidor> {
  return api<SessaoNoServidor>(sessao, `/sessao/${id}`)
}

/** Desliga. O servidor encerra o motor e fecha a sessão no banco. */
export function pararNoServidor(sessao: SessaoTeeds, id: string): Promise<{ id: string; estado: EstadoMotor }> {
  return api(sessao, `/sessao/${id}/parar`, { method: 'POST' })
}

/**
 * Acompanha uma sessão enquanto ela estiver viva.
 *
 * Consulta rápida com robô operando, devagar depois que ele para — e nada
 * enquanto a aba está escondida, que é bateria gasta desenhando o que
 * ninguém vê. Ao voltar para a aba, a primeira consulta é imediata.
 */
export function acompanharNoServidor(
  sessao: SessaoTeeds,
  id: string,
  aoAtualizar: (s: SessaoNoServidor) => void,
  aoFalhar?: (mensagem: string) => void,
): () => void {
  let vivo = true
  let timer: ReturnType<typeof setTimeout> | null = null
  let falhasSeguidas = 0

  const ciclo = async () => {
    if (!vivo) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      timer = setTimeout(ciclo, 5000)
      return
    }
    try {
      const s = await verNoServidor(sessao, id)
      if (!vivo) return
      falhasSeguidas = 0
      aoAtualizar(s)
      if (!s.estado?.rodando) { vivo = false; return }
      timer = setTimeout(ciclo, 800)
    } catch (e) {
      if (!vivo) return
      falhasSeguidas += 1
      // uma consulta perdida é rotina; várias seguidas é problema de verdade
      if (falhasSeguidas >= 5) { aoFalhar?.((e as Error).message); vivo = false; return }
      timer = setTimeout(ciclo, 2000)
    }
  }

  const aoVoltar = () => {
    if (document.visibilityState === 'visible' && vivo) {
      if (timer) clearTimeout(timer)
      void ciclo()
    }
  }

  void ciclo()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

  return () => {
    vivo = false
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
  }
}

export interface SessaoViva {
  id: string
  roboId: string
  roboNome: string
  contaId: string
  demo: boolean
  moeda: string
  origem: 'navegador' | 'chat' | 'api' | string
  config: ConfigEstrategia
  erro: string | null
  estado: EstadoMotor
}

/** O que está operando agora — tenha sido ligado pelo chat ou pelo botão. */
export async function sessoesVivas(sessao: SessaoTeeds): Promise<SessaoViva[]> {
  // O erro sobe de propósito: devolver lista vazia aqui fazia a tela
  // entender "não há robô operando" toda vez que o servidor demorava a
  // responder — e apagar o painel de um robô que estava vivo.
  const r = await api<{ sessoes: SessaoViva[] }>(sessao, '/sessoes')
  return r.sessoes ?? []
}

/**
 * Fica de olho no que aparece de novo no servidor.
 *
 * É por aqui que um robô ligado pelo chat, do celular, aparece sozinho na
 * tela do computador — sem recarregar a página, e no mesmo painel ao vivo
 * dos outros. A consulta é leve e espaçada: quem desenha a operação a
 * operação é o acompanhamento de cada bloco, não esta lista.
 */
export function acompanharVivas(
  sessao: SessaoTeeds,
  aoAtualizar: (lista: SessaoViva[]) => void,
  intervalo = RITMO_ROBOS,
): () => void {
  let vivo = true
  let timer: ReturnType<typeof setTimeout> | null = null

  const ciclo = async () => {
    if (!vivo) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      timer = setTimeout(ciclo, 15_000)
      return
    }
    let lista: SessaoViva[]
    try {
      lista = await sessoesVivas(sessao)
    } catch {
      // Silêncio do servidor não é "parou de operar". A tela mantém o que já
      // sabia e a gente pergunta de novo no compasso normal.
      if (!vivo) return
      timer = setTimeout(ciclo, intervalo)
      return
    }
    if (!vivo) return
    aoAtualizar(lista)
    timer = setTimeout(ciclo, intervalo)
  }

  const aoVoltar = () => {
    if (document.visibilityState === 'visible' && vivo) {
      if (timer) clearTimeout(timer)
      void ciclo()
    }
  }

  void ciclo()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

  return () => {
    vivo = false
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
  }
}
