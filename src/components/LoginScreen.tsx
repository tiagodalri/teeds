import { afiliadoDaDeriv } from '../core/rotas'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  formatarTelefone, telefoneValido, LINK_VENCIDO,
} from '../core/teeds/conta'
import { SENHA_NO_CADASTRO, type ContaDoCadastro, type DadosFilaEspera } from '../core/teeds/leads'
import { Brand } from './Brand'
import { DerivLogo, IconeSaida } from './DerivMarca'
import { MARCA, FAMILIA_GF } from '../marca'
import { abrirNoCadastro, abrirNoPrimeiroAcesso, paginaDeVenda } from '../core/teeds/entradaInicial'
import { paginaComQuiz } from '../core/teeds/quizDoTrafego'
import { vitrine } from '../core/teeds/parceiro'
import { CenaDoLogin, type VarianteDaCena } from './entrada/CenaDoLogin'
import { marcarEmbarque } from '../core/decolagem'
import { marcarAceiteNoLogin } from '../core/teeds/termos'
import { biometriaDisponivel, biometriaLigadaAqui, rotuloDaBiometria } from '../core/teeds/biometria'
import { prepararGoogle } from '../core/teeds/google'
import './entrada/login.css'

// 11/11/2026: na GlobalFly o cadastro abre com a escolha do plano (peça própria, só baixa nessa marca)
const CadastroComPlanos = lazy(() => import('./entrada/CadastroComPlanos').then((m) => ({ default: m.CadastroComPlanos })))
// 16/11/2026: a /trafego (anúncios) começa pelo quiz; no fim, "Garantir minha vaga" abre os planos
const QuizDoTrafego = lazy(() => import('./entrada/QuizDoTrafego').then((m) => ({ default: m.QuizDoTrafego })))

type Modo = 'entrar' | 'criar' | 'esqueci' | 'primeiro'

interface Props {
  ocupado: boolean
  erro?: string | null
  limparErro: () => void
  onEntrar: (email: string, senha: string) => Promise<boolean>
  onCadastrar: (dados: DadosFilaEspera) => Promise<{ ok: boolean; conta?: ContaDoCadastro }>
  onEsqueci: (email: string) => Promise<boolean>
  /** Face ID / digital (27/10/2026): aparece quando este aparelho já foi ligado no perfil. */
  onEntrarComBiometria?: () => Promise<boolean>
  /** Entrar com Google (17/11/2026): só para quem já tem conta nesta marca. */
  onEntrarComGoogle?: () => Promise<boolean>
  /** Só no laboratório: força a versão da cena (nuvens ou rastro). */
  cena?: VarianteDaCena
}

// ícones dos campos e do olho da senha (traço de 1,8, como os do app)
const ICONES_DOS_CAMPOS: Record<string, string> = {
  email: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6 8.5-6',
  senha: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3M12 14.5v2.5',
  repetir: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3M9.5 15.5l1.8 1.8 3.2-3.6',
  nome: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  telefone: 'M8 3h8v18H8zM11 18h2',
}
const OLHO = 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z'
const OLHO_FECHADO = 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a16 16 0 01-3.1 3.8M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 004.2 4.2'

const TEXTOS: Record<Modo, { titulo: string; linha: string; acao: string }> = {
  entrar: {
    // 29/10/2026: quem chega pela primeira vez também abre aqui; "Bem-vindo de volta" não servia para essa pessoa
    titulo: 'Entre na sua conta.',
    linha: `Use o e-mail e a senha do seu cadastro na ${MARCA.prosa}. A conexão com a corretora vem depois, lá dentro.`,
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Cadastro gratuito',
    linha: SENHA_NO_CADASTRO
      ? 'Deixe seus dados e crie a sua senha. Depois, é só entrar com o e-mail e essa senha.'
      : 'Deixe seus dados. Você não cria senha agora: em instantes chega no seu e-mail a senha provisória para entrar (confira também o Spam).',
    acao: 'Confirmar cadastro',
  },
  // 18/11/2026: quem se cadastrou sem senha cria a dela aqui, pelo link que chega no e-mail do cadastro
  primeiro: {
    titulo: 'Primeiro acesso',
    linha: 'Digite o e-mail que você usou no cadastro. Enviamos para ele um link para você criar a sua senha.',
    acao: 'Receber o link',
  },
  esqueci: {
    titulo: 'Esqueceu a senha?',
    linha: 'Informe o seu e-mail e enviamos um link para você criar uma senha nova.',
    acao: 'Enviar link',
  },
}

