import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { apagarPlano, painelDePlanos, salvarPlano, type PlanoRegistro, type RecursosDoPlano } from '../core/teeds/clientes'
import { MARCA } from '../marca'
import { Icone } from './Icone'
import './admin-planos.css'

/*
  Administração > Planos (26/10/2026, Tiago: "editar os planos, configurar,
  acrescentar, ver os detalhes"). Cada marca configura os SEUS planos
  (planos_da_marca): o que muda aqui não mexe nas outras plataformas.
  Os recursos marcados valem na hora: o banco libera simulador, sala de
  treino e live lendo esta configuração (teeds_plano_tem).
*/

type Rascunho = Pick<PlanoRegistro, 'id' | 'nome' | 'descricao' | 'duracaoDias' | 'ativo' | 'padrao' | 'recursos'>

const NOVO: Rascunho = { id: '', nome: '', descricao: '', duracaoDias: 30, ativo: true, padrao: false, recursos: { simulador: false, salaDeTreino: false, aoVivo: true } }
const DURACOES = [7, 30, 90, 180, 365]

/** Os recursos que a plataforma entende; a live e a sala de treino só existem onde há transmissão. */
const RECURSOS: { chave: keyof RecursosDoPlano; nome: string; ajuda: string; so?: 'aoVivo' }[] = [
  { chave: 'simulador', nome: 'Simulador de treinamento', ajuda: 'Os US$ 10.000 fictícios para treinar antes de operar.' },
  { chave: 'aoVivo', nome: 'Live', ajuda: 'Assiste às transmissões ao vivo da plataforma.', so: 'aoVivo' },
  { chave: 'salaDeTreino', nome: 'Sala de treino', ajuda: 'Assiste aos ensaios da sala de treino.', so: 'aoVivo' },
]
const recursosDaMarca = RECURSOS.filter((r) => !r.so || MARCA.aoVivo)

const numero = (n?: number) => (n ?? 0).toLocaleString('pt-BR')
const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const duracaoTexto = (d: number | null) => (d == null ? 'Sem vencimento' : d === 1 ? '1 dia' : d % 365 === 0 ? `${d / 365} ${d === 365 ? 'ano' : 'anos'}` : `${d} dias`)

export function AdminPlanos({ sessao, onMudou }: { sessao: SessaoTeeds; onMudou?: () => void }) {
  const [planos, setPlanos] = useState<PlanoRegistro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState<PlanoRegistro | 'novo' | null>(null)

  const carregar = async () => {
    setCarregando(true); setErro('')
    try { setPlanos(await painelDePlanos(sessao)) } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [sessao.token])
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 4000); return () => clearTimeout(t) }, [aviso])

  const totalClientes = planos.reduce((s, p) => s + (p.clientes ?? 0), 0)
  const depoisDeMudar = async (texto: string) => { setAberto(null); setAviso(texto); await carregar(); onMudou?.() }

  return (
    <section className="apl">
      <header className="apl-topo">
        <div>
          <p className="apl-resumo"><b>{planos.length}</b> {planos.length === 1 ? 'plano' : 'planos'} · <b>{numero(totalClientes)}</b> clientes</p>
          <p className="apl-nota">Todos os planos incluem robôs, operar, aulas e gerenciamento. O que muda de um para outro é o que está marcado em cada um. A validade de cada cliente continua na ficha dele.</p>
        </div>
        <button type="button" className="apl-botao principal" onClick={() => setAberto('novo')}><span aria-hidden="true">+</span> Novo plano</button>
      </header>

      {aviso && <p className="apl-aviso" role="status">{aviso}</p>}
      {erro && <p className="apl-erro" role="alert">{erro}</p>}
      {carregando && !planos.length && <p className="apl-vazio">Carregando os planos…</p>}

      <div className="apl-grade">
        {planos.map((p) => (
          <article key={p.id} className={`apl-cartao${p.ativo ? '' : ' inativo'}`}>
            <button type="button" className="apl-cartao-abrir" onClick={() => setAberto(p)} aria-label={`Abrir o plano ${p.nome}`} />
            <div className="apl-cartao-topo">
              <span className="apl-icone"><Icone nome="planos" /></span>
              <div className="apl-titulo">
                <h3>{p.nome}</h3>
                <div className="apl-selos">
                  {p.padrao && <span className="apl-selo ouro" title="Quem se cadastra sozinho entra neste plano">Padrão do cadastro</span>}
                  {!p.ativo && <span className="apl-selo">Indisponível</span>}
                  <span className="apl-selo claro">{duracaoTexto(p.duracaoDias)}</span>
                </div>
              </div>
            </div>
            {p.descricao && <p className="apl-descricao">{p.descricao}</p>}
            <ul className="apl-recursos">
              {recursosDaMarca.map((r) => (
                <li key={r.chave} className={p.recursos[r.chave] ? 'sim' : 'nao'}><i aria-hidden="true">{p.recursos[r.chave] ? '✓' : '–'}</i>{r.nome}</li>
              ))}
            </ul>
            <footer className="apl-numeros">
              <div><b>{numero(p.clientes)}</b><span>Clientes</span></div>
              <div><b className="up">{numero(p.ativos)}</b><span>Ativos</span></div>
              <div><b className={p.expirados ? 'down' : ''}>{numero(p.expirados)}</b><span>Expirados</span></div>
              <div><b>{numero(p.novos30d)}</b><span>Novos em 30 dias</span></div>
            </footer>
          </article>
        ))}
        {!carregando && (
          <button type="button" className="apl-cartao apl-cartao-novo" onClick={() => setAberto('novo')}>
            <span aria-hidden="true">+</span><b>Criar um plano</b><small>Escolha o nome, a duração e o que ele libera.</small>
          </button>
        )}
      </div>

      {aberto && (
        <EditorDePlano sessao={sessao} plano={aberto === 'novo' ? null : aberto} temOutroPadrao={planos.some((p) => p.padrao)}
          fechar={() => setAberto(null)} aoSalvar={(nome, novo) => void depoisDeMudar(novo ? `Plano "${nome}" criado.` : `Plano "${nome}" salvo.`)}
          aoApagar={(nome) => void depoisDeMudar(`Plano "${nome}" apagado.`)} />
      )}
    </section>
  )
}

