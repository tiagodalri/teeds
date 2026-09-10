import type { ImgHTMLAttributes } from 'react'
import './responsive-images.css'

/** Modern formats, viewport-sized sources, and the untouched original fallback. */
export function ResponsiveImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const base = src.replace(/\.(jpg|png)$/i, '')
  return <picture className="responsive-image">
    <source type="image/webp" media="(max-width: 600px)" srcSet={`${base}-mobile.webp`} />
    <source type="image/webp" srcSet={`${base}.webp`} />
    <img src={src} decoding="async" {...props} />
  </picture>
}
