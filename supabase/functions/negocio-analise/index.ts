// Visão geral › Inteligência do negócio › Recomendações da I.A. (16/11/2026, Tiago: "como a gente tem a
// inteligência artificial integrada no nosso sistema, eu quero que tenha algumas recomendações geradas pela
// IA sobre dicas que eu tenho que seguir para aumentar o markup. Por exemplo, indicar determinado horário,
// determinada inteligência artificial, determinada estratégia... quais foram as lives que renderam mais").
//
// POST { marca, parceiro, acao, ... } com o token de um administrador pleno da marca:
//   ultima   { periodo }                       a última leitura desse recorte (marca + parceiro + período)
//   analisar { de, ate, periodo, rotulo, forcar? }  pede uma leitura nova; roda em segundo plano e a tela
//                                              pergunta "ultima" até ficar pronta
//
//   chave_gemini { valor }                     guarda a chave gratuita do Gemini (só o admin geral), depois de testada
//   remover_gemini                             tira a chave do Gemini: a leitura volta para a Anthropic
//
// Dois motores (16/11/2026, Tiago: "tem alguma API gratuita de IA...? estou apenas testando, não queria
// gastar"): com a chave do Gemini guardada (GEMINI_API_KEY em config_servicos) a leitura sai pela faixa
// gratuita do Google; sem ela, pela Anthropic. As instruções e o formato da resposta são os mesmos.
//
// Os números vêm da MESMA leitura da tela (teeds_painel_negocio), chamada com o token de quem pede: o banco
// decide o que essa pessoa pode ver (parceiro forçado para admin de parceiro). Nome, foto e id de cliente
// não vão para a I.A. A chave é a mesma das outras leituras: config_servicos (ANTHROPIC_API_KEY) ou o
// segredo das funções. Nunca volta para a tela.

import Anthropic from 'npm:@anthropic-ai/sdk'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODELO = 'claude-opus-5-5'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init, headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

/** As chaves guardadas: a do Gemini (gratuita) tem a vez; sem ela, a da Anthropic. */
async function chaves(): Promise<{ anthropic: string; gemini: string }> {
  const r = await rest('config_servicos?chave=in.(ANTHROPIC_API_KEY,GEMINI_API_KEY)&select=chave,valor')
  const linhas = (r.ok ? await r.json() : []) as Array<{ chave: string; valor: string | null }>
  const de = (c: string) => (linhas.find((l) => l.chave === c)?.valor ?? '').trim()
  return { anthropic: de('ANTHROPIC_API_KEY') || (Deno.env.get('ANTHROPIC_API_KEY') ?? ''), gemini: de('GEMINI_API_KEY') }
}

/* ------------------------------------------------------------------ o Gemini (faixa gratuita do Google) */
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
// do mais capaz para o mais leve: se um estiver sem cota no dia (429) ou fora do ar para a chave (404), tenta o seguinte
const MODELOS_GEMINI = ['gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']

async function pedirAoGemini(chave: string, sistema: string, pergunta: string): Promise<{ texto: string; modelo: string; uso: Record<string, unknown> }> {
  let ultimo = ''
  for (const modelo of MODELOS_GEMINI) {
    // 1ª tentativa com o formato travado pelo esquema; se o esquema for recusado (400), pede só "JSON" e descreve o formato no texto
    for (const comEsquema of [true, false]) {
      const r = await fetch(`${GEMINI}/interactions`, {
        method: 'POST', headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo, store: false,
          system_instruction: comEsquema ? sistema : `${sistema}\n\nResponda SÓ com um objeto JSON neste formato (JSON Schema):\n${JSON.stringify(ESQUEMA)}`,
          input: pergunta,
          response_format: comEsquema ? { type: 'text', mime_type: 'application/json', schema: ESQUEMA } : { type: 'text', mime_type: 'application/json' },
          generation_config: { max_output_tokens: 8000, thinking_level: 'medium' },
        }),
      })
      const d = await r.json().catch(() => ({})) as Record<string, any>
      if (r.ok) {
        if (d.status && d.status !== 'completed') { ultimo = `gemini ${modelo}: ${d.status}`; break }
        const texto = ((d.steps ?? []) as any[]).filter((p) => p?.type === 'model_output')
          .flatMap((p) => (p.content ?? []) as any[]).filter((c) => c?.type === 'text').map((c) => String(c.text ?? '')).join('')
        if (!texto.trim()) { ultimo = `gemini ${modelo}: resposta vazia`; break }
        return { texto, modelo, uso: { entrada: d.usage?.total_input_tokens, saida: d.usage?.total_output_tokens } }
      }
      ultimo = `gemini ${r.status} ${String(d?.error?.status ?? '')}: ${String(d?.error?.message ?? '').slice(0, 300)}`
      if (r.status === 400 && comEsquema) continue          // tenta sem o esquema
      if (r.status === 401 || r.status === 403) throw new Error(ultimo)   // chave recusada: não adianta trocar de modelo
      break                                                  // 404, 429, 5xx: tenta o próximo modelo
    }
  }
  throw new Error(ultimo || 'gemini: sem resposta')
}

