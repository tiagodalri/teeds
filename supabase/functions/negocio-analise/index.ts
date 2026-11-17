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
// do mais capaz para o mais leve: se um estiver sem cota no dia (429), sobrecarregado (503) ou fora do ar para a chave
// (404), tenta o seguinte. 17/11/2026: o 4 Hydrogen fez a melhor leitura (contas certas, datas certas); o 3.8 Flash deu 503
// nas duas vezes e ficou pendurado na repetição; o 3.5 Flash-Lite responde em ~10 s, mas erra mais.
const MODELOS_GEMINI = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']

// 17/11/2026: a leitura do Hydrogen levou 88 s e a leitura inteira 211 s; a tela dá a leitura como perdida depois de
// 5 min. Tudo tem de caber em PRAZO_TOTAL (com folga) e cada pedido tem o seu teto, sobrando tempo para o mais leve.
const PRAZO_TOTAL = 230_000
const PRAZO_POR_PEDIDO = 120_000

async function pedirAoGemini(chave: string, sistema: string, pergunta: string): Promise<{ texto: string; modelo: string; uso: Record<string, unknown> }> {
  const inicio = Date.now()
  const resta = () => PRAZO_TOTAL - (Date.now() - inicio)
  let ultimo = ''
  // o que aconteceu em cada tentativa (vai para "uso" da leitura, sem a chave): diz por que um modelo foi pulado
  const tentativas: Array<{ modelo: string; esquema: boolean; status: number | string; ms: number; motivo?: string }> = []
  for (const modelo of MODELOS_GEMINI) {
    // com o esquema primeiro; sem ele se o esquema for recusado. Um 503 repete o mesmo pedido uma vez.
    const formatos = [true, false]
    let f = 0, deNovo = true
    while (f < formatos.length) {
      // o último modelo (o mais leve, que responde em ~10 s) sempre ganha a vez se ainda houver 20 s
      if (resta() < 20_000) { ultimo = ultimo || 'gemini prazo'; tentativas.push({ modelo, esquema: formatos[f], status: 'sem tempo', ms: 0 }); break }
      const comEsquema = formatos[f]
      const t0 = Date.now()
      const prazo = new AbortController()
      // os modelos maiores só podem gastar até sobrar tempo para o mais leve
      const ehUltimo = modelo === MODELOS_GEMINI[MODELOS_GEMINI.length - 1]
      const teto = Math.max(5_000, Math.min(PRAZO_POR_PEDIDO, resta() - (ehUltimo ? 2_000 : 30_000)))
      const relogio = setTimeout(() => prazo.abort(), teto)
      const r = await fetch(`${GEMINI}/interactions`, {
        method: 'POST', signal: prazo.signal, headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo, store: false,
          system_instruction: comEsquema ? sistema : `${sistema}\n\nResponda SÓ com um objeto JSON neste formato (JSON Schema):\n${JSON.stringify(ESQUEMA)}`,
          input: pergunta,
          response_format: comEsquema ? { type: 'text', mime_type: 'application/json', schema: ESQUEMA } : { type: 'text', mime_type: 'application/json' },
          generation_config: { max_output_tokens: 8000, thinking_level: 'low' },
        }),
      }).catch((e) => ({ ok: false, status: (e as Error)?.name === 'AbortError' ? 'prazo' : 'rede', json: async () => ({}) }) as unknown as Response)
      clearTimeout(relogio)
      const d = await r.json().catch(() => ({})) as Record<string, any>
      const ms = Date.now() - t0
      if (r.ok) {
        if (d.status && d.status !== 'completed') { ultimo = `gemini ${modelo}: ${d.status}`; tentativas.push({ modelo, esquema: comEsquema, status: String(d.status), ms }); break }
        const texto = ((d.steps ?? []) as any[]).filter((p) => p?.type === 'model_output')
          .flatMap((p) => (p.content ?? []) as any[]).filter((c) => c?.type === 'text').map((c) => String(c.text ?? '')).join('')
        if (!texto.trim()) { ultimo = `gemini ${modelo}: resposta vazia`; tentativas.push({ modelo, esquema: comEsquema, status: 'vazia', ms }); break }
        tentativas.push({ modelo, esquema: comEsquema, status: 200, ms })
        return { texto, modelo, uso: { entrada: d.usage?.total_input_tokens, saida: d.usage?.total_output_tokens, tentativas } }
      }
      ultimo = `gemini ${r.status} ${String(d?.error?.status ?? '')}: ${String(d?.error?.message ?? '').slice(0, 300)}`
      tentativas.push({ modelo, esquema: comEsquema, status: r.status, ms, motivo: `${String(d?.error?.status ?? '')} ${String(d?.error?.message ?? '').slice(0, 160)}`.trim() })
      if (r.status === 400 && comEsquema) { f++; continue }   // tenta sem o esquema
      // 503 = o Google está com pico de uso naquele modelo: espera 4 s e tenta mais uma vez antes de cair para o mais leve
      if (r.status === 503 && deNovo && resta() > 90_000) { deNovo = false; await new Promise((ok) => setTimeout(ok, 4000)); continue }
      if (r.status === 401 || r.status === 403) throw new ErroDoGemini(ultimo, tentativas)   // chave recusada: não adianta trocar de modelo
      break                                                  // 404, 429, 5xx, prazo: tenta o próximo modelo
    }
  }
  throw new ErroDoGemini(ultimo || 'gemini: sem resposta', tentativas)
}
/** O erro do Gemini com o registro das tentativas, para a leitura guardar por que falhou. */
class ErroDoGemini extends Error { constructor(m: string, public tentativas: unknown[]) { super(m) } }

