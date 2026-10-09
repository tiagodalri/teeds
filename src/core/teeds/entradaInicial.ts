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
