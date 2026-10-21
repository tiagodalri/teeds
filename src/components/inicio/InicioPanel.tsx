import type { WorkspacePage } from '../WorkspaceNav'
import { NomeDoRobo } from '../NomeDoRobo'
import { Monograma } from '../marca/Monograma'
import { abrirSuporte } from '../../core/teeds/suporte'
import { alternarValores, MASCARA, useValoresOcultos } from '../../core/privacidade'
import { MARCA } from '../../marca'
import './inicio.css'

/**
 * A home (20/10/2026; refeita no mesmo dia "estilo banco privado, Safra,
 * BTG", com o brandbook da GlobalFly ao lado):
 *
 *  - o cartão da conta em Azul GF: saudação, o saldo grande em fonte de
 *    dados, o resultado de hoje e o olhinho que esconde os valores. O corte
 *    diagonal dourado é o "eixo" do manual (pág. 18), no ângulo do monograma;
 *    o monograma entra como marca d'água a 5% (pág. 8);
 *  - as ações rápidas em círculos, como num app de banco;
 *  - para quem está começando, a jornada em 4 passos;
 *  - o seu dia (resultado, meta e limite), as I.A.s ligadas, o mercado e
 *    o que fazer a seguir (aula e sala de treino).
 *
 * "Confiança sem euforia": os números são do que já aconteceu, nunca
 * previsão. O componente só desenha; quem chama entrega os dados.
 */

export interface DadosDoInicio {
  nome: string
  conta: { conectada: boolean; demo: boolean; saldo: number | null; moeda: string }
  /** null = ainda sem operação hoje */
  hoje: { resultado: number; operacoes: number; vitorias: number; derrotas: number; meta: number; limite: number } | null
  robos: Array<{ id: string; nome: string; situacao: 'operando' | 'aguardando'; resultado: number; operacoes: number; curva: number[] }>
  cotacoes: Array<{ id: string; nome: string; valor: string; variacao: number; serie: number[] }>
  manchetes: Array<{ titulo: string; fonte: string; quando: string; link?: string }>
  aula: { modulo: string; titulo: string; capa: string; feitas: number; total: number } | null
  treino: { noAr: boolean; apresentador?: string } | null
  jornada: { deriv: boolean; demo: boolean; gestao: boolean; primeiraIa: boolean }
}

const numero = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dinheiro = (n: number, moeda: string, sinal = false) => `${sinal && n > 0 ? '+' : n < 0 ? '−' : ''}${moeda} ${numero(n)}`
const saudacao = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const hojeExtenso = () => { const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1) }
/** Cashier da Deriv: depósito e saque são sempre na conta da pessoa, na corretora. */
const CAIXA_DERIV = 'https://app.deriv.com/cashier/deposit'

