/**
 * A plataforma deve abrir direto na tela de CADASTRO nesta visita?
 *
 * Sim quando (09/10/2026):
 *  - o endereço traz `?cadastro=1` (é para onde /cadastre-se encaminha); ou
 *  - o link veio de uma campanha de e-mail de cadastro. Quem recebeu esses
 *    e-mails não tem conta, por construção da lista, e caía na tela de entrar
 *    tendo de achar o botão "Cadastre-se".
 *
 * Decidido UMA VEZ, quando o módulo é carregado: isso acontece antes de o
 * registro de visita limpar as marcações da barra de endereço (visitas.ts),
 * porque os módulos importados são avaliados antes do corpo do main.tsx.
 * O `cadastro=1` sai da barra logo em seguida, para um F5 depois do cadastro
 * não reabrir o formulário.
 */
export const CAMPANHAS_DE_CADASTRO = ['cadastro', 'acesso-gratuito'] as const

export function deveAbrirNoCadastro(busca: string): boolean {
  const q = new URLSearchParams(busca)
  if (q.get('cadastro') === '1') return true
  const campanha = (q.get('utm_campaign') ?? '').trim().toLowerCase()
  return q.get('utm_source')?.toLowerCase() === 'email' && (CAMPANHAS_DE_CADASTRO as readonly string[]).includes(campanha)
}

function decidir(): boolean {
  try {
    const abrir = deveAbrirNoCadastro(location.search)
    const u = new URL(location.href)
    if (u.searchParams.has('cadastro')) {
      u.searchParams.delete('cadastro')
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash)
    }
    return abrir
  } catch { return false }
}

export const abrirNoCadastro: boolean = typeof location === 'undefined' ? false : decidir()

/**
 * Qual página de venda abriu o cadastro (16/11/2026, Tiago: "duplicar a /cadastro com outra
 * especificação na URL, /trafego, para a gente saber que é o que vai usar no tráfego pago").
 *
 *  - 'cadastro': /cadastro, /n/cadastro, /v/cadastro (orgânico, bio, stories...);
 *  - 'trafego':  /n/trafego, /v/trafego (anúncios). Começa igual à /cadastro e vai ganhar a VSL
 *    com o botão liberado depois de um tempo.
 *
 * O encaminhamento (captura-globalfly/trafego/) manda `?pagina=trafego`; como o `cadastro=1`,
 * é lido uma vez, no carregamento, e sai da barra logo em seguida.
 */
export type PaginaDeVenda = 'cadastro' | 'trafego'

function decidirPagina(): PaginaDeVenda {
  try {
    const u = new URL(location.href)
    const p = u.searchParams.get('pagina')
    if (!u.searchParams.has('pagina')) return 'cadastro'
    u.searchParams.delete('pagina')
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash)
    return p === 'trafego' ? 'trafego' : 'cadastro'
  } catch { return 'cadastro' }
}

export const paginaDeVenda: PaginaDeVenda = typeof location === 'undefined' ? 'cadastro' : decidirPagina()

/**
 * `?rapido=1` no link da /trafego: os botões dos vídeos do quiz aparecem em 5 s em vez do tempo de
 * cada vídeo (4:10, 1:55, 5:00). É para a equipe revisar o caminho inteiro sem assistir tudo.
 */
function decidirRapido(): boolean {
  try {
    const u = new URL(location.href)
    if (!u.searchParams.has('rapido')) return false
    const sim = u.searchParams.get('rapido') === '1'
    u.searchParams.delete('rapido')
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash)
    return sim
  } catch { return false }
}

export const quizRapido: boolean = typeof location === 'undefined' ? false : decidirRapido()
