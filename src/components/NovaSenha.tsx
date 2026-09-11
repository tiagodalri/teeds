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

  const curta = senha.length > 0 && senha.length < 6
  const diferente = repetir.length > 0 && senha !== repetir
  const valido = senha.length >= 6 && senha === repetir

  return (
    <div className="entrada">
      <div className="entrada-caixa">
        <div className="entrada-marca"><Brand tamanho={44} /></div>
        <h1>{obrigatoria ? 'Crie a sua senha.' : 'Escolha uma senha nova.'}</h1>
        <p className="entrada-linha">
          {obrigatoria
            ? 'Você entrou com uma senha provisória. Por segurança, escolha agora a senha que vai usar daqui para frente.'
            : 'O link funcionou. Defina a senha que você vai usar daqui para frente.'}
        </p>

        <form className="entrada-form" onSubmit={(e) => { e.preventDefault(); if (valido) void onDefinir(senha) }}>
          <label>
            <span className="rot">Nova senha</span>
            <input type="password" autoFocus value={senha} autoComplete="new-password"
              onChange={(e) => setSenha(e.target.value)} placeholder="pelo menos 6 caracteres" />
          </label>
          <label>
            <span className="rot">Repita a senha</span>
            <input type="password" value={repetir} autoComplete="new-password"
              onChange={(e) => setRepetir(e.target.value)} placeholder="a mesma de cima" />
          </label>
          <button className="entrada-btn" type="submit" disabled={!valido || ocupado}>
            {ocupado ? 'salvando…' : 'Salvar e entrar'}
          </button>
        </form>

        {curta && <div className="entrada-erro">A senha precisa de pelo menos 6 caracteres.</div>}
        {diferente && <div className="entrada-erro">As duas senhas não são iguais.</div>}
        {erro && <div className="entrada-erro">{erro}</div>}
        {obrigatoria && onSair && (
          <button type="button" className="entrada-sair" onClick={onSair} disabled={ocupado}>Sair e fazer isso depois</button>
        )}
      </div>
    </div>
  )
}
