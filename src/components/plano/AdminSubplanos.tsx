import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { carregarMeuSubplano, cobrancaLegivel, compartilhamentoLegivel, listarSubplanos, salvarSubplano, simuladorLegivel, type Subplano } from '../../core/teeds/subplanos'
import './admin-subplanos.css'

/**
 * Administração › Planos › Subplanos do GF Member (05/11/2026). O que cada
 * subplano libera, editável aqui: preço, compartilhamento, I.A., horas de
 * simulador, sala extra, assessor, GFT Lab e o link do checkout. Vale na hora
 * (as travas são conferidas pelo banco quando a I.A. liga).
 */
/** Parceiros de divulgação que podem ter checkout próprio (08/11/2026: o Naor vende na Cakto dele). */
const PARCEIROS_CHECKOUT: Array<[string, string]> = [['n', 'Naor (/n)'], ['v', 'Victor (/v)']]
const IAS: Array<[string, string]> = [['goreme', 'Raptor'], ['falcon', 'Falcon'], ['legacy', 'Legacy'], ['superior5', 'Gulf'], ['ag2', 'Phenom']]

export function AdminSubplanos({ sessao, marca }: { sessao: SessaoTeeds; marca: string }) {
  const [lista, setLista] = useState<Subplano[] | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [form, setForm] = useState<Subplano | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ler = () => listarSubplanos(sessao, marca).then(setLista).catch((e) => setErro((e as Error).message))
  useEffect(() => { void ler() }, [sessao.token, marca]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista) return <section className="admin-card full asp"><p className="adm-vazio">{erro ?? 'Lendo os subplanos…'}</p></section>
  if (!lista.length) return null
  const abrir = (s: Subplano) => { setAberto(s.id); setForm({ ...s }); setAviso(null); setErro(null) }
  const mudar = (p: Partial<Subplano>) => setForm((f) => (f ? { ...f, ...p } : f))
  const salvar = async () => {
    if (!form) return
    if (form.checkoutUrl && !/^https:\/\//.test(form.checkoutUrl)) { setErro('O link do checkout precisa começar com https://'); return }
    if (Object.values(form.checkoutPorParceiro ?? {}).some((u) => u && !/^https:\/\//.test(u))) { setErro('O link do checkout do parceiro precisa começar com https://'); return }
    setSalvando(true); setErro(null)
    try { await salvarSubplano(sessao, form, marca); await ler(); void carregarMeuSubplano(sessao); setAviso(`${form.nome} salvo. Já vale para os clientes.`); setAberto(null); setForm(null) }
    catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  return (
    <section className="admin-card full asp">
      <header><div><span className="rot">GF Member</span><h3>Subplanos: o que cada um libera</h3></div><small>O plano de todos é o GF Member; o subplano decide I.A., simulador, compartilhamento e extras. Para mudar o de um cliente, abra a ficha dele em Clientes.</small></header>
      {aviso && <p className="asp-aviso">{aviso}</p>}
      <div className="asp-lista">
        {lista.map((s) => (
          <article key={s.id} className={`asp-item ${aberto === s.id ? 'aberto' : ''}`}>
            <button type="button" className="asp-cab" onClick={() => (aberto === s.id ? (setAberto(null), setForm(null)) : abrir(s))} aria-expanded={aberto === s.id}>
              <span className={`mpl-nome ${s.id}`}>{s.nome}</span>
              <span className="asp-resumo"><b>{cobrancaLegivel(s)}</b><small>{compartilhamentoLegivel(s.compartilhamento)} · {s.ias ? `${s.ias.length} I.A.` : 'Todas as I.A.'} · simulador {simuladorLegivel(s.simuladorHoras).toLowerCase()}{s.salaExtra ? ' · sala extra' : ''}{s.assessor ? ' · assessor' : ''}{s.lab ? ' · GFT Lab' : ''}</small></span>
              <em>{aberto === s.id ? 'Fechar' : 'Editar'}</em>
            </button>
            {aberto === s.id && form && (
              <div className="asp-form">
                <label><span>Nome</span><input value={form.nome} maxLength={30} onChange={(e) => mudar({ nome: e.target.value })} /></label>
                <label className="largo"><span>Frase</span><input value={form.chamada ?? ''} maxLength={140} onChange={(e) => mudar({ chamada: e.target.value })} /></label>
                <label><span>Preço de referência (riscado)</span><CampoDecimal valor={form.precoReferencia ?? null} aoMudar={(v) => mudar({ precoReferencia: v })} placeholder="Ex.: 1997" /></label>
                <label><span>Preço</span><CampoDecimal valor={form.preco ?? null} aoMudar={(v) => mudar({ preco: v })} placeholder="0 = aquisição zero" /></label>
                <label><span>Cobrança</span><select value={form.cobranca} onChange={(e) => mudar({ cobranca: e.target.value })}><option value="aquisicao-zero">Aquisição zero</option><option value="anual">Anual</option><option value="mensal">Mensal</option></select></label>
                <label><span>Compartilhamento de receita (%)</span><CampoDecimal valor={Math.round(form.compartilhamento * 1000) / 10} aoMudar={(v) => mudar({ compartilhamento: Math.max(0, Math.min(100, v ?? 0)) / 100 })} /></label>
                <div className="largo asp-ias">
                  <span>I.A. liberadas</span>
                  <div>
                    <button type="button" className={form.ias == null ? 'on' : ''} onClick={() => mudar({ ias: null })}>Todas</button>
                    {IAS.map(([id, nome]) => { const on = form.ias == null || form.ias.includes(id); return (
                      <button type="button" key={id} className={on ? 'on' : ''} onClick={() => { const atual = form.ias ?? IAS.map((x) => x[0]); const novo = on ? atual.filter((x) => x !== id) : [...atual, id]; mudar({ ias: novo.length === IAS.length ? null : novo }) }}>{nome}</button>
                    ) })}
                  </div>
                </div>
                <label><span>Simulador (horas por dia)</span><CampoDecimal valor={form.simuladorHoras ?? null} placeholder="Vazio = ilimitado" aoMudar={(v) => mudar({ simuladorHoras: v })} /></label>
                <div className="asp-chaves largo">
                  <label><input type="checkbox" checked={form.salaExtra} onChange={(e) => mudar({ salaExtra: e.target.checked })} /> Sala ao vivo extra</label>
                  <label><input type="checkbox" checked={form.assessor} onChange={(e) => mudar({ assessor: e.target.checked })} /> Assessor no WhatsApp</label>
                  <label><input type="checkbox" checked={form.lab} onChange={(e) => mudar({ lab: e.target.checked })} /> GFT Lab (beta)</label>
                </div>
                {form.assessor && <label><span>WhatsApp do assessor</span><input inputMode="tel" value={form.assessorWhatsapp ?? ''} placeholder="55 11 99999-9999" onChange={(e) => mudar({ assessorWhatsapp: e.target.value || null })} /></label>}
                <label className="largo"><span>Link do checkout (padrão)</span><input value={form.checkoutUrl ?? ''} placeholder="https://pay.cakto.com.br/…  (vazio = o botão abre o suporte)" onChange={(e) => mudar({ checkoutUrl: e.target.value.trim() || null })} /></label>
                {PARCEIROS_CHECKOUT.map(([cod, nome]) => (
                  <label key={cod}><span>Checkout para quem veio do {nome}</span><input value={form.checkoutPorParceiro?.[cod] ?? ''} placeholder="Vazio = usa o padrão" onChange={(e) => { const v = e.target.value.trim(); const m = { ...(form.checkoutPorParceiro ?? {}) }; if (v) m[cod] = v; else delete m[cod]; mudar({ checkoutPorParceiro: m }) }} /></label>
                ))}
                {erro && <p className="asp-erro">{erro}</p>}
                <div className="asp-acoes largo"><button type="button" className="admin-secundario" onClick={() => { setAberto(null); setForm(null) }}>Cancelar</button><button type="button" className="admin-primary" disabled={salvando || !form.nome.trim()} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button></div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

/**
 * Campo de número com vírgula (09/11/2026): o texto digitado fica como está enquanto a pessoa digita
 * ("297," e "7,5" não voltam para "297" e "7"); o número vai para o formulário a cada tecla.
 */
function CampoDecimal({ valor, aoMudar, placeholder }: { valor: number | null; aoMudar: (v: number | null) => void; placeholder?: string }) {
  const mostrar = (v: number | null) => (v == null || !Number.isFinite(v) ? '' : String(v).replace('.', ','))
  const [texto, setTexto] = useState(() => mostrar(valor))
  const [editando, setEditando] = useState(false)
  useEffect(() => { if (!editando) setTexto(mostrar(valor)) }, [valor, editando])
  return (
    <input inputMode="decimal" value={texto} placeholder={placeholder}
      onFocus={() => setEditando(true)} onBlur={() => setEditando(false)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '')
        setTexto(t)
        // vírgula é o decimal (o ponto vira milhar); sem vírgula, "297.50" também vale como decimal
        const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '')
        const n = t.trim() === '' ? null : Number(limpo)
        if (n === null || Number.isFinite(n)) aoMudar(n)
      }} />
  )
}
