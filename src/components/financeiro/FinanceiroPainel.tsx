/**
 * Administração › Financeiro (11/11/2026, Tiago: "No menu de adm eu preciso criar uma parte de financeiro!
 * E ai pra acessar essa parte a pessoa vai ter uma credencial de acesso (senha individual). La dentro vamos
 * acompanhar os custos do projeto, os resultados, etc. lançar despesas, pagamentos, recebimentos, divisões,
 * tudo!").
 *
 * Abas: Resumo · Lançamentos · Divisão · Cadastros · Acessos (dono) · Histórico. O período do topo vale para
 * Resumo, Lançamentos e Divisão. A trava (Trava.tsx) aparece enquanto não houver token válido, e volta
 * sozinha depois de 20 minutos sem mexer na tela ou quando o banco recusa o token.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FinTrancado, doProjeto, fimDoMes, hoje, inicioDoMes, nomeDoMes, somarMeses,
  type DadosFin, type FinApi, type Lancamento, type MeuAcesso, type Periodo,
} from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Trava } from './Trava'
import { Resumo } from './Resumo'
import { Lancamentos, type FiltroInicial } from './Lancamentos'
import { Divisao } from './Divisao'
import { Cadastros } from './Cadastros'
import { Acessos } from './Acessos'
import { Historico } from './Historico'
import { EditorLancamento, type Rascunho } from './EditorLancamento'
import { Janela } from './ui'
import './financeiro.css'

type Aba = 'resumo' | 'lancamentos' | 'divisao' | 'cadastros' | 'acessos' | 'historico'
type ModoPeriodo = 'mes' | 'ano' | 'tudo' | 'personalizado'
const OCIOSO_MS = 20 * 60_000

function periodoDe(modo: ModoPeriodo, ref: string, de: string, ate: string): Periodo {
  if (modo === 'mes') return { de: inicioDoMes(ref), ate: fimDoMes(ref) }
  if (modo === 'ano') return { de: `${ref.slice(0, 4)}-01-01`, ate: `${ref.slice(0, 4)}-12-31` }
  if (modo === 'tudo') return { de: '2000-01-01', ate: '2100-12-31' }
  return de <= ate ? { de, ate } : { de: ate, ate: de }
}

export function FinanceiroPainel({ api, pedido = 0, nomeDaPlataforma }: {
  api: FinApi
  /** Sobe quando o Atualizar do topo do Admin é clicado. */
  pedido?: number
  nomeDaPlataforma: string
}) {
  const [acesso, setAcesso] = useState<MeuAcesso | null>(null)
  const [aberto, setAberto] = useState(() => api.destravado())
  const [avisoTrava, setAvisoTrava] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosFin | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('resumo')
  const [filtroInicial, setFiltroInicial] = useState<FiltroInicial>(null)
  const [chaveLista, setChaveLista] = useState(0)
  const [modo, setModo] = useState<ModoPeriodo>('mes')
  const [ref, setRef] = useState(hoje())
  const [de, setDe] = useState(inicioDoMes(hoje()))
  const [ate, setAte] = useState(hoje())
  const [editor, setEditor] = useState<{ l: Lancamento | null; rascunho?: Rascunho } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [seguranca, setSeguranca] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  // custo por projeto: '' = todos, 'geral' = sem projeto, ou o id do projeto
  const [projeto, setProjeto] = useState('')
  const papel = acesso?.papel ?? null
  const podeEditar = papel === 'dono' || papel === 'editor'
  const souDono = papel === 'dono'

  const lerAcesso = useCallback(async () => {
    try { setAcesso(await api.meuAcesso()) } catch (x) { setErro((x as Error).message) }
  }, [api])
  useEffect(() => { void lerAcesso() }, [lerAcesso])

  // encerra a sessão no banco (se ainda valer) e apaga o token desta aba
  const trancar = useCallback(async (motivo: string | null) => {
    await api.sair().catch(() => undefined)
    setAberto(false); setDados(null); setEditor(null); setSeguranca(false); setAvisoTrava(motivo)
    void lerAcesso()
  }, [api, lerAcesso])

  const ler = useCallback(async () => {
    try {
      setDados(await api.ler()); setErro(null)
    } catch (x) {
      if (x instanceof FinTrancado) void trancar('O financeiro foi bloqueado. Digite sua senha de novo.')
      else setErro((x as Error).message)
    }
  }, [api, trancar])

  // destravou: prepara a plataforma (categorias e contas de partida) e lê tudo
  // (sem acesso a esta plataforma não lê: a sessão das outras plataformas continua valendo)
  const nesta = acesso ? acesso.nesta !== false : null
  useEffect(() => {
    if (!aberto || !nesta) return
    void (async () => { await api.preparar().catch(() => undefined); await ler() })()
  }, [aberto, nesta]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pedido && aberto) void ler() }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps

  // 20 minutos sem mexer: tranca
  const ultimo = useRef(Date.now())
  useEffect(() => {
    if (!aberto) return
    const mexeu = () => { ultimo.current = Date.now() }
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true }))
    const t = window.setInterval(() => {
      if (Date.now() - ultimo.current > OCIOSO_MS) void trancar('Bloqueado depois de 20 minutos sem uso.')
      else if (!api.destravado()) void trancar('A sessão do financeiro terminou. Digite sua senha de novo.')
    }, 15_000)
    return () => { eventos.forEach((e) => window.removeEventListener(e, mexeu)); window.clearInterval(t) }
  }, [aberto, api, trancar])

  // o menu do cadeado fecha ao clicar fora
  useEffect(() => {
    if (!seguranca) return
    const fora = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.fin-seguranca')) setSeguranca(false) }
    window.addEventListener('pointerdown', fora)
    return () => window.removeEventListener('pointerdown', fora)
  }, [seguranca])
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 3800); return () => window.clearTimeout(t) }, [aviso])

  const periodo = useMemo(() => periodoDe(modo, ref, de, ate), [modo, ref, de, ate])
  const visao = useMemo(() => (dados ? doProjeto(dados, projeto) : null), [dados, projeto])
  const rotuloPeriodo = modo === 'mes' ? nomeDoMes(ref.slice(0, 7)) : modo === 'ano' ? ref.slice(0, 4) : modo === 'tudo' ? 'Desde o início' : `${periodo.de.split('-').reverse().join('/')} a ${periodo.ate.split('-').reverse().join('/')}`
  const andar = (n: number) => setRef((r) => modo === 'ano' ? `${Number(r.slice(0, 4)) + n}-06-15` : somarMeses(inicioDoMes(r), n))

  const depoisDeMudar = (mensagem: string) => { setEditor(null); setAviso(mensagem); void ler() }
  const pagar = async (l: Lancamento) => {
    try { await api.atualizarLancamento(l.id, { pago_em: hoje() }); setAviso(l.tipo === 'receita' || l.tipo === 'aporte' ? 'Marcado como recebido hoje.' : 'Marcado como pago hoje.'); void ler() }
    catch (x) { if (x instanceof FinTrancado) void trancar('O financeiro foi bloqueado. Digite sua senha de novo.'); else setAviso((x as Error).message) }
  }
  const irPara = (a: 'lancamentos' | 'divisao' | 'cadastros', filtro?: FiltroInicial) => {
    setAba(a)
    if (a === 'lancamentos') { setFiltroInicial(filtro ?? null); setChaveLista((n) => n + 1) }
  }

  if (!acesso) return <div className="fin"><div className="fin-carregando">{erro ?? 'Abrindo o financeiro…'}</div></div>
  if (!aberto || !nesta) return <div className="fin"><Trava api={api} acesso={acesso} aviso={avisoTrava} aoMudarAcesso={() => void lerAcesso()}
    aoDestravar={() => { setAvisoTrava(null); ultimo.current = Date.now(); void lerAcesso(); setAberto(true) }} /></div>

  const ABAS: Array<[Aba, string]> = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ['divisao', 'Divisão'], ['cadastros', 'Cadastros'], ...(souDono ? [['acessos', 'Acessos'] as [Aba, string]] : []), ['historico', 'Histórico']]
  const comPeriodo = aba === 'resumo' || aba === 'lancamentos' || aba === 'divisao'

  return <div className="fin">
    <div className="fin-barra">
      <nav className="fin-abas" role="tablist" aria-label="Financeiro">
        {ABAS.map(([id, nome]) => <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'on' : ''}
          onClick={() => { setAba(id); if (id === 'lancamentos') { setFiltroInicial(null); setChaveLista((n) => n + 1) } }}>{nome}</button>)}
      </nav>
      <div className="fin-barra-acoes">
        {podeEditar && <button type="button" className="fin-btn primario" onClick={() => setEditor({ l: null, rascunho: { projeto_id: projeto && projeto !== 'geral' ? projeto : null } })}><Icone nome="mais" />Novo lançamento</button>}
        <div className="fin-seguranca">
          <button type="button" className="fin-btn icone" onClick={() => setSeguranca((v) => !v)} aria-expanded={seguranca} aria-label="Segurança do financeiro" title="Segurança"><Icone nome="cadeado" /></button>
          {seguranca && <div className="fin-menu" role="menu">
            <p><b>{nomeDaPlataforma}</b><small>Você entrou como {papel === 'dono' ? 'dono' : papel === 'editor' ? 'editor' : 'leitor'}. Bloqueia sozinho depois de 20 minutos parado.</small></p>
            <button type="button" role="menuitem" onClick={() => { setSeguranca(false); setEditor(null); setTrocandoSenha(true) }}>Trocar minha senha</button>
            <button type="button" role="menuitem" className="perigo" onClick={() => void trancar('Financeiro bloqueado.')}>Bloquear agora</button>
          </div>}
        </div>
      </div>
    </div>

    {comPeriodo && <div className="fin-periodo">
      <div className="fin-seg" role="radiogroup" aria-label="Período">
        {([['mes', 'Mês'], ['ano', 'Ano'], ['tudo', 'Tudo'], ['personalizado', 'Personalizado']] as Array<[ModoPeriodo, string]>).map(([id, nome]) =>
          <button key={id} type="button" role="radio" aria-checked={modo === id} className={modo === id ? 'on' : ''} onClick={() => setModo(id)}>{nome}</button>)}
      </div>
      {(modo === 'mes' || modo === 'ano') && <div className="fin-navegar">
        <button type="button" className="fin-btn icone" onClick={() => andar(-1)} aria-label={modo === 'mes' ? 'Mês anterior' : 'Ano anterior'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
        <b>{rotuloPeriodo}</b>
        <button type="button" className="fin-btn icone" onClick={() => andar(1)} aria-label={modo === 'mes' ? 'Próximo mês' : 'Próximo ano'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
        {(modo === 'mes' ? ref.slice(0, 7) !== hoje().slice(0, 7) : ref.slice(0, 4) !== hoje().slice(0, 4)) && <button type="button" className="fin-link" onClick={() => setRef(hoje())}>{modo === 'mes' ? 'Este mês' : 'Este ano'}</button>}
      </div>}
      {aba !== 'divisao' && !!dados?.projetos.length && <label className={`fin-select fin-filtro-projeto${projeto ? ' on' : ''}`}><span>Projeto</span>
        <select value={projeto} onChange={(e) => setProjeto(e.target.value)}>
          <option value="">Todos</option>
          {dados.projetos.filter((p) => p.ativo || p.id === projeto).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="geral">Custo geral</option>
        </select></label>}
      {modo === 'personalizado' && <div className="fin-datas">
        <label><span>De</span><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label><span>Até</span><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
      </div>}
    </div>}

    {erro && <p className="fin-alerta erro" role="alert"><Icone nome="info" /><span>{erro}</span><button type="button" className="fin-link" onClick={() => void ler()}>Tentar de novo</button></p>}
    {!dados ? <div className="fin-carregando">{erro ? '' : 'Carregando os lançamentos…'}</div> : <>
      {aba === 'resumo' && <Resumo dados={visao!} todos={dados} projeto={projeto} aoProjeto={setProjeto} periodo={periodo} rotuloPeriodo={rotuloPeriodo} podeEditar={podeEditar}
        aoNovo={(t) => setEditor({ l: null, rascunho: { tipo: t, projeto_id: projeto && projeto !== 'geral' ? projeto : null } })} aoAbrir={(l) => setEditor({ l })} aoPagar={(l) => void pagar(l)} aoIr={irPara} />}
      {aba === 'lancamentos' && <Lancamentos key={chaveLista} dados={visao!} periodo={periodo} rotuloPeriodo={rotuloPeriodo} filtroInicial={filtroInicial} podeEditar={podeEditar}
        aoAbrir={(l) => setEditor({ l })} aoPagar={(l) => void pagar(l)} aoNovo={() => setEditor({ l: null, rascunho: { projeto_id: projeto && projeto !== 'geral' ? projeto : null } })} />}
      {aba === 'divisao' && <Divisao dados={dados} periodo={periodo} rotuloPeriodo={rotuloPeriodo} podeEditar={podeEditar} souDono={souDono}
        aoNovo={(r) => setEditor({ l: null, rascunho: r })} aoAbrir={(l) => setEditor({ l })} aoIr={() => setAba('cadastros')} />}
      {aba === 'cadastros' && <Cadastros api={api} dados={dados} podeEditar={podeEditar} souDono={souDono} aoMudar={depoisDeMudar} />}
      {aba === 'acessos' && souDono && <Acessos api={api} aoMudar={setAviso} />}
      {aba === 'historico' && <Historico api={api} dados={dados} />}
    </>}

    {editor && dados && <EditorLancamento key={editor.l?.id ?? 'novo'} api={api} dados={dados} nomeDoCaixa={`Caixa da ${nomeDaPlataforma.replace(/ Trade$/, '')}`} lancamento={editor.l} rascunho={editor.rascunho} podeEditar={podeEditar}
      aoFechar={() => setEditor(null)} aoSalvar={depoisDeMudar} />}
    {trocandoSenha && <TrocarSenha api={api} aoFechar={() => setTrocandoSenha(false)} aoTrocar={() => { setTrocandoSenha(false); setAviso('Senha trocada.') }} />}
    {aviso && <div className="fin-toast" role="status"><Icone nome="certo" />{aviso}</div>}
  </div>
}

function TrocarSenha({ api, aoFechar, aoTrocar }: { api: FinApi; aoFechar: () => void; aoTrocar: () => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  const boa = nova.length >= 8 && /[A-Za-z]/.test(nova) && /\d/.test(nova) && nova === confirma
  const salvar = async () => {
    if (!boa || !atual) return
    setIndo(true); setErro(null)
    try {
      const r = await api.trocarSenha(atual, nova)
      if ('ok' in r) { aoTrocar(); return }
      setErro(r.erro === 'senha' ? `Senha atual incorreta. Restam ${r.restam} tentativas.` : r.erro === 'bloqueado' ? 'Muitas tentativas erradas. Espere 15 minutos.' : r.erro === 'igual' ? 'A senha nova precisa ser diferente da atual.' : r.erro === 'fraca' ? 'Use 8 caracteres ou mais, com letras e números.' : 'Não foi possível trocar a senha.')
    } catch (x) { setErro((x as Error).message) } finally { setIndo(false) }
  }
  return <Janela largura={440} titulo="Trocar minha senha" sub="A senha do financeiro, não a do login." aoFechar={aoFechar}
    rodape={<><span className="fin-rodape-espaco" /><button type="button" className="fin-btn" onClick={aoFechar}>Cancelar</button>
      <button type="button" className="fin-btn primario" disabled={!boa || !atual || indo} onClick={() => void salvar()}>{indo ? 'Salvando…' : 'Trocar senha'}</button></>}>
    <form className="fin-form" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
      <div className="fin-form-grade">
        <label className="fin-campo largo"><span className="fin-campo-rot">Senha atual</span><input data-foco type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
        <label className="fin-campo largo"><span className="fin-campo-rot">Senha nova</span><input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <label className="fin-campo largo"><span className="fin-campo-rot">Repita a senha nova</span><input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          <small className="fin-campo-dica">8 caracteres ou mais, com letras e números.</small></label>
      </div>
      {erro && <p className="fin-erro" role="alert">{erro}</p>}
      <button type="submit" hidden />
    </form>
  </Janela>
}
