import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCA } from '../marca'
import { relatorioDosParceiros, trocarParceiro, type LinhaDoParceiro } from '../core/teeds/parceiro'
import './admin-parceiros.css'

/*
  Admin > Parceiros (27/10/2026). Tiago: "separação completa dos clientes de
  cada um... rastrear quanto gerou de comissão de markup dos clientes dele de
  forma separada... não pode ter mistura".

  Só o admin geral abre (o banco recusa os outros, inclusive o Victor, que é
  admin da GF e parceiro). Cada parceiro e o "Direto" lado a lado: o funil do
  link até a operação e o markup das operações dos clientes dele (conta real;
  demonstração fica fora). Embaixo, os clientes de cada um, com a troca manual
  (motivo obrigatório, fica registrada).
*/

const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (v: number) => v.toLocaleString('pt-BR')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const INICIO = '2026-10-27'
const PERIODOS = [
  { id: 'hoje', nome: 'Hoje', de: () => iso(new Date()) },
  { id: '7', nome: '7 dias', de: () => diasAtras(6) },
  { id: '30', nome: '30 dias', de: () => diasAtras(29) },
  { id: 'tudo', nome: 'Desde o início', de: () => INICIO },
] as const
const FONTE: Record<string, string> = { cadastro: 'Cadastro pelo link', navegador: 'Entrou com o link guardado', manual: 'Ajuste manual' }
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

/** `api` existe para o laboratório (?tela=parceiros) trocar o banco por números de exemplo. */
export interface ApiParceiros { relatorio: typeof relatorioDosParceiros; trocar: typeof trocarParceiro }
const DO_BANCO: ApiParceiros = { relatorio: relatorioDosParceiros, trocar: trocarParceiro }

