import type { WorkspacePage } from '../WorkspaceNav'
import { NomeDoRobo } from '../NomeDoRobo'
import { MARCA } from '../../marca'
import './inicio.css'

/**
 * A home de quem entra na plataforma (20/10/2026, pedido do Tiago: "uma home
 * estruturada, tipo corretora profissional"). Antes a pessoa caía direto no
 * gráfico do Manual. Aqui ela vê onde está e o que fazer em seguida:
 *
 *  - o saldo da conta e os dois caminhos (operar na mão ou ligar uma I.A.);
 *  - para quem está começando, a jornada em 4 passos;
 *  - o dia em números, com a meta e o limite de perda do Gerenciamento;
 *  - as I.A.s ligadas agora; atalhos; o mercado; a aula para continuar; a
 *    sala de treino para o GF Member.
 *
 * Os números são do que já aconteceu ("resultado de hoje"), nunca previsão.
 * O componente só desenha: quem chama entrega os dados (DadosDoInicio).
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

const dinheiro = (n: number, moeda: string, sinal = false) =>
  `${sinal && n > 0 ? '+' : n < 0 ? '−' : ''}${moeda} ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const hojeExtenso = () => { const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1) }

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
  noticias: 'M5 5h11v14H6a1 1 0 01-1-1zM16 9h3v9a1 1 0 01-1 1M8 9h5M8 12h5M8 15h3',
  check: 'M5 12.5l4.2 4.2L19 7',
  seta: 'M9 6l6 6-6 6',
}
const Icone = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export function InicioPanel({ d, aoIr, aoConectar }: { d: DadosDoInicio; aoIr: (tela: WorkspacePage) => void; aoConectar?: () => void }) {
  // conectar abre o login da Deriv direto (o mesmo do botão do topo)
  const conectar = () => (aoConectar ? aoConectar() : aoIr('operar'))
  const passos = [
    { feito: d.jornada.deriv, titulo: 'Conecte sua Deriv', dica: 'A conta da corretora, ligada à plataforma.', ir: 'operar' as WorkspacePage },
    { feito: d.jornada.demo, titulo: 'Treine na conta demo', dica: 'Dinheiro fictício para pegar o jeito.', ir: 'operar' as WorkspacePage },
    { feito: d.jornada.gestao, titulo: 'Defina meta e limite', dica: 'Quanto buscar e quanto aceitar perder no dia.', ir: 'gerenciamento' as WorkspacePage },
    { feito: d.jornada.primeiraIa, titulo: 'Ligue sua primeira I.A.', dica: 'Escolha a estratégia e acompanhe a sessão.', ir: 'robos' as WorkspacePage },
  ]
  const feitos = passos.filter((p) => p.feito).length
  const proximo = passos.find((p) => !p.feito)
  const h = d.hoje
  const pctMeta = h && h.meta > 0 ? Math.max(0, Math.min(100, (h.resultado / h.meta) * 100)) : 0
  const pctLimite = h && h.limite > 0 ? Math.max(0, Math.min(100, (-Math.min(0, h.resultado) / h.limite) * 100)) : 0
  const moeda = d.conta.moeda

  return (
    <div className="in">
      {/* ------------------------------------------------ topo: quem, quando, saldo */}
      <section className="in-topo">
        <div className="in-ola">
          <span className="in-sobre">{hojeExtenso()}</span>
          <h1>{saudacao()}, {d.nome.split(/\s+/)[0]}</h1>
          <p>{d.robos.length
            ? <>{d.robos.length === 1 ? 'Uma I.A. operando' : `${d.robos.length} I.A.s operando`} agora na sua conta.</>
            : 'Sua mesa de operações está pronta.'}</p>
        </div>
        <div className="in-saldo">
          {d.conta.conectada ? (
            <>
              <div className="in-saldo-linha">
                <span className={`in-conta ${d.conta.demo ? 'demo' : 'real'}`}>{d.conta.demo ? 'Conta demo' : 'Conta real'}</span>
                <span className="in-conexao"><i aria-hidden="true" />Conectada à Deriv</span>
              </div>
              <span className="in-saldo-rotulo">Saldo disponível</span>
              <b className="in-saldo-valor">{d.conta.saldo === null ? `${moeda} …` : dinheiro(d.conta.saldo, moeda)}</b>
              <div className="in-saldo-acoes">
                <button type="button" className="in-btn ouro" onClick={() => aoIr('robos')}><Icone d={ICONE.ia} />Ligar uma I.A.</button>
                <button type="button" className="in-btn" onClick={() => aoIr('operar')}><Icone d={ICONE.manual} />Operar manual</button>
              </div>
            </>
          ) : (
            <>
              <span className="in-saldo-rotulo">Primeiro passo</span>
              <b className="in-saldo-chamada">Conecte sua conta da corretora</b>
              <p>O saldo e as operações ficam na sua conta Deriv. A {MARCA.prosa} só se conecta a ela.</p>
              <div className="in-saldo-acoes">
                <button type="button" className="in-btn deriv" onClick={conectar}>Conectar minha Deriv</button>
                {MARCA.afiliado && <a className="in-btn" href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Ainda não tenho conta</a>}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ a jornada (só para quem está começando) */}
      {feitos < passos.length && (
        <section className="in-jornada" aria-labelledby="in-jornada-titulo">
          <header>
            <div>
              <span className="in-sobre">Sua jornada</span>
              <h2 id="in-jornada-titulo">{feitos === 0 ? 'Quatro passos para operar com segurança' : `${feitos} de ${passos.length} passos feitos`}</h2>
            </div>
            <div className="in-jornada-barra" role="progressbar" aria-valuemin={0} aria-valuemax={passos.length} aria-valuenow={feitos}><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
          </header>
          <ol>
            {passos.map((p, i) => (
              <li key={p.titulo} className={p.feito ? 'feito' : p === proximo ? 'agora' : ''}>
                <button type="button" onClick={() => (i === 0 ? conectar() : aoIr(p.ir))} disabled={p.feito}>
                  <i aria-hidden="true">{p.feito ? <Icone d={ICONE.check} /> : i + 1}</i>
                  <span><b>{p.titulo}</b><small>{p.feito ? 'Feito' : p.dica}</small></span>
                  {p === proximo && <em>Começar</em>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="in-grade">
        {/* ------------------------------------------------ hoje */}
        <section className="in-cartao in-hoje" aria-labelledby="in-hoje-titulo">
          <header className="in-cabeca">
            <h2 id="in-hoje-titulo">Hoje</h2>
            <button type="button" className="in-link" onClick={() => aoIr('gerenciamento')}>Gerenciamento <Icone d={ICONE.seta} /></button>
          </header>
          {h ? (
            <>
              <div className="in-numeros">
                <div><span>Resultado das I.A.s</span><b className={h.resultado >= 0 ? 'sobe' : 'cai'}>{dinheiro(h.resultado, moeda, true)}</b></div>
                <div><span>Operações</span><b>{h.operacoes}</b></div>
                <div><span>Vitórias · derrotas</span><b>{h.vitorias} <small>·</small> {h.derrotas}</b></div>
              </div>
              {h.meta <= 0 && h.limite <= 0 ? (
                <div className="in-vazio">
                  <p>Defina no Gerenciamento quanto quer buscar no dia e quanto aceita perder: a meta e o limite aparecem aqui.</p>
                  <button type="button" className="in-btn" onClick={() => aoIr('gerenciamento')}><Icone d={ICONE.gestao} />Definir meta e limite</button>
                </div>
              ) : <div className="in-metas">
                <div className="in-meta">
                  <div><span>Meta do dia</span><b>{dinheiro(h.meta, moeda)}</b></div>
                  <div className="in-trilho sobe"><i style={{ width: `${pctMeta}%` }} /></div>
                  <small>{pctMeta >= 100 ? 'Meta batida. Hora de desligar.' : `${Math.round(pctMeta)}% da meta`}</small>
                </div>
                <div className="in-meta">
                  <div><span>Limite de perda</span><b>{dinheiro(h.limite, moeda)}</b></div>
                  <div className="in-trilho cai"><i style={{ width: `${pctLimite}%` }} /></div>
                  <small>{pctLimite === 0 ? 'Nada usado do limite' : `${Math.round(pctLimite)}% do limite usado`}</small>
                </div>
              </div>}
            </>
          ) : (
            <>
              <div className="in-numeros vazio">
                <div><span>Resultado das I.A.s</span><b>—</b></div>
                <div><span>Operações</span><b>0</b></div>
                <div><span>Vitórias · derrotas</span><b>0 <small>·</small> 0</b></div>
              </div>
              <div className="in-vazio">
                <p>Nenhuma operação ainda hoje. Antes da primeira, defina quanto quer buscar no dia e quanto aceita perder: é o que mantém a operação no controle.</p>
                <button type="button" className="in-btn" onClick={() => aoIr('gerenciamento')}><Icone d={ICONE.gestao} />Definir meta e limite</button>
              </div>
            </>
          )}
        </section>

        {/* ------------------------------------------------ atalhos */}
        <nav className="in-cartao in-atalhos" aria-label="Atalhos">
          {([
            ['robos', ICONE.ia, 'I.A.', 'Estratégias automáticas'],
            ['operar', ICONE.manual, 'Manual', 'Seu terminal de operação'],
            ['gerenciamento', ICONE.gestao, 'Gerenciamento', 'Meta, limite e entrada'],
            ['aulas', ICONE.aulas, 'Aulas', 'Do zero à operação'],
          ] as const).map(([ir, icone, titulo, dica]) => (
            <button key={ir} type="button" onClick={() => aoIr(ir)}>
              <span className="in-atalho-icone"><Icone d={icone} /></span>
              <b>{titulo}</b><small>{dica}</small>
            </button>
          ))}
        </nav>

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
                    <span className={r.resultado >= 0 ? 'sobe' : 'cai'}>{dinheiro(r.resultado, moeda, true)}</span>
                    <small>{r.operacoes} operações</small>
                  </div>
                  <Curva serie={r.curva} classe={r.resultado >= 0 ? 'sobe' : 'cai'} />
                </div>
              </button>
            ))}
            <button type="button" className="in-ia nova" onClick={() => aoIr('robos')}>
              <span className="in-ia-mais" aria-hidden="true">+</span>
              <b>{d.robos.length ? 'Ligar outra I.A.' : 'Escolha a sua I.A.'}</b>
              <small>Raptor, Falcon, Legacy, Gulf e Phenom</small>
            </button>
          </div>
        </section>

        {/* ------------------------------------------------ mercado */}
        {MARCA.noticias && <section className="in-cartao in-mercado" aria-labelledby="in-mercado-titulo">
          <header className="in-cabeca">
            <h2 id="in-mercado-titulo"><i className="in-pulso" aria-hidden="true" />Mercado agora</h2>
            <button type="button" className="in-link" onClick={() => aoIr('noticias')}>Notícias <Icone d={ICONE.seta} /></button>
          </header>
          <div className="in-cotacoes">
            {d.cotacoes.map((c) => (
              <div key={c.id} className="in-cotacao">
                <span>{c.nome}</span>
                <b>{c.valor}</b>
                <em className={c.variacao >= 0 ? 'sobe' : 'cai'}>{c.variacao >= 0 ? '▲' : '▼'} {Math.abs(c.variacao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</em>
                <Curva serie={c.serie} classe={c.variacao >= 0 ? 'sobe' : 'cai'} />
              </div>
            ))}
          </div>
          {!d.cotacoes.length && <p className="in-carregando">Carregando as cotações…</p>}
          <ol className="in-manchetes">
            {d.manchetes.map((m) => (
              <li key={m.titulo}>{m.link
                ? <a href={m.link} target="_blank" rel="noopener noreferrer"><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></a>
                : <><span><b>{m.fonte}</b> · {m.quando}</span><strong>{m.titulo}</strong></>}</li>
            ))}
          </ol>
        </section>}

        {/* ------------------------------------------------ aula e sala de treino */}
        <div className="in-coluna">
          {d.aula && (
            <button type="button" className="in-cartao in-aula" onClick={() => aoIr('aulas')}>
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
          {d.treino && (
            <button type="button" className={`in-cartao in-treino ${d.treino.noAr ? 'no-ar' : ''}`} onClick={() => aoIr('aovivo')}>
              <span className="in-treino-selo"><i aria-hidden="true" />{d.treino.noAr ? 'Ao vivo agora' : 'Sala de treino'}</span>
              <b>{d.treino.noAr ? `${d.treino.apresentador ?? 'A equipe'} está ao vivo na sala de treino` : 'Transmissões exclusivas para GF Members'}</b>
              <small>{d.treino.noAr ? 'Clique para entrar e acompanhar a operação.' : 'Você recebe um aviso quando a próxima começar.'}</small>
            </button>
          )}
        </div>
      </div>

      <p className="in-rodape">Resultados de operações passadas não garantem resultados futuros. Opere com valores que você pode perder e respeite o seu limite.</p>
    </div>
  )
}
