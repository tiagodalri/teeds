// Consultor da Psicologia (28/11/2026, Tiago: "um chat dentro dessa aba... uma inteligência conectada com TODOS
// os dados do negócio, tipo um consultor"). Administração › Números › Psicologia › Consultor (só GlobalFly).
//
// Cada pergunta: confere quem pede (admin pleno; admin de parceiro só vê o parceiro dele), lê os dados com o
// token DE QUEM PEDE (as mesmas funções da tela: teeds_psicologia, teeds_psicologia_lista, teeds_painel_negocio),
// e conversa com o Gemini (chave de config_servicos). Aceita texto, áudio, imagem, vídeo e arquivo.
//
// Nome de aluno NÃO vai para o Google: na ida cada aluno vira um código (A001…), na volta o código vira o nome.
// A I.A. pode pedir a linha do tempo de um aluno (ferramenta ver_aluno), sempre pelo código.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const MODELOS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const TETO_ANEXOS = 14_000_000 // base64 somado
const MIMES = /^(image\/(png|jpe?g|webp|heic|heif)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf|text\/(plain|csv|markdown))/i

async function chaveDoGemini(): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/config_servicos?chave=eq.GEMINI_API_KEY&select=valor`, { headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` } })
  const l = (r.ok ? await r.json() : []) as Array<{ valor: string | null }>
  return (l[0]?.valor ?? '').trim()
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const r2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100
const diasAtras = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 86_400_000) : null)

const PERFIS: Record<string, string> = {
  revanche: 'Opera no impulso (religa em menos de 2 min depois de perder, ou aumenta a entrada)', sumiu_na_perda: 'Sumiu depois de perder (último dia negativo e mais de 7 dias sem abrir)',
  disciplinado: 'Respeita o limite de perda', lucrando: 'No positivo há 3 dias ou mais', operando: 'Operando, sem padrão forte', depositou_parado: 'Depositou e nunca operou em conta real',
  estuda_nao_deposita: 'Concluiu 3 aulas ou mais e não depositou', so_no_treino: 'Só opera no treino', curioso: 'Abriu uma ou duas aulas e parou', parado_no_cadastro: 'Criou a conta e não abriu aula',
}

