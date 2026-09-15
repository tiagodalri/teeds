/* A landing de captação. Uma página, duas marcas: o domínio decide qual. */
const host = location.hostname.toLowerCase()
const params = new URLSearchParams(location.search)
const local = host === 'localhost' || host === '127.0.0.1'
const marca = host.includes('omni') || (local && params.get('marca') === 'omni') ? 'omni' : 'teeds'

/* Os robôs de cada marca, com a regra em uma linha. Os ids são os do motor. */
const ROBOS = {
  superior5: { regra: 'Over 6', ganha: [7, 8, 9], texto: 'Ganha quando o último dígito é 7, 8 ou 9. Entra em toda operação; mantém o valor até o gatilho e, a partir daí, recupera com progressão.' },
  ag2: { regra: 'Under 3', ganha: [0, 1, 2], texto: 'Lê os 25 últimos dígitos e só entra quando 0, 1 e 2 somam pelo menos 36%. Ganha se o próximo dígito for 0, 1 ou 2.' },
  smart03: { regra: 'Over 3', ganha: [4, 5, 6, 7, 8, 9], texto: 'Contratos de 1 tick; ganha com 4, 5, 6, 7, 8 ou 9. A progressão recupera a sequência usando o retorno real do contrato.' },
  goreme: { regra: 'Under 9', ganha: [0, 1, 2, 3, 4, 5, 6, 7, 8], texto: 'Ganha com qualquer dígito de 0 a 8. O retorno por acerto é pequeno, então a recuperação liga já na primeira perda.' },
  firstblock: { regra: 'Under 5', ganha: [0, 1, 2, 3, 4], texto: 'Ganha com 0, 1, 2, 3 ou 4. Entra em toda operação com o valor base e recupera só o necessário depois do gatilho.' },
  secondblock: { regra: 'Over 4', ganha: [5, 6, 7, 8, 9], texto: 'Ganha com 5, 6, 7, 8 ou 9. Entra em toda operação com o valor base e recupera só o necessário depois do gatilho.' },
  thepalm: { regra: 'Under 9 → Under 5', ganha: [0, 1, 2, 3, 4, 5, 6, 7, 8], texto: 'Analisa 25 dígitos, arma entradas reais em Under 9 depois de uma perda virtual e troca para Under 5 na recuperação, com o payout real no cálculo.' },
}
const config = marca === 'omni' ? {
  nome: 'OMNI', cor: '#6c93c6', escura: '#0e2a4e', emblema: '/omni-marca.png', assinatura: 'FINANCIAL INTELLIGENCE',
  intro: 'A OMNI reúne robôs de operação, gestão de risco e acompanhamento ao vivo em uma plataforma só. Você define quanto quer ganhar e quanto aceita perder; o robô cuida da execução, 24 horas, na sua conta da corretora.',
  robos: [['ag2', 'OMNI Under'], ['superior5', 'OMNI Over'], ['firstblock', 'OMNI Bull'], ['secondblock', 'OMNI Bear']],
  demo: { id: 'firstblock', nome: 'OMNI Bull' },
} : {
  nome: 'TEEDS', cor: '#d2aa51', escura: '#8c6926', emblema: '/teeds-marca.png', assinatura: 'TRADING TECHNOLOGY',
  intro: 'A Teeds reúne robôs de operação, gestão de risco e acompanhamento ao vivo em uma plataforma só. Você define quanto quer ganhar e quanto aceita perder; o robô cuida da execução, 24 horas, na sua conta da corretora.',
  robos: [['superior5', 'Teeds AG7'], ['ag2', 'Teeds AG2'], ['thepalm', 'The Palm'], ['smart03', 'Teeds Smart 03'], ['goreme', 'Teeds Göreme'], ['firstblock', 'First Block'], ['secondblock', 'Second Block']],
  demo: { id: 'firstblock', nome: 'First Block' },
}
document.documentElement.dataset.marca = marca
document.documentElement.style.setProperty('--cor', config.cor)
document.documentElement.style.setProperty('--cor-escura', config.escura)
document.querySelectorAll('body [data-marca]').forEach(el => { el.textContent = config.nome })
document.querySelectorAll('[data-logo]').forEach(el => { el.src = config.emblema })
document.querySelectorAll('[data-assinatura]').forEach(el => { el.textContent = config.assinatura })
document.querySelector('[data-intro]').textContent = config.intro
document.title = `${config.nome} · Robôs de operação com gestão de risco`

