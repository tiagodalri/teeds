import { Component, type ReactNode } from 'react'

/** Isola falhas do painel administrativo sem desmontar a plataforma. */
export class MonitoramentoBoundary extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false }
  static getDerivedStateFromError() { return { falhou: true } }
  componentDidCatch(error: Error) { console.error('[monitoramento] falha de renderização:', error.name) }
  render() {
    if (!this.state.falhou) return this.props.children
    return <section className="ger"><div className="adm-vazio" role="alert">
      <h2>Não foi possível abrir o monitoramento</h2>
      <p>Atualize a página para carregar a versão mais recente. Você também pode continuar usando as outras áreas pelo menu.</p>
      <button onClick={() => window.location.reload()}>Atualizar página</button>
    </div></section>
  }
}