const INSTRUCOES = (hoje: string, quem: string, recorte: string) => `Você é o consultor de negócio da GlobalFly Trade, uma plataforma de ensino e operação no mercado financeiro com estratégias automáticas chamadas "I.A." (Raptor, Falcon, Legacy, Gulf, Phenom) e operação manual, ligada à corretora Deriv. Quem conversa com você é ${quem}, da administração. Hoje é ${hoje} (hora de Brasília).

Você recebe abaixo os DADOS REAIS do negócio (${recorte}). Responda como um consultor sênior que conhece esses números de cor: direto, com o número na frente, a leitura depois e, quando couber, o que fazer.

Regras:
- Use só os dados fornecidos e o que vier nos anexos. Se o dado não existe aqui, diga que esse dado não está disponível e sugira o que mais perto dele você tem. Nunca invente número, nome ou data.
- Português do Brasil, simples, sem jargão técnico. Valores em dólar no formato US$ 1.234,56. Porcentagens com a base ("38 de 76, 50%").
- Vocabulário da casa: as estratégias automáticas são sempre "I.A." e o que o aluno faz é sempre "operação" ou "entrada". Não use palavras de cassino nem de máquina para falar delas. "Markup" é a receita da plataforma sobre cada operação. "Limite de perda" é o stop; "meta" é o take profit.
- Os alunos aparecem com um código (A001, A002…). Quando falar de um aluno, escreva o código exatamente assim: o sistema troca pelo nome na tela. Não explique que existe código.
- Para a história completa de um aluno (cada aula, depósito, sessão, com hora), chame a ferramenta ver_aluno com o código dele antes de responder.
- Os dados mostram o que acontece junto, não prova de causa. Ao comparar grupos, diga o tamanho da amostra e não afirme que uma coisa causa a outra.
- Não prometa ganho, não diga quanto alguém deve investir e não trate resultado passado como garantia.
- Formato: frases curtas e parágrafos curtos. Pode usar **negrito** nos números-chave e listas com "- ". Sem tabelas, sem títulos com #. Vá direto à resposta, sem repetir a pergunta.
- Se a pergunta vier por áudio, responda ao que foi dito. Se vier imagem, vídeo ou arquivo, leia e relacione com os dados quando fizer sentido.

Dicionário dos campos (leia com atenção, os nomes são curtos):
- sessoes.fins: como terminou cada sessão de I.A. em conta real. fim: stop = bateu o limite de perda; meta = bateu a meta; zerou = o saldo acabou; parou_ganhando / parou_perdendo = o aluno parou na mão. n = quantas vezes; volta2 = quantas foram seguidas de OUTRA sessão em até 2 MINUTOS; volta10 = em até 10 MINUTOS; trocou = trocou de I.A. na volta; resultado_volta = soma do resultado dessas voltas; dep60 = depósito em até 60 minutos depois; saque24 = saque em até 24 horas depois; seg_mediano = duração típica da sessão em segundos.
- sessoes.calor: quente = sessão ligada em até 2 minutos depois de uma perda; frio = ligada mais de 30 minutos depois da anterior. sessoes.cadeias = sequências de 3 ou mais religadas seguidas no impulso.
- aulas.lista: por aula. sem_dep = quem abriu sem nunca ter depositado; d30m / d24h / d7d = desses, quantos fizeram o 1º depósito em até 30 minutos / 24 horas / 7 dias; min_mediano = minutos típicos até esse depósito; gatilho = vezes em que foi a última aula aberta nas 24 h antes do 1º depósito.
- estudo: ordem 0 = nenhuma aula concluída; 1 = 1 a 3; 2 = 4 a 9; 3 = 10 ou mais. dep1_faixas: ordem 0 = 1º depósito menor que US$ 10; 1 = 10 a 25; 2 = 25 a 50; 3 = 50 a 100; 4 = 100 ou mais.
- depositos: no_calor = depósito feito em até 60 minutos depois de uma perda; a_frio = sem operação na hora anterior; *_depois = resultado nas 24 horas seguintes; devolve_tudo_24h = perdeu 90% ou mais do depósito em 24 horas.
- manual: operações manuais em conta real. seg_apos_perda / seg_apos_ganho = segundos típicos até a próxima entrada; dobrou_* = entrada seguinte pelo menos 50% maior; rapida_apos_perda = nova entrada em menos de 15 segundos.
- tempo.horas: hora de Brasília (0 a 23). tempo.semana: d = 0 domingo … 6 sábado.
- lives: horas_live / horas_fora = horas com e sem live no ar; dep_live = depósitos durante a live (e até 30 min depois).
- alunos_mais_ativos: religou_em_2min = perdas seguidas de nova sessão em até 2 minutos; perdas = sessões de I.A. terminadas no negativo; visto_ha_dias = dias desde o último acesso.
- Valores em dólar. "resultado" é o resultado DO ALUNO (negativo = ele perdeu); "markup" é a receita da plataforma.`