/* ------------------------------------------------------------- robôs */
const robosEl = document.querySelector('[data-robos]')
for (const [id, nome] of config.robos) {
  const r = ROBOS[id]
  const art = document.createElement('article')
  art.className = 'robo'
  art.innerHTML = `<header><b></b><span></span></header><p></p><div class="robo-digitos" aria-label="Dígitos que ganham"></div>`
  art.querySelector('b').textContent = nome
  art.querySelector('header span').textContent = r.regra
  art.querySelector('p').textContent = r.texto
  const digitos = art.querySelector('.robo-digitos')
  for (let d = 0; d <= 9; d++) { const s = document.createElement('i'); s.textContent = String(d); if (r.ganha.includes(d)) s.className = 'on'; digitos.appendChild(s) }
  robosEl.appendChild(art)
}

/* ------------------------------------------------------- depoimentos */
/* ATENÇÃO: depoimentos ILUSTRATIVOS, escritos para ocupar o lugar até os
   reais chegarem (pedido do Tiago em 15/09/2026). Trocar antes de anunciar. */
const DEPOIMENTOS = [
  { nome: 'Rafael M.', onde: 'Curitiba, PR', desde: 'cliente há 4 meses', texto: 'Eu operava no impulso e vivia devolvendo o que ganhava. Com a meta e o stop definidos antes, o robô para na hora certa. Foi o que me faltava: disciplina que eu não tinha sozinho.' },
  { nome: 'Juliana T.', onde: 'Belo Horizonte, MG', desde: 'cliente há 7 meses', texto: 'O que me convenceu foi ver a cabine ao vivo: cada dígito, cada entrada, cada resultado. Não é caixa-preta. Hoje acompanho pelo celular enquanto trabalho.' },
  { nome: 'Carlos E.', onde: 'Recife, PE', desde: 'cliente há 3 meses', texto: 'Comecei na conta demo, com medo. Depois de duas semanas entendendo a gestão, passei para a real com um valor pequeno e fui subindo. O suporte respondeu tudo, até pergunta boba.' },
  { nome: 'Amanda R.', onde: 'Porto Alegre, RS', desde: 'cliente há 5 meses', texto: 'Não sei nada de programação e não precisei saber. Escolhi o robô, coloquei os limites e pronto. O que eu mais gosto é o histórico: dá para revisar o dia inteiro em dois minutos.' },
]
const depEl = document.querySelector('[data-depoimentos]')
for (const d of DEPOIMENTOS) {
  const art = document.createElement('article')
  art.className = 'depoimento'; art.dataset.ilustrativo = 'sim'
  art.innerHTML = `<div class="estrelas" aria-label="5 de 5">★★★★★</div><p></p><footer><i></i><span><b></b><small></small></span></footer>`
  art.querySelector('p').textContent = `“${d.texto}”`
  art.querySelector('i').textContent = d.nome[0]
  art.querySelector('b').textContent = d.nome
  art.querySelector('small').textContent = `${d.onde} · ${d.desde}`
  depEl.appendChild(art)
}

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
  ['Qual o custo?', 'O cadastro e a apresentação são gratuitos. Na apresentação a equipe mostra os planos e você decide se faz sentido para você. Sem cobrança automática por esta página.'],
]
const faqEl = document.querySelector('[data-faq]')
for (const [pergunta, resposta] of FAQ) {
  const det = document.createElement('details')
  det.innerHTML = `<summary><span></span><i aria-hidden="true">+</i></summary><p></p>`
  det.querySelector('span').textContent = pergunta
  det.querySelector('p').textContent = resposta
  faqEl.appendChild(det)
}

/* ----------------------------------------------- a cabine animada (demo) */
/* Valores ILUSTRATIVOS. A regra é a do robô escolhido (dígitos que ganham);
   a sequência de dígitos é sorteada com leve viés a favor para a demonstração
   mostrar a gestão funcionando (progressão, meta). Está escrito na tela. */
