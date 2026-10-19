import { useEffect, useState } from 'react'
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
/**
 * O que o motor faz por trás, em selos (19/10/2026, pedido do Tiago: "se não
 * citar as análises, podem achar que são robôs comuns"). Só o que o robô
 * FAZ de verdade, decidido pela regra viva: quem tem loss virtual conta a
 * sequência antes de entrar; o Raptor troca de lado na perda; todos leem
 * cada tick, calculam a recuperação pelo pagamento real e param na meta e
 * no limite. Robô de entrada direta não ganha uma análise de entrada que
 * não faz. Três selos no máximo, para o cartão não virar bula.
 */
function selosDoRobo(id: string, p: ParametrosDoRobo): Array<{ texto: string; explica: string }> {
  const tick = { texto: 'Lê cada tick ao vivo', explica: 'Acompanha o mercado preço a preço e decide no exato momento de cada novo dígito.' }
  const sequencia = { texto: 'Analisa a sequência', explica: `Antes de entrar, confere se saíram ${p.entrada.lossVirtual} dígitos seguidos fora da faixa. Só então abre a operação.` }
  const lado = { texto: 'Troca de lado na perda', explica: 'Depois de uma perda, muda para os dígitos altos para recuperar e volta à rota em seguida.' }
  const recuperacao = p.recuperacao.escada.tipo === 'tabela'
    ? { texto: 'Recuperação em degraus', explica: 'A próxima entrada segue uma escada definida, degrau a degrau, até fechar a sequência.' }
    : { texto: 'Calcula a recuperação', explica: 'A entrada seguinte sai do pagamento real do contrato, para cobrir a perda e fechar no lucro.' }
  const freio = { texto: 'Para na meta e no limite', explica: 'Encerra sozinho quando bate a sua meta ou o seu limite de perda.' }
  if (RECUPERA_EM[id]) return [tick, lado, recuperacao]
  if (p.entrada.lossVirtual > 0) return [sequencia, tick, recuperacao]
  return [tick, recuperacao, freio]
}

function NaPratica({ id, parametros, frase }: { id: string; parametros: ParametrosDoRobo; frase: string }) {
  const ganham = digitosQueGanham(parametros.contrato)
  const espera = parametros.entrada.lossVirtual
  const recupera = RECUPERA_EM[id]
  return (
    <div className="vr-pratica" role="group" aria-label={`Na prática: ${frase}`}>
      <b className="vr-pratica-rot" aria-hidden="true">Na prática</b>
      <div className="vr-digitos" aria-hidden="true">
        {Array.from({ length: 10 }, (_, d) => <span key={d} className={ganham.includes(d) ? 'ganha' : ''}>{d}</span>)}
      </div>
      <ul className="vr-fatos" aria-hidden="true">
        <li><i className="ganha" /><span>Ganha com <b>{ganham.length === 10 ? 'qualquer dígito' : ganham.length > 3 ? `${ganham[0]} a ${ganham[ganham.length - 1]}` : lista(ganham)}</b></span><em>{ganham.length} de 10</em></li>
        <li><i className="entra" /><span>{espera === 0 ? <><b>Entra direto</b>, sem esperar</> : <>Espera <b>{espera === 1 ? '1 dígito' : `${espera} dígitos seguidos`}</b> fora da faixa e entra</>}</span></li>
        {recupera && <li><i className="recupera" /><span>Se perder, <b>recupera no {lista(recupera)}</b></span></li>}
      </ul>
      <div className="vr-selos" aria-label="Em tempo real">
        <span className="vr-pratica-rot">Em tempo real</span>
        <ul>
          {selosDoRobo(id, parametros).map((x) => (
            <li key={x.texto} tabIndex={0} title={x.explica} aria-label={`${x.texto}: ${x.explica}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2.5-6 5 12 2.5-6h3" /></svg>{x.texto}
            </li>
          ))}
        </ul>
      </div>
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
