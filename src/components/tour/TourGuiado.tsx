import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspacePage } from '../WorkspaceNav'
import { MARCA } from '../../marca'
import { Monograma, TEM_MONOGRAMA } from '../marca/Monograma'
import './tour.css'

/**
 * Tour guiado (20/10/2026, pedido do Tiago): na primeira vez que a pessoa
 * entra na plataforma ele é obrigatório (sem fechar); depois fica em Aulas
 * para rever quando quiser (aí pode fechar). Cada passo leva para a tela
 * certa, ilumina a parte da tela de que fala e explica em linguagem simples.
 *
 * Computador: o cartão aparece ao lado do que está iluminado.
 * Celular e app (PWA): o cartão vira uma folha presa embaixo, respeitando a
 * área segura do iPhone, e o que está iluminado sobe para o topo da tela.
 */

export interface PassoDoTour {
  id: string
  tela?: WorkspacePage
  /** Onde iluminar: o primeiro seletor visível na tela vale. Sem alvo, o cartão fica no centro. */
  alvos?: string[]
  icone: string
  titulo: string
  texto: string
  /** No celular o texto pode mudar (ex.: "toque no menu"). */
  textoCelular?: string
  dicas?: string[]
}

const ICONE = {
  ola: 'M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.3l5.9-.9z',
  menu: 'M4 6h16M4 12h16M4 18h10',
  conta: 'M3 7h18v12H3zM3 11h18M7 15h3',
  hoje: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  atalho: 'M13 3L4 14h7l-1 7 9-11h-7z',
  ia: 'M5 7h14v13H5zM12 3v4M8 12h1m6 0h1M9 16h6',
  manual: 'M3 17l5-6 4 3 9-11M16 3h5v5',
  gestao: 'M4 20V10m8 10V4m8 16v-7',
  treino: 'M12 12h.01M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8',
  aulas: 'M3 5h7l2 2 2-2h7v15h-7l-2 1-2-1H3zM12 7v14',
  perfil: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
  pronto: 'M5 12.5l4.2 4.2L19 7',
  suporte: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
}