;(() => {
  const raiz = document.querySelector('[data-demo]'); if (!raiz) return
  const robo = ROBOS[config.demo.id]
  raiz.querySelector('[data-demo-robo]').textContent = config.demo.nome
  const fita = raiz.querySelector('[data-demo-fita]'), log = raiz.querySelector('[data-demo-log]')
  const resultadoEl = raiz.querySelector('[data-demo-resultado]'), opsEl = raiz.querySelector('[data-demo-ops]'), acertoEl = raiz.querySelector('[data-demo-acerto]'), entradaEl = raiz.querySelector('[data-demo-entrada]')
  const linha = raiz.querySelector('[data-demo-linha]'), area = raiz.querySelector('[data-demo-area]')
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches
  const usd = v => `${v < 0 ? '− ' : '+ '}US$ ${Math.abs(v).toFixed(2).replace('.', ',')}`
  let digitos = [], curva = [0], resultado = 0, ops = 0, ganhas = 0, entrada = 1, perdasSeguidas = 0, armado = false, tick = 0
  const desenhar = () => {
    const n = curva.length, min = Math.min(...curva, 0), max = Math.max(...curva, 1)
    const x = i => n > 1 ? (i / (n - 1)) * 560 : 0, y = v => 140 - ((v - min) / (max - min || 1)) * 120
    const d = curva.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    linha.setAttribute('d', d); area.setAttribute('d', `${d} L560 150 L0 150Z`)
  }
  const registrar = (texto, classe) => {
    const li = document.createElement('li'); li.className = classe; li.textContent = texto
    log.prepend(li); while (log.children.length > 4) log.lastChild.remove()
  }
  const passo = () => {
    tick += 1
    // sorteio com viés leve: 58% de chance de sair um dígito do grupo quando há contrato armado
    const doGrupo = armado ? Math.random() < 0.58 : Math.random() < 0.5
    const grupo = robo.ganha, fora = [0,1,2,3,4,5,6,7,8,9].filter(d => !grupo.includes(d))
    const d = (doGrupo ? grupo : fora)[Math.floor(Math.random() * (doGrupo ? grupo.length : fora.length))]
    digitos.push(d); if (digitos.length > 14) digitos.shift()
    fita.innerHTML = ''
    digitos.forEach((v, i) => { const s = document.createElement('i'); s.textContent = String(v); s.className = `${grupo.includes(v) ? 'on' : ''} ${i === digitos.length - 1 ? 'ultimo' : ''}`; fita.appendChild(s) })
    if (armado) {
      armado = false; ops += 1
      const ganhou = grupo.includes(d)
      const lucro = ganhou ? +(entrada * 0.92).toFixed(2) : -entrada
      resultado = +(resultado + lucro).toFixed(2); curva.push(resultado); if (curva.length > 40) curva.shift()
      if (ganhou) { ganhas += 1; perdasSeguidas = 0; entrada = 1; registrar(`Ganhou ${usd(lucro)} · dígito ${d}`, 'ganho') }
      else { perdasSeguidas += 1; entrada = Math.min(8, +(entrada * 2.1).toFixed(2)); registrar(`Perdeu ${usd(lucro)} · dígito ${d} · próxima entrada US$ ${entrada.toFixed(2)}`, 'perda') }
      resultadoEl.textContent = usd(resultado); resultadoEl.className = resultado >= 0 ? 'positivo' : 'negativo'
      opsEl.textContent = String(ops); acertoEl.textContent = `${ops ? Math.round(ganhas / ops * 100) : 0}%`; entradaEl.textContent = `US$ ${entrada.toFixed(2)}`
      desenhar()
      if (resultado >= 20) { registrar('Meta de US$ 20,00 atingida · robô encerrou a sessão', 'meta'); raiz.querySelector('.cabine-status').textContent = 'Meta batida'; setTimeout(reiniciar, 6000); return }
    } else if (tick % 3 === 0) {
      armado = true; registrar(`Comprou ${robo.regra} · US$ ${entrada.toFixed(2)}`, 'compra')
    }
    setTimeout(passo, reduzido ? 2400 : 900 + Math.random() * 400)
  }
  const reiniciar = () => { digitos = []; curva = [0]; resultado = 0; ops = 0; ganhas = 0; entrada = 1; perdasSeguidas = 0; armado = false; tick = 0; log.innerHTML = ''; raiz.querySelector('.cabine-status').textContent = 'Operando'; resultadoEl.textContent = usd(0); resultadoEl.className = 'positivo'; opsEl.textContent = '0'; acertoEl.textContent = '0%'; desenhar(); setTimeout(passo, 800) }
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

const chaveVisitas = `visitas-captura-${marca}`
const visitas = Math.min(1000, Number(localStorage.getItem(chaveVisitas) || 0) + 1)
localStorage.setItem(chaveVisitas, String(visitas))
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
