/**
 * Centro de estudo — a página do dono, dentro da Administração.
 *
 * Aqui mora a análise: comparação entre as plataformas (só na Teeds, que é
 * a master) e, abaixo, o histórico da plataforma em foco — markup por dia,
 * por hora e por robô, no período escolhido.
 *
 * A tela de Robôs ficou só com a faixa do agora. Separar os dois foi o
 * redesenho de 24/09/2026: análise e operação pedem cabeças diferentes.
 */
import { CentroDeEstudoHistorico } from './CentroDeEstudoHistorico'
import { AdminPlataformas } from './AdminPlataformas'
import { ehMaster } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCAS } from '../marca/marcas'

export function AdminCentroDeEstudo({ sessao, marcaFoco, onAbrirMarca }: {
  sessao: SessaoTeeds
  marcaFoco: string
  onAbrirMarca: (id: string) => void
}) {
  const nome = MARCAS[marcaFoco]?.prosa ?? marcaFoco
  return (
    <>
      {ehMaster() && <AdminPlataformas sessao={sessao} onAbrirMarca={onAbrirMarca} />}
      <section className="admin-card ce-card">
        <header>
          <div>
            <span className="rot">{nome}</span>
            <h3>Histórico da plataforma</h3>
          </div>
        </header>
        <div className="ce-card-corpo">
          <CentroDeEstudoHistorico sessao={sessao} moeda="US$" />
        </div>
      </section>
    </>
  )
}
