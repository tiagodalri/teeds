/* Captação da GlobalFly: o que as três páginas dividem. */
var GF = (function () {
  // O cadastro vai para o motor (ele grava com a chave do servidor). O
  // questionário só completa essa linha, por uma função do banco que aceita a
  // chave pública: a mesma de src/core/teeds/config.ts, que já vai no site.
  var MOTOR = 'https://motor.globalflytrade.com/publico/leads'
  var SUPABASE = 'https://wonxykovfvfnuhzpqsle.supabase.co'
  var CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvbnh5a292ZnZmbnVoenBxc2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDU3MTgsImV4cCI6MjEwMzc4MTcxOH0.5n9ePaGLNMOHOzitZULblGCsTj3ORJDgsWvc17V_0PU'
  // A comunidade oficial (src/marca/marcas.ts, `comunidade`)
  var COMUNIDADE_GF = 'https://chat.whatsapp.com/CPBJlfpTpZy7u2N5VF9Drq'
  // 29/10/2026 (Tiago): cada parceiro com a própria comunidade (src/marca/marcas.ts, `comunidadesDosParceiros`)
  var COMUNIDADES_DOS_PARCEIROS = { n: 'https://chat.whatsapp.com/FZpOI5S5Hhe2EOYIOul2C2', v: 'https://chat.whatsapp.com/KWk0g33mPzYL6ZUqU89Xue' }
  var CHAVE_LOCAL = 'gf-captacao'
  // Senha criada no cadastro (28/10/2026): DESLIGADA até o servidor rodar o código que a aceita.
  // Ligar junto com SENHA_NO_CADASTRO (src/core/teeds/leads.ts), só depois de reiniciar o servidor.
  var SENHA = true

  // sessionStorage some quando o navegador do Instagram troca de aba: guarda nos dois
  function ler() {
    var bruto = null
    try { bruto = sessionStorage.getItem(CHAVE_LOCAL) } catch (e) {}
    if (!bruto) try { bruto = localStorage.getItem(CHAVE_LOCAL) } catch (e) {}
    try { return bruto ? JSON.parse(bruto) : {} } catch (e) { return {} }
  }
  function guardar(dados) {
    var tudo = Object.assign(ler(), dados), texto = JSON.stringify(tudo)
    try { sessionStorage.setItem(CHAVE_LOCAL, texto) } catch (e) {}
    try { localStorage.setItem(CHAVE_LOCAL, texto) } catch (e) {}
    return tudo
  }

  // Parceiro de divulgação (27/10/2026). Vale o ENDEREÇO (Tiago: "o que deve valer é a URL: no
  // /n é Naor, no /v é Victor"): estas páginas moram em /n/cadastro/ e /v/cadastro/, e o /n ou o
  // /v fica na barra do começo ao fim. O endereço também vira a vitrine do navegador (a mesma
  // chave do site, src/core/teeds/parceiro.ts), e o primeiro parceiro fica guardado como "quem
  // trouxe". Vai na FRENTE do endereço gravado: o servidor guarda só 300 caracteres.
  var PARCEIROS = ['n', 'v'], CHAVE_PARCEIRO = 'globalfly.parceiro', CHAVE_VITRINE = 'globalfly.vitrine'
  var doCaminho = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase()
  var DO_ENDERECO = PARCEIROS.indexOf(doCaminho) >= 0 ? doCaminho : null
  // link antigo (/cadastro/?parceiro=n): passa para /n/cadastro/, levando o resto do endereço
  var REDIRECIONANDO = false
  ;(function paraOEnderecoDoParceiro() {
    var q = new URLSearchParams(location.search), codigo = (q.get('parceiro') || '').toLowerCase()
    if (DO_ENDERECO || PARCEIROS.indexOf(codigo) < 0) return
    REDIRECIONANDO = true
    location.replace('/' + codigo + location.pathname + location.search + location.hash)
  })()
  function guardarCodigo(chave, codigo, so_se_vazio) {
    try {
      if (so_se_vazio) {
        var g = JSON.parse(localStorage.getItem(chave) || 'null')
        if (g && PARCEIROS.indexOf(g.codigo) >= 0 && Date.now() - g.em < 90 * 864e5) return
      }
      localStorage.setItem(chave, JSON.stringify({ codigo: codigo, em: Date.now() }))
    } catch (e) {}
  }
  if (DO_ENDERECO) { guardarCodigo(CHAVE_VITRINE, DO_ENDERECO, false); guardarCodigo(CHAVE_PARCEIRO, DO_ENDERECO, true) }
  /** A comunidade do WhatsApp: a do parceiro do endereço (/n), senão a oficial da GF. */
  var COMUNIDADE = (DO_ENDERECO && COMUNIDADES_DOS_PARCEIROS[DO_ENDERECO]) || COMUNIDADE_GF
  /** O parceiro deste cadastro: o do endereço. */
  function parceiro() { return DO_ENDERECO }
  // O clique no link do parceiro conta no funil dele (um por navegador, por dia), como no site:
  // só na primeira página (/n/cadastro/), não no questionário nem no obrigado.
  ;(function anotarClique() {
    var q = new URLSearchParams(location.search)
    var primeira = /^\/[a-z0-9]+\/cadastro\/?$/.test(location.pathname)
    var codigo = DO_ENDERECO && (primeira || q.get('parceiro')) ? DO_ENDERECO : null
    if (!codigo) return
    var visitante = null
    try { visitante = JSON.parse(localStorage.getItem('globalfly.visitante') || 'null') } catch (e) {}
    if (!visitante || !/^[a-zA-Z0-9]{8,40}$/.test(visitante)) {
      visitante = (Date.now().toString(36) + Math.random().toString(36).slice(2, 14)).replace(/[^a-zA-Z0-9]/g, '')
      try { localStorage.setItem('globalfly.visitante', JSON.stringify(visitante)) } catch (e) {}
    }
    try {
      fetch(SUPABASE + '/rest/v1/rpc/teeds_toque_parceiro', {
        method: 'POST', keepalive: true,
        headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_marca: 'globalfly', p_codigo: codigo, p_visitante: visitante, p_link: (q.get('utm_source') || 'pagina-do-lancamento').slice(0, 60) }),
      }).catch(function () {})
    } catch (e) {}
  })()
  function paginaComParceiro() {
    var p = parceiro(), aqui = new URL(location.href)
    if (!p) return aqui.href
    var nova = new URL(aqui.origin + aqui.pathname)
    nova.searchParams.set('parceiro', p)
    aqui.searchParams.forEach(function (v, k) { if (k !== 'parceiro') nova.searchParams.append(k, v) })
    return nova.href
  }

  // As marcações da campanha (utm, e o ?o= dos links da Central de rastreio) seguem de página em página
  function proxima(caminho) {
    var destino = new URL(caminho, location.href), aqui = new URLSearchParams(location.search)
    aqui.forEach(function (valor, chave) { if (/^(utm_|fbclid|gclid|src|sck|o$)/.test(chave)) destino.searchParams.set(chave, valor) })
    return destino.toString()
  }

  // ------------------------------------------------------------------ Central de rastreio (04/11/2026)
  // Tiago: "rastreia tudo, cada passo, cada evento, cada clique, jornada detalhada". Cada página
  // conta a entrada (uma por sessão do navegador), o quanto a pessoa rolou, quanto tempo ficou, os
  // cliques e cada passo do cadastro, com de onde ela veio: a marcação do link (utm, ou o código ?o=
  // que a Central gera para o Telegram, os stories etc.), o site que mandou e o navegador embutido
  // (Instagram, Facebook, Telegram e TikTok se identificam). O banco guarda o primeiro e o último
  // toque (gf_rastro); quem lê é Administração › Central de rastreio.
  function garantirVisitante() {
    var v = visitante()
    if (v && /^[a-zA-Z0-9]{8,40}$/.test(v)) return v
    v = (Date.now().toString(36) + Math.random().toString(36).slice(2, 14)).replace(/[^a-zA-Z0-9]/g, '')
    try { localStorage.setItem('globalfly.visitante', JSON.stringify(v)) } catch (e) {}
    return v
  }
  var UA = navigator.userAgent || ''
  var NAVEGADOR = /Instagram/i.test(UA) ? 'instagram' : /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(UA) ? 'facebook' : /Telegram/i.test(UA) ? 'telegram'
    : /musical_ly|BytedanceWebview|TikTok/i.test(UA) ? 'tiktok' : /WhatsApp/i.test(UA) ? 'whatsapp' : /Edg/i.test(UA) ? 'edge'
    : /CriOS|Chrome/i.test(UA) ? 'chrome' : /Safari/i.test(UA) ? 'safari' : /Firefox/i.test(UA) ? 'firefox' : ''
  var DISPOSITIVO = /iPad|Tablet/i.test(UA) ? 'tablet' : /Mobi|Android|iPhone/i.test(UA) ? 'celular' : 'computador'
  /** De onde esta visita veio: a marcação do endereço, quem mandou a pessoa e o navegador. */
  var TOQUE = (function () {
    var q = new URLSearchParams(location.search), ref = ''
    try { if (document.referrer) { var h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h !== location.hostname.replace(/^www\./, '')) ref = h } } catch (e) {}
    return {
      origem: q.get('utm_source') || '', meio: q.get('utm_medium') || '', campanha: q.get('utm_campaign') || '',
      conteudo: q.get('utm_content') || '', termo: q.get('utm_term') || '', link: (q.get('o') || '').toLowerCase().slice(0, 40),
      ref: ref, nav: NAVEGADOR, disp: DISPOSITIVO, fbclid: q.has('fbclid'),
    }
  })()
  // teste local não suja a central (a não ser que se peça: localStorage gf.rastro.local = 1)
  var TESTE_LOCAL = /^(localhost|127\.|\[::1\])/.test(location.hostname) && !(function () { try { return localStorage.getItem('gf.rastro.local') } catch (e) { return null } })()
  function rastro(evento, detalhe, email) {
    // a página do link antigo vai trocar de endereço: quem conta a visita é a nova (com a referência certa)
    if (TESTE_LOCAL || REDIRECIONANDO) return
    try {
      fetch(SUPABASE + '/rest/v1/rpc/gf_rastro', {
        method: 'POST', keepalive: true, headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_marca: 'globalfly', p_parceiro: DO_ENDERECO, p_visitante: garantirVisitante(), p_evento: evento,
          p_pagina: location.pathname, p_toque: TOQUE, p_detalhe: detalhe || null, p_email: email || null }),
      }).catch(function () {})
    } catch (e) {}
  }
  // os eventos do pixel que também entram na jornada, com o nome que a central usa
  var NA_JORNADA = { Lead: 'questionario', CompleteRegistration: 'obrigado', Contact: 'comunidade',
    Schedule: 'agenda', AtivouNotificacoes: 'notificacoes', BaixouApp: 'baixou-app', EntrouNaPlataforma: 'plataforma' }
  ;(function acompanhar() {
    // entrada: uma por sessão do navegador; as outras páginas da mesma sessão contam como página
    var nova = true
    try { nova = !sessionStorage.getItem('gf.rastro.sessao'); sessionStorage.setItem('gf.rastro.sessao', '1') } catch (e) {}
    rastro(nova ? 'entrada' : 'pagina')
    // até onde rolou (25, 50, 75 e 100%), uma vez cada por página
    var marcos = [25, 50, 75, 100], maior = 0, inicio = Date.now(), saiu = 0, pedido = false
    function rolagem() {
      pedido = false
      var alto = Math.max(1, document.documentElement.scrollHeight - innerHeight), pc = Math.round(Math.min(1, scrollY / alto) * 100)
      if (pc > maior) maior = pc
      while (marcos.length && maior >= marcos[0]) rastro('rolou-' + marcos.shift())
    }
    addEventListener('scroll', function () { if (marcos.length && !pedido) { pedido = true; requestAnimationFrame(rolagem) } }, { passive: true })
    // quanto tempo ficou (ao sair ou trocar de aba; no mínimo 5 s entre um aviso e outro)
    function sair() {
      if (Date.now() - saiu < 5000) return
      saiu = Date.now()
      rastro('saiu', { segundos: Math.round((Date.now() - inicio) / 1000), rolou: maior })
    }
    addEventListener('pagehide', sair)
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sair() })
    // cada clique em botão ou link, com o texto dele
    document.addEventListener('click', function (ev) {
      var alvo = ev.target && ev.target.closest && ev.target.closest('a, button, [role="button"], summary')
      if (!alvo) return
      var nome = (alvo.getAttribute('data-rastro') || alvo.getAttribute('aria-label') || alvo.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)
      var para = ''
      try { if (alvo.href) { var u = new URL(alvo.href, location.href); para = u.hostname === location.hostname ? u.pathname + u.hash : u.hostname } } catch (e) {}
      rastro('clique', { alvo: nome || '(sem texto)', para: para || undefined })
    }, true)
    // cada campo do formulário preenchido: o nome do campo, nunca o que foi digitado
    var campos = {}
    document.addEventListener('change', function (ev) {
      var c = ev.target, nome = c && c.name
      if (!nome || !c.closest || !c.closest('form') || campos[nome] || /senha|repetir|empresa/.test(nome)) return
      campos[nome] = 1; rastro('campo', { campo: nome })
    }, true)
  })()

  // Pixel da Meta (30/10/2026, pendente desde 26/10): cada vitrine com o pixel do parceiro que paga o
  // anúncio. /n = conta de anúncios do Naor; /v = do Victor Cordeiro (03/11/2026). O direto fica sem pixel.
  var PIXELS = { n: '1625935188283999', v: '2208036990064467' }
  var pixelPronto = false
  // Os eventos padrão da Meta (o resto vai como evento próprio, com trackCustom)
  var PADRAO = ['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'Contact', 'Schedule', 'Subscribe', 'InitiateCheckout', 'SubmitApplication', 'StartTrial', 'Search', 'FindLocation', 'CustomizeProduct', 'Donate', 'AddToCart', 'AddToWishlist', 'AddPaymentInfo', 'Purchase']
  /**
   * Conta a visita (PageView) e, se vier, um evento do funil (02/11/2026, Tiago: "rastrear TODOS os eventos").
   * Página de vendas: ViewContent (chegou no formulário), ClicouCadastrar, ComecouCadastro.
   * Questionário: Lead (cadastro enviado). Obrigado: CompleteRegistration, RespondeuQuestionario,
   * Contact (comunidade), Schedule (calendário), AtivouNotificacoes, BaixouApp, EntrouNaPlataforma.
   * `vezes`: 'uma' (padrão) conta uma vez por pessoa; 'sempre' conta cada vez.
   */
  var PELO_SERVIDOR = ['Lead', 'CompleteRegistration']
  function cookie(nome) { var m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : '' }
  function visitante() { try { return JSON.parse(localStorage.getItem('globalfly.visitante') || 'null') || '' } catch (e) { return '' } }
  // Correspondência avançada (02/11/2026): depois do cadastro, o pixel leva e-mail, celular e nome,
  // que o próprio código da Meta embaralha no aparelho antes de enviar. A Meta reconhece quem
  // se cadastrou e entrega o anúncio para gente parecida.
  function quemE() {
    var d = ler(), u = { country: 'br' }, tel = String(d.tel || '').replace(/\D/g, ''), v = visitante()
    if (d.email) u.em = d.email
    if (tel.length === 10 || tel.length === 11) u.ph = '55' + tel
    if (d.nome) u.fn = String(d.nome).toLowerCase()
    if (d.sobrenome) u.ln = String(d.sobrenome).toLowerCase()
    if (v) u.external_id = v
    return u
  }
  // API de Conversões (supabase/functions/meta-conversoes): o mesmo evento, pelo servidor
  function pixelPeloServidor(evento, codigo, dados) {
    try {
      fetch(SUPABASE + '/functions/v1/meta-conversoes', {
        method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', apikey: CHAVE },
        body: JSON.stringify({ marca: 'globalfly', parceiro: DO_ENDERECO, evento: evento, event_id: codigo, email: dados.email,
          url: location.origin + location.pathname, fbp: cookie('_fbp'), fbc: cookie('_fbc'), externo: visitante() }),
      }).catch(function () {})
    } catch (e) {}
  }
  // Os passos antes do cadastro também ficam no nosso banco (02/11/2026): a Meta segura eventos
  // próprios novos até o dono do pixel aprovar, e o funil da aba Anúncios não pode depender disso.
  function passo(nome) {
    rastro(nome)
    var v = visitante()
    if (!DO_ENDERECO || !v || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return
    try {
      fetch(SUPABASE + '/rest/v1/rpc/gf_funil_passo', {
        method: 'POST', keepalive: true, headers: { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_marca: 'globalfly', p_parceiro: DO_ENDERECO, p_visitante: v, p_passo: nome }),
      }).catch(function () {})
    } catch (e) {}
  }
  function pixel(evento, dadosDoEvento, vezes) {
    if (evento && NA_JORNADA[evento]) rastro(NA_JORNADA[evento])
    var id = PIXELS[DO_ENDERECO || '']
    // teste local não suja o pixel do parceiro
    if (!id || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return
    try {
      if (!pixelPronto) {
        /* eslint-disable */
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js')
        window.fbq('init', id, quemE()); window.fbq('track', 'PageView'); pixelPronto = true
      }
      // cada evento do funil conta uma vez por pessoa, mesmo se ela recarregar a página
      if (evento) {
        var chave = 'pixel.' + evento, dados = ler()
        if (vezes !== 'sempre' && dados[chave]) return
        // as duas conversões também vão pelo servidor, com o mesmo código: a Meta conta uma vez só
        var pelaApi = PELO_SERVIDOR.indexOf(evento) >= 0 && dados.cad && dados.email
        var codigo = pelaApi ? evento + '-' + dados.cad : undefined
        var chamada = [PADRAO.indexOf(evento) >= 0 ? 'track' : 'trackCustom', evento, dadosDoEvento || {}]
        // o código só vai quando existe: um quarto argumento vazio faz o pixel engolir o evento
        if (codigo) chamada.push({ eventID: codigo })
        window.fbq.apply(window, chamada)
        if (pelaApi) pixelPeloServidor(evento, codigo, dados)
        var marca = {}; marca[chave] = Date.now(); guardar(marca)
      }
    } catch (e) {}
  }

  return { SENHA: SENHA, pixel: pixel, passo: passo, rastro: rastro, parceiro: parceiro, MOTOR: MOTOR, SUPABASE: SUPABASE, CHAVE: CHAVE, COMUNIDADE: COMUNIDADE, ler: ler, guardar: guardar, proxima: proxima, paginaComParceiro: paginaComParceiro }
})()
