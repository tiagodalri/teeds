import { SUPABASE, SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { origemDoVisitante, visitante } from './visitas'
import { paginaComParceiro } from './parceiro'
export interface LeadCapturado { pagina:string|null;id:string;nome:string;email:string;telefone:string;campanha:string|null;origem:string|null;meio:string|null;temperatura:'frio'|'morno'|'quente';pontuacao:number;tempo:number;profundidade:number;visitas:number;convertidoEm:string;exCliente:boolean|null;produtosAnteriores:string[] }
export async function listarLeads(sessao:SessaoTeeds,marca:string=MARCA.id):Promise<LeadCapturado[]>{const h={apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`};const r=await fetch(`${SUPABASE.url}/rest/v1/leads_capturados?select=*&marca=eq.${encodeURIComponent(marca)}&order=convertido_em.desc&limit=2000`,{headers:h});if(r.ok)return(await r.json()).map((l:any)=>({pagina:l.pagina??null,id:l.id,nome:l.nome,email:l.email,telefone:l.telefone,campanha:l.campanha,origem:l.origem,meio:l.meio,temperatura:l.temperatura,pontuacao:l.pontuacao,tempo:l.tempo_na_pagina,profundidade:l.profundidade,visitas:l.visitas,convertidoEm:l.convertido_em,exCliente:l.ex_cliente??null,produtosAnteriores:l.produtos_anteriores??[]}));const a=await fetch(`${SUPABASE.url}/rest/v1/auditoria_admin?select=id,detalhes,criado_em&marca=eq.${encodeURIComponent(marca)}&acao=eq.lead_capturado&order=criado_em.desc&limit=2000`,{headers:h});if(!a.ok)throw new Error('Não foi possível carregar os interessados.');return(await a.json()).map((x:any)=>{const l=x.detalhes||{};return{pagina:l.pagina??null,id:String(x.id),nome:l.nome,email:l.email,telefone:l.telefone,campanha:l.campanha,origem:l.origem,meio:l.meio,temperatura:l.temperatura||'morno',pontuacao:l.pontuacao||50,tempo:l.tempo_na_pagina||0,profundidade:l.profundidade||0,visitas:l.visitas||1,convertidoEm:x.criado_em,exCliente:null,produtosAnteriores:[]}})}

/**
 * Senha criada no cadastro (28/10/2026). Fica DESLIGADA até o servidor rodar o código
 * que aceita a senha (aprovacao-leads.ts, contaComSenhaPropria): sem ele, a senha
 * digitada seria ignorada e a conta nasceria com a provisória. Ligar junto com a
 * chave GF.SENHA de captura-globalfly/captura.js, e só depois de reiniciar o servidor.
 */
export const SENHA_NO_CADASTRO = true

export interface DadosFilaEspera { nome: string; email: string; telefone: string; consentiu: boolean; senha?: string }
/** O que o servidor fez com a conta (28/10/2026): criada com a senha da pessoa, já existia, ou ficou para a provisória. */
export type ContaDoCadastro = 'criada' | 'existente' | 'provisoria'
/*
  DE ONDE O CADASTRO VEIO (corrigido em 07/10/2026).

  Os 48 cadastros feitos até aqui pela tela de login chegaram SEM origem.
  O registro de visita (visitas.ts) lê a UTM ao abrir o site, guarda no
  navegador e LIMPA a barra de endereço, de propósito. Este formulário lia a
  UTM da barra de endereço, que a essa altura já estava limpa. Resultado:
  toda campanha virava "vazio", a do Telegram e a do e-mail.

  Agora a origem vem do mesmo lugar que a visita usa (`origemDoVisitante`),
  e o id anônimo do navegador vai junto na página gravada: com ele, cada
  cadastro se liga às visitas que vieram antes, mesmo de dias atrás.
*/
export async function inscreverFilaEspera(dados: DadosFilaEspera): Promise<ContaDoCadastro> {
  const pagina = new URL(location.href)
  pagina.searchParams.set('origem_cadastro', 'login')
  const daBarra = new URLSearchParams(location.search)
  const guardada = origemDoVisitante()
  // A barra de endereço ganha se ainda tiver a marcação (nada a perder);
  // senão, vale a origem guardada desde a chegada.
  const utm = {
    get: (k: 'utm_source' | 'utm_campaign' | 'utm_medium' | 'utm_content' | 'utm_term') =>
      daBarra.get(k) || ({ utm_source: guardada.origem, utm_campaign: guardada.campanha, utm_medium: guardada.meio,
        utm_content: guardada.conteudo ?? '', utm_term: guardada.termo ?? '' })[k] || null,
  }
  try { pagina.searchParams.set('visitante', visitante()) } catch { /* sem armazenamento: segue sem a ligação */ }
  if (guardada.referencia && !utm.get('utm_source')) pagina.searchParams.set('referencia', guardada.referencia)
  // 27/10/2026: o parceiro do link (/n, /v) vai na frente do endereço; o banco lê de lá
  const paginaFinal = paginaComParceiro(pagina)
  const r = await fetch(`${SERVIDOR.url}/publico/leads`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), telefone: dados.telefone,
      consentiu: dados.consentiu === true, marca: MARCA.id, pagina: paginaFinal.href,
      ...(dados.senha ? { senha: dados.senha } : {}),
      origem: utm.get('utm_source'), campanha: utm.get('utm_campaign'), meio: utm.get('utm_medium'),
      conteudo: utm.get('utm_content'), termo: utm.get('utm_term'),
      tempo: 0, profundidade: 0, visitas: 1,
    }),
  }).catch(() => {
    // sem rede o navegador rejeita com "Load failed"/"Failed to fetch", em inglês (29/10/2026)
    throw new Error('Sem conexão agora. Confira a internet e tente de novo.')
  })
  const corpo = await r.json().catch(() => ({})) as { erro?: string; conta?: ContaDoCadastro }
  if (!r.ok) throw new Error(r.status === 400 && corpo.erro ? corpo.erro : 'Não foi possível enviar seu cadastro. Tente novamente em instantes.')
  return corpo.conta === 'criada' || corpo.conta === 'existente' ? corpo.conta : 'provisoria'
}
export function origemCadastro(pagina: string | null): string {
  if (!pagina) return 'Não identificada'
  try {
    const url = new URL(pagina)
    if (url.searchParams.get('origem_cadastro') === 'login') return 'Tela de login'
    if (/^\/cadastro(?:\/|$)/.test(url.pathname) || url.hostname.startsWith('cadastro.')) return 'Página /cadastro'
  } catch { /* Registros antigos podem não conter uma URL válida. */ }
  return 'Não identificada'
}

/** Os produtos do questionário da GlobalFly (cadastro -> questionário), com o nome que a pessoa viu. */
const PRODUTOS_ANTERIORES:Record<string,string>={b3:'B3',fast:'Universidade Trading (Fast)',calculadora_fast:'Calculadora Fast',stark:'Stark / Starkbot',plano_socio:'Plano Sócio',mentoria:'Mentoria',grande_revolucao:'A Grande Revolução',outro:'Outro'}
export function respostaDoQuestionario(l:LeadCapturado):string|null{if(l.exCliente===null)return null;if(!l.exCliente)return 'Novo, nunca foi cliente';return 'Ex-cliente: '+(l.produtosAnteriores.map(p=>p.startsWith('outro: ')?p.slice(7):PRODUTOS_ANTERIORES[p]??p).join(', ')||'sem produto marcado')}