export function AdminParceiros({ sessao, marca = MARCA.id, api = DO_BANCO }: { sessao: SessaoTeeds; marca?: string; api?: ApiParceiros }) {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['id']>('tudo')
  const [linhas, setLinhas] = useState<LinhaDoParceiro[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [rodada, setRodada] = useState(0)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [troca, setTroca] = useState<{ userId: string; nome: string; para: string; motivo: string; enviando: boolean; erro: string | null } | null>(null)

  useEffect(() => {
    let vivo = true
    setErro(null)
    const p = PERIODOS.find((x) => x.id === periodo)!
    api.relatorio(sessao, p.de(), iso(new Date()), marca)
      .then((l) => { if (!vivo) return; setLinhas(l); setAberto((a) => a ?? l[0]?.codigo ?? null) })
      .catch((e) => vivo && setErro((e as Error).message))
    return () => { vivo = false }
  }, [sessao.token, periodo, marca, rodada]) // eslint-disable-line react-hooks/exhaustive-deps

  const parceiros = useMemo(() => (linhas ?? []).filter((l) => l.codigo), [linhas])
  const grupo = linhas?.find((l) => l.codigo === aberto) ?? null
  const site = new URL(MARCA.redirectUri).host
  const copiar = (texto: string) => { void navigator.clipboard?.writeText(texto).then(() => { setCopiado(texto); setTimeout(() => setCopiado(null), 1600) }) }

  const salvarTroca = async () => {
    if (!troca) return
    setTroca({ ...troca, enviando: true, erro: null })
    try {
      await api.trocar(sessao, troca.userId, troca.para || null, troca.motivo, marca)
      setTroca(null); setRodada((n) => n + 1)
    } catch (e) { setTroca({ ...troca, enviando: false, erro: (e as Error).message }) }
  }

  return (
    <section className="ap">
      <div className="ap-topo">
        <div className="ap-links">
          {parceiros.map((p) => {
            const link = `${site}/${p.codigo}`
            return (
              <div key={p.codigo} className="ap-link">
                <span><small>Link de {p.nome.split(' ')[0]}</small><b>{link}</b></span>
                <button type="button" onClick={() => copiar(`https://${link}`)}>{copiado === `https://${link}` ? 'Copiado' : 'Copiar'}</button>
              </div>
            )
          })}
        </div>
        <div className="ap-periodo" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'on' : ''} onClick={() => setPeriodo(p.id)}>{p.nome}</button>)}
        </div>
      </div>
      <p className="ap-dica">Para saber de qual rede veio, o parceiro pode usar <b>{site}/n?utm_source=instagram</b> (ou youtube, whatsapp…). Continua contando para ele.</p>

      {erro && <div className="ap-erro">{erro} <button type="button" onClick={() => setRodada((n) => n + 1)}>Tentar de novo</button></div>}
      {!linhas && !erro && <div className="ap-carregando">Carregando os números…</div>}

      {linhas && (
        <>
          <div className="ap-cartoes">
            {linhas.map((l) => (
              <button key={l.codigo || 'direto'} type="button" className={`ap-cartao ${aberto === l.codigo ? 'on' : ''} ${l.codigo ? '' : 'direto'}`} onClick={() => setAberto(l.codigo)} aria-pressed={aberto === l.codigo}>
                <div className="ap-cab"><b>{l.nome}</b>{l.codigo && <small>/{l.codigo}</small>}</div>
                <div className="ap-markup"><small>Markup gerado</small><strong>{usd(l.markup)}</strong></div>
                <dl className="ap-funil">
                  {l.codigo && <div><dt>Cliques</dt><dd>{int(l.cliques)}</dd></div>}
                  <div><dt>Cadastros</dt><dd>{int(l.leads)}</dd></div>
                  <div><dt>Contas</dt><dd>{int(l.contasNovas)}</dd></div>
                  <div><dt>Operaram</dt><dd>{int(l.operaram)}</dd></div>
                </dl>
                <div className="ap-rodape">
                  <span>{int(l.operacoes)} operações · volume {usd(l.volume)}</span>
                  <span>{int(l.clientes)} clientes no total · {int(l.ativos)} ativos{l.codigo && l.cliques > 0 ? ` · ${pct(l.leads, l.cliques)} dos cliques viram cadastro` : ''}</span>
                </div>
              </button>
            ))}
          </div>
          <p className="ap-nota">Markup = o das operações em conta real dos clientes de cada grupo, no período (I.A. e manuais). Demonstração fica fora. Cada cliente pertence a um grupo só: o do primeiro link que usou.</p>

          {grupo && (
            <div className="ap-lista">
              <header><h3>Clientes de {grupo.codigo ? grupo.nome : 'Direto (sem link)'}</h3><small>{int(grupo.clientes)} no total{grupo.lista.length < grupo.clientes ? ` · mostrando os ${grupo.lista.length} que mais geraram` : ''}</small></header>
              {grupo.lista.length === 0 ? <p className="ap-vazio">Nenhum cliente ainda.</p> : (
                <div className="ap-tabela">
                  <table>
                    <thead><tr><th>Cliente</th><th>Conta criada</th><th>Como entrou</th><th className="num">Operações</th><th className="num">Markup</th><th /></tr></thead>
                    <tbody>
                      {grupo.lista.map((c) => (
                        <tr key={c.userId}>
                          <td><b>{c.nome || 'Sem nome'}</b><small>{c.email}</small></td>
                          <td>{new Date(c.criadoEm).toLocaleDateString('pt-BR')}<small>{c.status}</small></td>
                          <td>{c.fonte ? FONTE[c.fonte] ?? c.fonte : '—'}</td>
                          <td className="num">{int(c.operacoes)}</td>
                          <td className="num"><b>{usd(c.markup)}</b></td>
                          <td className="num"><button type="button" className="ap-trocar" onClick={() => setTroca({ userId: c.userId, nome: c.nome || c.email, para: grupo.codigo === parceiros[0]?.codigo ? parceiros[1]?.codigo ?? '' : parceiros[0]?.codigo ?? '', motivo: '', enviando: false, erro: null })}>Trocar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {troca && (
        <div className="ap-modal-fundo" onMouseDown={() => !troca.enviando && setTroca(null)}>
          <div className="ap-modal" role="dialog" aria-modal="true" aria-labelledby="ap-troca-titulo" onMouseDown={(e) => e.stopPropagation()}>
            <h3 id="ap-troca-titulo">Trocar o parceiro de {troca.nome}</h3>
            <p>Use só para corrigir um erro. A troca fica registrada com o seu nome e o motivo.</p>
            <label htmlFor="ap-troca-para">Passa a ser de</label>
            <select id="ap-troca-para" value={troca.para} onChange={(e) => setTroca({ ...troca, para: e.target.value })}>
              {parceiros.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} (/{p.codigo})</option>)}
              <option value="">Direto (sem parceiro)</option>
            </select>
            <label htmlFor="ap-troca-motivo">Motivo</label>
            <textarea id="ap-troca-motivo" rows={3} value={troca.motivo} placeholder="Ex.: veio pela live do parceiro e se cadastrou sem o link" onChange={(e) => setTroca({ ...troca, motivo: e.target.value })} />
            {troca.erro && <div className="ap-erro">{troca.erro}</div>}
            <div className="ap-modal-acoes">
              <button type="button" onClick={() => setTroca(null)} disabled={troca.enviando}>Cancelar</button>
              <button type="button" className="principal" onClick={() => void salvarTroca()} disabled={troca.enviando || troca.motivo.trim().length < 3}>{troca.enviando ? 'Salvando…' : 'Trocar parceiro'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
