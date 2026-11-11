// Notificações no celular (Web Push), 27/10/2026.
//
// Ações (POST, JSON):
//   { acao: 'chave', marca }          a chave pública VAPID da plataforma (o app
//                                      precisa dela para inscrever o aparelho)
//   { acao: 'teste', marca }          com o token da pessoa: manda um aviso de
//                                      teste para os aparelhos dela
//   { acao: 'sessao', id }            do gatilho do banco (cabeçalho x-gatilho):
//                                      a sessão de I.A. terminou; avisa a pessoa
//   { acao: 'lancamento', etapa }     do carteiro do servidor (x-gatilho): os avisos
//                                      da live de 09/11 ('hoje', 'uma-hora', 'ao-vivo')
//   { acao: 'disparo', ... }          do painel (Administração › Notificações), com o
//                                      token do admin geral: título, texto, destino, público
//   { acao: 'comissao', ... }         do gatilho do banco (x-gatilho): uma sessão de I.A. ou uma operação
//                                      manual em conta real encerrou; avisa SÓ a administração a comissão gerada
//                                      (11/11/2026, substitui o antigo 'operacao_real')
//
// A chave VAPID de cada plataforma nasce aqui na primeira vez e fica em
// config_servicos (VAPID_<MARCA>), que só a chave de serviço lê. O segredo do
// gatilho (PUSH_GATILHO) foi criado pelo próprio banco. Nada disso sai daqui.

import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

async function lerConfig(chave: string): Promise<string | null> {
  const r = await rest(`config_servicos?chave=eq.${encodeURIComponent(chave)}&select=valor`)
  const l = r.ok ? await r.json() : []
  return l[0]?.valor ?? null
}

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A chave VAPID da plataforma; cria na primeira vez (a privada nunca sai do servidor). */
const MARCAS = new Set(['globalfly', 'teeds', 'omni'])
const cacheChaves = new Map<string, { publica: string; privada: string }>()
async function chaveDa(marca: string): Promise<{ publica: string; privada: string }> {
  const nome = `VAPID_${marca.toUpperCase()}`
  const pronta = cacheChaves.get(nome)
  if (pronta) return pronta
  let valor = await lerConfig(nome)
  if (!valor) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publica = b64url(await crypto.subtle.exportKey('raw', par.publicKey))
    const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d!
    // se duas instâncias criarem ao mesmo tempo, vale a primeira gravada
    await rest('config_servicos', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chave: nome, valor: JSON.stringify({ publica, privada }) }) })
    valor = await lerConfig(nome)
  }
  const chave = JSON.parse(valor!)
  cacheChaves.set(nome, chave)
  return chave
}

const SITE: Record<string, string> = { globalfly: 'https://globalflytrade.com' }

/** O depósito na Deriv: o MESMO endereço de DERIV.deposito (src/core/deriv/config.ts), obrigatório onde se fala em depositar. */
const DEPOSITO_DERIV = 'https://home.deriv.com/dashboard/deposit?from=home&depositSheet=1&returnTo=%2Fhome&currency=USD'

interface Aviso { titulo: string; corpo: string; tag: string; url?: string }

/** Manda para todos os aparelhos da pessoa naquela plataforma; tira os que não existem mais. */
async function enviar(userId: string, marca: string, aviso: Aviso): Promise<{ enviados: number; falhas: number; detalhes: string[] }> {
  const r = await rest(`push_assinaturas?user_id=eq.${userId}&marca=eq.${encodeURIComponent(marca)}&select=id,endpoint,p256dh,auth`)
  const lista: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = r.ok ? await r.json() : []
  if (!lista.length) return { enviados: 0, falhas: 0, detalhes: ['sem aparelhos inscritos'] }
  const chave = await chaveDa(marca)
  const vapidDetails = { subject: SITE[marca] ?? 'https://globalflytrade.com', publicKey: chave.publica, privateKey: chave.privada }
  let enviados = 0, falhas = 0
  const detalhes: string[] = []
  await Promise.all(lista.map(async (a) => {
    try {
      const res = await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(aviso), { TTL: 6 * 3600, urgency: 'high', vapidDetails })
      enviados++
      detalhes.push(`${new URL(a.endpoint).host} ${res.statusCode}`)
    } catch (e) {
      falhas++
      const status = (e as { statusCode?: number }).statusCode
      detalhes.push(`${(() => { try { return new URL(a.endpoint).host } catch { return '?' } })()} ${status ?? ''} ${String((e as Error).message ?? e).slice(0, 120)}`)
      // o aparelho tirou a permissão ou o navegador trocou a inscrição
      if (status === 404 || status === 410) await rest(`push_assinaturas?id=eq.${a.id}`, { method: 'DELETE' })
      else await rest(`push_assinaturas?id=eq.${a.id}`, { method: 'PATCH', body: JSON.stringify({ falhas: 1 }) })
    }
  }))
  return { enviados, falhas, detalhes }
}

