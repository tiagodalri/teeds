import type { ImgHTMLAttributes } from 'react'
import { MODULOS, type Aula } from '../../core/teeds/aulas'
import { MARCA } from '../../marca'
import { capaDaAula, capaEspecial } from '../capasAulas'
import { ResponsiveImage } from '../ResponsiveImage'
import './capa-da-aula.css'

/** As aulas do catálogo do código têm capa própria em public/ (pelo id). */
const COM_CAPA_NO_CODIGO = new Set(MODULOS.flatMap((m) => m.aulas.map((a) => a.id)))

/**
 * A capa de uma aula (04/11/2026): a enviada no painel; senão a do código
 * (aulas que já existiam); senão uma capa desenhada na cor do módulo, com o
 * número e o título, para uma aula nova nunca aparecer com imagem quebrada.
 */
export function CapaDaAula({ aula, cor, numero, ...img }: { aula: Pick<Aula, 'id' | 'titulo' | 'capa'>; cor?: string; numero?: number } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  // a capa do parceiro da vitrine (GlobalFly: as do Naor no /n) vale por cima de todas
  const especial = capaEspecial(aula.id)
  if (especial) return <CapaPoster src={especial} {...img} />
  if (aula.capa) return <ResponsiveImage src={aula.capa} alt={img.alt ?? ''} {...img} />
  if (COM_CAPA_NO_CODIGO.has(aula.id)) return <ResponsiveImage src={capaDaAula(aula.id)} alt={img.alt ?? ''} {...img} />
  return <CapaDesenhada titulo={aula.titulo} cor={cor} numero={numero} />
}

/**
 * Pôster (capas especiais 2:3, com monograma e título desenhados nele). Num cartão do
 * mesmo formato, preenche; num quadro largo (16:9 da jornada, janela da aula, Início),
 * o pôster aparece inteiro, sobre um fundo desfocado dele mesmo: nada cortado nem torto.
 */
export function CapaPoster({ src, alt, className = '', ...img }: { src: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  return <>
    <ResponsiveImage src={src} alt="" aria-hidden="true" className={`capa-poster-fundo ${className}`} loading={img.loading} />
    <ResponsiveImage src={src} alt={alt ?? ''} className={`capa-poster-frente ${className}`} {...img} />
  </>
}

export function CapaDesenhada({ titulo, cor = 'var(--primary)', numero }: { titulo: string; cor?: string; numero?: number }) {
  return (
    <span className="capa-desenhada" style={{ ['--capa' as string]: cor }} aria-hidden="true">
      <span className="capa-desenhada-luz" />
      <span className="capa-desenhada-marca">{MARCA.prosa}</span>
      {numero != null && <b className="capa-desenhada-num">{String(numero).padStart(2, '0')}</b>}
      <span className="capa-desenhada-titulo">{titulo || 'Aula nova'}</span>
    </span>
  )
}
