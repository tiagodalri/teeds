/**
 * O cadastro da GlobalFly com a escolha do plano (11/11/2026, Tiago: "como no ChatGPT, as
 * opções para escolher: o Gold gratuito, o Black e o Prestige, com os valores. Experiência
 * Vale do Silício, impactante e imersiva, no celular e no computador").
 *
 * Duas etapas na mesma tela:
 *  1. Planos: céu ao entardecer (canvas), o leque dos cartões de membro em 3D, os três
 *     painéis (carrossel no celular), a barra fixa com o plano escolhido, o comparativo,
 *     a conta do compartilhamento e as dúvidas. A cor do ambiente segue o plano.
 *  2. Dados: o cartão do plano grande, com o nome da pessoa gravado enquanto ela digita,
 *     e o formulário de sempre (nome, e-mail, telefone, senha). Gold vai para o obrigado,
 *     como antes; Black e Prestige vão para o checkout da Cakto do parceiro, com e-mail,
 *     nome e telefone já preenchidos (é o e-mail que liga a compra à conta).
 *
 * As cores moram em casca/globalfly/styles/cadastro-planos.css (fora da troca de paleta
 * do build, que puxaria o preto do Black para o marinho). Aqui não há cor escrita: o céu
 * lê as cores das variáveis do CSS. Prefixo das classes: cpl-.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MARCA } from '../../marca'
import { Brand } from '../Brand'
import { DerivLogo, IconeSaida } from '../DerivMarca'
import { afiliadoDaDeriv } from '../../core/rotas'
import { formatarTelefone, telefoneValido } from '../../core/teeds/conta'
import { SENHA_NO_CADASTRO, type ContaDoCadastro, type DadosFilaEspera } from '../../core/teeds/leads'
import { vitrine } from '../../core/teeds/parceiro'
import { comComprador } from '../../core/teeds/checkout'
import {
  PLANOS_PADRAO, IAS_DA_GF, carregarPlanosDoCadastro, checkoutDoPlano, temIA, simuladorLegivel, porcentagem,
  type IdDoPlano, type PlanoDoCadastro,
} from '../../core/teeds/planosDoCadastro'
import '../../casca/globalfly/styles/cadastro-planos.css'
import '../../casca/globalfly/styles/cadastro-como-funciona.css'
import '../../casca/globalfly/styles/cadastro-iphone.css'
import { ComoFunciona, MiniCartao, SimuladorDoLucro, useRevelar } from './SecoesDoCadastro'
import { eventoDoPixel } from '../../core/teeds/pixelDoParceiro'
import { acompanharCadastro, rastroDoCadastro } from '../../core/teeds/rastroDoCadastro'

interface Props {
  ocupado: boolean
  erro?: string | null
  limparErro: () => void
  onCadastrar: (dados: DadosFilaEspera) => Promise<{ ok: boolean; conta?: ContaDoCadastro }>
  /** "Já tem conta? Entrar": volta para a tela de entrar. */
  aoEntrar: () => void
}

const brl = (n: number) => n.toLocaleString('pt-BR')
const nomeCompleto = (v: string) => v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2
const CLASSE_DO_BOTAO: Record<IdDoPlano, string> = { gold: 'cpl-btn-linha', black: 'cpl-btn-ouro', prestige: 'cpl-btn-claro' }
const BOTAO: Record<IdDoPlano, string> = { gold: 'Começar no Gold', black: 'Quero o Black', prestige: 'Quero o Prestige' }
const calma = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const noCelular = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 960px)').matches

/** O plano pedido no endereço (?plano=black), para a equipe mandar o link já no plano certo. */
function planoDoEndereco(): IdDoPlano | null {
  try {
    const p = new URLSearchParams(location.search).get('plano')?.toLowerCase()
    return p === 'gold' || p === 'black' || p === 'prestige' ? p : null
  } catch { return null }
}

type Item = { sim: boolean; texto: React.ReactNode }
/** O que vem junto em cada plano, montado a partir do que está no editor. */
function itensDoPlano(p: PlanoDoCadastro): Item[] {
  const todas = p.ias == null
  const nomes = IAS_DA_GF.filter(([id]) => temIA(p, id)).map(([, n]) => n.replace('GF ', ''))
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0]
  const sim: Item[] = [
    { sim: true, texto: todas ? <><b>Todas as {IAS_DA_GF.length} I.A.</b>, com GF Gulf e Phenom</> : <><b>{nomes.length} I.A.</b>: GF {lista}</> },
    { sim: true, texto: p.simuladorHoras == null ? <>Simulador <b>ilimitado</b></> : <>Simulador <b>{simuladorLegivel(p.simuladorHoras)}</b></> },
    { sim: true, texto: p.salaExtra ? <>Aulas, sala ao vivo e <b>sala extra por dia</b></> : <>Aulas e sala ao vivo</> },
    { sim: true, texto: p.compartilhamento > 0 ? <>Compartilhamento de <b>{porcentagem(p.compartilhamento)}</b> do lucro do mês</> : <><b>0% de compartilhamento</b>: o lucro é todo seu</> },
  ]
  if (p.assessor) sim.push({ sim: true, texto: <><b>Assessor</b> só seu no WhatsApp</> })
  if (p.lab) sim.push({ sim: true, texto: <><b>GFT Lab</b> (beta)</> })
  const nao: Item[] = []
  if (!todas) nao.push({ sim: false, texto: 'GF Gulf e GF Phenom' })
  if (!p.salaExtra) nao.push({ sim: false, texto: 'Sala ao vivo extra' })
  if (!p.assessor) nao.push({ sim: false, texto: 'Assessor no WhatsApp' })
  if (!p.lab) nao.push({ sim: false, texto: 'GFT Lab (beta)' })
  return [...sim, ...nao].slice(0, 6)
}