/** A resposta no formato que a tela espera, venha de onde vier (o Gemini sem esquema pode faltar com um campo). */
function arrumar(d: any) {
  const txt = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max)
  const um = <T extends string>(v: unknown, lista: readonly T[], padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao)
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0 }
  const recs = (Array.isArray(d?.recomendacoes) ? d.recomendacoes : []).map((r: any) => ({
    titulo: txt(r?.titulo, 200), porque: txt(r?.porque, 600), como: txt(r?.como, 600),
    categoria: um(r?.categoria, ['horario', 'ia', 'manual', 'lives', 'clientes', 'banca'] as const, 'clientes'),
    impacto: um(r?.impacto, ['alto', 'medio', 'baixo'] as const, 'medio'),
    // o plano de ação (17/11/2026): quando, quem, os passos, como medir e quanto pode render
    prazo: um(r?.prazo, ['semana', '15_dias', '30_dias'] as const, r?.impacto === 'alto' ? 'semana' : r?.impacto === 'baixo' ? '30_dias' : '15_dias'),
    responsavel: txt(r?.responsavel, 60), indicador: txt(r?.indicador, 200), alvo: txt(r?.alvo, 200),
    passos: (Array.isArray(r?.passos) ? r.passos : []).map((x: unknown) => txt(x, 220)).filter(Boolean).slice(0, 5),
    potencial: num(r?.potencial_usd),
  })).filter((r: any) => r.titulo).slice(0, 8)
  if (!txt(d?.resumo) || !recs.length) throw new Error('A resposta da I.A. veio incompleta. Tente de novo.')
  return {
    resumo: txt(d.resumo),
    veredito: { onde: um(d?.veredito?.onde, ['ia', 'manual', 'as_duas', 'cedo'] as const, 'cedo'), titulo: txt(d?.veredito?.titulo, 300), texto: txt(d?.veredito?.texto) },
    recomendacoes: recs, lives: txt(d?.lives),
    alertas: (Array.isArray(d?.alertas) ? d.alertas : []).map((a: unknown) => txt(a, 400)).filter(Boolean).slice(0, 6),
    meta: d?.meta && txt(d.meta.titulo) ? { titulo: txt(d.meta.titulo, 200), atual: num(d.meta.atual_usd), alvo: num(d.meta.alvo_usd), texto: txt(d.meta.texto, 600) } : null,
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
  required: ['resumo', 'veredito', 'meta', 'recomendacoes', 'lives', 'alertas'],
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
        type: 'object', additionalProperties: false, required: ['titulo', 'porque', 'como', 'categoria', 'impacto', 'prazo', 'responsavel', 'passos', 'indicador', 'alvo', 'potencial_usd'],
        properties: {
          titulo: { type: 'string', description: 'A ação, no imperativo, em até 10 palavras.' },
          porque: { type: 'string', description: 'O número que sustenta a recomendação.' },
          como: { type: 'string', description: 'O passo concreto para colocar em prática nesta semana.' },
          categoria: { type: 'string', enum: ['horario', 'ia', 'manual', 'lives', 'clientes', 'banca'], description: 'horario = quando operar; ia = qual estratégia automática; manual = operação manual; lives = transmissões; clientes = reativar, reter, trazer de volta; banca = tamanho da conta e depósito.' },
          impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          prazo: { type: 'string', enum: ['semana', '15_dias', '30_dias'], description: 'Quando começar: semana = já nesta semana; 15_dias = nos próximos 15 dias; 30_dias = dentro do mês.' },
          responsavel: { type: 'string', description: 'Quem do time toca, em 1 ou 2 palavras: Lives, Marketing, Suporte, Parceiros, Produto ou Gestão.' },
          passos: { type: 'array', items: { type: 'string' }, description: '2 a 4 passos curtos e concretos, na ordem, cada um começando com um verbo.' },
          indicador: { type: 'string', description: 'O número da plataforma que mostra se deu certo (ex.: markup das 11h às 12h).' },
          alvo: { type: 'string', description: 'Aonde levar esse número no próximo período do mesmo tamanho, saindo do valor de hoje (ex.: de US$ 283,12 para US$ 340).' },
          potencial_usd: { type: 'number', description: 'Markup a mais estimado no próximo período do mesmo tamanho, conservador e tirado dos números; 0 quando não der para estimar.' },
        },
      },
    },
    meta: {
      type: 'object', additionalProperties: false, required: ['titulo', 'atual_usd', 'alvo_usd', 'texto'],
      properties: {
        titulo: { type: 'string', description: 'A meta do próximo período do mesmo tamanho, numa frase (ex.: levar o markup de US$ 3.862 para US$ 4.400).' },
        atual_usd: { type: 'number', description: 'O markup total do período (contas_prontas.markup_total).' },
        alvo_usd: { type: 'number', description: 'O markup total que o plano busca no próximo período do mesmo tamanho: o atual mais a soma dos potenciais.' },
        texto: { type: 'string', description: '1 ou 2 frases: de onde vem a meta e o que mais pesa nela.' },
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
- lives: já em ordem do markup (posicao_por_markup 1 = a que mais rendeu), com "quando" no horário de Brasília (use exatamente esse dia e horário), duração, markup, markup por hora, "vezes_o_normal_do_horario" (quanto rendeu a mais que o mesmo horário sem live), operações, pessoas operando, movimentado, depósitos feitos durante e quantos clicaram para entrar. "horario_estimado": true quer dizer que o horário foi reconstruído pelos cliques e é aproximado. lives_resumo compara as horas em live com as horas sem live.
- contas_prontas: as contas já feitas (markup por operação, por pessoa, a cada US$ 100 movimentados, dias ativos por pessoa, percentual da I.A., melhores horas de cada lado, quanto as lives renderam a mais). Use esses números em vez de refazer as contas. "quem_vence" diz, métrica por métrica, se a I.A. ou a manual ganha: nunca afirme o contrário do que está ali.
- Para dizer quanto as lives renderam a mais, use contas_prontas.lives_vezes_o_normal (comparação com o mesmo horário sem live). Não divida o markup por hora em live pelo markup por hora sem live.
- top: os 10 maiores geradores de markup, sem identificação.

COMO LER (regras duras)
- Use só os números dos dados. Não invente número, nome de estratégia nem live. Quando um número já estiver em contas_prontas, use ele; não refaça a conta.
- Datas e horários: copie como vieram (já estão no horário de Brasília). Nunca converta fuso.
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
- alertas: só o que ele precisa saber antes de agir (amostra pequena, período curto, horário de live estimado). Pode ser vazio.

O PLANO DE AÇÃO (cada recomendação vira uma tarefa do time)
- prazo: as de impacto alto e fáceis começam nesta semana; o resto em 15 ou 30 dias. Distribua: não ponha tudo na mesma semana.
- responsavel: quem toca (Lives, Marketing, Suporte, Parceiros, Produto ou Gestão).
- passos: de 2 a 4, curtos, práticos, que dá para marcar como feito.
- indicador e alvo: o número que vai mostrar que deu certo, saindo do valor de hoje dos dados (nunca invente o valor de hoje).
- potencial_usd: estimativa CONSERVADORA de markup a mais no próximo período do mesmo tamanho, tirada dos números (ex.: levar um horário fraco a metade do que rende o horário forte). Nunca some mais de 35% do markup total do período em todos os potenciais juntos. 0 quando não der para estimar.
- meta: atual_usd = contas_prontas.markup_total; alvo_usd = atual mais a soma dos potenciais. Escreva a meta como objetivo do time, sem prometer.`
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
  // 17/11/2026: a 1ª leitura real trocou as datas das lives (o banco manda em UTC: a de terça 21h virou "quarta de
  // madrugada") e errou contas. Agora vai tudo no horário de Brasília, escrito, e com as contas prontas.
  const r2 = (v: unknown, c = 2) => Math.round((Number(v) || 0) * 10 ** c) / 10 ** c
  const div = (a: unknown, b: unknown) => (Number(b) > 0 ? Number(a) / Number(b) : 0)
  d.de = quandoEmBrasilia(d.de); d.ate = quandoEmBrasilia(d.ate)
  const lives = ((d.lives ?? []) as any[]).map((l) => {
    const horas = (Date.parse(l.fim) - Date.parse(l.inicio)) / 3_600_000
    return {
      quando: `${quandoEmBrasilia(l.inicio)} às ${horaEmBrasilia(l.fim)}`, duracao_horas: r2(horas, 1), horario_estimado: Boolean(l.estimada),
      origem: l.origem, markup: r2(l.markup), markup_ia: r2(l.markup_ia), markup_manual: r2(l.markup_manual), markup_por_hora: r2(div(l.markup, horas)),
      vezes_o_normal_do_horario: Number(l.tipico) > 0 ? r2(div(l.markup, l.tipico), 1) : null,
      operacoes: l.operacoes, pessoas_operando: l.pessoas, movimentado: r2(l.volume), depositos: r2(l.depositos), clicaram_para_entrar: l.entraram,
    }
  }).sort((a, b) => b.markup - a.markup).map((l, i) => ({ posicao_por_markup: i + 1, ...l }))
  d.lives = lives
  const o = d.origens ?? {}
  const conta = (x: any) => x && ({
    markup_por_operacao: r2(div(x.markup, x.operacoes), 4), markup_por_pessoa: r2(div(x.markup, x.pessoas)),
    markup_a_cada_100_movimentados: r2(div(x.markup, x.volume) * 100), entrada_media: r2(div(x.volume, x.operacoes)),
    percentual_de_operacoes_com_ganho: r2(div(x.ganhas, x.operacoes) * 100, 1), dias_ativos_por_pessoa: r2(x.dias_media, 1),
  })
  // quem vence em cada métrica, já escrito (a 1ª leitura disse que a I.A. "mantém os clientes mais ativos", e era o contrário)
  const vence = (nome: string, a: number, b: number, fmt: (v: number) => string) =>
    `${nome}: ${a === b ? 'empate' : a > b ? 'I.A.' : 'manual'} (I.A. ${fmt(a)} x manual ${fmt(b)})`
  const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const ci = conta(o.ia) ?? {}, cm = conta(o.manual) ?? {}
  const total = Number(o.ia?.markup ?? 0) + Number(o.manual?.markup ?? 0)
  d.contas_prontas = {
    markup_total: r2(total), percentual_do_markup_da_ia: r2(div(o.ia?.markup, total) * 100, 1),
    ia: conta(o.ia), manual: conta(o.manual),
    quem_vence: o.ia && o.manual ? [
      vence('markup total', r2(o.ia.markup), r2(o.manual.markup), usd),
      vence('markup por operação', ci.markup_por_operacao, cm.markup_por_operacao, usd),
      vence('markup por pessoa', ci.markup_por_pessoa, cm.markup_por_pessoa, usd),
      vence('dias ativos por pessoa (quem volta mais)', ci.dias_ativos_por_pessoa, cm.dias_ativos_por_pessoa, (v) => v.toLocaleString('pt-BR')),
      vence('pessoas que operaram', Number(o.ia.pessoas), Number(o.manual.pessoas), (v) => String(v)),
    ] : [],
    melhores_horas_ia: [...(d.horas ?? [])].sort((a: any, b: any) => b.ia - a.ia).slice(0, 3).map((h: any) => `${h.hora}h (US$ ${r2(h.ia)})`),
    melhores_horas_manual: [...(d.horas ?? [])].sort((a: any, b: any) => b.manual - a.manual).slice(0, 3).map((h: any) => `${h.hora}h (US$ ${r2(h.manual)})`),
    // as lives contra o MESMO horário sem live (é o número certo para dizer "quanto as lives renderam a mais")
    lives_vezes_o_normal: Number(d.lives_resumo?.tipico_live) > 0 ? r2(div(d.lives_resumo.markup_live, d.lives_resumo.tipico_live), 1) : null,
    markup_por_hora_em_live: r2(div(d.lives_resumo?.markup_live, d.lives_resumo?.horas_live)),
    markup_por_hora_sem_live: r2(div(d.lives_resumo?.markup_fora, d.lives_resumo?.horas_fora)),
  }
  return d
}

const FUSO = 'America/Sao_Paulo'
const fmtQuando = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
/** "terça-feira, 10/11, 21:11" no horário de Brasília. */
const quandoEmBrasilia = (iso: unknown) => (iso ? fmtQuando.format(Date.parse(String(iso))) : '')
const horaEmBrasilia = (iso: unknown) => (iso ? fmtHora.format(Date.parse(String(iso))) : '')

async function analisar(id: string, cab: Record<string, string>, marca: string, parceiro: string, de: string, ate: string, rotulo: string, chave: { anthropic: string; gemini: string }) {
  const mudar = (campos: Record<string, unknown>) => rest(`negocio_analises?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) })
  // se o Supabase desligar a função antes do fim, a leitura vira erro em vez de ficar "analisando" para sempre
  let terminou = false
  const aoDesligar = () => { if (!terminou) void rest(`negocio_analises?id=eq.${id}&situacao=eq.analisando`, { method: 'PATCH', body: JSON.stringify({ situacao: 'erro', erro: 'A I.A. demorou demais para responder. Tente de novo.' }) }) }
  addEventListener('beforeunload', aoDesligar)
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
    const cliente = new Anthropic({ apiKey: chave.anthropic, timeout: PRAZO_TOTAL, maxRetries: 0 })
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
    await mudar({ situacao: 'erro', erro: erroParaTela(e), ...(e instanceof ErroDoGemini ? { uso: { tentativas: e.tentativas } } : {}) })
  } finally {
    terminou = true
    removeEventListener('beforeunload', aoDesligar)
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
  if (/^gemini 503|high demand|UNAVAILABLE/i.test(m)) return 'O Gemini gratuito está sobrecarregado agora. Tente de novo em alguns minutos.'
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
