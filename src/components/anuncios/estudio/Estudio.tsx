/**
 * Administração › Anúncios › Estúdio (03/11/2026, Tiago: "precisa ser um painel super intuitivo...
 * crie isso e me surpreenda").
 *
 * A primeira tela pergunta "o que você quer fazer?" (subir, testar, escalar, ajustar). Embaixo:
 *   * Em andamento: rascunhos, anúncios criados pausados (prontos para ligar) e o que parou com erro;
 *   * Rodando agora: cada anúncio da GF com um semáforo, o diagnóstico em uma frase e a ação sugerida;
 *   * Testes A/B: as duas versões lado a lado, julgadas pelo cadastro real (não só pelo pixel);
 *   * Histórico: quem criou, ligou, pausou ou mudou orçamento.
 * Tudo que gasta dinheiro passa pela janela de confirmação, com o valor escrito.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import type { Anuncio, FunilDoBanco, PainelDaMeta } from '../../../core/teeds/anuncios'
import { certezaDoTeste, type ApiEstudio, type ContextoDoEstudio, type DadosDoRascunho, type ItemDoHistorico, type Rascunho } from '../../../core/teeds/estudio'
import { Criador, fotoDaConta } from './Criador'
import type { Aprendizado } from './MontarPublico'
import { POSICIONAMENTO_AUTO, type Publico } from '../../../core/teeds/publicos'
import { Confirmar, Icone, brl, int, quando } from './pecas'
import './estudio.css'

type Vista = 'inicio' | 'rodando' | 'testes' | 'historico'

/**
 * "O que já funciona" (03/11/2026): lê as quebras da Meta com cadastro (idade e gênero, estado,
 * lugar, aparelho) e devolve as frases e o público pronto para aplicar. Só com 10 cadastros ou mais.
 */
function aprenderDosCadastros(painel: PainelDaMeta | null): Aprendizado | null {
  const q = painel?.quebras
  if (!q) return null
  const soma = (l: Array<{ cadastros: number }>) => l.reduce((a, x) => a + (x.cadastros || 0), 0)
  if (soma(q.idadeGenero) < 10) return null
  const frases: string[] = [], aplicar: Partial<Publico> = {}
  // idade e gênero: as faixas que somam 60% dos cadastros
  const porIdade = new Map<string, number>(), porGenero = new Map<string, number>()
  for (const x of q.idadeGenero) { porIdade.set(String(x.age), (porIdade.get(String(x.age)) ?? 0) + x.cadastros); porGenero.set(String(x.gender), (porGenero.get(String(x.gender)) ?? 0) + x.cadastros) }
  const total = soma(q.idadeGenero), faixas = [...porIdade].sort((a, b) => b[1] - a[1])
  const escolhidas: string[] = []; let acc = 0
  for (const [f, n] of faixas) { if (acc / total >= 0.6) break; escolhidas.push(f); acc += n }
  const limites = escolhidas.flatMap((f) => f.replace('+', '-65').split('-').map(Number)).filter((n) => n >= 13)
  if (limites.length) { aplicar.idadeMin = Math.max(18, Math.min(...limites)); aplicar.idadeMax = Math.min(65, Math.max(...limites)) }
  const homens = (porGenero.get('male') ?? 0) / total, mulheres = (porGenero.get('female') ?? 0) / total
  aplicar.genero = homens >= 0.72 ? 'homens' : mulheres >= 0.72 ? 'mulheres' : 'todos'
  frases.push(`${aplicar.genero === 'homens' ? 'Homens' : aplicar.genero === 'mulheres' ? 'Mulheres' : 'Pessoas'} de ${aplicar.idadeMin} a ${aplicar.idadeMax}${aplicar.idadeMax === 65 ? '+' : ''} (${Math.round((acc / total) * 100)}% dos cadastros)`)
  // estados: os que somam metade dos cadastros (até 4)
  const reg = [...q.regiao].filter((x) => x.cadastros > 0).sort((a, b) => b.cadastros - a.cadastros), totalReg = soma(reg)
  const estados: string[] = []; let accR = 0
  for (const x of reg) { if (estados.length >= 4 || (accR / Math.max(1, totalReg) >= 0.5 && estados.length)) break; estados.push(String(x.region).replace(/\s*\((state|estado)\)\s*$/i, '')); accR += x.cadastros }
  if (estados.length && totalReg && accR / totalReg < 0.95) { aplicar.locais = estados.map((nome) => ({ tipo: 'estado' as const, nome })); frases.push(`${estados.join(', ')} (${Math.round((accR / totalReg) * 100)}%)`) }
  // lugares: se poucos lugares concentram 80% dos cadastros, a sugestão é ficar neles
  const mapa: Record<string, [string, string, string]> = {
    'instagram|instagram_reels': ['instagram', 'reels', 'Reels do Instagram'], 'instagram|instagram_stories': ['instagram', 'story', 'Stories do Instagram'], 'instagram|feed': ['instagram', 'stream', 'Feed do Instagram'],
    'instagram|instagram_explore': ['instagram', 'explore', 'Explorar do Instagram'], 'facebook|feed': ['facebook', 'feed', 'Feed do Facebook'], 'facebook|facebook_reels': ['facebook', 'facebook_reels', 'Reels do Facebook'], 'facebook|facebook_stories': ['facebook', 'story', 'Stories do Facebook'],
  }
  const pos = [...q.posicionamento].filter((x) => x.cadastros > 0).sort((a, b) => b.cadastros - a.cadastros), totalPos = soma(pos)
  const lugares: Array<[string, string, string]> = []; let accP = 0
  for (const x of pos) { const m = mapa[`${x.publisher_platform}|${x.platform_position}`]; if (!m || lugares.length >= 3 || accP / Math.max(1, totalPos) >= 0.8) break; lugares.push(m); accP += x.cadastros }
  if (lugares.length && totalPos && accP / totalPos >= 0.8) {
    aplicar.posicionamentos = { ...POSICIONAMENTO_AUTO, modo: 'manual', instagram: lugares.filter((l) => l[0] === 'instagram').map((l) => l[1]), facebook: lugares.filter((l) => l[0] === 'facebook').map((l) => l[1]) }
    frases.push(`${lugares.map((l) => l[2]).join(', ')} (${Math.round((accP / totalPos) * 100)}%)`)
  }
  // aparelho
  const ap = q.aparelho.filter((x) => x.cadastros > 0), totalAp = soma(ap), celular = soma(ap.filter((x) => /mobile/.test(String(x.device_platform))))
  if (totalAp && celular / totalAp >= 0.95) frases.push(`no celular (${Math.round((celular / totalAp) * 100)}%)`)
  return { frases, aplicar }
}
type Cor = 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'cinza'
interface Diagnostico { cor: Cor; frase: string; acao: 'pausar' | 'ligar' | 'trocar' | 'escalar' | null; campeao?: boolean }

