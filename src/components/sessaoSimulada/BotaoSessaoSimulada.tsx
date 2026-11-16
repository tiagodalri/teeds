/** O ícone laranja do topo da aba das I.A. no modo simulado: abre a mesa de termômetros (ou edita a sessão que está na tela). */
export function BotaoSessaoSimulada({ ativo, aoAbrir }: { ativo: boolean; aoAbrir: () => void }) {
  const rotulo = ativo ? 'Editar a sessão simulada' : 'Abrir a simulação'
  return (
    <button type="button" className={`rsim-abrir ssim-abrir ${ativo ? 'on' : ''}`} onClick={aoAbrir} aria-label={rotulo} title={rotulo}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="M10 8.5v7l5.5-3.5z" /></svg>
    </button>
  )
}
