import type { WorkspacePage } from '../WorkspaceNav'
import { Monograma } from '../marca/Monograma'
import { abrirSuporte } from '../../core/teeds/suporte'
import { alternarValores, MASCARA, useValoresOcultos } from '../../core/privacidade'
import { MARCA } from '../../marca'
import { InstrumentoDoDia } from './InstrumentoDoDia'
import './inicio.css'
import { dataCurta } from '../../core/datas'

/**
 * A home, "painel de bordo" (21/10/2026, aprovada pelo Tiago em mockup):
 *
 *  - o painel em Azul GF: saudação, saldo com o olhinho, o resumo do dia e,
 *    à direita, o instrumento do plano do dia (o arco do limite à meta, com
 *    o avião no resultado de agora). Sem plano, o instrumento é o formulário;
 *  - o fio de ouro na diagonal do monograma (manual, pág. 18) e o monograma
 *    em marca d'água a 4% (pág. 8);
 *  - "Sua frota": os jatos de cada I.A. em foto; a que está no ar ganha o
 *    contorno verde e o resultado ao vivo; tocar em outra abre o preparo nela;
 *  - "Para você": a aula em destaque e os atalhos (treino, comunidade,
 *    depósito); mercado e notícias na coluna da direita.
 *
 * "Confiança sem euforia": os números são do que já aconteceu, nunca
 * previsão. O componente só desenha; quem chama entrega os dados.
 */

export interface DadosDoInicio {
  nome: string
  conta: { conectada: boolean; demo: boolean; saldo: number | null; moeda: string }
  /** null = ainda sem operação hoje */
  hoje: { resultado: number; operacoes: number; vitorias: number; derrotas: number } | null
  /** Meta e limite em dólar; null = ainda não definidos. */
  plano: { meta: number; limite: number } | null
  /** As I.A.s da marca, na ordem da casa; as que estão no ar trazem o resultado. */
  frota: Array<{ id: string; nome: string; chamada: string; noAr: boolean; operando: boolean; resultado: number; analise: { n: number; alvo: number } | null }>
  cotacoes: Array<{ id: string; nome: string; valor: string; variacao: number; serie: number[] }>
  manchetes: Array<{ titulo: string; fonte: string; quando: string; link?: string }>
  aula: { modulo: string; titulo: string; capa: string; feitas: number; total: number } | null
  treino: { noAr: boolean; apresentador?: string } | null
  jornada: { deriv: boolean; demo: boolean; gestao: boolean; primeiraIa: boolean }
}

interface Props {
  d: DadosDoInicio
  aoIr: (tela: WorkspacePage) => void
  aoConectar?: () => void
  aoSalvarPlano: (meta: number, limite: number) => void
  aoPrepararRobo: (id: string) => void
}

const numero = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const saudacao = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const hojeExtenso = () => dataCurta(new Date())
/** Cashier da Deriv: depósito e saque são sempre na conta da pessoa, na corretora. */
const CAIXA_DERIV = 'https://app.deriv.com/cashier/deposit'
const FOTOS = `${import.meta.env.BASE_URL}robos-globalfly/`

/** Linha pequena de uma série (cotação). */
function Curva({ serie, classe }: { serie: number[]; classe: string }) {
  if (serie.length < 2) return <svg className={`in-curva ${classe}`} viewBox="0 0 100 32" aria-hidden="true" />
  const min = Math.min(...serie), max = Math.max(...serie), amp = max - min || 1
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${30 - ((v - min) / amp) * 26}`).join(' ')
  return <svg className={`in-curva ${classe}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} /></svg>
}

