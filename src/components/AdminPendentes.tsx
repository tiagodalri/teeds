import { parceiroEmFoco, seloDoParceiro, type OpcaoDeParceiro } from '../core/teeds/parceiroEmFoco'
import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SERVIDOR, SUPABASE } from '../core/teeds/config'
import './admin-pendentes.css'
import { PLANOS_CLIENTE } from '../core/teeds/planos'
import type { PlanoRegistro } from '../core/teeds/clientes'
import { MARCAS } from '../marca'
import { FIM_DA_LIVE } from '../core/teeds/lancamento'
import { PRODUTOS_ANTERIORES } from '../core/teeds/leads'

const NOME_DA_MARCA: Record<string,string> = Object.fromEntries(Object.values(MARCAS).map(m=>[m.id,m.prosa]))

/*
  O QUESTIONÁRIO NA APROVAÇÃO (03/11/2026, Tiago: "eu quero saber o que o cara respondeu lá naquele
  formulário... uma coluna bem visível para saber de quem é o cliente"). A resposta mora em
  leads_capturados (gf_responder_questionario); aqui ela é lida pelo e-mail de cada cadastro da página,
  com a mesma regra de acesso da aba Leads (o parceiro vê só os dele).
*/
interface Resposta { exCliente: boolean | null; produtos: string[]; em: string | null; tempo: number | null; temperatura: string | null }
const NOME_DO_PARCEIRO: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }
const nomeDoProduto = (p: string) => p.startsWith('outro: ') ? `Outro: ${p.slice(7)}` : (PRODUTOS_ANTERIORES[p] ?? p).replace(/ \((Naor|Victor)\)$/, '')
const duracao = (s: number) => s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`
const TEMPERATURA: Record<string, string> = { quente: 'Lead quente', morno: 'Lead morno', frio: 'Lead frio' }

/*
  A CONTA CERTA (03/11/2026, Tiago: "tem muito mais que isso e o número travou em 51... não posso perder
  lead nenhum"). Nenhum cadastro se perdia: o servidor entrega de 50 em 50 e o resumo somava só a página
  aberta (51 = 50 da página + 1 que só avisa que há outra). Agora a aba lê a lista inteira direto do
  banco, com a mesma regra de acesso do servidor (RLS por marca e parceiro, e o parceiro em foco), e o
  resumo, os filtros e a busca valem para todos. Se o banco não responder, a reserva é o servidor, página
  por página até a última. A tela desenha 50 por vez ("Mostrar mais") só para não pesar.
*/
const POR_VEZ = 50
const LOTE = 1000
const CAMPOS = 'id,nome,email,telefone,status,recadastro,ultima_inscricao_em,criado_em,decidido_em,email_enviado_em,parceiro'
const ABAS: Array<[string, string]> = [['pendente', 'Pendentes'], ['processando', 'Em aprovação'], ['aprovado', 'Aprovados'], ['recusado', 'Recusados']]
type Tipo = 'ex' | 'novo' | 'sem'
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const mesmoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0)

interface Pendente {
  id: string; nome: string; email: string; telefone: string
  status: string; criado_em: string; email_enviado_em: string | null
  recadastro?: boolean; ultima_inscricao_em?: string
  parceiro?: string | null
}
/*
  A MARCA VEM DE FORA, e não da origem do site.

  Esta tela fala com `/api/clientes-pendentes`, e a rota usava a marca da
  origem: com o painel aberto na Teeds e o seletor em OMNI, apareciam os
  cadastros da Teeds sob o título "OMNI Admin" (Tiago, 06/10/2026). Ler errado
  era confuso; aprovar errado criaria a conta na marca errada.

  Por isso a marca é prop obrigatória: quem renderiza decide, e a tela carrega
  o nome dela no cabeçalho para a dúvida nunca mais existir.
*/
/*
  O PARCEIRO NA APROVAÇÃO (30/10/2026, Tiago: "quando eu for aprovar um cliente,
  conseguir selecionar se ele é do Naor ou do Victor"). Ainda há quem se
  cadastre em globalflytrade.com sem o /n ou o /v. `parceiros` só chega para o
  admin geral (useParceirosDaMarca); para os outros a escolha nem aparece, e o
  banco confere de novo (teeds_parceiro_na_aprovacao).
*/
/*
  FILTROS (08/11/2026, Tiago com o print da aba: "preciso de filtros aqui, melhore"). Uma barra só, na ordem em
  que se procura alguém: busca, período, parceiro, questionário, temperatura, produto que já usou, recadastro
  e a ordem da lista. Cada opção diz quantos cadastros tem. Os números do resumo também filtram (o "+N hoje",
  as três faixas do questionário e os produtos mais citados), os filtros ligados aparecem como etiquetas que
  se tiram com um toque, e a lista filtrada sai em planilha.
*/
type Periodo = '' | 'hoje' | 'ontem' | '7' | '30'
type Ordem = 'recentes' | 'antigos' | 'nome' | 'tempo'
const PERIODOS: Array<[Periodo, string]> = [['', 'Qualquer data'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias']]
const TEMPERATURAS: Array<[string, string]> = [['quente', 'Quente'], ['morno', 'Morno'], ['frio', 'Frio'], ['sem', 'Sem temperatura']]
const ORDENS: Array<[Ordem, string]> = [['recentes', 'Mais recentes primeiro'], ['antigos', 'Mais antigos primeiro'], ['nome', 'Nome (A a Z)'], ['tempo', 'Mais tempo na página']]
const RESPOSTAS: Array<[Tipo, string]> = [['ex', 'Já foram clientes'], ['novo', 'Nunca foram clientes'], ['sem', 'Não responderam']]
const nomeDoGrupo = (pr: string) => nomeDoProduto(pr.startsWith('outro: ') ? 'outro' : pr)
const noPeriodo = (quando: Date, f: Periodo) => {
  if (!f) return true
  const agora = new Date()
  if (f === 'hoje') return mesmoDia(quando, agora)
  if (f === 'ontem') { const o = new Date(agora); o.setDate(o.getDate() - 1); return mesmoDia(quando, o) }
  const ini = new Date(agora); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - (Number(f) - 1))
  return quando >= ini
}

export function AdminPendentes({ sessao, marca, versao, onAprovado, planos, parceiros = [], exemplo = false }: {sessao:SessaoTeeds; marca:string; versao:number; onAprovado:()=>void; planos?: PlanoRegistro[]; parceiros?: OpcaoDeParceiro[]; /** só o laboratório: cadastros de mentira, sem ler o banco */ exemplo?: boolean}) {
  // os planos disponíveis desta marca (Administração > Planos); sem eles ainda, os de reserva
  const opcoesDePlano = planos?.length ? planos.filter(p => p.ativo) : PLANOS_CLIENTE
  const planoPadrao = planos?.find(p => p.padrao && p.ativo)?.id ?? 'essencial'
  const [status,setStatus]=useState('pendente')
  const [plano,setPlano]=useState('essencial')
  const [mostrar,setMostrar]=useState(POR_VEZ)
  const [busca,setBusca]=useState('')
  const [filtroParceiro,setFiltroParceiro]=useState('')
  const [filtroResp,setFiltroResp]=useState<''|Tipo>('')
  const [periodo,setPeriodo]=useState<Periodo>('')
  const [temperatura,setTemperatura]=useState('')
  const [produto,setProduto]=useState('')
  const [recadastro,setRecadastro]=useState<''|'sim'|'nao'>('')
  const [ordem,setOrdem]=useState<Ordem>('recentes')
  const [contagem,setContagem]=useState<Record<string,number>>({})
  // visão geral: todas as abas, uma pessoa por e-mail (vale o cadastro mais recente)
  const [geral,setGeral]=useState<{total:number;porParceiro:Record<string,number>;porStatus:Record<string,number>}|null>(null)
  const [lista,setLista]=useState<Pendente[]>([])
  const [erro,setErro]=useState('')
  const [aviso,setAviso]=useState('')
  const [ocupado,setOcupado]=useState<string|null>(null)
  const [carregando,setCarregando]=useState(true)
  const [revisao,setRevisao]=useState(0)
  const [confirmar,setConfirmar]=useState<{p:Pendente;acao:'aprovar'|'recusar'}|null>(null)
  // o parceiro escolhido na confirmação ('' = direto); começa no que o cadastro trouxe
  const [parceiro,setParceiro]=useState('')
  useEffect(()=>{ setParceiro(confirmar?.p.parceiro ?? '') },[confirmar?.p.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // o plano sugerido é o padrão da marca (o de quem se cadastra sozinho)
  useEffect(() => { setPlano(planoPadrao) }, [planoPadrao])
  // as respostas do questionário dos cadastros desta página (chave: e-mail em minúsculas)
  const [respostas,setRespostas]=useState<Map<string,Resposta>|null>(null)
  useEffect(()=>{
    setRespostas(null)
    if(exemplo){ void import('./pendentesDeExemplo').then(m=>setRespostas(m.respostasDeExemplo(lista))); return }
    const emails=[...new Set(lista.map(p=>p.email.trim().toLowerCase()).filter(Boolean))]
    if(!emails.length)return
    const c=new AbortController()
    // de 80 em 80 e-mails por pedido (o endereço não pode crescer sem fim)
    const lotes:string[][]=[]
    for(let i=0;i<emails.length;i+=80)lotes.push(emails.slice(i,i+80))
    Promise.all(lotes.map(lote=>{
      const em=lote.map(e=>`"${e.replace(/"/g,'')}"`).join(',')
      return fetch(`${SUPABASE.url}/rest/v1/leads_capturados?select=email,email_normalizado,ex_cliente,produtos_anteriores,questionario_em,tempo_na_pagina,temperatura&marca=eq.${encodeURIComponent(marca)}&email_normalizado=in.(${encodeURIComponent(em)})`,
        {headers:{apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`},signal:c.signal})
        .then(r=>r.ok?r.json():[])
    })).then((partes:any[][])=>{
        const l=partes.flat()
        const m=new Map<string,Resposta>()
        for(const x of l){
          const chave=String(x.email_normalizado||x.email||'').toLowerCase()
          const antes=m.get(chave)
          // o mesmo e-mail pode ter mais de uma linha: vale a que tem questionário respondido
          if(antes?.em&&!x.questionario_em)continue
          m.set(chave,{exCliente:x.ex_cliente??null,produtos:x.produtos_anteriores??[],em:x.questionario_em??null,tempo:x.tempo_na_pagina??null,temperatura:x.temperatura??null})
        }
        setRespostas(m)
      }).catch(()=>{ if(!c.signal.aborted)setRespostas(new Map()) })
    return()=>c.abort()
  },[lista,marca,sessao.token,exemplo])
  async function consultar(path: string, body?: unknown, signal?: AbortSignal) {
    // A marca vai nos dois sentidos: na busca e na decisão. Aprovar é o que
    // cria conta e dispara e-mail — não pode depender de qual site está aberto.
    const junta=path.includes('?')?'&':'?'
    const foco=parceiroEmFoco()
    const r=await fetch(`${SERVIDOR.url}/api/clientes-pendentes${path}${junta}marca=${encodeURIComponent(marca)}${foco?`&parceiro=${encodeURIComponent(foco)}`:''}`,{
      method:body?'POST':'GET',signal,
      headers:{Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify({...(body as object),marca})}:{}),
    })
    const d=await r.json()
    if(!r.ok)throw new Error(d.erro||'Não foi possível consultar as aprovações.')
    return d
  }
  const cabecalhos={apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`}
  // a aba inteira, direto do banco, de mil em mil
  async function lerTodos(st:string,signal:AbortSignal):Promise<Pendente[]>{
    const todos:Pendente[]=[]
    for(let de=0;;de+=LOTE){
      const r=await fetch(`${SUPABASE.url}/rest/v1/clientes_pendentes?marca=eq.${encodeURIComponent(marca)}&status=eq.${st}&select=${CAMPOS}&order=ultima_inscricao_em.desc,id.desc&limit=${LOTE}&offset=${de}`,{headers:cabecalhos,signal})
      if(!r.ok)throw new Error('Não foi possível ler os cadastros.')
      const l=await r.json() as Pendente[]
      todos.push(...l)
      if(l.length<LOTE)return todos
    }
  }
  // a reserva: o servidor, de 50 em 50, até a última página
  async function lerPeloServidor(st:string,signal:AbortSignal):Promise<Pendente[]>{
    const todos:Pendente[]=[]
    for(let pg=0;pg<400;pg++){
      const l=await consultar(`?status=${st}&pagina=${pg}`,undefined,signal) as Pendente[]
      todos.push(...l.slice(0,50))
      if(l.length<=50)break
    }
    return todos
  }
  useEffect(()=>{
    const c=new AbortController()
    setCarregando(true);setErro('');setLista([])
    if(exemplo){
      void import('./pendentesDeExemplo').then(m=>{const l=m.pendentesDeExemplo(status);setLista(l);setContagem({pendente:639,processando:1,aprovado:37,recusado:7,[status]:l.length});setGeral({total:671,porParceiro:{n:331,v:324,d:1,direto:15},porStatus:{pendente:639,aprovado:25,processando:1,recusado:6}});setCarregando(false)})
      return()=>c.abort()
    }
    lerTodos(status,c.signal).catch(e=>{if(c.signal.aborted)throw e;return lerPeloServidor(status,c.signal)})
      .then(l=>{setLista(l);setContagem(v=>({...v,[status]:l.length}))}).catch(e=>{if(!c.signal.aborted)setErro(e.message)})
      .finally(()=>{if(!c.signal.aborted)setCarregando(false)})
    // o número de cada aba e a visão geral, numa leitura só de todas as abas
    ;(async()=>{
      const todos:Array<{email:string;status:string;parceiro:string|null;ultima_inscricao_em:string|null;criado_em:string}>=[]
      for(let de=0;;de+=LOTE){
        const r=await fetch(`${SUPABASE.url}/rest/v1/clientes_pendentes?marca=eq.${encodeURIComponent(marca)}&select=email,status,parceiro,ultima_inscricao_em,criado_em&order=id&limit=${LOTE}&offset=${de}`,{headers:cabecalhos,signal:c.signal})
        if(!r.ok)return
        const l=await r.json();todos.push(...l)
        if(l.length<LOTE)break
      }
      const abas:Record<string,number>=Object.fromEntries(ABAS.map(([id])=>[id,0]))
      const pessoas=new Map<string,(typeof todos)[number]>()
      for(const x of todos){
        abas[x.status]=(abas[x.status]??0)+1
        const k=x.email.trim().toLowerCase(),antes=pessoas.get(k)
        const quando=(y:typeof x)=>new Date(y.ultima_inscricao_em||y.criado_em).getTime()
        if(!antes||quando(x)>quando(antes))pessoas.set(k,x)
      }
      const porParceiro:Record<string,number>={},porStatus:Record<string,number>={}
      for(const x of pessoas.values()){const pp=x.parceiro||'direto';porParceiro[pp]=(porParceiro[pp]??0)+1;porStatus[x.status]=(porStatus[x.status]??0)+1}
      setContagem(v=>({...abas,[status]:v[status]??abas[status]??0}))
      setGeral({total:pessoas.size,porParceiro,porStatus})
    })().catch(()=>undefined)
    return()=>c.abort()
  },[sessao.token,marca,status,versao,revisao]) // eslint-disable-line react-hooks/exhaustive-deps
  async function decidir() {
    if(!confirmar||ocupado)return
    const {p,acao}=confirmar
    setOcupado(p.id);setErro('');setAviso('')
    try {
      // o parceiro primeiro: se o banco recusar, nada foi aprovado ainda
      if(acao==='aprovar'&&parceiros.length&&parceiro!==(p.parceiro??'')){
        const t=await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_parceiro_na_aprovacao`,{method:'POST',
          headers:{apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`,'Content-Type':'application/json'},
          body:JSON.stringify({p_id:p.id,p_codigo:parceiro})})
        if(!t.ok){const d=await t.json().catch(()=>null);throw new Error(d?.message||'Não foi possível definir o parceiro. Nada foi aprovado.')}
      }
      const r=await consultar('',{id:p.id,acao,plano})
      const doParceiro=parceiros.length&&acao==='aprovar'?` Parceiro: ${seloDoParceiro(parceiros,parceiro||null)?.texto}.`:''
      setAviso(r.status==='aprovado'?`Cadastro aprovado. O e-mail de acesso entrou na fila de envio.${doParceiro}`:'Cadastro recusado. O pedido foi guardado e nenhum e-mail foi enviado.')
      setConfirmar(null);setRevisao(v=>v+1)
      if(r.status==='aprovado')onAprovado()
    }catch(e){setErro((e as Error).message)}finally{setOcupado(null)}
  }
  /*
    Lançamento da GF (03/11/2026, Tiago: "achei que eu precisasse aprovar para ela receber que o
    cadastro está ok"): até o fim da live o cadastro já é a conta. A pessoa recebeu "Inscrição
    confirmada" com o acesso, entra com a senha que criou e vê a plataforma trancada; o acesso abre
    sozinho às 20h30 de 09/11. Aprovar antes só mandaria "cadastro aprovado" (até 20h30 todo cliente que
    não é administrador fica trancado), então o botão sai da frente.
  */
  const naLive = marca === 'globalfly' && Date.now() < FIM_DA_LIVE
  // filtros: parceiro (só o admin geral, sem parceiro em foco no topo), resposta do questionário e busca
  const chaveDe=(p:Pendente)=>p.email.trim().toLowerCase()
  const tipoDe=(p:Pendente):Tipo=>{const r=respostas?.get(chaveDe(p));return !r?.em?'sem':r.exCliente?'ex':'novo'}
  const mostraParceiros=parceiros.length>0&&!parceiroEmFoco()
  const doParceiro=(p:Pendente,f:string)=>!f||(f==='direto'?!p.parceiro:p.parceiro===f)
  const base=lista.filter(p=>doParceiro(p,mostraParceiros?filtroParceiro:''))
  const termo=semAcento(busca.trim()),digitos=busca.replace(/\D/g,'')
  const casa=(p:Pendente)=>!termo||semAcento(p.nome).includes(termo)||p.email.toLowerCase().includes(termo)||(digitos.length>=3&&p.telefone.replace(/\D/g,'').includes(digitos))
  const quandoDe=(p:Pendente)=>new Date(p.ultima_inscricao_em||p.criado_em)
  const respDe=(p:Pendente)=>respostas?.get(chaveDe(p))
  const temperaturaDe=(p:Pendente)=>respDe(p)?.temperatura||'sem'
  const produtosDe=(p:Pendente)=>(respDe(p)?.produtos??[]).map(nomeDoGrupo)
  // cada filtro, separado, para as opções contarem quantos sobram mexendo só nele
  const filtros={
    periodo:(p:Pendente)=>noPeriodo(quandoDe(p),periodo),
    resp:(p:Pendente)=>!filtroResp||(respostas!==null&&tipoDe(p)===filtroResp),
    temperatura:(p:Pendente)=>!temperatura||(respostas!==null&&temperaturaDe(p)===temperatura),
    produto:(p:Pendente)=>!produto||(respostas!==null&&produtosDe(p).includes(produto)),
    recadastro:(p:Pendente)=>!recadastro||(recadastro==='sim')===!!p.recadastro,
    busca:casa,
  }
  type Filtro=keyof typeof filtros
  const passa=(p:Pendente,menos?:Filtro)=>(Object.keys(filtros) as Filtro[]).every(f=>f===menos||filtros[f](p))
  const contar=(menos:Filtro,igual:(p:Pendente)=>boolean)=>base.filter(p=>passa(p,menos)&&igual(p)).length
  const ordenar=(l:Pendente[])=>ordem==='recentes'?l:ordem==='antigos'?[...l].reverse()
    :ordem==='nome'?[...l].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    :[...l].sort((a,b)=>(respDe(b)?.tempo??-1)-(respDe(a)?.tempo??-1))
  const visiveis=ordenar(base.filter(p=>passa(p)))
  const filtrando=!!(busca.trim()||filtroResp||periodo||temperatura||produto||recadastro||(mostraParceiros&&filtroParceiro))
  const limpar=()=>{setBusca('');setFiltroResp('');setFiltroParceiro('');setPeriodo('');setTemperatura('');setProduto('');setRecadastro('');setMostrar(POR_VEZ)}
  const mudar=<T,>(f:(v:T)=>void)=>(v:T)=>{f(v);setMostrar(POR_VEZ)}
  // os produtos que aparecem nas respostas desta aba, do mais citado ao menos
  const produtosDaAba=(()=>{const m=new Map<string,number>();for(const p of base)for(const x of new Set(produtosDe(p)))m.set(x,(m.get(x)??0)+1);return [...m].sort((a,b)=>b[1]-a[1]).map(([n])=>n)})()
  const nomeDoParceiroNoFiltro=(id:string)=>id==='direto'?'Direto':(parceiros.find(o=>o.codigo===id)?.nome.split(' ')[0]??NOME_DO_PARCEIRO[id]??id)
  const ligados:Array<[string,()=>void]>=[
    ...(mostraParceiros&&filtroParceiro?[[`Parceiro: ${nomeDoParceiroNoFiltro(filtroParceiro)}`,()=>setFiltroParceiro('')] as [string,()=>void]]:[]),
    ...(periodo?[[PERIODOS.find(([v])=>v===periodo)![1],()=>setPeriodo('')] as [string,()=>void]]:[]),
    ...(filtroResp?[[RESPOSTAS.find(([v])=>v===filtroResp)![1],()=>setFiltroResp('')] as [string,()=>void]]:[]),
    ...(temperatura?[[`Lead ${TEMPERATURAS.find(([v])=>v===temperatura)![1].toLowerCase()}`,()=>setTemperatura('')] as [string,()=>void]]:[]),
    ...(produto?[[`Já usou: ${produto}`,()=>setProduto('')] as [string,()=>void]]:[]),
    ...(recadastro?[[recadastro==='sim'?'Só recadastros':'Sem recadastros',()=>setRecadastro('')] as [string,()=>void]]:[]),
    ...(busca.trim()?[[`Busca: ${busca.trim()}`,()=>setBusca('')] as [string,()=>void]]:[]),
  ]
  const baixar=()=>{
    const cel=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`
    const linhas=visiveis.map(p=>{const r=respDe(p),t=respostas?tipoDe(p):'sem'
      return [p.nome,p.email,p.telefone,p.parceiro?`${NOME_DO_PARCEIRO[p.parceiro]??p.parceiro} /${p.parceiro}`:'Direto',quandoDe(p).toLocaleString('pt-BR'),
        t==='ex'?'Já foi cliente':t==='novo'?'Nunca foi cliente':'Não respondeu',(r?.produtos??[]).map(nomeDoProduto).join(', '),r?.tempo?duracao(r.tempo):'',r?.temperatura?TEMPERATURA[r.temperatura]??r.temperatura:'',p.recadastro?'Sim':'Não'].map(cel).join(';')})
    const cab=['Nome','E-mail','Telefone','Parceiro','Último cadastro','Questionário','Produtos que já usou','Tempo na página','Temperatura','Recadastro'].map(cel).join(';')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([`\ufeff${cab}\n${linhas.join('\n')}`],{type:'text/csv;charset=utf-8'}))
    a.download=`cadastros-${marca}-${status}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)
  }
  const resumo=(()=>{
    const n={ex:0,novo:0,sem:0} as Record<Tipo,number>
    const conta=new Map<string,number>()
    const agora=new Date();let hoje=0
    for(const p of base){
      const t=tipoDe(p);n[t]++
      if(mesmoDia(new Date(p.ultima_inscricao_em||p.criado_em),agora))hoje++
      const r=respostas?.get(chaveDe(p))
      if(t==='ex'&&r)for(const pr of r.produtos){const nome=nomeDoProduto(pr.startsWith('outro: ')?'outro':pr);conta.set(nome,(conta.get(nome)??0)+1)}
    }
    return {n,hoje,top:[...conta].sort((a,b)=>b[1]-a[1]).slice(0,6)}
  })()
  const rotuloDoTotal=(q:number)=>status==='pendente'?(naLive?(q===1?'inscrito aguardando a live':'inscritos aguardando a live'):(q===1?'cadastro pendente':'cadastros pendentes')):status==='processando'?'em aprovação':status==='aprovado'?(q===1?'aprovado':'aprovados'):(q===1?'recusado':'recusados')
  type Chip=[string,string,number]
  const chipsDeParceiro:Chip[]=!mostraParceiros?[]:([['','Todos',lista.length] as Chip,...parceiros.map((o):Chip=>[o.codigo,o.nome.split(' ')[0],lista.filter(p=>p.parceiro===o.codigo).length]),['direto','Direto',lista.filter(p=>!p.parceiro).length] as Chip]).filter(([id,,q])=>id===''||q>0)
  return <section className="admin-card admin-pendentes">
    <header><div><span className="rot">Cadastros pelo formulário</span><h3>Aprovação de clientes <em className="pendente-marca">{NOME_DA_MARCA[marca] ?? marca}</em></h3><p>{naLive
      ? 'Até a live de 09/11 não precisa aprovar ninguém. Quem se inscreve já recebe a confirmação por e‑mail, entra com a senha que criou e vê a plataforma trancada, com a contagem. Em 09/11, às 20h30, todos viram GF Member sozinhos, com acesso até 09/11/2027.'
      : 'Novos cadastros e recadastros aguardam sua aprovação. Cada marca tem a sua conta: quem já é cliente de outra plataforma ganha uma conta nova aqui, com senha própria.'}</p></div><button disabled={!!ocupado||carregando} onClick={()=>setRevisao(v=>v+1)}>Atualizar</button></header>
    {geral&&geral.total>0&&<div className="pdq-geral" aria-label="Visão geral de todas as abas">
      <p><b>{geral.total}</b> {geral.total===1?'pessoa inscrita':'pessoas inscritas'} no total</p>
      <div className="pdq-geral-parceiros">{[...Object.keys(NOME_DO_PARCEIRO).filter(k=>geral.porParceiro[k]),...Object.keys(geral.porParceiro).filter(k=>k!=='direto'&&!NOME_DO_PARCEIRO[k]),...(geral.porParceiro.direto?['direto']:[])].map(k=><span key={k} className={k}><small>{k==='direto'?'Direto':`${NOME_DO_PARCEIRO[k]??k} /${k}`}</small><b>{geral.porParceiro[k]}</b></span>)}</div>
      <p className="pdq-geral-status">{[['pendente',naLive?'aguardando a live':'pendentes'],['aprovado','já aprovados'],['processando','em aprovação'],['recusado','recusados']].filter(([k])=>geral.porStatus[k]).map(([k,n])=>`${geral.porStatus[k]} ${n}`).join(' · ')}</p>
    </div>}
    <nav aria-label="Status da aprovação">{ABAS.map(([id,nome])=><button key={id} aria-pressed={status===id} disabled={!!ocupado} onClick={()=>{setStatus(id);setMostrar(POR_VEZ);setFiltroResp('');setConfirmar(null);setAviso('')}}>{nome}{contagem[id]!=null&&<span className="pdq-aba-n">{contagem[id]}</span>}</button>)}</nav>
    {erro&&<p role="alert">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
    {!carregando&&lista.length>0&&<div className="pdq-painel" aria-label="Resumo de todos os cadastros desta aba">
      <div className="pdq-topo">
        <p className="pdq-total"><b>{base.length}</b><span>{rotuloDoTotal(base.length)}</span>{resumo.hoje>0&&<button type="button" className="pdq-hoje" aria-pressed={periodo==='hoje'} title="Ver só os de hoje" onClick={()=>mudar(setPeriodo)(periodo==='hoje'?'':'hoje')}>+{resumo.hoje} hoje</button>}</p>
        {chipsDeParceiro.length>2&&<div className="pdq-chips" role="group" aria-label="Filtrar por parceiro">{chipsDeParceiro.map(([id,nome,q])=><button key={id||'todos'} aria-pressed={filtroParceiro===id} onClick={()=>{setFiltroParceiro(id);setMostrar(POR_VEZ)}}>{nome}<b>{q}</b></button>)}</div>}
      </div>
      {respostas?<>
        <div className="pdq-barra" aria-hidden="true">{(['ex','novo','sem'] as Tipo[]).map(t=>resumo.n[t]>0&&<i key={t} className={t} style={{flexGrow:resumo.n[t]}}/>)}</div>
        <div className="pdq-legenda" role="group" aria-label="Filtrar pela resposta do questionário">{([['ex','Já foram clientes'],['novo','Nunca foram clientes'],['sem','Não responderam']] as Array<[Tipo,string]>).map(([t,nome])=><button key={t} className={t} aria-pressed={filtroResp===t} disabled={!resumo.n[t]&&filtroResp!==t} onClick={()=>{setFiltroResp(v=>v===t?'':t);setMostrar(POR_VEZ)}}><i aria-hidden="true"/><b>{resumo.n[t]}</b>{nome}<small>{pct(resumo.n[t],base.length)}%</small></button>)}</div>
        {resumo.top.length>0&&<div className="pdq-top"><span>Mais citados por quem já foi cliente · toque para filtrar</span><div>{resumo.top.map(([n,q])=><button type="button" key={n} aria-pressed={produto===n} onClick={()=>mudar(setProduto)(produto===n?'':n)}>{n}<b>{q}</b></button>)}</div></div>}
      </>:<p className="pdq-lendo">Lendo as respostas do questionário…</p>}
    </div>}
    {!carregando&&lista.length>0&&<div className="pdq-filtros" role="search" aria-label="Filtrar cadastros">
      <div className="pdq-busca">
        <input id="pendentes-busca" type="search" value={busca} placeholder="Buscar: nome, e-mail ou telefone" aria-label="Buscar cadastro por nome, e-mail ou telefone" onChange={e=>{setBusca(e.target.value);setMostrar(POR_VEZ)}}/>
      </div>
      <div className="pdq-seletores">
        <label><span>Período</span><select className={periodo?'on':''} value={periodo} onChange={e=>mudar(setPeriodo)(e.target.value as Periodo)}>
          {PERIODOS.map(([v,n])=><option key={v||'todos'} value={v}>{n}{v?` (${contar('periodo',p=>noPeriodo(quandoDe(p),v))})`:''}</option>)}
        </select></label>
        {mostraParceiros&&<label><span>Parceiro</span><select className={filtroParceiro?'on':''} value={filtroParceiro} onChange={e=>mudar(setFiltroParceiro)(e.target.value)}>
          {chipsDeParceiro.map(([id,nome,q])=><option key={id||'todos'} value={id}>{id?`${nome} (${q})`:`Todos os parceiros (${q})`}</option>)}
        </select></label>}
        <label><span>Questionário</span><select className={filtroResp?'on':''} value={filtroResp} disabled={!respostas} onChange={e=>mudar(setFiltroResp)(e.target.value as ''|Tipo)}>
          <option value="">Todas as respostas</option>
          {RESPOSTAS.map(([v,n])=><option key={v} value={v}>{n} ({contar('resp',p=>tipoDe(p)===v)})</option>)}
        </select></label>
        <label><span>Temperatura</span><select className={temperatura?'on':''} value={temperatura} disabled={!respostas} onChange={e=>mudar(setTemperatura)(e.target.value)}>
          <option value="">Qualquer temperatura</option>
          {TEMPERATURAS.map(([v,n])=><option key={v} value={v}>{n} ({contar('temperatura',p=>temperaturaDe(p)===v)})</option>)}
        </select></label>
        <label><span>Já usou</span><select className={produto?'on':''} value={produto} disabled={!respostas||!produtosDaAba.length} onChange={e=>mudar(setProduto)(e.target.value)}>
          <option value="">Qualquer produto</option>
          {produtosDaAba.map(n=><option key={n} value={n}>{n} ({contar('produto',p=>produtosDe(p).includes(n))})</option>)}
        </select></label>
        <label><span>Recadastro</span><select className={recadastro?'on':''} value={recadastro} onChange={e=>mudar(setRecadastro)(e.target.value as ''|'sim'|'nao')}>
          <option value="">Todos</option>
          <option value="sim">Só recadastros ({contar('recadastro',p=>!!p.recadastro)})</option>
          <option value="nao">Sem recadastros ({contar('recadastro',p=>!p.recadastro)})</option>
        </select></label>
        <label><span>Ordem</span><select value={ordem} onChange={e=>setOrdem(e.target.value as Ordem)}>
          {ORDENS.map(([v,n])=><option key={v} value={v}>{n}</option>)}
        </select></label>
      </div>
      <div className="pdq-rodape-filtros">
        <span className="pdq-contagem" aria-live="polite"><b>{visiveis.length}</b> {visiveis.length!==base.length?`de ${base.length} cadastros`:visiveis.length===1?'cadastro':'cadastros'}</span>
        {ligados.length>0&&<div className="pdq-ligados">{ligados.map(([n,tirar])=><button type="button" key={n} onClick={()=>{tirar();setMostrar(POR_VEZ)}} aria-label={`Tirar o filtro ${n}`}>{n}<i aria-hidden="true">×</i></button>)}</div>}
        <div className="pdq-acoes-filtros">
          {filtrando&&<button type="button" onClick={limpar}>Limpar filtros</button>}
          <button type="button" disabled={!visiveis.length} onClick={baixar}>Baixar lista</button>
        </div>
      </div>
    </div>}
    {carregando?<p>Carregando cadastros…</p>:lista.length===0&&!erro?<p>Nenhum cadastro nesta situação.</p>:visiveis.length===0?<p className="pdq-nada">Nenhum cadastro com esses filtros. <button onClick={limpar}>Limpar filtros</button></p>:visiveis.slice(0,mostrar).map(p=><article key={p.id} className="pendente-linha">
      <div><b>{p.nome}</b><span>{p.email}</span><span>{p.telefone}</span>
        {p.recadastro&&<strong className="pendente-recadastro">Já estava na base: recadastro{p.status==='pendente'?' aguardando aprovação':''}</strong>}
      </div>
      {(()=>{
        const dono=p.parceiro?NOME_DO_PARCEIRO[p.parceiro]??(seloDoParceiro(parceiros,p.parceiro)?.texto.split(' ')[0]||p.parceiro):null
        const r=respostas?.get(p.email.trim().toLowerCase())
        const tipo=!respostas?'carregando':tipoDe(p)
        return <div className="pdq">
          <span className={`pdq-dono ${p.parceiro??'direto'}`}>{dono?`Cliente do ${dono}`:'Direto, sem parceiro'}{p.parceiro&&<small>/{p.parceiro}</small>}</span>
          <span className={`pdq-resp ${tipo}`}>{tipo==='carregando'?'Lendo o questionário…':tipo==='sem'?'Não respondeu o questionário':tipo==='ex'?`Já foi cliente ${dono?`do ${dono}`:'do ecossistema'}`:'Nunca foi cliente'}</span>
          {r?.em&&r.exCliente&&<span className="pdq-produtos">{r.produtos.length?r.produtos.map(x=><i key={x}>{nomeDoProduto(x)}</i>):<i className="vazio">Sem produto marcado</i>}</span>}
          {r&&<small className="pdq-detalhe">{[r.em&&`Respondeu em ${new Date(r.em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`, r.tempo?`${duracao(r.tempo)} na página`:null, r.temperatura?TEMPERATURA[r.temperatura]??null:null].filter(Boolean).join(' · ')}</small>}
        </div>
      })()}
      <div><small>Último cadastro: {new Date(p.ultima_inscricao_em||p.criado_em).toLocaleString('pt-BR')}</small><span>{p.status==='aprovado'?(p.email_enviado_em?'E-mail enviado':'E-mail na fila de envio'):p.status==='processando'?'Aprovação iniciada; pode ser retomada após dois minutos.':p.status==='recusado'?'Recusado':naLive?'Inscrito na live · confirmação enviada':'Pendente de aprovação'}</span></div>
      {['pendente','processando'].includes(p.status)&&confirmar?.p.id!==p.id&&<div className="pendente-acoes">{naLive&&p.status==='pendente'
        ? <span className="pendente-na-live">Libera sozinho em 09/11, 20h30</span>
        : <button disabled={!!ocupado} className="admin-primary" onClick={()=>setConfirmar({p,acao:'aprovar'})}>{p.status==='processando'?'Retomar aprovação':'Aprovar'}</button>}{p.status==='pendente'&&<button disabled={!!ocupado} onClick={()=>setConfirmar({p,acao:'recusar'})}>Recusar</button>}</div>}
      {/* A confirmação nasce na linha do próprio cadastro (29/10/2026): no topo
          da lista, quem clicava no 30º cadastro não via a pergunta. */}
      {confirmar?.p.id===p.id&&<div className="pendente-confirmar" role="group" aria-label={`Confirmar: ${confirmar.acao==='aprovar'?'aprovar':'recusar'} ${p.nome}`}>
        <b>{confirmar.acao==='aprovar'?'Aprovar':'Recusar'} {p.nome}?</b>
        {confirmar.acao==='aprovar' && (p.status==='pendente' || parceiros.length>0) && <div className="pendente-escolhas">
          {p.status==='pendente' && <label>Plano do cliente <select value={plano} disabled={!!ocupado} onChange={e=>setPlano(e.target.value)}>{opcoesDePlano.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>}
          {parceiros.length>0 && <label>Parceiro do cliente <select value={parceiro} disabled={!!ocupado} onChange={e=>setParceiro(e.target.value)}>
            <option value="">Direto (sem parceiro)</option>
            {parceiros.map(o=><option key={o.codigo} value={o.codigo}>{o.nome.split(' ')[0]} /{o.codigo}</option>)}
          </select></label>}
        </div>}
        {confirmar.acao==='aprovar' && parceiros.length>0 && <p className="pendente-dica">{p.parceiro ? `Veio pelo link /${p.parceiro}.` : 'Cadastrou-se sem /n nem /v.'} O parceiro escolhido fica na ficha: em aparelho que nunca abriu um link de parceiro, o cliente passa a entrar pela página dele, e as operações contam para ele.</p>}
        {/* Fiel a servidor/src/aprovacao-leads.ts (decidirLead) e à função teeds_finalizar_lead:
            o plano escolhido sempre passa a valer; situação e validade só mudam para quem estava em análise;
            a senha só é regravada (para a provisória) em conta que não tem senha própria do cadastro. */}
        <p>{confirmar.acao==='aprovar'
          ? 'O plano escolhido passa a valer e o cliente recebe o e-mail de aprovação. Quem criou a senha no cadastro continua com ela. Quem já tinha conta antes deste cadastro passa a entrar com a senha provisória do e-mail e cria uma nova no primeiro acesso: a senha antiga deixa de valer. Quem já tinha acesso liberado nesta plataforma mantém a situação e a validade atuais.'
          : 'Nenhum e-mail é enviado e o pedido fica guardado na aba Recusados. A conta criada no cadastro continua só com a tela de análise.'}</p>
        <div><button disabled={!!ocupado} onClick={()=>setConfirmar(null)}>Cancelar</button><button className="admin-primary" disabled={!!ocupado} onClick={()=>void decidir()}>{ocupado?'Processando…':confirmar.acao==='aprovar'?'Aprovar':'Recusar'}</button></div>
      </div>}
    </article>)}
    {!carregando&&visiveis.length>0&&<footer>
      <span>Mostrando {Math.min(mostrar,visiveis.length)} de {visiveis.length}</span>
      {visiveis.length>mostrar&&<><button onClick={()=>setMostrar(m=>m+POR_VEZ)}>Mostrar mais {Math.min(POR_VEZ,visiveis.length-mostrar)}</button>{visiveis.length-mostrar>POR_VEZ&&<button onClick={()=>setMostrar(visiveis.length)}>Mostrar todos</button>}</>}
    </footer>}
  </section>
}
