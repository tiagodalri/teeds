import { useEffect, useState } from 'react'
import { MARCA } from '../../marca'
import { emAppInstalado } from '../../core/deriv/auth'
import './escolher-conta-deriv.css'

/**
 * Depois de um "Desconectar" de propósito, o Conectar pergunta qual conta
 * (04/11/2026, ver useAccount). A Deriv lembra o último login no site dela e
 * entra sozinha; para entrar com outra conta, a pessoa sai lá (o botão Sair
 * do painel da Deriv) e volta aqui: aí a Deriv mostra o e-mail e a senha.
 */
const PAINEL_DA_DERIV = 'https://home.deriv.com/dashboard'

export function EscolherContaDeriv({ aoContinuar, aoFechar }: { aoContinuar: () => void; aoFechar: () => void }) {
  const [passo, setPasso] = useState<'escolha' | 'sair'>('escolha')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])

  const abrirParaSair = () => {
    // no computador, a mesma janela que depois vira o login (mesmo nome: o Conectar reaproveita)
    const computador = !emAppInstalado() && typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches
    if (computador) {
      const w = 520, h = 760
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2))
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2))
      const j = window.open(PAINEL_DA_DERIV, `${MARCA.id}-deriv-login`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`)
      if (j) { setPasso('sair'); return }
    }
    window.open(PAINEL_DA_DERIV, '_blank', 'noopener')
    setPasso('sair')
  }

  return (
    <div className="ecd-fundo" onMouseDown={aoFechar}>
      <section className="ecd" role="dialog" aria-modal="true" aria-labelledby="ecd-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="ecd-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        {passo === 'escolha' ? <>
          <span className="ecd-rot">Conectar a corretora</span>
          <h2 id="ecd-titulo">Com qual conta da Deriv?</h2>
          <p>Você desconectou a corretora. A Deriv lembra o último login, então dá para voltar direto ou entrar com outra conta.</p>
          <div className="ecd-opcoes">
            <button type="button" className="ecd-opcao principal" onClick={aoContinuar}>
              <b>Continuar com a mesma conta</b>
              <small>Entra com o último login da Deriv neste aparelho, sem digitar nada.</small>
            </button>
            <button type="button" className="ecd-opcao" onClick={abrirParaSair}>
              <b>Entrar com outra conta</b>
              <small>Você sai da conta atual no site da Deriv e entra com o e-mail e a senha da outra.</small>
            </button>
          </div>
        </> : <>
          <span className="ecd-rot">Entrar com outra conta</span>
          <h2 id="ecd-titulo">Saia da conta atual na Deriv</h2>
          <ol className="ecd-passos">
            <li><b>Na janela da Deriv que abriu, toque no seu perfil e em "Log out" (Sair).</b><small>Se ela pedir login, você já está fora: pode seguir.</small></li>
            <li><b>Volte aqui e toque em "Já saí, entrar com outra conta".</b><small>A Deriv vai mostrar o e-mail e a senha. Entre com a conta que quiser.</small></li>
          </ol>
          <div className="ecd-acoes">
            <button type="button" className="ecd-btn" onClick={abrirParaSair}>Abrir a Deriv de novo</button>
            <button type="button" className="ecd-btn ouro" onClick={aoContinuar}>Já saí, entrar com outra conta</button>
          </div>
          <button type="button" className="ecd-voltar" onClick={() => setPasso('escolha')}>← Voltar</button>
        </>}
      </section>
    </div>
  )
}
