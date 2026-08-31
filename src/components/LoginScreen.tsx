import { useState } from 'react'
import { AFILIADO } from '../core/deriv/config'
import { Brand } from './Brand'

type Modo = 'entrar' | 'criar' | 'esqueci'

interface Props {
  ocupado: boolean
  erro?: string | null
  limparErro: () => void
  onEntrar: (email: string, senha: string) => Promise<boolean>
  onCadastrar: (email: string, senha: string, nome: string) => Promise<{ ok: boolean; confirmar: boolean }>
  onEsqueci: (email: string) => Promise<boolean>
}

const TEXTOS: Record<Modo, { titulo: string; linha: string; acao: string }> = {
  entrar: {
    titulo: 'Bem-vindo de volta.',
    linha: 'Entre na sua conta Teeds. A conexão com a corretora vem depois, lá dentro.',
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Crie a sua conta Teeds.',
    linha: 'É a conta da plataforma. A conta da Deriv, onde o dinheiro fica, é separada.',
    acao: 'Criar conta',
  },
  esqueci: {
    titulo: 'Esqueceu a senha?',
    linha: 'Diga o seu e-mail e mandamos um link para você criar uma nova.',
    acao: 'Enviar link',
  },
}

export function LoginScreen({ ocupado, erro, limparErro, onEntrar, onCadastrar, onEsqueci }: Props) {
  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [recado, setRecado] = useState<string | null>(null)

  const t = TEXTOS[modo]
  const valido = modo === 'esqueci'
    ? email.includes('@')
    : email.includes('@') && senha.length >= 6 && (modo === 'entrar' || nome.trim().length >= 2)

  function trocarModo(m: Modo) {
    setModo(m); setRecado(null); limparErro()
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || ocupado) return
    setRecado(null)
    if (modo === 'entrar') {
      await onEntrar(email, senha)
      return
    }
    if (modo === 'criar') {
      const r = await onCadastrar(email, senha, nome)
      if (r.ok && r.confirmar) {
        setRecado(`Conta criada. Confirme o e-mail que enviamos para ${email} e depois entre.`)
        setModo('entrar')
      }
      return
    }
    const ok = await onEsqueci(email)
    if (ok) setRecado(`Se existir uma conta com ${email}, o link está a caminho.`)
  }

  return (
    <div className="entrada">
      <div className="entrada-caixa">
        <div className="entrada-marca"><Brand tamanho={44} /></div>

        <h1>{t.titulo}</h1>
        <p className="entrada-linha">{t.linha}</p>

        <form className="entrada-form" onSubmit={enviar}>
          {modo === 'criar' && (
            <label>
              <span className="rot">Como quer ser chamado</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)}
                autoComplete="name" placeholder="Seu nome" />
            </label>
          )}

          <label>
            <span className="rot">E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="voce@email.com" />
          </label>

          {modo !== 'esqueci' && (
            <label>
              <span className="rot">Senha</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                placeholder={modo === 'criar' ? 'pelo menos 6 caracteres' : '••••••••'} />
            </label>
          )}

          <button className="entrada-btn" type="submit" disabled={!valido || ocupado}>
            {ocupado ? 'um instante…' : t.acao}
          </button>
        </form>

        {erro && <div className="entrada-erro">{erro}</div>}
        {recado && <div className="entrada-recado">{recado}</div>}

        <div className="entrada-troca">
          {modo === 'entrar' && (
            <>
              <button onClick={() => trocarModo('criar')}>Criar uma conta</button>
              <span>·</span>
              <button onClick={() => trocarModo('esqueci')}>Esqueci a senha</button>
            </>
          )}
          {modo !== 'entrar' && (
            <button onClick={() => trocarModo('entrar')}>Já tenho conta — entrar</button>
          )}
        </div>

        <div className="entrada-corretora">
          <b>Ainda não tem conta na Deriv?</b>
          <p>
            A Teeds opera pela sua própria conta na corretora — é lá que o
            dinheiro fica. Abrir é grátis e você começa na conta demo.
          </p>
          <a href={AFILIADO} target="_blank" rel="noopener noreferrer">
            Abrir conta na Deriv
          </a>
        </div>

        <p className="entrada-rodape">
          Negociar envolve risco de perda. Opere só o que você pode perder,
          e comece pela conta demo.
        </p>
      </div>
    </div>
  )
}
