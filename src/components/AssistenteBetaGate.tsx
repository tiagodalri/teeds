import { FormEvent, useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'

interface Props {
  onFechar: () => void
  onLiberar: () => void
}

// SHA-256 do código temporário. O número não fica escrito no bundle.
const CODIGO_BETA = '9512bf296630de4d2cc57bfd35707a8abaec9afd9a88dfd34a5c8353ec350cd3'

async function resumo(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('')
}

export function AssistenteBetaGate({ onFechar, onLiberar }: Props) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campo.current?.focus()
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onFechar])

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) { setErro('Digite o código de acesso.'); return }
    setConferindo(true)
    setErro('')
    try {
      if (await resumo(codigo.trim()) !== CODIGO_BETA) {
        setErro('Código incorreto. Confira e tente novamente.')
        setCodigo('')
        requestAnimationFrame(() => campo.current?.focus())
        return
      }
      onLiberar()
    } finally {
      setConferindo(false)
    }
  }

  return <div className="beta-fundo" role="presentation" onMouseDown={onFechar}>
    <section className="beta-modal" role="dialog" aria-modal="true" aria-labelledby="beta-titulo" onMouseDown={(e) => e.stopPropagation()}>
      <button className="beta-fechar" onClick={onFechar} aria-label="Fechar">×</button>
      <div className="beta-marca"><Brand tamanho={38} /></div>
      <span className="beta-selo">BETA · ACESSO RESTRITO</span>
      <h2 id="beta-titulo">Assistente em fase de testes</h2>
      <p>Estamos liberando esta experiência para um grupo selecionado. Digite seu código para continuar.</p>
      <form onSubmit={entrar}>
        <label htmlFor="codigo-beta">Código de acesso</label>
        <div className={`beta-campo ${erro ? 'com-erro' : ''}`}>
          <span aria-hidden="true">⌘</span>
          <input ref={campo} id="codigo-beta" type="password" inputMode="numeric" autoComplete="one-time-code"
            value={codigo} maxLength={20} onChange={(e) => { setCodigo(e.target.value); setErro('') }}
            placeholder="Digite seu código" aria-describedby={erro ? 'beta-erro' : undefined} />
        </div>
        {erro && <small className="beta-erro" id="beta-erro" role="alert">{erro}</small>}
        <button className="beta-entrar" type="submit" disabled={conferindo}>
          <span>{conferindo ? 'Validando…' : 'Acessar Assistente'}</span><b>→</b>
        </button>
      </form>
      <small className="beta-nota">O código é fornecido apenas aos participantes autorizados.</small>
    </section>
  </div>
}
