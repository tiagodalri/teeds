/**
 * Centro de estudo — a página do dono, dentro da Administração.
 *
 * Aqui mora a análise. Ela muda com o que está em foco no topo:
 *
 *  - na REDE, abre com a soma das plataformas e a comparação entre elas;
 *  - numa plataforma, vai direto ao histórico dela, com um caminho de volta
 *    para a comparação.
 *
 * A tela de Robôs ficou só com a faixa do agora. Separar os dois foi o
 * redesenho de 24/09/2026: análise e operação pedem cabeças diferentes.
 */
import { CentroDeEstudoHistorico } from './CentroDeEstudoHistorico'
import { OrigemDasOperacoes } from './OrigemDasOperacoes'
import { AdminPlataformas } from './AdminPlataformas'
import { ehMaster, REDE } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCAS } from '../marca/marcas'

export function AdminCentroDeEstudo({ sessao, marcaFoco, onAbrirMarca }: {
  sessao: SessaoTeeds
  marcaFoco: string
  onAbrirMarca: (id: string) => void
}) {
  const naRede = marcaFoco === REDE
  const nome = naRede ? 'A rede' : (MARCAS[marcaFoco]?.prosa ?? marcaFoco)
  return (
    <>
      {naRede && <AdminPlataformas sessao={sessao} marcaFoco={marcaFoco} onAbrirMarca={onAbrirMarca} />}
      <OrigemDasOperacoes sessao={sessao} naRede={naRede} />
      <section className="admin-card ce-card">
        <header>
          <div>
            <span className="rot">{nome}</span>
            <h3>{naRede ? 'Histórico da rede' : 'Histórico da plataforma'}</h3>
          </div>
          {!naRede && ehMaster() && (
            <button type="button" onClick={() => onAbrirMarca(REDE)}>Comparar com as outras →</button>
          )}
        </header>
        <div className="ce-card-corpo">
          <CentroDeEstudoHistorico sessao={sessao} moeda="US$" />
        </div>
      </section>
    </>
  )
}
