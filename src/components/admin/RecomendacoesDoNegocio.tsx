/**
 * As recomendações da I.A. dentro do Inteligência do negócio (16/11/2026, Tiago: "como a gente tem a
 * inteligência artificial integrada no nosso sistema, eu quero que tenha algumas recomendações geradas pela
 * IA sobre dicas que eu tenho que seguir para aumentar o markup... indicar determinado horário, determinada
 * inteligência artificial, determinada estratégia").
 *
 * A leitura é pedida no botão (cada pedido custa uma chamada à I.A.), roda em segundo plano na função
 * negocio-analise com os MESMOS números da tela, e fica guardada: quem abrir depois vê a última daquele
 * recorte (marca, parceiro e período), com quem pediu e quando.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { MARCA } from '../../marca'
import { ErroSemIA, pedirLeitura, ultimaLeitura, type AnaliseDoNegocio, type CategoriaDaDica } from '../../core/teeds/negocio'

const CATEGORIA: Record<CategoriaDaDica, string> = { horario: 'Horário', ia: 'Estratégia', manual: 'Manual', lives: 'Lives', clientes: 'Clientes', banca: 'Banca' }
const IMPACTO = { alto: 'Impacto alto', medio: 'Impacto médio', baixo: 'Impacto baixo' } as const
const fmtQuando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function RecomendacoesDoNegocio({ sessao, marca, parceiro, periodo, de, ate, rotulo }: {
  sessao: SessaoTeeds; marca: string; parceiro: string
  /** A chave do recorte ("30d", "7 dias"...): a leitura guardada é a desse período. */
  periodo: string
  de: number; ate: number; rotulo: string
}) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const [analise, setAnalise] = useState<AnaliseDoNegocio | null>(null)
  const [temIA, setTemIA] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const chave = `${marca}|${parceiro}|${periodo}`
  const umaIA = MARCA.vocabularioIA ? 'I.A.' : 'robô'

  // a última leitura guardada deste recorte
  useEffect(() => {
    let vivo = true
    setAnalise(null); setErro(null); setCarregando(true)
    void ultimaLeitura(sessaoRef.current, marca, parceiro, periodo)
      .then((r) => { if (vivo) { setAnalise(r.analise); setTemIA(r.temIA) } })
      .catch(() => { /* sem a última, o cartão fica no convite */ })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  // enquanto uma leitura estiver sendo feita, pergunta de novo a cada 3 s até ficar pronta
  useEffect(() => {
    if (analise?.situacao !== 'analisando') return
    let vivo = true
    const t = window.setInterval(() => {
      void ultimaLeitura(sessaoRef.current, marca, parceiro, periodo).then((r) => { if (vivo && r.analise) setAnalise(r.analise) }).catch(() => undefined)
    }, 3000)
    return () => { vivo = false; window.clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise?.situacao, analise?.id, chave])

  const pedir = (forcar: boolean) => {
    if (pedindo) return
    setPedindo(true); setErro(null)
    void pedirLeitura(sessaoRef.current, marca, parceiro, periodo, de, ate, rotulo, forcar)
      .then((r) => { setAnalise(r.analise); setTemIA(r.temIA) })
      .catch((e) => { if (e instanceof ErroSemIA) setTemIA(false); else setErro((e as Error).message) })
      .finally(() => setPedindo(false))
  }

  const analisando = analise?.situacao === 'analisando'
  const pronta = analise?.situacao === 'pronta' && analise.dados ? analise.dados : null
  const falhou = analise?.situacao === 'erro' ? (analise.erro || 'A leitura não ficou pronta.') : erro

  return (
    <div className={`ngc-bloco ngc-ia${pronta ? ' pronta' : ''}`} aria-busy={analisando || carregando}>
      <div className="ngc-ia-cab">
        <div>
          <h4><i className="ngc-ia-marca" aria-hidden="true">✦</i> Recomendações da I.A. <small>{rotulo}</small></h4>
          {pronta && analise && <small className="ngc-ia-quando">Gerada {analise.prontaEm ? `em ${fmtQuando.format(Date.parse(analise.prontaEm))}` : ''}{analise.quem ? ` por ${analise.quem}` : ''} · com os números deste painel</small>}
        </div>
        {temIA && !analisando && !carregando && (
          <button type="button" className={`ngc-ia-botao${pronta ? ' discreto' : ''}`} onClick={() => pedir(Boolean(pronta) || Boolean(falhou))} disabled={pedindo}>
            {pedindo ? 'Pedindo…' : pronta ? 'Gerar de novo' : falhou ? 'Tentar de novo' : 'Gerar recomendações'}
          </button>
        )}
      </div>

      {carregando ? <div className="ngc-esq"><i className="vg-esq" /><i className="vg-esq" /></div>
        : !temIA ? <p className="ngc-ia-texto">Falta ligar a chave da I.A. nesta plataforma. Ela é colada uma vez só em <b>Administração › Anúncios › Leitura da I.A.</b> e passa a valer aqui também.</p>
        : analisando ? (
          <p className="ngc-ia-texto ngc-ia-pulso"><i aria-hidden="true" /> A I.A. está lendo os números do período: manual x {umaIA}, horários, clientes e lives. Leva cerca de um minuto; pode continuar usando o painel.</p>
        ) : pronta ? <>
          <p className="ngc-ia-resumo">{pronta.resumo}</p>
          <div className={`ngc-ia-veredito ${pronta.veredito.onde}`}>
            <span>{pronta.veredito.onde === 'ia' ? `Onde investir: ${umaIA}` : pronta.veredito.onde === 'manual' ? 'Onde investir: manual' : pronta.veredito.onde === 'as_duas' ? 'Onde investir: nas duas frentes' : 'Ainda é cedo para escolher um lado'}</span>
            <b>{pronta.veredito.titulo}</b>
            <p>{pronta.veredito.texto}</p>
          </div>
          <ol className="ngc-ia-lista">
            {pronta.recomendacoes.map((r, i) => (
              <li key={i}>
                <span className="ngc-ia-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <b>{r.titulo}</b>
                  <p><em>Por quê:</em> {r.porque}</p>
                  <p><em>Como fazer:</em> {r.como}</p>
                  <span className="ngc-ia-tags"><i>{CATEGORIA[r.categoria] ?? 'Geral'}</i><i className={`imp ${r.impacto}`}>{IMPACTO[r.impacto] ?? 'Impacto'}</i></span>
                </div>
              </li>
            ))}
          </ol>
          {pronta.lives && <div className="ngc-ia-nota"><b>Lives</b><p>{pronta.lives}</p></div>}
          {pronta.alertas.length > 0 && (
            <div className="ngc-ia-nota alerta"><b>Antes de agir</b><ul>{pronta.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
          <small className="ngc-leg">Leitura feita por I.A. a partir dos números acima. Ela aponta caminhos; a decisão é do time.</small>
        </> : falhou ? <p className="vg-erro" role="alert">{falhou}</p>
        : <p className="ngc-ia-texto">A I.A. lê este painel inteiro e devolve um plano: em que lado investir, que horário e que estratégia divulgar, o que as lives ensinaram e o que fazer com os clientes parados.</p>}
      {erro && pronta && <p className="vg-erro" role="alert">{erro}</p>}
    </div>
  )
}
