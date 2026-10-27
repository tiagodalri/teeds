import { afiliadoDaDeriv } from '../core/rotas'
import { useEffect, useState } from 'react'
import {
  formatarTelefone, telefoneValido,
} from '../core/teeds/conta'
import type { DadosFilaEspera } from '../core/teeds/leads'
import { Brand } from './Brand'
import { DerivLogo, IconeSaida } from './DerivMarca'
import { MARCA } from '../marca'
import { abrirNoCadastro } from '../core/teeds/entradaInicial'
import { CenaDoLogin, type VarianteDaCena } from './entrada/CenaDoLogin'
import { marcarEmbarque } from '../core/decolagem'
import { marcarAceiteNoLogin } from '../core/teeds/termos'
import { biometriaDisponivel, biometriaLigadaAqui, rotuloDaBiometria } from '../core/teeds/biometria'

type Modo = 'entrar' | 'criar' | 'esqueci'

interface Props {
  ocupado: boolean
  erro?: string | null
  limparErro: () => void
  onEntrar: (email: string, senha: string) => Promise<boolean>
  onCadastrar: (dados: DadosFilaEspera) => Promise<{ ok: boolean }>
  onEsqueci: (email: string) => Promise<boolean>
  /** Face ID / digital (27/10/2026): aparece quando este aparelho já foi ligado no perfil. */
  onEntrarComBiometria?: () => Promise<boolean>
  /** Só no laboratório: força a versão da cena (nuvens ou rastro). */
  cena?: VarianteDaCena
}

const TEXTOS: Record<Modo, { titulo: string; linha: string; acao: string }> = {
  entrar: {
    titulo: 'Bem-vindo de volta.',
    linha: `Entre na sua conta ${MARCA.prosa}. A conexão com a corretora vem depois, lá dentro.`,
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Cadastro Gratuito',
    linha: 'Deixe seus dados. Após a aprovação, você receberá por e-mail sua senha provisória e as instruções de acesso.',
    acao: 'Confirmar Cadastro',
  },
  esqueci: {
    titulo: 'Esqueceu a senha?',
    linha: 'Diga o seu e-mail e mandamos um link para você criar uma nova.',
    acao: 'Enviar link',
  },
}

const nomeCompleto = (v: string) => v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2