/** A resposta no formato que a tela espera, venha de onde vier (o Gemini sem esquema pode faltar com um campo). */
function arrumar(d: any) {
  const txt = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max)
  const um = <T extends string>(v: unknown, lista: readonly T[], padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao)
  const recs = (Array.isArray(d?.recomendacoes) ? d.recomendacoes : []).map((r: any) => ({
    titulo: txt(r?.titulo, 200), porque: txt(r?.porque, 600), como: txt(r?.como, 600),
    categoria: um(r?.categoria, ['horario', 'ia', 'manual', 'lives', 'clientes', 'banca'] as const, 'clientes'),
    impacto: um(r?.impacto, ['alto', 'medio', 'baixo'] as const, 'medio'),
  })).filter((r: any) => r.titulo).slice(0, 8)
  if (!txt(d?.resumo) || !recs.length) throw new Error('A resposta da I.A. veio incompleta. Tente de novo.')
  return {
    resumo: txt(d.resumo),
    veredito: { onde: um(d?.veredito?.onde, ['ia', 'manual', 'as_duas', 'cedo'] as const, 'cedo'), titulo: txt(d?.veredito?.titulo, 300), texto: txt(d?.veredito?.texto) },
    recomendacoes: recs, lives: txt(d?.lives),
    alertas: (Array.isArray(d?.alertas) ? d.alertas : []).map((a: unknown) => txt(a, 400)).filter(Boolean).slice(0, 6),
  }
}

/** Quem pede: admin pleno da marca; para admin de parceiro, o banco devolve o parceiro a que ele fica preso. */
async function acessoDoAdmin(cab: Record<string, string>, marca: string, pedido: string): Promise<{ pleno: boolean; parceiro: string | null }> {
  const h = { ...cab, 'Content-Type': 'application/json' }
  const corpo = JSON.stringify({ p_marca: marca })
  const [a, b] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_pleno_da`, { method: 'POST', headers: h, body: corpo }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_parceiro_forcado`, { method: 'POST', headers: pedido ? { ...h, 'x-teeds-vitrine': pedido } : h, body: corpo }),
  ])
  if (!a.ok || !b.ok) return { pleno: false, parceiro: null }
  const pleno = (await a.json()) === true
  const parceiro = (await b.json()) as string | null
  return { pleno, parceiro: pleno && parceiro ? String(parceiro) : null }
}

