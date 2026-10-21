import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { cpfValido, formatarCPF, formatarTelefone, recuperarSenha, telefoneValido, trocarSenha } from '../../core/teeds/conta'
import type { TradingAccount } from '../../core/deriv/account'
import {
  buscarCep, enviarFoto, formatarCep, lerPerfil, removerFoto, salvarPerfil, type Endereco, type Perfil,
} from '../../core/teeds/perfil'
import { abrirSuporte } from '../../core/teeds/suporte'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import './meu-perfil.css'

/**
 * "Meu Perfil" (20/10/2026, pedido do Tiago: "capricha"): a pessoa vê e
 * completa os próprios dados (nome completo, CPF, telefone, e-mail,
 * endereço com CEP, foto), o plano e até quando vale o acesso; e cuida da
 * corretora e da senha. Pensado primeiro para o celular: uma coluna, campos
 * grandes, teclado certo em cada campo e a barra "Salvar" presa embaixo.
 */

interface Props {
  sessao: SessaoTeeds
  contas?: TradingAccount[]
  derivConectada?: boolean
  onConectarDeriv?: () => void
  /** Avisa o app (menu, avatar) que nome ou foto mudaram. */
  onMudou?: (p: { nome: string; fotoUrl: string | null }) => void
}

const VAZIO: Endereco = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }
const iniciais = (nome: string, email: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : p[0]?.slice(0, 2) ?? email[0] ?? '?').toUpperCase()
}
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const STATUS: Record<string, { rotulo: string; cls: string }> = {
  ativo: { rotulo: 'Ativo', cls: 'ok' }, pendente: { rotulo: 'Em análise', cls: 'aviso' }, suspenso: { rotulo: 'Suspenso', cls: 'ruim' },
  expirado: { rotulo: 'Expirado', cls: 'ruim' }, cancelado: { rotulo: 'Cancelado', cls: 'ruim' },
}
const I = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  cadeado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  check: 'M5 12.5l4.2 4.2L19 7',
  plano: 'M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.3l5.9-.9z',
  pessoa: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
  casa: 'M3 11l9-7 9 7M5 9.5V20h14V9.5',
  carta: 'M3 6h18v12H3zM3 7l9 6 9-6',
  corretora: 'M4 19V9l8-5 8 5v10M9 19v-6h6v6',
  chave: 'M14 10a4 4 0 11-1.2 2.8L4 21v-3h3v-3h3l2.8-2.8',
}
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export function MeuPerfil({ sessao, contas = [], derivConectada = false, onConectarDeriv, onMudou }: Props) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [end, setEnd] = useState<Endereco>(VAZIO)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepNaoAchado, setCepNaoAchado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [senhaRecado, setSenhaRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const carregar = () => lerPerfil(sessao).then((p) => {
    setPerfil(p); setNome(p.nome); setCpf(p.cpf ? formatarCPF(p.cpf) : ''); setTelefone(formatarTelefone(p.telefone)); setEnd({ ...p.endereco, cep: formatarCep(p.endereco.cep) }); setFoto(p.fotoUrl); setErroCarga(null)
  }).catch(() => setErroCarga('Não consegui abrir seus dados agora. Confira a conexão e tente de novo.'))
  useEffect(() => { void carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // CEP completo: o endereço se preenche sozinho
  const cepDigitos = end.cep.replace(/\D/g, '')
  useEffect(() => {
    if (cepDigitos.length !== 8 || cepDigitos === perfil?.endereco.cep.replace(/\D/g, '')) return
    let vivo = true
    setBuscandoCep(true); setCepNaoAchado(false)
    void buscarCep(cepDigitos).then((a) => {
      if (!vivo) return
      setBuscandoCep(false)
      if (!a) { setCepNaoAchado(true); return }
      setEnd((e) => ({ ...e, rua: a.rua || e.rua, bairro: a.bairro || e.bairro, cidade: a.cidade || e.cidade, uf: a.uf || e.uf }))
    })
    return () => { vivo = false }
  }, [cepDigitos]) // eslint-disable-line react-hooks/exhaustive-deps

  const cpfTravado = !!perfil?.cpf
  const nomeOk = nome.trim().split(/\s+/).filter((p) => p.length > 1).length >= 2
  const cpfOk = cpfTravado || (cpf.replace(/\D/g, '') === '' || cpfValido(cpf))
  const telOk = telefone.replace(/\D/g, '') === '' || telefoneValido(telefone)
  const cepOk = cepDigitos === '' || cepDigitos.length === 8
  const mudou = !!perfil && (
    nome.trim() !== perfil.nome.trim() || (!cpfTravado && cpf.replace(/\D/g, '') !== perfil.cpf) || telefone.replace(/\D/g, '') !== perfil.telefone.replace(/\D/g, '') ||
    cepDigitos !== perfil.endereco.cep.replace(/\D/g, '') || (['rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const).some((k) => end[k].trim() !== perfil.endereco[k].trim()))
  // um nome só já gravado não trava o resto: o aviso pede o sobrenome, mas dá para salvar o telefone
  const valido = (nomeOk || (!!nome.trim() && nome.trim() === perfil?.nome.trim())) && cpfOk && telOk && cepOk

  // o quanto do perfil está completo
  const itens = useMemo(() => [
    { id: 'mp-nome', rotulo: 'Nome completo', ok: nomeOk },
    { id: 'mp-cpf', rotulo: 'CPF', ok: cpfTravado || cpfValido(cpf) },
    { id: 'mp-telefone', rotulo: 'Telefone', ok: telefoneValido(telefone) },
    { id: 'mp-email', rotulo: 'E-mail', ok: true },
    { id: 'mp-cep', rotulo: 'Endereço', ok: cepDigitos.length === 8 && !!end.rua.trim() && !!end.numero.trim() && !!end.cidade.trim() },
    { id: 'mp-foto', rotulo: 'Foto', ok: !!foto },
  ], [nomeOk, cpfTravado, cpf, telefone, cepDigitos, end, foto])
  const feitos = itens.filter((i) => i.ok).length
  const irPara = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => el?.focus({ preventScroll: true }), 350) }

  async function salvar() {
    if (!mudou || !valido || salvando) return
    setSalvando(true); setRecado(null)
    try {
      await salvarPerfil(sessao, { nome, cpf: cpfTravado ? '' : cpf, telefone, endereco: end })
      await carregar()
      onMudou?.({ nome: nome.trim(), fotoUrl: foto })
      setRecado({ tipo: 'ok', texto: 'Dados salvos.' })
    } catch (e) { setRecado({ tipo: 'erro', texto: (e as Error).message }) } finally { setSalvando(false) }
  }

  async function trocarFoto(f: File | undefined) {
    if (!f) return
    setEnviandoFoto(true); setRecado(null)
    try { const u = await enviarFoto(sessao, f); setFoto(u); onMudou?.({ nome: perfil?.nome ?? nome, fotoUrl: u }); setRecado({ tipo: 'ok', texto: 'Foto atualizada.' }) }
    catch (e) { setRecado({ tipo: 'erro', texto: (e as Error).message }) }
    finally { setEnviandoFoto(false); if (arquivo.current) arquivo.current.value = '' }
  }
  async function tirarFoto() {
    setEnviandoFoto(true)
    try { await removerFoto(sessao); setFoto(null); onMudou?.({ nome: perfil?.nome ?? nome, fotoUrl: null }) } catch { /* fica como estava */ } finally { setEnviandoFoto(false) }
  }

  const senhaOk = senha.length >= 6 && senha === repetir
  async function salvarSenha() {
    if (!senhaOk) return
    setSenhaRecado(null)
    try { await trocarSenha(sessao.token, senha); setSenha(''); setRepetir(''); setSenhaRecado({ tipo: 'ok', texto: 'Senha trocada.' }) }
    catch (e) { setSenhaRecado({ tipo: 'erro', texto: (e as Error).message }) }
  }
  async function linkDeSenha() {
    setSenhaRecado(null)
    try { await recuperarSenha(perfil?.email ?? sessao.usuario.email); setSenhaRecado({ tipo: 'ok', texto: `Link enviado para ${perfil?.email ?? sessao.usuario.email}. Ele vale por uma hora.` }) }
    catch (e) { setSenhaRecado({ tipo: 'erro', texto: (e as Error).message }) }
  }

  if (erroCarga) return <div className="mp"><p className="mp-recado erro">{erroCarga}</p><button className="mp-btn" onClick={() => void carregar()}>Tentar de novo</button></div>
  if (!perfil) return <div className="mp"><div className="mp-carregando" aria-busy="true">Abrindo seu perfil…</div></div>

  const st = STATUS[perfil.status] ?? { rotulo: perfil.status, cls: 'aviso' }
  const faltam = perfil.acessoExpira ? Math.ceil((Date.parse(perfil.acessoExpira) - Date.now()) / 86_400_000) : null
  const total = perfil.acessoInicio && perfil.acessoExpira ? Math.max(1, (Date.parse(perfil.acessoExpira) - Date.parse(perfil.acessoInicio)) / 86_400_000) : null
  const usado = total && faltam !== null ? Math.min(100, Math.max(0, ((total - Math.max(0, faltam)) / total) * 100)) : 0

  return (
    <div className="mp">
      {/* ------------------------------------------------ quem é */}
      <section className="mp-topo">
        <Monograma variante="marca-dagua" tamanho={260} className="mp-topo-marca" />
        <div className="mp-avatar" id="mp-foto" tabIndex={-1}>
          {foto ? <img src={foto} alt={`Foto de ${perfil.nome || 'perfil'}`} /> : <span>{iniciais(perfil.nome, perfil.email)}</span>}
          <button type="button" className="mp-avatar-btn" onClick={() => arquivo.current?.click()} disabled={enviandoFoto} aria-label={foto ? 'Trocar a foto' : 'Adicionar uma foto'}>
            {enviandoFoto ? <i className="mp-girando" aria-hidden="true" /> : <Ic d={I.camera} />}
          </button>
          <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => void trocarFoto(e.target.files?.[0])} />
        </div>
        <div className="mp-quem">
          <span className="mp-sobre">Meu perfil</span>
          <h1>{perfil.nome || 'Complete seu nome'}</h1>
          <p>{perfil.email}</p>
          <div className="mp-selos">
            <span className="mp-selo plano"><Monograma tamanho={14} />{perfil.planoNome}</span>
            <span className={`mp-selo ${st.cls}`}><i aria-hidden="true" />{st.rotulo}</span>
          </div>
          {foto && <button type="button" className="mp-link" onClick={() => void tirarFoto()} disabled={enviandoFoto}>Remover foto</button>}
        </div>
        <div className="mp-completo" aria-label={`Perfil ${feitos} de ${itens.length} completo`}>
          <div className="mp-completo-topo"><b>Perfil {Math.round((feitos / itens.length) * 100)}% completo</b><span>{feitos} de {itens.length}</span></div>
          <div className="mp-trilho"><i style={{ width: `${(feitos / itens.length) * 100}%` }} /></div>
          {feitos < itens.length && (
            <div className="mp-faltam">
              <span>Falta:</span>
              {itens.filter((i) => !i.ok).map((i) => <button key={i.id} type="button" onClick={() => (i.id === 'mp-foto' ? arquivo.current?.click() : irPara(i.id))}>{i.rotulo}</button>)}
            </div>
          )}
        </div>
      </section>

      {recado && <p className={`mp-recado ${recado.tipo}`} role="status">{recado.texto}</p>}

      <div className="mp-grade">
        {/* ------------------------------------------------ plano */}
        <section className="mp-cartao mp-plano">
          <Monograma variante="marca-dagua" tamanho={150} className="mp-plano-marca" />
          <h2><Ic d={I.plano} />Seu plano</h2>
          <div className="mp-plano-nome"><Monograma tamanho={30} />{perfil.planoNome}</div>
          <dl className="mp-fichas">
            <div><dt>Situação</dt><dd className={st.cls}>{st.rotulo}</dd></div>
            <div><dt>Acesso desde</dt><dd>{data(perfil.acessoInicio)}</dd></div>
            <div><dt>Válido até</dt><dd>{perfil.acessoExpira ? data(perfil.acessoExpira) : 'Sem data de término'}</dd></div>
            <div><dt>Cliente desde</dt><dd>{data(perfil.criadoEm)}</dd></div>
          </dl>
          {faltam !== null && (
            <div className={`mp-validade ${faltam <= 5 ? 'perto' : ''}`}>
              <div className="mp-trilho"><i style={{ width: `${usado}%` }} /></div>
              <p>{faltam > 1 ? `Faltam ${faltam} dias de acesso.` : faltam === 1 ? 'Seu acesso termina amanhã.' : faltam === 0 ? 'Seu acesso termina hoje.' : 'Seu acesso terminou.'}
                {faltam <= 5 && ' Para renovar, fale com o suporte.'}</p>
              {faltam <= 5 && MARCA.suporte && <button type="button" className="mp-btn ouro" onClick={() => abrirSuporte({ atalho: 'renovar' })}>Renovar com o suporte</button>}
            </div>
          )}
        </section>

        {/* ------------------------------------------------ dados pessoais */}
        <section className="mp-cartao">
          <h2><Ic d={I.pessoa} />Dados pessoais</h2>
          <label className="mp-campo">
            <span>Nome completo</span>
            <input id="mp-nome" value={nome} autoComplete="name" autoCapitalize="words" enterKeyHint="next" placeholder="Seu nome e sobrenome" onChange={(e) => setNome(e.target.value)} aria-invalid={!nomeOk} />
            {!nomeOk && nome.trim() && <small className="erro">Coloque nome e sobrenome.</small>}
          </label>
          <label className="mp-campo">
            <span>CPF {cpfTravado && <Ic d={I.cadeado} />}</span>
            <input id="mp-cpf" value={cpf} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" disabled={cpfTravado}
              onChange={(e) => setCpf(formatarCPF(e.target.value))} aria-invalid={!cpfOk} />
            {cpfTravado ? <small>Para corrigir o CPF, fale com o suporte.</small> : !cpfOk && <small className="erro">Esse CPF não é válido. Confira os números.</small>}
          </label>
          <label className="mp-campo">
            <span>Telefone com DDD</span>
            <input id="mp-telefone" value={telefone} inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" onChange={(e) => setTelefone(formatarTelefone(e.target.value))} aria-invalid={!telOk} />
            {!telOk && <small className="erro">Coloque o DDD e o número.</small>}
          </label>
        </section>

        {/* ------------------------------------------------ endereço */}
        <section className="mp-cartao">
          <h2><Ic d={I.casa} />Endereço</h2>
          <div className="mp-linha">
            <label className="mp-campo cep">
              <span>CEP</span>
              <input id="mp-cep" value={end.cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" onChange={(e) => setEnd({ ...end, cep: formatarCep(e.target.value) })} aria-invalid={!cepOk} />
              {buscandoCep ? <small>Buscando o endereço…</small> : cepNaoAchado ? <small className="erro">Não achamos esse CEP. Preencha o endereço abaixo.</small> : <small>O endereço se preenche sozinho.</small>}
            </label>
            <label className="mp-campo uf">
              <span>UF</span>
              <input value={end.uf} maxLength={2} autoComplete="address-level1" placeholder="SP" onChange={(e) => setEnd({ ...end, uf: e.target.value.replace(/[^a-z]/gi, '').toUpperCase() })} />
            </label>
          </div>
          <label className="mp-campo"><span>Rua</span><input value={end.rua} autoComplete="address-line1" placeholder="Rua, avenida…" onChange={(e) => setEnd({ ...end, rua: e.target.value })} /></label>
          <div className="mp-linha">
            <label className="mp-campo numero"><span>Número</span><input value={end.numero} inputMode="numeric" autoComplete="address-line2" placeholder="123" onChange={(e) => setEnd({ ...end, numero: e.target.value })} /></label>
            <label className="mp-campo"><span>Complemento</span><input value={end.complemento} placeholder="Apto, bloco (opcional)" onChange={(e) => setEnd({ ...end, complemento: e.target.value })} /></label>
          </div>
          <div className="mp-linha">
            <label className="mp-campo"><span>Bairro</span><input value={end.bairro} placeholder="Bairro" onChange={(e) => setEnd({ ...end, bairro: e.target.value })} /></label>
            <label className="mp-campo"><span>Cidade</span><input value={end.cidade} autoComplete="address-level2" placeholder="Cidade" onChange={(e) => setEnd({ ...end, cidade: e.target.value })} /></label>
          </div>
        </section>

        {/* ------------------------------------------------ e-mail (troca só pelo suporte, 20/10/2026) */}
        <section className="mp-cartao">
          <h2><Ic d={I.carta} />E-mail de acesso</h2>
          <div className="mp-atual"><span>E-mail atual</span><b id="mp-email" tabIndex={-1}>{perfil.email}</b></div>
          <p className="mp-nota">Por segurança, a troca do e-mail de acesso é feita pela equipe de suporte. Peça pelo chat: é rápido.</p>
          {MARCA.suporte && <button type="button" className="mp-btn" onClick={() => abrirSuporte({ atalho: 'trocar-email' })}>Pedir a troca ao suporte</button>}
        </section>

        {/* ------------------------------------------------ corretora */}
        <section className="mp-cartao">
          <h2><Ic d={I.corretora} />Sua corretora</h2>
          {derivConectada && contas.length > 0 ? (
            <ul className="mp-contas">
              {contas.map((c) => (
                <li key={c.accountId}>
                  <i className={c.type === 'demo' ? 'demo' : 'real'}>{c.type === 'demo' ? 'Demo' : 'Real'}</i>
                  <b>{c.accountId}</b>
                  <span>{c.currency} {c.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mp-nota">Nenhuma conta Deriv conectada agora. O saldo e as operações ficam na sua conta da corretora; a {MARCA.prosa} só se conecta a ela.</p>
              {onConectarDeriv && <button type="button" className="mp-btn deriv" onClick={onConectarDeriv}>Conectar minha Deriv</button>}
            </>
          )}
        </section>

        {/* ------------------------------------------------ segurança */}
        <section className="mp-cartao">
          <h2><Ic d={I.chave} />Senha</h2>
          <label className="mp-campo"><span>Nova senha</span><input type="password" value={senha} autoComplete="new-password" placeholder="Pelo menos 6 caracteres" onChange={(e) => setSenha(e.target.value)} /></label>
          <label className="mp-campo"><span>Repita a senha</span><input type="password" value={repetir} autoComplete="new-password" onChange={(e) => setRepetir(e.target.value)} aria-invalid={!!repetir && senha !== repetir} />
            {repetir && senha !== repetir && <small className="erro">As duas senhas não são iguais.</small>}</label>
          <div className="mp-acoes">
            <button type="button" className="mp-btn" disabled={!senhaOk} onClick={() => void salvarSenha()}>Trocar senha</button>
            <button type="button" className="mp-btn secundario" onClick={() => void linkDeSenha()}>Receber link por e-mail</button>
          </div>
          {senhaRecado && <p className={`mp-recado ${senhaRecado.tipo}`} role="status">{senhaRecado.texto}</p>}
        </section>
      </div>

      {/* a barra de salvar aparece quando algo mudou (presa embaixo no celular) */}
      <div className={`mp-salvar ${mudou ? 'aberta' : ''}`} aria-hidden={!mudou}>
        <span>{valido ? 'Você tem alterações não salvas.' : 'Confira os campos marcados.'}</span>
        <button type="button" className="mp-btn ouro" disabled={!mudou || !valido || salvando} onClick={() => void salvar()} tabIndex={mudou ? 0 : -1}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
      </div>
    </div>
  )
}
