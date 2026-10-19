// Ícones e telas de abertura do app da GlobalFly, a partir das peças oficiais
// do manual da marca. Rodar quando o monograma ou a assinatura mudarem:
//
//   SHARP_MODULE_PATH=/caminho/do/sharp node scripts/pwa-globalfly.mjs
//
// Histórico:
//  - 16/10/2026: o ícone extraído do manual vinha com o monograma deslocado
//    (o PDF recortava a imagem); passou a ser recortado pelo contorno.
//  - 19/10/2026: o Tiago viu o GF "meio torto" no quadradinho da tela
//    inicial. Duas causas: (1) centrar pela CAIXA do desenho põe o peso
//    visual acima e à esquerda, porque a ponta dourada desce sozinha até o
//    pé; (2) a fonte tinha 256 px e o ícone de 512 era ampliado (borrado).
//    Agora a fonte é a peça em alta do manual (scripts/pwa-globalfly-fontes/)
//    e a posição mistura o centro da caixa com o centro de massa do desenho
//    (centragem óptica, como se faz em ícone de app).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const sharp = createRequire(import.meta.url)(process.env.SHARP_MODULE_PATH || 'sharp')
const PUB = resolve('public')
const FONTES = resolve('scripts', 'pwa-globalfly-fontes')
const DIR = join(PUB, 'pwa-globalfly')
const AZUL = '#051528'
const OURO = '#B78D39'
mkdirSync(join(DIR, 'splash'), { recursive: true })
mkdirSync(join(DIR, 'atalhos'), { recursive: true })

/**
 * A peça do manual sem o halo: o PDF deixa um véu de alfa baixo em volta
 * (sombra de exportação) que, sobre o azul, aparece como névoa. Zera o alfa
 * fraco e recorta no contorno real.
 */
async function peca(arquivo, recolorir) {
  const { data, info } = await sharp(join(FONTES, arquivo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) { data[i + 3] = 0; continue }
    // recolorir: o marfim (claro, pouco saturado) vira outra cor; o ouro fica.
    if (recolorir && data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 190) { data[i] = recolorir.r; data[i + 1] = recolorir.g; data[i + 2] = recolorir.b }
  }
  const limpo = await sharp(data, { raw: info }).png().toBuffer()
  return sharp(limpo).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true })
}
const mono = await peca('monograma-reverso.png')
const monoClaro = await peca('monograma-reverso.png', { r: 5, g: 21, b: 40 })
const assinatura = await peca('assinatura-reversa.png')

/** Centro de massa do desenho (pelo alfa), em fração da largura e da altura. */
async function massa(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let sx = 0, sy = 0, s = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3]
    sx += x * a; sy += y * a; s += a
  }
  return { cx: sx / s / info.width, cy: sy / s / info.height }
}
const MISTURA = 0.6 // 0 = centro da caixa, 1 = centro de massa (testado: 0,6 é o que o olho lê como centro)

/** Peça numa tela, ocupando `fracao` da largura, com centragem óptica. */
async function centrar(p, largura, altura, fracao, fundo, optico = true) {
  const w = Math.round(largura * fracao)
  const img = await sharp(p.data).resize({ width: w, kernel: 'lanczos3' }).toBuffer({ resolveWithObject: true })
  const { cx, cy } = optico ? await massa(img.data) : { cx: 0.5, cy: 0.5 }
  const iw = img.info.width, ih = img.info.height
  const caixaX = (largura - iw) / 2, caixaY = (altura - ih) / 2
  const massaX = largura / 2 - cx * iw, massaY = altura / 2 - cy * ih
  const left = Math.round(caixaX + (massaX - caixaX) * MISTURA)
  const top = Math.round(caixaY + (massaY - caixaY) * MISTURA - (optico ? altura * 0.006 : 0))
  return sharp({ create: { width: largura, height: altura, channels: 4, background: fundo } })
    .composite([{ input: img.data, left: Math.max(0, Math.min(largura - iw, left)), top: Math.max(0, Math.min(altura - ih, top)) }])
    .png({ compressionLevel: 9 })
}