const PLATAFORMA: Record<string, { nome: string; ias: string }> = {
  globalfly: { nome: 'GlobalFly Trade', ias: 'Na GlobalFly as estratégias automáticas se chamam "I.A." (a I.A., as I.A.), nunca "robô".' },
  omni: { nome: 'OMNI', ias: 'As estratégias automáticas da plataforma são chamadas de robôs.' },
  teeds: { nome: 'Teeds', ias: 'As estratégias automáticas da plataforma são chamadas de robôs.' },
}
// as palavras que a leitura nunca usa (memória da linguagem da plataforma)
const PROIBIDAS = '"aposta", "apostar", "sorte", "chute", "jogar" ou "jogo"' // texto-ok: é a lista do que é proibido

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['resumo', 'veredito', 'recomendacoes', 'lives', 'alertas'],
  properties: {
    resumo: { type: 'string', description: '2 a 4 frases com os números que mais importam do período.' },
    veredito: {
      type: 'object', additionalProperties: false, required: ['onde', 'titulo', 'texto'],
      properties: {
        onde: { type: 'string', enum: ['ia', 'manual', 'as_duas', 'cedo'], description: 'Onde o esforço rende mais markup; "cedo" quando a amostra não permite dizer.' },
        titulo: { type: 'string', description: 'Uma frase curta com a conclusão.' },
        texto: { type: 'string', description: '2 a 4 frases com o porquê, em números.' },
      },
    },
    recomendacoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['titulo', 'porque', 'como', 'categoria', 'impacto'],
        properties: {
          titulo: { type: 'string', description: 'A ação, no imperativo, em até 10 palavras.' },
          porque: { type: 'string', description: 'O número que sustenta a recomendação.' },
          como: { type: 'string', description: 'O passo concreto para colocar em prática nesta semana.' },
          categoria: { type: 'string', enum: ['horario', 'ia', 'manual', 'lives', 'clientes', 'banca'] },
          impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
        },
      },
    },
    lives: { type: 'string', description: 'A leitura das lives: quais renderam mais, em que dia e horário, e o padrão. Vazio se não houve live no período.' },
    alertas: { type: 'array', items: { type: 'string' }, description: 'Só o que precisa de atenção antes de agir. Pode ser vazio.' },
  },
}

function instrucoes(marca: string, rotulo: string): string {
  const p = PLATAFORMA[marca]
  return `Você é o analista de negócio da ${p.nome}, uma plataforma de operações no mercado que usa a corretora Deriv. Quem lê é o dono da plataforma, que não é técnico e quer saber onde colocar o esforço do time para aumentar o markup.

O NEGÓCIO
- A plataforma ganha markup: uma pequena fatia de cada operação que o cliente faz em conta real, ganhe ele ou perca. Mais operações e mais volume movimentado em conta real = mais markup.
- O cliente opera de dois jeitos: com as estratégias automáticas ("ia" nos dados) ou na mão ("manual" nos dados). ${p.ias}
- O time faz transmissões ao vivo (lives) em que os clientes operam junto; elas estão em "lives".
- Cliente que perde a banca para de operar e para de gerar markup. Recomendação boa é a que aumenta volume e frequência sem queimar o cliente: horário, qual estratégia divulgar, conteúdo das lives, reativação, depósito.

OS DADOS (JSON, período: ${rotulo}; horários de Brasília; valores em dólar)
- origens.ia / origens.manual: operacoes, pessoas, markup, volume (soma das entradas), resultado (dos clientes: ganhos + perdas), ganhos, perdas, ganhas (operações com ganho), dias (dias com operação), banca (saldo real de hoje de quem operou assim), lucrando / perdendo (pessoas no azul ou no vermelho naquele jeito de operar), lucro / prejuizo, depositos (do período, de quem operou assim), dias_media (dias ativos por pessoa), markup_mediano (por pessoa).
- perfis: as pessoas separadas em só I.A. ("ia"), só manual ("manual") e os dois ("duas").
- rotulos: cada estratégia automática (origem "ia") e cada tipo de contrato da manual (origem "manual").
- faixas: as pessoas pela banca de hoje (0 = sem saldo, 1 = até US$ 50, 2 = US$ 50 a 200, 3 = US$ 200 a 1 mil, 4 = US$ 1 mil a 5 mil, 5 = mais de US$ 5 mil).
- clientes: quem terminou o período no azul ou no vermelho, quem ficou sem saldo, quem operou um dia só e quem operou 3 dias ou mais.
- dias, horas (0 a 23) e semana (1 = segunda ... 7 = domingo; "vezes" = quantos desses dias houve no período): o markup de "ia" e de "manual".
- lives: cada live com inicio e fim, markup, o "tipico" (o que aquele mesmo horário costuma render sem live), operacoes, pessoas, volume, depositos feitos durante e "entraram" (pessoas que clicaram no aviso para entrar). "estimada": true quer dizer que o horário foi reconstruído pelos cliques e é aproximado. lives_resumo compara as horas em live com as horas sem live.
- top: os 10 maiores geradores de markup, sem identificação.

COMO LER (regras duras)
- Use só os números dos dados. Não invente número, nome de estratégia nem live. Faça as contas com cuidado: markup por operação, por pessoa, a cada US$ 100 movimentados, por hora.
- Amostra: não declare vencedor com menos de 30 pessoas ou menos de 500 operações de um lado; diga que é cedo. Estratégia com menos de 10 pessoas é só observação. Diferença abaixo de 15% é empate.
- A maioria dos clientes termina no vermelho: isso é o comportamento normal desse mercado. Não trate como defeito a corrigir nem como vantagem; o que importa para o negócio é o cliente continuar ativo e com saldo.
- Compare "ia" e "manual" pelo que cada um entrega ao negócio: markup total, markup por pessoa, markup por operação, quanto do volume vira markup, quantos dias a pessoa volta e quanto ela deposita.
- Horário: aponte as 2 ou 3 faixas de hora e os dias da semana mais fortes para cada jeito de operar, e onde há horário forte sem live.
- Lives: diga quais renderam mais (dia, horário), quanto a mais que o típico, e o padrão (manhã, tarde ou noite; duração). Com horário estimado, fale em "por volta de".

COMO ESCREVER
- Português do Brasil, frases curtas, direto, em tom de quem motiva o time. Sem jargão, sem inglês.
- Valores como "US$ 1.234,56" (ponto no milhar, vírgula nos centavos). Percentual sem casas, a não ser abaixo de 10%.
- Nunca use ${PROIBIDAS} para falar de operar. Nunca prometa ganho ao cliente nem sugira esconder risco, travar saque ou induzir o cliente a perder.
- recomendacoes: de 4 a 7, em ordem de impacto, cada uma com o número que a sustenta e o passo prático. Pelo menos uma de horário, uma sobre qual estratégia automática divulgar e, se houve live, uma sobre as lives.
- alertas: só o que ele precisa saber antes de agir (amostra pequena, período curto, horário de live estimado). Pode ser vazio.`
}

