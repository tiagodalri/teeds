/**
 * Sair da lista em um clique.
 *
 * O Gmail e o Yahoo exigem isto de quem manda para muita gente, e a exigência
 * faz sentido: sem um jeito fácil de sair, quem não quer mais receber clica em
 * "marcar como spam". Um descadastro custa um endereço; uma reclamação de spam
 * custa a entrega de TODAS as próximas mensagens do domínio — inclusive a
 * senha provisória de quem acabou de se cadastrar.
 *
 * São duas portas, e as duas precisam existir:
 *
 *  - o cabeçalho `List-Unsubscribe` com `One-Click` (RFC 8058), que faz o
 *    Gmail desenhar o "Cancelar inscrição" ao lado do remetente. O clique vira
 *    um POST direto para cá, sem a pessoa sair da caixa de entrada;
 *  - um link no rodapé, para o cliente de e-mail que não desenha o botão.
 *
 * O endereço não viaja aberto no link. Vai um bilhete assinado com a chave do
 * servidor: sem a assinatura não dá para descadastrar ninguém, e ninguém
 * descobre o e-mail de outra pessoa mexendo na URL.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')

/** O endereço público do servidor, para o link caber dentro do e-mail. */
export const ENDERECO_DO_MOTOR = 'https://motor.teedscompany.com'

const assinar = (marca: string, email: string): string =>
  createHmac('sha256', segredo()).update(`descadastro:v1:${marca}:${email}`).digest('base64url').slice(0, 27)

/** O bilhete que vai no link: marca, e-mail e assinatura, em base64url. */
export function bilhete(marca: string, email: string): string {
  const limpo = email.trim().toLowerCase()
  return Buffer.from(`${marca}|${limpo}|${assinar(marca, limpo)}`, 'utf8').toString('base64url')
}

/** Abre o bilhete e confere a assinatura. Null quando não confere. */
export function abrirBilhete(t: string): { marca: string; email: string } | null {
  try {
    const [marca, email, assinatura] = Buffer.from(t, 'base64url').toString('utf8').split('|')
    if (!marca || !email || !assinatura) return null
    const esperada = Buffer.from(assinar(marca, email))
    const veio = Buffer.from(assinatura)
    // Comparação de tempo constante: uma comparação comum vaza, pelo tempo que
    // leva, quantos caracteres do começo já batiam.
    if (veio.length !== esperada.length || !timingSafeEqual(veio, esperada)) return null
    return { marca, email }
  } catch { return null }
}

/** O link do rodapé e do cabeçalho, para este e-mail e esta pessoa. */
export const linkDeDescadastro = (marca: string, email: string): string =>
  `${ENDERECO_DO_MOTOR}/publico/descadastrar?t=${bilhete(marca, email)}`

/**
 * Anota o pedido. Repetir não é erro: quem clica duas vezes continua fora.
 * Nunca lança — um descadastro que falha em silêncio é melhor que uma página
 * de erro na cara de quem só queria sair.
 */
export async function registrarDescadastro(marca: string, email: string, origem: string): Promise<boolean> {
  try {
    const r = await fetch(`${base()}/rest/v1/descadastros?on_conflict=marca,email`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: segredo(), Authorization: `Bearer ${segredo()}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ marca, email: email.trim().toLowerCase(), origem }),
    })
    return r.ok
  } catch { return false }
}

/** Quem já pediu para sair, para a campanha pular. */
export async function jaSairam(marca: string): Promise<Set<string>> {
  try {
    const r = await fetch(
      `${base()}/rest/v1/descadastros?select=email&marca=eq.${encodeURIComponent(marca)}`,
      { headers: { apikey: segredo(), Authorization: `Bearer ${segredo()}` }, signal: AbortSignal.timeout(20000) },
    )
    if (!r.ok) throw new Error('consulta recusada')
    return new Set(((await r.json()) as Array<{ email: string }>).map((l) => l.email.toLowerCase()))
  } catch {
    // Na dúvida, não manda: reenviar para quem pediu para sair é a falha que
    // não tem conserto. Um Set vazio faria o contrário, então avisa em alto e
    // bom som e deixa quem chamou decidir parar.
    throw new Error('Não consegui ler a lista de descadastros. Não envie sem ela.')
  }
}

/** A página que a pessoa vê depois de sair, quando o clique abre o navegador. */
export function paginaDeSaida(nomeDaMarca: string, email: string, ok: boolean): string {
  const seguro = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Inscrição cancelada</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ec;color:#1a2233;
font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px}
.caixa{max-width:44ch;padding:36px 32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.07);text-align:center}
h1{margin:0 0 12px;font-size:21px}p{margin:0;color:#5b6678;font-size:14.5px}b{color:#1a2233}</style></head>
<body><div class="caixa">
<h1>${ok ? 'Pronto, você saiu da lista' : 'Não consegui concluir agora'}</h1>
<p>${ok
    ? `O endereço <b>${seguro(email)}</b> não vai mais receber nossos e-mails. Se um dia mudar de ideia, é só se cadastrar de novo.`
    : 'Tente de novo daqui a alguns minutos, ou responda ao e-mail pedindo para sair que a gente tira na mão.'}</p>
</div></body></html>`
}
