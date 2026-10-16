// Ícones e telas de abertura do app da GlobalFly, a partir das peças oficiais
// do manual da marca. Rodar quando o monograma ou a assinatura mudarem:
//
//   SHARP_MODULE_PATH=/caminho/do/sharp node scripts/pwa-globalfly.mjs
//
// Por que existe (16/10/2026): o ícone extraído do manual vinha com o
// monograma deslocado para a direita e para baixo (o PDF recortava a
// imagem). Aqui o monograma é recortado pelo contorno e centrado de verdade.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE_PATH || 'sharp')
const PUB = resolve('public')
const DIR = join(PUB, 'pwa-globalfly')
const AZUL = '#051528'
mkdirSync(join(DIR, 'splash'), { recursive: true })

/** Monograma (reverso, sobre transparente) recortado no contorno. */
async function recorte(arquivo) {
  return sharp(join(PUB, arquivo)).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true })
}
const mono = await recorte('globalfly-marca.png')
const monoClaro = await recorte('globalfly-monograma-claro.png')
const assinatura = await recorte('globalfly-assinatura.png')

/** Peça centrada numa tela de lado `lado`, ocupando `fracao` da largura. */
async function centrar(peca, largura, altura, fracao, fundo) {
  const w = Math.round(largura * fracao)
  const img = await sharp(peca.data).resize({ width: w }).toBuffer({ resolveWithObject: true })
  return sharp({ create: { width: largura, height: altura, channels: 4, background: fundo } })
    .composite([{ input: img.data, left: Math.round((largura - img.info.width) / 2), top: Math.round((altura - img.info.height) / 2) }])
    .png({ compressionLevel: 9 })
}

// Ícones: fundo Azul GF de ponta a ponta. "any" com o monograma em 62% da
// largura; "maskable" em 46% (a zona segura é o círculo de 80%); favicons
// pequenos com o monograma maior, para ler em 16 px.
const icones = [
  ['icon-512.png', 512, 0.62], ['icon-192.png', 192, 0.62], ['icon-180.png', 180, 0.6],
  ['icon-maskable-512.png', 512, 0.46], ['icon-maskable-192.png', 192, 0.46],
  ['favicon-128.png', 128, 0.74], ['favicon-64.png', 64, 0.78], ['favicon-32.png', 32, 0.8], ['favicon-16.png', 16, 0.86],
]
for (const [nome, lado, f] of icones) await (await centrar(mono, lado, lado, f, AZUL)).toFile(join(DIR, nome))

// Monocromático (Android 13+ tinge sozinho): a forma do monograma em branco.
const alfa = await sharp(mono.data).ensureAlpha().extractChannel(3).toBuffer()
const branco = await sharp({ create: { width: mono.info.width, height: mono.info.height, channels: 3, background: '#ffffff' } })
  .joinChannel(alfa, { raw: undefined }).png().toBuffer()
await (await centrar({ data: branco }, 512, 512, 0.46, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(join(DIR, 'icon-monocromatico-512.png'))

// favicon.ico com 16, 32 e 48 (PNG dentro do ICO, aceito por todo navegador atual).
const tamanhosIco = [16, 32, 48]
const pngs = []
for (const t of tamanhosIco) pngs.push(await (await centrar(mono, t, t, t <= 16 ? 0.86 : 0.8, AZUL)).toBuffer())
const cab = Buffer.alloc(6 + 16 * pngs.length)
cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4)
let pos = cab.length
pngs.forEach((p, i) => {
  const o = 6 + 16 * i, t = tamanhosIco[i]
  cab.writeUInt8(t, o); cab.writeUInt8(t, o + 1); cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6)
  cab.writeUInt32LE(p.length, o + 8); cab.writeUInt32LE(pos, o + 12); pos += p.length
})
writeFileSync(join(DIR, 'favicon.ico'), Buffer.concat([cab, ...pngs]))
writeFileSync(join(DIR, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="data:image/png;base64,${readFileSync(join(DIR, 'icon-512.png')).toString('base64')}" width="512" height="512"/></svg>\n`)

// O monograma solto (selo do menu, marca d'água, e-mail) também centrado.
for (const [peca, nome] of [[mono, 'globalfly-marca.png'], [monoClaro, 'globalfly-monograma-claro.png']]) {
  writeFileSync(join(PUB, nome), await (await centrar(peca, 256, 256, 0.78, { r: 0, g: 0, b: 0, alpha: 0 })).toBuffer())
}

// Telas de abertura do iPhone e do iPad (o iOS não monta sozinho a partir do
// manifesto: sem elas o app abre numa tela branca). Assinatura reversa no
// Azul GF, centrada, nunca abaixo de 180 pt de largura (manual, pág. 11).
export const SPLASH = [
  // [largura pt, altura pt, escala]
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
]
for (const [w, h, e] of SPLASH) {
  const fr = w >= 700 ? 0.36 : 0.58
  await (await centrar(assinatura, w * e, h * e, fr, AZUL)).toFile(join(DIR, 'splash', `${w * e}x${h * e}.png`))
}
writeFileSync(join(DIR, 'splash', 'telas.json'), JSON.stringify(SPLASH) + '\n')
console.log('ok:', icones.length, 'ícones,', SPLASH.length, 'telas de abertura')