export function passosDoTour({ nome, treino }: { nome: string; treino: boolean }): PassoDoTour[] {
  const primeiro = nome.trim().split(/\s+/)[0]
  return [
    {
      id: 'ola', icone: ICONE.ola,
      titulo: primeiro ? `Bem-vindo, ${primeiro}!` : `Bem-vindo à ${MARCA.prosa}!`,
      texto: `Em uns 2 minutos você conhece a ${MARCA.prosa}: onde fica cada coisa e por onde começar. Use os botões abaixo para avançar e voltar.`,
      dicas: ['Este tour aparece só desta vez.', 'Depois ele fica em Aulas, para rever quando quiser.'],
    },
    {
      id: 'menu', tela: 'inicio', alvos: ['#workspace-navigation', '.workspace-mobile-toggle'], icone: ICONE.menu,
      titulo: 'Seu menu',
      texto: 'Daqui você vai para qualquer parte da plataforma: Início, I.A., Manual, Gerenciamento, Aulas e o que mais estiver liberado para você.',
      textoCelular: 'Toque neste botão para abrir o menu. Dele você vai para qualquer parte: Início, I.A., Manual, Gerenciamento, Aulas e o que mais estiver liberado para você.',
    },
    {
      id: 'conta', tela: 'inicio', alvos: ['.in-saldo'], icone: ICONE.conta,
      titulo: 'Sua conta na corretora',
      texto: `As operações acontecem na sua conta da Deriv. A ${MARCA.prosa} se conecta a ela para operar e mostrar o saldo; o dinheiro fica sempre na sua conta.`,
      dicas: ['Conta demo: dinheiro de treino, para praticar sem risco.', 'Conta real: quando você já se sentir seguro.', 'Comece sempre pela demo.'],
    },
    {
      id: 'hoje', tela: 'inicio', alvos: ['.in-hoje'], icone: ICONE.hoje,
      titulo: 'O seu dia',
      texto: 'Aqui você acompanha o resultado do dia, quantas operações foram feitas, e o quanto falta para a meta ou para o limite de perda.',
      dicas: ['Defina a meta e o limite antes da primeira operação: é o que mantém tudo sob controle.'],
    },
    {
      id: 'atalhos', tela: 'inicio', alvos: ['.in-atalhos'], icone: ICONE.atalho,
      titulo: 'Atalhos',
      texto: 'O caminho mais curto para as telas que você mais vai usar. Vamos passar por cada uma agora.',
    },
    {
      id: 'ia', tela: 'robos', alvos: ['.tela-viva:not([hidden]) .vr-cartao', '.tela-viva:not([hidden]) .robot-workspace'], icone: ICONE.ia,
      titulo: 'Estratégias de I.A.',
      texto: 'Cada cartão é uma estratégia automática, com o próprio jeito de operar. Abra os detalhes, escolha o valor de entrada, a meta e o limite, e ligue.',
      dicas: ['Ligada, ela opera sozinha e você acompanha tudo ao vivo.', 'Para parar, é um toque.'],
    },
    {
      id: 'manual', tela: 'operar', alvos: ['.layout-operar aside.trade', '.layout-operar .chart-head'], icone: ICONE.manual,
      titulo: 'Operação manual',
      texto: 'Prefere operar com as próprias mãos? Aqui ficam o gráfico ao vivo e a boleta: escolha o ativo, o tipo de contrato e o valor, e confirme.',
    },
    {
      id: 'gestao', tela: 'gerenciamento', alvos: ['.go-config'], icone: ICONE.gestao,
      titulo: 'Gerenciamento',
      texto: 'Monte o seu plano: quanto tem de banca, quanto quer buscar no dia e quanto aceita perder. A planilha mostra o cenário antes de você operar.',
      dicas: ['A meta e o limite que você salvar aqui aparecem na tela Início.'],
    },
    ...(treino ? [{
      id: 'treino', tela: 'inicio' as WorkspacePage, alvos: ['[data-tour="nav-aovivo"]'], icone: ICONE.treino,
      titulo: 'Sala de treino',
      texto: 'Quando a equipe abrir uma sala de treino ao vivo, um aviso vermelho pulsa aqui no menu e na tela. É só tocar para entrar e operar junto.',
    }] : []),
    {
      id: 'aulas', tela: 'aulas', alvos: ['[data-tour="rever-tour"]', '.aulas-capa'], icone: ICONE.aulas,
      titulo: 'Aulas',
      texto: 'Do zero à operação, uma aula de cada vez. Comece pela primeira: ela mostra como deixar tudo pronto.',
      dicas: ['Este tour fica aqui: toque em "Rever o tour" quando quiser.'],
    },
    {
      id: 'perfil', tela: 'inicio', alvos: ['[data-tour="usuario"]'], icone: ICONE.perfil,
      titulo: 'Meu perfil',
      texto: 'Toque na sua foto para abrir o perfil: lá você completa seus dados (nome, CPF, telefone e endereço), coloca uma foto e vê seu plano e até quando vai o seu acesso.',
    },
    ...(MARCA.suporte ? [{
      id: 'suporte', alvos: ['[data-tour="suporte"]'], icone: ICONE.suporte,
      titulo: 'Ajuda e suporte',
      texto: 'Ficou com alguma dúvida? Toque aqui e fale com a nossa equipe pelo chat: a resposta chega aqui mesmo, na plataforma. Dá para mandar print da tela.',
      dicas: ['No menu, em Ajuda, ficam as respostas das dúvidas mais comuns.'],
    }] : []),
    {
      id: 'pronto', icone: ICONE.pronto,
      titulo: 'Tudo pronto!',
      texto: `Próximos passos: complete o seu perfil, conecte a sua Deriv e assista à primeira aula. Bem-vindo a bordo da ${MARCA.prosa}!`,
    },
  ]
}

interface Props {
  passos: PassoDoTour[]
  obrigatorio: boolean
  telaAtual: WorkspacePage
  irPara: (tela: WorkspacePage) => void
  /** Chegou ao fim (o tour conta como visto). `destino`: para onde a pessoa escolheu ir. */
  aoTerminar: (destino: WorkspacePage) => void
  /** Fechou antes do fim (só quando não é obrigatório). */
  aoFechar: () => void
}

type Caixa = { top: number; left: number; width: number; height: number }
const CHAVE = `${MARCA.id}.tour.passo`
const FOLGA = 8
const celular = () => window.matchMedia('(max-width: 640px)').matches
const semMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function achar(seletores: string[] = []): HTMLElement | null {
  for (const s of seletores) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(s))) {
      const r = el.getBoundingClientRect()
      if (r.width > 4 && r.height > 4 && r.right > 0 && r.left < window.innerWidth) return el
    }
  }
  return null
}

