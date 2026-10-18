/**
 * Recorte da pessoa e troca do fundo da câmera — versão da casa.
 *
 * Nasceu do @livekit/track-processors (Apache 2.0): a mesma ideia de um
 * processador que o LiveKit liga na câmera (`track.setProcessor`). O
 * recorte foi reescrito porque o original parecia "adesivo colado"
 * (pedido do Tiago, 18/10/2026). O que mudou, em ordem de impacto:
 *
 *  1. Modelo: `selfie_multiclass_256x256` (separa cabelo, rosto, corpo e
 *     roupa) no lugar do `selfie_segmenter`. Erra bem menos no cabelo.
 *  2. Contorno guiado pela imagem: a máscara da IA é de 256×256; ampliar
 *     direto dá borda serrilhada e "halo". Aqui ela é ampliada por um filtro
 *     bilateral conjunto: cada ponto olha os vizinhos e só aceita a máscara
 *     de quem tem a cor parecida com a dele. A borda gruda na borda real
 *     (ombro, cabelo, orelha).
 *  3. Estabilidade no tempo: a máscara é suavizada entre quadros, mas segue
 *     rápido quando há movimento de verdade. Some o "tremido" do contorno.
 *  4. Luz do ambiente (light wrap): um pouco da luz do fundo vaza na borda
 *     da pessoa, como acontece numa foto real.
 *  5. Cor: a pessoa ganha um leve ajuste para combinar com o tom do fundo.
 *  6. Desfoque: o fundo real é desfocado sem "puxar" a pessoa para dentro
 *     do borrão (desfoque com máscara), então não sobra halo.
 *
 * Tudo roda na placa de vídeo (WebGL2); a IA roda no MediaPipe (GPU).
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import type { Track, TrackProcessor, VideoProcessorOptions } from 'livekit-client'
import { COMPOSICAO, DESFOQUE, TEMPORAL, VERTICE } from './shaders'

export type ModoDoFundo =
  | { modo: 'desfoque' }
  | { modo: 'imagem'; url: string }

/** Os botões finos do recorte (os valores padrão foram ajustados no teste com fotos reais). */
export interface AjustesDoRecorte {
  /** Corte da máscara: abaixo de `limiarBaixo` é fundo, acima de `limiarAlto` é pessoa. */
  limiarBaixo: number
  limiarAlto: number
  /** Quanto a cor manda na borda (maior = borda mais grudada nas bordas reais). */
  sensibilidadeDeCor: number
  /** Quanto a luz do fundo entra na borda da pessoa (0 a 1). */
  luzDoAmbiente: number
  /** Quanto a cor da pessoa se aproxima do tom do fundo (0 a 1). */
  harmonia: number
  /** Suavização do contorno no tempo (0 = nenhuma, 1 = máxima). */
  estabilidade: number
}

export const AJUSTES_PADRAO: AjustesDoRecorte = {
  limiarBaixo: 0.4, limiarAlto: 0.76, sensibilidadeDeCor: 18, luzDoAmbiente: 0.32, harmonia: 0.16, estabilidade: 0.55,
}

const VERSAO_MEDIAPIPE = '0.10.14'
const MODELO = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

