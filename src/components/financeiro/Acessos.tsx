/* Acessos (só o dono): quem entra no financeiro, com que papel, em quais plataformas; senha provisória. */
import { useEffect, useMemo, useState } from 'react'
import type { Acesso, Candidato, FinApi, Papel } from '../../core/teeds/financeiro'
import { MARCAS } from '../../marca/marcas'
import { Icone } from '../Icone'
import { Avatar, Campo, Janela, Vazio } from './ui'

const PAPEIS: Array<{ id: Papel; nome: string; desc: string }> = [
  { id: 'leitor', nome: 'Leitor', desc: 'Vê os números, os lançamentos e a divisão. Não muda nada.' },
  { id: 'editor', nome: 'Editor', desc: 'Lança, edita, paga e apaga lançamentos; mexe em contas e categorias.' },
  { id: 'dono', nome: 'Dono', desc: 'Tudo do editor, mais os sócios e percentuais e quem tem acesso.' },
]
const nomeDaMarca = (id: string) => id === '*' ? 'Todas as plataformas' : MARCAS[id]?.prosa ?? id
const quando = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'Nunca entrou'

/** Senha provisória fácil de ditar: sem 0/O, 1/l/I. */
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz', numeros = '23456789'
  const r = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length]
  return `${Array.from({ length: 4 }, () => r(letras)).join('')}-${Array.from({ length: 4 }, () => r(numeros)).join('')}-${Array.from({ length: 4 }, () => r(letras)).join('')}`
}

export function Acessos({ api, aoMudar }: { api: FinApi; aoMudar: (m: string) => void }) {
  const [lista, setLista] = useState<Acesso[] | null>(null)
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ acesso: Acesso | null } | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState<{ nome: string; senha: string } | null>(null)
  const ler = async () => {
    try { const [a, c] = await Promise.all([api.acessos(), api.candidatos()]); setLista(a); setCandidatos(c); setErro(null) }
    catch (x) { setErro((x as Error).message) }
  }
  useEffect(() => { void ler() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const semAcesso = useMemo(() => candidatos.filter((c) => !lista?.some((a) => a.email === c.email && a.ativo)), [candidatos, lista])

  return <div className="fin-acessos">
    <section className="fin-cartao">
      <header><div><span className="fin-rot">Senha individual</span><h3>Quem acessa o financeiro</h3></div>
        <button type="button" className="fin-btn primario pequeno" onClick={() => setEditando({ acesso: null })} disabled={!semAcesso.length} title={semAcesso.length ? undefined : 'Todos os administradores já têm acesso'}><Icone nome="mais" />Dar acesso</button></header>
      {erro && <p className="fin-erro fin-pad">{erro}</p>}
      {!lista && !erro && <p className="fin-cartao-vazio">Carregando…</p>}
      {lista && (lista.length ? <ul className="fin-acessos-lista">
        {lista.map((a) => <li key={a.email} className={a.ativo ? '' : 'inativo'}>
          <Avatar nome={a.nome || a.email} tamanho={38} />
          <span className="fin-acessos-quem"><b>{a.nome || a.email.split('@')[0]}{a.eu && <em className="fin-chip">Você</em>}</b><small>{a.email}</small></span>
          <span className="fin-acessos-papel"><em className={`fin-papel ${a.papel}`}>{PAPEIS.find((p) => p.id === a.papel)?.nome}</em><small>{a.marcas.map(nomeDaMarca).join(', ')}</small></span>
          <span className="fin-acessos-quando"><small>Último acesso</small><b>{quando(a.ultimo_acesso)}</b></span>
          <span className="fin-acessos-sit">{!a.ativo ? <em className="fin-situacao vencido">Sem acesso</em> : a.bloqueado ? <em className="fin-situacao vencido">Travado 15 min</em> : a.trocar_senha ? <em className="fin-situacao pendente">Falta criar a senha</em> : <em className="fin-situacao pago">Ativo</em>}</span>
          <span className="fin-acessos-acoes">{!a.eu && !a.marcas.includes('*') && <button type="button" className="fin-btn pequeno" onClick={() => setEditando({ acesso: a })}>{a.ativo ? 'Editar' : 'Devolver acesso'}</button>}</span>
        </li>)}
      </ul> : <Vazio titulo="Só você tem acesso" texto="Dê acesso aos administradores que precisam ver ou lançar no financeiro." />)}
    </section>
    <p className="fin-explica"><Icone nome="cadeado" />
      <span>Cada pessoa tem a própria senha, diferente da senha de login. Quem recebe acesso entra com uma senha provisória e cria a dela no primeiro acesso. Cinco senhas erradas seguidas travam o acesso por 15 minutos, e o financeiro se bloqueia sozinho depois de 20 minutos parado.</span></p>

    {editando && <EditorAcesso api={api} acesso={editando.acesso} candidatos={editando.acesso ? [] : semAcesso}
      aoFechar={() => setEditando(null)}
      aoSalvar={(msg, senha, nome) => { setEditando(null); void ler(); aoMudar(msg); if (senha) setMostrarSenha({ senha, nome }) }}
      aoTirar={(msg) => { setEditando(null); void ler(); aoMudar(msg) }} />}

    {mostrarSenha && <SenhaProvisoria nome={mostrarSenha.nome} senha={mostrarSenha.senha} aoFechar={() => setMostrarSenha(null)} />}
  </div>
}

function SenhaProvisoria({ nome, senha, aoFechar }: { nome: string; senha: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  return <Janela largura={440} titulo="Senha provisória" sub={`Envie para ${nome}. Ela só aparece agora.`} aoFechar={aoFechar}
    rodape={<><span className="fin-rodape-espaco" /><button type="button" className="fin-btn primario" onClick={aoFechar}>Pronto</button></>}>
    <div className="fin-senha-provisoria">
      <code>{senha}</code>
      <button type="button" className="fin-btn" onClick={() => { void navigator.clipboard?.writeText(senha).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) }) }}>{copiado ? 'Copiada' : 'Copiar'}</button>
    </div>
    <p className="fin-explica sem-borda">No primeiro acesso ao financeiro, a pessoa digita esta senha e cria a dela.</p>
  </Janela>
}