// Ícones: fundo Azul GF de ponta a ponta (o manual proíbe degradê e brilho).
// "any" com o monograma em 60% da largura; "maskable" em 46% (a zona segura
// é o círculo de 80%); favicons pequenos com o monograma maior, para ler em 16 px.
const icones = [
  ['icon-512.png', 512, 0.6], ['icon-192.png', 192, 0.6], ['icon-180.png', 180, 0.6], ['icon-167.png', 167, 0.6], ['icon-152.png', 152, 0.6],
  ['icon-maskable-512.png', 512, 0.46], ['icon-maskable-192.png', 192, 0.46],
  ['favicon-128.png', 128, 0.74], ['favicon-64.png', 64, 0.78], ['favicon-32.png', 32, 0.8], ['favicon-16.png', 16, 0.86],
]
for (const [nome, lado, f] of icones) await (await centrar(mono, lado, lado, f, AZUL)).toFile(join(DIR, nome))

// Monocromático (Android 13+ tinge sozinho): a forma do monograma em branco.
const alfa = await sharp(mono.data).ensureAlpha().extractChannel(3).toBuffer()
const branco = await sharp({ create: { width: mono.info.width, height: mono.info.height, channels: 3, background: '#ffffff' } })
  .joinChannel(alfa).png().toBuffer()
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

// O monograma solto (selo do menu, marca d'água, e-mail), agora em alta.
for (const [p, nome] of [[mono, 'globalfly-marca.png'], [monoClaro, 'globalfly-monograma-claro.png']]) {
  writeFileSync(join(PUB, nome), await (await centrar(p, 256, 256, 0.78, { r: 0, g: 0, b: 0, alpha: 0 })).toBuffer())
}
// O monograma justo, ao lado do texto no nome dos robôs (NomeDoRobo.tsx):
// marfim no tema escuro, azul no claro, 96 px de altura (nítido em tela retina).
for (const [p, nome] of [[mono, 'globalfly-gf-escuro.png'], [monoClaro, 'globalfly-gf-claro.png']]) {
  await sharp(p.data).resize({ height: 96, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(PUB, nome))
}

// Ícones dos atalhos (segurar o dedo no ícone do app, no Android): cada um
// com o desenho da sua tela, em ouro sobre o Azul GF.
const ATALHOS = {
  robos: 'M10 4l1.8 4.9L16.7 10.7l-4.9 1.8L10 17.4l-1.8-4.9L3.3 10.7l4.9-1.8z M18 3v4 M16 5h4 M18.5 15.5v4 M16.5 17.5h4',
  operar: 'M6 5v14 M4 8h4v7H4z M12 3v12 M10 5h4v6h-4z M18 9v12 M16 12h4v6h-4z',
  aulas: 'M4 5h16v11H4z M10 8.5v4l3.5-2z M8 20h8',
}
for (const [nome, d] of Object.entries(ATALHOS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="${AZUL}"/>` +
    `<g transform="translate(48 48) scale(4)" fill="none" stroke="${OURO}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g></svg>`
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(DIR, 'atalhos', `${nome}.png`))
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
  await (await centrar(assinatura, w * e, h * e, fr, AZUL, false)).toFile(join(DIR, 'splash', `${w * e}x${h * e}.png`))
}
writeFileSync(join(DIR, 'splash', 'telas.json'), JSON.stringify(SPLASH) + '\n')
// A assinatura da abertura dentro do app (index.html, `%ABERTURA%`): a mesma
// peça e a mesma proporção das telas acima, para a troca da tela de abertura
// do iPhone para a do app ser invisível.
await sharp(assinatura.data).resize({ width: 1200, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(DIR, 'abertura.png'))
console.log('ok:', icones.length, 'ícones,', Object.keys(ATALHOS).length, 'atalhos,', SPLASH.length, 'telas de abertura')
