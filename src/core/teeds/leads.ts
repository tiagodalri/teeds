import { SUPABASE, SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { origemDoVisitante, visitante } from './visitas'
export interface LeadCapturado { pagina:string|null;id:string;nome:string;email:string;telefone:string;campanha:string|null;origem:string|null;meio:string|null;temperatura:'frio'|'morno'|'quente';pontuacao:number;tempo:number;profundidade:number;visitas:number;convertidoEm:string }
export async function listarLeads(sessao:SessaoTeeds):Promise<LeadCapturado[]>{const h={apikey:SUPABASE.anonKey,Authorization:`Bearer ${sessao.token}`};const r=await fetch(`${SUPABASE.url}/rest/v1/leads_capturados?select=*&marca=eq.${MARCA.id}&order=convertido_em.desc&limit=2000`,{headers:h});if(r.ok)return(await r.json()).map((l:any)=>({pagina:l.pagina??null,id:l.id,nome:l.nome,email:l.email,telefone:l.telefone,campanha:l.campanha,origem:l.origem,meio:l.meio,temperatura:l.temperatura,pontuacao:l.pontuacao,tempo:l.tempo_na_pagina,profundidade:l.profundidade,visitas:l.visitas,convertidoEm:l.convertido_em}));const a=await fetch(`${SUPABASE.url}/rest/v1/auditoria_admin?select=id,detalhes,criado_em&marca=eq.${MARCA.id}&acao=eq.lead_capturado&order=criado_em.desc&limit=2000`,{headers:h});if(!a.ok)throw new Error('Não foi possível carregar os interessados.');return(await a.json()).map((x:any)=>{const l=x.detalhes||{};return{pagina:l.pagina??null,id:String(x.id),nome:l.nome,email:l.email,telefone:l.telefone,campanha:l.campanha,origem:l.origem,meio:l.meio,temperatura:l.temperatura||'morno',pontuacao:l.pontuacao||50,tempo:l.tempo_na_pagina||0,profundidade:l.profundidade||0,visitas:l.visitas||1,convertidoEm:x.criado_em}})}

export interface DadosFilaEspera { nome: string; email: string; telefone: string; consentiu: boolean }
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
export async function inscreverFilaEspera(dados: DadosFilaEspera): Promise<void> {
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
  const r = await fetch(`${SERVIDOR.url}/publico/leads`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), telefone: dados.telefone,
      consentiu: dados.consentiu === true, marca: MARCA.id, pagina: pagina.href,
      origem: utm.get('utm_source'), campanha: utm.get('utm_campaign'), meio: utm.get('utm_medium'),
      conteudo: utm.get('utm_content'), termo: utm.get('utm_term'),
      tempo: 0, profundidade: 0, visitas: 1,
    }),
  })
  if (!r.ok) throw new Error('Não foi possível enviar seu cadastro. Tente novamente em instantes.')
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
