// Central ao vivo › Simulação › Blocos de mensagens (09/11/2026, Tiago: "coloco o tema, descrevo como quero
// as mensagens, seleciono quantas, gero com IA e aprovo; ficam em stand-by e eu dou o play").
//
// POST { marca, nome, descricao, exemplos?, quantidade, evitar? } com o token de alguém da equipe da marca
//   → { mensagens: string[] }   (nada é gravado aqui: a tela mostra para revisar e quem aprova é a pessoa)
//
// A chave da I.A.: desde 24/11/2026 (Tiago: "a Anthropic pede verificação de identidade; use a chave gratuita do
// Gemini por enquanto") vai primeiro a do Gemini (GEMINI_API_KEY em config_servicos, a mesma da Inteligência do
// negócio); sem ela, ou se o Gemini falhar, a da Anthropic (ANTHROPIC_API_KEY ou o segredo das funções).
// Nunca volta para a tela.

import Anthropic from 'npm:@anthropic-ai/sdk'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODELO = 'claude-sonnet-5-5'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const rest = (caminho: string) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, { headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` } })

async function chaves(): Promise<{ anthropic: string; gemini: string }> {
  const r = await rest('config_servicos?chave=in.(ANTHROPIC_API_KEY,GEMINI_API_KEY)&select=chave,valor')
  const linhas = (r.ok ? await r.json() : []) as Array<{ chave: string; valor: string | null }>
  const de = (c: string) => (linhas.find((l) => l.chave === c)?.valor ?? '').trim()
  return { anthropic: de('ANTHROPIC_API_KEY') || (Deno.env.get('ANTHROPIC_API_KEY') ?? ''), gemini: de('GEMINI_API_KEY') }
}

/* ------------------------------------------------------------------ o Gemini (faixa gratuita do Google) */
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
// o mais rápido primeiro (o Flash-Lite responde em ~7 s; o 3.8 Flash vive com 503 de "high demand", visto nas leituras
// do negócio de 17/11); sem cota (429), sobrecarregado (503) ou fora (404): tenta o seguinte
const MODELOS_GEMINI = ['gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-3.8-flash']
const ESQUEMA = { type: 'object', properties: { mensagens: { type: 'array', items: { type: 'string' } } }, required: ['mensagens'] }
const PRAZO_TOTAL = 120_000

async function gerarNoGemini(chave: string, sistema: string, pedido: string, quantidade: number): Promise<unknown[]> {
  const inicio = Date.now()
  const resta = () => PRAZO_TOTAL - (Date.now() - inicio)
  let ultimo = ''
  for (const modelo of MODELOS_GEMINI) {
    for (const comEsquema of [true, false]) {
      if (resta() < 8_000) throw new Error(ultimo || 'gemini: sem tempo')
      const prazo = new AbortController()
      const relogio = setTimeout(() => prazo.abort(), Math.min(60_000, resta() - 2_000))
      const r = await fetch(`${GEMINI}/interactions`, {
        method: 'POST', signal: prazo.signal, headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo, store: false,
          system_instruction: comEsquema ? sistema : `${sistema}\n\nResponda SÓ com um objeto JSON neste formato: {"mensagens": ["...", "..."]}`,
          input: pedido,
          response_format: comEsquema ? { type: 'text', mime_type: 'application/json', schema: ESQUEMA } : { type: 'text', mime_type: 'application/json' },
          generation_config: { max_output_tokens: Math.min(16000, 800 + quantidade * 120), thinking_level: 'low' },
        }),
      }).catch((e) => ({ ok: false, status: (e as Error)?.name === 'AbortError' ? 'prazo' : 'rede', json: async () => ({}) }) as unknown as Response)
      clearTimeout(relogio)
      const d = await r.json().catch(() => ({})) as Record<string, any>
      if (r.ok) {
        const texto = ((d.steps ?? []) as any[]).filter((p) => p?.type === 'model_output')
          .flatMap((p) => (p.content ?? []) as any[]).filter((c) => c?.type === 'text').map((c) => String(c.text ?? '')).join('')
        try {
          const j = JSON.parse(texto.replace(/^```(json)?|```$/g, '').trim())
          const lista = Array.isArray(j) ? j : j?.mensagens
          if (Array.isArray(lista) && lista.length) return lista
        } catch { /* veio quebrado: tenta o próximo */ }
        ultimo = `gemini ${modelo}: resposta sem mensagens`
        break
      }
      ultimo = `gemini ${r.status}: ${String(d?.error?.message ?? '').slice(0, 160)}`
      if (r.status === 400 && comEsquema) continue              // tenta sem o esquema
      if (r.status === 401 || r.status === 403) throw new Error(ultimo)   // chave recusada
      break                                                     // 404, 429, 5xx, prazo: próximo modelo
    }
  }
  throw new Error(ultimo || 'gemini: sem resposta')
}

async function souEquipe(apikey: string, token: string, marca: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_sou_equipe_da`, {
    method: 'POST', headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca }),
  })
  return r.ok && (await r.json()) === true
}

const PLATAFORMA: Record<string, { nome: string; ias: string }> = {
  globalfly: { nome: 'GlobalFly Trade', ias: 'Na GlobalFly as estratégias automáticas se chamam "I.A." (a I.A., as I.A.), nunca "robô".' },
  omni: { nome: 'OMNI', ias: 'As estratégias automáticas da plataforma são chamadas de robôs.' },
  teeds: { nome: 'Teeds', ias: 'As estratégias automáticas da plataforma são chamadas de robôs.' },
}