/** Linha pequena de uma série (resultado do robô, cotação). */
function Curva({ serie, classe }: { serie: number[]; classe: string }) {
  if (serie.length < 2) return <svg className={`in-curva ${classe}`} viewBox="0 0 100 32" aria-hidden="true" />
  const min = Math.min(...serie), max = Math.max(...serie), amp = max - min || 1
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${30 - ((v - min) / amp) * 26}`).join(' ')
  return (
    <svg className={`in-curva ${classe}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,32 ${pts} 100,32`} /><polyline points={pts} />
    </svg>
  )
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
  sobe: 'M7 14l5-5 5 5',
  desce: 'M7 10l5 5 5-5',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
}
/** "Raptor, Falcon, Legacy, Gulf e Phenom": os robôs da marca, sem o prefixo. */
const nomesDosRobos = () => {
  const nomes = MARCA.robos.map((id) => (MARCA.nomesDosRobos?.[id] ?? id).replace(/^(GF|GlobalFly|OMNI)\s+/i, ''))
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes.join('')
}
const Icone = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export function InicioPanel({ d, aoIr, aoConectar }: { d: DadosDoInicio; aoIr: (tela: WorkspacePage) => void; aoConectar?: () => void }) {
  const ocultos = useValoresOcultos()
  // conectar abre o login da Deriv direto (o mesmo do botão do topo)
  const conectar = () => (aoConectar ? aoConectar() : aoIr('operar'))
  const passos = [
    { feito: d.jornada.deriv, titulo: 'Conecte sua Deriv', dica: 'A conta da corretora, ligada à plataforma.', ir: 'operar' as WorkspacePage },
    { feito: d.jornada.demo, titulo: 'Treine na conta demo', dica: 'Saldo de treino para pegar o jeito.', ir: 'operar' as WorkspacePage },
    { feito: d.jornada.gestao, titulo: 'Defina meta e limite', dica: 'Quanto buscar e quanto aceitar perder no dia.', ir: 'gerenciamento' as WorkspacePage },
    { feito: d.jornada.primeiraIa, titulo: 'Ligue sua primeira I.A.', dica: 'Escolha a estratégia e acompanhe a sessão.', ir: 'robos' as WorkspacePage },
  ]
  const feitos = passos.filter((p) => p.feito).length
  const proximo = passos.find((p) => !p.feito)
  const h = d.hoje
  const pctMeta = h && h.meta > 0 ? Math.max(0, Math.min(100, (h.resultado / h.meta) * 100)) : 0
  const pctLimite = h && h.limite > 0 ? Math.max(0, Math.min(100, (-Math.min(0, h.resultado) / h.limite) * 100)) : 0
  const acerto = h && h.operacoes > 0 ? Math.round((h.vitorias / h.operacoes) * 100) : null
  const moeda = d.conta.moeda
  /** O valor, ou os pontinhos do olho fechado. */
  const v = (n: number, sinal = false) => (ocultos ? `${moeda} ${MASCARA}` : dinheiro(n, moeda, sinal))
  const primeiro = d.nome.trim().split(/\s+/)[0]

  const acoes: Array<{ id: string; rotulo: string; icone: string; principal?: boolean; fazer: () => void; externo?: boolean }> = [
    { id: 'ia', rotulo: 'Ligar I.A.', icone: ICONE.ia, principal: true, fazer: () => aoIr('robos') },
    { id: 'manual', rotulo: 'Operar', icone: ICONE.manual, fazer: () => aoIr('operar') },
    { id: 'gestao', rotulo: 'Gerenciar', icone: ICONE.gestao, fazer: () => aoIr('gerenciamento') },
    { id: 'deposito', rotulo: 'Depositar', icone: ICONE.deposito, externo: true, fazer: () => window.open(CAIXA_DERIV, '_blank', 'noopener') },
    { id: 'aulas', rotulo: 'Aulas', icone: ICONE.aulas, fazer: () => aoIr('aulas') },
    { id: 'ajuda', rotulo: MARCA.suporte ? 'Suporte' : 'Ajuda', icone: ICONE.ajuda, fazer: () => (MARCA.suporte ? abrirSuporte() : aoIr('aulas')) },
  ]

  return (
    <div className="in">
      {/* ------------------------------------------------ o cartão da conta */}
      <section className={`in-cartao-conta ${d.conta.conectada ? '' : 'sem-conta'}`} aria-labelledby="in-ola">
        <i className="in-eixo" aria-hidden="true" />
        <Monograma variante="marca-dagua" tamanho={250} className="in-conta-marca" />
        <header className="in-conta-topo">
          <div>
            <span className="in-conta-data">{hojeExtenso()}</span>
            <h1 id="in-ola">{saudacao()}{primeiro ? `, ${primeiro}` : ''}</h1>
          </div>
          {d.conta.conectada && (
            <button type="button" className={`in-olho ${ocultos ? 'fechado' : ''}`} onClick={alternarValores} aria-pressed={ocultos}
              aria-label={ocultos ? 'Mostrar valores' : 'Ocultar valores'} title={ocultos ? 'Mostrar valores' : 'Ocultar valores'}>
              <Icone d={ocultos ? ICONE.olhoFechado : ICONE.olho} />
            </button>
          )}
        </header>

        {d.conta.conectada ? (
          <div className="in-conta-saldo">
            <div className="in-conta-linha">
              <span className={`in-conta-tipo ${d.conta.demo ? 'demo' : 'real'}`}>{d.conta.demo ? 'Conta demo' : 'Conta real'}</span>
              <span className="in-conexao"><i aria-hidden="true" />Deriv conectada</span>
            </div>
            <span className="in-conta-rot">Saldo disponível</span>
            <b className={`in-conta-valor ${ocultos ? 'oculto' : ''}`} aria-live="polite">
              <small>{moeda}</small>{d.conta.saldo === null ? <span className="in-esqueleto" aria-label="carregando" /> : ocultos ? MASCARA : numero(d.conta.saldo)}
            </b>
            <div className="in-conta-hoje">
              <span>Resultado de hoje</span>
              {h ? <b className={ocultos ? '' : h.resultado >= 0 ? 'sobe' : 'cai'}>{!ocultos && <Icone d={h.resultado >= 0 ? ICONE.sobe : ICONE.desce} />}{v(h.resultado, true)}</b> : <b className="neutro">Sem operações ainda</b>}
              {h && <em>{h.operacoes} operaç{h.operacoes === 1 ? 'ão' : 'ões'}</em>}
            </div>
          </div>
        ) : (
          <div className="in-conta-saldo">
            <span className="in-conta-rot">Primeiro passo</span>
            <b className="in-conta-chamada">Conecte a sua conta da corretora</b>
            <p>O saldo e as operações ficam na sua conta da Deriv. A {MARCA.prosa} só se conecta a ela, com o login oficial.</p>
            <div className="in-conta-botoes">
              <button type="button" className="in-btn claro" onClick={conectar}>Conectar minha Deriv</button>
              {MARCA.afiliado && <a className="in-btn contorno" href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>}
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ ações rápidas */}
      <nav className="in-acoes" aria-label="Ações rápidas">
        {acoes.map((a) => (
          <button key={a.id} type="button" className={a.principal ? 'principal' : ''} onClick={a.fazer}>
            <span className="in-acao-circulo"><Icone d={a.icone} />{a.externo && <i className="in-acao-externo"><Icone d={ICONE.externo} /></i>}</span>
            <span className="in-acao-rotulo">{a.rotulo}</span>
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------ a jornada (só para quem está começando) */}
      {feitos < passos.length && (
        <section className="in-jornada" aria-labelledby="in-jornada-titulo">
          <header>
            <div>
              <span className="in-sobre">Sua jornada</span>
              <h2 id="in-jornada-titulo">{feitos === 0 ? 'Quatro passos para operar com segurança' : `${feitos} de ${passos.length} passos feitos`}</h2>
            </div>
            <div className="in-jornada-anel" role="progressbar" aria-valuemin={0} aria-valuemax={passos.length} aria-valuenow={feitos} style={{ ['--p' as string]: `${(feitos / passos.length) * 100}%` }}>
              <b>{feitos}<small>/{passos.length}</small></b>
            </div>
          </header>
          <ol>
            {passos.map((p, i) => (
              <li key={p.titulo} className={p.feito ? 'feito' : p === proximo ? 'agora' : ''}>
                <button type="button" onClick={() => (i === 0 ? conectar() : aoIr(p.ir))} disabled={p.feito}>
                  <i aria-hidden="true">{p.feito ? <Icone d={ICONE.check} /> : i + 1}</i>
                  <span><b>{p.titulo}</b><small>{p.feito ? 'Feito' : p.dica}</small></span>
                  {p === proximo ? <em>Começar</em> : !p.feito && <Icone d={ICONE.seta} />}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="in-grade">
        {/* ------------------------------------------------ seu dia */}
        <section className="in-bloco in-dia" aria-labelledby="in-dia-titulo">
          <header className="in-cabeca">
            <h2 id="in-dia-titulo">Seu dia</h2>
            <button type="button" className="in-link" onClick={() => aoIr('gerenciamento')}>Gerenciamento <Icone d={ICONE.seta} /></button>
          </header>
          <div className="in-dia-numeros">
            <div><span>Resultado das I.A.s</span><b className={!h || ocultos ? '' : h.resultado >= 0 ? 'sobe' : 'cai'}>{h ? v(h.resultado, true) : '—'}</b></div>
            <div><span>Operações</span><b>{h?.operacoes ?? 0}</b></div>
            <div><span>Acerto</span><b>{acerto === null ? '—' : `${acerto}%`}</b></div>
          </div>
          {h && (h.meta > 0 || h.limite > 0) ? (
            <div className="in-metas">
              <div className="in-meta">
                <div><span>Meta do dia</span><b>{v(h.meta)}</b></div>
                <div className="in-trilho sobe"><i style={{ width: `${pctMeta}%` }} /></div>
                <small>{pctMeta >= 100 ? 'Meta batida. Hora de desligar.' : `${Math.round(pctMeta)}% da meta`}</small>
              </div>
              <div className="in-meta">
                <div><span>Limite de perda</span><b>{v(h.limite)}</b></div>
                <div className="in-trilho cai"><i style={{ width: `${pctLimite}%` }} /></div>
                <small>{pctLimite === 0 ? 'Nada usado do limite' : `${Math.round(pctLimite)}% do limite usado`}</small>
              </div>
            </div>
          ) : (
            <div className="in-vazio">
              <p>{h ? 'Defina quanto quer buscar no dia e quanto aceita perder: a meta e o limite aparecem aqui.' : 'Nenhuma operação ainda hoje. Antes da primeira, defina quanto quer buscar e quanto aceita perder: é o que mantém tudo no controle.'}</p>
              <button type="button" className="in-btn" onClick={() => aoIr('gerenciamento')}><Icone d={ICONE.gestao} />Definir meta e limite</button>
            </div>
          )}
        </section>

        {/* ------------------------------------------------ as I.A.s */}
        <section className="in-ias" aria-labelledby="in-ias-titulo">
          <header className="in-cabeca">
            <h2 id="in-ias-titulo">Suas I.A.s agora</h2>
            <button type="button" className="in-link" onClick={() => aoIr('robos')}>Ver todas <Icone d={ICONE.seta} /></button>
          </header>
          <div className="in-ias-trilho">
            {d.robos.map((r) => (
              <button key={r.id + r.nome} type="button" className="in-ia" onClick={() => aoIr('robos')}>
                <img src={`${import.meta.env.BASE_URL}robos-globalfly/${r.id}-pequena.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                <div className="in-ia-corpo">
                  <div className="in-ia-topo">
                    <b><NomeDoRobo nome={r.nome} /></b>
                    <span className={`in-ia-situacao ${r.situacao}`}><i aria-hidden="true" />{r.situacao === 'operando' ? 'Operando' : 'Lendo o mercado'}</span>
                  </div>
                  <div className="in-ia-numeros">
                    <span className={ocultos ? '' : r.resultado >= 0 ? 'sobe' : 'cai'}>{v(r.resultado, true)}</span>
                    <small>{r.operacoes} operações</small>
                  </div>
                  <Curva serie={r.curva} classe={r.resultado >= 0 ? 'sobe' : 'cai'} />
                </div>
              </button>
            ))}
            <button type="button" className="in-ia nova" onClick={() => aoIr('robos')}>
              <span className="in-ia-mais" aria-hidden="true"><Icone d={ICONE.ia} /></span>
              <b>{d.robos.length ? 'Ligar outra I.A.' : 'Escolha a sua I.A.'}</b>
              <small>{nomesDosRobos()}</small>
            </button>
          </div>
        </section>

        {/* ------------------------------------------------ mercado */}
        {MARCA.noticias && <section className="in-bloco in-mercado" aria-labelledby="in-mercado-titulo">
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
          {d.manchetes.length > 0 && <ol className="in-manchetes">
            {d.manchetes.map((m) => (
              <li key={m.titulo}>{m.link
                ? <a className="in-manchete" href={m.link} target="_blank" rel="noopener noreferrer"><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></a>
                : <div className="in-manchete"><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></div>}</li>
            ))}
          </ol>}
        </section>}

        {/* ------------------------------------------------ para você: aula e sala de treino */}
        {(d.aula || d.treino) && (
          <section className="in-para-voce" aria-labelledby="in-pv-titulo">
            <header className="in-cabeca"><h2 id="in-pv-titulo">Para você</h2></header>
            <div className="in-coluna">
              {d.treino && (
                <button type="button" className={`in-bloco in-treino ${d.treino.noAr ? 'no-ar' : ''}`} onClick={() => aoIr('aovivo')}>
                  <span className="in-treino-selo"><i aria-hidden="true" />{d.treino.noAr ? 'Ao vivo agora' : 'Sala de treino'}</span>
                  <b>{d.treino.noAr ? `${d.treino.apresentador ?? 'A equipe'} está ao vivo na sala de treino` : 'Transmissões exclusivas para GF Members'}</b>
                  <small>{d.treino.noAr ? 'Toque para entrar e acompanhar a operação.' : 'Você recebe um aviso quando a próxima começar.'}</small>
                </button>
              )}
              {d.aula && (
                <button type="button" className="in-bloco in-aula" onClick={() => aoIr('aulas')}>
                  <img src={d.aula.capa} alt="" loading="lazy" />
                  <div>
                    <span className="in-sobre">Continue de onde parou</span>
                    <small>{d.aula.modulo}</small>
                    <b>{d.aula.titulo}</b>
                    <div className="in-trilho ouro"><i style={{ width: `${(d.aula.feitas / d.aula.total) * 100}%` }} /></div>
                    <small>{d.aula.feitas} de {d.aula.total} aulas do módulo</small>
                  </div>
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      <footer className="in-rodape">
        <Monograma tamanho={22} />
        <p>Resultados passados não garantem resultados futuros. Operar envolve risco: use valores que você pode perder e respeite o seu limite.</p>
      </footer>
    </div>
  )
}