type Anexo = { mime: string; dados: string; nome?: string }
type Aluno = Record<string, any>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, any>
  try { d = await req.json() } catch { return json({ erro: 'Não consegui ler a mensagem. Se mandou arquivo, ele pode ser grande demais.' }, 400) }
  const marca = String(d.marca ?? ''), pedido = String(d.parceiro ?? '').slice(0, 40)
  if (marca !== 'globalfly') return json({ erro: 'O consultor existe só na GlobalFly.' }, 400)
  if (pedido && !/^[a-z0-9_,-]+$/i.test(pedido)) return json({ erro: 'Parceiro inválido.' }, 400)
  const pergunta = String(d.pergunta ?? '').slice(0, 6000).trim()
  const anexos = (Array.isArray(d.anexos) ? d.anexos : []).slice(0, 10).filter((a: Anexo) => a && typeof a.dados === 'string' && MIMES.test(String(a.mime))) as Anexo[]
  if (!pergunta && !anexos.length) return json({ erro: 'Escreva a pergunta ou mande um áudio.' }, 400)
  if (anexos.reduce((t, a) => t + a.dados.length, 0) > TETO_ANEXOS) return json({ erro: 'Os anexos passam de 10 MB. Mande um arquivo menor ou um trecho.' }, 413)
  const historico = (Array.isArray(d.historico) ? d.historico : []).slice(-16)
    .filter((m: any) => m && (m.de === 'eu' || m.de === 'ia') && typeof m.texto === 'string' && m.texto.trim()) as Array<{ de: 'eu' | 'ia'; texto: string }>

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  if (!token) return json({ erro: 'Entre de novo na plataforma.' }, 401)
  const cab = { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const rpc = (nome: string, corpo: Record<string, unknown>) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cab, body: JSON.stringify(corpo) })

  // tudo com o token de quem pede: se não for da administração, o banco recusa aqui
  const agora = new Date()
  const [rPainel, rLista, rNegocio, rUsuario, chave] = await Promise.all([
    rpc('teeds_psicologia', { p_marca: marca, p_parceiro: pedido || null }),
    rpc('teeds_psicologia_lista', { p_marca: marca, p_parceiro: pedido || null }),
    rpc('teeds_painel_negocio', { p_marca: marca, p_de: new Date(agora.getTime() - 30 * 86_400_000).toISOString(), p_ate: agora.toISOString(), p_parceiro: pedido || null }),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: cab }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    chaveDoGemini(),
  ])
  if (!rPainel.ok || !rLista.ok) return json({ erro: 'Só a administração usa o consultor.' }, 403)
  if (!chave) return json({ erro: 'Falta a chave do Gemini. Cole a chave em Visão geral › Inteligência do negócio.' }, 503)
  const painel = await rPainel.json() as Record<string, any>
  const lista = await rLista.json() as Aluno[]
  const negocio = rNegocio.ok ? await rNegocio.json() as Record<string, any> : null
  const meta = rUsuario?.user_metadata ?? {}
  const quem = String(meta.nome || meta.full_name || meta.name || String(rUsuario?.email ?? '').split('@')[0].split('+')[0] || 'um administrador').slice(0, 60)

  // ------------------------------------------------------------ nomes viram códigos
  const codigoDe = new Map<string, string>(), alunoDe = new Map<string, Aluno>()
  lista.forEach((a, i) => { const c = `A${String(i + 1).padStart(3, '0')}`; codigoDe.set(a.user_id, c); alunoDe.set(c, a) })
  const primeiros = new Map<string, number>()
  for (const a of lista) { const p = semAcento(String(a.nome ?? '').trim().split(/\s+/)[0] ?? ''); if (p.length >= 4) primeiros.set(p, (primeiros.get(p) ?? 0) + 1) }
  const trocas: Array<{ re: RegExp; codigo: string }> = []
  for (const a of lista) {
    const nome = String(a.nome ?? '').trim(), c = codigoDe.get(a.user_id)!
    if (nome.split(/\s+/).length >= 2) trocas.push({ re: new RegExp(`(?<![\\p{L}\\d])${escapar(semAcento(nome)).replace(/\s+/g, '\\s+')}(?![\\p{L}\\d])`, 'giu'), codigo: c })
  }
  trocas.sort((x, y) => y.re.source.length - x.re.source.length)
  for (const a of lista) {
    const p = semAcento(String(a.nome ?? '').trim().split(/\s+/)[0] ?? '')
    if (p.length >= 4 && primeiros.get(p) === 1) trocas.push({ re: new RegExp(`(?<![\\p{L}\\d])${escapar(p)}(?![\\p{L}\\d])`, 'giu'), codigo: codigoDe.get(a.user_id)! })
  }
  /** Troca nome por código sem mexer no resto do texto (compara sem acento, corta no texto original). */
  const esconder = (texto: string) => {
    let t = texto
    for (const { re, codigo } of trocas.slice(0, 4000)) {
      const base = semAcento(t)
      if (base.length !== t.length) break // acento que muda o tamanho: não arrisca cortar errado
      const achados = [...base.matchAll(re)]
      for (const m of achados.reverse()) t = t.slice(0, m.index!) + codigo + t.slice(m.index! + m[0].length)
    }
    return t
  }
  const mostrar = (texto: string) => texto.replace(/\bA(\d{3,4})\b/g, (tudo) => String(alunoDe.get(tudo)?.nome ?? tudo))

  // ------------------------------------------------------------ os dados que vão para a I.A.
  const alunos = lista.slice(0, 320).map((a) => ({
    aluno: codigoDe.get(a.user_id), perfil: a.perfil, parceiro: a.parceiro ?? 'direto', plano: a.categoria, cadastro_ha_dias: diasAtras(a.criado_em), visto_ha_dias: diasAtras(a.visto_em),
    aulas_concluidas: a.concl, aulas_abertas: a.abertas, fez_aula_de_gerenciamento: a.viu_ger, depositos: a.dep_n, depositado: r2(a.dep_total), saques: a.saq_n, sacado: r2(a.saq_total),
    saldo_hoje: r2(a.saldo), operacoes_reais: a.ops, dias_operando: a.dias, resultado: r2(a.resultado), markup: r2(a.markup), ultimo_dia_resultado: a.ult_dia_res == null ? null : r2(a.ult_dia_res),
    sessoes_ia: a.sess, limites_de_perda: a.stops, metas_batidas: a.metas, continuou_depois_da_meta: a.passou_meta, zerou_saldo: a.zerou, perdas: a.perdas, religou_em_2min: a.revanches,
    manual_apos_perda: a.man_apos_perda, manual_aumentou_entrada: a.man_dobras, operacoes_de_madrugada: a.madrugada, vezes_no_treino: a.demo_n,
  }))
  const historias = ((painel.historias ?? []) as any[]).slice(0, 80).map((h) => ({ tipo: h.tipo, aluno: codigoDe.get(h.user_id) ?? null, quando: h.quando, ...h.d }))
  const semNomes = (o: any): any => Array.isArray(o) ? o.map(semNomes) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'foto_url' && k !== 'email').map(([k, v]) => k === 'nome' ? ['aluno', codigoDe.get(o.user_id) ?? 'aluno'] : k === 'user_id' ? ['', undefined] : [k, semNomes(v)]).filter(([k]) => k))
    : o
  const dados = {
    recorte: painel.parceiro ? `só os alunos do parceiro ${painel.parceiro}` : 'todos os alunos',
    comportamento_desde_o_comeco: { ...painel, historias: undefined, lido_em: undefined },
    historias_reais: historias,
    negocio_ultimos_30_dias: negocio ? semNomes(negocio) : 'indisponível',
    significado_dos_perfis: PERFIS,
    alunos_mais_ativos: alunos,
    total_de_alunos_na_lista: lista.length,
  }
  const recorte = painel.parceiro ? `recorte: só os alunos do parceiro "${painel.parceiro}"` : 'todos os alunos ativos, sem a equipe'
  const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(agora)

  const contents: any[] = [
    { role: 'user', parts: [{ text: `DADOS DO NEGÓCIO (JSON):\n${JSON.stringify(dados)}` }] },
    { role: 'model', parts: [{ text: 'Dados recebidos. Pode perguntar.' }] },
    ...historico.map((m) => ({ role: m.de === 'eu' ? 'user' : 'model', parts: [{ text: esconder(m.texto.slice(0, 6000)) }] })),
    { role: 'user', parts: [...anexos.map((a) => ({ inlineData: { mimeType: a.mime.split(';')[0], data: a.dados } })), { text: pergunta ? esconder(pergunta) : 'Responda ao que eu disse ou mandei no anexo.' }] },
  ]
  const corpoBase = {
    systemInstruction: { parts: [{ text: INSTRUCOES(hoje, quem, recorte) }] },
    tools: [{ functionDeclarations: [{ name: 'ver_aluno', description: 'A linha do tempo completa de um aluno: cada aula, depósito, saque, bloco de operação (I.A. e manual), acesso e conversa com o suporte, com data e hora.',
      parameters: { type: 'OBJECT', properties: { codigo: { type: 'STRING', description: 'O código do aluno, como A012' } }, required: ['codigo'] } }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
  }

  const limite = Date.now() + 135_000
  const falhas: string[] = []
  for (const modelo of MODELOS) {
    if (Date.now() > limite - 15_000) break
    try {
      const conversa = [...contents]
      for (let ida = 0; ida < 4; ida++) {
        const r = await fetch(`${GEMINI}/models/${modelo}:generateContent`, {
          method: 'POST', signal: AbortSignal.timeout(Math.max(10_000, Math.min(75_000, limite - Date.now()))),
          headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpoBase, contents: conversa }),
        })
        const g = await r.json().catch(() => ({} as any))
        if (!r.ok) throw Object.assign(new Error(`${modelo} ${r.status}: ${String(g?.error?.message ?? '').slice(0, 140)}`), { status: r.status })
        const conteudo = g.candidates?.[0]?.content
        const partes = (conteudo?.parts ?? []) as any[]
        const chamadas = partes.filter((p) => p.functionCall)
        if (chamadas.length && ida < 3) {
          conversa.push(conteudo)
          const respostas = await Promise.all(chamadas.slice(0, 4).map(async (p) => {
            const codigo = String(p.functionCall.args?.codigo ?? '').toUpperCase().trim(), a = alunoDe.get(codigo)
            if (!a) return { functionResponse: { name: 'ver_aluno', response: { erro: 'Código desconhecido.' } } }
            const lt = await rpc('teeds_psicologia_aluno', { p_marca: marca, p_user: a.user_id })
            const linha = lt.ok ? await lt.json() : null
            return { functionResponse: { name: 'ver_aluno', response: linha ? { aluno: codigo, cidade: linha.aluno?.cidade ?? null, eventos: (linha.eventos ?? []).slice(-260) } : { erro: 'Não consegui ler a linha do tempo.' } } }
          }))
          conversa.push({ role: 'user', parts: respostas })
          continue
        }
        const texto = partes.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim()
        if (!texto) throw new Error(`${modelo}: resposta vazia`)
        return json({ resposta: mostrar(texto), modelo, alunos_citados: [...new Set([...texto.matchAll(/\bA(\d{3,4})\b/g)].map((m) => alunoDe.get(m[0])?.user_id).filter(Boolean))].slice(0, 12) })
      }
    } catch (e) {
      const st = (e as { status?: number }).status
      falhas.push(String((e as Error).message).slice(0, 180))
      if (st === 401 || st === 403) return json({ erro: 'A chave do Gemini foi recusada. Confira a chave em Visão geral › Inteligência do negócio.' }, 502)
      if (st === 400 && anexos.length) return json({ erro: 'O Gemini não conseguiu ler esse anexo. Tente outro formato (foto JPG, áudio, PDF) ou um arquivo menor.' }, 422)
    }
  }
  console.error('consultor sem resposta', falhas.join(' | '))
  return json({ erro: 'A I.A. está congestionada agora e não respondeu. Tente de novo em instantes.' }, 503)
})
