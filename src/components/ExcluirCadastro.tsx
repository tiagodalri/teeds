/**
 * Excluir um cadastro de vez (28/10/2026, Tiago: "eu devo conseguir excluir
 * qualquer usuário"). Só o admin geral vê o botão; a função `excluir-cadastro`
 * confere de novo. Para confirmar, digita-se o e-mail do cliente.
 */
import { useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SUPABASE } from '../core/teeds/config'
import { REDE } from '../core/teeds/clientes'
import { MARCAS } from '../marca/marcas'
import { IconeFechar } from './IconeFechar'
import './excluir-cadastro.css'

const semEtiqueta = (e: string) => e.trim().toLowerCase().replace(/\+marca-[a-z]+@/, '@')

export function ExcluirCadastro({ sessao, marca, cliente, fechar, excluido }: {
  sessao: SessaoTeeds
  /** a plataforma em foco no painel; REDE apaga o login de todas */
  marca: string
  cliente: { userId: string; nome: string | null; email: string | null }
  fechar: () => void
  excluido: (aviso: string) => void
}) {
  const [digitado, setDigitado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const email = semEtiqueta(cliente.email ?? '')
  const confere = !!email && semEtiqueta(digitado) === email
  const todas = marca === REDE
  const nomeDaMarca = MARCAS[marca]?.prosa ?? marca

  const excluir = async () => {
    if (!confere || ocupado) return
    setOcupado(true); setErro(null)
    try {
      const r = await fetch(`${SUPABASE.url}/functions/v1/excluir-cadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ marca: todas ? 'todas' : marca, user_id: cliente.userId, email: cliente.email, confirmacao: digitado }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro ?? 'Não deu certo agora. Tente de novo.')
      excluido(j.loginMantido
        ? `Cadastro de ${cliente.nome || email} excluído da ${nomeDaMarca}. O login continua só nas outras plataformas em que ele tem cadastro.`
        : `Cadastro de ${cliente.nome || email} excluído de vez.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu certo agora. Tente de novo.')
      setOcupado(false)
    }
  }

  return (
    <div className="adm-modal-fundo ec-fundo" onMouseDown={() => { if (!ocupado) fechar() }}>
      <section className="adm-modal ec-modal" role="alertdialog" aria-modal="true" aria-labelledby="ec-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h3 id="ec-titulo">Excluir cadastro</h3>
          <button type="button" aria-label="Fechar" disabled={ocupado} onClick={fechar}><IconeFechar /></button>
        </header>
        <div className="ec-corpo">
          <div className="ec-pessoa">
            <i>{(cliente.nome || email || '?')[0].toUpperCase()}</i>
            <span><b>{cliente.nome || 'Sem nome'}</b><small>{email}</small></span>
          </div>
          <p className="ec-aviso">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19L12 3zM12 10v4.5M12 17.5v.01" /></svg>
            <span>
              Apaga de vez {todas ? 'em todas as plataformas' : `na ${nomeDaMarca}`}: o login, a ficha, as operações, as contas da corretora ligadas,
              as conversas e os arquivos do suporte, o pedido de cadastro e o lead. <b>Não dá para desfazer.</b>
            </span>
          </p>
          <label className="ec-campo" htmlFor="ec-email">
            <span>Para confirmar, digite o e-mail do cliente</span>
            <input
              id="ec-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false}
              placeholder={email} value={digitado} disabled={ocupado} autoFocus
              onChange={(e) => { setDigitado(e.target.value); setErro(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void excluir() }}
            />
          </label>
          {erro && <p className="ec-erro" role="alert">{erro}</p>}
        </div>
        <footer>
          <button type="button" className="ec-voltar" disabled={ocupado} onClick={fechar}>Cancelar</button>
          <button type="button" className="ec-excluir" disabled={!confere || ocupado} onClick={() => void excluir()}>
            {ocupado ? 'Excluindo…' : 'Excluir de vez'}
          </button>
        </footer>
      </section>
    </div>
  )
}
