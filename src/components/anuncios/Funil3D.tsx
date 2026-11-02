/**
 * O funil ao vivo da aba Anúncios (02/11/2026, Tiago: "um funil 3d animado com leads entrando,
 * dividido em cada etapa dos nossos funis... com as bolinhas caindo, setinhas migrando de uma
 * etapa pra outra, lead trilhando um caminho... capricha").
 *
 * O cone é desenhado num canvas: cada etapa é um anel de vidro dourado (o fundo primeiro,
 * as bolinhas no meio, a frente translúcida por cima), e as bolinhas descem em espiral.
 * Em cada passagem de etapa, a bolinha segue na mesma proporção dos números reais (com um
 * piso para o funil não ficar vazio embaixo); as que não seguem escapam pela parede e somem.
 * Os números e as setas ficam ao lado, em HTML, para ficarem nítidos e legíveis.
 * Quando um número de verdade sobe, a etapa acende e uma bolinha grande desce por ela.
 */
import { useEffect, useRef, useState } from 'react'

export interface EtapaDoFunil { id: string; nome: string; valor: number; fonte: 'Meta' | 'Pixel' | 'Plataforma'; custo?: number | null }

interface Bolinha { etapa: number; y: number; ang: number; giro: number; vel: number; raio: number; viva: boolean; fuga: number; destaque: boolean; brilho: number; alvo: number; rastro: number[] }

const fmt = (v: number) => Math.round(v).toLocaleString('pt-BR')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (a: number, b: number) => (b > 0 ? `${(a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: a / b < 0.1 ? 2 : 1 })}%` : '—')

/** Número que corre até o valor novo, em vez de pular. */
function NumeroVivo({ valor }: { valor: number }) {
  const [mostra, setMostra] = useState(valor)
  const atual = useRef(valor)
  useEffect(() => {
    const de = atual.current, ate = valor, inicio = performance.now(), dur = Math.min(1600, 400 + Math.abs(ate - de) * 40)
    if (de === ate) return
    let q = 0
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / dur), e = 1 - Math.pow(1 - k, 3)
      atual.current = de + (ate - de) * e; setMostra(atual.current)
      if (k < 1) q = requestAnimationFrame(passo)
    }
    q = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(q)
  }, [valor])
  return <>{fmt(mostra)}</>
}

