import { useEffect, useState, type ReactNode } from 'react'
import { IDENTIDADES, type Identidade } from '../core/deriv/branding'
import { descrever, digitosQueGanham, parametrosPadrao, type ParametrosDoRobo } from '../core/deriv/parametros'
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

/** O Göreme/Raptor troca de lado depois de uma perda: recupera nos dígitos altos (strategies.ts). */
const RECUPERA_EM: Record<string, number[]> = { goreme: [7, 8, 9] }

const lista = (ds: number[]) => ds.length > 1 ? `${ds.slice(0, -1).join(', ')} e ${ds[ds.length - 1]}` : String(ds[0] ?? '')

/**
 * "Na prática" em uma olhada (19/10/2026, pedido do Tiago: a frase era
 * longa e não dizia de cara com que dígito o robô ganha). Os dez dígitos,
 * com os que ganham acesos, e duas linhas: em quantos ganha e quando entra.
 * Tudo sai da regra viva: se o painel mudar a barreira ou o loss virtual,
 * o cartão muda junto. A frase completa continua para o leitor de tela.
 */
type Etapa = { titulo: string; texto: ReactNode }

const faixa = (ds: number[]) => (ds.length > 3 ? `${ds[0]} a ${ds[ds.length - 1]}` : lista(ds))
const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * O plano de voo da I.A. (19/10/2026, pedido do Victor e do Tiago: os selos
 * eram iguais para todos; cada robô precisa contar o próprio jeito de operar).
 * Três etapas por robô, todas verdadeiras e tiradas da regra viva: faixa de
 * dígitos, loss virtual, se segue a sequência, troca de lado (Raptor) e a
 * margem da recuperação. "A I.A." é o nome do produto no menu; nada aqui diz
 * que ela aprende, prevê ou acerta, porque não é o que o motor faz.
 */
function planoDeVoo(id: string, p: ParametrosDoRobo): Etapa[] {
  const ganham = digitosQueGanham(p.contrato)
  const fora = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !ganham.includes(d))
  const n = p.entrada.lossVirtual
  const margem = p.recuperacao.modos.conservador.margem
  const tabela = p.recuperacao.escada.tipo === 'tabela'
  const recalcula: Etapa = tabela
    ? { titulo: 'Recupera em degraus', texto: <>Se uma entrada não vem, a próxima segue a <b>escada definida</b>, degrau a degrau, até fechar a sequência.</> }
    : { titulo: 'Recalcula na hora', texto: <>Se uma entrada não vem, a I.A. calcula a próxima pelo <b>pagamento real do contrato</b>, para cobrir a anterior{margem >= 0.08 ? <> e fechar com cerca de <b>{pct(margem)} sobre a entrada</b></> : ' e fechar no lucro'}.</> }

  if (RECUPERA_EM[id]) {
    const alvo = RECUPERA_EM[id]
    return [
      { titulo: 'Cobre quase o painel', texto: <>Entra em todo tick, com <b>só o {lista(fora)} contra</b>.</> },
      { titulo: 'Troca de lado na perda', texto: <>Se o {lista(fora)} aparece, a I.A. muda de contrato e mira o <b>{lista(alvo)}</b>, que pagam bem mais.</> },
      { titulo: 'Volta à rota', texto: <>Recuperou, retorna para a cobertura ampla e segue operando.</> },
    ]
  }
  if (n > 0) {
    return [
      { titulo: 'Observa antes de entrar', texto: <>A I.A. lê cada dígito e conta quantos saem <b>fora da faixa</b>, de {faixa(fora)}.</> },
      { titulo: `Espera ${n === 1 ? '1 sinal' : `${n} sinais seguidos`}`, texto: <>Só abre a operação depois de <b>{n === 1 ? '1 dígito' : `${n} dígitos seguidos`}</b> fora da faixa, mirando o <b>{lista(ganham)}</b>.</> },
      p.entrada.sequenciaSemAnalise
        ? { titulo: 'Segue até fechar', texto: <>Entrou, acompanha a sequência até o fim, sem esperar de novo a cada entrada.</> }
        : { titulo: 'Confere a cada entrada', texto: <>Depois de cada operação, volta a esperar o sinal antes de entrar outra vez.</> },
    ]
  }
  const ponta = ganham[0] === 0 ? 'a parte baixa' : ganham[ganham.length - 1] === 9 ? 'a parte alta' : 'o meio'
  return [
    { titulo: 'Decola na hora', texto: <>Sem esperar sinal: entra direto e ocupa <b>{ponta} do painel</b>, de {faixa(ganham)}.</> },
    { titulo: 'Decide em 1 tick', texto: <>Cada operação se resolve <b>no dígito seguinte</b>; {fora.length === 1 ? `só o ${fora[0]} fica contra` : `os dígitos de ${faixa(fora)} ficam contra`}.</> },
    recalcula,
  ]
}

function PlanoDeVoo({ id, parametros }: { id: string; parametros: ParametrosDoRobo }) {
  return (
    <div className="vr-plano">
      <span className="vr-pratica-rot"><i className="vr-ao-vivo" aria-hidden="true" />Plano de voo da I.A.</span>
      <ol>
        {planoDeVoo(id, parametros).map((e, k) => (
          <li key={k}><b>{e.titulo}</b><span>{e.texto}</span></li>
        ))}
      </ol>
    </div>
  )
}

function NaPratica({ id, parametros, frase }: { id: string; parametros: ParametrosDoRobo; frase: string }) {
  const ganham = digitosQueGanham(parametros.contrato)
  return (
    <div className="vr-pratica" role="group" aria-label={`Na prática: ${frase}`}>
      <b className="vr-pratica-rot" aria-hidden="true">Na prática</b>
      <div className="vr-digitos" aria-hidden="true">
        {Array.from({ length: 10 }, (_, d) => <span key={d} className={ganham.includes(d) ? 'ganha' : ''}>{d}</span>)}
      </div>
      <ul className="vr-fatos" aria-hidden="true">
        <li><i className="ganha" /><span>Ganha com <b>{ganham.length === 10 ? 'qualquer dígito' : ganham.length > 3 ? `${ganham[0]} a ${ganham[ganham.length - 1]}` : lista(ganham)}</b></span><em>{ganham.length} de 10</em></li>
      </ul>
      <PlanoDeVoo id={id} parametros={parametros} />
    </div>
  )
}

export function VitrineDeRobos({ onConfigurar }: { onConfigurar: () => void }) {
  const disponiveis = useRobosDisponiveis()
  const catalogo = useCatalogoCompleto()
  const vitrine = MARCA.vitrineDosRobos ?? {}
  const [historia, setHistoria] = useState<string | null>(null)
  const robos = IDENTIDADES.filter((i) => disponiveis === null || disponiveis.includes(i.id))
  const parametrosDe = (i: Identidade) => catalogo?.find((c) => c.id === i.id)?.parametros ?? parametrosPadrao(i.id)
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
                <NaPratica id={i.id} parametros={parametrosDe(i)} frase={regra(i)} />
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