async function montarEntrada(cab: Record<string, string>, marca: string, parceiro: string, de: string, ate: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_painel_negocio`, {
    method: 'POST', headers: { ...cab, 'Content-Type': 'application/json', ...(parceiro ? { 'x-teeds-vitrine': parceiro } : {}) },
    body: JSON.stringify({ p_marca: marca, p_de: de, p_ate: ate, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não consegui ler os números do período.')
  const d = await r.json() as Record<string, any>
  // sem nome, foto nem id de cliente
  d.top = ((d.top ?? []) as any[]).map((t, i) => ({ posicao: i + 1, perfil: t.perfil, markup: t.markup, markup_ia: t.markup_ia, markup_manual: t.markup_manual, resultado: t.resultado, saldo: t.saldo, operacoes: t.operacoes, dias: t.dias, depositos: t.depositos }))
  delete d.lido_em
  return d
}

async function analisar(id: string, cab: Record<string, string>, marca: string, parceiro: string, de: string, ate: string, rotulo: string, chave: { anthropic: string; gemini: string }) {
  const mudar = (campos: Record<string, unknown>) => rest(`negocio_analises?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) })
  try {
    const entrada = await montarEntrada(cab, marca, parceiro, de, ate)
    const operacoes = Number(entrada.origens?.ia?.operacoes ?? 0) + Number(entrada.origens?.manual?.operacoes ?? 0)
    if (!operacoes) throw new Error('Não houve operação em conta real neste período: não há o que analisar.')
    const pergunta = `Os números do período, em JSON:\n${JSON.stringify(entrada)}\n\nEscreva a leitura e as recomendações no formato pedido.`
    if (chave.gemini) {
      const g = await pedirAoGemini(chave.gemini, instrucoes(marca, rotulo), pergunta)
      const limpo = g.texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
      await mudar({ situacao: 'pronta', dados: arrumar(JSON.parse(limpo)), modelo: g.modelo, pronta_em: new Date().toISOString(), uso: g.uso })
      return
    }
    const cliente = new Anthropic({ apiKey: chave.anthropic })
    const resposta = await cliente.messages.create({
      model: MODELO, max_tokens: 16000,
      system: instrucoes(marca, rotulo),
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: pergunta }],
    } as any)
    if (resposta.stop_reason === 'refusal') throw new Error('A I.A. não quis analisar este pedido. Tente de novo em instantes.')
    if (resposta.stop_reason === 'max_tokens') throw new Error('A resposta da I.A. veio cortada. Tente de novo.')
    const texto = resposta.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('')
    const dados = arrumar(JSON.parse(texto))
    await mudar({ situacao: 'pronta', dados, modelo: resposta.model, pronta_em: new Date().toISOString(), uso: { entrada: resposta.usage?.input_tokens, saida: resposta.usage?.output_tokens } })
  } catch (e) {
    await mudar({ situacao: 'erro', erro: erroParaTela(e) })
  }
}

