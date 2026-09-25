/* A landing de captação. Uma página, duas marcas: o domínio decide qual. */
const host = location.hostname.toLowerCase()
const params = new URLSearchParams(location.search)
const local = host === 'localhost' || host === '127.0.0.1'
const marca = host.includes('omni') || (local && params.get('marca') === 'omni') ? 'omni' : 'teeds'

/* Os robôs de cada marca, com a regra em uma linha. Os ids são os do motor. */
const ROBOS = {
  superior5: { regra: 'Over 6', ganha: [7, 8, 9], texto: 'Espera quatro dígitos seguidos que teriam perdido (loss virtual) e só então entra. Ganha quando o último dígito é 7, 8 ou 9. Tem modo Conservador e modo Agressivo.' },
  ag2: { regra: 'Under 3', ganha: [0, 1, 2], texto: 'Mesma leitura do AG7, do outro lado: espera quatro dígitos seguidos que teriam perdido e então entra. Ganha com 0, 1 ou 2. Tem modo Conservador e modo Agressivo.' },
  smart03: { regra: 'Over 3', ganha: [4, 5, 6, 7, 8, 9], texto: 'Contratos de 1 tick; ganha com 4, 5, 6, 7, 8 ou 9. A recuperação liga na primeira perda e usa o retorno real do contrato.' },
  goreme: { regra: 'Under 9', ganha: [0, 1, 2, 3, 4, 5, 6, 7, 8], texto: 'Ganha com qualquer dígito de 0 a 8. O retorno por acerto é pequeno, então a recuperação liga já na primeira perda.' },
  firstblock: { regra: 'Under 5', ganha: [0, 1, 2, 3, 4], texto: 'Espera dois dígitos seguidos da outra metade (loss virtual) e então entra. Ganha com 0, 1, 2, 3 ou 4, e recupera só o necessário.' },
  secondblock: { regra: 'Over 4', ganha: [5, 6, 7, 8, 9], texto: 'Mesma regra do First Block, na metade de cima: espera dois dígitos seguidos da outra metade e entra. Ganha com 5, 6, 7, 8 ou 9.' },
  thepalm: { regra: 'Under 9 → Under 5', ganha: [0, 1, 2, 3, 4, 5, 6, 7, 8], payout: 0.115, recuperacao: { ganha: [0, 1, 2, 3, 4], payout: 0.95, chance: 0.86 }, texto: 'Analisa 25 dígitos, arma entradas reais em Under 9 depois de uma perda virtual e troca para Under 5 na recuperação, com o payout real no cálculo.' },
}
const config = marca === 'omni' ? {
  nome: 'OMNI', cor: '#6c93c6', escura: '#0e2a4e', emblema: '/omni-marca.png', assinatura: 'FINANCIAL INTELLIGENCE',
  intro: 'A OMNI reúne robôs de operação, gestão de risco e acompanhamento ao vivo em uma plataforma só. Você define quanto quer ganhar e quanto aceita perder; o robô cuida da execução, 24 horas, na sua conta da corretora.',
  demo: { id: 'firstblock', nome: 'Sessão demonstrativa' },
  fotos: [['omni-robos.webp', 'Robôs', 'Cada robô numa linha, com a cabine aberta mostrando a análise, as operações e a curva da sessão.'], ['omni-gerenciamento.webp', 'Gerenciamento', 'A planilha que calcula entrada, limites e objetivo antes de ligar o robô.'], ['omni-aulas.webp', 'Aulas', 'O treinamento da plataforma, do primeiro acesso à leitura de dígitos.'], ['omni-marketplace.webp', 'Marketplace', 'Ferramentas e produtos da casa, como o Simulador de Treinamento.']],
} : {
  nome: 'TEEDS', cor: '#d2aa51', escura: '#8c6926', emblema: '/teeds-marca.png', assinatura: 'TRADING TECHNOLOGY',
  intro: 'A Teeds reúne robôs de operação, gestão de risco e acompanhamento ao vivo em uma plataforma só. Você define quanto quer ganhar e quanto aceita perder; o robô cuida da execução, 24 horas, na sua conta da corretora.',
  demo: { id: 'thepalm', nome: 'Sessão demonstrativa' },
  fotos: [['teeds-robos.webp', 'Robôs', 'Cada robô numa linha, com a cabine aberta mostrando a análise, as operações e a curva da sessão.'], ['teeds-gerenciamento.webp', 'Gerenciamento', 'A planilha que calcula entrada, limites e objetivo antes de ligar o robô.'], ['teeds-aulas.webp', 'Aulas', 'O treinamento da plataforma, do primeiro acesso à leitura de dígitos.'], ['teeds-marketplace.webp', 'Marketplace', 'Ferramentas e produtos da casa, como o Simulador de Treinamento.']],
}
document.documentElement.dataset.marca = marca
document.documentElement.style.setProperty('--cor', config.cor)
document.documentElement.style.setProperty('--cor-escura', config.escura)
document.querySelectorAll('body [data-marca]').forEach(el => { el.textContent = config.nome })
document.querySelectorAll('[data-logo]').forEach(el => { el.src = config.emblema })
document.querySelectorAll('[data-assinatura]').forEach(el => { el.textContent = config.assinatura })
document.querySelector('[data-intro]').textContent = config.intro
document.title = `${config.nome} · Robôs de operação com gestão de risco`
document.querySelector('[data-favicon-ico]').href = `/pwa-${marca}/favicon.ico`
document.querySelectorAll('[data-favicon]').forEach(el => { el.href = `/pwa-${marca}/favicon-${el.dataset.favicon}.png` })
document.querySelector('[data-apple-icon]').href = `/pwa-${marca}/icon-180.png`
document.querySelector('meta[name="theme-color"]').content = marca === 'omni' ? '#081525' : '#090a0d'