export function LoginScreen({ ocupado, erro, limparErro, onEntrar, onCadastrar, onEsqueci, onEntrarComBiometria, cena = MARCA.cenaLogin }: Props) {
  // o botão do Face ID só aparece no aparelho que já ligou a biometria no perfil
  const [comBiometria, setComBiometria] = useState(false)
  useEffect(() => {
    if (!onEntrarComBiometria || !biometriaLigadaAqui()) return
    let vivo = true
    void biometriaDisponivel().then((ok) => { if (vivo) setComBiometria(ok) })
    return () => { vivo = false }
  }, [onEntrarComBiometria])
  // Link de campanha de cadastro ou /cadastre-se: abre direto no formulário.
  const [modo, setModo] = useState<Modo>(abrirNoCadastro ? 'criar' : 'entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // Termos de uso (27/10/2026): a cada login a pessoa marca que concorda; o aceite vai para o banco ao entrar
  const [concordo, setConcordo] = useState(false)
  const [maior, setMaior] = useState(false)
  const pedeTermos = !!MARCA.termos
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [recado, setRecado] = useState<string | null>(null)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  const t = TEXTOS[modo]
  const marcar = (campo: string) => () => setTocado((x) => ({ ...x, [campo]: true }))

  const problemas: Record<string, string | null> = {
    nome: nome && !nomeCompleto(nome) ? 'Escreva o nome e o sobrenome.' : null,
    email: email && !email.includes('@') ? 'Esse e-mail não parece completo.' : null,
    senha: senha && senha.length < 6 ? 'Pelo menos 6 caracteres.' : null,
    telefone: telefone && !telefoneValido(telefone) ? 'DDD e número, 10 ou 11 dígitos.' : null,
  }

  const valido = modo === 'esqueci'
    ? email.includes('@')
    : modo === 'entrar'
      ? email.includes('@') && senha.length >= 6 && (!pedeTermos || (concordo && maior))
      : nomeCompleto(nome) && email.includes('@') && telefoneValido(telefone)

  function trocarModo(m: Modo) {
    setSenha('')
    setModo(m); setRecado(null); setTocado({}); setMostrarSenha(false); setCapsLock(false); limparErro()
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || ocupado) return
    setRecado(null)
    if (modo === 'entrar') {
      // de onde o avião da decolagem sai (só a GlobalFly usa)
      marcarEmbarque((e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]'))
      if (pedeTermos) marcarAceiteNoLogin()
      await onEntrar(email, senha)
      return
    }
    if (modo === 'criar') {
      const r = await onCadastrar({ nome, email, telefone, consentiu: false })
      if (r.ok) {
        setSenha('')
        // Reuse the landing confirmation, on this brand's own domain.
        // Only navigate after the server confirms receipt; no personal data in the URL.
        const obrigado = new URL(`${import.meta.env.BASE_URL}cadastro/obrigado/`, location.origin)
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          obrigado.searchParams.set('marca', MARCA.id)
        }
        location.assign(obrigado.href)
      }
      return
    }
    const ok = await onEsqueci(email)
    if (ok) setRecado(`Se existir uma conta com ${email}, o link está a caminho.`)
  }

  const campo = (
    chave: string, rotulo: string, valor: string, aoMudar: (v: string) => void,
    extra: { tipo?: string; auto?: string; dica?: string; modo?: string } = {},
  ) => (
    <label className={tocado[chave] && problemas[chave] ? 'ruim' : ''}>
      <span className="rot" id={`entrada-${chave}-rotulo`}>{rotulo}</span>
      <span className={chave === 'senha' ? 'entrada-senha' : undefined}>
      <input
        id={`entrada-${chave}`}
        aria-labelledby={`entrada-${chave}-rotulo`}
        type={chave === 'senha' && mostrarSenha ? 'text' : extra.tipo ?? 'text'} value={valor} autoComplete={extra.auto}
        inputMode={extra.modo as any} placeholder={extra.dica}
        aria-invalid={Boolean(tocado[chave] && problemas[chave])}
        aria-describedby={tocado[chave] && problemas[chave] ? `entrada-${chave}-erro` : undefined}
        onKeyUp={chave === 'senha' ? e => setCapsLock(e.getModifierState('CapsLock')) : undefined}
        onBlur={() => { marcar(chave)(); if (chave === 'senha') setCapsLock(false) }} onChange={(e) => aoMudar(e.target.value)} />
      {chave === 'senha' && <button type="button" aria-controls="entrada-senha" aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={mostrarSenha} onClick={() => setMostrarSenha(v => !v)}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</button>}
      </span>
      {chave === 'senha' && capsLock && <span className="entrada-caps" role="status">Caps Lock ativado</span>}
      {tocado[chave] && problemas[chave] && <em id={`entrada-${chave}-erro`}>{problemas[chave]}</em>}
    </label>
  )

  return (
    <div className={`entrada ${cena ? 'com-cena' : ''}`} data-modo={modo}>
      {cena && <CenaDoLogin variante={cena} />}
      <div className="entrada-aurora" aria-hidden="true" />
      <div className="entrada-grade" aria-hidden="true" />

      <div className="entrada-caixa">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={46} /></div>
          <div className="entrada-opera">
            <span>opera com</span>
            <DerivLogo altura={15} />
          </div>
        </header>

        <div className="entrada-cabecalho">
          <h1>{t.titulo}</h1>
          <p className="entrada-linha">{t.linha}</p>
        </div>

        <form className="entrada-form" onSubmit={enviar} aria-busy={ocupado}>
          {modo === 'criar' && campo('nome', 'Nome completo', nome, setNome,
            { auto: 'name', dica: 'Como está no documento' })}

          {campo('email', 'E-mail', email, setEmail,
            { tipo: 'email', auto: 'email', dica: 'voce@email.com' })}

          {modo === 'criar' && campo('telefone', 'Telefone com DDD', telefone,
            (v) => setTelefone(formatarTelefone(v)),
            { auto: 'tel', tipo: 'tel', dica: '(11) 91234-5678' })}

          {modo === 'entrar' && campo('senha', 'Senha', senha, setSenha,
            { tipo: 'password', auto: 'current-password', dica: '••••••••' })}
          {modo === 'entrar' && <div className="entrada-esqueci"><button type="button" onClick={() => trocarModo('esqueci')}>Esqueci a senha</button></div>}

          {modo === 'entrar' && pedeTermos && <div className="entrada-aceites">
            <label className={`entrada-termos ${concordo ? 'ok' : ''}`}>
              <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} />
              <span>Li e concordo com os <a href={`${import.meta.env.BASE_URL}termos/`} target="_blank" rel="noopener">Termos de Uso</a> e a <a href={`${import.meta.env.BASE_URL}termos/#politica-de-privacidade`} target="_blank" rel="noopener">Política de Privacidade</a>.</span>
            </label>
            <label className={`entrada-termos ${maior ? 'ok' : ''}`}>
              <input type="checkbox" checked={maior} onChange={(e) => setMaior(e.target.checked)} />
              <span>Declaro ter 18 anos ou mais.</span>
            </label>
          </div>}

          <button className="entrada-btn" type="submit" disabled={!valido || ocupado}>
            {ocupado ? 'um instante…' : t.acao}
          </button>
          {modo === 'entrar' && comBiometria && (
            <button className="entrada-btn entrada-biometria" type="button" disabled={ocupado || (pedeTermos && !(concordo && maior))}
              onClick={async (e) => {
                marcarEmbarque(e.currentTarget)
                if (pedeTermos) marcarAceiteNoLogin()
                await onEntrarComBiometria?.()
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0" /></svg>
              Entrar com {rotuloDaBiometria()}
            </button>
          )}
          {/* 27/10/2026 (print do Tiago, "tudo socado"): um botão principal só; cadastro vira link, como nos grandes apps */}
          {modo === 'entrar' && <p className="entrada-cadastro">Ainda não tem conta? <button type="button" disabled={ocupado} onClick={() => trocarModo('criar')}>Cadastre-se</button></p>}
        </form>

        {erro && <div className="entrada-erro" role="alert">{erro}</div>}
        {recado && <div className="entrada-recado" role="status">{recado}</div>}

        {modo !== 'entrar' && <div className="entrada-troca">
          <button onClick={() => trocarModo('entrar')}>Já tenho conta: entrar</button>
        </div>}

        <div className="entrada-corretora">
          <div className="corretora-topo">
            <DerivLogo altura={22} />
            <span className="corretora-selo">corretora oficial</span>
          </div>
          <b>Abra sua conta gratuitamente.</b>
          <p>
            Seu dinheiro fica na corretora Deriv. Conecte sua conta à {MARCA.prosa}
            {' '}para operar pela plataforma.
          </p>
          <a className="btn-deriv" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">
            <span>Abrir conta na Deriv</span>
            <IconeSaida tamanho={16} />
          </a>
        </div>

        <div className="entrada-seguranca" aria-hidden="true">
          <span><IconeCadeado /> Conexão criptografada</span>
          <span className="entrada-seguranca-ponto" />
          <span><IconeEscudo /> Seus dados protegidos</span>
        </div>

        <p className="entrada-rodape">
          Negociar envolve riscos e, assim como os ganhos são reais, as perdas também são. Opere com responsabilidade.
        </p>
      </div>
    </div>
  )
}

function IconeCadeado() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7" rx="1.6" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
    </svg>
  )
}

function IconeEscudo() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.8 3 3.6v4.1c0 3 2.1 5 5 6.5 2.9-1.5 5-3.5 5-6.5V3.6L8 1.8Z" />
      <path d="m6 8 1.5 1.5L10.5 6.5" />
    </svg>
  )
}