export function TourGuiado({ passos, obrigatorio, telaAtual, irPara, aoTerminar, aoFechar }: Props) {
  const [i, setI] = useState(() => {
    if (!obrigatorio) return 0
    try { const n = Number(sessionStorage.getItem(CHAVE)); return Number.isFinite(n) && n > 0 && n < passos.length ? n : 0 } catch { return 0 }
  })
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const [procurando, setProcurando] = useState(false)
  const [tamanho, setTamanho] = useState({ w: window.innerWidth, h: window.innerHeight, cel: celular() })
  const [alturaCartao, setAlturaCartao] = useState(260)
  const cartao = useRef<HTMLDivElement>(null)
  const alvo = useRef<HTMLElement | null>(null)
  const passo = passos[Math.min(i, passos.length - 1)]
  const ultimo = i >= passos.length - 1

  // retoma do mesmo passo se a página recarregar no meio do tour obrigatório
  useEffect(() => { if (obrigatorio) try { sessionStorage.setItem(CHAVE, String(i)) } catch { /* só agora */ } }, [i, obrigatorio])

  useEffect(() => {
    const medir = () => setTamanho({ w: window.innerWidth, h: window.innerHeight, cel: celular() })
    window.addEventListener('resize', medir)
    window.visualViewport?.addEventListener('resize', medir)
    return () => { window.removeEventListener('resize', medir); window.visualViewport?.removeEventListener('resize', medir) }
  }, [])

  // leva para a tela do passo e procura o que iluminar
  useEffect(() => {
    if (passo.tela && passo.tela !== telaAtual) irPara(passo.tela)
    alvo.current = null
    setCaixa(null)
    if (!passo.alvos?.length) { setProcurando(false); return }
    setProcurando(true)
    let vivo = true
    const inicio = Date.now()
    const tentar = () => {
      if (!vivo) return
      const el = achar(passo.alvos)
      if (el) {
        alvo.current = el
        setProcurando(false)
        const r = el.getBoundingClientRect()
        const cel = celular()
        const antes = el.style.scrollMarginTop
        // no celular o alvo sobe para o topo (a folha do tour fica embaixo)
        if (cel) el.style.scrollMarginTop = '68px'
        el.scrollIntoView({ behavior: semMovimento() ? 'auto' : 'smooth', block: cel || r.height > window.innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest' })
        window.setTimeout(() => { el.style.scrollMarginTop = antes }, 900)
        return
      }
      if (Date.now() - inicio > 3000) { setProcurando(false); return }
      window.setTimeout(tentar, 100)
    }
    // a tela nova precisa de um instante para montar
    const t = window.setTimeout(tentar, passo.tela && passo.tela !== telaAtual ? 180 : 30)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  // acompanha o alvo enquanto a tela rola ou muda de tamanho
  useEffect(() => {
    let quadro = 0
    let anterior = ''
    const seguir = () => {
      const el = alvo.current
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect()
        const nova = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }
        const chave = `${nova.top}|${nova.left}|${nova.width}|${nova.height}`
        if (chave !== anterior) { anterior = chave; setCaixa(nova) }
      } else if (anterior) { anterior = ''; setCaixa(null) }
      quadro = requestAnimationFrame(seguir)
    }
    quadro = requestAnimationFrame(seguir)
    return () => cancelAnimationFrame(quadro)
  }, [])

  useLayoutEffect(() => {
    const h = cartao.current?.offsetHeight
    if (h && Math.abs(h - alturaCartao) > 2) setAlturaCartao(h)
  })

  // foco no cartão a cada passo (teclado e leitores de tela)
  useEffect(() => { cartao.current?.focus({ preventScroll: true }) }, [i])

  const avancar = useCallback(() => setI((n) => Math.min(n + 1, passos.length - 1)), [passos.length])
  const voltar = useCallback(() => setI((n) => Math.max(n - 1, 0)), [])
  const terminar = useCallback((destino: WorkspacePage) => {
    try { sessionStorage.removeItem(CHAVE) } catch { /* nada */ }
    aoTerminar(destino)
  }, [aoTerminar])

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON')) { e.preventDefault(); if (ultimo) terminar('inicio'); else avancar() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); voltar() }
    else if (e.key === 'Escape' && !obrigatorio) { e.preventDefault(); aoFechar() }
    else if (e.key === 'Tab') {
      // o foco não sai do cartão
      const f = Array.from(cartao.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
      if (!f.length) return
      const atual = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && atual <= 0) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && atual === f.length - 1) { e.preventDefault(); f[0].focus() }
    }
  }

  // ---------------------------------------------------- onde fica o cartão
  const { w, h, cel } = tamanho
  const foco = caixa && {
    top: Math.max(caixa.top - FOLGA, 4), left: Math.max(caixa.left - FOLGA, 4),
    width: Math.min(caixa.width + FOLGA * 2, w - 8), height: Math.min(caixa.height + FOLGA * 2, h - 8),
  }
  let estiloCartao: React.CSSProperties = {}
  let lado = 'centro'
  if (cel) {
    // folha embaixo; se o alvo ficou lá embaixo (ex.: algo preso no rodapé), a folha sobe
    lado = foco && foco.top + foco.height / 2 > h * 0.58 ? 'folha-topo' : 'folha'
  } else if (foco) {
    const larg = Math.min(380, w - 32)
    const alt = alturaCartao
    const cabeEmbaixo = foco.top + foco.height + 14 + alt < h - 12
    const cabeEmCima = foco.top - 14 - alt > 12
    const cabeDireita = foco.left + foco.width + 16 + larg < w - 12
    const cabeEsquerda = foco.left - 16 - larg > 12
    const prende = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
    if (cabeDireita && foco.height > h * 0.45) {
      lado = 'direita'; estiloCartao = { width: larg, left: foco.left + foco.width + 16, top: prende(foco.top, 12, h - alt - 12) }
    } else if (cabeEmbaixo) {
      lado = 'embaixo'; estiloCartao = { width: larg, top: foco.top + foco.height + 14, left: prende(foco.left, 16, w - larg - 16) }
    } else if (cabeEmCima) {
      lado = 'em-cima'; estiloCartao = { width: larg, top: foco.top - 14 - alt, left: prende(foco.left, 16, w - larg - 16) }
    } else if (cabeDireita) {
      lado = 'direita'; estiloCartao = { width: larg, left: foco.left + foco.width + 16, top: prende(foco.top, 12, h - alt - 12) }
    } else if (cabeEsquerda) {
      lado = 'esquerda'; estiloCartao = { width: larg, left: foco.left - 16 - larg, top: prende(foco.top, 12, h - alt - 12) }
    } else {
      lado = 'canto'; estiloCartao = { width: larg, right: 24, bottom: 24 }
    }
  }

  const texto = cel && passo.textoCelular ? passo.textoCelular : passo.texto
  const pct = ((i + 1) / passos.length) * 100

  return createPortal(
    <div className={`tg ${caixa ? 'com-alvo' : 'sem-alvo'}`} role="dialog" aria-modal="true" aria-labelledby="tg-titulo" aria-describedby="tg-texto">
      {/* bloqueia cliques na plataforma enquanto o tour está aberto */}
      <div className="tg-bloqueio" />
      <div className="tg-foco" style={foco ?? { top: h / 2, left: w / 2, width: 0, height: 0 }} aria-hidden="true" />

      <div ref={cartao} className={`tg-cartao ${lado} ${passo.id === 'ola' && TEM_MONOGRAMA ? 'capa' : ''}`} style={estiloCartao} tabIndex={-1} onKeyDown={teclas} key={passo.id}>
        {TEM_MONOGRAMA && <Monograma variante="marca-dagua" tamanho={170} className="tg-marca-dagua" />}
        <div className="tg-topo">
          <span className="tg-contagem">{TEM_MONOGRAMA && <Monograma tamanho={15} />}{i === 0 ? 'Tour guiado' : `Passo ${i} de ${passos.length - 1}`}</span>
          {!obrigatorio && (
            <button type="button" className="tg-fechar" onClick={aoFechar} aria-label="Fechar o tour">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        {passo.id === 'ola' && TEM_MONOGRAMA ? (
          // a abertura: o monograma grande, como a capa de um embarque
          <div className="tg-capa"><span className="tg-capa-selo"><Monograma tamanho={54} /></span><h2 id="tg-titulo">{passo.titulo}</h2></div>
        ) : (
          <div className="tg-cabeca">
            <span className={`tg-icone ${passo.id === 'pronto' ? 'ok' : ''}`}>{passo.id === 'suporte' && TEM_MONOGRAMA ? <Monograma tamanho={24} /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={passo.icone} /></svg>}</span>
            <h2 id="tg-titulo">{passo.titulo}</h2>
          </div>
        )}
        <p id="tg-texto" className="tg-texto">{texto}</p>
        {passo.dicas && <ul className="tg-dicas">{passo.dicas.map((d) => <li key={d}>{d}</li>)}</ul>}
        {procurando && <p className="tg-abrindo" aria-live="polite">Abrindo a tela…</p>}

        <div className="tg-trilho" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>

        {ultimo ? (
          <div className="tg-acoes final">
            <button type="button" className="tg-btn" onClick={voltar}>Voltar</button>
            <button type="button" className="tg-btn" onClick={() => terminar('perfil')}>Completar meu perfil</button>
            <button type="button" className="tg-btn ouro" onClick={() => terminar('inicio')}>Começar a usar</button>
          </div>
        ) : (
          <div className="tg-acoes">
            {i > 0 ? <button type="button" className="tg-btn" onClick={voltar}>Voltar</button> : <span />}
            <button type="button" className="tg-btn ouro" onClick={avancar}>{i === 0 ? 'Começar o tour' : 'Próximo'}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>
        )}
        {!cel && <p className="tg-teclas" aria-hidden="true"><kbd>←</kbd> <kbd>→</kbd> para navegar{!obrigatorio && <> · <kbd>Esc</kbd> fecha</>}</p>}
      </div>
    </div>,
    document.body,
  )
}
