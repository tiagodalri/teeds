import { useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCA } from '../marca'
import { apagarLinkDoParceiro, configurarParceiro, meusLinks, salvarLinkDoParceiro, type LinkDoParceiro, type MeusLinks, type ParceiroComLinks } from '../core/teeds/parceiro'
import './divulgacao.css'

/*
  Divulgação (27/10/2026). Tiago: "crie uma parte de links para divulgação:
  link de cadastro, link da comunidade... para ficar mais fácil de cada um
  encontrar os seus links e não ter essa mistura".

  O parceiro vê só os links DELE (o banco decide, pelo e-mail do login). Os de
  cadastro saem do código do parceiro (/n, e a landing em /n/cadastro/); os
  outros o admin geral cadastra. O admin geral vê todos, edita os links e
  configura o login e o app da Deriv de cada parceiro.
*/

const REDES = [
  { id: '', nome: 'Sem marcação' }, { id: 'instagram', nome: 'Instagram' }, { id: 'youtube', nome: 'YouTube' },
  { id: 'whatsapp', nome: 'WhatsApp' }, { id: 'telegram', nome: 'Telegram' }, { id: 'tiktok', nome: 'TikTok' },
]
const site = () => new URL(MARCA.redirectUri).origin

function comRede(url: string, rede: string): string {
  if (!rede) return url
  const u = new URL(url)
  u.searchParams.set('utm_source', rede)
  return u.toString()
}