/** O erro da Anthropic em palavras de quem usa o painel (o texto cru vem em inglês e com código). */
function erroParaTela(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  if (/credit balance is too low/i.test(m)) return 'A conta da I.A. está sem crédito. Coloque crédito na conta da Anthropic (Plans & Billing) e gere de novo.'
  if (/authentication_error|invalid x-api-key/i.test(m)) return 'A chave da I.A. foi recusada. Cole uma chave nova em Administração › Anúncios › Leitura da I.A.'
  if (/rate_limit|overloaded/i.test(m)) return 'A I.A. está ocupada agora. Tente de novo em alguns minutos.'
  if (/^gemini (401|403)|API_KEY_INVALID|PERMISSION_DENIED/i.test(m)) return 'A chave do Gemini foi recusada pelo Google. Cole uma chave nova no cartão.'
  if (/^gemini 429|RESOURCE_EXHAUSTED/i.test(m)) return 'A cota gratuita do Gemini de hoje acabou. Ela volta amanhã; tente de novo depois.'
  if (/^gemini/i.test(m)) return 'O Gemini não respondeu agora. Tente de novo em alguns minutos.'
  if (/JSON|Unexpected token/i.test(m)) return 'A resposta da I.A. veio fora do formato. Tente de novo.'
  return m.slice(0, 600)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, any>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? ''), pedido = String(d.parceiro ?? '').slice(0, 20), acao = String(d.acao ?? '')
  if (!PLATAFORMA[marca]) return json({ erro: 'Plataforma desconhecida.' }, 400)
  if (pedido && !/^[a-z0-9_-]+$/i.test(pedido)) return json({ erro: 'Parceiro inválido.' }, 400)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const cab = { apikey, Authorization: `Bearer ${token}` }
  const [acesso, usuario] = await Promise.all([
    acessoDoAdmin(cab, marca, pedido),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: cab }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!token || !acesso.pleno) return json({ erro: 'Só a administração usa a leitura da I.A.' }, 403)
  // o recorte guardado é o que a pessoa de fato pode ver
  const parceiro = acesso.parceiro ?? pedido
  const meta = usuario?.user_metadata ?? {}
  const nomeDeQuem = String(meta.nome || meta.full_name || meta.name || String(usuario?.email ?? '').split('@')[0].split('+')[0] || 'Admin')
  // a chave gratuita do Gemini é da plataforma inteira: só o admin geral cola ou tira
  if (acao === 'chave_gemini' || acao === 'remover_gemini') {
    if (acesso.parceiro) return json({ erro: 'Só o admin geral troca a chave da I.A.' }, 403)
    if (acao === 'remover_gemini') {
      const g = await rest('config_servicos?chave=eq.GEMINI_API_KEY', { method: 'DELETE' })
      return g.ok ? json({ ok: true }) : json({ erro: 'Não consegui tirar a chave.' }, 500)
    }
    const valor = String(d.valor ?? '').trim()
    if (!/^[A-Za-z0-9_-]{25,120}$/.test(valor)) return json({ erro: 'Isso não parece uma chave do Gemini. Copie a chave inteira no Google AI Studio.' }, 400)
    const t = await fetch(`${GEMINI}/models`, { headers: { 'x-goog-api-key': valor } }).catch(() => null)
    if (!t?.ok) return json({ erro: 'O Google não aceitou essa chave. Confira se copiou inteira e tente de novo.' }, 400)
    const g = await rest('config_servicos?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chave: 'GEMINI_API_KEY', valor, atualizado_em: new Date().toISOString() }) })
    return g.ok ? json({ ok: true }) : json({ erro: 'Não consegui guardar a chave.' }, 500)
  }

  const periodo = String(d.periodo ?? '').replace(/[^0-9a-zA-Z_:|T.+-]/g, '').slice(0, 80)
  if (!periodo) return json({ erro: 'Período inválido.' }, 400)
  const paraTela = (a: any) => a && ({ id: a.id, situacao: a.situacao, dados: a.dados, erro: a.erro, criadoEm: a.criado_em, prontaEm: a.pronta_em, quem: a.quem_nome, de: a.de, ate: a.ate, motor: /^gemini/i.test(String(a.modelo ?? '')) ? 'gemini' : a.modelo ? 'anthropic' : null })
  const filtro = `marca=eq.${marca}&parceiro=eq.${encodeURIComponent(parceiro)}&periodo=eq.${encodeURIComponent(periodo)}`

  try {
    const CHAVE = await chaves()
    const CHAVE_IA = CHAVE.gemini || CHAVE.anthropic
    // o que o cartão precisa saber: qual motor está valendo e se quem está na tela pode colar a chave
    const motores = { motor: CHAVE.gemini ? 'gemini' : CHAVE.anthropic ? 'anthropic' : null, podeColar: !acesso.parceiro }
    if (acao === 'ultima') {
      const r = await rest(`negocio_analises?${filtro}&order=criado_em.desc&limit=1`)
      let a = r.ok ? (await r.json())[0] : null
      // uma leitura que ficou "analisando" por mais de 5 minutos morreu no caminho
      if (a?.situacao === 'analisando' && Date.now() - Date.parse(a.criado_em) > 5 * 60e3) a = { ...a, situacao: 'erro', erro: 'A leitura demorou demais. Tente de novo.' }
      return json({ temIA: !!CHAVE_IA, ...motores, analise: paraTela(a) ?? null })
    }
    if (acao === 'analisar') {
      const de = new Date(String(d.de ?? '')), ate = new Date(String(d.ate ?? ''))
      if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) return json({ erro: 'Período inválido.' }, 400)
      if (!CHAVE_IA) return json({ semIA: true, erro: 'Falta a chave da I.A.: cole a chave gratuita do Gemini no cartão.' }, 409)
      // a leitura de até 20 minutos atrás serve, a não ser que peçam de novo
      const recente = await rest(`negocio_analises?${filtro}&situacao=in.(pronta,analisando)&criado_em=gte.${new Date(Date.now() - (d.forcar ? 2 : 20) * 60e3).toISOString()}&order=criado_em.desc&limit=1`)
      const ja = recente.ok ? (await recente.json())[0] : null
      if (ja && (!d.forcar || ja.situacao === 'analisando')) return json({ temIA: true, ...motores, analise: paraTela(ja) })
      const rotulo = String(d.rotulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'o período escolhido'
      const ins = await rest('negocio_analises?select=*', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ marca, parceiro, periodo, de: de.toISOString(), ate: ate.toISOString(), situacao: 'analisando', quem: usuario?.id ?? null, quem_nome: nomeDeQuem }) })
      const linha = ins.ok ? (await ins.json())[0] : null
      if (!linha) return json({ erro: 'Não consegui guardar a leitura.' }, 500)
      EdgeRuntime.waitUntil(analisar(linha.id, cab, marca, parceiro, de.toISOString(), ate.toISOString(), rotulo, CHAVE))
      return json({ temIA: true, ...motores, analise: paraTela(linha) })
    }
    return json({ erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    return json({ erro: (e as Error).message.slice(0, 300) }, 500)
  }
})
