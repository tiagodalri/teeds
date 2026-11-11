/*
  A trava do Financeiro: a senha individual, que não é a do login.
    - quem tem senha: digita e destrava (5 erros seguidos travam 15 min, no banco);
    - o admin geral no primeiro acesso: cria a senha dele;
    - quem entrou com a senha provisória: cria a senha pessoal antes de ver qualquer número;
    - admin sem acesso: o aviso de a quem pedir.
*/
import { useState, type FormEvent } from 'react'
import { Icone } from '../Icone'
import type { FinApi, MeuAcesso } from '../../core/teeds/financeiro'

const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function CampoSenha({ valor, aoMudar, rotulo, auto, foco, id }: { valor: string; aoMudar: (v: string) => void; rotulo: string; auto: string; foco?: boolean; id: string }) {
  const [ver, setVer] = useState(false)
  return (
    <label className="fin-trava-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <span className="fin-trava-input">
        <input id={id} type={ver ? 'text' : 'password'} value={valor} onChange={(e) => aoMudar(e.target.value)} autoComplete={auto} autoFocus={foco}
          spellCheck={false} autoCapitalize="off" maxLength={72} />
        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Esconder a senha' : 'Mostrar a senha'} title={ver ? 'Esconder' : 'Mostrar'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ver
            ? <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.7 9.7 0 0112 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.2 6.3C4.3 7.6 2.8 9.6 2 12c1 2.5 5 7 10 7 1.7 0 3.2-.5 4.5-1.2" />
            : <><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></>}</svg>
        </button>
      </span>
    </label>
  )
}

function Regras({ senha, confirma }: { senha: string; confirma: string }) {
  const r = [
    { ok: senha.length >= 8, t: 'Pelo menos 8 caracteres' },
    { ok: /[A-Za-z]/.test(senha) && /\d/.test(senha), t: 'Letras e números' },
    { ok: !!confirma && senha === confirma, t: 'As duas senhas iguais' },
  ]
  return <ul className="fin-trava-regras">{r.map((x) => <li key={x.t} className={x.ok ? 'ok' : ''}><Icone nome="certo" />{x.t}</li>)}</ul>
}
const senhaBoa = (s: string, c: string) => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s) && s === c

