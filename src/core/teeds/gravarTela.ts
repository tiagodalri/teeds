/**
 * Grava um pedaço da própria aba em MP4 (18/11/2026, replay das sessões).
 *
 * É uma transmissão de tela de verdade: o navegador captura a aba (o Chrome
 * pergunta uma vez, com "Esta aba" já escolhida) e cada quadro é recortado
 * no elemento pedido, reduzido para 1080p (ou 720p em tela pequena) e
 * codificado em H.264 pelo próprio aparelho, via WebCodecs (Mediabunny).
 * Nada sobe para servidor: o arquivo nasce no navegador e é baixado.
 *
 * Nitidez sem arquivo gigante: a captura vem na resolução física da tela
 * (retina = 2×) e só é reduzida no fim; a taxa é variável, então tela parada
 * quase não gasta bits. Uma sessão típica dá poucos MB por minuto.
 */

type Mb = typeof import('mediabunny')

export interface OpcoesDaGravacao {
  /** Quadros por segundo do arquivo. */
  fps?: number
  /** Chamado se a pessoa parar o compartilhamento pela barra do navegador. */
  aoInterromper?: () => void
}

export interface Gravador {
  readonly largura: number
  readonly altura: number
  /** Segundos já gravados. */
  segundos(): number
  /** Termina e devolve o MP4. */
  parar(): Promise<Blob>
  /** Descarta tudo. */
  cancelar(): void
}

export function podeGravarTela(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof (window as any).VideoEncoder !== 'undefined'
}

/**
 * Pede a captura desta aba. Chame direto no clique (o navegador exige o gesto).
 * Recusa se a pessoa escolher uma janela ou a tela inteira: o recorte só é
 * exato capturando a aba.
 */
export async function pedirCapturaDaAba(): Promise<MediaStream> {
  if (!podeGravarTela()) throw new Error('Este navegador não grava a tela. Use o Chrome ou o Edge no computador.')
  const fluxo = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: { ideal: 30, max: 30 }, width: { ideal: 3840 }, height: { ideal: 2160 }, cursor: 'never' } as MediaTrackConstraints,
    audio: false,
    preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude', systemAudio: 'exclude',
  } as DisplayMediaStreamOptions)
  const trilha = fluxo.getVideoTracks()[0]
  const superficie = (trilha?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface
  if (!trilha || (superficie && superficie !== 'browser')) {
    fluxo.getTracks().forEach((t) => t.stop())
    throw new Error('Para gravar, escolha "Esta aba" na janela do navegador (não uma janela nem a tela inteira).')
  }
  try { trilha.contentHint = 'text' } catch { /* só uma dica para o codificador */ }
  return fluxo
}

const par = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** O tamanho do arquivo: 1080p quando a tela tem pixels para isso; senão 720p, ou o que houver. */
export function tamanhoDoArquivo(alvo: HTMLElement): { largura: number; altura: number } {
  const r = alvo.getBoundingClientRect()
  const fisico = r.width * (window.devicePixelRatio || 1)
  const proporcao = r.height / Math.max(1, r.width)
  const largura = fisico >= 1700 ? 1920 : fisico >= 1180 ? 1280 : par(fisico)
  return { largura, altura: par(largura * proporcao) }
}

export async function gravarElemento(fluxo: MediaStream, alvo: HTMLElement, opcoes: OpcoesDaGravacao = {}): Promise<Gravador> {
  const fps = opcoes.fps ?? 30
  const trilha = fluxo.getVideoTracks()[0]
  const pararCaptura = () => fluxo.getTracks().forEach((t) => t.stop())
  try {
    const { largura, altura } = tamanhoDoArquivo(alvo)
    // Recorte pelo próprio navegador (Chrome/Edge): o quadro já vem só com o elemento.
    let recortado = false
    const Corte = (window as any).CropTarget
    if (Corte?.fromElement && typeof (trilha as any).cropTo === 'function') {
      try { await (trilha as any).cropTo(await Corte.fromElement(alvo)); recortado = true } catch { /* recorta à mão */ }
    }

    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.srcObject = fluxo
    await video.play()
    for (let i = 0; i < 60 && !video.videoWidth; i++) await new Promise((ok) => setTimeout(ok, 50))
    if (!video.videoWidth) throw new Error('A captura da aba não começou.')

    const tela = document.createElement('canvas')
    tela.width = largura; tela.height = altura
    const ctx = tela.getContext('2d', { alpha: false })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const desenhar = () => {
      const vw = video.videoWidth, vh = video.videoHeight
      if (!vw || !vh) return
      if (recortado) { ctx.drawImage(video, 0, 0, vw, vh, 0, 0, largura, altura); return }
      // A aba inteira veio: recorta o retângulo do elemento, na escala do quadro.
      const r = alvo.getBoundingClientRect()
      const ex = vw / window.innerWidth, ey = vh / window.innerHeight
      ctx.drawImage(video, r.left * ex, r.top * ey, r.width * ex, r.height * ey, 0, 0, largura, altura)
    }

    const mb: Mb = await import('mediabunny')
    // 1080p: até 4,5 Mbps; 720p: até 2,5. Taxa variável: tela parada gasta quase nada.
    const bitrate = largura >= 1900 ? 4_500_000 : largura >= 1270 ? 2_500_000 : 1_800_000
    if (!(await mb.canEncodeVideo('avc', { width: largura, height: altura, bitrate }))) throw new Error('Este aparelho não codifica H.264 (MP4).')
    const saida = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
    const fonte = new mb.CanvasSource(tela, { codec: 'avc', bitrate, bitrateMode: 'variable', latencyMode: 'quality', keyFrameInterval: 4 })
    saida.addVideoTrack(fonte, { frameRate: fps })
    await saida.start()

    let parado = false
    let quadro = 0
    const t0 = performance.now()
    const laco = (async () => {
      while (!parado) {
        const alvoT = quadro / fps
        const agora = (performance.now() - t0) / 1000
        if (agora < alvoT) { await new Promise((ok) => setTimeout(ok, Math.max(1, (alvoT - agora) * 1000))); continue }
        desenhar()
        await fonte.add(alvoT, 1 / fps)
        quadro++
        // ficou para trás (aba ocupada): pula para o agora em vez de acelerar o vídeo
        const depois = (performance.now() - t0) / 1000
        if (depois - quadro / fps > 0.5) quadro = Math.floor(depois * fps)
      }
    })()
    trilha.addEventListener('ended', () => { if (!parado) opcoes.aoInterromper?.() })

    return {
      largura, altura,
      segundos: () => quadro / fps,
      async parar() {
        parado = true
        await laco
        await saida.finalize()
        pararCaptura(); video.srcObject = null
        const buf = (saida.target as InstanceType<Mb['BufferTarget']>).buffer
        if (!buf) throw new Error('O vídeo saiu vazio.')
        return new Blob([buf], { type: 'video/mp4' })
      },
      cancelar() {
        parado = true
        void laco.finally(() => saida.cancel().catch(() => {}))
        pararCaptura(); video.srcObject = null
      },
    }
  } catch (e) { pararCaptura(); throw e }
}

/** Baixa o arquivo com o nome dado. */
export function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