// as palavras que a I.A. nunca usa (memória da linguagem dos robôs)
const PROIBIDAS = '"aposta", "apostar", "sorte", "chute" ou "jogar"' // texto-ok: é a lista do que é proibido
const limpar = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const marca = limpar(corpo.marca, 30)
  if (!PLATAFORMA[marca]) return json({ erro: 'Plataforma desconhecida.' }, 400)
  if (!token || !(await souEquipe(apikey, token, marca))) return json({ erro: 'Só a equipe da plataforma gera mensagens do chat.' }, 403)

  const nome = limpar(corpo.nome, 120)
  const descricao = String(corpo.descricao ?? '').trim().slice(0, 2000)
  const exemplos = String(corpo.exemplos ?? '').trim().slice(0, 4000)
  const quantidade = Math.max(1, Math.min(100, Math.round(Number(corpo.quantidade) || 30)))
  const evitar = (Array.isArray(corpo.evitar) ? corpo.evitar : []).map((x) => limpar(x, 200)).filter(Boolean).slice(-150)
  if (!descricao && !nome) return json({ erro: 'Dê um nome ao bloco ou descreva o tipo de mensagem.' }, 400)

  const chave = await chaves()
  if (!chave.gemini && !chave.anthropic) return json({ erro: 'A chave da I.A. não está configurada (Administração › Anúncios › Leitura da I.A.).' }, 503)

  const p = PLATAFORMA[marca]
  const sistema = `Você escreve mensagens de chat de uma live de operações no mercado da plataforma ${p.nome} (corretora Deriv), em português do Brasil.
Cada mensagem é de uma pessoa diferente do público, digitando no celular durante a live. ${p.ias}

Como gente de verdade escreve em chat de live:
- tamanhos bem variados: de uma palavra a uma frase de umas 15 palavras; a maioria curta;
- misture maiúsculas e minúsculas: muitas começam com letra minúscula, algumas inteiras em minúsculo, poucas com a primeira maiúscula, raríssimas em caixa alta;
- pontuação irregular: a maioria SEM ponto final e SEM exclamação; algumas com "!!" ou "?"; nunca todas iguais;
- abreviações comuns às vezes (vc, tb, pq, mt, blz, q, hj, tmj, pra), às vezes sem acento, de vez em quando um errinho de digitação;
- emoji só em poucas, e risada (kkk, kkkk, rsrs) só em algumas;
- nenhuma mensagem repetida nem com a mesma estrutura de outra; não comece várias do mesmo jeito.

Nunca:
- use ${PROIBIDAS} para falar de operar;
- prometa ganho garantido ou diga que é dinheiro fácil;
- escreva nome de pessoa como autor, numeração, aspas em volta ou explicação: só o texto da mensagem.

O pedido de quem organiza a live vale mais que estas dicas de estilo: siga o que a descrição pede.`

  const pedido = [
    `Tema do bloco: ${nome || '(sem nome)'}`,
    descricao && `Como devem ser as mensagens:\n${descricao}`,
    exemplos && `Exemplos reais do tom desejado (inspire-se, não copie):\n${exemplos}`,
    evitar.length && `Já existem estas mensagens no bloco; não repita nem parafraseie de perto:\n${evitar.map((m) => `- ${m}`).join('\n')}`,
    `Escreva exatamente ${quantidade} mensagens diferentes.`,
  ].filter(Boolean).join('\n\n')

  const vistas = new Set(evitar.map((m) => m.toLowerCase()))
  const arrumar = (lista: unknown[]) => {
    const mensagens: string[] = []
    for (const m of lista) {
      const t = limpar(m, 300).replace(/^["“]|["”]$/g, '')
      if (!t || vistas.has(t.toLowerCase())) continue
      vistas.add(t.toLowerCase()); mensagens.push(t)
    }
    return mensagens.slice(0, quantidade)
  }
  let falhaDoGemini = ''
  if (chave.gemini) {
    try {
      const mensagens = arrumar(await gerarNoGemini(chave.gemini, sistema, pedido, quantidade))
      if (mensagens.length) return json({ mensagens, motor: 'gemini' })
      falhaDoGemini = 'O Gemini não devolveu mensagens.'
    } catch (e) { falhaDoGemini = e instanceof Error ? e.message : String(e) }
    console.log('chat-blocos: gemini falhou', falhaDoGemini)
    if (!chave.anthropic) return json({ erro: 'A I.A. não respondeu agora. Tente de novo em instantes.' }, 502)
  }

  try {
    const ia = new Anthropic({ apiKey: chave.anthropic })
    const r = await ia.messages.create({
      model: MODELO,
      max_tokens: Math.min(16000, 600 + quantidade * 90),
      system: sistema,
      tools: [{
        name: 'entregar_mensagens',
        description: 'Entrega as mensagens do chat, uma por item, só o texto.',
        input_schema: { type: 'object', properties: { mensagens: { type: 'array', items: { type: 'string' } } }, required: ['mensagens'] },
      }],
      tool_choice: { type: 'tool', name: 'entregar_mensagens' },
      messages: [{ role: 'user', content: pedido }],
    })
    const uso = r.content.find((b) => b.type === 'tool_use') as { input?: { mensagens?: unknown[] } } | undefined
    const mensagens = arrumar(uso?.input?.mensagens ?? [])
    if (!mensagens.length) return json({ erro: 'A I.A. não devolveu mensagens. Tente de novo.' }, 502)
    return json({ mensagens, motor: 'anthropic' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log('chat-blocos: anthropic falhou', msg.slice(0, 300))
    // a mensagem crua da API (em inglês, com JSON) não vai para a tela
    return json({ erro: falhaDoGemini ? 'A I.A. não respondeu agora. Tente de novo em instantes.' : 'A I.A. não respondeu agora (a chave da Anthropic foi recusada). Tente de novo em instantes.' }, 502)
  }
})