const SITUACAO: Record<Rascunho['situacao'], [string, string]> = {
  rascunho: ['Rascunho', 'cinza'], criando: ['Criando na Meta', 'azul'], pausado: ['Pronto para ligar', 'ouro'], ligado: ['No ar', 'verde'], erro: ['Parou no meio', 'vermelho'],
}

export function EstudioDeAnuncios({ sessao, api, parceiro, contaNome, painel, funil, custoPorCadastro, recarregar, abrirChave, pedido }: {
  sessao: SessaoTeeds; api: ApiEstudio; parceiro: string; contaNome: string
  painel: PainelDaMeta | null; funil: FunilDoBanco | null; custoPorCadastro: number | null
  recarregar: () => void; abrirChave: () => void
  /** o botão "Subir anúncio" do topo da página abre o estúdio direto no passo a passo */
  pedido: { tipo: 'novo' | 'teste'; n: number } | null
}) {
  const [ctx, setCtx] = useState<ContextoDoEstudio | null>(null)
  const [erroCtx, setErroCtx] = useState<string | null>(null)
  const [rascunhos, setRascunhos] = useState<Rascunho[] | null>(null)
  const [historico, setHistorico] = useState<ItemDoHistorico[] | null>(null)
  const [vista, setVista] = useState<Vista>('inicio')
  const [filtro, setFiltro] = useState<'todos' | 'atencao' | 'campeoes' | 'pausados'>('todos')
  const [criador, setCriador] = useState<{ tipo: 'novo' | 'teste'; inicial: Rascunho | null; prefill?: Partial<DadosDoRascunho> } | null>(null)
  const [confirmar, setConfirmar] = useState<null | { titulo: string; corpo: ReactElement; botao: string; perigo?: boolean; fazer: () => Promise<string | void> }>(null)
  const [indo, setIndo] = useState<{ indo?: boolean; erro?: string | null }>({})
  const [aviso, setAviso] = useState<{ texto: string; acao?: { nome: string; fazer: () => void } } | null>(null)
  const [orcamento, setOrcamento] = useState<{ conjuntoId: string; nome: string; atual: number; novo: number } | null>(null)
  const [escala, setEscala] = useState<{ conjuntoId: string; nome: string; atual: number; aumento: number } | null>(null)

  const carregarTudo = () => {
    api.contexto(sessao, parceiro).then((c) => { setCtx(c); setErroCtx(null) }).catch((e) => setErroCtx((e as Error).message))
    api.rascunhos(sessao, parceiro).then(setRascunhos).catch(() => setRascunhos([]))
    api.historico(sessao, parceiro).then(setHistorico).catch(() => setHistorico([]))
  }
  useEffect(carregarTudo, [parceiro, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pedido && ctx) setCriador({ tipo: pedido.tipo, inicial: null }) }, [pedido?.n, !!ctx]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), aviso.acao ? 12000 : 5000); return () => clearTimeout(t) }, [aviso])

  /* ---------------------------------------------- o que está rodando, com o diagnóstico */
  const real = useMemo(() => new Map((funil?.porAnuncio ?? []).map((a) => [a.id, a])), [funil])
  const aprendizado = useMemo(() => aprenderDosCadastros(painel), [painel])
  const anuncios = useMemo(() => (painel?.anuncios ?? []).filter((a) => !['ARCHIVED', 'DELETED'].includes(a.status)), [painel])
  const media = useMemo(() => {
    let g = 0, c = 0
    for (const a of anuncios) { const r = real.get(a.id); if (r?.cadastros) { g += a.m.gasto; c += r.cadastros } }
    return c ? g / c : null
  }, [anuncios, real])
  const diagnostico = (a: Anuncio): Diagnostico => {
    const cad = real.get(a.id)?.cadastros ?? 0, custo = cad ? a.m.gasto / cad : null
    if (a.status !== 'ACTIVE') return { cor: 'cinza', frase: a.status === 'PAUSED' ? 'Pausado. Não está gastando.' : 'Parado pela campanha ou pelo público.', acao: a.status === 'PAUSED' ? 'ligar' : null }
    if (a.m.impressoes === 0) return { cor: 'azul', frase: 'Ainda sem entrega. A Meta pode estar revisando o anúncio.', acao: null }
    if (!cad && a.m.gasto >= Math.max(15, (media ?? 20) * 1.5)) return { cor: 'vermelho', frase: `Gastou ${brl(a.m.gasto)} e ainda não trouxe cadastro.`, acao: 'pausar' }
    if (custo != null && media && custo >= media * 1.3) return { cor: 'amarelo', frase: `Cadastro ${int((custo / media - 1) * 100)}% mais caro que a média dos anúncios.`, acao: 'trocar' }
    if (a.m.frequencia >= 2.5) return { cor: 'amarelo', frase: `Público cansado: cada pessoa já viu ${a.m.frequencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vezes.`, acao: 'trocar' }
    if (custo != null && media && custo <= media * 0.8 && cad >= 3) return { cor: 'verde', frase: `Campeão: cadastro ${int((1 - custo / media) * 100)}% mais barato que a média.`, acao: 'escalar', campeao: true }
    return { cor: 'verde', frase: cad ? 'Dentro do esperado.' : 'Entregando. Os cadastros ainda estão chegando.', acao: null }
  }
  const comDiagnostico = useMemo(() => anuncios.map((a) => ({ a, d: diagnostico(a) })), [anuncios, real, media]) // eslint-disable-line react-hooks/exhaustive-deps
  const noAr = comDiagnostico.filter((x) => x.a.status === 'ACTIVE')
  const pedemAtencao = comDiagnostico.filter((x) => x.d.cor === 'vermelho' || x.d.cor === 'amarelo')
  const campeoes = comDiagnostico.filter((x) => x.d.campeao)
  const listaFiltrada = comDiagnostico.filter((x) => filtro === 'todos' || (filtro === 'atencao' ? x.d.cor === 'vermelho' || x.d.cor === 'amarelo' : filtro === 'campeoes' ? x.d.campeao : x.a.status !== 'ACTIVE'))
    .sort((x, y) => ({ vermelho: 0, amarelo: 1, verde: 2, azul: 3, cinza: 4 }[x.d.cor] - { vermelho: 0, amarelo: 1, verde: 2, azul: 3, cinza: 4 }[y.d.cor]) || y.a.m.gasto - x.a.m.gasto)

  const emAndamento = (rascunhos ?? []).filter((r) => r.situacao !== 'ligado' || r.tipo === 'teste')
  const testes = (rascunhos ?? []).filter((r) => r.tipo === 'teste' && (r.situacao === 'ligado' || r.situacao === 'pausado'))
  const semChave = !!ctx?.semChave

  /* ---------------------------------------------- ações */
  const executar = async () => {
    if (!confirmar) return
    setIndo({ indo: true })
    try {
      const texto = await confirmar.fazer()
      setConfirmar(null); setIndo({})
      if (texto) setAviso({ texto })
      recarregar(); api.historico(sessao, parceiro).then(setHistorico).catch(() => {})
      api.rascunhos(sessao, parceiro).then(setRascunhos).catch(() => {})
    } catch (e) { setIndo({ erro: (e as Error).message }) }
  }
  const pausarOuLigar = (a: Anuncio, ligar: boolean) => {
    const conjunto = painel?.conjuntos.find((s) => s.id === a.conjuntoId)
    setIndo({})
    setConfirmar({
      titulo: ligar ? 'Ligar este anúncio?' : 'Pausar este anúncio?', botao: ligar ? 'Ligar' : 'Pausar', perigo: !ligar,
      corpo: ligar
        ? <p><b>{a.nome}</b> volta a entregar{conjunto?.orcDia ? <> dentro do orçamento do público <b>{conjunto.nome}</b> ({brl(conjunto.orcDia)} por dia)</> : null}.</p>
        : <p><b>{a.nome}</b> para de entregar agora. O que ele já trouxe continua contando, e dá para ligar de novo quando quiser.</p>,
      fazer: async () => { await api.status(sessao, parceiro, 'anuncio', a.id, ligar); return ligar ? 'Anúncio ligado.' : 'Anúncio pausado.' },
    })
  }
  const trocarVideo = (a: Anuncio) => setCriador({
    tipo: 'novo', inicial: null,
    prefill: {
      nomeAnuncio: `${a.nome.replace(/^GF \|\s*/, '')} · novo criativo`,
      texto: { principal: a.criativo.texto, titulo: a.criativo.titulo, descricao: '', botao: a.criativo.cta || 'SIGN_UP' },
      destino: { campanha: a.campanhaId, nomeCampanha: '', conjunto: a.conjuntoId, nomeConjunto: '' },
    },
  })
  const abrirEscala = (a: Anuncio) => {
    const s = painel?.conjuntos.find((c) => c.id === a.conjuntoId)
    if (s) setEscala({ conjuntoId: s.id, nome: s.nome, atual: s.orcDia, aumento: 20 })
  }
  const ligarRascunho = (r: Rascunho) => {
    setIndo({})
    setConfirmar({
      titulo: 'Ligar e começar a gastar?', botao: 'Ligar agora',
      corpo: <><p><b>{r.nome}</b> {r.tipo === 'teste' ? 'começa o teste A/B' : 'começa a entregar'}: até <b>{brl(r.dados.diario)} por dia</b> na conta <b>{contaNome}</b>{r.tipo === 'teste' ? `, metade em cada versão, por ${r.dados.teste?.dias ?? 7} dias` : ''}.</p><p className="es-mudo">Dá para pausar a qualquer momento.</p></>,
      fazer: async () => { await api.ligar(sessao, parceiro, r.id); return r.tipo === 'teste' ? 'Teste A/B no ar.' : 'Anúncio no ar. A Meta revisa antes de entregar.' },
    })
  }
  const arquivar = (r: Rascunho) => {
    setIndo({})
    setConfirmar({
      titulo: 'Tirar da lista?', botao: 'Tirar da lista', perigo: true,
      corpo: <p><b>{r.nome}</b> sai de "Em andamento". {r.situacao === 'pausado' ? 'O que já foi criado na Meta continua lá, pausado.' : 'Nada é enviado para a Meta.'}</p>,
      fazer: async () => { await api.arquivar(sessao, r.id); return 'Tirado da lista.' },
    })
  }
  const escolherVencedor = (r: Rascunho, v: 'a' | 'b') => {
    setIndo({})
    setConfirmar({
      titulo: `Ficar com a versão ${v.toUpperCase()}?`, botao: `Ficar com a ${v.toUpperCase()}`,
      corpo: <p>A versão {v === 'a' ? 'B' : 'A'} é pausada e a {v.toUpperCase()} continua no ar. Depois dá para escalar a vencedora em "Rodando agora".</p>,
      fazer: async () => { await api.vencedor(sessao, parceiro, r.id, v); return `Versão ${v.toUpperCase()} escolhida. A outra foi pausada.` },
    })
  }

  const fecharCriador = (mudou: boolean) => { setCriador(null); if (mudou) { api.rascunhos(sessao, parceiro).then(setRascunhos).catch(() => {}); api.historico(sessao, parceiro).then(setHistorico).catch(() => {}); recarregar() } }

  if (erroCtx && !ctx) return <div className="es-falha"><p>{erroCtx}</p><button type="button" className="es-btn" onClick={carregarTudo}>Tentar de novo</button></div>
  if (!ctx) return <div className="es-carregando" aria-busy="true"><span className="es-giro" />Abrindo o estúdio…</div>

  const ACOES: Array<{ id: string; icone: Parameters<typeof Icone>[0]['nome']; nome: string; dica: string; extra: string; fraco?: boolean; fazer: () => void }> = [
    { id: 'novo', icone: 'novo', nome: 'Subir anúncio novo', dica: 'Vídeo ou imagem, texto e pronto. O resto já vem no jeito certo.', extra: 'Uns 2 minutos', fazer: () => setCriador({ tipo: 'novo', inicial: null }) },
    { id: 'teste', icone: 'teste', nome: 'Testar duas versões', dica: 'Descubra qual traz o cadastro mais barato, com público dividido.', extra: testes.length ? `${testes.length} ${testes.length === 1 ? 'teste' : 'testes'} agora` : 'Teste A/B oficial', fazer: () => setCriador({ tipo: 'teste', inicial: null }) },
    { id: 'escalar', icone: 'escalar', nome: 'Escalar um campeão', dica: 'Mais orçamento para o que já traz cadastro barato.', extra: campeoes.length ? `${campeoes.length} ${campeoes.length === 1 ? 'campeão' : 'campeões'} agora` : 'Nenhum campeão ainda', fraco: !campeoes.length, fazer: () => { setFiltro('campeoes'); setVista('rodando') } },
    { id: 'ajustar', icone: 'ajustar', nome: 'Ajustar o que está rodando', dica: 'Pausar, ligar e mudar o orçamento, com o diagnóstico de cada um.', extra: `${noAr.length} no ar${pedemAtencao.length ? ` · ${pedemAtencao.length} ${pedemAtencao.length === 1 ? 'pede' : 'pedem'} atenção` : ''}`, fazer: () => { setFiltro(pedemAtencao.length ? 'atencao' : 'todos'); setVista('rodando') } },
  ]

  return (
    <div className="es" data-sem-vocabulario="">
      <section className="es-hero">
        <div className="es-hero-texto">
          <span className="es-rot">Estúdio de anúncios</span>
          <h2>O que você quer fazer hoje?</h2>
          <p>Tudo nasce pausado. Nada gasta antes de você ligar.</p>
        </div>
        <div className="es-conta">
          <i className="es-av"><img src={fotoDaConta(ctx)} alt="" /></i>
          <div><b>@{ctx.instagram.usuario}</b><small>{contaNome}</small></div>
        </div>
      </section>

      {semChave && (
        <div className="es-faixa">
          <Icone nome="aviso" tam={18} />
          <p><b>Falta a chave da conta de anúncios.</b> Já dá para montar e salvar rascunhos. Enviar para a Meta e mexer no que está rodando liberam quando ela for conectada.</p>
          <button type="button" className="es-btn fino" onClick={abrirChave}>Colar a chave</button>
        </div>
      )}

      <nav className="es-vistas" role="tablist" aria-label="Partes do estúdio">
        {([['inicio', 'Início'], ['rodando', 'Rodando agora'], ['testes', 'Testes A/B'], ['historico', 'Histórico']] as Array<[Vista, string]>).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} className={vista === id ? 'on' : ''} onClick={() => setVista(id)}>
            {nome}{id === 'rodando' && pedemAtencao.length ? <i className="alerta">{pedemAtencao.length}</i> : id === 'testes' && testes.length ? <i>{testes.length}</i> : null}
          </button>
        ))}
      </nav>

      {vista === 'inicio' && (
        <>
          <div className="es-acoes">
            {ACOES.map((a) => (
              <button key={a.id} type="button" className={`es-acao ${a.id}`} onClick={a.fazer}>
                <span className="es-acao-ic"><Icone nome={a.icone} tam={24} /></span>
                <b>{a.nome}</b>
                <span>{a.dica}</span>
                <small className={a.fraco ? 'fraco' : ''}>{a.extra}</small>
              </button>
            ))}
          </div>

          <section className="es-bloco">
            <header><h3>Em andamento</h3>{rascunhos && emAndamento.length > 0 && <small>{emAndamento.length} {emAndamento.length === 1 ? 'item' : 'itens'}</small>}</header>
            {!rascunhos ? <p className="es-vazio">Carregando…</p> : !emAndamento.length ? (
              <div className="es-vazio grande"><Icone nome="novo" tam={28} /><b>Nada em andamento.</b><span>O que você começar a montar fica salvo aqui, para terminar depois, até em outro aparelho.</span></div>
            ) : (
              <ul className="es-andamento">
                {emAndamento.map((r) => {
                  const [nome, cor] = SITUACAO[r.situacao]
                  return (
                    <li key={r.id}>
                      <span className="es-mini">{r.dados.midia?.poster ? <img src={r.dados.midia.poster} alt="" /> : <Icone nome={r.tipo === 'teste' ? 'teste' : 'novo'} tam={20} />}</span>
                      <div className="es-andamento-texto">
                        <b>{r.nome}</b>
                        <small>{r.tipo === 'teste' ? 'Teste A/B · ' : ''}{brl(r.dados.diario, 0)}/dia · atualizado {quando(r.atualizadoEm)}</small>
                        {r.situacao === 'erro' && r.erro && <small className="es-erro-mini">{r.erro}</small>}
                      </div>
                      <span className={`es-chip ${cor}`}>{nome}</span>
                      <div className="es-andamento-acoes">
                        {(r.situacao === 'rascunho' || r.situacao === 'erro' || r.situacao === 'criando') && <button type="button" className="es-btn fino principal" onClick={() => setCriador({ tipo: r.tipo, inicial: r })}>{r.situacao === 'erro' ? 'Tentar de novo' : 'Continuar'}</button>}
                        {r.situacao === 'pausado' && <button type="button" className="es-btn fino principal" onClick={() => ligarRascunho(r)} disabled={semChave}><Icone nome="ligar" tam={14} />Ligar</button>}
                        {r.situacao === 'ligado' && <button type="button" className="es-btn fino" onClick={() => setVista('testes')}>Ver o teste</button>}
                        {r.situacao !== 'ligado' && r.situacao !== 'criando' && <button type="button" className="es-btn fino icone" onClick={() => arquivar(r)} aria-label={`Tirar ${r.nome} da lista`} title="Tirar da lista"><Icone nome="lixo" tam={15} /></button>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {vista === 'rodando' && (
        <section className="es-bloco">
          <header>
            <h3>Rodando agora</h3>
            <div className="es-chips">
              {([['todos', 'Todos', comDiagnostico.length], ['atencao', 'Pedem atenção', pedemAtencao.length], ['campeoes', 'Campeões', campeoes.length], ['pausados', 'Pausados', comDiagnostico.length - noAr.length]] as const).map(([id, nome, n]) => (
                <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nome} <i>{n}</i></button>
              ))}
            </div>
          </header>
          {!painel ? <p className="es-vazio">Os anúncios aparecem quando a conta estiver conectada.</p> : !listaFiltrada.length ? (
            <div className="es-vazio grande"><Icone nome="conferir" tam={28} /><b>{filtro === 'campeoes' ? 'Nenhum campeão por enquanto.' : filtro === 'atencao' ? 'Nada pedindo atenção.' : 'Nenhum anúncio da GlobalFly neste período.'}</b><span>{filtro === 'campeoes' ? 'Campeão é o anúncio com cadastro 20% mais barato que a média e pelo menos 3 cadastros.' : 'Quando um anúncio sair do esperado, ele aparece aqui com o que fazer.'}</span></div>
          ) : (
            <ul className="es-rodando">
              {listaFiltrada.map(({ a, d }) => {
                const r = real.get(a.id), conjunto = painel.conjuntos.find((s) => s.id === a.conjuntoId)
                return (
                  <li key={a.id} className={d.cor}>
                    <div className="es-rod-topo">
                      <span className="es-mini grande">{a.criativo.miniatura ? <img src={a.criativo.miniatura} alt="" loading="lazy" /> : <Icone nome="novo" tam={20} />}</span>
                      <div><b>{a.nome.replace(/^GF \|\s*/, '')}</b><small>{conjunto?.nome ?? ''}</small></div>
                    </div>
                    <p className="es-diag"><i aria-hidden="true" />{d.frase}</p>
                    <dl className="es-numeros">
                      <div><dt>Investido</dt><dd>{brl(a.m.gasto)}</dd></div>
                      <div><dt>Cadastros</dt><dd>{int(r?.cadastros ?? 0)}</dd></div>
                      <div><dt>Por cadastro</dt><dd>{r?.cadastros ? brl(a.m.gasto / r.cadastros) : '—'}</dd></div>
                    </dl>
                    <div className="es-rod-acoes">
                      {d.acao === 'escalar' && <button type="button" className="es-btn fino principal" onClick={() => abrirEscala(a)} disabled={semChave}><Icone nome="escalar" tam={14} />Escalar</button>}
                      {d.acao === 'trocar' && <button type="button" className="es-btn fino principal" onClick={() => trocarVideo(a)}><Icone nome="subir" tam={14} />Trocar o criativo</button>}
                      {d.acao === 'pausar' && <button type="button" className="es-btn fino perigo" onClick={() => pausarOuLigar(a, false)} disabled={semChave}><Icone nome="pausar" tam={14} />Pausar</button>}
                      {d.acao === 'ligar' && <button type="button" className="es-btn fino principal" onClick={() => pausarOuLigar(a, true)} disabled={semChave}><Icone nome="ligar" tam={14} />Ligar</button>}
                      {a.status === 'ACTIVE' && d.acao !== 'pausar' && <button type="button" className="es-btn fino" onClick={() => pausarOuLigar(a, false)} disabled={semChave}><Icone nome="pausar" tam={14} />Pausar</button>}
                      {conjunto && conjunto.orcDia > 0 && <button type="button" className="es-btn fino" onClick={() => setOrcamento({ conjuntoId: conjunto.id, nome: conjunto.nome, atual: conjunto.orcDia, novo: conjunto.orcDia })} disabled={semChave}>{brl(conjunto.orcDia, 0)}/dia · Mudar</button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {media && <p className="es-nota">A média de custo por cadastro dos anúncios neste período é {brl(media)}. O semáforo compara cada anúncio com ela.</p>}
        </section>
      )}

      {vista === 'testes' && (
        <section className="es-bloco">
          <header><h3>Testes A/B</h3><button type="button" className="es-btn fino principal" onClick={() => setCriador({ tipo: 'teste', inicial: null })}><Icone nome="teste" tam={14} />Novo teste</button></header>
          {!testes.length ? (
            <div className="es-vazio grande"><Icone nome="teste" tam={28} /><b>Nenhum teste ainda.</b><span>Compare dois vídeos, dois textos ou dois públicos. O vencedor é decidido pelo cadastro real, não só pelo que o pixel contou.</span></div>
          ) : <div className="es-testes">{testes.map((r) => <CartaoDoTeste key={r.id} r={r} painel={painel} real={real} ligar={() => ligarRascunho(r)} escolher={(v) => escolherVencedor(r, v)} semChave={semChave} />)}</div>}
        </section>
      )}

      {vista === 'historico' && (
        <section className="es-bloco">
          <header><h3>Histórico</h3></header>
          {!historico ? <p className="es-vazio">Carregando…</p> : !historico.length ? <div className="es-vazio grande"><Icone nome="relogio" tam={28} /><b>Nada por aqui ainda.</b><span>Cada anúncio criado, ligado, pausado ou com orçamento mudado aparece aqui, com quem fez.</span></div> : (
            <ol className="es-historico">{historico.map((h) => <LinhaDoHistorico key={h.id} h={h} />)}</ol>
          )}
        </section>
      )}

      {criador && (
        <Criador sessao={sessao} api={api} parceiro={parceiro} ctx={ctx} tipo={criador.tipo} inicial={criador.inicial} prefill={criador.prefill}
          custoPorCadastro={custoPorCadastro} contaNome={contaNome} fechar={fecharCriador} aprendizado={aprendizado} />
      )}

      {confirmar && <Confirmar titulo={confirmar.titulo} botao={confirmar.botao} perigo={confirmar.perigo} indo={indo.indo} erro={indo.erro} confirmar={() => void executar()} cancelar={() => setConfirmar(null)}>{confirmar.corpo}</Confirmar>}

      {orcamento && (() => {
        const v = orcamento.novo, d = orcamento.atual ? (v - orcamento.atual) / orcamento.atual : 0
        return (
          <Confirmar titulo="Mudar o orçamento por dia" botao={`Mudar para ${brl(v, 0)}/dia`} indo={indo.indo} erro={indo.erro} cancelar={() => setOrcamento(null)}
            confirmar={async () => {
              setIndo({ indo: true })
              try { await api.orcamento(sessao, parceiro, orcamento.conjuntoId, v); setOrcamento(null); setIndo({}); setAviso({ texto: `Orçamento de ${orcamento.nome} agora é ${brl(v, 0)} por dia.` }); recarregar(); api.historico(sessao, parceiro).then(setHistorico).catch(() => {}) }
              catch (e) { setIndo({ erro: (e as Error).message }) }
            }}>
            <p>Público <b>{orcamento.nome}</b>, hoje com {brl(orcamento.atual, 0)} por dia.</p>
            <div className="es-passo-valor">
              <button type="button" onClick={() => setOrcamento({ ...orcamento, novo: Math.max(6, Math.round(v * 0.9)) })} aria-label="Diminuir 10%">−10%</button>
              <label><span>R$</span><input id="es-orc-novo" type="number" min={6} max={ctx.maxDia} value={v} onChange={(e) => setOrcamento({ ...orcamento, novo: Math.max(0, Math.min(ctx.maxDia, Math.round(Number(e.target.value) || 0))) })} /></label>
              <button type="button" onClick={() => setOrcamento({ ...orcamento, novo: Math.min(ctx.maxDia, Math.round(v * 1.1)) })} aria-label="Aumentar 10%">+10%</button>
            </div>
            {Math.abs(d) > 0.2 && <p className="es-dica amarelo">Mudar mais de 20% de uma vez faz a Meta reaprender o público, e o custo oscila por alguns dias. Para crescer com calma, suba até 20% por dia, ou use "Escalar".</p>}
          </Confirmar>
        )
      })()}

      {escala && (() => {
        const novo = Math.round(escala.atual * (1 + escala.aumento / 100))
        return (
          <Confirmar titulo="Escalar o campeão" botao="Criar a cópia pausada" indo={indo.indo} erro={indo.erro} cancelar={() => setEscala(null)}
            confirmar={async () => {
              setIndo({ indo: true })
              try {
                const r = await api.escalar(sessao, parceiro, escala.conjuntoId, escala.aumento)
                setEscala(null); setIndo({}); api.historico(sessao, parceiro).then(setHistorico).catch(() => {})
                setAviso({ texto: `Cópia criada, pausada, com ${brl(r.diario, 0)} por dia.`, acao: { nome: 'Ligar a cópia', fazer: () => { setIndo({}); setConfirmar({ titulo: 'Ligar a cópia?', botao: 'Ligar', corpo: <p>A cópia de <b>{escala.nome}</b> começa a gastar até <b>{brl(r.diario)} por dia</b>.</p>, fazer: async () => { await api.status(sessao, parceiro, 'conjunto', r.conjuntoId, true, true); return 'Cópia no ar.' } }) } } })
                recarregar()
              } catch (e) { setIndo({ erro: (e as Error).message }) }
            }}>
            <p>O estúdio cria uma <b>cópia pausada</b> do público <b>{escala.nome}</b>, com os mesmos anúncios e orçamento maior. O original continua como está. Assim a Meta não reaprende o que já funciona.</p>
            <div className="es-chips centro">{[20, 30, 50].map((p) => <button key={p} type="button" className={escala.aumento === p ? 'on' : ''} aria-pressed={escala.aumento === p} onClick={() => setEscala({ ...escala, aumento: p })}>+{p}%</button>)}</div>
            <p className="es-grande-numero">{brl(escala.atual, 0)} <span>→</span> <b>{brl(novo, 0)}</b><small>por dia na cópia</small></p>
          </Confirmar>
        )
      })()}

      {aviso && (
        <div className="es-aviso" role="status">
          <Icone nome="ok" tam={16} /><span>{aviso.texto}</span>
          {aviso.acao && <button type="button" onClick={() => { const f = aviso.acao!.fazer; setAviso(null); f() }}>{aviso.acao.nome}</button>}
          <button type="button" className="fechar" onClick={() => setAviso(null)} aria-label="Fechar aviso"><Icone nome="fechar" tam={14} /></button>
        </div>
      )}
    </div>
  )
}

function CartaoDoTeste({ r, painel, real, ligar, escolher, semChave }: {
  r: Rascunho; painel: PainelDaMeta | null; real: Map<string, FunilDoBanco['porAnuncio'][number]>; ligar: () => void; escolher: (v: 'a' | 'b') => void; semChave: boolean
}) {
  const p = r.progresso
  const lado = (id?: string) => {
    const a = painel?.anuncios.find((x) => x.id === id), n = id ? real.get(id) : undefined
    return { a, gasto: a?.m.gasto ?? 0, cadastros: n?.cadastros ?? 0, live: n?.live ?? 0, gfm: n?.liberados ?? 0, cliques: a?.m.cliquesLink ?? 0 }
  }
  const A = lado(p.anuncioId), B = lado(p.anuncioB)
  const c = certezaDoTeste(A, B)
  const custo = (x: typeof A) => (x.cadastros ? x.gasto / x.cadastros : null)
  const variavel = r.dados.teste?.variavel
  const oQue = variavel === 'criativo' ? 'o criativo' : variavel === 'texto' ? 'o texto' : 'o público'
  const lider = c.lider, cA = custo(A), cB = custo(B)
  const decidido = !!lider && c.certeza >= 0.9 && A.cadastros + B.cadastros >= 20
  const frase = r.situacao === 'pausado' ? 'Criado e pausado. O teste começa quando você ligar.'
    : !A.gasto && !B.gasto ? 'No ar. Os primeiros números aparecem em algumas horas.'
      : !lider ? 'Empatadas até agora.'
        : `A versão ${lider.toUpperCase()} traz cadastro ${int(c.diferenca * 100)}% mais barato${(lider === 'a' ? A.live > B.live : B.live > A.live) ? ' e mais gente na live' : ''}.`
  const linhas: Array<[string, (x: typeof A) => string, (x: typeof A) => number | null, boolean]> = [
    ['Investido', (x) => brl(x.gasto), () => null, false],
    ['Cadastros reais', (x) => int(x.cadastros), (x) => x.cadastros, false],
    ['Custo por cadastro', (x) => (custo(x) ? brl(custo(x)!) : '—'), (x) => custo(x), true],
    ['Assistiram à live', (x) => int(x.live), (x) => x.live, false],
    ['GF Member', (x) => int(x.gfm), (x) => x.gfm, false],
  ]
  const melhor = (f: (x: typeof A) => number | null, menor: boolean) => {
    const a = f(A), b = f(B)
    if (a == null || b == null || a === b) return null
    return (menor ? a < b : a > b) ? 'a' : 'b'
  }
  return (
    <article className={`es-teste ${p.vencedor ? 'fim' : ''}`}>
      <header>
        <div><b>{r.nome}</b><small>Muda só {oQue} · {r.dados.teste?.dias ?? 7} dias · {brl(r.dados.diario, 0)}/dia{p.testeSimples ? ' · lado a lado na campanha' : p.estudoId ? ' · teste oficial da Meta' : ''}</small></div>
        <span className={`es-chip ${r.situacao === 'ligado' ? 'verde' : 'ouro'}`}>{p.vencedor ? `Ficou a ${p.vencedor.toUpperCase()}` : r.situacao === 'ligado' ? 'Testando' : 'Pronto para ligar'}</span>
      </header>
      <p className="es-veredito">{frase}</p>
      {r.situacao === 'ligado' && (A.gasto > 0 || B.gasto > 0) && (
        <div className="es-certeza">
          <div className="es-certeza-barra" aria-hidden="true"><i style={{ width: `${Math.round(c.certeza * 100)}%` }} /><span style={{ left: '90%' }} /></div>
          <small>{decidido ? <>Certeza de <b>{int(c.certeza * 100)}%</b>. Já dá para decidir.</> : <>Certeza de <b>{int(c.certeza * 100)}%</b>. {c.faltam ? `Faltam uns ${int(c.faltam)} cadastros para chegar a 90%.` : 'Falta mais tempo de teste.'}</>}</small>
        </div>
      )}
      <div className="es-ab">
        <div className="es-ab-cab"><span /><b className={lider === 'a' ? 'lider' : ''}>Versão A</b><b className={lider === 'b' ? 'lider' : ''}>Versão B</b></div>
        {(variavel === 'criativo' || variavel === 'texto') && (
          <div className="es-ab-linha criativo">
            <span>{variavel === 'criativo' ? 'Criativo' : 'Título'}</span>
            {(['a', 'b'] as const).map((l) => {
              const m = l === 'a' ? r.dados.midia : r.dados.midiaB ?? r.dados.midia, t = l === 'a' ? r.dados.texto : r.dados.textoB ?? r.dados.texto
              return <div key={l}>{variavel === 'criativo' ? (m?.poster ? <img src={m.poster} alt="" /> : '—') : <em>{t.titulo}</em>}</div>
            })}
          </div>
        )}
        {linhas.map(([nome, valor, num, menor]) => {
          const m = r.situacao === 'ligado' ? melhor(num, menor) : null
          return <div key={nome} className="es-ab-linha"><span>{nome}</span><div className={m === 'a' ? 'melhor' : ''}>{valor(A)}</div><div className={m === 'b' ? 'melhor' : ''}>{valor(B)}</div></div>
        })}
      </div>
      <div className="es-teste-acoes">
        {r.situacao === 'pausado' && <button type="button" className="es-btn principal" onClick={ligar} disabled={semChave}><Icone nome="ligar" tam={16} />Ligar o teste</button>}
        {r.situacao === 'ligado' && !p.vencedor && lider && <button type="button" className={`es-btn ${decidido ? 'principal' : ''}`} onClick={() => escolher(lider)} disabled={semChave}>Ficar com a {lider.toUpperCase()}</button>}
        {r.situacao === 'ligado' && !p.vencedor && lider && <button type="button" className="es-btn fino" onClick={() => escolher(lider === 'a' ? 'b' : 'a')} disabled={semChave}>Ficar com a {lider === 'a' ? 'B' : 'A'}</button>}
        {cA != null && cB != null && !decidido && r.situacao === 'ligado' && !p.vencedor && <small className="es-mudo">Decidir antes de 90% de certeza é escolher no escuro: a diferença ainda pode ser acaso.</small>}
      </div>
      {(p.avisos ?? []).map((a) => <p key={a} className="es-dica amarelo">{a}</p>)}
    </article>
  )
}

const FRASE: Record<string, (h: ItemDoHistorico) => string> = {
  criou: (h) => `criou "${h.alvoNome}", pausado`,
  criou_teste: (h) => `criou o teste A/B "${h.alvoNome}", pausado`,
  ligou: (h) => `ligou "${h.alvoNome}"${h.detalhe.diario ? ` · ${brl(Number(h.detalhe.diario), 0)}/dia` : ''}`,
  pausou: (h) => `pausou "${h.alvoNome}"`,
  orcamento: (h) => `mudou o orçamento de "${h.alvoNome}" de ${brl(Number(h.detalhe.antes), 0)} para ${brl(Number(h.detalhe.depois), 0)} por dia`,
  escalou: (h) => `escalou "${h.alvoNome}" (+${h.detalhe.aumento}%, ${brl(Number(h.detalhe.diario), 0)}/dia, pausado)`,
  vencedor: (h) => `ficou com a versão ${h.detalhe.vencedor} em "${h.alvoNome}"`,
}
const ICONE_DA_ACAO: Record<string, Parameters<typeof Icone>[0]['nome']> = { criou: 'novo', criou_teste: 'teste', ligou: 'ligar', pausou: 'pausar', orcamento: 'dinheiro', escalou: 'escalar', vencedor: 'ok' }
function LinhaDoHistorico({ h }: { h: ItemDoHistorico }) {
  return (
    <li className={h.acao}>
      <span className="es-hist-ic"><Icone nome={ICONE_DA_ACAO[h.acao] ?? 'relogio'} tam={15} /></span>
      <p><b>{h.quem}</b> {(FRASE[h.acao] ?? ((x: ItemDoHistorico) => `${x.acao} "${x.alvoNome}"`))(h)}</p>
      <time dateTime={h.em}>{quando(h.em)}</time>
    </li>
  )
}