let segmentadorCompartilhado: Promise<ImageSegmenter> | null = null
/** O modelo carrega uma vez só por página (~16 MB, fica no cache do navegador). */
function segmentador(): Promise<ImageSegmenter> {
  segmentadorCompartilhado ??= (async () => {
    const arquivos = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSAO_MEDIAPIPE}/wasm`)
    return ImageSegmenter.createFromOptions(arquivos, {
      baseOptions: { modelAssetPath: MODELO, delegate: 'GPU' },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    })
  })()
  segmentadorCompartilhado.catch(() => { segmentadorCompartilhado = null })
  return segmentadorCompartilhado
}

type Programa = { prog: WebGLProgram; u: (nome: string) => WebGLUniformLocation | null }
type Alvo = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

export class ProcessadorDeFundo implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = 'globalfly-recorte'
  processedTrack?: MediaStreamTrack

  private opcoes: ModoDoFundo
  ajustes: AjustesDoRecorte
  private video?: HTMLVideoElement
  private canvas?: HTMLCanvasElement
  private gl?: WebGL2RenderingContext
  private progs?: { temporal: Programa; desfoque: Programa; composicao: Programa }
  private texQuadro?: WebGLTexture
  private texMascara?: WebGLTexture
  private texFundo?: WebGLTexture
  private fundoTam = { w: 1, h: 1 }
  private suave: Alvo[] = []
  private borrao: Alvo[] = []
  private atual = 0
  private primeiro = true
  private parado = true
  private mascaraTam = { w: 0, h: 0 }
  private ultimoTempo = 0
  private ia?: ImageSegmenter
  /** Diagnóstico (laboratório): quadros desenhados e o último erro. */
  diagnostico = { quadros: 0, semMascara: 0, erro: '' }

  constructor(opcoes: ModoDoFundo, ajustes: Partial<AjustesDoRecorte> = {}) {
    this.opcoes = opcoes
    this.ajustes = { ...AJUSTES_PADRAO, ...ajustes }
  }

  async init(opts: VideoProcessorOptions): Promise<void> {
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.autoplay = true
    video.srcObject = new MediaStream([opts.track])
    await video.play().catch(() => undefined)
    if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }))
    this.video = video

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: false, antialias: false })
    if (!gl) throw new Error('Este navegador não tem WebGL2 para trocar o fundo.')
    this.canvas = canvas; this.gl = gl
    this.montarGL()
    await this.carregarFundo()
    this.ia = await segmentador()

    this.processedTrack = canvas.captureStream(30).getVideoTracks()[0]
    this.parado = false; this.primeiro = true
    this.proximoQuadro()
  }

  async restart(opts: VideoProcessorOptions): Promise<void> {
    await this.destroy()
    await this.init(opts)
  }

  async destroy(): Promise<void> {
    this.parado = true
    this.processedTrack?.stop()
    this.processedTrack = undefined
    if (this.video) { this.video.srcObject = null; this.video = undefined }
    const gl = this.gl
    if (gl) {
      for (const t of [this.texQuadro, this.texMascara, this.texFundo]) if (t) gl.deleteTexture(t)
      for (const a of [...this.suave, ...this.borrao]) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fbo) }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.gl = undefined; this.canvas = undefined; this.suave = []; this.borrao = []
  }

  /** Troca entre desfoque e imagens sem recriar nada (sem piscar). */
  async mudar(opcoes: ModoDoFundo): Promise<void> {
    this.opcoes = opcoes
    await this.carregarFundo()
  }

  /* ---------------------------------------------------------------- GL */

  private compilar(fonteFrag: string): Programa {
    const gl = this.gl!
    const sh = (tipo: number, fonte: string) => {
      const s = gl.createShader(tipo)!
      gl.shaderSource(s, fonte); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERTICE)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fonteFrag))
    gl.bindAttribLocation(prog, 0, 'p')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`programa: ${gl.getProgramInfoLog(prog)}`)
    const cache = new Map<string, WebGLUniformLocation | null>()
    return { prog, u: (n) => { if (!cache.has(n)) cache.set(n, gl.getUniformLocation(prog, n)); return cache.get(n)! } }
  }

  private textura(filtroMin: number = WebGL2RenderingContext.LINEAR): WebGLTexture {
    const gl = this.gl!
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtroMin)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  private alvo(w: number, h: number, mip = false): Alvo {
    const gl = this.gl!
    const tex = this.textura(mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { tex, fbo, w, h }
  }

  private montarGL() {
    const gl = this.gl!
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW) // um triângulo cobre a tela
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.progs = { temporal: this.compilar(TEMPORAL), desfoque: this.compilar(DESFOQUE), composicao: this.compilar(COMPOSICAO) }
    this.texQuadro = this.textura(gl.LINEAR_MIPMAP_LINEAR)
    this.texMascara = this.textura()
    this.criarBorrao()
  }

  /** Alvos que dependem do tamanho da câmera: máscara suavizada (metade) e desfoque (um quarto). */
  private criarBorrao() {
    const gl = this.gl!
    for (const a of [...this.borrao, ...this.suave]) { gl.deleteTexture(a.tex); gl.deleteFramebuffer(a.fbo) }
    const W = this.canvas!.width, H = this.canvas!.height
    this.borrao = [this.alvo(Math.max(64, Math.round(W / 4)), Math.max(36, Math.round(H / 4))), this.alvo(Math.max(64, Math.round(W / 4)), Math.max(36, Math.round(H / 4)))]
    this.suave = [this.alvo(Math.round(W / 2), Math.round(H / 2), true), this.alvo(Math.round(W / 2), Math.round(H / 2), true)]
    this.primeiro = true
  }

  private async carregarFundo() {
    const gl = this.gl
    if (!gl) return
    if (this.opcoes.modo !== 'imagem') return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = this.opcoes.url
    await img.decode()
    if (!this.gl) return
    this.texFundo ??= this.textura(gl.LINEAR_MIPMAP_LINEAR)
    gl.bindTexture(gl.TEXTURE_2D, this.texFundo)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.fundoTam = { w: img.naturalWidth, h: img.naturalHeight }
  }

  /* ------------------------------------------------------------ quadros */

  private proximoQuadro() {
    if (this.parado || !this.video) return
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.quadro())
    else window.setTimeout(() => this.quadro(), 33)
  }

  private quadro() {
    try { this.processar() } catch (e) { this.diagnostico.erro = String(e); console.warn('[recorte]', e) }
    this.proximoQuadro()
  }

  private processar() {
    const gl = this.gl, v = this.video, c = this.canvas, p = this.progs
    if (!gl || !v || !c || !p || v.readyState < 2 || !v.videoWidth) return
    if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; this.criarBorrao() }

    // 1) a IA: confiança de "fundo" (máscara 0); pessoa = 1 - fundo
    if (!this.ia) return
    let ok = false
    const agora = Math.max(performance.now(), this.ultimoTempo + 1); this.ultimoTempo = agora
    this.ia.segmentForVideo(v, agora, (r) => {
      // a máscara vem no tamanho do quadro; sobe direto como meia-precisão (filtrável)
      const m = r.confidenceMasks?.[0]
      if (!m) return
      const f = m.getAsFloat32Array()
      gl.bindTexture(gl.TEXTURE_2D, this.texMascara!)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      if (m.width !== this.mascaraTam.w || m.height !== this.mascaraTam.h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, m.width, m.height, 0, gl.RED, gl.FLOAT, f)
        this.mascaraTam = { w: m.width, h: m.height }
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, m.width, m.height, gl.RED, gl.FLOAT, f)
      ok = true
    })
    if (!ok) { this.diagnostico.semMascara++; return }
    this.diagnostico.quadros++

    // 2) quadro da câmera e máscara crua vão para a placa
    gl.bindTexture(gl.TEXTURE_2D, this.texQuadro!)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v)
    gl.generateMipmap(gl.TEXTURE_2D)

    // 3) estabilidade no tempo (ping-pong entre duas máscaras)
    const anterior = this.suave[this.atual], novo = this.suave[1 - this.atual]
    gl.bindFramebuffer(gl.FRAMEBUFFER, novo.fbo); gl.viewport(0, 0, novo.w, novo.h)
    gl.useProgram(p.temporal.prog)
    this.ligar(p.temporal, 'cru', this.texMascara!, 0)
    this.ligar(p.temporal, 'anterior', anterior.tex, 1)
    gl.uniform1f(p.temporal.u('primeiro'), this.primeiro ? 1 : 0)
    gl.uniform1f(p.temporal.u('estabilidade'), this.ajustes.estabilidade)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindTexture(gl.TEXTURE_2D, novo.tex); gl.generateMipmap(gl.TEXTURE_2D)
    this.atual = 1 - this.atual; this.primeiro = false

    // 4) desfoque do fundo real, sem a pessoa (só no modo desfoque)
    const desfocar = this.opcoes.modo === 'desfoque'
    if (desfocar) {
      const [a, b] = this.borrao
      gl.useProgram(p.desfoque.prog)
      for (const [de, para, dir, primeiraPassada] of [[null, a, [1, 0], 1], [a, b, [0, 1], 0], [b, a, [1, 0], 0], [a, b, [0, 1], 0]] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, para.fbo); gl.viewport(0, 0, para.w, para.h)
        this.ligar(p.desfoque, 'entrada', de ? de.tex : this.texQuadro!, 0)
        this.ligar(p.desfoque, 'mascara', novo.tex, 1)
        gl.uniform1f(p.desfoque.u('doQuadro'), primeiraPassada)
        gl.uniform2f(p.desfoque.u('passo'), (dir[0] * 2.2) / para.w, (dir[1] * 2.2) / para.h)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
    }

    // 5) composição final na tela
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, c.width, c.height)
    const q = p.composicao
    gl.useProgram(q.prog)
    this.ligar(q, 'quadro', this.texQuadro!, 0)
    this.ligar(q, 'mascara', novo.tex, 1)
    this.ligar(q, 'fundo', desfocar ? this.borrao[1].tex : (this.texFundo ?? this.texQuadro!), 2)
    gl.uniform1i(q.u('fundoDoQuadro'), desfocar ? 1 : 0)
    // "cobrir": o fundo preenche o quadro sem distorcer
    const A = c.width / c.height, B = desfocar ? A : this.fundoTam.w / this.fundoTam.h
    const rect = B > A ? [(1 - A / B) / 2, 0, A / B, 1] : [0, (1 - B / A) / 2, 1, B / A]
    gl.uniform4f(q.u('retFundo'), rect[0], rect[1], rect[2], rect[3])
    // vizinhança do contorno: ~4 px na tela, independente da resolução
    gl.uniform2f(q.u('texelMascara'), 4 / c.width, 4 / c.height)
    gl.uniform1f(q.u('limiarBaixo'), this.ajustes.limiarBaixo)
    gl.uniform1f(q.u('limiarAlto'), this.ajustes.limiarAlto)
    gl.uniform1f(q.u('sensibilidadeDeCor'), this.ajustes.sensibilidadeDeCor)
    gl.uniform1f(q.u('luzDoAmbiente'), this.ajustes.luzDoAmbiente)
    gl.uniform1f(q.u('harmonia'), desfocar ? 0 : this.ajustes.harmonia)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private ligar(p: Programa, nome: string, tex: WebGLTexture, unidade: number) {
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE0 + unidade)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(p.u(nome), unidade)
  }
}
