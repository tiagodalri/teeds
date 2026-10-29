import { useState } from 'react'
import {
  atualizarPerfil, formatarCPF, formatarTelefone, recuperarSenha, telefoneValido, trocarSenha,
  type SessaoTeeds, type Usuario,
} from '../core/teeds/conta'
import type { TradingAccount } from '../core/deriv/account'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'
import { dataCurta } from '../core/datas'

interface Props {
  sessao: SessaoTeeds
  onAtualizar: (u: Usuario) => void
  onFechar: () => void
  /** Contas Deriv conectadas nesta sessao, para a pessoa se enxergar inteira. */
  contas?: TradingAccount[]
  derivConectada?: boolean
  onConectarDeriv?: () => void
}

const iniciais = (nome: string, email: string) => {
  const p = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase()
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (email[0] ?? '?').toUpperCase()
}

const desde = (iso: string) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : dataCurta(d)
}

/** A conta da Teeds, por dentro. O que dá para mudar, muda aqui. */
export function ProfilePanel({ sessao, onAtualizar, onFechar, contas = [], derivConectada = false, onConectarDeriv }: Props) {
  const u = sessao.usuario
  const [nome, setNome] = useState(u.nome ?? '')
  const [telefone, setTelefone] = useState(formatarTelefone(u.telefone ?? ''))
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  // o retorno aparece embaixo do botão que a pessoa tocou, não no fim do painel
  const [onde, setOnde] = useState<'dados' | 'senha'>('dados')

  const mudouDados =
    nome.trim() !== (u.nome ?? '').trim() ||
    telefone.replace(/\D/g, '') !== (u.telefone ?? '')
  const dadosValidos = nome.trim().length >= 2 && telefoneValido(telefone)
  const senhaValida = senha.length >= 8 && senha === repetir

  async function salvarDados() {
    if (!dadosValidos || salvando) return
    setOnde('dados'); setSalvando(true); setErro(null); setRecado(null)
    try {
      onAtualizar(await atualizarPerfil(sessao.token, { nome, telefone }))
      setRecado('Dados atualizados.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  /*
    A troca por link de e-mail, pedida pelo Tiago em 30/09/2026.

    Trocar aqui mesmo continua valendo e é mais rápido. O link existe para
    quem está num computador que não é o seu, para quem prefere confirmar
    pelo e-mail, e para quem abriu esta tela sem lembrar a senha atual. Na
    tela do link a senha é digitada duas vezes, igual aqui.
  */
  async function pedirLinkDeSenha() {
    if (salvando) return
    setOnde('senha'); setSalvando(true); setErro(null); setRecado(null)
    try {
      await recuperarSenha(sessao.usuario.email)
      setRecado(`Link enviado para ${sessao.usuario.email}. Ele vale por uma hora.`)
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  async function salvarSenha() {
    if (!senhaValida || salvando) return
    setOnde('senha'); setSalvando(true); setErro(null); setRecado(null)
    try {
      await trocarSenha(sessao.token, senha)
      setSenha(''); setRepetir('')
      setRecado('Senha trocada.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const retorno = <>
    {erro && <div className="entrada-erro" role="alert">{erro}</div>}
    {recado && <div className="entrada-recado" role="status">{recado}</div>}
  </>

  return (
    <div className="qz-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="perfil" role="dialog" aria-modal="true" aria-label="Minha conta">
        <header className="perfil-topo">
          <span className="avatar grande">{iniciais(u.nome ?? '', u.email)}</span>
          <div>
            <b>{u.nome || u.email}</b>
            <span>{u.email}</span>
          </div>
          <button className="qz-fechar" onClick={onFechar} aria-label="Fechar"><IconeFechar /></button>
        </header>

        <div className="perfil-corpo">
          <section>
            <span className="rot">Seus dados</span>
            <label>
              <span className="rot">Nome completo</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
            </label>
            <label>
              <span className="rot">Telefone com DDD</span>
              <input value={telefone} inputMode="numeric" autoComplete="tel"
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))} />
            </label>
            <div className="perfil-fixo">
              <div><span className="rot">CPF</span><b>{u.cpf ? formatarCPF(u.cpf) : '—'}</b></div>
              <div><span className="rot">Cliente desde</span><b>{desde(u.criadoEm) ?? '—'}</b></div>
            </div>
            <p className="perfil-nota">
              CPF e e-mail não mudam por aqui. Para corrigir, fale com o suporte.
            </p>
            <button className="perfil-btn" disabled={!mudouDados || !dadosValidos || salvando}
              onClick={salvarDados}>
              {salvando && onde === 'dados' ? 'Salvando…' : 'Salvar dados'}
            </button>
            {onde === 'dados' && retorno}
          </section>

          <div className="perfil-linha" />

          <section>
            <span className="rot">Sua corretora</span>
            {derivConectada && contas.length > 0 ? (
              <div className="perfil-contas">
                {contas.map((c) => (
                  <div key={c.accountId} className="perfil-conta">
                    <i className={c.type === 'demo' ? 'demo' : 'real'}>
                      {c.type === 'demo' ? 'demo' : 'real'}
                    </i>
                    <b>{c.accountId}</b>
                    <span>
                      {c.currency}{' '}
                      {c.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="perfil-contas">
                <p className="perfil-nota">
                  Nenhuma conta Deriv conectada agora. É ela que compra e vende —
                  a conta {MARCA.prosa} só abre a plataforma.
                </p>
                {onConectarDeriv && (
                  <button className="perfil-btn" onClick={onConectarDeriv}>Conectar minha Deriv</button>
                )}
              </div>
            )}
          </section>

          <div className="perfil-linha" />

          <section>
            <span className="rot">Trocar a senha</span>
            <label>
              <span className="rot">Nova senha</span>
              <input type="password" value={senha} autoComplete="new-password"
                placeholder="Pelo menos 8 caracteres"
                onChange={(e) => setSenha(e.target.value)} />
            </label>
            <label>
              <span className="rot">Repita a senha</span>
              <input type="password" value={repetir} autoComplete="new-password"
                onChange={(e) => setRepetir(e.target.value)} />
            </label>
            {repetir.length > 0 && senha !== repetir && (
              <p className="perfil-erro">As duas senhas não são iguais.</p>
            )}
            <button className="perfil-btn" disabled={!senhaValida || salvando} onClick={salvarSenha}>
              {salvando && onde === 'senha' ? 'Salvando…' : 'Trocar senha'}
            </button>
            <p className="perfil-ou">ou</p>
            <button className="perfil-btn secundario" disabled={salvando} onClick={pedirLinkDeSenha}>
              Receber um link por e-mail
            </button>
            <p className="entrada-mini">
              O link chega em {sessao.usuario.email}, vale por uma hora e abre a tela
              de criar a nova senha, com a confirmação.
            </p>
            {onde === 'senha' && retorno}
          </section>
        </div>
      </div>
    </div>
  )
}
