/**
 * O avião da GlobalFly: visto de cima, bico para a direita. Desenho
 * geométrico (fuselagem fina, asa enflechada, empenagem curta), uma cor só,
 * para conversar com o traço do monograma e não virar ilustração. Quem usa
 * gira na diagonal da marca (32°) e escolhe a cor por `color`.
 */
export function Aviao({ className = '', largura = 44 }: { className?: string; largura?: number }) {
  return (
    <svg className={className} viewBox="0 0 64 40" width={largura} height={largura * 40 / 64} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M62 20C61.6 18.4 58.5 17.6 54 17.6H38L25 3.5h-4l8 14.3-16 .4-5.5-6.2H5l2 6.6-3 .6v1.6l3 .6-2 6.6h2.5l5.5-6.2 16 .4-8 14.3h4l13-14.1h16c4.5 0 7.6-.8 8-2.4Z" />
    </svg>
  )
}
