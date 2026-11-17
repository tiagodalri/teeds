import { useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { ehImagem } from '../../core/imagem'
import type { OrigemDaCapa } from './CapaDaAula'
import { baixarImagem, JanelaDaCapa, type FonteExtra } from './JanelaDaCapa'
import './seletor-de-capa.css'

/**
 * A capa de uma aula ou de um curso no painel (16/11/2026). Uma capa para todos e,
 * onde há parceiros (GlobalFly: /n, /v, /d), uma capa própria para cada vitrine.
 * Cada miniatura mostra o que aquela vitrine vê DE VERDADE (a mesma regra da sala),
 * com a origem escrita embaixo. Prefixo de CSS: sc-.
 */

const NOMES: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }
export const nomeDaVitrine = (v: string) => (v ? NOMES[v] ?? `/${v}` : 'Todos')

const ORIGEM: Record<OrigemDaCapa, string> = {
  parceiro: 'Capa própria desta vitrine',
  'parceiro-codigo': 'Capa do parceiro que já vem na plataforma',
  enviada: 'Enviada por você, vale para todos',
  'padrao-codigo': 'Capa padrão da plataforma',
  codigo: 'Capa padrão da plataforma',
  desenhada: 'Capa desenhada com o título e a cor',
}

interface Props {
  rotulo: string
  proporcao: number
  capa?: string
  capas?: Record<string, string>
  /** O que a vitrine vê (mesma regra da sala). */
  resolver: (v: string) => { src: string | null; origem: OrigemDaCapa }
  amostra: (v: string) => ReactNode
  legenda?: { titulo: string; numero?: string }
  extras?: FonteExtra[]
  /** Envia a imagem recortada e devolve o endereço. */
  enviar: (b: Blob) => Promise<{ url: string; caminho: string }>
  /** alvo '' = todos; url null = tirar a capa enviada daquele alvo. */
  aoMudar: (alvo: string, url: string | null, caminho?: string | null) => void
  setErro: (e: string | null) => void
}

export function SeletorDeCapa({ rotulo, proporcao, capa, capas, resolver, amostra, legenda, extras, enviar, aoMudar, setErro }: Props) {
  const vitrines = ['', ...(MARCA.parceiros ?? [])]
  const [alvo, setAlvo] = useState('')
  const [janela, setJanela] = useState<{ inicial: Blob | null } | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [sobre, setSobre] = useState(false)
  const atual = resolver(alvo)
  const propria = alvo ? !!capas?.[alvo] : /^https?:\/\//i.test(capa ?? '')
  const comCapaDoParceiroNoCodigo = vitrines.filter((v) => v && resolver(v).origem === 'parceiro-codigo')

  const reenquadrar = async () => {
    if (!atual.src) return
    setAbrindo(true); setErro(null)
    try { setJanela({ inicial: await baixarImagem(atual.src) }) } catch (e) { setErro((e as Error).message) } finally { setAbrindo(false) }
  }

  return (
    <div className="sc">
      <div className="sc-cab">
        <span className="sc-rot">{rotulo}</span>
        {vitrines.length > 1 && <small>Uma capa para todos e, se quiser, uma diferente para cada parceiro.</small>}
      </div>

      {vitrines.length > 1 && (
        <div className="sc-vitrines" role="tablist" aria-label="Capa de quem">
          {vitrines.map((v) => {
            const r = resolver(v)
            const marcada = v ? !!capas?.[v] || r.origem === 'parceiro-codigo' : true
            return (
              <button key={v || 'todos'} type="button" role="tab" aria-selected={alvo === v} className={`sc-vitrine ${alvo === v ? 'on' : ''}`} onClick={() => setAlvo(v)}>
                <span className="sc-mini" style={{ aspectRatio: String(proporcao) }}>{amostra(v)}</span>
                <b>{nomeDaVitrine(v)}</b>
                <small>{v ? (marcada ? 'Própria' : 'Igual a todos') : 'Padrão'}</small>
              </button>
            )
          })}
        </div>
      )}

      <div className="sc-linha">
        <button type="button" className={`sc-amostra ${sobre ? 'sobre' : ''}`} style={{ aspectRatio: String(proporcao) }} onClick={() => setJanela({ inicial: null })}
          aria-label={`Trocar a capa${alvo ? ` de ${nomeDaVitrine(alvo)}` : ''}`}
          onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
          onDrop={(e) => { e.preventDefault(); setSobre(false); const f = [...e.dataTransfer.files].find((x) => ehImagem(x)); if (f) setJanela({ inicial: f }) }}>
          {amostra(alvo)}
          <span className="sc-trocar">{sobre ? 'Solte aqui' : 'Trocar'}</span>
        </button>
        <div className="sc-info">
          <b>{alvo ? `Vitrine ${nomeDaVitrine(alvo)} (/${alvo})` : vitrines.length > 1 ? 'Para todos os alunos' : 'Capa'}</b>
          <small className="sc-origem">{ORIGEM[atual.origem]}{alvo && !capas?.[alvo] && atual.origem !== 'parceiro-codigo' ? ': a mesma de todos' : ''}</small>
          <div className="sc-acoes">
            <button type="button" className="admin-primary" onClick={() => setJanela({ inicial: null })}>{propria ? 'Trocar capa' : alvo ? `Capa própria para ${nomeDaVitrine(alvo)}` : 'Enviar capa'}</button>
            {atual.src && <button type="button" className="admin-secundario" disabled={abrindo} onClick={() => void reenquadrar()}>{abrindo ? 'Abrindo…' : 'Reenquadrar'}</button>}
            {propria && <button type="button" className="admin-secundario" onClick={() => aoMudar(alvo, null)}>{alvo ? 'Usar a mesma de todos' : 'Voltar para a padrão'}</button>}
            {alvo && !capas?.[alvo] && atual.origem === 'parceiro-codigo' && /^https?:\/\//i.test(capa ?? '') && (
              <button type="button" className="admin-secundario" onClick={() => aoMudar(alvo, capa!)}>Usar a mesma de todos</button>
            )}
          </div>
          <small>Arraste uma imagem para a capa, ou clique nela. Dá para colar (⌘V) dentro da janela. {proporcao < 0.7 ? 'Formato em pé 2:3, como um pôster.' : 'Formato em pé 3:4.'}</small>
          {!alvo && comCapaDoParceiroNoCodigo.length > 0 && (
            <small className="sc-nota">{comCapaDoParceiroNoCodigo.map(nomeDaVitrine).join(' e ')} {comCapaDoParceiroNoCodigo.length === 1 ? 'tem' : 'têm'} capa própria: para trocar lá, escolha {comCapaDoParceiroNoCodigo.length === 1 ? 'o nome' : 'os nomes'} acima.</small>
          )}
        </div>
      </div>

      {janela && (
        <JanelaDaCapa titulo={alvo ? `Capa para a vitrine ${nomeDaVitrine(alvo)}` : 'Capa'} proporcao={proporcao} legenda={legenda} inicial={janela.inicial} extras={extras}
          aoFechar={() => setJanela(null)}
          aoUsar={async (b) => { const { url, caminho } = await enviar(b); aoMudar(alvo, url, caminho); setJanela(null) }} />
      )}
    </div>
  )
}
