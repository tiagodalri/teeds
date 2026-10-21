/**
 * Abrir e reduzir uma imagem escolhida pela pessoa (21/10/2026), usado pela
 * foto do perfil e pelos prints do suporte. Depois do Victor não conseguir
 * subir foto nenhuma no Mac, o caminho ficou à prova de navegador:
 *
 *  - abre por createImageBitmap (não depende de URL de blob) e, se não der,
 *    pelo <img> com URL local;
 *  - foto do iPhone (HEIC), que o Chrome e o Android não abrem, é convertida
 *    no aparelho; a biblioteca só é baixada nesse caso;
 *  - gera WEBP onde o navegador sabe; o Safari antigo devolve PNG pesado
 *    quando se pede webp, então ali vai JPEG, com o tipo verdadeiro.
 */

export const ehHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)
export const ehImagem = (f: File) => f.type.startsWith('image/') || ehHeic(f)

type Aberta = { fonte: CanvasImageSource; w: number; h: number; soltar: () => void }

async function abrir(dado: Blob): Promise<Aberta | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(dado)
      return { fonte: b, w: b.width, h: b.height, soltar: () => b.close() }
    } catch { /* tenta pelo <img> */ }
  }
  const url = URL.createObjectURL(dado)
  const img = await new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url })
  if (img && img.naturalWidth > 0) return { fonte: img, w: img.naturalWidth, h: img.naturalHeight, soltar: () => URL.revokeObjectURL(url) }
  URL.revokeObjectURL(url)
  return null
}

export async function abrirImagem(arquivo: File): Promise<Aberta> {
  let aberta = await abrir(arquivo)
  if (!aberta && ehHeic(arquivo)) {
    try {
      const { default: heic2any } = await import('heic2any')
      const jpg = await heic2any({ blob: arquivo, toType: 'image/jpeg', quality: 0.9 })
      aberta = await abrir(Array.isArray(jpg) ? jpg[0] : jpg)
    } catch { /* cai na mensagem abaixo */ }
  }
  if (!aberta) {
    throw new Error(ehHeic(arquivo)
      ? 'Não consegui converter essa foto do iPhone (HEIC). Tire um print dela ou exporte como JPG e tente de novo.'
      : 'Não consegui abrir essa imagem. Escolha uma foto em JPG, PNG ou WEBP.')
  }
  return aberta
}

/** O desenho pronto vira arquivo: WEBP onde dá, JPEG nos outros (com o tipo e a extensão verdadeiros). */
export async function canvasParaArquivo(c: HTMLCanvasElement, qualidade = 0.86): Promise<{ blob: Blob; tipo: string; ext: string }> {
  const tentar = (tipo: string) => new Promise<Blob | null>((ok) => c.toBlob((b) => ok(b && b.type === tipo ? b : null), tipo, qualidade))
  const webp = await tentar('image/webp')
  if (webp) return { blob: webp, tipo: 'image/webp', ext: 'webp' }
  const jpeg = await tentar('image/jpeg')
  if (jpeg) return { blob: jpeg, tipo: 'image/jpeg', ext: 'jpg' }
  throw new Error('Não consegui preparar a imagem neste navegador.')
}

/** Reduz a imagem: `quadrado` corta no centro (foto de perfil); senão cabe em `lado` mantendo a proporção. */
export async function reduzirImagem(arquivo: File, lado: number, quadrado: boolean, qualidade = 0.86) {
  const a = await abrirImagem(arquivo)
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Não consegui preparar a imagem neste navegador.')
    if (quadrado) {
      const m = Math.min(a.w, a.h)
      c.width = c.height = lado
      ctx.drawImage(a.fonte, (a.w - m) / 2, (a.h - m) / 2, m, m, 0, 0, lado, lado)
    } else {
      const escala = Math.min(1, lado / Math.max(a.w, a.h))
      c.width = Math.max(1, Math.round(a.w * escala)); c.height = Math.max(1, Math.round(a.h * escala))
      ctx.drawImage(a.fonte, 0, 0, c.width, c.height)
    }
    return await canvasParaArquivo(c, qualidade)
  } finally { a.soltar() }
}