function EditorDePlano({ sessao, plano, temOutroPadrao, fechar, aoSalvar, aoApagar }: {
  sessao: SessaoTeeds; plano: PlanoRegistro | null; temOutroPadrao: boolean
  fechar: () => void; aoSalvar: (nome: string, novo: boolean) => void; aoApagar: (nome: string) => void
}) {
  const [r, setR] = useState<Rascunho>(() => (plano ? { id: plano.id, nome: plano.nome, descricao: plano.descricao ?? '', duracaoDias: plano.duracaoDias, ativo: plano.ativo, padrao: plano.padrao, recursos: { ...plano.recursos } } : { ...NOVO, recursos: { ...NOVO.recursos } }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmaApagar, setConfirmaApagar] = useState(false)
  const novo = !plano
  const semVencimento = r.duracaoDias == null
  const mudou = useMemo(() => !plano || JSON.stringify(r) !== JSON.stringify({ id: plano.id, nome: plano.nome, descricao: plano.descricao ?? '', duracaoDias: plano.duracaoDias, ativo: plano.ativo, padrao: plano.padrao, recursos: plano.recursos }), [r, plano])
  const emUso = (plano?.clientes ?? 0) + (plano?.pendentes ?? 0)
  const motivoNaoApaga = !plano ? '' : plano.padrao ? 'É o plano de quem se cadastra. Marque outro como padrão antes.' : emUso ? `${emUso === 1 ? 'Há 1 cliente' : `Há ${numero(emUso)} clientes`} neste plano. Mude o plano antes, ou só deixe o plano indisponível.` : ''

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) fechar() }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [salvando, fechar])

  const salvar = async () => {
    if (r.nome.trim().length < 2) { setErro('Dê um nome ao plano.'); return }
    if (!semVencimento && (!r.duracaoDias || r.duracaoDias < 1 || r.duracaoDias > 3650)) { setErro('A duração vai de 1 a 3.650 dias, ou sem vencimento.'); return }
    setSalvando(true); setErro('')
    try { await salvarPlano(sessao, { ...r, nome: r.nome.trim(), descricao: r.descricao?.trim() || null }); aoSalvar(r.nome.trim(), novo) }
    catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const apagar = async () => {
    if (!plano) return
    setSalvando(true); setErro('')
    try { await apagarPlano(sessao, plano.id); aoApagar(plano.nome) }
    catch (e) { setErro((e as Error).message); setConfirmaApagar(false) } finally { setSalvando(false) }
  }

  return (
    <div className="apl-fundo" onMouseDown={() => !salvando && fechar()}>
      <aside className="apl-painel" role="dialog" aria-modal="true" aria-labelledby="apl-painel-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header className="apl-painel-topo">
          <div>
            <span className="apl-rot">{novo ? 'Novo plano' : 'Plano'}</span>
            <h2 id="apl-painel-titulo">{novo ? 'Criar um plano' : plano.nome}</h2>
          </div>
          <button type="button" className="apl-fechar" onClick={fechar} aria-label="Fechar" disabled={salvando}>×</button>
        </header>

        <div className="apl-painel-corpo">
          {plano && (
            <section className="apl-detalhes" aria-label="Números do plano">
              <div><b>{numero(plano.clientes)}</b><span>Clientes</span></div>
              <div><b className="up">{numero(plano.ativos)}</b><span>Ativos</span></div>
              <div><b className={plano.expirados ? 'down' : ''}>{numero(plano.expirados)}</b><span>Expirados</span></div>
              <div><b>{numero(plano.novos30d)}</b><span>Novos em 30 dias</span></div>
              <div><b>{numero(plano.pendentes)}</b><span>Esperando aprovação</span></div>
              <p>Criado em {data(plano.criadoEm)} · alterado em {data(plano.atualizadoEm ?? plano.criadoEm)} · código <code>{plano.id}</code></p>
            </section>
          )}

          <label className="apl-campo">
            <span>Nome</span>
            <input id="apl-nome" value={r.nome} maxLength={60} autoFocus={novo} placeholder="Ex.: Anual com simulador" onChange={(e) => setR({ ...r, nome: e.target.value })} />
          </label>
          <label className="apl-campo">
            <span>Descrição <small>(só para a equipe)</small></span>
            <textarea id="apl-descricao" value={r.descricao ?? ''} maxLength={300} rows={2} placeholder="O que este plano é e para quem." onChange={(e) => setR({ ...r, descricao: e.target.value })} />
          </label>

          <fieldset className="apl-campo">
            <legend>Duração do acesso</legend>
            <div className="apl-duracoes">
              {DURACOES.map((d) => (
                <button type="button" key={d} className={r.duracaoDias === d ? 'on' : ''} onClick={() => setR({ ...r, duracaoDias: d })}>{duracaoTexto(d)}</button>
              ))}
              <button type="button" className={semVencimento ? 'on' : ''} onClick={() => setR({ ...r, duracaoDias: null })}>Sem vencimento</button>
            </div>
            {!semVencimento && (
              <label className="apl-dias">
                <input id="apl-dias" type="number" min={1} max={3650} value={r.duracaoDias ?? ''} onChange={(e) => setR({ ...r, duracaoDias: e.target.value ? Math.round(Number(e.target.value)) : 30 })} />
                <span>dias a partir da liberação</span>
              </label>
            )}
            <small className="apl-ajuda">Vale para quem entrar no plano a partir de agora. Quem já está nele mantém o vencimento da própria ficha.</small>
          </fieldset>

          <fieldset className="apl-campo">
            <legend>O que o plano libera</legend>
            <div className="apl-chaves">
              {recursosDaMarca.map((x) => (
                <label key={x.chave} className="apl-chave">
                  <input type="checkbox" id={`apl-${x.chave}`} checked={r.recursos[x.chave]} onChange={(e) => setR({ ...r, recursos: { ...r.recursos, [x.chave]: e.target.checked } })} />
                  <i aria-hidden="true" />
                  <span><b>{x.nome}</b><small>{x.ajuda}</small></span>
                </label>
              ))}
            </div>
            <small className="apl-ajuda">Vale na hora para todos os clientes deste plano.</small>
          </fieldset>

          <fieldset className="apl-campo">
            <legend>Disponibilidade</legend>
            <div className="apl-chaves">
              <label className="apl-chave">
                <input type="checkbox" id="apl-ativo" checked={r.ativo} disabled={r.padrao} onChange={(e) => setR({ ...r, ativo: e.target.checked })} />
                <i aria-hidden="true" />
                <span><b>Disponível para escolher</b><small>Aparece na ficha do cliente e na aprovação de cadastros. Indisponível, quem já está nele continua.</small></span>
              </label>
              <label className="apl-chave">
                <input type="checkbox" id="apl-padrao" checked={r.padrao} disabled={!!plano?.padrao} onChange={(e) => setR({ ...r, padrao: e.target.checked, ativo: e.target.checked ? true : r.ativo })} />
                <i aria-hidden="true" />
                <span><b>Plano de quem se cadastra</b><small>{plano?.padrao ? 'Este é o plano de quem se cadastra sozinho. Para trocar, marque outro plano.' : temOutroPadrao ? 'Passa a ser o plano de quem se cadastra sozinho, no lugar do atual.' : 'Quem se cadastra sozinho entra neste plano.'}</small></span>
              </label>
            </div>
          </fieldset>

          {erro && <p className="apl-erro" role="alert">{erro}</p>}
        </div>

        <footer className="apl-painel-pe">
          {plano && !confirmaApagar && (
            <button type="button" className="apl-botao perigo" disabled={salvando || !!motivoNaoApaga} title={motivoNaoApaga || 'Apagar este plano'} onClick={() => setConfirmaApagar(true)}>Apagar plano</button>
          )}
          {plano && confirmaApagar && (
            <div className="apl-confirma">
              <span>Apagar "{plano.nome}"?</span>
              <button type="button" className="apl-botao perigo" disabled={salvando} onClick={() => void apagar()}>{salvando ? 'Apagando…' : 'Sim, apagar'}</button>
              <button type="button" className="apl-botao" disabled={salvando} onClick={() => setConfirmaApagar(false)}>Não</button>
            </div>
          )}
          <div className="apl-pe-acoes">
            <button type="button" className="apl-botao" onClick={fechar} disabled={salvando}>Cancelar</button>
            <button type="button" className="apl-botao principal" onClick={() => void salvar()} disabled={salvando || !mudou}>{salvando && !confirmaApagar ? 'Salvando…' : novo ? 'Criar plano' : 'Salvar'}</button>
          </div>
        </footer>
        {plano && motivoNaoApaga && <p className="apl-motivo">{motivoNaoApaga}</p>}
      </aside>
    </div>
  )
}