/** Os campos de cada modo, na ordem da tela (o primeiro com problema recebe o foco). */
const CAMPOS_DO_MODO: Record<Modo, string[]> = {
  entrar: ['email', 'senha'],
  criar: SENHA_NO_CADASTRO ? ['nome', 'email', 'telefone', 'senha', 'repetir'] : ['nome', 'email', 'telefone'],
  esqueci: ['email'],
  primeiro: ['email'],
}

const ehSenha = (chave: string) => chave === 'senha' || chave === 'repetir'
const nomeCompleto = (v: string) => v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2

export function LoginScreen({ ocupado, erro, limparErro, onEntrar, onCadastrar, onEsqueci, onEntrarComBiometria, onEntrarComGoogle, cena = MARCA.cenaLogin }: Props) {
  // o botão do Face ID só aparece no aparelho que já ligou a biometria no perfil
  const [comBiometria, setComBiometria] = useState(false)
  useEffect(() => {
    if (!onEntrarComBiometria || !biometriaLigadaAqui()) return
    let vivo = true
    void biometriaDisponivel().then((ok) => { if (vivo) setComBiometria(ok) })
    return () => { vivo = false }
  }, [onEntrarComBiometria])
  // o script do Google baixa já ao abrir a tela: no toque, a janelinha abre na hora (sem bloqueio de pop-up)
  useEffect(() => { if (onEntrarComGoogle) prepararGoogle().catch(() => { /* o toque tenta de novo */ }) }, [onEntrarComGoogle])
  // Link de campanha de cadastro ou /cadastre-se: abre direto no formulário.
  const [modo, setModo] = useState<Modo>(abrirNoCadastro ? 'criar' : abrirNoPrimeiroAcesso ? 'primeiro' : 'entrar')
  // o quiz só vale na /trafego de parceiro que já tem os vídeos (quizDoTrafego.ts); sem eles, direto aos planos
  const [quizDaVisita] = useState(() => (paginaDeVenda === 'trafego' ? paginaComQuiz() : null))
  const [quizFeito, setQuizFeito] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // cadastro (28/10/2026): a pessoa cria a senha e repete, para não errar a digitação
  const [repetir, setRepetir] = useState('')
  // Termos de uso (27/10/2026): a cada login a pessoa marca que concorda; o aceite vai para o banco ao entrar
  const [concordo, setConcordo] = useState(false)
  const [maior, setMaior] = useState(false)
  const pedeTermos = !!MARCA.termos
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [recado, setRecado] = useState<string | null>(null)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  // 29/10/2026: o botão principal não fica mais cinza sem explicação. Tocou com algo faltando,
  // a tela mostra o que falta em cada campo (inclusive os vazios) e leva o foco até lá.
  const [tentou, setTentou] = useState(false)

  const t = TEXTOS[modo]
  const linkVencido = erro === LINK_VENCIDO && modo === 'entrar'
  const marcar = (campo: string) => () => setTocado((x) => ({ ...x, [campo]: true }))

  /** O problema de cada campo; com `vazios`, campo em branco também conta (depois de tocar no botão). */
  const avaliar = (vazios: boolean): Record<string, string | null> => ({
    nome: !nome.trim() ? (vazios ? 'Escreva o nome e o sobrenome.' : null)
      : !nomeCompleto(nome) ? 'Escreva o nome e o sobrenome.' : null,
    email: !email.trim() ? (vazios ? 'Escreva o seu e-mail.' : null)
      : !email.includes('@') ? 'Esse e-mail não parece completo.' : null,
    senha: !senha ? (vazios ? (modo === 'criar' ? 'Crie uma senha com pelo menos 8 caracteres.' : 'Digite a sua senha.') : null)
      : modo === 'criar'
        ? (senha.length < 8 || !senha.trim() ? 'Pelo menos 8 caracteres.' : senha.length > 72 ? 'No máximo 72 caracteres.' : null)
        : (senha.length < 6 ? 'Pelo menos 6 caracteres.' : null),
    repetir: !repetir ? (vazios ? 'Repita a senha.' : null) : repetir !== senha ? 'As duas senhas não são iguais.' : null,
    telefone: !telefone ? (vazios ? 'Escreva o telefone com DDD.' : null)
      : !telefoneValido(telefone) ? 'DDD e número, 10 ou 11 dígitos.' : null,
  })
  const problemas = avaliar(tentou)
  const faltaAceite = modo === 'entrar' && pedeTermos && !(concordo && maior)

  const valido = modo === 'esqueci' || modo === 'primeiro'
    ? email.includes('@')
    : modo === 'entrar'
      ? email.includes('@') && senha.length >= 6 && !faltaAceite
      : nomeCompleto(nome) && email.includes('@') && telefoneValido(telefone)
        && (!SENHA_NO_CADASTRO || (senha.length >= 8 && senha.length <= 72 && !!senha.trim() && senha === repetir))

  /** Mostra tudo o que falta e põe o foco no primeiro ponto a corrigir. */
  function mostrarOQueFalta(soOAceite = false) {
    setTentou(true)
    const p = avaliar(true)
    const campos = soOAceite ? [] : CAMPOS_DO_MODO[modo]
    setTocado((x) => ({ ...x, ...Object.fromEntries(campos.map((c) => [c, true])) }))
    const primeiro = campos.find((c) => p[c])
    const alvo = primeiro
      ? document.getElementById(`entrada-${primeiro}`)
      : document.querySelector<HTMLInputElement>('.entrada-aceites input[type="checkbox"]:not(:checked)')
    alvo?.focus()
  }

  function trocarModo(m: Modo) {
    setSenha(''); setRepetir('')
    setModo(m); setRecado(null); setTocado({}); setTentou(false); setMostrarSenha(false); setCapsLock(false); limparErro()
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (ocupado) return
    if (!valido) { mostrarOQueFalta(); return }
    setRecado(null)
    if (modo === 'entrar') {
      // de onde o avião da decolagem sai (só a GlobalFly usa)
      marcarEmbarque((e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]'))
      if (pedeTermos) marcarAceiteNoLogin()
      await onEntrar(email, senha)
      return
    }
    if (modo === 'criar') {
      const r = await onCadastrar({ nome, email, telefone, consentiu: false, ...(SENHA_NO_CADASTRO ? { senha } : {}) })
      if (r.ok) {
        setSenha(''); setRepetir('')
        // a página de obrigado da GlobalFly diz como entrar conforme o que o servidor fez com a conta
        if (FAMILIA_GF) {
          try {
            const guardado = JSON.parse(localStorage.getItem('gf-captacao') || '{}')
            const dados = JSON.stringify({ ...guardado, nome: nome.trim().split(/\s+/)[0], conta: r.conta ?? 'provisoria', quando: Date.now() })
            localStorage.setItem('gf-captacao', dados); sessionStorage.setItem('gf-captacao', dados)
          } catch { /* sem armazenamento: a página mostra o texto geral */ }
        }
        // Reuse the landing confirmation, on this brand's own domain.
        // Only navigate after the server confirms receipt; no personal data in the URL.
        // na vitrine de um parceiro (/n), o obrigado dele: a comunidade do WhatsApp é a do parceiro
        const v = MARCA.parceiros?.length ? vitrine() : ''
        const obrigado = new URL(`${import.meta.env.BASE_URL}${v ? `${v}/` : ''}cadastro/obrigado/`, location.origin)
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          obrigado.searchParams.set('marca', MARCA.id)
        }
        location.assign(obrigado.href)
      }
      return
    }
    const ok = await onEsqueci(email)
    if (ok && modo === 'primeiro') { setRecado(`Pronto! Se ${email} tem cadastro, o link para criar a sua senha está a caminho. Abra o e-mail, toque no link e crie a senha. Não chegou em alguns minutos? Confira o Spam ou peça de novo (vale sempre o último link).`); return }
    if (ok) setRecado(`Se existir uma conta com ${email}, o link está a caminho. Use o e-mail mais recente: pedir de novo faz os links anteriores pararem de valer. Confira também o Spam.`)
  }

  const campo = (
    chave: string, rotulo: string, valor: string, aoMudar: (v: string) => void,
    extra: { tipo?: string; auto?: string; dica?: string; modo?: string } = {},
  ) => (
    <label className={tocado[chave] && problemas[chave] ? 'ruim' : ''}>
      <span className="rot" id={`entrada-${chave}-rotulo`}>{rotulo}</span>
      <span className={`entrada-campo ${ehSenha(chave) ? 'entrada-senha' : ''}`}>
      {ICONES_DOS_CAMPOS[chave] && <svg className="entrada-icone" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONES_DOS_CAMPOS[chave]} /></svg>}
      <input
        id={`entrada-${chave}`}
        aria-labelledby={`entrada-${chave}-rotulo`}
        type={ehSenha(chave) && mostrarSenha ? 'text' : extra.tipo ?? 'text'} value={valor} autoComplete={extra.auto}
        inputMode={extra.modo as any} placeholder={extra.dica}
        aria-invalid={Boolean(tocado[chave] && problemas[chave])}
        aria-describedby={tocado[chave] && problemas[chave] ? `entrada-${chave}-erro` : undefined}
        onKeyUp={ehSenha(chave) ? e => setCapsLock(e.getModifierState('CapsLock')) : undefined}
        onBlur={() => { marcar(chave)(); if (ehSenha(chave)) setCapsLock(false) }} onChange={(e) => aoMudar(e.target.value)} />
      {ehSenha(chave) && <button type="button" aria-controls={`entrada-${chave}`} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={mostrarSenha} onClick={() => setMostrarSenha(v => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mostrarSenha ? OLHO_FECHADO : OLHO} /></svg>
      </button>}
      </span>
      {ehSenha(chave) && capsLock && <span className="entrada-caps" role="status">Caps Lock ativado</span>}
      {tocado[chave] && problemas[chave] && <em id={`entrada-${chave}-erro`}>{problemas[chave]}</em>}
    </label>
  )

  if (MARCA.planosNoCadastro && modo === 'criar' && quizDaVisita && !quizFeito) {
    return (
      <Suspense fallback={<div className="entrada" />}>
        <QuizDoTrafego pagina={quizDaVisita} aoConcluir={() => { setQuizFeito(true); scrollTo(0, 0) }} />
      </Suspense>
    )
  }

  if (MARCA.planosNoCadastro && modo === 'criar') {
    return (
      <Suspense fallback={<div className="entrada" />}>
        <CadastroComPlanos ocupado={ocupado} erro={erro} limparErro={limparErro} onCadastrar={onCadastrar} aoEntrar={() => trocarModo('entrar')} />
      </Suspense>
    )
  }

  return (
    <div className={`entrada ${cena ? 'com-cena' : ''}`} data-modo={modo}>
      {cena && <CenaDoLogin variante={cena} />}
      <div className="entrada-aurora" aria-hidden="true" />
      <div className="entrada-grade" aria-hidden="true" />

      <div className="entrada-caixa">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={46} /></div>
          <div className="entrada-opera">
            <span>Opera com</span>
            <DerivLogo altura={15} />
          </div>
        </header>

        {/* 10/11/2026: link do e-mail já usado ou vencido. O aviso vem no topo (no pé ficava fora da vista no celular) */}
        {linkVencido && (
          <div className="entrada-link-vencido" role="alert">
            <b>Esse link já foi usado ou venceu</b>
            <p>Cada link para criar a senha vale uma única vez, por 1 hora, e só funciona o do último e-mail que você pediu.</p>
            <p>Já criou a senha nova? Entre abaixo com o seu e-mail e essa senha. Ainda não? Peça um link novo.</p>
            <button type="button" className="entrada-btn" onClick={() => trocarModo('esqueci')}>Pedir um link novo</button>
          </div>
        )}

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

          {modo === 'criar' && SENHA_NO_CADASTRO && campo('senha', 'Crie sua senha', senha, setSenha,
            { tipo: 'password', auto: 'new-password', dica: 'Pelo menos 8 caracteres' })}
          {modo === 'criar' && SENHA_NO_CADASTRO && campo('repetir', 'Repita a senha', repetir, setRepetir,
            { tipo: 'password', auto: 'new-password', dica: 'Digite a mesma senha' })}

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
            {tentou && faltaAceite && <p className="entrada-aceites-falta" role="alert">Marque as duas caixas para entrar.</p>}
          </div>}

          <button className="entrada-btn" type="submit" disabled={ocupado}>
            {ocupado ? 'Um instante…' : t.acao}
          </button>
          {modo === 'criar' && pedeTermos && (
            <p className="entrada-aviso-cadastro">
              Ao continuar, você concorda com os <a href={`${import.meta.env.BASE_URL}termos/`} target="_blank" rel="noopener">Termos de Uso</a> e a <a href={`${import.meta.env.BASE_URL}termos/#politica-de-privacidade`} target="_blank" rel="noopener">Política de Privacidade</a>.
            </p>
          )}
          {modo === 'entrar' && (comBiometria || onEntrarComGoogle) && <div className="entrada-ou" aria-hidden="true"><span>ou</span></div>}
          {modo === 'entrar' && comBiometria && (
            <button className="entrada-btn entrada-biometria" type="button" disabled={ocupado}
              onClick={async (e) => {
                if (faltaAceite) { mostrarOQueFalta(true); return }
                marcarEmbarque(e.currentTarget)
                if (pedeTermos) marcarAceiteNoLogin()
                await onEntrarComBiometria?.()
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0" /></svg>
              Entrar com {rotuloDaBiometria()}
            </button>
          )}
          {modo === 'entrar' && onEntrarComGoogle && (
            <button className="entrada-btn entrada-google" type="button" disabled={ocupado}
              onClick={async (e) => {
                if (faltaAceite) { mostrarOQueFalta(true); return }
                marcarEmbarque(e.currentTarget)
                if (pedeTermos) marcarAceiteNoLogin()
                await onEntrarComGoogle()
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="entrada-google-g">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 01-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0012 24z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 010-4.6V6.6h-4a12 12 0 000 10.8l4-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 001.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
              </svg>
              Entrar com Google
            </button>
          )}
          {/* 27/10/2026 (print do Tiago, "tudo socado"): um botão principal só; cadastro vira link, como nos grandes apps */}
          {modo === 'entrar' && <p className="entrada-cadastro">Fez o cadastro e ainda não tem senha? <button type="button" disabled={ocupado} onClick={() => trocarModo('primeiro')}>Primeiro acesso</button></p>}
          {modo === 'entrar' && <p className="entrada-cadastro">Ainda não tem conta? <button type="button" disabled={ocupado} onClick={() => trocarModo('criar')}>Cadastre-se</button></p>}
        </form>

        {erro && !linkVencido && <div className="entrada-erro" role="alert">{erro}</div>}
        {recado && <div className="entrada-recado" role="status">{recado}</div>}

        {modo !== 'entrar' && <p className="entrada-cadastro entrada-voltar">Já tem conta? <button type="button" onClick={() => trocarModo('entrar')}>Entrar</button></p>}

        {/* 27/10/2026: o cartão da Deriv enxuto e todo clicável (antes: título, texto e um botão a mais) */}
        <a className="entrada-corretora" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">
          <span className="corretora-topo">
            <DerivLogo altura={20} />
            <span className="corretora-selo">Corretora oficial</span>
          </span>
          <span className="corretora-texto">
            <b>Ainda não tem conta na Deriv?</b>
            <span>Abra grátis, direto no site da Deriv. Seu dinheiro fica na corretora, no seu nome.</span>
          </span>
          <span className="corretora-ir" aria-hidden="true"><IconeSaida tamanho={16} /></span>
        </a>

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
