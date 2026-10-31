/**
 * A mistura da transição stinger, na placa de vídeo (WebGL), do jeito do OBS
 * (plugins/obs-transitions, "Track Matte"):
 *
 *   - a máscara (metade direita do arquivo, no layout lado a lado) decide,
 *     pixel a pixel, o que aparece: preto = a cena que está saindo, branco =
 *     a cena que está entrando, cinza = as duas misturadas (luma Rec. 709);
 *   - o stinger (metade esquerda) vem por cima, com a transparência do
 *     próprio arquivo (WebM com canal alfa; MP4 não tem transparência);
 *   - sem máscara, a cena troca de uma vez no ponto da transição, por baixo
 *     do stinger.
 */
import type { LayoutDoStinger } from './tipos'

const VERTICE = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

const PIXEL = `
precision mediump float;
varying vec2 uv;
uniform sampler2D a;
uniform sampler2D b;
uniform sampler2D v;
uniform int layout;
uniform bool inverter;
uniform float corte;
void main() {
  vec4 ca = texture2D(a, uv);
  vec4 cb = texture2D(b, uv);
  vec2 uc = uv;
  vec2 um = uv;
  if (layout == 0) { uc = vec2(uv.x * 0.5, uv.y); um = vec2(0.5 + uv.x * 0.5, uv.y); }
  else if (layout == 1) { uc = vec2(uv.x, 0.5 + uv.y * 0.5); um = vec2(uv.x, uv.y * 0.5); }
  float l;
  if (layout == 3) { l = corte; }
  else {
    vec3 m = texture2D(v, um).rgb;
    l = dot(m, vec3(0.2126, 0.7152, 0.0722));
    if (inverter) l = 1.0 - l;
  }
  vec3 base = mix(ca.rgb, cb.rgb, l);
  if (layout == 2) { gl_FragColor = vec4(base, 1.0); return; }
  vec4 s = texture2D(v, uc);
  gl_FragColor = vec4(mix(base, s.rgb, s.a), 1.0);
}`

const NUMERO_DO_LAYOUT: Record<LayoutDoStinger, number> = { 'lado-a-lado': 0, empilhado: 1, 'so-mascara': 2, 'sem-mascara': 3 }

export interface Misturador {
  canvas: HTMLCanvasElement
  desenhar(a: TexImageSource, b: TexImageSource, video: TexImageSource, layout: LayoutDoStinger, inverter: boolean, corte: number): boolean
}

export function criarMisturador(largura: number, altura: number): Misturador | null {
  const canvas = document.createElement('canvas')
  canvas.width = largura; canvas.height = altura
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false })
  if (!gl) return null
  const sombra = (tipo: number, codigo: string) => {
    const s = gl.createShader(tipo)!
    gl.shaderSource(s, codigo); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
    return s
  }
  let prog: WebGLProgram
  try {
    prog = gl.createProgram()!
    gl.attachShader(prog, sombra(gl.VERTEX_SHADER, VERTICE))
    gl.attachShader(prog, sombra(gl.FRAGMENT_SHADER, PIXEL))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  } catch { return null }
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const p = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(p)
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)
  const texturas = ['a', 'b', 'v'].map((nome, i) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + i)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.uniform1i(gl.getUniformLocation(prog, nome), i)
    return t
  })
  const uLayout = gl.getUniformLocation(prog, 'layout')
  const uInverter = gl.getUniformLocation(prog, 'inverter')
  const uCorte = gl.getUniformLocation(prog, 'corte')
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.viewport(0, 0, largura, altura)

  return {
    canvas,
    desenhar(a, b, video, layout, inverter, corte) {
      try {
        ;[a, b, video].forEach((fonte, i) => {
          gl.activeTexture(gl.TEXTURE0 + i)
          gl.bindTexture(gl.TEXTURE_2D, texturas[i])
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte)
        })
        gl.uniform1i(uLayout, NUMERO_DO_LAYOUT[layout])
        gl.uniform1i(uInverter, inverter ? 1 : 0)
        gl.uniform1f(uCorte, corte)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        return true
      } catch { return false }
    },
  }
}
