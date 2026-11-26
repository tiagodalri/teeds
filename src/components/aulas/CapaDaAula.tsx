import type { ImgHTMLAttributes } from 'react'
import { MODULOS, type Aula } from '../../core/teeds/aulas'
import { MARCA } from '../../marca'
import { capaDaAula, capaDoParceiroNoCodigo, capaEspecial } from '../capasAulas'
import { vitrineDoConteudo } from '../../core/teeds/parceiro'
import { ResponsiveImage } from '../ResponsiveImage'
import './capa-da-aula.css'

/** As aulas do catálogo do código têm capa própria em public/ (pelo id). */
const COM_CAPA_NO_CODIGO = new Set(MODULOS.flatMap((m) => m.aulas.map((a) => a.id)))

/** Capa enviada pelo painel (fica no Storage, endereço completo); as do código são caminhos do site. */
export const capaEnviada = (src?: string | null) => !!src && /^https?:\/\//i.test(src)

export type OrigemDaCapa = 'parceiro' | 'enviada' | 'parceiro-codigo' | 'padrao-codigo' | 'codigo' | 'desenhada'
/**
 * A capa que vale para uma aula numa vitrine (16/11/2026, Tiago: "conseguir trocar a capa
 * de cada aula"). Antes, a capa fixa no código (Naor no /n, Victor fora) passava por cima
 * de tudo e a enviada no painel nunca aparecia. Agora, em ordem:
 *  1. a capa enviada para esta vitrine (aula.capas[vitrine]);
 *  2. a capa do parceiro que está no código (Naor no /n);
 *  3. a capa enviada para todos (aula.capa, do Storage);
 *  4. a capa padrão do código (Victor fora do /n), a gravada como caminho do site,
 *     a do catálogo pelo id; senão, a capa desenhada.
 */
export function capaResolvida(aula: Pick<Aula, 'id' | 'capa' | 'capas'>, v: string = vitrineDoConteudo()): { src: string | null; origem: OrigemDaCapa } {
  const daVitrine = v ? aula.capas?.[v] : undefined
  if (daVitrine) return { src: daVitrine, origem: 'parceiro' }
  const doParceiro = capaDoParceiroNoCodigo(aula.id, v)
  if (doParceiro) return { src: doParceiro, origem: 'parceiro-codigo' }
  if (capaEnviada(aula.capa)) return { src: aula.capa!, origem: 'enviada' }
  const especial = capaEspecial(aula.id, v)
  if (especial) return { src: especial, origem: 'padrao-codigo' }
  if (aula.capa) return { src: aula.capa, origem: 'codigo' }
  if (COM_CAPA_NO_CODIGO.has(aula.id)) return { src: capaDaAula(aula.id), origem: 'codigo' }
  return { src: null, origem: 'desenhada' }
}

/**
 * A capa de uma aula: ver capaResolvida. Pôsteres (enviados e especiais) aparecem
 * inteiros nos quadros largos; sem imagem, a capa desenhada na cor do módulo.
 */
export function CapaDaAula({ aula, cor, numero, vitrine: v, ...img }: { aula: Pick<Aula, 'id' | 'titulo' | 'capa' | 'capas'>; cor?: string; numero?: number; vitrine?: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const { src, origem } = capaResolvida(aula, v)
  if (!src) return <CapaDesenhada titulo={aula.titulo} cor={cor} numero={numero} />
  if (origem === 'codigo') return <ResponsiveImage src={src} alt={img.alt ?? ''} {...img} />
  return <CapaPoster src={src} {...img} />
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
