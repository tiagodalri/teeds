/**
 * A aba "Robôs" do admin (23/09/2026): um cartão por robô da marca
 * administrada, com o estado das regras (padrão / versão publicada / em
 * teste no demo / rascunho), os chips do que difere do padrão, as sessões
 * em andamento e os botões "Ajustar" e "Restaurar padrão".
 *
 * A lista vem de `MARCAS[marca].robos`, não de `MARCA.robos`: a Teeds é a
 * plataforma master e o admin dela pode estar ajustando a OMNI. Já o
 * switch Ativo/Oculto é do catálogo da marca de ORIGEM (a rota não aceita
 * `?marca=`), então só aparece quando a marca administrada é a de origem.
 */
import { useCallback, useEffect, useState } from 'react'
import './admin-controle.css'
import { Emblema } from './RobotCard'
import { AdminControleRobo, ConfirmacaoDeAcao, avisosDe, cartoesSeguros, quando, type AcaoConfirmavel } from './AdminControleRobo'
import { consultarCatalogo, type ItemCatalogo } from '../core/teeds/catalogoRobos'
import type { SessaoTeeds } from '../core/teeds/conta'
import { lerParametros, restaurarVersao, type DetalheDoRobo } from '../core/teeds/parametrosRobos'
import { identidade } from '../core/deriv/branding'
import { descrever, diferencas } from '../core/deriv/parametros'
import { MARCA, MARCAS } from '../marca'

type Carga = { estado: 'carregando' } | { estado: 'erro'; erro: string } | { estado: 'ok'; detalhe: DetalheDoRobo }