function Icone({ nome }: { nome: 'ok' | 'no' | 'lock' | 'shield' | 'bolt' | 'user' | 'mail' | 'phone' | 'wave' | 'eye' | 'eye-off' | 'live' | 'manual' | 'aula' | 'livro' }) {
  const d: Record<string, React.ReactNode> = {
    ok: <><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".16" /><path d="M6 10.3l2.6 2.6L14.2 7.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></>,
    no: <path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
    lock: <><rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7 9V6.5a3 3 0 016 0V9" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
    shield: <><path d="M10 2.5l6 2.2v4.6c0 4-2.6 6.8-6 8.2-3.4-1.4-6-4.2-6-8.2V4.7z" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7.4 10l1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>,
    bolt: <path d="M11 2L4 11h5l-1 7 7-9h-5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
    user: <><circle cx="10" cy="7" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.8 17c.8-3 3.3-4.6 6.2-4.6s5.4 1.6 6.2 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
    mail: <><rect x="2.8" y="4.5" width="14.4" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 5.5l6.5 5 6.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
    phone: <><rect x="6" y="2.5" width="8" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
    wave: <path d="M7 6a6 6 0 010 8M10 4a9 9 0 010 12M13 2.5a12 12 0 010 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
    eye: <path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" fill="none" stroke="currentColor" strokeWidth="1.5" />,
    live: <><rect x="2.5" y="4.5" width="15" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="6.5" cy="8.5" r="1.6" fill="currentColor" /><path d="M9.5 12.5l2.2-2.4 2 1.6 2-2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>,
    manual: <><path d="M3 14l4-4 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 6h3v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>,
    aula: <><rect x="2.5" y="3.5" width="15" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8.5 6.6v4.3l3.6-2.15z" fill="currentColor" /><path d="M6 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
    livro: <><path d="M4 3.5h8.5a3 3 0 013 3V17H7a3 3 0 01-3-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M4 14a3 3 0 013-3h8.5M7.5 7h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
    'eye-off': <path d="M3 3l14 14M8.8 5.1A8 8 0 0110 5c5 0 8 5 8 5a13 13 0 01-2.6 3.2M5.5 5.6C3.3 7 2 10 2 10s3 5 8 5c1.3 0 2.5-.3 3.5-.8M8.2 8.2a2.5 2.5 0 003.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true">{d[nome]}</svg>
}

/** O cartão de membro do plano (frente). */
function Cartao({ p, titular, giro }: { p: PlanoDoCadastro; titular?: string; giro?: number }) {
  return (
    <div className="cpl-flutua">
      <div className={`cpl-face cpl-${p.id}`} key={giro}>
        <div className="cpl-l1"><span className="cpl-mono" aria-hidden="true" /><span className="cpl-chip" aria-hidden="true" /></div>
        <div className="cpl-meio"><span>GF •••• {new Date().getFullYear()}</span><Icone nome="wave" /></div>
        <div className="cpl-l3">
          <div><div className="cpl-nome-plano">{p.nome}</div><div className="cpl-sub">GF Member</div></div>
          <div className="cpl-titular"><small>Membro</small>{titular || 'Seu nome aqui'}</div>
        </div>
      </div>
    </div>
  )
}

/** Inclinação 3D do cartão e o reflexo que segue o mouse (só com mouse). */
function inclinar(e: React.PointerEvent, cartao: HTMLElement | null, forca = 16) {
  if (!cartao || e.pointerType !== 'mouse') return
  const r = cartao.getBoundingClientRect()
  const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5))
  const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5))
  cartao.style.setProperty('--ry', `${x * forca * 2}deg`)
  cartao.style.setProperty('--rx', `${-y * forca * 1.6}deg`)
  cartao.style.setProperty('--mx', `${(x + 0.5) * 100}%`)
  cartao.style.setProperty('--my', `${(y + 0.5) * 100}%`)
}
function endireitar(cartao: HTMLElement | null) {
  cartao?.style.setProperty('--ry', '0deg'); cartao?.style.setProperty('--rx', '0deg')
}