function LinhaDeLink({ titulo, descricao, url, principal = false, acoes }: { titulo: string; descricao?: string | null; url: string; principal?: boolean; acoes?: React.ReactNode }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = () => { void navigator.clipboard?.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600) }) }
  return (
    <li className={`dv-link ${principal ? 'principal' : ''}`}>
      <div className="dv-link-texto">
        <b>{titulo}</b>
        {descricao && <small>{descricao}</small>}
        <code title={url}>{url.replace(/^https:\/\//, '')}</code>
      </div>
      <div className="dv-link-acoes">
        <button type="button" className={copiado ? 'ok' : 'principal'} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
        <a href={url} target="_blank" rel="noopener noreferrer">Abrir</a>
        {acoes}
      </div>
    </li>
  )
}

export function DivulgacaoPanel({ sessao, inicial }: { sessao: SessaoTeeds; inicial: MeusLinks }) {
  const [dados, setDados] = useState(inicial)
  const [qual, setQual] = useState(inicial.parceiros[0]?.codigo ?? '')
  const [rede, setRede] = useState('')
  const [editando, setEditando] = useState<{ id?: string; titulo: string; url: string; descricao: string; ordem: number } | null>(null)
  const [config, setConfig] = useState<{ email: string; app: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const p: ParceiroComLinks | undefined = dados.parceiros.find((x) => x.codigo === qual) ?? dados.parceiros[0]
  const recarregar = async () => { const d = await meusLinks(sessao); if (d) setDados(d) }
  const executar = async (f: () => Promise<unknown>, depois?: () => void) => {
    setOcupado(true); setErro(null)
    try { await f(); await recarregar(); depois?.() } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  if (!p) return <div className="dv"><p className="dv-vazio">Nenhum parceiro configurado.</p></div>
  const cadastro = comRede(`${site()}/${p.codigo}`, rede)
  const landing = comRede(`${site()}/${p.codigo}/cadastro/`, rede)
  const situacaoDoApp = !p.derivAppId ? { cls: 'neutro', txt: `Sem app próprio: os clientes conectam pelo app da ${MARCA.prosa}` }
    : p.appLiberado ? { cls: 'ok', txt: 'App próprio em uso: o markup dos clientes cai nele' }
    : { cls: 'espera', txt: 'App cadastrado, aguardando liberação no servidor' }

  return (
    <div className="dv">
      <header className="dv-topo">
        <div>
          <span className="dv-rot">{dados.geral ? 'Parceiros de divulgação' : 'Seus links de divulgação'}</span>
          <h1>{dados.geral ? p.nome : `Olá, ${p.nome.split(' ')[0]}`}</h1>
          <p>Use estes links para divulgar. Quem chegar por eles fica registrado como cliente {dados.geral ? `de ${p.nome.split(' ')[0]}` : 'seu'}.</p>
        </div>
        {dados.parceiros.length > 1 && (
          <div className="dv-seg" role="tablist" aria-label="Parceiro">
            {dados.parceiros.map((x) => <button key={x.codigo} type="button" role="tab" aria-selected={x.codigo === p.codigo} className={x.codigo === p.codigo ? 'on' : ''} onClick={() => { setQual(x.codigo); setEditando(null); setConfig(null) }}>{x.nome.split(' ')[0]} <small>/{x.codigo}</small></button>)}
          </div>
        )}
      </header>

      <section className="dv-bloco">
        <div className="dv-bloco-cab">
          <h2>Links de cadastro</h2>
          <div className="dv-redes" role="radiogroup" aria-label="Onde você vai postar">
            <span>Onde vai postar?</span>
            {REDES.map((r) => <button key={r.id} type="button" role="radio" aria-checked={rede === r.id} className={rede === r.id ? 'on' : ''} onClick={() => setRede(r.id)}>{r.nome}</button>)}
          </div>
        </div>
        <ul className="dv-lista">
          <LinhaDeLink principal titulo="Cadastro na plataforma" descricao="Abre direto o cadastro. É o link principal." url={cadastro} />
          <LinhaDeLink titulo="Página do lançamento" descricao="A página de captação, com o questionário e o grupo no final." url={landing} />
        </ul>
        {rede && <p className="dv-dica">Com a rede escolhida, dá para saber de onde veio cada cadastro. Continua contando para {dados.geral ? p.nome.split(' ')[0] : 'você'}.</p>}
      </section>

      <section className="dv-bloco">
        <div className="dv-bloco-cab">
          <h2>Outros links</h2>
          {dados.geral && !editando && <button type="button" className="dv-botao" onClick={() => setEditando({ titulo: '', url: 'https://', descricao: '', ordem: 100 })}>+ Adicionar link</button>}
        </div>
        {p.links.length === 0 && !editando && <p className="dv-vazio">Nenhum link ainda.</p>}
        <ul className="dv-lista">
          {p.links.map((l: LinkDoParceiro) => (
            <LinhaDeLink key={l.id} titulo={l.titulo} descricao={l.descricao} url={l.url}
              acoes={dados.geral ? <>
                <button type="button" onClick={() => setEditando({ id: l.id, titulo: l.titulo, url: l.url, descricao: l.descricao ?? '', ordem: l.ordem })}>Editar</button>
              </> : undefined} />
          ))}
        </ul>
        {editando && (
          <form className="dv-form" onSubmit={(e) => { e.preventDefault(); void executar(() => salvarLinkDoParceiro(sessao, p.codigo, { ...editando }), () => setEditando(null)) }}>
            <label htmlFor="dv-titulo">Nome do link</label>
            <input id="dv-titulo" value={editando.titulo} maxLength={60} placeholder="Ex.: Comunidade no WhatsApp" onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
            <label htmlFor="dv-url">Endereço</label>
            <input id="dv-url" value={editando.url} inputMode="url" placeholder="https://" onChange={(e) => setEditando({ ...editando, url: e.target.value.trim() })} />
            <label htmlFor="dv-desc">Para que serve (opcional)</label>
            <input id="dv-desc" value={editando.descricao} maxLength={200} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} />
            {erro && <div className="dv-erro" role="alert">{erro}</div>}
            <div className="dv-form-acoes">
              {editando.id && <button type="button" className="perigo" disabled={ocupado} onClick={() => void executar(() => apagarLinkDoParceiro(sessao, editando.id!), () => setEditando(null))}>Apagar</button>}
              <span />
              <button type="button" onClick={() => setEditando(null)} disabled={ocupado}>Cancelar</button>
              <button type="submit" className="principal" disabled={ocupado || editando.titulo.trim().length < 2 || !/^https:\/\/\S{4,}$/.test(editando.url)}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}
      </section>

      <section className="dv-bloco dv-regras">
        <h2>Como a divisão funciona</h2>
        <ul>
          <li>Quem clicar no seu link fica marcado como seu por 90 dias, mesmo que se cadastre depois.</li>
          <li>Vale o primeiro link: se a pessoa clicar depois no link de outro parceiro, continua sua.</li>
          <li>A comissão vem do markup das operações em conta real dos seus clientes. Conta de demonstração não conta.</li>
        </ul>
      </section>

      {dados.geral && (
        <section className="dv-bloco dv-config">
          <div className="dv-bloco-cab">
            <h2>Configuração de {p.nome.split(' ')[0]}</h2>
            {!config && <button type="button" className="dv-botao" onClick={() => setConfig({ email: p.email ?? '', app: p.derivAppId ?? '' })}>Editar</button>}
          </div>
          {!config ? (
            <dl className="dv-dados">
              <div><dt>Login na plataforma</dt><dd>{p.email ?? <em>ainda não ligado: a página Divulgação aparece para ele quando o e-mail estiver aqui</em>}</dd></div>
              <div><dt>App da Deriv</dt><dd><code>{p.derivAppId ?? '—'}</code><span className={`dv-chip ${situacaoDoApp.cls}`}>{situacaoDoApp.txt}</span></dd></div>
            </dl>
          ) : (
            <form className="dv-form" onSubmit={(e) => { e.preventDefault(); void executar(() => configurarParceiro(sessao, p.codigo, config.email, config.app), () => setConfig(null)) }}>
              <label htmlFor="dv-email">E-mail de login do parceiro</label>
              <input id="dv-email" type="email" value={config.email} placeholder="O mesmo e-mail com que ele entra na plataforma" onChange={(e) => setConfig({ ...config, email: e.target.value })} />
              <label htmlFor="dv-app">App da Deriv do parceiro (app_id)</label>
              <input id="dv-app" value={config.app} placeholder="O identificador do app criado na Deriv" onChange={(e) => setConfig({ ...config, app: e.target.value.trim() })} />
              <small className="dv-dica">Trocar o app deixa ele aguardando liberação: o servidor das I.A. precisa conhecer o app antes dos clientes conectarem por ele.</small>
              {erro && <div className="dv-erro" role="alert">{erro}</div>}
              <div className="dv-form-acoes"><span /><button type="button" onClick={() => setConfig(null)} disabled={ocupado}>Cancelar</button><button type="submit" className="principal" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button></div>
            </form>
          )}
        </section>
      )}
      {/* com um formulário aberto, o erro aparece dentro dele, perto do botão (29/10/2026) */}
      {erro && !editando && !config && <div className="dv-erro" role="alert">{erro}</div>}
    </div>
  )
}
