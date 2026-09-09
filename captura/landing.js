const host = location.hostname.toLowerCase()
const params = new URLSearchParams(location.search)
const local = host === 'localhost' || host === '127.0.0.1'
const marca = host.includes('omni') || (local && params.get('marca') === 'omni') ? 'omni' : 'teeds'
const config = marca === 'omni' ? {
  nome: 'OMNI', cor: '#6c93c6', escura: '#0e2a4e', serif: false, emblema: '/omni-marca.png', assinatura: 'FINANCIAL INTELLIGENCE',
  intro: 'Tecnologia, organização e inteligência para transformar a forma como você acompanha suas operações.',
} : {
  nome: 'TEEDS', cor: '#d2aa51', escura: '#8c6926', serif: true, emblema: '/teeds-marca.png', assinatura: 'TRADING TECHNOLOGY',
  intro: 'Uma plataforma completa que reúne tecnologia, gestão e automação para você operar com mais método e consciência.',
}
document.documentElement.dataset.marca = marca
document.documentElement.style.setProperty('--cor', config.cor)
document.documentElement.style.setProperty('--cor-escura', config.escura)
// Apenas os espaços de texto recebem o nome. O <html> também carrega
// data-marca para o tema; incluí-lo aqui apagaria a página inteira.
document.querySelectorAll('body [data-marca]').forEach(el => { el.textContent = config.nome })
document.querySelectorAll('[data-logo]').forEach(el => { el.src = config.emblema })
document.querySelectorAll('[data-assinatura]').forEach(el => { el.textContent = config.assinatura })
document.querySelector('[data-intro]').textContent = config.intro
document.title = `${config.nome} · Conheça a plataforma`

const inicio = Date.now()
let profundidade = 0
addEventListener('scroll', () => {
  const total = document.documentElement.scrollHeight - innerHeight
  profundidade = Math.max(profundidade, total > 0 ? Math.round(scrollY / total * 100) : 100)
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
    // Só avança depois de o motor confirmar que o lead foi preservado.
    // Nome é levado apenas para personalizar a próxima tela; a página usa
    // textContent e nunca injeta o valor como HTML.
    const proxima = new URL('./obrigado/', location.href)
    proxima.searchParams.set('nome', String(dados.nome).trim().split(/\s+/)[0])
    for (const [chave, valor] of utm) {
      if (chave.startsWith('utm_')) proxima.searchParams.set(chave, valor)
    }
    location.assign(proxima)
  } catch (e) {
    mensagem.textContent = e.message; mensagem.className = 'mensagem erro'
    botao.disabled = false; botao.innerHTML = 'Tentar novamente <span>→</span>'
  }
})