function EditorAcesso({ api, acesso, candidatos, aoFechar, aoSalvar, aoTirar }: {
  api: FinApi; acesso: Acesso | null; candidatos: Candidato[]
  aoFechar: () => void
  aoSalvar: (msg: string, senha: string | null, nome: string) => void
  aoTirar: (msg: string) => void
}) {
  const [email, setEmail] = useState(acesso?.email ?? candidatos[0]?.email ?? '')
  const [papel, setPapel] = useState<Papel>(acesso?.papel ?? 'editor')
  const escolhido = acesso ? null : candidatos.find((c) => c.email === email)
  const opcoesMarca = acesso ? [...new Set([...acesso.marcas, ...Object.keys(MARCAS)])] : escolhido?.marcas.filter((m) => m !== 'teeds' || escolhido.marcas.length === 1) ?? []
  const [marcas, setMarcas] = useState<string[]>(acesso?.marcas ?? [])
  const [novaSenha, setNovaSenha] = useState(!acesso || !acesso.ativo)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarTirar, setConfirmarTirar] = useState(false)

  // trocar a pessoa escolhida já marca as plataformas em que ela é administradora
  useEffect(() => { if (!acesso && escolhido) setMarcas(escolhido.marcas.filter((m) => m !== 'teeds')) }, [email]) // eslint-disable-line react-hooks/exhaustive-deps
  const nome = acesso?.nome || escolhido?.nome || email.split('@')[0]

  const salvar = async () => {
    if (!email) { setErro('Escolha a pessoa.'); return }
    if (!marcas.length) { setErro('Escolha pelo menos uma plataforma.'); return }
    setSalvando(true); setErro(null)
    const senha = novaSenha ? gerarSenha().replace(/^(....)/, (m) => m[0].toUpperCase() + m.slice(1)) : null
    try {
      await api.darAcesso(email, papel, marcas, senha)
      aoSalvar(acesso ? 'Acesso atualizado.' : `${nome.split(' ')[0]} agora tem acesso ao financeiro.`, senha, nome.split(' ')[0])
    } catch (x) { setErro((x as Error).message); setSalvando(false) }
  }
  const tirar = async () => {
    if (!acesso) return
    setSalvando(true); setErro(null)
    try { await api.tirarAcesso(acesso.email); aoTirar(`${nome.split(' ')[0]} não acessa mais o financeiro.`) }
    catch (x) { setErro((x as Error).message); setSalvando(false) }
  }

  return <Janela largura={520} aoFechar={aoFechar} titulo={acesso ? `Acesso de ${nome.split(' ')[0]}` : 'Dar acesso ao financeiro'}
    sub={acesso ? acesso.email : 'Só administradores da plataforma podem receber acesso.'}
    rodape={confirmarTirar
      ? <><span className="fin-rodape-pergunta">Tirar o acesso de {nome.split(' ')[0]}? Se estiver com o financeiro aberto, ele fecha na hora.</span>
        <button type="button" className="fin-btn" onClick={() => setConfirmarTirar(false)} disabled={salvando}>Voltar</button>
        <button type="button" className="fin-btn perigo" onClick={() => void tirar()} disabled={salvando}>Tirar acesso</button></>
      : <>{acesso?.ativo && <button type="button" className="fin-btn texto perigo" onClick={() => setConfirmarTirar(true)} disabled={salvando}>Tirar acesso</button>}
        <span className="fin-rodape-espaco" />
        <button type="button" className="fin-btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="fin-btn primario" onClick={() => void salvar()} disabled={salvando || !email}>{salvando ? 'Salvando…' : acesso ? 'Salvar' : 'Dar acesso'}</button></>}>
    <fieldset className="fin-form" disabled={salvando}>
      <div className="fin-form-grade">
        {!acesso && <Campo rotulo="Pessoa" largo>
          <select data-foco value={email} onChange={(e) => setEmail(e.target.value)}>
            {candidatos.map((c) => <option key={c.email} value={c.email}>{c.nome ? `${c.nome} · ${c.email}` : c.email}</option>)}
          </select>
        </Campo>}
        <div className="fin-campo largo"><span className="fin-campo-rot">Papel</span>
          <div className="fin-escolha coluna">
            {PAPEIS.map((p) => <button key={p.id} type="button" className={papel === p.id ? 'on' : ''} onClick={() => setPapel(p.id)}><b>{p.nome}</b><small>{p.desc}</small></button>)}
          </div>
        </div>
        <div className="fin-campo largo"><span className="fin-campo-rot">Plataformas</span>
          <div className="fin-marcas">
            {opcoesMarca.map((m) => <label key={m} className="fin-check"><input type="checkbox" checked={marcas.includes(m)}
              onChange={(e) => setMarcas((l) => e.target.checked ? [...l, m] : l.filter((x) => x !== m))} /><span>{nomeDaMarca(m)}</span></label>)}
          </div>
        </div>
        {acesso?.ativo && <div className="fin-campo largo">
          <label className="fin-check"><input type="checkbox" checked={novaSenha} onChange={(e) => setNovaSenha(e.target.checked)} /><span>Gerar uma senha provisória nova (a atual deixa de valer)</span></label>
        </div>}
        {(!acesso || !acesso.ativo) && <p className="fin-explica sem-borda largo">Ao salvar, o sistema gera uma senha provisória para você enviar. A pessoa troca no primeiro acesso.</p>}
      </div>
      {erro && <p className="fin-erro" role="alert">{erro}</p>}
    </fieldset>
  </Janela>
}
