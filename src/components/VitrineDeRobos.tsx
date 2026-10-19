import { useEffect, useState } from 'react'
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
 * regra de verdade da estratégia (a mesma do catálogo).
 *
 * "Por que <nome>?" abre a história: a aeronave e o robô lado a lado. A
 * história não tem números de propósito: os números estão na linha "Na
 * prática", que vem da regra viva (o painel pode mudar a regra sem mexer aqui).
 *
 * "Iniciar operações" abre o preparo já no robô. Nenhum cartão liga nada: as
 * operações só começam depois da confirmação, no fim do preparo.
 */

function IconePlay() {
  return (
    <svg className="vr-play" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="11" />
      <path d="M10 8.2v7.6l6-3.8z" />
    </svg>
  )
}

export function VitrineDeRobos({ onConfigurar }: { onConfigurar: () => void }) {
  const disponiveis = useRobosDisponiveis()
  const catalogo = useCatalogoCompleto()
  const vitrine = MARCA.vitrineDosRobos ?? {}
  const [historia, setHistoria] = useState<string | null>(null)
  const robos = IDENTIDADES.filter((i) => disponiveis === null || disponiveis.includes(i.id))
  const regra = (i: Identidade) => {
    const item = catalogo?.find((c) => c.id === i.id)
    return item ? descrever(i.id, item.parametros ?? parametrosPadrao(i.id)) : i.descricao
  }
  // Sem o prefixo da marca: "GF Raptor" (ou "GlobalFly Raptor", antes de 19/10) vira "Raptor".
  const nomeCurto = (i: Identidade) => i.nome.replace(new RegExp(`^(GF|${MARCA.prosa.split(' ')[0]})\\s+`, 'i'), '')
  const iniciar = (i: Identidade) => { pedirModeloDaVitrine(i.id); onConfigurar() }
  const base = `${import.meta.env.BASE_URL}robos-${MARCA.id}/`

  // Esc fecha a história aberta
  useEffect(() => {
    if (!historia) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setHistoria(null) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [historia])

  return (
    <section className="vr" aria-labelledby="vr-titulo">
      <header className="vr-cabeca">
        <div>
          <h3 id="vr-titulo">Escolha o seu robô</h3>
          <p>{robos.length} estratégias, cada uma com o jeito de voar da aeronave que lhe dá nome.</p>
        </div>
        <small>As operações só começam depois da sua confirmação.</small>
      </header>
      <div className="vr-grade" role="list">
        {robos.map((i) => {
          const v = vitrine[i.id]
          const nome = nomeCurto(i)
          const aberta = historia === i.id
          return (
            <article key={i.id} className={`vr-cartao ${aberta ? 'com-historia' : ''}`} role="listitem">
              <div className="vr-foto">
                <img src={`${base}${i.id}.webp`} srcSet={`${base}${i.id}-pequena.webp 640w, ${base}${i.id}.webp 1200w`}
                  sizes="(max-width: 700px) 82vw, (max-width: 1279px) 30vw, 20vw" alt="" loading="lazy" decoding="async" width="1200" height="750" />
                <span className="vr-foto-nome"><b>{nome}</b></span>
                {v?.historia && (
                  <button type="button" className="vr-porque" aria-expanded={aberta} aria-controls={`vr-historia-${i.id}`}
                    onClick={() => setHistoria(aberta ? null : i.id)}>
                    <span aria-hidden="true">✦</span> Por que {nome}?
                  </button>
                )}
              </div>

              <div className="vr-corpo">
                <span className="vr-chamada">{v?.aeronave ?? i.chamada}</span>
                {v?.gancho && <p className="vr-gancho">{v.gancho}</p>}
                <p className="vr-regra"><b>Na prática</b>{regra(i)}</p>
                <button type="button" className="vr-iniciar" onClick={() => iniciar(i)}>
                  <IconePlay /><span>Iniciar operações</span>
                </button>
              </div>

              {v?.historia && (
                <div id={`vr-historia-${i.id}`} className="vr-historia" role="region" aria-label={`Por que ${nome}`} aria-hidden={!aberta}
                  style={{ ['--foto' as string]: `url(${base}${i.id}-pequena.webp)` }}>
                  <div className="vr-historia-topo">
                    <span className="vr-chamada">Por que {nome}</span>
                    <button type="button" className="vr-fechar" onClick={() => setHistoria(null)} aria-label="Fechar a história" tabIndex={aberta ? 0 : -1}>×</button>
                  </div>
                  <h4>{v.aeronave.replace(/^Inspirado no /, '')}</h4>
                  <p>{v.historia}</p>
                  {/* a licença CC BY-SA pede o nome de quem fez a foto; domínio público não */}
                  {v.credito?.includes('CC') && <small className="vr-credito">Foto: {v.credito.replace(', ', ' · ')}</small>}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
