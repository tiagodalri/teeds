// Fundo de câmera "Monograma GF" (20/10/2026): a arte que fica atrás do
// apresentador na live e na sala de treino, no lugar dos fundos de Dubai,
// estúdios e restaurantes. Rodar quando o monograma mudar:
//
//   SHARP_MODULE_PATH=/caminho/do/sharp node scripts/fundo-monograma-gf.mjs
//
// Composição: o Azul GF com uma luz suave atrás da pessoa (como num estúdio),
// o monograma grande, discreto, no terço da direita (aparece por cima do
// ombro, a pessoa fica no meio), uma luz dourada fraca no alto à esquerda
// para equilibrar, e o leve desfoque de lente que faz o fundo parecer real.
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE_PATH || 'sharp')
const W = 1920, H = 1080
const SAIDA = resolve('public', 'fundos-globalfly')
const MONOGRAMA = resolve('scripts', 'pwa-globalfly-fontes', 'monograma-reverso.png')

const luz = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="estudio" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#123459"/>
      <stop offset=".45" stop-color="#0a2140"/>
      <stop offset="1" stop-color="#030c18"/>
    </radialGradient>
    <radialGradient id="ouro" cx="14%" cy="22%" r="34%">
      <stop offset="0" stop-color="#C9A253" stop-opacity=".13"/>
      <stop offset="1" stop-color="#B78D39" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="chao" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".72" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#estudio)"/>
  <rect width="100%" height="100%" fill="url(#ouro)"/>
  <rect width="100%" height="100%" fill="url(#chao)"/>
</svg>`

// o monograma limpo (sem o véu de alfa baixo da exportação do manual)
const { data, info } = await sharp(MONOGRAMA).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 24) data[i + 3] = 0
  else {
    // discreto: marca presente, sem brigar com o rosto; o traço dourado brilha um pouco mais
    const ouro = data[i] > data[i + 2] + 40 && data[i + 1] > data[i + 2] + 10
    data[i + 3] = Math.round(data[i + 3] * (ouro ? 0.42 : 0.15))
  }
}
const mono = await sharp(data, { raw: info }).png().trim({ threshold: 1 }).resize({ width: 640 }).png().toBuffer({ resolveWithObject: true })

const arte = await sharp(Buffer.from(luz))
  .composite([{ input: mono.data, left: Math.round(W * 0.775 - mono.info.width / 2), top: Math.round(H * 0.42 - mono.info.height / 2) }])
  .blur(2.2)
  .jpeg({ quality: 86, mozjpeg: true })
  .toBuffer()
await sharp(arte).toFile(join(SAIDA, 'monograma-gf.jpg'))
await sharp(arte).resize(320, 180).jpeg({ quality: 80, mozjpeg: true }).toFile(join(SAIDA, 'monograma-gf-mini.jpg'))
console.log('ok: monograma-gf.jpg e monograma-gf-mini.jpg')
