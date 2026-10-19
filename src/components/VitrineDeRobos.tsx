import { IDENTIDADES, type Identidade } from '../core/deriv/branding'
import { descrever, parametrosPadrao } from '../core/deriv/parametros'
import { useCatalogoCompleto, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { MARCA } from '../marca'
import { pedirModeloDaVitrine } from './RobotSetup'
import './vitrine-robos.css'

/**
 * A vitrine da tela Robôs (19/10/2026, GlobalFly): quem ainda não tem robô
 * ligado vê os modelos de cara, um cartão por robô, em vez de um quadro vazio
 * com um botão. O cartão leva a foto da aeronave que deu nome ao robô e a
 * regra de verdade da estratégia (a mesma do catálogo); "Configurar" abre o
 * preparo já nele. Nenhum cartão liga nada: as operações só começam depois
 * da confirmação, no fim do preparo.
 */
export function VitrineDeRobos({ onConfigurar }: { onConfigurar: () => void }) {
  const disponiveis = useRobosDisponiveis()
  const catalogo = useCatalogoCompleto()
  const vitrine = MARCA.vitrineDosRobos ?? {}
  const robos = IDENTIDADES.filter((i) => disponiveis === null || disponiveis.includes(i.id))
  const regra = (i: Identidade) => {
    const item = catalogo?.find((c) => c.id === i.id)
    return item ? descrever(i.id, item.parametros ?? parametrosPadrao(i.id)) : i.descricao
  }
  const nomeCurto = (i: Identidade) => i.nome.replace(new RegExp(`^${MARCA.prosa.split(' ')[0]}\\s+`, 'i'), '')
  const configurar = (i: Identidade) => { pedirModeloDaVitrine(i.id); onConfigurar() }
  const base = `${import.meta.env.BASE_URL}robos-${MARCA.id}/`

  return (
    <section className="vr" aria-labelledby="vr-titulo">
      <header className="vr-cabeca">
        <div>
          <h3 id="vr-titulo">Escolha o seu robô</h3>
          <p>{robos.length} estratégias prontas. Você define entrada, meta e limite antes de ligar.</p>
        </div>
        <small>As operações só começam depois da sua confirmação.</small>
      </header>
      <div className="vr-grade" role="list">
        {robos.map((i) => (
          <article key={i.id} className="vr-cartao" role="listitem">
            <button type="button" className="vr-foto" onClick={() => configurar(i)} aria-label={`Configurar o ${nomeCurto(i)}`} tabIndex={-1}>
              <img src={`${base}${i.id}-pequena.webp`} srcSet={`${base}${i.id}-pequena.webp 384w, ${base}${i.id}.webp 768w`}
                sizes="(max-width: 700px) 92vw, 320px" alt="" loading="lazy" width="384" height="252" />
              <span className="vr-foto-nome"><b>{nomeCurto(i)}</b></span>
            </button>
            <div className="vr-corpo">
              <span className="vr-chamada">{vitrine[i.id]?.aeronave ?? i.chamada}</span>
              <p>{regra(i)}</p>
              <button type="button" className="vr-configurar" onClick={() => configurar(i)}>
                Configurar <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="vr-nota">Nenhuma estratégia garante resultado. Os robôs da mesma conta compartilham o saldo.</p>
    </section>
  )
}