export function Trava({ api, acesso, aviso, aoDestravar, aoMudarAcesso }: {
  api: FinApi; acesso: MeuAcesso; aviso?: string | null
  aoDestravar: () => void
  aoMudarAcesso: () => void
}) {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  // a senha provisória digitada, para trocar pela pessoal sem pedir de novo
  const [provisoria, setProvisoria] = useState<string | null>(null)
  const bloqueadoAte = acesso.bloqueado_ate && Date.parse(acesso.bloqueado_ate) > Date.now() ? acesso.bloqueado_ate : null

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (!senha || indo) return
    setIndo(true); setErro(null)
    try {
      const r = await api.entrar(senha)
      if ('token' in r) {
        if (r.trocar_senha) { setProvisoria(senha); setSenha(''); return }
        aoDestravar(); return
      }
      if (r.erro === 'senha') setErro(r.restam === 1 ? 'Senha incorreta. Resta 1 tentativa antes de travar por 15 minutos.' : `Senha incorreta. Restam ${r.restam} tentativas.`)
      else if (r.erro === 'bloqueado') { setErro(`Muitas tentativas erradas. O financeiro destrava às ${horaDe(r.ate)}.`); aoMudarAcesso() }
      else setErro('Você não tem acesso ao financeiro.')
      setSenha('')
    } catch (x) { setErro((x as Error).message) } finally { setIndo(false) }
  }

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    if (!senhaBoa(senha, confirma) || indo) return
    setIndo(true); setErro(null)
    try {
      await api.criarMinhaSenha(senha)
      const r = await api.entrar(senha)
      if ('token' in r) aoDestravar(); else aoMudarAcesso()
    } catch (x) { setErro((x as Error).message) } finally { setIndo(false) }
  }

  const trocar = async (e: FormEvent) => {
    e.preventDefault()
    if (!provisoria || !senhaBoa(senha, confirma) || indo) return
    setIndo(true); setErro(null)
    try {
      const r = await api.trocarSenha(provisoria, senha)
      if ('ok' in r) { aoDestravar(); return }
      setErro(r.erro === 'igual' ? 'A senha nova precisa ser diferente da provisória.' : r.erro === 'fraca' ? 'Use 8 caracteres ou mais, com letras e números.' : 'Não foi possível trocar a senha. Entre de novo com a provisória.')
      if (r.erro !== 'igual' && r.erro !== 'fraca') { setProvisoria(null); setSenha(''); setConfirma('') }
    } catch (x) { setErro((x as Error).message) } finally { setIndo(false) }
  }

  let conteudo
  if (!acesso.tem && acesso.geral) {
    conteudo = <form onSubmit={criar}>
      <h2>Crie a senha do financeiro</h2>
      <p>É o primeiro acesso. Esta senha é só sua e diferente da senha de login. Depois você dá acesso a quem precisar, cada um com a própria senha.</p>
      <CampoSenha id="fin-nova" rotulo="Senha nova" valor={senha} aoMudar={setSenha} auto="new-password" foco />
      <CampoSenha id="fin-confirma" rotulo="Repita a senha" valor={confirma} aoMudar={setConfirma} auto="new-password" />
      <Regras senha={senha} confirma={confirma} />
      {erro && <p className="fin-trava-erro" role="alert">{erro}</p>}
      <button className="fin-btn primario grande" disabled={!senhaBoa(senha, confirma) || indo}>{indo ? 'Criando…' : 'Criar senha e entrar'}</button>
    </form>
  } else if (!acesso.tem || acesso.ativo === false) {
    conteudo = <div>
      <h2>Sem acesso ao financeiro</h2>
      <p>O financeiro tem senha própria. Peça ao responsável pelo financeiro para liberar o seu acesso.</p>
    </div>
  } else if (provisoria) {
    conteudo = <form onSubmit={trocar}>
      <h2>Crie a sua senha pessoal</h2>
      <p>Você entrou com uma senha provisória. Troque agora por uma que só você saiba.</p>
      <CampoSenha id="fin-nova" rotulo="Senha nova" valor={senha} aoMudar={setSenha} auto="new-password" foco />
      <CampoSenha id="fin-confirma" rotulo="Repita a senha" valor={confirma} aoMudar={setConfirma} auto="new-password" />
      <Regras senha={senha} confirma={confirma} />
      {erro && <p className="fin-trava-erro" role="alert">{erro}</p>}
      <button className="fin-btn primario grande" disabled={!senhaBoa(senha, confirma) || indo}>{indo ? 'Salvando…' : 'Salvar e entrar'}</button>
    </form>
  } else {
    conteudo = <form onSubmit={entrar}>
      <h2>Financeiro protegido</h2>
      <p>Digite a sua senha do financeiro. Ela é diferente da senha de login.</p>
      {aviso && !erro && <p className="fin-trava-aviso">{aviso}</p>}
      {/* o e-mail escondido ajuda o gerenciador de senhas a guardar no lugar certo */}
      <input type="text" name="username" autoComplete="username" value="financeiro" readOnly hidden />
      <CampoSenha id="fin-senha" rotulo="Senha do financeiro" valor={senha} aoMudar={setSenha} auto="current-password" foco />
      {(erro || bloqueadoAte) && <p className="fin-trava-erro" role="alert">{erro ?? `Muitas tentativas erradas. O financeiro destrava às ${horaDe(bloqueadoAte!)}.`}</p>}
      <button className="fin-btn primario grande" disabled={!senha || indo}>{indo ? 'Conferindo…' : 'Destravar'}</button>
      <small className="fin-trava-pe">Esqueceu a senha? Peça ao responsável pelo financeiro uma senha provisória.</small>
    </form>
  }

  return (
    <div className="fin-trava">
      <div className="fin-trava-caixa">
        <span className="fin-trava-icone"><Icone nome="cadeado" /></span>
        {conteudo}
      </div>
    </div>
  )
}