/* ------------------------------------------------------ galeria */
const galeriaEl = document.querySelector('[data-galeria]')
for (const [arquivo, titulo, legenda] of config.fotos) {
  const fig = document.createElement('figure')
  fig.innerHTML = `<div class="moldura"><img loading="lazy" decoding="async" alt=""></div><figcaption><b></b><span></span></figcaption>`
  fig.querySelector('img').src = `./plataforma/${arquivo}`
  fig.querySelector('img').alt = `Tela ${titulo} da plataforma ${config.nome}`
  fig.querySelector('b').textContent = titulo
  fig.querySelector('span').textContent = legenda
  galeriaEl.appendChild(fig)
}

/* ------------------------------------------------ sessões na prática */
/* Vinte sessões ILUSTRATIVAS, geradas com semente fixa: 18 positivas (meta ou
   encerramento manual no lucro) e 2 negativas (stop). Está escrito na tela. */
;(() => {
  const el = document.querySelector('[data-sessoes]'); if (!el) return
  let semente = 777
  const sortear = () => { semente |= 0; semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const entre = (a, b) => a + sortear() * (b - a)
  const num = v => Math.abs(v).toFixed(2).replace('.', ',')
  const sessoes = []
  for (let i = 0; i < 20; i++) {
    const negativa = i === 6 || i === 15
    const robo = `Sessão de exemplo ${String(i + 1).padStart(2, '0')}`
    const meta = [20, 30, 50, 80, 100, 150, 200][Math.floor(sortear() * 7)]
    const resultado = negativa ? -Math.round(entre(0.45, 0.8) * meta * 100) / 100 : Math.round(entre(0.92, 1.06) * meta * 100) / 100
    const ops = Math.round(entre(9, 64)), ganhas = negativa ? Math.round(ops * entre(0.42, 0.55)) : Math.round(ops * entre(0.68, 0.92))
    const minutos = Math.round(entre(6, 95))
    // curva: ruído com deriva até o resultado
    const pontos = [0]; let v = 0
    for (let k = 1; k <= 24; k++) { const alvo = resultado * k / 24; v = alvo + (sortear() - 0.5) * meta * 0.25 * (1 - k / 24); pontos.push(k === 24 ? resultado : v) }
    sessoes.push({ robo, meta, resultado, ops, ganhas, minutos, pontos, negativa })
  }
  for (const s of sessoes) {
    const art = document.createElement('article')
    art.className = `sessao ${s.negativa ? 'stop' : 'meta'}`
    const min = Math.min(...s.pontos, 0), max = Math.max(...s.pontos, 1)
    const x = i => (i / 24) * 200, y = p => 44 - ((p - min) / (max - min || 1)) * 40
    const d = s.pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
    art.innerHTML = `<header><b></b><span class="selo"></span></header><strong class="valor"></strong><svg viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg><footer><span><i>Operações</i><b></b></span><span><i>Acertos</i><b></b></span><span><i>Duração</i><b></b></span></footer>`
    art.querySelector('header b').textContent = s.robo
    art.querySelector('.selo').textContent = s.negativa ? 'Parou no stop' : 'Meta batida'
    art.querySelector('.valor').textContent = `${s.resultado < 0 ? '−' : '+'}${num(s.resultado)} USD`
    const f = art.querySelectorAll('footer b'); f[0].textContent = String(s.ops); f[1].textContent = `${s.ganhas} de ${s.ops}`; f[2].textContent = `${s.minutos} min`
    el.appendChild(art)
  }
})()

/* ---------------------------------------------------------------- FAQ */
const FAQ = [
  ['Preciso ter experiência para usar?', `Não. A plataforma foi feita para quem está começando: aulas curtas dentro dela, conta demo com dinheiro fictício e a equipe ${config.nome} acompanhando a configuração. Quem já opera encontra gráfico, indicadores e operação manual também.`],
  ['Onde fica o meu dinheiro?', `Na sua própria conta na Deriv, corretora internacional com mais de 20 anos de mercado. A ${config.nome} recebe apenas uma autorização para operar; depósitos e saques são feitos por você, direto na corretora. A plataforma nunca guarda saldo.`],
  ['Posso perder dinheiro?', 'Pode. Toda operação financeira envolve risco, e ninguém sério promete ganho garantido. O que a plataforma faz é colocar o risco sob controle: você define o stop de perda antes de ligar e o robô para ali. O quanto arriscar é sempre decisão sua.'],
  ['Quanto preciso para começar?', 'Você pode começar na conta demo, sem dinheiro nenhum, e conhecer tudo com calma. Na conta real, a entrada mínima por operação é pequena (a partir de US$ 0,35) e o valor total é você quem define.'],
  ['O robô opera sozinho? Preciso deixar o computador ligado?', 'Ele opera no nosso servidor, 24 horas, com a sua conta conectada. Pode fechar o notebook ou trancar o celular: o robô continua e para sozinho quando bater a meta ou o stop.'],
  ['Consigo acompanhar o que o robô está fazendo?', 'Tudo, ao vivo: os dígitos que chegam, a entrada armada, o contrato aberto, o resultado de cada operação e a curva da sessão. Depois, o histórico completo fica guardado para você revisar.'],
  ['Funciona no celular?', 'Sim. A plataforma roda no navegador e pode ser instalada como app na tela inicial do iPhone ou do Android, com o mesmo acesso e as mesmas telas.'],
  ['E se eu quiser parar?', 'Um toque em "Desligar" e o robô para. Você também pode remover a autorização na corretora a qualquer momento. Sem fidelidade, sem burocracia.'],
  ['Como funciona a fila de espera?', 'O cadastro é gratuito. Nesta primeira etapa, as vagas são limitadas e o acesso à plataforma é gratuito para os cadastros aprovados. A inscrição não libera o acesso automaticamente: após a aprovação, as instruções chegam por e-mail.'],
]
const faqEl = document.querySelector('[data-faq]')
for (const [pergunta, resposta] of FAQ) {
  const det = document.createElement('details')
  det.innerHTML = `<summary><span></span><i aria-hidden="true">+</i></summary><p></p>`
  det.querySelector('span').textContent = pergunta
  det.querySelector('p').textContent = resposta
  faqEl.appendChild(det)
}

/* ------------------------------------------- a cabine (cenário pré-calculado) */
/* Uma sessão FICTÍCIA, calculada uma vez com semente fixa: começa perto de
   +US$ 4, sobe com altos e baixos e termina em +US$ 200 (meta). A regra dos
   dígitos é a do robô da marca; os preços são inventados com o último dígito
   coerente com o resultado. Está escrito na tela que é demonstração. */
;(() => {
  const raiz = document.querySelector('[data-demo]'); if (!raiz) return
  const robo = ROBOS[config.demo.id]
  const q = sel => raiz.querySelector(sel)
  q('[data-demo-robo]').textContent = config.demo.nome
  const META = 200, STOP = 100, BASE = robo.recuperacao ? 25 : 3
  const PAYOUT = robo.payout ?? 0.95
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches
  const num = v => Math.abs(v).toFixed(2).replace('.', ',')
  const assinado = v => `${v < 0 ? '−' : '+'}${num(v)}`
  let semente = 20260915
  const sortear = () => { semente |= 0; semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const escolher = lista => lista[Math.floor(sortear() * lista.length)]
  const grupo = robo.ganha, fora = [0,1,2,3,4,5,6,7,8,9].filter(d => !grupo.includes(d))

  // 1) o roteiro: ganhos e perdas com progressão, em unidades de entrada base
  const roteiro = []
  let valor = 1, seguidas = 0, acumulado = 0, perdaAberta = 0
  for (let i = 0; i < (robo.recuperacao ? 96 : 118); i++) {
    if (robo.recuperacao && perdaAberta > 0) {
      // recuperação (Under 5): entrada dimensionada para cobrir a perda e ainda deixar o lucro base
      const rec = robo.recuperacao
      const v = +((perdaAberta + PAYOUT) / rec.payout).toFixed(4)
      const ganhou = sortear() < rec.chance
      const lucro = ganhou ? +(v * rec.payout).toFixed(4) : -v
      acumulado += lucro
      roteiro.push({ ganhou, valor: v, lucro, ganha: rec.ganha, recuperacao: true })
      perdaAberta = ganhou ? 0 : perdaAberta + v
      continue
    }
    // fases: começo tranquilo (+4), meio com quedas maiores, fim subindo até a meta
    const chance = robo.recuperacao ? (i < 8 ? 0.97 : i < 45 ? 0.86 : i < 70 ? 0.83 : 0.9) : (i < 6 ? 0.9 : i < 40 ? 0.66 : i < 75 ? 0.6 : 0.72)
    const ganhou = sortear() < chance
    const lucro = ganhou ? +(valor * PAYOUT).toFixed(4) : -valor
    acumulado += lucro
    roteiro.push({ ganhou, valor, lucro, ganha: robo.ganha })
    if (robo.recuperacao) { if (!ganhou) perdaAberta = valor }
    else if (ganhou) { valor = 1; seguidas = 0 } else { seguidas += 1; valor = Math.min(valor * 2.1, 9) }
  }
  // 2) escala para terminar exatamente na meta e nunca cruzar o stop
  const escala = (META / BASE) / acumulado
  let piso = 0, soma = 0
  for (const op of roteiro) { op.valor = +(op.valor * BASE * escala).toFixed(2); op.lucro = +(op.lucro * BASE * escala).toFixed(2); soma += op.lucro; piso = Math.min(piso, soma) }
  const ultimo = roteiro[roteiro.length - 1]; ultimo.lucro = +(ultimo.lucro + (META - soma)).toFixed(2)
  if (piso < -STOP * 0.7) console.warn('[demo] o roteiro se aproxima do stop', piso)

  // 3) a tela
  const fita = q('[data-demo-fita]'), tabela = q('[data-demo-tabela]'), curvaLinha = q('[data-demo-linha]'), curvaArea = q('[data-demo-area]')
  let digitos = [], curva = [0], resultado = 0, ops = 0, ganhas = 0, indice = 0, preco = 45631.12
  const desenhar = () => {
    const pontos = curva.slice(-60), n = pontos.length, min = Math.min(...pontos, 0), max = Math.max(...pontos, 1)
    const x = i => n > 1 ? (i / (n - 1)) * 560 : 0, y = v => 56 - ((v - min) / (max - min || 1)) * 50
    const d = pontos.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    curvaLinha.setAttribute('d', d); curvaArea.setAttribute('d', `${d} L560 60 L0 60Z`)
    curvaLinha.style.stroke = resultado >= 0 ? '#42cb84' : '#ff6868'
  }
  const empurrarDigito = d => {
    digitos.push(d); if (digitos.length > 16) digitos.shift()
    if (!fita) return   // a fita de dígitos saiu da landing (15/09/2026); a plataforma continua com ela
    fita.innerHTML = ''
    digitos.forEach((v, i) => { const s = document.createElement('span'); s.textContent = String(v); s.className = `tv-d ${grupo.includes(v) ? 'up' : 'down'} ${i === digitos.length - 1 ? 'agora' : ''}`; fita.appendChild(s) })
  }
  const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const precoCom = digito => { preco += (sortear() - 0.5) * 6; const base = Math.floor(preco * 100) / 100; return +(Math.floor(base * 10) / 10 + digito / 100).toFixed(2) }
  const atualizarResumo = () => {
    q('[data-demo-ops]').textContent = String(ops); q('[data-demo-ops2]').textContent = `(${ops})`
    q('[data-demo-ganhas]').textContent = String(ganhas); q('[data-demo-perdas]').textContent = String(ops - ganhas)
    const r = q('[data-demo-resultado]'); r.innerHTML = `${assinado(resultado)} <small>USD</small>`; r.className = resultado >= 0 ? 'up' : 'down'
    const a = q('[data-demo-atual]'); a.textContent = `${assinado(resultado)} USD`; a.className = resultado >= 0 ? 'up' : 'down'
    q('[data-demo-stop]').textContent = `USD ${num(Math.max(0, STOP + resultado))}`
    q('[data-demo-falta]').textContent = `USD ${num(Math.max(0, META - resultado))}`
    q('[data-demo-cursor]').style.left = `${Math.min(100, Math.max(0, (resultado + STOP) / (META + STOP) * 100))}%`
    q('[data-demo-cursor]').className = resultado >= 0 ? 'up' : 'down'
  }
  const etapa = (aberto, op) => {
    q('[data-demo-etapa1]').textContent = aberto ? '●' : ops ? '✓' : '1'
    q('[data-demo-etapa1-titulo]').textContent = aberto ? 'Contrato aberto' : ops ? 'Último contrato' : 'Aguardando entrada'
    q('[data-demo-etapa1-sub]').textContent = aberto ? hora() : ops ? hora() : 'monitorando o mercado'
    q('[data-demo-fase]').textContent = aberto ? (op && op.recuperacao ? 'Recuperando' : 'Contrato aberto') : (op && !op.ganhou) ? 'Recuperando' : robo.recuperacao ? 'Analisando mercado' : 'Analisando mercado'
    const e2 = q('[data-demo-etapa2]'); e2.className = `tv-etapa ${!aberto && ops ? 'ativa concluida' : ''}`
    e2.querySelector('i').textContent = !aberto && ops ? '✓' : '2'
    q('[data-demo-etapa2-sub]').textContent = aberto ? 'aguardando resultado…' : op ? `${op.ganhou ? 'ganho' : 'perda'} ${assinado(op.lucro)} USD` : 'próxima etapa'
    q('.tv-fluxo').className = `tv-fluxo ${aberto ? 'aberto' : ops ? 'fechado' : ''}`
  }
  const registrar = (op, entrada, saida, dIn, dOut) => {
    const tr = document.createElement('tr'); tr.className = op.ganhou ? 'ganhou' : 'perdeu'
    tr.innerHTML = `<td>${ops}</td><td class="oculta">${hora()}</td><td>${num(op.valor)}</td><td class="oculta">${entrada.toFixed(2)} <b class="chip">${dIn}</b></td><td>${saida.toFixed(2)} <b class="chip ${op.ganhou ? 'up' : 'down'}">${dOut}</b></td><td class="${op.ganhou ? 'up' : 'down'} forte">${assinado(op.lucro)}</td>`
    tabela.prepend(tr); while (tabela.children.length > 8) tabela.lastChild.remove()
  }
  let parado = false
  const passo = () => {
    if (parado) return
    if (indice >= roteiro.length) { q('[data-demo-fase]').textContent = 'Meta atingida'; q('[data-demo-etapa1-titulo]').textContent = 'Meta atingida'; q('[data-demo-etapa1-sub]').textContent = 'o robô encerrou sozinho'; parado = true; setTimeout(reiniciar, 9000); return }
    const op = roteiro[indice]
    // tick de espera (dígito qualquer), depois compra, depois resultado
    empurrarDigito(escolher([...grupo, ...fora]))
    q('[data-demo-entrada]').innerHTML = `${num(op.valor)} <i>USD</i>`
    setTimeout(() => {
      if (parado) return
      const dIn = escolher([...grupo, ...fora]); const entrada = precoCom(dIn); empurrarDigito(dIn); etapa(true, op)
      setTimeout(() => {
        if (parado) return
        const g = op.ganha ?? grupo, f = [0,1,2,3,4,5,6,7,8,9].filter(d => !g.includes(d))
        const dOut = escolher(op.ganhou ? g : f); const saida = precoCom(dOut); empurrarDigito(dOut)
        ops += 1; if (op.ganhou) ganhas += 1
        resultado = +(resultado + op.lucro).toFixed(2); curva.push(resultado)
        indice += 1
        registrar(op, entrada, saida, dIn, dOut); atualizarResumo(); desenhar(); etapa(false, op)
        const prox = roteiro[indice]; if (prox) q('[data-demo-entrada]').innerHTML = `${num(prox.valor)} <i>USD</i>`
        setTimeout(passo, reduzido ? 2600 : 700 + sortear() * 500)
      }, reduzido ? 1400 : 650)
    }, reduzido ? 900 : 350)
  }
  const reiniciar = () => { digitos = []; curva = [0]; resultado = 0; ops = 0; ganhas = 0; indice = 0; parado = false; if (fita) fita.innerHTML = ''; tabela.innerHTML = ''; atualizarResumo(); desenhar(); etapa(false, null); setTimeout(passo, 600) }
  reiniciar()
})()

/* ---------------------------------------------------- comportamento */
const inicio = Date.now()
let profundidade = 0
const ctaFixo = document.querySelector('.cta-fixo')
addEventListener('scroll', () => {
  const total = document.documentElement.scrollHeight - innerHeight
  profundidade = Math.max(profundidade, total > 0 ? Math.round(scrollY / total * 100) : 100)
  const cadastro = document.querySelector('#cadastro').getBoundingClientRect()
  ctaFixo.classList.toggle('visivel', scrollY > 600 && cadastro.top > innerHeight)
}, { passive: true })

function armazenamentoLer(chave) { try { return localStorage.getItem(chave) } catch { return null } }
const chaveVisitas = `visitas-captura-${marca}`
const visitas = Math.min(1000, Number(armazenamentoLer(chaveVisitas) || 0) + 1)
try { localStorage.setItem(chaveVisitas, String(visitas)) } catch {}
const form = document.querySelector('#form-lead')
const telefone = form.elements.telefone
telefone.addEventListener('input', () => {
  const d = telefone.value.replace(/\D/g, '').slice(0, 11)
  telefone.value = d.length <= 10 ? d.replace(/^(\d{0,2})(\d{0,4})(\d{0,4})$/, (_,a,b,c) => `${a?'('+a:''}${a.length===2?') ':''}${b}${c?'-'+c:''}`) : d.replace(/^(\d{2})(\d{5})(\d{0,4})$/, '($1) $2-$3')
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  const mensagem = form.querySelector('.mensagem'), botao = form.querySelector('button')
  if (!form.reportValidity()) return
  botao.disabled = true; botao.textContent = 'Enviando…'; mensagem.textContent = ''
  const dados = Object.fromEntries(new FormData(form))
  const utm = new URLSearchParams(location.search)
  try {
    const resposta = await fetch('https://motor.teedscompany.com/publico/leads', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...dados, marca, consentiu: form.elements.consentiu.checked,
        tempo: Math.round((Date.now() - inicio) / 1000), profundidade, visitas, pagina: location.href,
        campanha: utm.get('utm_campaign'), origem: utm.get('utm_source'), meio: utm.get('utm_medium'), conteudo: utm.get('utm_content'), termo: utm.get('utm_term') }),
    })
    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível enviar agora.')
    // Só avança depois de o motor confirmar que o lead foi preservado. O nome
    // vai só para personalizar a próxima tela (ela usa textContent, nunca HTML).
    const proxima = new URL('./obrigado/', location.href)
    proxima.searchParams.set('nome', String(dados.nome).trim().split(/\s+/)[0])
    for (const [chave, valor] of utm) if (chave.startsWith('utm_')) proxima.searchParams.set(chave, valor)
    location.assign(proxima)
  } catch (e) {
    mensagem.textContent = e.message; mensagem.className = 'mensagem erro'
    botao.disabled = false; botao.innerHTML = 'Tentar novamente <span>→</span>'
  }
})
