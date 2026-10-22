/**
 * Os três botões de zoom no pé do gráfico (22/10/2026, pedido do Tiago):
 * afastar, voltar ao agora e aproximar. Valem para o gráfico simples
 * (PriceChart) e para o profissional (GraficoPro). No celular, onde não há
 * rodinha do mouse, é o jeito de mudar o zoom com um toque.
 */
const ICONE = {
  menos: 'M6 12h12',
  mais: 'M12 6v12M6 12h12',
  // a mira: volta para a vela de agora, no zoom de sempre
  centro: 'M12 4v3M12 17v3M4 12h3M17 12h3M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
}

interface Props {
  aoAfastar: () => void
  aoCentralizar: () => void
  aoAproximar: () => void
  podeAfastar?: boolean
  podeAproximar?: boolean
  style?: React.CSSProperties
}

export function ControlesDeZoom({ aoAfastar, aoCentralizar, aoAproximar, podeAfastar = true, podeAproximar = true, style }: Props) {
  const botao = (rotulo: string, d: string, fazer: () => void, ativo: boolean) => (
    <button type="button" title={rotulo} aria-label={rotulo} disabled={!ativo}
      // o toque no botão não pode virar arraste nem cursor do gráfico por baixo
      onPointerDown={(e) => e.stopPropagation()} onClick={fazer}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
    </button>
  )
  return (
    <div className="chart-zoom" role="toolbar" aria-label="Zoom do gráfico" style={style}>
      {botao('Afastar (mais velas)', ICONE.menos, aoAfastar, podeAfastar)}
      {botao('Voltar ao agora', ICONE.centro, aoCentralizar, true)}
      {botao('Aproximar (menos velas)', ICONE.mais, aoAproximar, podeAproximar)}
    </div>
  )
}
