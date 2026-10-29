import { useState } from 'react'
import { Brand } from './Brand'

interface Props {
  ocupado: boolean
  erro?: string | null
  onDefinir: (senha: string) => Promise<boolean>
  /** Entrou com senha provisória: a troca é o primeiro passo, não um link de e-mail. */
  obrigatoria?: boolean
  onSair?: () => void
}

/**
 * Só sai daqui com uma senha nova. Serve a dois casos: quem chegou pelo link
 * de "esqueci a senha" e quem entrou com a senha provisória que recebeu.
 */
export function NovaSenha({ ocupado, erro, onDefinir, obrigatoria = false, onSair }: Props) {
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  // o aviso aparece ao sair do campo ou ao tentar salvar, não na primeira letra (29/10/2026)
  const [tocado, setTocado] = useState({ senha: false, repetir: false })

  // o mesmo mínimo do cadastro (8)
  const curta = senha.length < 8
  const diferente = senha !== repetir
  const valido = !curta && !diferente
  const erroSenha = tocado.senha && curta ? 'A senha precisa de pelo menos 8 caracteres.' : null
  const erroRepetir = tocado.repetir && !curta && diferente ? 'As duas senhas não são iguais.' : null

  return (
    <div className="entrada" data-modo="senha">
      <div className="entrada-caixa entrada-caixa-esquerda">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={44} /></div>
        </header>
        <div className="entrada-cabecalho">
          <h1>{obrigatoria ? 'Crie a sua senha.' : 'Escolha uma senha nova.'}</h1>
          <p className="entrada-linha">
            {obrigatoria
              ? 'Você entrou com uma senha provisória. Por segurança, escolha agora a senha que vai usar daqui para frente.'
              : 'Defina a senha que você vai usar daqui para frente.'}
          </p>
        </div>

        <form className="entrada-form" noValidate onSubmit={(e) => {
          e.preventDefault()
          setTocado({ senha: true, repetir: true })
          if (valido && !ocupado) void onDefinir(senha)
        }}>
          <label className={erroSenha ? 'ruim' : ''}>
            <span className="rot">Nova senha</span>
            <input type="password" autoFocus value={senha} autoComplete="new-password" aria-invalid={!!erroSenha}
              onChange={(e) => setSenha(e.target.value)} onBlur={() => setTocado((t) => ({ ...t, senha: true }))}
              placeholder="Pelo menos 8 caracteres" />
            {erroSenha && <em role="alert">{erroSenha}</em>}
          </label>
          <label className={erroRepetir ? 'ruim' : ''}>
            <span className="rot">Repita a senha</span>
            <input type="password" value={repetir} autoComplete="new-password" aria-invalid={!!erroRepetir}
              onChange={(e) => setRepetir(e.target.value)} onBlur={() => setTocado((t) => ({ ...t, repetir: true }))}
              placeholder="Digite a mesma senha" />
            {erroRepetir && <em role="alert">{erroRepetir}</em>}
          </label>
          <button className="entrada-btn" type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar e entrar'}
          </button>
        </form>

        {erro && <div className="entrada-erro" role="alert">{erro}</div>}
        {onSair && (
          <button type="button" className="entrada-sair" onClick={onSair} disabled={ocupado}>
            {obrigatoria ? 'Sair e fazer isso depois' : 'Voltar para a tela de entrada'}
          </button>
        )}
      </div>
    </div>
  )
}
