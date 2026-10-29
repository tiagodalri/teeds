/**
 * Termos de uso e políticas (27/10/2026).
 *
 * AceiteDosTermos: a tela do primeiro acesso. Ninguém entra sem marcar as duas
 * caixas (termos + privacidade, e o aviso de riscos) e confirmar; o aceite vai
 * para o banco com a versão e a data. LeitorDeTermos: os mesmos documentos para
 * reler depois, pelo menu do avatar.
 */
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Brand } from '../Brand'
import { MARCA } from '../../marca'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { DATA_DA_VERSAO, documentosDaMarca, registrarAceite, type Documento } from '../../core/teeds/termos'
import './termos.css'

/* ------------------------------------------------ o texto (markdown simples) */
function negrito(linha: string): ReactNode[] {
  return linha.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))
}

function TextoDoDocumento({ texto }: { texto: string }) {
  const blocos: ReactNode[] = []
  const linhas = texto.split('\n')
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i].trimEnd()
    if (!l.trim() || l.startsWith('# ')) { i++; continue } // o título já está na aba
    if (l.startsWith('## ')) { blocos.push(<h3 key={i}>{negrito(l.slice(3))}</h3>); i++; continue }
    if (l.startsWith('- ')) {
      const itens: string[] = []
      while (i < linhas.length && linhas[i].startsWith('- ')) { itens.push(linhas[i].slice(2)); i++ }
      blocos.push(<ul key={i}>{itens.map((t, k) => <li key={k}>{negrito(t)}</li>)}</ul>)
      continue
    }
    if (l.startsWith('|')) {
      const tab: string[][] = []
      while (i < linhas.length && linhas[i].startsWith('|')) {
        const cel = linhas[i].split('|').slice(1, -1).map((c) => c.trim())
        if (!cel.every((c) => /^-+$/.test(c))) tab.push(cel)
        i++
      }
      const [cab, ...corpo] = tab
      blocos.push(<div className="tm-tabela" key={i}><table><thead><tr>{cab.map((c, k) => <th key={k}>{negrito(c)}</th>)}</tr></thead>
        <tbody>{corpo.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{negrito(c)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    const par: string[] = []
    while (i < linhas.length && linhas[i].trim() && !/^(#|- |\|)/.test(linhas[i])) { par.push(linhas[i].trim()); i++ }
    blocos.push(<p key={i}>{negrito(par.join(' '))}</p>)
  }
  return <div className="tm-texto">{blocos}<p className="tm-versao">Versão de {DATA_DA_VERSAO}.</p></div>
}

function LeitorDeDocumentos({ docs }: { docs: Documento[] }) {
  const [aberto, setAberto] = useState(docs[0]?.id)
  const caixa = useRef<HTMLDivElement>(null)
  const doc = docs.find((d) => d.id === aberto) ?? docs[0]
  return (
    <div className="tm-leitor">
      <div className="tm-abas" role="tablist" aria-label="Documentos">
        {docs.map((d) => (
          <button key={d.id} type="button" role="tab" aria-selected={d.id === doc.id} className={d.id === doc.id ? 'on' : ''}
            onClick={() => { setAberto(d.id); caixa.current?.scrollTo({ top: 0 }) }}>{d.titulo}</button>
        ))}
      </div>
      <div className="tm-pagina" ref={caixa} role="tabpanel" tabIndex={0} aria-label={doc.titulo}>
        <h2>{doc.titulo}</h2>
        <TextoDoDocumento texto={doc.texto} />
      </div>
    </div>
  )
}

/* ------------------------------------------------ o aceite do primeiro acesso */
export function AceiteDosTermos({ sessao, aoAceitar, aoSair }: { sessao: SessaoTeeds; aoAceitar: () => void; aoSair: () => void }) {
  const docs = useMemo(() => documentosDaMarca(), [])
  const [termos, setTermos] = useState(false)
  const [riscos, setRiscos] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const primeiro = (sessao.usuario.nome ?? '').trim().split(/\s+/)[0]

  async function aceitar() {
    if (!termos || !riscos || gravando) return
    setGravando(true); setErro(null)
    try { await registrarAceite(sessao, 'primeiro_acesso'); aoAceitar() } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível registrar o aceite.') } finally { setGravando(false) }
  }

  return (
    <div className="tm-tela">
      <div className="tm-moldura">
        <header className="tm-topo"><Brand assinatura /></header>
        <div className="tm-cabeca">
          <span className="tm-rot">Antes de entrar</span>
          <h1>{primeiro ? `${primeiro}, leia e aceite os termos` : 'Leia e aceite os termos'}</h1>
          <p>É rápido e só acontece uma vez. Estes são os combinados para usar a {MARCA.prosa}.</p>
        </div>

        <ul className="tm-resumo">
          <li><b>A plataforma é gratuita.</b> Você só paga 10% do lucro do mês. Mês sem lucro, nada a pagar.</li>
          <li><b>O seu dinheiro fica na corretora</b>, na sua conta e no seu nome. Depósito e saque, direto com ela.</li>
          <li><b>Você decide</b> quando ligar cada I.A., o valor de entrada, a meta e o limite de perda.</li>
          <li><b>Operar tem risco</b> e não existe resultado garantido. Use só um valor que você pode perder.</li>
        </ul>

        <LeitorDeDocumentos docs={docs} />

        <div className="tm-aceites">
          <label className={termos ? 'ok' : ''}>
            <input type="checkbox" checked={termos} onChange={(e) => setTermos(e.target.checked)} />
            <span>Li e concordo com os <b>Termos de Uso</b>, a <b>Política de Privacidade</b> e a <b>Política de Cookies</b>.</span>
          </label>
          <label className={riscos ? 'ok' : ''}>
            <input type="checkbox" checked={riscos} onChange={(e) => setRiscos(e.target.checked)} />
            <span>Li o <b>Aviso de Riscos</b> e entendo que posso perder dinheiro e que não há resultado garantido.</span>
          </label>
        </div>

        {/* o que falta fica logo abaixo das caixas, antes dos botões (no celular ficava depois do Sair) */}
        {(!termos || !riscos) && <p className="tm-dica">Marque as duas caixas para continuar.</p>}
        {erro && <p className="tm-erro" role="alert">{erro}</p>}
        <div className="tm-acoes">
          <button type="button" className="tm-sair" onClick={aoSair}>Sair</button>
          <button type="button" className="tm-entrar" disabled={!termos || !riscos || gravando} onClick={aceitar}>
            {gravando ? 'Registrando…' : 'Concordo e quero entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------ para reler depois */
export function LeitorDeTermos({ aoFechar }: { aoFechar: () => void }) {
  const docs = useMemo(() => documentosDaMarca(), [])
  return (
    <div className="tm-modal" role="dialog" aria-modal="true" aria-label="Termos e políticas" onKeyDown={(e) => { if (e.key === 'Escape') aoFechar() }}>
      <button type="button" className="tm-modal-fundo" aria-label="Fechar" onClick={aoFechar} />
      <div className="tm-modal-caixa">
        <header><b>Termos e políticas</b><button type="button" onClick={aoFechar} aria-label="Fechar">✕</button></header>
        <LeitorDeDocumentos docs={docs} />
      </div>
    </div>
  )
}
