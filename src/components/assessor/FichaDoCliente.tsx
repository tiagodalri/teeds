import { useEffect, useMemo, useState } from 'react'
import type { ContatoWpp, WhatsAppApi } from '../../core/teeds/whatsapp'
import type { FichaDoContato, LadoDoResultado } from '../../core/teeds/fichaDoCliente'
import './ficha-cliente.css'

/*
  A ficha do cliente na lateral do chat do Assessor (25/11/2026, Tiago: "TIPO PAINEL DA CIA, FICHA COMPLETA!
  INOVE! SURPREENDA! MODERNIZE! IMERSIVIDADE!"). Prefixo CSS fc-.

  Herói com a foto (a do WhatsApp; sem ela, a da plataforma; sem nenhuma, as iniciais) e a cor do plano,
  números grandes do dinheiro, os últimos 30 dias em barras, o desempenho, o engajamento (aulas, lives,
  acessos), o que comprou e a linha do tempo. Tipo de conta verdadeiro: é a tela do ADM.
*/

const usd = (v: number | null | undefined, sinal = false) => {
  if (v === null || v === undefined) return '—'
  const s = sinal ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  return `${s}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const brl = (v: number | null) => (v === null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return d < 45 ? `há ${d} dia${d > 1 ? 's' : ''}` : `há ${Math.round(d / 30)} meses`
}
const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0)
const tom = (v: number) => (v > 0 ? 'sobe' : v < 0 ? 'desce' : '')
const iniciais = (nome: string) => nome.replace(/^\+/, '').split(/\s+/).filter((p) => /\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
const PLANO: Record<string, string> = { gold: 'Gold', black: 'Black', prestige: 'Prestige' }

const ICONE: Record<string, string> = {
  cadastro: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  operacao: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  deposito: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  saque: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  compra: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
  live: 'M4 7h12v10H4zM16 10.5l4-2.5v8l-4-2.5',
  aula: 'M3 8l9-4 9 4-9 4zM7 10v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5',
  whatsapp: 'M4.2 19.8l1.2-3.9A8.2 8.2 0 1 1 8.4 18.7z',
  acesso: 'M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
  suporte: 'M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 12v4a2 2 0 0 0 2 2h1v-6H4',
  assessor: 'M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z',
  email: 'M4 6h16v12H4zM4 7l8 6 8-6',
  telefone: 'M6.6 3h3l1.5 4.5-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2L21 14.4v3A2.6 2.6 0 0 1 18.4 20 15.4 15.4 0 0 1 4 5.6 2.6 2.6 0 0 1 6.6 3z',
  bolo: 'M4 21h16v-8H4zM4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 0M12 13V9M12 6.5a1.5 1.5 0 0 1-1.5-1.5c0-1 1.5-2.5 1.5-2.5S13.5 4 13.5 5A1.5 1.5 0 0 1 12 6.5z',
  chave: 'M14 10a4 4 0 1 0-3.5 4l1.5 1.5h2v2h2v2h3v-3l-5.5-5.5A4 4 0 0 0 14 10z',
  conta: 'M3 7h18v12H3zM3 11h18M7 15h4',
  copiar: 'M9 9h10v10H9zM5 15V5h10',
  certo: 'M5 12.5l4.5 4.5L19 7.5',
  dinheiro: 'M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.7 4 3 4 1.4 4 3.5-1.8 3-4 3-4-1.1-4-3',
}
const Icone = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>

function Anel({ parte, total, rotulo, valor, cor }: { parte: number; total: number; rotulo: string; valor: string; cor: string }) {
  const p = total > 0 ? Math.min(1, parte / total) : 0
  const C = 2 * Math.PI * 22
  return <div className="fc-anel" style={{ ['--cor' as string]: cor }}>
    <svg viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="22" className="trilho" /><circle cx="26" cy="26" r="22" className="arco" strokeDasharray={`${C * p} ${C}`} /></svg>
    <b>{valor}</b><small>{rotulo}</small>
  </div>
}

function Barras({ dias, conta }: { dias: Array<{ dia: string; real: number; demo: number }>; conta: 'real' | 'demo' }) {
  const vals = dias.map((d) => d[conta])
  const max = Math.max(1, ...vals.map(Math.abs))
  const total = vals.reduce((t, v) => t + v, 0)
  return <div className="fc-barras-caixa">
    <div className="fc-barras" role="img" aria-label={`Resultado dos últimos 30 dias na conta ${conta}: ${usd(total, true)}`}>
      {dias.map((d) => { const v = d[conta]; return <span key={d.dia} className={tom(v)} style={{ ['--h' as string]: `${Math.max(v === 0 ? 0 : 6, (Math.abs(v) / max) * 100)}%` }} title={`${d.dia.split('-').reverse().slice(0, 2).join('/')} · ${usd(v, true)}`} /> })}
    </div>
    <div className="fc-barras-pe"><span>30 dias atrás</span><b className={tom(total)}>{usd(total, true)}</b><span>hoje</span></div>
  </div>
}

export function FichaDoCliente({ api, contato, onAbrirCliente }: { api: WhatsAppApi; contato: ContatoWpp; onAbrirCliente?: (userId: string) => void }) {
  const [d, setD] = useState<FichaDoContato | null | undefined>(undefined)
  const [conta, setConta] = useState<'real' | 'demo'>('real')
  const [verFaltam, setVerFaltam] = useState(false)
  const [fotoFalhou, setFotoFalhou] = useState(false)
  useEffect(() => {
    let vivo = true
    setD(undefined); setFotoFalhou(false)
    const ler = () => api.fichaCompleta?.(contato.id).then((x) => vivo && setD(x)).catch(() => vivo && setD(null))
    void ler()
    // os números andam (I.A. operando, saldo): relê a cada 45 s com a ficha aberta
    const t = setInterval(() => { if (!document.hidden) void ler() }, 45_000)
    return () => { vivo = false; clearInterval(t) }
  }, [api, contato.id, contato.userId])

  const f = d?.ficha ?? null
  const nome = f?.pessoa.nome || contato.nome || contato.waId
  const foto = !fotoFalhou ? (d?.fotoWhatsapp || f?.pessoa.fotoPlataforma || null) : (f?.pessoa.fotoPlataforma || null)
  const plano = f?.pessoa.subplano ?? 'gold'
  const lado: LadoDoResultado | null = f ? f.resultado[conta] : null
  const taxa = lado && lado.ganhas + lado.perdidas > 0 ? Math.round((lado.ganhas / (lado.ganhas + lado.perdidas)) * 100) : null
  const favorita = f?.resultado.porIa[0]?.nome ?? null
  const maxIa = useMemo(() => Math.max(1, ...(f?.resultado.porIa ?? []).map((x) => Math.abs(x[conta]))), [f, conta])
  useEffect(() => { if (f && f.resultado.real.operacoes === 0 && f.resultado.demo.operacoes > 0) setConta('demo') }, [f?.pessoa.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const hero = <section className={`fc-heroi plano-${plano}`}>
    {foto && <div className="fc-heroi-fundo" style={{ backgroundImage: `url("${foto}")` }} aria-hidden />}
    <div className="fc-heroi-brilho" aria-hidden />
    <div className="fc-avatar">
      {foto ? <img src={foto} alt="" onError={() => setFotoFalhou(true)} /> : <span>{iniciais(nome) || '?'}</span>}
      {f?.pessoa.online && <i className="fc-online" title="Na plataforma agora" />}
    </div>
    <h3>{nome}</h3>
    <p className="fc-tel">{contato.waId.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3')}</p>
    {f && <div className="fc-selos">
      <span className={`fc-plano ${plano}`}>GF Member {PLANO[plano] ?? plano}</span>
      {f.pessoa.parceiroNome && <span className="fc-selo">via {f.pessoa.parceiroNome}</span>}
      <span className={`fc-selo ${f.pessoa.online ? 'online' : ''}`}>{f.pessoa.online ? 'Online agora' : `Visto ${haQuanto(f.pessoa.vistoEm)}`}</span>
    </div>}
    {f && <p className="fc-desde">Cliente desde <b>{data(f.pessoa.criadoEm)}</b> · {diasDesde(f.pessoa.criadoEm)} dias{f.pessoa.cidade ? ` · ${f.pessoa.cidade}${f.pessoa.uf ? `/${f.pessoa.uf}` : ''}` : ''}</p>}
  </section>

  if (d === undefined) return <div className="fc">{hero}<div className="fc-carregando"><i /><i /><i /></div></div>
  if (!f) return <div className="fc">
    {hero}
    <section className="fc-bloco fc-sem-dono">
      <b>Número não confirmado</b>
      <p>Este WhatsApp ainda não foi confirmado em <i>Meu perfil</i>, então o Assessor não sabe de quem é a conta e não mexe em nada.</p>
      {d && d.talvez.length > 0 && <><span className="fc-rot">Pelo telefone do cadastro, pode ser</span>
        <ul className="fc-talvez">{d.talvez.map((t, i) => <li key={i}><b>{t.nome ?? 'Sem nome'}</b><small>{t.email}</small></li>)}</ul></>}
    </section>
  </div>

  const r = f.resultado, din = f.dinheiro
  const liquido = din.depositos - din.saques
  return <div className="fc">
    {hero}

    <div className="fc-acoes">
      <button onClick={() => void navigator.clipboard?.writeText(contato.waId)}>Copiar número</button>
      {f.pessoa.email && <button onClick={() => void navigator.clipboard?.writeText(f.pessoa.email!)}>Copiar e-mail</button>}
      {onAbrirCliente && <button className="ouro" onClick={() => onAbrirCliente(f.pessoa.userId)}>Ficha no ADM</button>}
    </div>

    {f.agora.length > 0 && <section className="fc-agora">
      <span className="fc-pulso" aria-hidden />
      <div><span className="fc-rot">Operando agora</span>
        {f.agora.map((a, i) => <p key={i}><b>{a.ia}</b> · {a.demo ? 'demo' : 'real'} · <em className={tom(a.resultado)}>{usd(a.resultado, true)}</em> em {a.operacoes} op. <small>desde {dataHora(a.desde)}</small></p>)}
      </div>
    </section>}

    <section className="fc-kpis">
      <div className="fc-kpi destaque"><span>Saldo real</span><b>{usd(din.saldoReal)}</b><small>{din.contaReal ?? 'sem conta real'}{din.saldoLidoEm ? ` · lido ${haQuanto(din.saldoLidoEm)}` : ''}</small></div>
      <div className="fc-kpi"><span>Resultado real</span><b className={tom(r.real.total)}>{usd(r.real.total, true)}</b><small>demo {usd(r.demo.total, true)}</small></div>
      <div className="fc-kpi ouro"><span>Markup gerado</span><b>{usd(din.markupReal)}</b><small>este mês {usd(din.markupMes)}</small></div>
      <div className="fc-kpi"><span>Depósitos</span><b>{usd(din.depositos)}</b><small>{din.qtdDepositos}× · saques {usd(din.saques)} · líquido {usd(liquido, true)}</small></div>
    </section>

    {f.compartilhamento && <Compartilhamento c={f.compartilhamento} />}

    {(f.movimentos?.length ?? 0) > 0 && <Movimentos lista={f.movimentos!} depositos={din.depositos} saques={din.saques} qtdDep={din.qtdDepositos} qtdSaq={din.qtdSaques} />}

    <section className="fc-bloco">
      <header className="fc-cab"><span className="fc-rot">Últimos 30 dias</span>
        <div className="fc-alterna" role="tablist">{(['real', 'demo'] as const).map((c) => <button key={c} role="tab" aria-selected={conta === c} className={conta === c ? 'on' : ''} onClick={() => setConta(c)}>{c === 'real' ? 'Real' : 'Demo'}</button>)}</div>
      </header>
      <Barras dias={r.dias30} conta={conta} />
    </section>

    {lado && <section className="fc-bloco">
      <span className="fc-rot">Desempenho na {conta === 'real' ? 'conta real' : 'demo'} · desde o começo</span>
      <div className="fc-desempenho">
        <Anel parte={lado.ganhas} total={lado.ganhas + lado.perdidas} valor={taxa === null ? '—' : `${taxa}%`} rotulo="de acerto" cor="var(--fc-verde)" />
        <div className="fc-pares">
          <div><span>Operações</span><b>{lado.operacoes.toLocaleString('pt-BR')}</b></div>
          <div><span>Sessões de I.A.</span><b>{lado.sessoes}</b></div>
          <div><span>Com I.A.</span><b className={tom(lado.ia)}>{usd(lado.ia, true)}</b></div>
          <div><span>Na manual</span><b className={tom(lado.manual)}>{usd(lado.manual, true)}</b></div>
          {favorita && <div className="largo"><span>I.A. favorita</span><b>{favorita}</b></div>}
        </div>
      </div>
      {r.porIa.length > 0 && <ul className="fc-ias">{r.porIa.slice(0, 5).map((x) => <li key={x.nome}>
        <span>{x.nome.replace(/^GF /, '')}</span>
        <i><em className={tom(x[conta])} style={{ width: `${Math.max(3, (Math.abs(x[conta]) / maxIa) * 100)}%` }} /></i>
        <b className={tom(x[conta])}>{usd(x[conta], true)}</b>
      </li>)}</ul>}
      <p className="fc-nota">Primeira operação {data(r.primeiraOperacao)} · última {haQuanto(r.ultimaOperacao)}</p>
    </section>}

    <section className="fc-bloco">
      <span className="fc-rot">Engajamento</span>
      <div className="fc-aneis">
        <Anel parte={f.aulas.concluidas} total={f.aulas.total} valor={`${f.aulas.concluidas}/${f.aulas.total}`} rotulo="aulas concluídas" cor="var(--fc-ouro)" />
        <Anel parte={f.lives.plataforma + f.lives.externasOnline} total={f.lives.plataformaTotal + f.lives.externasTotal} valor={String(f.lives.plataforma + f.lives.externasOnline)} rotulo="lives" cor="#7C6CF2" />
        <Anel parte={f.acessos.ultimos7} total={7} valor={`${f.acessos.ultimos7}/7`} rotulo="dias na semana" cor="var(--fc-verde)" />
      </div>
      <div className="fc-metricas">
        <div className="fc-metrica largo aula">
          <span className="fc-metrica-icone"><Icone d={ICONE.aula} /></span>
          <div className="fc-metrica-corpo">
            <span className="fc-metrica-rot">Aulas</span>
            <b>{f.aulas.vistas}<small> de {f.aulas.total} abertas</small></b>
            <i className="fc-progresso"><em style={{ width: `${f.aulas.total ? Math.round((f.aulas.vistas / f.aulas.total) * 100) : 0}%` }} /></i>
            <small>{f.aulas.concluidas} concluída{f.aulas.concluidas === 1 ? '' : 's'} · {f.aulas.minutos} min assistidos</small>
            {f.aulas.ultimaTitulo && <small className="fc-ultima">Última: <strong>{f.aulas.ultimaTitulo}</strong> · {haQuanto(f.aulas.ultima)}</small>}
          </div>
        </div>
        <div className="fc-metrica live">
          <span className="fc-metrica-icone"><Icone d={ICONE.live} /></span>
          <span className="fc-metrica-rot">Lives</span>
          <b>{f.lives.plataforma}<small>/{f.lives.plataformaTotal}</small></b>
          <small>na plataforma{f.lives.minutos ? ` · ${f.lives.minutos} min` : ''}</small>
          <small>Online em {f.lives.externasOnline} de {f.lives.externasTotal} de fora</small>
        </div>
        <div className="fc-metrica acesso">
          <span className="fc-metrica-icone"><Icone d={ICONE.acesso} /></span>
          <span className="fc-metrica-rot">Acessos</span>
          <b>{f.acessos.total.toLocaleString('pt-BR')}</b>
          <small>{f.acessos.diasAtivos} dias ativos · {f.acessos.horas.toLocaleString('pt-BR')} h</small>
          {f.acessos.dispositivo && <small>Mais no {f.acessos.dispositivo}</small>}
        </div>
        <div className="fc-metrica assessor">
          <span className="fc-metrica-icone"><Icone d={ICONE.whatsapp} /></span>
          <span className="fc-metrica-rot">Assessor</span>
          <b>{f.assessor.mensagens}<small> msg</small></b>
          <small>{f.assessor.iasLigadas} I.A. ligada{f.assessor.iasLigadas === 1 ? '' : 's'} por conversa</small>
        </div>
        <div className="fc-metrica suporte">
          <span className="fc-metrica-icone"><Icone d={ICONE.suporte} /></span>
          <span className="fc-metrica-rot">Suporte</span>
          <b>{f.suporte.conversas}<small> atend.</small></b>
          <small>{f.suporte.conversas ? (f.suporte.abertas ? `${f.suporte.abertas} aberto${f.suporte.abertas > 1 ? 's' : ''} agora` : 'Nenhum aberto') : 'Nunca abriu atendimento'}</small>
        </div>
      </div>
      {f.aulas.faltam.length > 0 && <button className="fc-link" onClick={() => setVerFaltam((v) => !v)}>{verFaltam ? 'Esconder' : `Ver as ${f.aulas.faltam.length} aulas que faltam concluir`}</button>}
      {verFaltam && <ol className="fc-faltam">{f.aulas.faltam.map((t) => <li key={t}>{t}</li>)}</ol>}
    </section>

    <section className="fc-bloco">
      <span className="fc-rot">Compras e produtos</span>
      {f.compras.length === 0 && f.produtos.length === 0
        ? <div className="fc-vazio-card"><span className="fc-metrica-icone"><Icone d={ICONE.compra} /></span><div><b>Nenhuma compra nem upgrade</b><small>Está no GF Member {PLANO[plano] ?? plano}{plano === 'gold' ? ', o plano de entrada' : ''}.</small></div></div>
        : <ul className="fc-compras">
          {f.compras.map((c, i) => <li key={`c${i}`}><Icone d={ICONE.compra} /><span><b>{c.produto}</b><small>{c.origem} · {data(c.quando)}{c.situacao ? ` · ${c.situacao}` : ''}</small></span><em>{brl(c.valor)}</em></li>)}
          {f.produtos.map((p, i) => <li key={`p${i}`} className={p.ativo ? '' : 'inativo'}><Icone d={ICONE.compra} /><span><b>{p.nome}</b><small>{p.ativo ? 'ativo' : 'encerrado'} · desde {data(p.desde)}{p.ate ? ` até ${data(p.ate)}` : ''}{p.origem ? ` · ${p.origem}` : ''}</small></span></li>)}
        </ul>}
    </section>

    <section className="fc-bloco">
      <span className="fc-rot">Linha do tempo</span>
      <ol className="fc-tempo">{f.linhaDoTempo.map((e, i) => <li key={i} className={e.tipo}><span className="fc-tempo-icone"><Icone d={ICONE[e.tipo] ?? ICONE.acesso} /></span><div className="fc-tempo-texto"><b>{e.texto}</b><small>{dataHora(e.quando)}</small></div><time>{haQuanto(e.quando).replace(/^há /, '')}</time></li>)}</ol>
    </section>

    <section className="fc-bloco">
      <span className="fc-rot">Cadastro</span>
      <ul className="fc-cadastro">
        {f.pessoa.email && <LinhaDoCadastro icone={ICONE.email} rotulo="E-mail" valor={f.pessoa.email} copiar />}
        {f.pessoa.telefone && <LinhaDoCadastro icone={ICONE.telefone} rotulo="Telefone" valor={f.pessoa.telefone} copiar />}
        {f.pessoa.nascimento && <LinhaDoCadastro icone={ICONE.bolo} rotulo="Nascimento" valor={data(f.pessoa.nascimento)} />}
        <LinhaDoCadastro icone={ICONE.chave} rotulo="Acesso" valor={f.pessoa.validade ? `Até ${data(f.pessoa.validade)}` : ''}
          selo={{ texto: (f.pessoa.status ?? '—').replace(/^./, (x) => x.toUpperCase()), tom: /ativ|aprov/i.test(f.pessoa.status ?? '') ? 'ok' : 'alerta' }} />
        {din.contaDemo && <LinhaDoCadastro icone={ICONE.conta} rotulo="Conta demo" valor={din.contaDemo} extra={usd(din.saldoDemo)} copiar />}
        {din.contaReal && <LinhaDoCadastro icone={ICONE.conta} rotulo="Conta real" valor={din.contaReal} extra={usd(din.saldoReal)} copiar />}
        <LinhaDoCadastro icone={ICONE.whatsapp} rotulo="WhatsApp" valor={f.pessoa.whatsappConfirmadoEm ? `Em ${data(f.pessoa.whatsappConfirmadoEm)}` : ''}
          selo={f.pessoa.whatsappConfirmadoEm ? { texto: 'Confirmado', tom: 'ok' } : { texto: 'Não confirmado', tom: 'alerta' }} />
      </ul>
    </section>
  </div>
}

function LinhaDoCadastro({ icone, rotulo, valor, extra, selo, copiar }: { icone: string; rotulo: string; valor: string; extra?: string; selo?: { texto: string; tom: 'ok' | 'alerta' }; copiar?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  return <li>
    <span className="fc-cad-icone"><Icone d={icone} /></span>
    <span className="fc-cad-corpo">
      <small>{rotulo}</small>
      <span className="fc-cad-valor">{selo && <em className={`fc-pilula ${selo.tom}`}>{selo.texto}</em>}{valor && <b title={valor}>{valor}</b>}{extra && <i>{extra}</i>}</span>
    </span>
    {copiar && <button className={`fc-cad-copiar ${copiado ? 'ok' : ''}`} title={copiado ? 'Copiado' : `Copiar ${rotulo.toLowerCase()}`} aria-label={`Copiar ${rotulo.toLowerCase()}`}
      onClick={() => { void navigator.clipboard?.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1400) }}>
      {copiado ? <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12l5 5 9-10" /></svg> : <Icone d={ICONE.copiar} />}
    </button>}
  </li>
}

const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeDoMes = (iso: string) => { const [a, m] = iso.slice(0, 7).split('-').map(Number); return `${MES[m - 1].replace(/^./, (x) => x.toUpperCase())}${a !== new Date().getFullYear() ? ` de ${a}` : ''}` }
const pctTexto = (p: number) => `${Math.round(p * 100)}%`

/** 25/11/2026 (Tiago): se a pessoa tem que pagar o compartilhamento e quanto. A mesma conta da tela Admin › Compartilhamento. */
function Compartilhamento({ c }: { c: NonNullable<FichaDoContato['ficha']>['compartilhamento'] & object }) {
  const atual = c.meses.find((m) => !m.fechado)
  const fechados = c.meses.filter((m) => m.fechado)
  const plano = PLANO[c.plano] ?? c.plano
  let tom: 'ok' | 'alerta' | 'neutro' = 'ok', titulo = '', detalhe = ''
  if (c.equipe) { tom = 'neutro'; titulo = 'Equipe: não paga'; detalhe = 'Administradores ficam fora do compartilhamento.' }
  else if (c.percentual <= 0) { titulo = `${plano}: não paga`; detalhe = 'O plano Prestige não tem compartilhamento de receita.' }
  else if (atual && atual.valorUsd > 0) { tom = 'alerta'; titulo = `Paga ${usd(atual.valorUsd)}${atual.valorBrl ? ` · ${brl(atual.valorBrl)}` : ''}`; detalhe = `${pctTexto(atual.percentualNoMes)} do lucro de ${usd(atual.resultado)} em ${nomeDoMes(atual.mes).toLowerCase()} (mês em andamento, pode mudar)` }
  else if (atual) { titulo = 'Não paga este mês'; detalhe = atual.operacoes ? `Resultado do mês na real: ${usd(atual.resultado, true)}. Sem lucro, sem cobrança.` : 'Sem operações na conta real este mês.' }
  const situacao = (m: (typeof c.meses)[number]): { texto: string; tom: 'ok' | 'alerta' | 'neutro' | 'perigo' } => {
    const f = m.fatura
    if (f?.pagaEm || f?.situacao === 'paga') return { texto: 'Paga', tom: 'ok' }
    if (f) { const venc = f.vencimento ? new Date(`${f.vencimento}T23:59:59-03:00`) : null; return venc && venc.getTime() < Date.now() ? { texto: `Vencida ${data(f.vencimento)}`, tom: 'perigo' } : { texto: `A pagar${f.vencimento ? ` · vence ${data(f.vencimento)}` : ''}`, tom: 'alerta' } }
    if (m.valorUsd > 0) return { texto: 'Fatura não gerada', tom: 'alerta' }
    return { texto: 'Sem cobrança', tom: 'neutro' }
  }
  return <section className={`fc-bloco fc-cdr ${tom}`}>
    <header className="fc-cab"><span className="fc-rot">Compartilhamento de receita</span><em className="fc-pilula neutro">{plano} · {c.equipe ? '—' : pctTexto(c.percentual)}</em></header>
    <div className="fc-cdr-destaque">
      <span className="fc-metrica-icone"><Icone d={tom === 'alerta' ? ICONE.dinheiro : ICONE.certo} /></span>
      <div><b>{titulo}</b><small>{detalhe}</small></div>
    </div>
    {c.emAberto > 0 && <p className="fc-cdr-aberto">Em aberto de meses anteriores: <b>{brl(c.emAberto)}</b></p>}
    {fechados.length > 0 && <ul className="fc-cdr-meses">{fechados.map((m) => { const st = situacao(m); return <li key={m.mes}>
      <span><b>{nomeDoMes(m.mes)}</b><small>{m.operacoes ? `${usd(m.resultado, true)} no mês · ${pctTexto(m.percentualNoMes)}` : 'Sem operações na real'}</small></span>
      <span className="fc-cdr-valor">{m.valorUsd > 0 ? <><b>{m.fatura?.valorBrl ? brl(m.fatura.valorBrl) : usd(m.valorUsd)}</b>{m.fatura?.valorBrl ? <small>{usd(m.fatura.valorUsd ?? m.valorUsd)}</small> : null}</> : <b className="zero">—</b>}<em className={`fc-pilula ${st.tom}`}>{st.texto}</em></span>
    </li> })}</ul>}
    <p className="fc-nota">Lucro do mês na conta real (I.A. e manual). Cada mês zera: prejuízo não passa para o seguinte.{c.cotacao ? ` Dólar a ${brl(c.cotacao)}.` : ''}</p>
  </section>
}

/** 25/11/2026 (Tiago): o histórico de depósitos e saques da conta real, mês a mês. */
function Movimentos({ lista, depositos, saques, qtdDep, qtdSaq }: { lista: NonNullable<NonNullable<FichaDoContato['ficha']>['movimentos']>; depositos: number; saques: number; qtdDep: number; qtdSaq: number }) {
  const [filtro, setFiltro] = useState<'tudo' | 'deposito' | 'saque'>('tudo')
  const [todos, setTodos] = useState(false)
  const filtrada = filtro === 'tudo' ? lista : lista.filter((m) => m.tipo === filtro)
  const visiveis = todos ? filtrada : filtrada.slice(0, 8)
  const meses: Array<{ mes: string; itens: typeof lista; liquido: number }> = []
  for (const m of visiveis) {
    const chave = new Date(new Date(m.quando).getTime() - 3 * 3600_000).toISOString().slice(0, 7)
    if (meses[meses.length - 1]?.mes !== chave) meses.push({ mes: chave, itens: [], liquido: 0 })
    const g = meses[meses.length - 1]; g.itens.push(m)
  }
  for (const g of meses) { const doMes = lista.filter((m) => new Date(new Date(m.quando).getTime() - 3 * 3600_000).toISOString().slice(0, 7) === g.mes); g.liquido = doMes.reduce((t, m) => t + (m.tipo === 'deposito' ? m.valor : -m.valor), 0) }
  const liquido = depositos - saques
  return <section className="fc-bloco">
    <span className="fc-rot">Depósitos e saques</span>
    <div className="fc-mov-resumo">
      <div className="dep"><small>Depositou</small><b>{usd(depositos)}</b><i>{qtdDep}×</i></div>
      <div className="saq"><small>Sacou</small><b>{usd(saques)}</b><i>{qtdSaq}×</i></div>
      <div className="liq"><small>Líquido (depósitos − saques)</small><b className={tom(liquido)}>{usd(liquido, true)}</b></div>
    </div>
    <div className="fc-alterna largo" role="tablist">{([['tudo', 'Tudo'], ['deposito', 'Depósitos'], ['saque', 'Saques']] as const).map(([id, rot]) => <button key={id} role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : ''} onClick={() => { setFiltro(id); setTodos(false) }}>{rot}</button>)}</div>
    {meses.map((g) => <div key={g.mes} className="fc-mov-mes">
      <header><span>{nomeDoMes(g.mes)}</span><em className={tom(g.liquido)}>{usd(g.liquido, true)}</em></header>
      <ul>{g.itens.map((m, i) => <li key={`${m.quando}-${i}`} className={m.tipo}>
        <span className="fc-mov-icone"><Icone d={m.tipo === 'deposito' ? ICONE.deposito : ICONE.saque} /></span>
        <span className="fc-mov-texto"><b>{m.tipo === 'deposito' ? 'Depósito' : 'Saque'}</b><small>{dataHora(m.quando)}{m.conta ? ` · ${m.conta}` : ''}</small></span>
        <span className="fc-mov-valor"><b>{m.tipo === 'deposito' ? '+' : '−'}{usd(m.valor)}</b>{m.saldoDepois !== null && <small>saldo {usd(m.saldoDepois)}</small>}</span>
      </li>)}</ul>
    </div>)}
    {!filtrada.length && <p className="fc-vazio">{filtro === 'saque' ? 'Nenhum saque.' : 'Nenhum depósito.'}</p>}
    {filtrada.length > 8 && <button className="fc-link" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar menos' : `Ver todos (${filtrada.length})`}</button>}
  </section>
}
