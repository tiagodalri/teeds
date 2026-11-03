/**
 * A escolha da comunidade (03/11/2026, Tiago: "quando a pessoa clicar em entrar na comunidade,
 * abrir um modalzinho com os dois links, da comunidade do WhatsApp e da comunidade do Instagram,
 * identificados com o logotipo de cada um").
 *
 * `useComunidade()` devolve o que o botão chama e a janela para pôr na tela. Sem o link do
 * Instagram configurado (MARCA.comunidadeInstagram), o botão segue abrindo o WhatsApp direto,
 * como antes. Os links são os do parceiro da vitrine (/n, /v) quando ele tiver os dele.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { comunidadeDaVitrine, comunidadeInstagramDaVitrine } from '../../core/rotas'
import { MARCA } from '../../marca'
import { IconeFechar } from '../IconeFechar'
import './comunidade.css'

export const LogoWhatsApp = ({ tam = 28 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true">
    <path fill="#25D366" d="M16 2.7A13.2 13.2 0 004.6 22.6L2.8 29.2l6.8-1.8A13.2 13.2 0 1016 2.7z" />
    <path fill="#fff" d="M16 5a11 11 0 00-9.4 16.8l.3.4-1.1 4 4.1-1.1.4.2A11 11 0 1016 5zm6.4 15.5c-.3.8-1.6 1.5-2.3 1.6-.6.1-1.3.1-2.1-.1a19.4 19.4 0 01-1.9-.7 14.8 14.8 0 01-5.6-5 6.4 6.4 0 01-1.3-3.4 3.7 3.7 0 011.2-2.8 1.2 1.2 0 01.9-.4h.6c.2 0 .5 0 .7.6l1 2.4a.6.6 0 010 .6 2.4 2.4 0 01-.4.6l-.5.6c-.2.2-.4.4-.2.7a10 10 0 001.9 2.3 9.1 9.1 0 002.7 1.7c.3.2.5.1.7-.1l1-1.2c.2-.3.4-.3.7-.2l2.3 1.1c.3.2.6.2.6.4a2.9 2.9 0 01-.2 1.4z" />
  </svg>
)
export const LogoInstagram = ({ tam = 28 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <radialGradient id="cm-ig" cx="30%" cy="107%" r="150%">
        <stop offset="0" stopColor="#FDF497" /><stop offset=".05" stopColor="#FDF497" /><stop offset=".45" stopColor="#FD5949" />
        <stop offset=".6" stopColor="#D6249F" /><stop offset=".9" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#cm-ig)" />
    <rect x="8.5" y="8.5" width="15" height="15" rx="4.5" fill="none" stroke="#fff" strokeWidth="2.2" />
    <circle cx="16" cy="16" r="3.7" fill="none" stroke="#fff" strokeWidth="2.2" />
    <circle cx="21.2" cy="10.8" r="1.3" fill="#fff" />
  </svg>
)

function Janela({ fechar, whatsapp, instagram }: { fechar: () => void; whatsapp: string; instagram: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const fecharAgora = useRef(fechar); fecharAgora.current = fechar
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    caixa.current?.querySelector<HTMLAnchorElement>('a')?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharAgora.current() }
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('keydown', tecla); antes?.focus?.() }
  }, [])
  const opcoes = [
    { id: 'whatsapp', href: whatsapp, logo: <LogoWhatsApp tam={34} />, nome: 'Comunidade no WhatsApp', texto: 'Avisos da equipe e a agenda das transmissões, direto no seu celular.' },
    { id: 'instagram', href: instagram, logo: <LogoInstagram tam={34} />, nome: 'Comunidade no Instagram', texto: 'O canal oficial, com os bastidores e as novidades da plataforma.' },
  ]
  // direto no body: o banner e os cartões têm transform e cortariam a janela
  return createPortal(
    <div className="cm-fundo" onMouseDown={fechar}>
      <div className="cm-janela" role="dialog" aria-modal="true" aria-labelledby="cm-titulo" ref={caixa} onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="cm-fechar" onClick={fechar} aria-label="Fechar"><IconeFechar /></button>
        <h2 id="cm-titulo">Entre na comunidade {MARCA.prosa}</h2>
        <p>Escolha onde quer acompanhar. Pode entrar nas duas.</p>
        <div className="cm-opcoes">
          {opcoes.map((o) => (
            <a key={o.id} className={`cm-opcao ${o.id}`} href={o.href} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(fechar, 150)}>
              <span className="cm-logo">{o.logo}</span>
              <span className="cm-texto"><b>{o.nome}</b><small>{o.texto}</small></span>
              <span className="cm-ir" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg></span>
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** O botão chama `abrir`; `janela` vai em qualquer lugar da tela. `escolha` diz se há as duas comunidades. */
export function useComunidade(): { abrir: () => void; janela: ReactNode; escolha: boolean } {
  const [aberta, setAberta] = useState(false)
  const whatsapp = comunidadeDaVitrine(), instagram = comunidadeInstagramDaVitrine()
  const escolha = !!whatsapp && !!instagram
  const abrir = () => {
    if (escolha) setAberta(true)
    else { const so = whatsapp ?? instagram; if (so) window.open(so, '_blank', 'noopener') }
  }
  return { abrir, escolha, janela: aberta && escolha ? <Janela fechar={() => setAberta(false)} whatsapp={whatsapp!} instagram={instagram!} /> : null }
}