export function Funil3D({ etapas, mostrarCusto }: { etapas: EtapaDoFunil[]; mostrarCusto: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const dados = useRef(etapas)
  const acesas = useRef<number[]>(etapas.map(() => 0))
  const anteriores = useRef<number[] | null>(null)
  const novas = useRef<number[]>([])
  const [acesa, setAcesa] = useState<Record<number, number>>({})

  // quando um número sobe: a etapa acende e desce uma bolinha grande por ela
  useEffect(() => {
    dados.current = etapas
    const antes = anteriores.current
    if (antes) etapas.forEach((e, i) => {
      const subiu = Math.min(6, Math.max(0, Math.round(e.valor - (antes[i] ?? 0))))
      if (subiu > 0 && e.fonte !== 'Meta') {
        acesas.current[i] = 1
        for (let k = 0; k < subiu; k++) novas.current.push(i)
        setAcesa((a) => ({ ...a, [i]: Date.now() }))
      }
    })
    anteriores.current = etapas.map((e) => e.valor)
  }, [etapas])

  useEffect(() => {
    const cv = tela.current, cx0 = caixa.current
    if (!cv || !cx0) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
    let largura = 0, altura = 0, dpr = 1
    const medir = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      largura = cv.clientWidth; altura = cv.clientHeight
      cv.width = Math.round(largura * dpr); cv.height = Math.round(altura * dpr)
    }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(cv)

    // a cor vem do tema (ouro da GF); as bolinhas são carimbos prontos, não desenhos a cada quadro
    const rgbDe = (c: string): [number, number, number] => {
      const h = c.trim().replace('#', '')
      if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return [214, 174, 91]
      const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
      return [v >> 16 & 255, v >> 8 & 255, v & 255]
    }
    let RGB = rgbDe(getComputedStyle(cx0).getPropertyValue('--fu-ouro'))
    // fundo claro ou escuro: no claro, a luz soma pouco e a sombra é dourada, não preta
    const fundoClaro = () => { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return !!m && (+m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114) > 150 }
    let claro = fundoClaro()
    const carimbo = (miolo: string, borda: string) => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      r.addColorStop(0, miolo); r.addColorStop(0.18, miolo); r.addColorStop(0.38, borda); r.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c
    }
    let sOuro: HTMLCanvasElement, sLuz: HTMLCanvasElement, sCinza: HTMLCanvasElement
    const carimbos = () => {
      const [R, G, B] = RGB
      sOuro = claro ? carimbo(`rgba(${R},${G * 0.8 | 0},${B * 0.3 | 0},1)`, `rgba(${R},${G},${B},.2)`) : carimbo(`rgba(${Math.min(255, R + 50)},${Math.min(255, G + 50)},${Math.min(255, B + 60)},1)`, `rgba(${R},${G},${B},.28)`)
      sLuz = claro ? carimbo('rgba(255,253,246,1)', `rgba(${R},${G * 0.85 | 0},${B * 0.4 | 0},.75)`) : carimbo('rgba(255,248,226,1)', `rgba(${R},${G},${B},.55)`)
      sCinza = carimbo('rgba(170,180,195,.9)', 'rgba(150,160,175,.15)')
    }
    carimbos()
    const temaObs = new MutationObserver(() => { RGB = rgbDe(getComputedStyle(cx0).getPropertyValue('--fu-ouro')); claro = fundoClaro(); carimbos() })
    temaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })

    const bolinhas: Bolinha[] = []
    const inicio = performance.now()
    let ultimo = inicio, acumulado = 0, q = 0, rodando = false

    const desenhar = (agora: number) => {
      const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora
      const n = dados.current.length
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, largura, altura)
      if (!n || !largura || !altura) { q = requestAnimationFrame(desenhar); return }

      // o canvas sobra 56 px para cima (CSS .fu-cone): a boca do funil cabe sem cortar e os anéis seguem alinhados às etapas
      const topo = 18 + 56, base = altura - 14, h = (base - topo) / n
      const cx = largura / 2, rTopo = Math.min(largura * 0.45, 220), rBase = rTopo * 0.2
      const raio = (y: number) => rTopo + (rBase - rTopo) * Math.min(1, Math.max(0, (y - topo) / (base - topo)))
      const achat = 0.27
      const [R, G, B] = RGB
      const tom = (i: number, a: number, luz = 0) => {
        const f = 1 - (i / Math.max(1, n - 1)) * 0.3
        return `rgba(${Math.min(255, R * f + 90 * luz) | 0},${Math.min(255, G * f + 80 * luz) | 0},${Math.min(255, B * f + 60 * luz) | 0},${a})`
      }
      // a montagem: cada anel entra com um leve atraso, de cima para baixo
      const entrada = (i: number) => { if (reduzir) return 1; const k = Math.min(1, Math.max(0, (agora - inicio - i * 70) / 650)); return 1 - Math.pow(1 - k, 3) }
      for (let i = 0; i < n; i++) acesas.current[i] = Math.max(0, (acesas.current[i] ?? 0) - dt * 0.5)

      // o chão: um halo dourado embaixo do funil
      const yb = base + 4, rb = rBase * 2.6
      const halo = ctx.createRadialGradient(cx, yb, 0, cx, yb, rb)
      halo.addColorStop(0, `rgba(${R},${G},${B},.32)`); halo.addColorStop(1, `rgba(${R},${G},${B},0)`)
      ctx.fillStyle = halo; ctx.beginPath(); ctx.ellipse(cx, yb, rb, rb * 0.32, 0, 0, Math.PI * 2); ctx.fill()

      // 1) a parede de trás de cada anel
      for (let i = 0; i < n; i++) {
        const e = entrada(i); if (e <= 0) continue
        const y0 = topo + i * h + 2.5, y1 = topo + (i + 1) * h - 2.5, r0 = raio(y0) * (0.9 + 0.1 * e), r1 = raio(y1) * (0.9 + 0.1 * e)
        ctx.globalAlpha = e
        ctx.beginPath()
        ctx.ellipse(cx, y0, r0, r0 * achat, 0, Math.PI, 2 * Math.PI)
        ctx.lineTo(cx + r1, y1)
        ctx.ellipse(cx, y1, r1, r1 * achat, 0, 0, Math.PI, true)
        ctx.closePath()
        const g = ctx.createLinearGradient(0, y0 - r0 * achat, 0, y1)
        g.addColorStop(0, tom(i, 0.2)); g.addColorStop(1, tom(i, 0.05))
        ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx, y0, r0, r0 * achat, 0, Math.PI, 2 * Math.PI)
        ctx.strokeStyle = tom(i, 0.3 + acesas.current[i] * 0.5, 0.2); ctx.lineWidth = 1; ctx.stroke()
      }
      ctx.globalAlpha = 1

      // 2) as bolinhas
      const meio = (i: number) => topo + (i + 0.55) * h
      if (!reduzir && agora - inicio > 500) {
        acumulado += dt * Math.min(8, 3 + Math.log10(1 + (dados.current[0]?.valor ?? 0)) * 0.8)
        while (acumulado >= 1) {
          acumulado -= 1
          bolinhas.push({ etapa: 0, y: topo - 4, ang: Math.random() * Math.PI * 2, giro: 0.5 + Math.random() * 0.6, vel: 20 + Math.random() * 16, raio: 2 + Math.random() * 1.6, viva: true, fuga: 0, destaque: false, brilho: 0, alvo: -1, rastro: [] })
        }
        while (novas.current.length) {
          const alvo = novas.current.shift()!
          bolinhas.push({ etapa: 0, y: topo - 4, ang: Math.PI * 0.5, giro: 0.9, vel: 120, raio: 5.5, viva: true, fuga: 0, destaque: true, brilho: 0, alvo, rastro: [] })
        }
      }
      if (bolinhas.length > 260) bolinhas.splice(0, bolinhas.length - 260)
      ctx.globalCompositeOperation = claro ? 'source-over' : 'lighter'
      for (let k = bolinhas.length - 1; k >= 0; k--) {
        const b = bolinhas[k]
        const r = raio(b.y), estreita = rTopo / Math.max(r, 1)
        if (b.viva) {
          // como água num ralo: mais estreito, mais rápido e girando mais
          const parado = b.destaque && b.etapa === b.alvo && b.y >= meio(b.alvo)
          if (parado) { b.brilho += dt; if (b.brilho > 1.6) { b.viva = false; b.fuga = -1; b.brilho = 0 } }
          else b.y += b.vel * Math.sqrt(estreita) * dt
          b.ang += b.giro * estreita * dt * (b.destaque ? 1.4 : 1)
          const fim = topo + (b.etapa + 1) * h
          if (b.viva && !parado && b.y >= fim) {
            if (b.etapa >= n - 1) { b.viva = false; b.fuga = -1 }
            else if (b.destaque) b.etapa = Math.min(b.alvo, b.etapa + 1)
            else {
              const a = dados.current[b.etapa]?.valor ?? 0, d = dados.current[b.etapa + 1]?.valor ?? 0
              if (a > 0 && d > 0 && Math.random() < Math.min(0.96, Math.max(0.32, Math.sqrt(d / a)))) b.etapa++
              else { b.viva = false; b.fuga = Math.cos(b.ang) >= 0 ? 1 : -1 }
            }
          }
        }
        const rr = raio(b.y) * (b.destaque ? 0.55 : 0.8)
        let x = cx + Math.cos(b.ang) * rr, y = b.y + Math.sin(b.ang) * rr * achat
        const frente = (Math.sin(b.ang) + 1) / 2
        let alfa = 0.3 + frente * 0.7
        if (!b.viva) {
          b.brilho += dt
          if (b.fuga === -1) { alfa *= Math.max(0, 1 - b.brilho * 1.5) }
          else { x += b.fuga * b.brilho * b.brilho * 90; y += b.brilho * b.brilho * 50; alfa *= Math.max(0, 0.8 - b.brilho * 0.9) }
          if (alfa <= 0.01) { bolinhas.splice(k, 1); continue }
        }
        const tam = b.raio * (0.75 + frente * 0.5) * (b.destaque ? 1 + Math.sin(agora / 160) * 0.12 : 1) * 4
        if (b.destaque && b.viva) {
          b.rastro.push(x, y); if (b.rastro.length > 28) b.rastro.splice(0, 2)
          for (let t = 0; t < b.rastro.length; t += 2) {
            const f = t / b.rastro.length
            ctx.globalAlpha = f * 0.5 * alfa
            const s = tam * (0.25 + f * 0.5)
            ctx.drawImage(sLuz, b.rastro[t] - s / 2, b.rastro[t + 1] - s / 2, s, s)
          }
        }
        ctx.globalAlpha = alfa
        const img = !b.viva && b.fuga !== -1 ? sCinza : b.destaque ? sLuz : sOuro
        ctx.drawImage(img, x - tam / 2, y - tam / 2, tam, tam)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // 3) a frente de vidro, com um reflexo que passeia devagar
      const reflexo = reduzir ? 0.32 : 0.18 + ((Math.sin(agora / 3800) + 1) / 2) * 0.64
      for (let i = 0; i < n; i++) {
        const e = entrada(i); if (e <= 0) continue
        const y0 = topo + i * h + 2.5, y1 = topo + (i + 1) * h - 2.5, r0 = raio(y0) * (0.9 + 0.1 * e), r1 = raio(y1) * (0.9 + 0.1 * e), luz = acesas.current[i]
        ctx.globalAlpha = e
        ctx.beginPath()
        ctx.moveTo(cx - r0, y0)
        ctx.ellipse(cx, y0, r0, r0 * achat, 0, Math.PI, 0, true)
        ctx.lineTo(cx + r1, y1)
        ctx.ellipse(cx, y1, r1, r1 * achat, 0, 0, Math.PI)
        ctx.closePath()
        const g = ctx.createLinearGradient(cx - r0, 0, cx + r0, 0)
        g.addColorStop(0, tom(i, 0.55 + luz * 0.3))
        g.addColorStop(Math.max(0, reflexo - 0.16), tom(i, 0.12 + luz * 0.2, 0.1))
        g.addColorStop(reflexo, tom(i, 0.3 + luz * 0.3, 0.75))
        g.addColorStop(Math.min(1, reflexo + 0.05), tom(i, 0.14 + luz * 0.2, 0.3))
        g.addColorStop(0.86, tom(i, 0.16 + luz * 0.2))
        g.addColorStop(1, tom(i, 0.6 + luz * 0.3))
        ctx.fillStyle = g; ctx.fill()
        // sombra de dentro, embaixo de cada anel: dá profundidade
        const sombra = ctx.createLinearGradient(0, y1 - h * 0.5, 0, y1 + r1 * achat)
        sombra.addColorStop(0, 'rgba(0,0,0,0)'); sombra.addColorStop(1, claro ? `rgba(${R * 0.6 | 0},${G * 0.45 | 0},${B * 0.2 | 0},.14)` : 'rgba(3,10,22,.22)')
        ctx.fillStyle = sombra; ctx.fill()
        // aro de cima, fino e brilhante; aro de baixo, discreto
        ctx.beginPath(); ctx.ellipse(cx, y0, r0, r0 * achat, 0, 0, Math.PI)
        ctx.strokeStyle = tom(i, 0.9, 0.55 + luz * 0.45); ctx.lineWidth = 1.2 + luz * 1.8; ctx.stroke()
        ctx.beginPath(); ctx.ellipse(cx, y1, r1, r1 * achat, 0, 0.15, Math.PI - 0.15)
        ctx.strokeStyle = tom(i, 0.4); ctx.lineWidth = 1; ctx.stroke()
        if (luz > 0.02) {
          ctx.shadowColor = tom(i, luz); ctx.shadowBlur = 22 * luz
          ctx.beginPath(); ctx.ellipse(cx, y0, r0, r0 * achat, 0, 0, Math.PI)
          ctx.strokeStyle = tom(i, luz * 0.8, 0.8); ctx.lineWidth = 2; ctx.stroke()
          ctx.shadowBlur = 0
        }
      }
      ctx.globalAlpha = 1

      q = requestAnimationFrame(desenhar)
    }
    // só anima quando dá para ver: fora da tela ou em outra aba, para
    const ligar = () => { if (!rodando) { rodando = true; ultimo = performance.now(); q = requestAnimationFrame(desenhar) } }
    const desligar = () => { rodando = false; cancelAnimationFrame(q) }
    let naTela = true
    const io = new IntersectionObserver(([e]) => { naTela = e.isIntersecting; if (naTela && !document.hidden) ligar(); else desligar() })
    io.observe(cv)
    const aba = () => { if (document.hidden) desligar(); else if (naTela) ligar() }
    document.addEventListener('visibilitychange', aba)
    ligar()
    return () => { desligar(); io.disconnect(); ro.disconnect(); temaObs.disconnect(); document.removeEventListener('visibilitychange', aba) }
  }, [])

  return (
    <div className="fu" ref={caixa} style={{ ['--fu-n' as string]: etapas.length }}>
      <div className="fu-palco" aria-hidden="true"><canvas ref={tela} className="fu-cone" /></div>
      <ol className="fu-etapas">
        {etapas.map((e, i) => {
          const anterior = etapas[i - 1]
          return (
            <li key={e.id} className={acesa[i] && Date.now() - acesa[i] < 2500 ? 'acesa' : ''}>
              {anterior && (
                <span className="fu-passa" aria-label={`${pct(e.valor, anterior.valor)} seguem de ${anterior.nome} para ${e.nome}`}>
                  <i aria-hidden="true"><b /><b /><b /></i>{pct(e.valor, anterior.valor)}
                </span>
              )}
              <div className="fu-linha">
                <small className={`fu-fonte ${e.fonte.toLowerCase()}`}>{e.fonte}</small>
                <span className="fu-nome">{e.nome}</span>
                <strong><NumeroVivo valor={e.valor} /></strong>
                {mostrarCusto && e.custo != null && e.valor > 0 && <em>{brl(e.custo)} cada</em>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
