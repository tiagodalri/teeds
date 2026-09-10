import { MARCA } from '../marca'
// O desenho da assinatura mora no CSS do workspace; a marca traz o proprio
// estilo para nao depender de quem mais estiver na tela (login, modais).
import './workspace.css'

interface Props {
  tamanho?: number
  compacto?: boolean
  assinatura?: boolean
}

/**
 * A marca, com UM desenho só.
 *
 * Havia dois lockups: a assinatura da sidebar (touro original solto, Cinzel
 * 600, "TRADING PLATFORM") e um antigo, com o emblema dentro de uma placa
 * escura e a palavra mais pesada e espaçada, que aparecia no login, na nova
 * senha e no modal do assistente. Eram a mesma marca com duas caras. Agora
 * tudo usa a assinatura; `tamanho` escala o conjunto (a sidebar usa o
 * padrão), e `compacto` mostra só o símbolo.
 */
export function Brand({ tamanho, compacto = false, assinatura = false }: Props) {
  const escala = !assinatura && tamanho ? { ['--brand-tam' as string]: `${tamanho}px` } : undefined
  const simbolo = MARCA.id === 'teeds'
    ? <img className="brand-symbol brand-original" src={`${import.meta.env.BASE_URL}${MARCA.emblema}`} alt="" width="46" height="46" />
    : <svg className="brand-symbol" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <path d="M24 4l17 10v20L24 44 7 34V14zM24 4l9 15 8 15M7 14h18l16 20M7 34l9-15L24 4M24 44l-8-15-9-15M41 14L24 29 7 34M41 34H24L7 14" />
        </g>
      </svg>
  return (
    <div className={`brand-signature brand-signature-${MARCA.id} ${escala ? 'brand-escala' : ''}`} style={escala}>
      {simbolo}
      {!compacto && <span className="brand-wordmark">{MARCA.nome}<span>TRADING PLATFORM</span></span>}
    </div>
  )
}