/** O céu do fundo: degradê do entardecer, estrelas, nuvens no horizonte e uma rota de voo. */
function useCeu(canvas: React.RefObject<HTMLCanvasElement>, ativo: React.MutableRefObject<boolean>) {
  useEffect(() => {
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    let W = 0, H = 0, quadro = 0
    let estrelas: Array<{ x: number; y: number; r: number; f: number; v: number }> = []
    let nuvens: Array<{ x: number; y: number; rx: number; ry: number; v: number; a: number; k: number }> = []
    const t0 = performance.now()
    const medir = () => {
      const d = Math.min(devicePixelRatio || 1, 2)
      W = cv.clientWidth; H = cv.clientHeight
      cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0)
      estrelas = Array.from({ length: Math.round((W * H) / 5200) }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.75, r: Math.random() * 1.2 + 0.2, f: Math.random() * 6.28, v: 0.6 + Math.random() * 1.4 }))
      nuvens = Array.from({ length: 16 }, (_, k) => ({ x: Math.random() * W, y: H * (0.8 + Math.random() * 0.18), rx: 140 + Math.random() * 260, ry: 18 + Math.random() * 30, v: 4 + Math.random() * 10, a: 0.05 + Math.random() * 0.09, k }))
    }
    const desenhar = (t: number) => {
      const css = getComputedStyle(cv)
      const cor = (n: string) => css.getPropertyValue(n).trim()
      const amb = cor('--cpl-amb'), ceu0 = cor('--cpl-ceu-0'), ceu1 = cor('--cpl-ceu-1'), ceu2 = cor('--cpl-ceu-2'), ceu3 = cor('--cpl-ceu-3'), luz = cor('--cpl-luz'), estrela = cor('--cpl-estrela'), nuvem = cor('--cpl-nuvem')
      const s = (t - t0) / 1000
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, ceu0); g.addColorStop(0.4, ceu1); g.addColorStop(0.72, ceu2); g.addColorStop(0.86, `rgba(${amb}, .5)`); g.addColorStop(0.91, ceu3); g.addColorStop(1, ceu0)
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      const sol = ctx.createRadialGradient(W * 0.66, H * 0.88, 0, W * 0.66, H * 0.88, Math.max(W, H) * 0.5)
      sol.addColorStop(0, `rgba(${amb}, .45)`); sol.addColorStop(0.4, `rgba(${amb}, .08)`); sol.addColorStop(1, 'transparent')
      ctx.fillStyle = sol; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = estrela
      for (const e of estrelas) { ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(e.f + s * e.v)); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.28); ctx.fill() }
      ctx.globalAlpha = 1
      for (const n of nuvens) {
        const x = ((n.x + s * n.v) % (W + n.rx * 2)) - n.rx
        const gr = ctx.createRadialGradient(x, n.y, 0, x, n.y, n.rx)
        gr.addColorStop(0, n.k % 3 ? `rgba(${nuvem}, ${n.a * 4})` : `rgba(${amb}, ${n.a})`); gr.addColorStop(1, 'transparent')
        ctx.save(); ctx.scale(1, n.ry / n.rx); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, (n.y * n.rx) / n.ry, n.rx, 0, 6.28); ctx.fill(); ctx.restore()
      }
      const ax = W * 0.04, ay = H * 0.9, bx = W * 0.98, by = H * 0.22, cx = W * 0.5, cy = -H * 0.05
      ctx.setLineDash([2, 8]); ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${amb}, .35)`
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke(); ctx.setLineDash([])
      const u = (s * 0.06) % 1
      const px = (1 - u) ** 2 * ax + 2 * (1 - u) * u * cx + u * u * bx, py = (1 - u) ** 2 * ay + 2 * (1 - u) * u * cy + u * u * by
      const pg = ctx.createRadialGradient(px, py, 0, px, py, 18); pg.addColorStop(0, `rgba(${amb}, .9)`); pg.addColorStop(1, 'transparent')
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 18, 0, 6.28); ctx.fill()
      ctx.fillStyle = luz; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 6.28); ctx.fill()
    }
    const passo = (t: number) => {
      if (ativo.current && !document.hidden) desenhar(t)
      quadro = requestAnimationFrame(passo)
    }
    const aoRedimensionar = () => { medir(); desenhar(performance.now()) }
    medir(); desenhar(performance.now())
    if (!calma()) quadro = requestAnimationFrame(passo)
    addEventListener('resize', aoRedimensionar)
    return () => { cancelAnimationFrame(quadro); removeEventListener('resize', aoRedimensionar) }
  }, [canvas, ativo])
}

export function CadastroComPlanos({ ocupado, erro, limparErro, onCadastrar, aoEntrar }: Props) {
  const [planos, setPlanos] = useState<PlanoDoCadastro[]>(PLANOS_PADRAO)
  useEffect(() => { let vivo = true; void carregarPlanosDoCadastro().then((p) => { if (vivo) setPlanos(p) }); return () => { vivo = false } }, [])

  const doEndereco = useMemo(planoDoEndereco, [])
  const [sel, setSel] = useState<IdDoPlano>(doEndereco ?? 'black')
  const [etapa, setEtapa] = useState<'planos' | 'dados'>(doEndereco ? 'dados' : 'planos')
  const plano = planos.find((p) => p.id === sel) ?? planos[0]
  const indice = planos.findIndex((p) => p.id === sel)

  // ---------- pixel do parceiro (/v e /n): cada passo da página vai para a Meta
  useEffect(() => { eventoDoPixel('ViewContent', { content_name: 'cadastro-planos' }, true) }, [])
  // a jornada na central de rastreio (os mesmos passos da landing antiga do /cadastro)
  useEffect(() => (raiz.current ? acompanharCadastro(raiz.current) : undefined), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (etapa !== 'dados') return
    rastroDoCadastro('formulario', { plano: sel }, undefined, '/dados')
    eventoDoPixel('ViewContent', { content_name: 'cadastro-formulario', plano: sel }, true)
  }, [etapa]) // eslint-disable-line react-hooks/exhaustive-deps
  const comecou = useRef(false)
  const aoComecar = () => {
    if (comecou.current) return
    comecou.current = true
    rastroDoCadastro('comecou', { plano: sel }, undefined, '/dados')
    eventoDoPixel('ComecouCadastro', { plano: sel }, true)
  }

  // ---------- rolagem: topo com vidro, véu sobre o céu e barra fixa
  const raiz = useRef<HTMLDivElement>(null)
  const heroi = useRef<HTMLElement>(null)
  const [rolou, setRolou] = useState(false)
  const [verBarra, setVerBarra] = useState(false)
  const ceuAtivo = useRef(true)
  useEffect(() => {
    const aoRolar = () => {
      const h = heroi.current?.offsetHeight ?? 700
      const veu = etapa === 'dados' ? 0.5 : Math.min(0.92, scrollY / (h * 0.9))
      raiz.current?.style.setProperty('--cpl-veu', veu.toFixed(3))
      ceuAtivo.current = veu < 0.9
      setRolou(scrollY > 10)
      setVerBarra(etapa === 'planos' && scrollY > h * 0.55)
    }
    aoRolar()
    addEventListener('scroll', aoRolar, { passive: true })
    return () => removeEventListener('scroll', aoRolar)
  }, [etapa])
  const canvas = useRef<HTMLCanvasElement>(null)
  useCeu(canvas, ceuAtivo)
  useRevelar(raiz, etapa)

  // ---------- voltar do formulário para os planos com o botão Voltar do navegador
  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => { if (!(e.state && e.state.cplDados)) setEtapa('planos') }
    addEventListener('popstate', aoVoltar)
    return () => removeEventListener('popstate', aoVoltar)
  }, [])
  function irParaDados(id: IdDoPlano) {
    eventoDoPixel('ClicouCadastrar', { plano: id }, true)
    rastroDoCadastro('clicou', { plano: id })
    setSel(id); setEtapa('dados'); limparErro()
    try { history.pushState({ ...(history.state ?? {}), cplDados: true }, '') } catch { /* sem histórico: segue */ }
    scrollTo({ top: 0, behavior: 'auto' })
  }
  function voltarAosPlanos() {
    if (history.state?.cplDados) history.back()
    else setEtapa('planos')
    scrollTo({ top: 0, behavior: 'auto' })
  }

  // ---------- carrossel do celular
  const carrossel = useRef<HTMLDivElement>(null)
  const centralizar = (id: IdDoPlano, suave = true) => {
    const c = carrossel.current, el = c?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!c || !el || !noCelular()) return
    c.scrollTo({ left: el.offsetLeft - (c.clientWidth - el.offsetWidth) / 2, behavior: suave && !calma() ? 'smooth' : 'auto' })
  }
  const selecionar = (id: IdDoPlano, origem: 'carrossel' | 'outro' = 'outro') => {
    setSel(id); if (origem !== 'carrossel') centralizar(id)
    eventoDoPixel('ViewContent', { content_name: `plano-${id}` }, true)
  }
  useEffect(() => { if (etapa === 'planos') centralizar(sel, false) }, [etapa]) // eslint-disable-line react-hooks/exhaustive-deps
  const espera = useRef<number>()
  const aoRolarCarrossel = () => {
    if (!noCelular()) return
    window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => {
      const c = carrossel.current; if (!c) return
      const meio = c.scrollLeft + c.clientWidth / 2
      let melhor: HTMLElement | null = null, dist = Infinity
      c.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - meio); if (d < dist) { dist = d; melhor = el } })
      const id = (melhor as HTMLElement | null)?.dataset.id as IdDoPlano | undefined
      if (id && id !== sel) selecionar(id, 'carrossel')
    }, 90)
  }

  // ---------- leque: deslizar o dedo troca o cartão
  const toque = useRef<number | null>(null)
  const frente = useRef<HTMLDivElement>(null)

  // ---------- conta do compartilhamento

  // ---------- formulário
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [tentou, setTentou] = useState(false)
  const [giro, setGiro] = useState(0)
  const cartaoGrande = useRef<HTMLDivElement>(null)
  const titular = nome.trim() ? nome.trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase() : ''

  const problemas: Record<string, string | null> = {
    nome: !nome.trim() ? (tentou ? 'Escreva o nome e o sobrenome.' : null) : !nomeCompleto(nome) ? 'Escreva o nome e o sobrenome.' : null,
    email: !email.trim() ? (tentou ? 'Escreva o seu e-mail.' : null) : !email.includes('@') ? 'Esse e-mail não parece completo.' : null,
    telefone: !telefone ? (tentou ? 'Escreva o telefone com DDD.' : null) : !telefoneValido(telefone) ? 'DDD e número, 10 ou 11 dígitos.' : null,
    senha: !SENHA_NO_CADASTRO ? null : !senha ? (tentou ? 'Crie uma senha com pelo menos 8 caracteres.' : null)
      : senha.length < 8 || !senha.trim() ? 'Pelo menos 8 caracteres.' : senha.length > 72 ? 'No máximo 72 caracteres.' : null,
    repetir: !SENHA_NO_CADASTRO ? null : !repetir ? (tentou ? 'Repita a senha.' : null) : repetir !== senha ? 'As duas senhas não são iguais.' : null,
  }
  const CAMPOS = SENHA_NO_CADASTRO ? ['nome', 'email', 'telefone', 'senha', 'repetir'] : ['nome', 'email', 'telefone']
  const valido = nomeCompleto(nome) && email.includes('@') && telefoneValido(telefone)
    && (!SENHA_NO_CADASTRO || (senha.length >= 8 && senha.length <= 72 && !!senha.trim() && senha === repetir))
  const forca = !senha ? 0 : Math.max(1, Number(senha.length >= 8) + Number(/[A-Z]/.test(senha)) + Number(/\d/.test(senha)) + Number(/[^A-Za-z0-9]/.test(senha)))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (ocupado) return
    if (!valido) {
      rastroDoCadastro('erro-campos', { campos: CAMPOS.filter((c) => problemas[c] || !({ nome, email, telefone, senha, repetir } as Record<string, string>)[c]).join(',') }, undefined, '/dados')
      setTentou(true)
      setTocado(Object.fromEntries(CAMPOS.map((c) => [c, true])))
      const primeiro = CAMPOS.find((c) => {
        if (c === 'nome') return !nomeCompleto(nome)
        if (c === 'email') return !email.includes('@')
        if (c === 'telefone') return !telefoneValido(telefone)
        if (c === 'senha') return senha.length < 8 || senha.length > 72 || !senha.trim()
        return repetir !== senha || !repetir
      })
      document.getElementById(`cpl-${primeiro}`)?.focus()
      return
    }
    rastroDoCadastro('enviou', { plano: plano.id }, undefined, '/dados')
    const r = await onCadastrar({ nome, email, telefone, consentiu: false, ...(SENHA_NO_CADASTRO ? { senha } : {}) })
    if (!r.ok) { rastroDoCadastro('erro-cadastro', { plano: plano.id }, undefined, '/dados'); return }
    rastroDoCadastro('cadastro', { conta: r.conta ?? 'provisoria', plano: plano.id }, email.trim().toLowerCase(), '/dados')
    setSenha(''); setRepetir(''); setGiro((g) => g + 1)
    // o obrigado da GlobalFly diz como entrar conforme o que o servidor fez com a conta
    try {
      const guardado = JSON.parse(localStorage.getItem('gf-captacao') || '{}')
      const dados = JSON.stringify({ ...guardado, nome: nome.trim().split(/\s+/)[0], conta: r.conta ?? 'provisoria', plano: plano.id, quando: Date.now() })
      localStorage.setItem('gf-captacao', dados); sessionStorage.setItem('gf-captacao', dados)
    } catch { /* sem armazenamento: a página mostra o texto geral */ }
    // Black e Prestige: direto para o pagamento, com os dados já preenchidos (o e-mail liga a compra à conta)
    const checkout = plano.preco > 0 ? checkoutDoPlano(plano) : null
    if (checkout) {
      rastroDoCadastro('checkout', { plano: plano.id }, undefined, '/dados')
      eventoDoPixel('InitiateCheckout', { value: plano.preco, currency: 'BRL', content_name: `gf-${plano.id}`, content_ids: [`gf-${plano.id}`], num_items: 1 }, true)
      const destino = comComprador(checkout, { email: email.trim().toLowerCase(), nome: nome.trim(), telefone })
      // um instante para o pixel enviar antes de trocar de página
      window.setTimeout(() => location.assign(destino), 400)
      return
    }
    // Gold: o obrigado de sempre (o do parceiro, na vitrine dele). Só depois de o servidor confirmar; nada pessoal no endereço.
    const v = MARCA.parceiros?.length ? vitrine() : ''
    const obrigado = new URL(`${import.meta.env.BASE_URL}${v ? `${v}/` : ''}cadastro/obrigado/`, location.origin)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') obrigado.searchParams.set('marca', MARCA.id)
    location.assign(obrigado.href)
  }

  const campo = (chave: string, rotulo: string, valor: string, aoMudar: (v: string) => void, icone: 'user' | 'mail' | 'phone' | 'lock',
    extra: { tipo?: string; auto?: string; dica?: string; modo?: React.HTMLAttributes<HTMLInputElement>['inputMode'] } = {}) => {
    const ruim = tocado[chave] && problemas[chave]
    const senhaCampo = chave === 'senha' || chave === 'repetir'
    return (
      <div className={`cpl-campo ${ruim ? 'cpl-ruim' : ''}`}>
        <label htmlFor={`cpl-${chave}`}>{rotulo}</label>
        <div className="cpl-entrada">
          <input id={`cpl-${chave}`} type={senhaCampo && verSenha ? 'text' : extra.tipo ?? 'text'} value={valor} autoComplete={extra.auto}
            inputMode={extra.modo} placeholder={extra.dica} aria-invalid={Boolean(ruim)} aria-describedby={ruim ? `cpl-${chave}-erro` : undefined}
            onBlur={() => setTocado((x) => ({ ...x, [chave]: true }))} onChange={(e) => aoMudar(e.target.value)} />
          <Icone nome={icone} />
          {senhaCampo && <button type="button" className="cpl-ver-senha" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={verSenha} onClick={() => setVerSenha((v) => !v)}><Icone nome={verSenha ? 'eye-off' : 'eye'} /></button>}
        </div>
        {ruim && <em id={`cpl-${chave}-erro`}>{problemas[chave]}</em>}
      </div>
    )
  }

  const abas = (extra = '') => (
    <div className={`cpl-abas ${extra}`} role="tablist" aria-label="Escolha o plano" data-sel={sel}>
      <span className="cpl-ind" style={{ transform: `translateX(${indice * 100}%)` }} />
      {planos.map((p) => <button key={p.id} type="button" role="tab" aria-selected={p.id === sel} onClick={() => selecionar(p.id)}>{p.nome}</button>)}
    </div>
  )
  const precoCurto = (p: PlanoDoCadastro) => (p.preco ? `R$ ${brl(p.preco)} por ano` : 'R$ 0 · aquisição zero')
  const continuarCom = (p: PlanoDoCadastro) => (p.preco ? `Continuar com o ${p.nome}` : 'Começar no Gold')

  return (
    <div className={`cpl cpl-sel-${sel}`} ref={raiz} style={{ ['--cpl-mono' as string]: `url(${import.meta.env.BASE_URL}globalfly-gf-escuro.png)` }}>
      <canvas className="cpl-ceu" ref={canvas} aria-hidden="true" />
      <div className="cpl-veu" aria-hidden="true" />
      <div className="cpl-ambiente" aria-hidden="true" />

      <header className={`cpl-topo cpl-faixa ${rolou ? 'cpl-cheio' : ''}`}>
        <div className="cpl-miolo">
          <div className="cpl-marca"><Brand tamanho={40} /></div>
          <button type="button" className="cpl-entrar" onClick={() => { eventoDoPixel('ClicouEntrar', undefined, true); aoEntrar() }}><span>Já tem conta?</span><b>Entrar</b></button>
        </div>
      </header>

      {etapa === 'planos' ? (
        <main>
          <section className="cpl-heroi cpl-faixa" ref={heroi}>
            <div className="cpl-miolo cpl-heroi-miolo">
              <div className="cpl-heroi-texto">
                <ol className="cpl-etapas" aria-label="Etapas do cadastro">
                  <li className="cpl-on"><i>1</i><span>Plano</span></li>
                  <li><i>2</i><span>Cadastro</span></li>
                  <li><i>3</i><span>Pagamento</span></li>
                </ol>
                <h1><span className="cpl-l"><span>Escolha como</span></span><span className="cpl-l"><span>você quer <em>voar.</em></span></span></h1>
                <p>I.A. que operam por você, operação manual, <b>salas ao vivo todos os dias</b> e um <b>curso completo com apostila</b>. Tudo isso em todos os planos; o que muda é quais I.A., quantas horas de simulador e quanto do lucro fica com você.</p>
                {abas('cpl-abas-pc')}
                <div className="cpl-confianca cpl-confianca-pc">
                  <span><Icone nome="lock" />Pagamento seguro</span>
                  <span><Icone nome="bolt" />Liberação automática</span>
                  <span><Icone nome="shield" />Mude de plano quando quiser</span>
                </div>
              </div>
              <div className="cpl-leque" aria-label="Cartões dos planos"
                onPointerMove={(e) => inclinar(e, frente.current, 9)} onPointerLeave={() => endireitar(frente.current)}
                onTouchStart={(e) => { toque.current = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  if (toque.current == null) return
                  const dx = e.changedTouches[0].clientX - toque.current; toque.current = null
                  if (Math.abs(dx) < 40) return
                  selecionar(planos[(indice + (dx < 0 ? 1 : planos.length - 1)) % planos.length].id)
                }}>
                <div className="cpl-brilho" />
                <div className="cpl-sombra" />
                {planos.map((p, j) => {
                  const pos = (j - indice + planos.length) % planos.length
                  return (
                    <div key={p.id} className="cpl-cartao" data-pos={pos} ref={pos === 0 ? frente : undefined}
                      role="button" tabIndex={0} aria-label={pos === 0 ? `Escolher o ${p.nome}` : `Ver o ${p.nome}`}
                      onClick={() => (pos === 0 ? irParaDados(p.id) : selecionar(p.id))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (pos === 0) irParaDados(p.id); else selecionar(p.id) } }}>
                      <Cartao p={p} />
                    </div>
                  )
                })}
              </div>
              {abas('cpl-abas-cel')}
              <div className="cpl-confianca cpl-confianca-cel">
                <span><Icone nome="lock" />Pagamento seguro</span>
                <span><Icone nome="bolt" />Liberação automática</span>
              </div>
            </div>
          </section>

          <section className="cpl-secao-planos cpl-faixa" aria-label="Planos">
            <div className="cpl-miolo">
              <div className="cpl-planos" ref={carrossel} onScroll={aoRolarCarrossel}>
                {planos.map((p) => (
                  <article key={p.id} data-id={p.id} className={`cpl-plano cpl-plano-${p.id} ${p.id === sel ? 'cpl-sel' : ''}`}
                    onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`) }}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('button') && !noCelular()) selecionar(p.id) }}>
                    {p.id === 'black' && <span className="cpl-selo">Recomendado</span>}
                    <div className="cpl-cab"><MiniCartao id={p.id} /><div><h2>{p.nome}</h2><small>GF Member</small></div></div>
                    <p className="cpl-chamada">{p.chamada}</p>
                    <div className="cpl-preco">
                      {p.referencia ? <span className="cpl-de">De <s>R$ {brl(p.referencia)}</s> por</span> : <span className="cpl-de">&nbsp;</span>}
                      <div className="cpl-valor"><span className="cpl-rs">R$</span><span className="cpl-v">{brl(p.preco)}</span>{p.preco > 0 && <span className="cpl-per">/ano</span>}</div>
                      <span className="cpl-nota">{p.preco ? 'Cartão em até 12x ou Pix' : <>Aquisição zero <span className="cpl-tag">Sem cartão</span></>}</span>
                    </div>
                    <button type="button" className={`cpl-btn ${CLASSE_DO_BOTAO[p.id]}`} onClick={() => irParaDados(p.id)}>{BOTAO[p.id]} <span className="cpl-seta" aria-hidden="true">→</span></button>
                    <ul className="cpl-inclui">
                      {itensDoPlano(p).map((it, k) => <li key={k} className={it.sim ? 'cpl-s' : 'cpl-n'}><Icone nome={it.sim ? 'ok' : 'no'} /><span>{it.texto}</span></li>)}
                    </ul>
                  </article>
                ))}
              </div>
              <div className="cpl-pontos">
                {planos.map((p) => <button key={p.id} type="button" aria-label={p.nome} aria-current={p.id === sel} onClick={() => selecionar(p.id)} />)}
              </div>
              <ul className="cpl-todos" aria-label="Em todos os planos">
                <li className="cpl-todos-rot">Em todos os planos</li>
                <li><Icone nome="live" />Salas ao vivo todos os dias</li>
                <li><Icone nome="manual" />Operação manual</li>
                <li><Icone nome="aula" />Curso completo em vídeo</li>
                <li><Icone nome="livro" />Apostila do aluno</li>
              </ul>
            </div>
          </section>

          <ComoFunciona aoQuerer={() => irParaDados(sel)} />

          <div className="cpl-faixa">
            <div className="cpl-miolo">
              <section className="cpl-secao" aria-labelledby="cpl-t-comparar">
                <div className="cpl-cab-secao cpl-revela"><span className="cpl-olho">Lado a lado</span><h2 id="cpl-t-comparar">Compare os planos</h2></div>
                <div className="cpl-tabela cpl-revela">
                  <table>
                    <thead><tr><th scope="col">Recurso</th>{planos.map((p) => <th key={p.id} scope="col" className={p.id === sel ? 'cpl-on' : ''}><span className="cpl-pil"><MiniCartao id={p.id} />{p.nome}</span></th>)}</tr></thead>
                    <tbody>
                      <tr className="cpl-grupo"><td colSpan={4}>Inteligências</td></tr>
                      {IAS_DA_GF.map(([id, n]) => <tr key={id}><td>{n}</td>{planos.map((p) => <td key={p.id} className={p.id === sel ? 'cpl-on' : ''}>{temIA(p, id) ? <span className="cpl-ok" aria-label="Incluída">✓</span> : <span className="cpl-no" aria-label="Não incluída">—</span>}</td>)}</tr>)}
                      <tr className="cpl-grupo"><td colSpan={4}>Treino e aulas</td></tr>
                      <tr><td>Simulador</td>{planos.map((p) => <td key={p.id} className={`cpl-forte ${p.id === sel ? 'cpl-on' : ''}`}>{simuladorLegivel(p.simuladorHoras)}</td>)}</tr>
                      <tr><td>Aulas e sala ao vivo</td>{planos.map((p) => <td key={p.id} className={p.id === sel ? 'cpl-on' : ''}><span className="cpl-ok" aria-label="Incluída">✓</span></td>)}</tr>
                      <tr><td>Sala ao vivo extra por dia</td>{planos.map((p) => <td key={p.id} className={p.id === sel ? 'cpl-on' : ''}>{p.salaExtra ? <span className="cpl-ok" aria-label="Incluída">✓</span> : <span className="cpl-no" aria-label="Não incluída">—</span>}</td>)}</tr>
                      <tr className="cpl-grupo"><td colSpan={4}>Atendimento e extras</td></tr>
                      <tr><td>Assessor no WhatsApp</td>{planos.map((p) => <td key={p.id} className={p.id === sel ? 'cpl-on' : ''}>{p.assessor ? <span className="cpl-ok" aria-label="Incluído">✓</span> : <span className="cpl-no" aria-label="Não incluído">—</span>}</td>)}</tr>
                      <tr><td>GFT Lab (beta)</td>{planos.map((p) => <td key={p.id} className={p.id === sel ? 'cpl-on' : ''}>{p.lab ? <span className="cpl-ok" aria-label="Incluído">✓</span> : <span className="cpl-no" aria-label="Não incluído">—</span>}</td>)}</tr>
                      <tr className="cpl-grupo"><td colSpan={4}>Valores</td></tr>
                      <tr><td>Compartilhamento do lucro do mês</td>{planos.map((p) => <td key={p.id} className={`cpl-forte ${p.id === sel ? 'cpl-on' : ''}`}>{porcentagem(p.compartilhamento)}</td>)}</tr>
                      <tr><td>Investimento</td>{planos.map((p) => <td key={p.id} className={`cpl-forte ${p.id === sel ? 'cpl-on' : ''}`}>{p.preco ? `R$ ${brl(p.preco)}/ano` : 'R$ 0'}</td>)}</tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="cpl-secao" aria-labelledby="cpl-t-conta">
                <div className="cpl-cab-secao cpl-revela">
                  <span className="cpl-olho">Na ponta do lápis</span>
                  <h2 id="cpl-t-conta">Quanto do lucro fica com você</h2>
                  <p>O compartilhamento é uma porcentagem do lucro do mês na conta real. Mês sem lucro, nada a pagar. Arraste para comparar.</p>
                </div>
                <SimuladorDoLucro planos={planos} aoMexer={() => eventoDoPixel('SimulouLucro', undefined, true)} />
              </section>

              <section className="cpl-secao" aria-labelledby="cpl-t-duvidas">
                <div className="cpl-cab-secao cpl-revela"><span className="cpl-olho">Antes de embarcar</span><h2 id="cpl-t-duvidas">Dúvidas comuns</h2></div>
                <div className="cpl-duvidas cpl-revela">
                  <details><summary>O Gold tem algum custo de entrada?</summary><p>Não. O Gold é aquisição zero: você cria a conta sem cartão e só compartilha {porcentagem(planos[0].compartilhamento)} do lucro do mês na conta real. Mês sem lucro, nada a pagar.</p></details>
                  <details><summary>Posso começar no Gold e mudar depois?</summary><p>Pode. A mudança para o Black ou o Prestige é feita dentro da plataforma, em Meu plano, na mesma conta. O que você já fez continua lá.</p></details>
                  <details><summary>Quando o Black ou o Prestige é liberado?</summary><p>Assim que o pagamento é confirmado. No cartão costuma ser na hora; no Pix, em poucos minutos. Use no pagamento o mesmo e-mail do cadastro.</p></details>
                  <details><summary>Como funciona o compartilhamento de receita?</summary><p>É uma porcentagem do lucro do mês na conta real, operando pela plataforma, apurada no início do mês seguinte. Você acompanha tudo na aba Relatórios.</p></details>
                  <details><summary>Preciso ter conta na corretora?</summary><p>Para operar com dinheiro real, sim: a GlobalFly opera numa corretora internacional, com o dinheiro sempre no seu nome. Dentro da plataforma, as aulas mostram como abrir a conta e fazer o primeiro depósito. Antes disso, você treina com US$ 10.000 virtuais no simulador.</p></details>
                  <details><summary>Funciona no celular?</summary><p>Sim. Dentro da plataforma você instala o app e ativa os avisos: cada sessão que termina na meta ou no limite chega como notificação no seu celular.</p></details>
                  <details><summary>Já tenho conta na GlobalFly. Preciso me cadastrar?</summary><p>Não precisa. Toque em Entrar, no topo, e use o seu e-mail e a sua senha. Para mudar de plano, é em Meu plano, dentro da plataforma.</p></details>
                </div>
              </section>

              <section className="cpl-secao cpl-final" aria-labelledby="cpl-t-final">
                <span className="cpl-olho">GF Member</span>
                <h2 id="cpl-t-final">O seu lugar a bordo<br />está reservado.</h2>
                <button type="button" className={`cpl-btn ${CLASSE_DO_BOTAO[sel] === 'cpl-btn-linha' ? 'cpl-btn-ouro' : CLASSE_DO_BOTAO[sel]}`} onClick={() => irParaDados(sel)}>{continuarCom(plano)} <span className="cpl-seta" aria-hidden="true">→</span></button>
              </section>
            </div>
          </div>

          <div className={`cpl-barra-fixa ${verBarra ? 'cpl-ver' : ''}`} aria-hidden={!verBarra}>
            <MiniCartao id={sel} />
            <div className="cpl-info"><b>GF Member {plano.nome}</b><span>{precoCurto(plano)}</span></div>
            <button type="button" tabIndex={verBarra ? 0 : -1} className={`cpl-btn ${CLASSE_DO_BOTAO[sel] === 'cpl-btn-linha' ? 'cpl-btn-ouro' : CLASSE_DO_BOTAO[sel]}`} onClick={() => irParaDados(sel)}>Continuar <span className="cpl-seta" aria-hidden="true">→</span></button>
          </div>
        </main>
      ) : (
        <main className="cpl-faixa">
          <div className="cpl-miolo cpl-cadastro">
            <div className="cpl-palco">
              <ol className="cpl-etapas" aria-label="Etapas do cadastro">
                <li className="cpl-feito"><i>✓</i><span>Plano</span></li>
                <li className="cpl-on"><i>2</i><span>Cadastro</span></li>
                {plano.preco > 0 && <li><i>3</i><span>Pagamento</span></li>}
              </ol>
              <div className="cpl-cena" onPointerMove={(e) => inclinar(e, cartaoGrande.current, 14)} onPointerLeave={() => endireitar(cartaoGrande.current)}>
                <div className="cpl-brilho" />
                <div className="cpl-cartao-grande" ref={cartaoGrande} key={`${plano.id}-${giro}`}><Cartao p={plano} titular={titular} /></div>
              </div>
              <div className="cpl-troca" role="group" aria-label="Trocar plano">
                {planos.map((p) => <button key={p.id} type="button" aria-pressed={p.id === sel} onClick={() => setSel(p.id)}>{p.nome}</button>)}
              </div>
              <div className="cpl-resumo">
                <div className="cpl-linha"><b>GF Member {plano.nome}</b><span className="cpl-v">R$ {brl(plano.preco)}<small>{plano.preco ? '/ano' : 'aquisição zero'}</small></span></div>
                <ul className="cpl-inclui">{itensDoPlano(plano).filter((it) => it.sim).map((it, k) => <li key={k} className="cpl-s"><Icone nome="ok" /><span>{it.texto}</span></li>)}</ul>
              </div>
              <button type="button" className="cpl-voltar" onClick={voltarAosPlanos}>← Ver todos os planos</button>
            </div>

            <form className="cpl-form" onSubmit={enviar} onFocus={aoComecar} noValidate aria-busy={ocupado}>
              <h1>Garanta o seu cartão de membro</h1>
              <p className="cpl-lead">Depois é só entrar com o e-mail e a senha que você criar aqui.</p>
              {campo('nome', 'Nome completo', nome, setNome, 'user', { auto: 'name', dica: 'Como está no documento' })}
              {campo('email', 'E-mail', email, setEmail, 'mail', { tipo: 'email', auto: 'email', dica: 'voce@email.com', modo: 'email' })}
              {campo('telefone', 'Telefone com DDD', telefone, (v) => setTelefone(formatarTelefone(v)), 'phone', { tipo: 'tel', auto: 'tel', dica: '(11) 91234-5678', modo: 'tel' })}
              {SENHA_NO_CADASTRO && <div className="cpl-senhas">
                {campo('senha', 'Crie sua senha', senha, setSenha, 'lock', { tipo: 'password', auto: 'new-password', dica: 'Pelo menos 8 caracteres' })}
                {campo('repetir', 'Repita a senha', repetir, setRepetir, 'lock', { tipo: 'password', auto: 'new-password', dica: 'Digite a mesma senha' })}
              </div>}
              {SENHA_NO_CADASTRO && <div className="cpl-forca" aria-hidden="true">{[0, 1, 2, 3].map((k) => <i key={k} className={k < forca ? 'cpl-on' : ''} />)}</div>}
              {erro && <div className="cpl-erro" role="alert">{erro}</div>}
              <button className={`cpl-btn ${CLASSE_DO_BOTAO[sel] === 'cpl-btn-linha' ? 'cpl-btn-ouro' : CLASSE_DO_BOTAO[sel]}`} type="submit" disabled={ocupado}>
                {ocupado ? 'Um instante…' : plano.preco > 0 ? <>Continuar para o pagamento <span className="cpl-seta" aria-hidden="true">→</span></> : 'Criar minha conta'}
              </button>
              {plano.preco > 0 && <p className="cpl-pago"><Icone nome="lock" /><span>Na próxima tela, o pagamento seguro no cartão em até 12x ou no Pix, com os seus dados já preenchidos.</span></p>}
              {!!MARCA.termos && <p className="cpl-termos">Ao continuar, você concorda com os <a href={`${import.meta.env.BASE_URL}termos/`} target="_blank" rel="noopener">Termos de Uso</a> e a <a href={`${import.meta.env.BASE_URL}termos/#politica-de-privacidade`} target="_blank" rel="noopener">Política de Privacidade</a>.</p>}
              <a className="cpl-caixa-deriv" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer" onClick={() => eventoDoPixel('Contact', { content_name: 'abrir-conta-deriv' }, true)}>
                <span><DerivLogo altura={16} /><b>Ainda não tem conta na Deriv?</b>Abra grátis, direto no site da Deriv. O seu dinheiro fica na corretora, no seu nome.</span>
                <IconeSaida tamanho={16} />
              </a>
            </form>
          </div>
        </main>
      )}

      <footer className="cpl-rodape cpl-faixa">
        <div className="cpl-seg"><span><Icone nome="lock" />Conexão criptografada</span><span><Icone nome="shield" />Seus dados protegidos</span></div>
        <p>Negociar envolve riscos e, assim como os ganhos são reais, as perdas também são. Opere com responsabilidade.</p>
      </footer>
    </div>
  )
}