const ICONE = {
  manual: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
  ia: 'M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z M19 15v4 M17 17h4',
  gestao: 'M5 20V10M12 20V4M19 20v-7',
  aulas: 'M4 5h7a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z',
  deposito: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14',
  ajuda: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01',
  check: 'M5 12.5l4.2 4.2L19 7',
  seta: 'M9 6l6 6-6 6',
  olho: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  olhoFechado: 'M3 3l18 18M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  video: 'M3 7a2 2 0 012-2h9a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM16 10l5-3v10l-5-3',
  grupo: 'M17 20h5v-2a3 3 0 00-5.4-1.8M9 20H2v-2a4 4 0 018 0v2M12 7a3 3 0 11-6 0 3 3 0 016 0zM20 9a2 2 0 11-4 0 2 2 0 014 0z',
  play: 'M8 5.5v13l10.5-6.5z',
}
const Icone = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export function InicioPanel({ d, aoIr, aoConectar, aoSalvarPlano, aoPrepararRobo }: Props) {
  const ocultos = useValoresOcultos()
  const conectar = () => (aoConectar ? aoConectar() : aoIr('operar'))
  const moeda = d.conta.moeda
  const h = d.hoje
  const acerto = h && h.operacoes > 0 ? Math.round((h.vitorias / h.operacoes) * 100) : null
  const primeiro = d.nome.trim().split(/\s+/)[0]
  const sinal = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '')

  // a jornada: o passo do plano mora no instrumento; os outros, numa faixa fina
  const passos = [
    { feito: d.jornada.deriv, titulo: 'Conecte sua Deriv', fazer: conectar },
    { feito: d.jornada.demo, titulo: 'Treine na conta demo', fazer: () => aoIr('operar') },
    { feito: d.jornada.gestao, titulo: 'Monte o plano do dia', fazer: () => document.getElementById('in-instr-titulo')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
    { feito: d.jornada.primeiraIa, titulo: 'Ligue sua primeira I.A.', fazer: () => aoIr('robos') },
  ]
  const faltam = passos.filter((p) => !p.feito)
  const soFaltaOPlano = faltam.length === 1 && !d.jornada.gestao
  const proximo = faltam.find((p) => p !== passos[2]) ?? null

  const noAr = d.frota.filter((r) => r.noAr)
  const frota = [...d.frota].sort((a, b) => Number(b.noAr) - Number(a.noAr))
  const subFrota = noAr.length === 0 ? 'Nenhuma I.A. no ar · escolha uma e dê o play'
    : noAr.length === 1 ? `1 I.A. no ar · ${noAr[0].nome.replace(/^(GF|GlobalFly)\s+/i, '')} ${noAr[0].operando ? 'operando' : 'analisando o mercado'}`
    : `${noAr.length} I.A.s no ar`

  return (
    <div className="in">
      {/* ------------------------------------------------ o painel */}
      <section className={`in-painel ${d.conta.conectada ? '' : 'sem-conta'}`} aria-labelledby="in-ola">
        <i className="in-eixo" aria-hidden="true" />
        <Monograma variante="marca-dagua" tamanho={420} className="in-painel-marca" />

        <div className="in-painel-conta">
          <header className="in-conta-topo">
            <Monograma tamanho={42} className="in-conta-mono" />
            <div>
              <h1 id="in-ola">{saudacao()}{primeiro ? `, ${primeiro}` : ''}</h1>
              <span className="in-conta-data">{hojeExtenso()}</span>
            </div>
            {d.conta.conectada && (
              <button type="button" className={`in-olho ${ocultos ? 'fechado' : ''}`} onClick={alternarValores} aria-pressed={ocultos}
                aria-label={ocultos ? 'Mostrar valores' : 'Ocultar valores'} title={ocultos ? 'Mostrar valores' : 'Ocultar valores'}>
                <Icone d={ocultos ? ICONE.olhoFechado : ICONE.olho} />
              </button>
            )}
          </header>

          {d.conta.conectada ? (
            <>
              <div className="in-saldo">
                <span className="in-saldo-rot">Saldo disponível <i className={d.conta.demo ? 'demo' : 'real'}>{d.conta.demo ? 'Conta demo' : 'Conta real'}</i></span>
                <b className={`in-saldo-valor ${ocultos ? 'oculto' : ''}`} aria-live="polite">
                  <small>{moeda}</small>{d.conta.saldo === null ? <span className="in-esqueleto" aria-label="carregando" /> : ocultos ? MASCARA : numero(d.conta.saldo)}
                </b>
              </div>
              <dl className="in-trio">
                <div><dt>Hoje</dt><dd className={!h || ocultos ? '' : h.resultado >= 0 ? 'sobe' : 'cai'}>{!h ? '—' : ocultos ? MASCARA : `${sinal(h.resultado)}${numero(h.resultado)}`}</dd></div>
                <div><dt>Operações</dt><dd>{h?.operacoes ?? 0}</dd></div>
                <div><dt>Acerto</dt><dd>{acerto === null ? '—' : `${acerto}%`}</dd></div>
              </dl>
            </>
          ) : (
            <div className="in-saldo">
              <span className="in-saldo-rot">Primeiro passo</span>
              <b className="in-conta-chamada">Conecte a sua conta da corretora</b>
              <p>O saldo e as operações ficam na sua conta da Deriv. A {MARCA.prosa} só se conecta a ela, com o login oficial.</p>
            </div>
          )}

          <div className="in-painel-acoes">
            {d.conta.conectada ? (
              <>
                <button type="button" className="in-pilula ouro" onClick={() => aoIr('robos')}><Icone d={ICONE.ia} />Ligar I.A.</button>
                <button type="button" className="in-pilula" onClick={() => aoIr('operar')}><Icone d={ICONE.manual} />Operar</button>
                <a className="in-pilula" href={CAIXA_DERIV} target="_blank" rel="noopener noreferrer"><Icone d={ICONE.deposito} />Depositar</a>
              </>
            ) : (
              <>
                <button type="button" className="in-pilula ouro" onClick={conectar}>Conectar minha Deriv</button>
                {MARCA.afiliado && <a className="in-pilula" href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>}
              </>
            )}
          </div>
        </div>

        <InstrumentoDoDia key={d.plano ? `${d.plano.meta}|${d.plano.limite}` : 'sem-plano'} plano={d.plano} resultado={h ? h.resultado : null} moeda={moeda} ocultos={ocultos}
          ultimoPasso={soFaltaOPlano} aoSalvar={aoSalvarPlano} aoVerIas={() => aoIr('robos')} />
      </section>

      {/* ------------------------------------------------ atalhos (celular: a fileira de app de banco) */}
      <nav className="in-acoes" aria-label="Ações rápidas">
        {[
          { id: 'ia', rotulo: 'Ligar I.A.', icone: ICONE.ia, principal: true, fazer: () => aoIr('robos') },
          { id: 'manual', rotulo: 'Operar', icone: ICONE.manual, fazer: () => aoIr('operar') },
          { id: 'gestao', rotulo: 'Gerenciar', icone: ICONE.gestao, fazer: () => aoIr('gerenciamento') },
          { id: 'deposito', rotulo: 'Depositar', icone: ICONE.deposito, externo: true, fazer: () => window.open(CAIXA_DERIV, '_blank', 'noopener') },
          { id: 'aulas', rotulo: 'Aulas', icone: ICONE.aulas, fazer: () => aoIr('aulas') },
          { id: 'ajuda', rotulo: MARCA.suporte ? 'Suporte' : 'Ajuda', icone: ICONE.ajuda, fazer: () => (MARCA.suporte ? abrirSuporte() : aoIr('aulas')) },
        ].map((a) => (
          <button key={a.id} type="button" className={a.principal ? 'principal' : ''} onClick={a.fazer}>
            <span className="in-acao-circulo"><Icone d={a.icone} />{a.externo && <i className="in-acao-externo"><Icone d={ICONE.externo} /></i>}</span>
            <span className="in-acao-rotulo">{a.rotulo}</span>
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------ a jornada, enxuta (o plano já está no instrumento) */}
      {proximo && (
        <section className="in-jornada" aria-label="Sua jornada">
          <ol aria-hidden="true">{passos.map((p, i) => <li key={p.titulo} className={p.feito ? 'feito' : p === proximo ? 'agora' : ''}>{p.feito ? <Icone d={ICONE.check} /> : i + 1}</li>)}</ol>
          <p><b>{faltam.length === 1 ? 'Falta 1 passo:' : `Faltam ${faltam.length} passos.`}</b> {proximo.titulo.toLowerCase().replace(/^./, (c) => c.toUpperCase())}.</p>
          <button type="button" className="in-pilula ouro" onClick={proximo.fazer}>Começar</button>
        </section>
      )}

      <div className="in-grade">
        <div className="in-coluna-principal">
          {/* ------------------------------------------------ sua frota */}
          <section className="in-frota" aria-labelledby="in-frota-titulo">
            <header className="in-cabeca">
              <h2 id="in-frota-titulo">Sua frota</h2>
              <span className="in-cabeca-sub">{subFrota}</span>
            </header>
            <div className="in-frota-trilho">
              {frota.map((r) => {
                const curto = r.nome.replace(/^(GF|GlobalFly)\s+/i, '')
                return (
                  <button key={r.id} type="button" className={`in-jato ${r.noAr ? 'no-ar' : ''}`}
                    onClick={() => (r.noAr ? aoIr('robos') : aoPrepararRobo(r.id))}
                    aria-label={r.noAr ? `${r.nome}: no ar, ${ocultos ? 'resultado oculto' : `resultado ${sinal(r.resultado)}${numero(r.resultado)}`}. Abrir a cabine.` : `${r.nome}, ${r.chamada}. Configurar e ligar.`}>
                    <img src={`${FOTOS}${r.id}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                    {r.noAr
                      ? <span className={`in-jato-selo ${r.operando ? 'operando' : ''}`}><i aria-hidden="true" />{r.operando ? 'Operando' : 'No ar'}</span>
                      : <span className="in-jato-play" aria-hidden="true"><Icone d={ICONE.play} /></span>}
                    <span className="in-jato-texto">
                      <small>{MARCA.id === 'globalfly' ? 'GF' : MARCA.nome}</small>
                      <b>{curto}</b>
                      {r.noAr
                        ? <em className={ocultos ? '' : r.resultado >= 0 ? 'sobe' : 'cai'}>{ocultos ? MASCARA : `${sinal(r.resultado)}${numero(r.resultado)}`}{r.analise && !r.operando ? ` · ${r.analise.n}/${r.analise.alvo}` : ''}</em>
                        : <span>{r.chamada}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ------------------------------------------------ para você */}
          <section className="in-para-voce" aria-labelledby="in-pv-titulo">
            <header className="in-cabeca"><h2 id="in-pv-titulo">Para você</h2></header>
            <div className="in-pv">
              {d.aula && (
                <button type="button" className="in-aula" onClick={() => aoIr('aulas')}>
                  <img src={d.aula.capa} alt="" loading="lazy" />
                  <span className="in-aula-texto">
                    <span className="in-sobre">Continue de onde parou</span>
                    <b>{d.aula.titulo}</b>
                    <small>{d.aula.modulo} · {d.aula.feitas} de {d.aula.total} aulas</small>
                    <span className="in-pilula ouro"><Icone d={ICONE.play} />Continuar aula</span>
                    <span className="in-trilho"><i style={{ width: `${(d.aula.feitas / d.aula.total) * 100}%` }} /></span>
                  </span>
                </button>
              )}
              <div className="in-atalhos">
                {d.treino && (
                  <button type="button" className={`in-atalho ${d.treino.noAr ? 'no-ar' : ''}`} onClick={() => aoIr('aovivo')}>
                    <span className="in-atalho-icone"><Icone d={ICONE.video} /></span>
                    <span><b>{d.treino.noAr ? 'Ao vivo agora' : 'Treino ao vivo'}</b><small>{d.treino.noAr ? `${d.treino.apresentador ?? 'A equipe'} está operando na sala` : 'Você recebe um aviso quando começar'}</small></span>
                    <Icone d={ICONE.seta} />
                  </button>
                )}
                {MARCA.comunidade && (
                  <a className="in-atalho" href={MARCA.comunidade} target="_blank" rel="noopener noreferrer">
                    <span className="in-atalho-icone"><Icone d={ICONE.grupo} /></span>
                    <span><b>Comunidade</b><small>Grupo oficial no WhatsApp</small></span>
                    <Icone d={ICONE.externo} />
                  </a>
                )}
                <a className="in-atalho" href={CAIXA_DERIV} target="_blank" rel="noopener noreferrer">
                  <span className="in-atalho-icone"><Icone d={ICONE.deposito} /></span>
                  <span><b>Depositar na Deriv</b><small>No caixa da corretora</small></span>
                  <Icone d={ICONE.externo} />
                </a>
              </div>
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ mercado e notícias */}
        {MARCA.noticias && (
          <div className="in-coluna-lado">
            <section className="in-bloco in-mercado" aria-labelledby="in-mercado-titulo">
              <header className="in-cabeca">
                <h2 id="in-mercado-titulo"><i className="in-pulso" aria-hidden="true" />Mercado agora</h2>
                <button type="button" className="in-link" onClick={() => aoIr('noticias')}>Notícias <Icone d={ICONE.seta} /></button>
              </header>
              <div className="in-cotacoes">
                {d.cotacoes.map((c) => (
                  <div key={c.id} className="in-cotacao">
                    <span className="in-cotacao-nome">{c.nome}</span>
                    <Curva serie={c.serie} classe={c.variacao >= 0 ? 'sobe' : 'cai'} />
                    <span className="in-cotacao-valor">
                      <b>{c.valor}</b>
                      <em className={c.variacao >= 0 ? 'sobe' : 'cai'}>{c.variacao >= 0 ? '+' : '−'}{Math.abs(c.variacao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</em>
                    </span>
                  </div>
                ))}
                {!d.cotacoes.length && [0, 1, 2, 3].map((i) => <div key={i} className="in-cotacao carregando"><span className="in-esqueleto" /><span className="in-esqueleto curto" /></div>)}
              </div>
            </section>
            {d.manchetes.length > 0 && (
              <section className="in-bloco in-noticias" aria-labelledby="in-noticias-titulo">
                <header className="in-cabeca">
                  <h2 id="in-noticias-titulo">Notícias</h2>
                  <button type="button" className="in-link" onClick={() => aoIr('noticias')}>Ver todas <Icone d={ICONE.seta} /></button>
                </header>
                <ol className="in-manchetes">
                  {d.manchetes.map((m) => (
                    <li key={m.titulo}>{m.link
                      ? <a className="in-manchete" href={m.link} target="_blank" rel="noopener noreferrer"><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></a>
                      : <div className="in-manchete"><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></div>}</li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </div>

      <footer className="in-rodape">
        <Monograma tamanho={24} />
        <p>Resultados passados não garantem resultados futuros. Operar envolve risco: use valores que você pode perder e respeite o seu limite.</p>
      </footer>
    </div>
  )
}