/* ------------------------------------------------------------ as mensagens */

const dinheiro = (v: number, moeda: string) => {
  const f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${f}`
}

/** "12 min", "1 h 05 min", "menos de 1 min". */
function duracao(de: string | null, ate: string | null): string | null {
  if (!de || !ate) return null
  const min = Math.round((Date.parse(ate) - Date.parse(de)) / 60000)
  if (!Number.isFinite(min) || min < 0) return null
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/*
  As mensagens (29/10/2026, Tiago aprovou o mockup e pediu emoji: "e se colocar
  emoji nas ganhadoras? tipo aquele tickzinho verde"). Título curto e padronizado
  ("✅ GF Phenom · Meta atingida"), corpo com os números da sessão na 1ª linha e
  o que aconteceu na 2ª. O iPhone e o Android mostram emoji, mas não cor nem
  negrito: o "+" e o "−" do resultado fazem esse papel.
*/
function mensagemDaSessao(s: { id: string; marca: string; robo_nome: string | null; robo_id: string; resultado: number | null; moeda: string | null; motivo_da_parada: string | null; situacao: string; operacoes: number | null; ganhas: number | null; criada_em: string | null; encerrada_em: string | null; atualizada_em: string | null }): Aviso | null {
  const motivo = (s.motivo_da_parada ?? '').trim()
  if (/^você pediu para parar/i.test(motivo)) return null
  const gf = s.marca === 'globalfly'
  const nome = (s.robo_nome || s.robo_id || (gf ? 'A I.A.' : 'O robô')).trim()
  const quem = gf ? 'A I.A.' : 'O robô'
  const desligad = gf ? 'desligada' : 'desligado'
  const res = dinheiro(Number(s.resultado ?? 0), s.moeda ?? 'USD')
  const n = Number(s.operacoes ?? 0), g = Number(s.ganhas ?? 0)
  // 1ª linha: o resultado e as operações
  const numeros = n > 0
    ? `${res} em ${n} ${n === 1 ? 'operação' : 'operações'} · ${g} ${g === 1 ? 'positiva' : 'positivas'}`
    : `Resultado: ${res}`
  const tempo = duracao(s.criada_em, s.encerrada_em ?? s.atualizada_em)
  const base = { tag: `sessao-${s.id}`, url: './' }
  const aviso = (emoji: string, situacao: string, linha2: string, url?: string): Aviso =>
    ({ ...base, ...(url ? { url } : {}), titulo: `${emoji} ${nome} · ${situacao}`, corpo: `${numeros}\n${linha2}` })

  if (/meta de lucro atingida/i.test(motivo)) return aviso('✅', 'Meta atingida', `${tempo ? `Sessão de ${tempo} encerrada. ` : ''}${quem} já foi ${desligad}.`)
  if (/limite de perda protegido/i.test(motivo)) return aviso('🛡️', 'Limite protegido', 'A próxima entrada passaria do seu limite de perda. Parou antes.')
  if (/limite de perda/i.test(motivo)) return aviso('🛡️', 'Limite de perda', 'Parou no limite de perda que você definiu.')
  if (/limite de \d+ operações/i.test(motivo)) return aviso('🏁', 'Sessão concluída', 'Completou o número de operações que você definiu.')
  if (/InsufficientBalance|saldo/i.test(motivo)) return aviso('💳', 'Saldo insuficiente', 'A corretora recusou a próxima entrada por falta de saldo. Toque para depositar na Deriv.', DEPOSITO_DERIV)
  if (/Deriv recusou/i.test(motivo)) return aviso('⚠️', 'Entrada recusada', 'A corretora recusou a compra. Abra o app para ver o motivo.')
  if (/servidor foi reiniciado|manutenção/i.test(motivo)) return aviso('🔧', 'Sessão interrompida', `Houve uma manutenção na plataforma. Você pode ligar ${gf ? 'a I.A.' : 'o robô'} de novo quando quiser.`)
  if (/tabela de recupera/i.test(motivo)) return aviso('🛡️', 'Recuperação encerrada', `Chegou ao fim da recuperação e parou para proteger a conta. ${quem} já foi ${desligad}.`)
  // Motivo desconhecido: nunca o texto cru do motor para o cliente.
  return aviso('ℹ️', 'Sessão encerrada', s.situacao === 'erro' ? 'Parou por um erro. Abra o app para ver o resumo.' : 'A sessão foi encerrada. Abra o app para ver o resumo.')
}

/* ------------------------------------------------- a live de lançamento */

/*
  Live de lançamento da GlobalFly (02/11/2026, Tiago: "Ative as notificações...
  vai ser ativado pro cadastro dessa pessoa"). Os avisos do dia 09/11 vão para
  quem ainda espera a live: os aparelhos ativados na página de obrigado
  (lancamento_push, pelo e-mail) e os ativados dentro da plataforma
  (push_assinaturas, pela conta). Quem chama é o carteiro do servidor, com o
  segredo do gatilho, uma vez por etapa.
*/
const AVISOS_DA_LIVE: Record<string, { titulo: string; corpo: string }> = {
  hoje: { titulo: '✈️ A live é hoje, às 20h', corpo: 'Assista do início ao fim e a GlobalFly é liberada para você, sem pagar nada.' },
  'uma-hora': { titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h. Toque aqui na hora para entrar na transmissão.' },
  'ao-vivo': { titulo: '🔴 A live começou', corpo: 'Estamos ao vivo agora. Toque para assistir.' },
}
// 09/11/2026, dia da live (Tiago): a transmissão é fora da plataforma e todo aviso leva ao link dela.
// globalflytrade.com/live lê o link do momento no banco e segue para a transmissão.
const PAGINA_DA_LIVE = 'https://globalflytrade.com/live/'

interface Aparelho { tabela: 'lancamento_push' | 'push_assinaturas'; chave: string; endpoint: string; p256dh: string; auth: string; parceiro: string | null }

async function avisarALive(etapa: string): Promise<{ enviados: number; falhas: number; aparelhos: number }> {
  const texto = AVISOS_DA_LIVE[etapa]
  const marca = 'globalfly'
  // quem ainda espera a live
  const r = await rest(`clientes?marca=eq.${marca}&status_acesso=eq.pendente&plano_id=eq.globalfly-aguardando-live&select=user_id,email,parceiro&limit=20000`)
  const esperando: Array<{ user_id: string; email: string | null; parceiro: string | null }> = r.ok ? await r.json() : []
  const porEmail = new Map(esperando.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.parceiro]))
  const aparelhos = new Map<string, Aparelho>()
  const rp = await rest(`lancamento_push?marca=eq.${marca}&select=endpoint,email,parceiro,p256dh,auth&limit=20000`)
  for (const a of (rp.ok ? await rp.json() : []) as Array<{ endpoint: string; email: string; parceiro: string | null; p256dh: string; auth: string }>) {
    if (!porEmail.has(a.email.toLowerCase())) continue
    aparelhos.set(a.endpoint, { tabela: 'lancamento_push', chave: a.endpoint, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, parceiro: a.parceiro ?? porEmail.get(a.email.toLowerCase()) ?? null })
  }
  const parceiroDe = new Map(esperando.map((c) => [c.user_id, c.parceiro]))
  const ids = esperando.map((c) => c.user_id)
  for (let i = 0; i < ids.length; i += 100) {
    const rs = await rest(`push_assinaturas?marca=eq.${marca}&user_id=in.(${ids.slice(i, i + 100).join(',')})&select=id,user_id,endpoint,p256dh,auth`)
    for (const a of (rs.ok ? await rs.json() : []) as Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>) {
      aparelhos.set(a.endpoint, { tabela: 'push_assinaturas', chave: a.id, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, parceiro: parceiroDe.get(a.user_id) ?? null })
    }
  }
  const chave = await chaveDa(marca)
  const vapidDetails = { subject: SITE[marca], publicKey: chave.publica, privateKey: chave.privada }
  const lista = [...aparelhos.values()]
  let enviados = 0, falhas = 0
  for (let i = 0; i < lista.length; i += 50) {
    await Promise.all(lista.slice(i, i + 50).map(async (a) => {
      // o endereço do parceiro de cada um: /n/inicio, /v/inicio ou a raiz
      const url = etapa === 'uma-hora' || etapa === 'ao-vivo' ? PAGINA_DA_LIVE
        : `${SITE[marca]}/${PARCEIROS.has(a.parceiro ?? '') ? `${a.parceiro}/inicio` : ''}`
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify({ ...texto, tag: `live-${etapa}`, url }), { TTL: etapa === 'ao-vivo' ? 2 * 3600 : 6 * 3600, urgency: 'high', vapidDetails })
        enviados++
      } catch (e) {
        falhas++
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await rest(a.tabela === 'lancamento_push' ? `lancamento_push?endpoint=eq.${encodeURIComponent(a.chave)}` : `push_assinaturas?id=eq.${a.chave}`, { method: 'DELETE' })
        }
      }
    }))
  }
  return { enviados, falhas, aparelhos: lista.length }
}

/* ------------------------------------------------- disparo pelo painel */

/*
  Administração › Notificações (02/11/2026, Tiago: "um painel pra disparar
  notificações, personalizar cada uma, ver um preview, selecionar pra quem").
  Só o administrador geral. Quem recebe sai de teeds_push_destinos (banco); cada
  um abre o destino no endereço do próprio parceiro (/n, /v ou a raiz).
*/
// os códigos de src/marca/marcas.ts (parceiros da GlobalFly): /n Naor, /v Victor, /d Douglas
const PARCEIROS = new Set(['n', 'v', 'd'])
const TELAS = new Set(['inicio', 'aovivo', 'aulas', 'robos', 'operar', 'relatorios', 'gerenciamento', 'noticias'])
// as mesmas comunidades de src/marca/marcas.ts (comunidade e comunidadesDosParceiros da GlobalFly)
const COMUNIDADES: Record<string, string> = {
  n: 'https://chat.whatsapp.com/L3ITpIcORkG57tf1aIYnlp',
  v: 'https://chat.whatsapp.com/KWk0g33mPzYL6ZUqU89Xue',
  '': 'https://chat.whatsapp.com/CPBJlfpTpZy7u2N5VF9Drq',
}

function enderecoDoDestino(marca: string, destino: string, parceiro: string | null): string {
  const p = PARCEIROS.has(parceiro ?? '') ? parceiro! : ''
  if (destino === 'comunidade') return COMUNIDADES[p] ?? COMUNIDADES['']
  if (/^https:\/\//.test(destino)) return destino
  const tela = TELAS.has(destino) ? destino : 'inicio'
  const site = SITE[marca] ?? 'https://globalflytrade.com'
  if (p) return `${site}/${p}/${tela}`
  return tela === 'inicio' ? `${site}/` : `${site}/?tela=${tela}`
}

async function disparar(req: Request, corpo: Record<string, unknown>) {
  const marca = String(corpo.marca ?? '')
  if (!MARCAS.has(marca)) return json({ erro: 'Plataforma inválida.' }, 400)
  const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICO, Authorization: req.headers.get('Authorization') ?? '' } })
  if (!quem.ok) return json({ erro: 'Entre na sua conta.' }, 401)
  const u = await quem.json()
  // o admin geral, ou o admin do parceiro com acesso total, que dispara só para os clientes dele (05/11/2026)
  const adm = await rest(`administradores?user_id=eq.${u.id}&or=(marca.eq.${marca},marca.eq.teeds)&select=marca,parceiro,acesso_total,ve_parceiros`)
  const linhasAdm: Array<{ marca: string; parceiro: string | null; acesso_total: boolean; ve_parceiros: string[] | null }> = adm.ok ? await adm.json() : []
  const geral = linhasAdm.some((l) => !l.parceiro)
  const doParceiro = linhasAdm.find((l) => l.marca === marca && l.parceiro && l.acesso_total)
  if (!geral && !doParceiro) return json({ erro: 'Só a administração dispara notificações.' }, 403)

  const titulo = String(corpo.titulo ?? '').trim().slice(0, 70)
  const texto = String(corpo.corpo ?? '').trim().slice(0, 200)
  const destino = String(corpo.destino ?? 'inicio').trim().slice(0, 500)
  const publico = String(corpo.publico ?? '')
  // o admin do parceiro dispara para o dele, ou para outro da lista dele (08/11/2026: Victor vê /v e /n)
  const pedido = String(corpo.parceiro ?? '')
  const parceiro = !geral && doParceiro ? ((doParceiro.ve_parceiros ?? []).includes(pedido) && PARCEIROS.has(pedido) ? pedido : String(doParceiro.parceiro)) : PARCEIROS.has(String(corpo.parceiro ?? '')) || corpo.parceiro === 'direto' ? String(corpo.parceiro) : null
  if (!titulo || !texto) return json({ erro: 'Escreva o título e a mensagem.' }, 400)
  if (!['todos', 'aguardando', 'membros', 'ativos', 'eu'].includes(publico)) return json({ erro: 'Escolha para quem enviar.' }, 400)
  if (destino.startsWith('http') && !/^https:\/\//.test(destino)) return json({ erro: 'O link precisa começar com https://' }, 400)

  const rd = await rest('rpc/teeds_push_destinos', { method: 'POST', body: JSON.stringify({ p_marca: marca, p_publico: publico, p_parceiro: parceiro, p_eu: u.id }) })
  const lista: Array<{ tabela: string; chave: string; endpoint: string; p256dh: string; auth: string; parceiro: string | null; pessoa: string | null }> = rd.ok ? await rd.json() : []

  // Rastreio (02/11/2026, Tiago: "consigo rastrear quem recebeu e quem clicou?"): o disparo
  // nasce antes do envio e o número dele vai na notificação; o service worker do app avisa
  // o banco (teeds_push_evento) quando ela aparece e quando é tocada. Os aparelhos alcançados
  // ficam em push_disparo_destinos ANTES do envio, para o primeiro "recebeu" já encontrar a linha.
  const rc = await rest('push_disparos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    marca, criado_por: u.id, titulo, corpo: texto, destino, publico, parceiro, aparelhos: lista.length, teste: publico === 'eu',
  }) })
  const disparo: string | null = rc.ok ? (await rc.json())[0]?.id ?? null : null
  const aparelhoDe = new Map<string, string>()
  for (const a of lista) aparelhoDe.set(a.endpoint, await sha256(a.endpoint))
  if (disparo) {
    const linhas = lista.map((a) => ({ disparo, aparelho: aparelhoDe.get(a.endpoint), pessoa: a.pessoa }))
    for (let i = 0; i < linhas.length; i += 500) {
      await rest('push_disparo_destinos', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(linhas.slice(i, i + 500)) })
    }
  }
  const eco = disparo ? { disparo, eco: `${SUPABASE_URL}/rest/v1/rpc/teeds_push_evento`, eco_chave: Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '' } : {}

  const chave = await chaveDa(marca)
  const vapidDetails = { subject: SITE[marca] ?? 'https://globalflytrade.com', publicKey: chave.publica, privateKey: chave.privada }
  const tag = `painel-${Date.now()}`
  let enviados = 0, falhas = 0
  const falharam: string[] = []
  for (let i = 0; i < lista.length; i += 50) {
    await Promise.all(lista.slice(i, i + 50).map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify({ titulo, corpo: texto, tag, url: enderecoDoDestino(marca, destino, a.parceiro), ...eco }), { TTL: 12 * 3600, urgency: 'high', vapidDetails })
        enviados++
      } catch (e) {
        falhas++
        falharam.push(aparelhoDe.get(a.endpoint)!)
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await rest(a.tabela === 'lancamento_push' ? `lancamento_push?endpoint=eq.${encodeURIComponent(a.chave)}` : `push_assinaturas?id=eq.${a.chave}`, { method: 'DELETE' })
        }
      }
    }))
  }
  if (disparo) {
    // quem não recebeu não conta como alcançado
    for (let i = 0; i < falharam.length; i += 100) {
      await rest(`push_disparo_destinos?disparo=eq.${disparo}&aparelho=in.(${falharam.slice(i, i + 100).join(',')})`, { method: 'DELETE' })
    }
    await rest(`push_disparos?id=eq.${disparo}`, { method: 'PATCH', body: JSON.stringify({ enviados, falhas }) })
  }
  console.log('disparo', marca, publico, parceiro, { aparelhos: lista.length, enviados, falhas })
  return json({ aparelhos: lista.length, enviados, falhas })
}

async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ------------------------------------------- comissão gerada (só administração) */

/*
  11/11/2026 (Tiago: "a notificação que a gente tem que receber é bem simples. Comissão gerada, cliente tal,
  tantos dólares gerados de markup... nenhum cliente pode receber esse tipo de notificação"). Substitui o aviso
  de 09/11 ("uma comissão está sendo gerada", ao ligar). Agora avisa quando a operação ENCERRA: cada sessão de
  I.A. e cada operação manual em conta real, uma notificação por encerramento (ele escolheu assim sabendo que
  são ~600 por dia). Quem chama é o gatilho do banco (teeds_avisar_comissao), uma vez por encerramento.

  O markup é o mesmo da contagem oficial (teeds_markup_operacoes): na I.A., a soma de operacoes_robos.markup
  da sessão (só o que entrou depois do último aviso dela, se a sessão foi continuada); na manual, o markup da
  operação. Sem markup, sem aviso.

  QUEM RECEBE: só linhas de `administradores` da GF, cada um no seu escopo (o geral vê todos; o do parceiro, os
  clientes do parceiro dele e os de ve_parceiros). Nenhum cliente entra na lista: ela nasce da tabela de admins.
*/
const NOME_DO_PARCEIRO: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }
const UUID = /^[0-9a-f-]{36}$/i
const usdComissao = (v: number, moeda: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: moeda || 'USD', minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.01 ? 4 : 2,
}).format(v)

async function avisarComissao(corpo: Record<string, unknown>) {
  const userId = String(corpo.user_id ?? '')
  if (!UUID.test(userId)) return json({ erro: 'sem cliente' }, 400)
  const marca = 'globalfly'
  const origem = corpo.origem === 'manual' ? 'manual' : 'ia'
  let markup = 0, operacoes = 0
  let moeda = String(corpo.moeda ?? 'USD') || 'USD'
  let chave = ''
  if (origem === 'manual') {
    markup = Number(corpo.markup ?? 0)
    operacoes = 1
    chave = `m-${String(corpo.contract_id ?? Date.now())}`
  } else {
    const sessao = String(corpo.sessao_id ?? '')
    if (!UUID.test(sessao)) return json({ erro: 'sem sessão' }, 400)
    chave = `s-${sessao}-${Date.now()}`
    // as últimas operações da sessão são gravadas logo depois do encerramento: espera elas chegarem
    await new Promise((ok) => setTimeout(ok, 8000))
    // sessão continuada: conta só o que entrou depois do último aviso dela
    const rb = await rest(`avisos_comissao?chave=eq.${encodeURIComponent(`base:${sessao}`)}&select=avisado_em`)
    const base: string | null = rb.ok ? (await rb.json())[0]?.avisado_em ?? null : null
    const ro = await rest(`operacoes_robos?sessao_id=eq.${sessao}&demo=is.false&select=markup,moeda${base ? `&executada_em=gt.${encodeURIComponent(base)}` : ''}&limit=20000`)
    const ops: Array<{ markup: number | null; moeda: string | null }> = ro.ok ? await ro.json() : []
    markup = ops.reduce((t, o) => t + (Number(o.markup) || 0), 0)
    operacoes = ops.length
    if (ops[0]?.moeda) moeda = ops[0].moeda
    await rest('avisos_comissao?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ chave: `base:${sessao}`, avisado_em: new Date().toISOString() }) })
  }
  if (!(markup > 0)) { console.log('comissao', origem, 'sem markup'); return json({ enviados: 0, motivo: 'sem markup' }) }

  const rc = await rest(`clientes?user_id=eq.${userId}&marca=eq.${marca}&select=nome,parceiro`)
  const cliente: { nome: string | null; parceiro: string | null } | undefined = rc.ok ? (await rc.json())[0] : undefined
  const nome = (cliente?.nome ?? '').trim().split(/\s+/).slice(0, 2).join(' ') || 'Um cliente'
  const parceiro = cliente?.parceiro ?? null
  const robo = String(corpo.robo ?? '').trim()
  const deOnde = origem === 'manual'
    ? 'Operação manual'
    : `${robo ? `I.A. ${robo.replace(/^GF\s+/i, 'GF ')}` : 'I.A.'} · ${operacoes} ${operacoes === 1 ? 'operação' : 'operações'}`
  const aviso: Aviso = {
    titulo: '💰 Comissão gerada',
    corpo: `${nome} · ${usdComissao(markup, moeda)} de comissão\n${deOnde} · ${parceiro && NOME_DO_PARCEIRO[parceiro] ? `Cliente do ${NOME_DO_PARCEIRO[parceiro]}` : 'Cliente direto'}`,
    tag: `comissao-${chave}`, url: './',
  }
  // quem recebe: SÓ a administração da GF, cada um no seu escopo
  const ra = await rest(`administradores?marca=eq.${marca}&select=user_id,parceiro,ve_parceiros`)
  const admins: Array<{ user_id: string; parceiro: string | null; ve_parceiros: string[] | null }> = ra.ok ? await ra.json() : []
  let destino = [...new Set(admins.filter((a) => !a.parceiro || (parceiro && (a.parceiro === parceiro || (a.ve_parceiros ?? []).includes(parceiro)))).map((a) => a.user_id))]
  // teste: só para um admin (o pedido precisa vir com o segredo do gatilho, e a pessoa precisa estar na lista)
  const soPara = String(corpo.so_para ?? '')
  if (soPara) destino = destino.filter((id) => id === soPara)
  let enviados = 0
  for (const id of destino) enviados += (await enviar(id, marca, aviso)).enviados
  console.log('comissao', origem, parceiro, markup.toFixed(4), { admins: destino.length, enviados })
  return json({ admins: destino.length, enviados, markup })
}

/* ------------------------------------------------------------------ entrada */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405)
  let corpo: { acao?: string; marca?: string; id?: string }
  try { corpo = await req.json() } catch { return json({ erro: 'corpo inválido' }, 400) }

  if (corpo.acao === 'chave') {
    if (!corpo.marca || !MARCAS.has(corpo.marca)) return json({ erro: 'marca inválida' }, 400)
    return json({ chave: (await chaveDa(corpo.marca)).publica })
  }

  if (corpo.acao === 'teste') {
    if (!corpo.marca || !MARCAS.has(corpo.marca)) return json({ erro: 'marca inválida' }, 400)
    const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICO, Authorization: req.headers.get('Authorization') ?? '' } })
    if (!quem.ok) return json({ erro: 'Entre na sua conta.' }, 401)
    const u = await quem.json()
    const gf = corpo.marca === 'globalfly'
    const r = await enviar(u.id, corpo.marca, {
      titulo: '🔔 Notificações ligadas', tag: 'teste', url: './',
      corpo: gf ? 'Quando uma I.A. bater a meta ou parar, você fica sabendo aqui, mesmo com o app fechado.' : 'Quando um robô bater a meta ou parar, você fica sabendo aqui, mesmo com o app fechado.',
    })
    return json(r)
  }

  if (corpo.acao === 'disparo') return disparar(req, corpo as Record<string, unknown>)

  if (corpo.acao === 'lancamento') {
    const segredo = await lerConfig('PUSH_GATILHO')
    if (!segredo || req.headers.get('x-gatilho') !== segredo) return json({ erro: 'não autorizado' }, 401)
    const etapa = (corpo as { etapa?: string }).etapa ?? ''
    if (!AVISOS_DA_LIVE[etapa]) return json({ erro: 'etapa desconhecida' }, 400)
    const r = await avisarALive(etapa)
    console.log('lancamento', etapa, r)
    return json(r)
  }

  if (corpo.acao === 'comissao') {
    const segredo = await lerConfig('PUSH_GATILHO')
    if (!segredo || req.headers.get('x-gatilho') !== segredo) return json({ erro: 'não autorizado' }, 401)
    return avisarComissao(corpo as Record<string, unknown>)
  }

  if (corpo.acao === 'sessao') {
    const segredo = await lerConfig('PUSH_GATILHO')
    if (!segredo || req.headers.get('x-gatilho') !== segredo) return json({ erro: 'não autorizado' }, 401)
    if (!corpo.id) return json({ erro: 'sem sessão' }, 400)
    // o motivo pode chegar numa gravação logo depois da troca de situação
    await new Promise((ok) => setTimeout(ok, 1500))
    const r = await rest(`sessoes_robos?id=eq.${corpo.id}&select=id,user_id,marca,robo_nome,robo_id,resultado,moeda,motivo_da_parada,situacao,operacoes,ganhas,criada_em,encerrada_em,atualizada_em`)
    const s = r.ok ? (await r.json())[0] : null
    if (!s) return json({ erro: 'sessão não encontrada' }, 404)
    const aviso = mensagemDaSessao(s)
    if (!aviso) return json({ enviados: 0, motivo: 'a pessoa parou' })
    const res = await enviar(s.user_id, s.marca, aviso)
    console.log('sessao', s.id, s.marca, res)
    return json(res)
  }

  return json({ erro: 'ação desconhecida' }, 400)
})
