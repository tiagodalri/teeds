import { useState, type ImgHTMLAttributes } from 'react'
import './responsive-images.css'

/** Modern formats, viewport-sized sources, and the untouched original fallback. */
export function ResponsiveImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  return <ImageSources key={src} src={src} {...props} />
}

function ImageSources({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [fallback, setFallback] = useState(false)
  // Only local JPG/PNG assets have generated siblings. Remote URLs and
  // already-modern formats must be requested exactly as supplied.
  const variants = !fallback && !/^(https?:|data:|blob:|\/\/)/i.test(src) && /\.(jpg|png)$/i.test(src)
  const base = src.replace(/\.(jpg|png)$/i, '')
  return <picture className="responsive-image">
    {variants && <source type="image/webp" media="(max-width: 600px)" srcSet={`${base}-mobile.webp`} />}
    {variants && <source type="image/webp" srcSet={`${base}.webp`} />}
    <img src={src} decoding="async" {...props} onError={event => {
      if (variants) setFallback(true)
      else onError?.(event)
    }} />
  </picture>
}