const textoDasSessoes = (porVersao: Record<string, number>) => {
  const partes = Object.entries(porVersao)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${n} ${v === 'padrao' ? 'no padrão' : `na v${v}`}`)
  return partes.length ? ` (${partes.join(' · ')})` : ''
}

export function AdminRobos({ sessao, marca }: { sessao: SessaoTeeds; marca: string }) {
  const ids = MARCAS[marca]?.robos ?? MARCA.robos
  const catalogoDaquiMesmo = marca === MARCA.id
  const [cargas, setCargas] = useState<Record<string, Carga>>({})
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<AcaoConfirmavel | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    // Quem já carregou fica na tela enquanto atualiza; quem não, mostra "carregando".
    setCargas((c) => Object.fromEntries(ids.map((id) => [id, c[id]?.estado === 'ok' ? c[id] : { estado: 'carregando' as const }])))
    await Promise.all(ids.map(async (id) => {
      try {
        const detalhe = await lerParametros(sessao, id)
        setCargas((c) => ({ ...c, [id]: { estado: 'ok', detalhe } }))
      } catch (e) {
        setCargas((c) => ({ ...c, [id]: { estado: 'erro', erro: (e as Error).message } }))
      }
    }))
    if (catalogoDaquiMesmo) {
      try { setCatalogo(await consultarCatalogo(sessao)) } catch (e) { setErro((e as Error).message) }
    }
  }, [sessao.token, marca]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => {
    const aoAlterar = () => { void carregar() }
    window.addEventListener('catalogo-alterado', aoAlterar)
    return () => window.removeEventListener('catalogo-alterado', aoAlterar)
  }, [carregar])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  async function alterar(item: ItemCatalogo) {
    setSalvando(true); setErro('')
    try {
      setCatalogo(await consultarCatalogo(sessao, { ...item, ativo: !item.ativo }))
      window.dispatchEvent(new Event('catalogo-alterado'))
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  /** O "kill switch" do cartão: a mesma confirmação de publicar, com o nome do robô. */
  const restaurarPadrao = (id: string, detalhe: DetalheDoRobo) => setConfirmacao({
    titulo: 'Restaurar o padrão da plataforma',
    descricao: `${detalhe.nomeNaMarca} · volta às regras de fábrica do robô`,
    botao: 'Restaurar padrão',
    diff: diferencas(detalhe.padrao, detalhe.publicado),
    cartoes: cartoesSeguros(id, detalhe.padrao, 'conservador'),
    sessoesVivas: detalhe.sessoesVivas.total,
    avisos: avisosDe(id, detalhe.padrao, 'conservador'),
    exigirNome: true,
    pedirMotivo: false,
    nome: detalhe.nomeNaMarca,
    executar: () => restaurarVersao(sessao, id, 'padrao', detalhe.nomeNaMarca),
  })

  const cargaAberta = aberto ? cargas[aberto] : undefined

  return (
    <div className="ac">
      <p className="ac-intro">Até 10 robôs simultâneos por cliente. Desativar oculta o modelo e impede novos inícios, sem interromper sessões em andamento.</p>
      {erro && <p className="ac-erro" role="alert">{erro}</p>}
      {!ids.length && <p className="ac-cartao-vazio">Esta plataforma não oferece robôs.</p>}
      <div className="ac-lista">
        {ids.map((id) => {
          const ident = identidade(id)
          const carga = cargas[id]
          const detalhe = carga?.estado === 'ok' ? carga.detalhe : null
          const item = catalogo.find((c) => c.id === id)
          const oculto = catalogoDaquiMesmo && item ? !item.ativo : false
          const nome = detalhe?.nomeNaMarca ?? ident.nome
          const chips = detalhe ? diferencas(detalhe.publicado, detalhe.padrao) : []
          const rascunhoDifere = !!detalhe?.rascunho && JSON.stringify(detalhe.rascunho) !== JSON.stringify(detalhe.publicado)
          return (
            <article key={id} className={`admin-card ac-cartao ${oculto ? 'oculto' : ''}`} aria-label={nome}>
              <div className="ac-cartao-topo">
                <Emblema id={ident} tamanho={44} />
                <div>
                  <h3>{nome}</h3>
                  <p>{detalhe ? descrever(id, detalhe.publicado) : ident.descricao}</p>
                </div>
              </div>
              <div className="ac-cartao-estados">
                {(!carga || carga.estado === 'carregando') && <span className="ac-estado">carregando as regras…</span>}
                {carga?.estado === 'erro' && <span className="ac-estado vermelho">✕ {carga.erro}</span>}
                {detalhe && (detalhe.versao === null
                  ? <span className="ac-estado">Padrão da plataforma</span>
                  : <span className="ac-estado verde">v{detalhe.versao} · publicada{detalhe.atualizadoPor?.nome ? ` por ${detalhe.atualizadoPor.nome}` : ''}{quando(detalhe.publicadoEm ?? detalhe.atualizadoEm) ? ` · ${quando(detalhe.publicadoEm ?? detalhe.atualizadoEm)}` : ''}</span>)}
                {detalhe?.testeDemo && <span className="ac-estado azul">+ em teste no demo</span>}
                {rascunhoDifere && <span className="ac-estado ambar">+ rascunho salvo</span>}
              </div>
              {chips.length > 0 && <div className="ac-chips" aria-label="O que difere do padrão">{chips.map((c) => <span key={c.campo}>{c.rotulo}</span>)}</div>}
              {detalhe && detalhe.sessoesVivas.total > 0 && (
                <p className="ac-cartao-sessoes"><b>{detalhe.sessoesVivas.total}</b> {detalhe.sessoesVivas.total === 1 ? 'sessão em andamento' : 'sessões em andamento'}{textoDasSessoes(detalhe.sessoesVivas.porVersao)}</p>
              )}
              <div className="ac-cartao-rodape">
                {catalogoDaquiMesmo
                  ? <button type="button" className="ac-switch" role="switch" aria-checked={!oculto} disabled={salvando || !item} aria-label={`Disponibilidade de ${nome}`} onClick={() => { if (item) void alterar(item) }}><i />{!item ? '…' : oculto ? 'Oculto' : 'Ativo'}</button>
                  : <small className="ac-nota" style={{ margin: 0 }}>ligar/desligar só no painel da própria plataforma</small>}
                {detalhe && detalhe.versao !== null && <button type="button" className="ac-btn leve" onClick={() => restaurarPadrao(id, detalhe)}>Restaurar padrão</button>}
                <button type="button" className="ac-btn primario" disabled={!detalhe} onClick={() => setAberto(id)}>Ajustar</button>
              </div>
            </article>
          )
        })}
      </div>
      {aberto && cargaAberta?.estado === 'ok' && (
        <AdminControleRobo
          sessao={sessao}
          roboId={aberto}
          marca={marca}
          detalhe={cargaAberta.detalhe}
          onFechar={() => { setAberto(null); void carregar() }}
          onAtualizado={() => { /* o evento 'catalogo-alterado' já recarrega a lista */ }}
        />
      )}
      {confirmacao && (
        <ConfirmacaoDeAcao
          acao={confirmacao}
          onFechar={() => setConfirmacao(null)}
          onConcluido={(r) => {
            setConfirmacao(null)
            const n = r.sessoesAtualizadas ?? 0
            setToast(`Padrão da plataforma restaurado · ${n} ${n === 1 ? 'sessão em andamento atualizada' : 'sessões em andamento atualizadas'} · vale para os próximos inícios`)
            window.dispatchEvent(new Event('catalogo-alterado'))
          }}
        />
      )}
      {toast && <div className="ac-toast" role="status">✓ <b>{toast.split(' · ')[0]}</b> · {toast.split(' · ').slice(1).join(' · ')}</div>}
    </div>
  )
}
