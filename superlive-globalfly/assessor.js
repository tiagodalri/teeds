// O celular do Assessor GF (25/11/2026): conversa no WhatsApp e notificações do resultado na tela bloqueada.
// Conversa ilustrativa com os MESMOS modelos de mensagem que o Assessor manda de verdade
// (servidor/src/zapi.ts: mensagemDoInicio e mensagemDoFim). O aparelho é todo em CSS.
(function () {
  var raiz = document.querySelector('[data-zap]')
  if (!raiz) return
  var conversa = raiz.querySelector('[data-zap-conversa]'), status = raiz.querySelector('[data-zap-status]')
  var notifs = raiz.querySelector('[data-ip-notifs]'), horaEl = raiz.querySelector('[data-ip-hora]'), relogio = raiz.querySelector('[data-ip-relogio]')
  var deNovo = document.querySelector('[data-zap-de-novo]')
  var reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
  var onda = [5, 9, 14, 8, 17, 11, 6, 13, 19, 10, 7, 15, 12, 18, 9, 5, 11, 16, 8, 13, 6, 10, 15, 7, 12, 9, 5, 8]
  var ICONE_GF = '/pwa-globalfly/icon-180.png'
  var PASSOS = [
    { cena: 'zap', hora: '20:00', espera: 500 },
    { de: 'eu', tipo: 'audio', seg: 7, transcricao: 'Liga a GF Falcon na demo, com 1 dólar de entrada, meta de 10 e limite de 20.', espera: 700 },
    { de: 'gf', digita: 1500, html: '🟢 <b>GF Falcon ligada</b><br>Conta demo<br><br>Entrada: <b>US$ 1,00</b><br>Meta: <b>US$ 10,00</b><br>Limite de perda: <b>US$ 20,00</b><br><br><i>Te aviso aqui quando terminar.</i>', espera: 2200 },
    { cena: 'bloqueio', hora: '20:18', espera: 1300 },
    { notif: { app: 'GlobalFly', titulo: '✅ GF Falcon · Meta atingida', txt: 'Resultado da sessão: +US$ 10,12', verde: true }, espera: 1100 },
    { notif: { app: 'WhatsApp · Assessor GF', titulo: 'Assessor GF', txt: '✅ GF Falcon bateu a meta. Resultado: +US$ 10,12', zap: true }, espera: 2600 },
    { cena: 'zap', hora: '20:18', espera: 500 },
    { tipo: 'tempo', txt: '18 minutos depois', espera: 300 },
    { de: 'gf', html: '✅ <b>GF Falcon bateu a meta</b><br>Conta demo<br><br>Resultado: <b class="sl-verde">+US$ 10,12</b><br>Operações: 23 (17 ganhos · 6 perdas)<br>Duração: 18 min', espera: 1700 },
    { de: 'eu', html: 'Boa! Qual I.A. você recomenda agora?', espera: 900 },
    { de: 'gf', digita: 1300, html: 'Agora a recomendada é a <b>GF Phenom</b>. Quer que eu ligue? É só me dizer a conta, a entrada, a meta e o limite.', espera: 0 },
  ]
  // os tiques do WhatsApp, com o desenho de lá: 1 cinza = enviada, 2 cinza = entregue, 2 azuis = lida
  var TIQUE1 = '<svg class="sl-tq1" viewBox="0 0 12 11" aria-hidden="true"><path fill="currentColor" d="M11.155.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L4.28 8.365 1.875 6.093a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273Z"/></svg>'
  var TIQUE2 = '<svg class="sl-tq2" viewBox="0 0 16 11" aria-hidden="true"><path fill="currentColor" d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374L11.07.653Zm-2.45 7.674a15.31 15.31 0 0 1-.546-.355.43.43 0 0 0-.317-.12.46.46 0 0 0-.362.158l-.292.33a.482.482 0 0 0 .013.666l1.079 1.073c.135.135.3.203.495.203a.699.699 0 0 0 .552-.267l6.62-8.391a.446.446 0 0 0 .109-.298.487.487 0 0 0-.178-.38l-.355-.273a.487.487 0 0 0-.673.076L8.62 8.327Z"/></svg>'
  var TIQUES = '<span class="sl-tique" data-tique="enviada" role="img" aria-label="Enviada">' + TIQUE1 + TIQUE2 + '</span>'
  var NOMES = { enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida' }
  function tique(b, estado) { var t = b && b.querySelector('.sl-tique'); if (t) { t.dataset.tique = estado; t.setAttribute('aria-label', NOMES[estado]) } }
  var timers = [], rodada = 0, jaRodou = false, ultimaMinha = null
  function depois(f, ms) { timers.push(setTimeout(f, ms)) }
  function limpar() { timers.forEach(clearTimeout); timers = []; conversa.innerHTML = ''; notifs.innerHTML = ''; status.textContent = 'online'; raiz.dataset.cena = 'zap' }
  function descer() { conversa.scrollTop = conversa.scrollHeight }
  var horaAgora = '20:00'
  function bolha(p) {
    var b = document.createElement('div')
    if (p.tipo === 'tempo') { b.className = 'sl-zap-tempo'; b.textContent = p.txt; conversa.appendChild(b); descer(); return b }
    b.className = 'sl-zap-msg sl-zap-' + p.de
    if (p.tipo === 'audio') {
      b.classList.add('sl-zap-audio')
      b.innerHTML = '<button type="button" class="sl-zap-play" aria-label="Tocar o áudio de novo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></button>' +
        '<span class="sl-zap-onda">' + onda.map(function (h) { return '<i style="height:' + h + 'px"></i>' }).join('') + '</span>' +
        '<span class="sl-zap-dur">0:0' + p.seg + '</span>' +
        '<p class="sl-zap-transc" hidden><em>Transcrição</em> ' + p.transcricao + '</p><time>' + horaAgora + TIQUES + '</time>'
    } else b.innerHTML = '<p>' + p.html + '</p><time>' + horaAgora + (p.de === 'eu' ? TIQUES : '') + '</time>'
    conversa.appendChild(b); descer()
    if (p.de === 'eu') {
      ultimaMinha = b
      if (reduzir) tique(b, 'lida'); else depois(function () { tique(b, 'entregue') }, 650)
    }
    return b
  }
  function notificar(n) {
    var el = document.createElement('div'); el.className = 'sl-ip-notif' + (n.zap ? ' sl-ip-notif-zap' : '')
    el.innerHTML = (n.zap ? '<span class="sl-ip-notif-icone sl-ip-notif-wa"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.700 13.600L3 21l4.500-1.200A9 9 0 1 0 12 3zm4.400 12.300c-.200.500-1.100 1-1.500 1-.400.100-.900.100-1.500-.100-2.600-.900-4.300-3.600-4.400-3.800-.100-.200-1-1.400-1-2.600 0-1.200.600-1.800.900-2.100.200-.200.500-.300.700-.300h.500c.200 0 .400 0 .600.500l.800 2c.100.200.100.400 0 .500l-.600.800c-.100.100-.200.300-.100.500.600 1.100 1.500 1.900 2.700 2.400.200.100.400.100.500-.100l.700-.900c.200-.200.300-.200.500-.100l1.900.900c.200.100.300.200.400.300 0 .200 0 .600-.100 1.100z"/></svg></span>'
      : '<img class="sl-ip-notif-icone" src="' + ICONE_GF + '" alt="" />') +
      '<div><span>' + n.app + '<time>agora</time></span><b>' + n.titulo + '</b><em' + (n.verde ? ' class="sl-verde"' : '') + '>' + n.txt + '</em></div>'
    notifs.insertBefore(el, notifs.firstChild)
    raiz.classList.remove('sl-ip-vibra'); void raiz.offsetWidth; raiz.classList.add('sl-ip-vibra')
  }
  function tocarAudio(b, seg, aoFim) {
    var barras = b.querySelectorAll('.sl-zap-onda i'), dur = b.querySelector('.sl-zap-dur'), total = reduzir ? 1 : seg * 320, t0 = performance.now()
    b.classList.add('sl-tocando')
    ;(function quadro(t) {
      var u = Math.min(1, (t - t0) / total), ate = Math.floor(u * barras.length)
      for (var i = 0; i < barras.length; i++) barras[i].classList.toggle('sl-ouvida', i < ate)
      dur.textContent = '0:0' + Math.min(seg, Math.floor(u * seg))
      if (u < 1) requestAnimationFrame(quadro)
      else { b.classList.remove('sl-tocando'); dur.textContent = '0:0' + seg; var tr = b.querySelector('.sl-zap-transc'); if (tr) { tr.hidden = false; descer() } if (aoFim) aoFim() }
    })(t0)
  }
  function rodar() {
    limpar(); jaRodou = true
    var minha = ++rodada, i = 0
    ;(function proximo() {
      if (minha !== rodada || i >= PASSOS.length) return
      var p = PASSOS[i++]
      var seguir = function () { if (minha === rodada) depois(proximo, reduzir ? 0 : p.espera) }
      if (p.cena) {
        // sem animação, a tela bloqueada não aparece: a conversa inteira fica à vista
        if (reduzir && p.cena === 'bloqueio') return seguir()
        raiz.dataset.cena = p.cena; horaAgora = p.hora; horaEl.textContent = p.hora; relogio.textContent = p.hora; seguir()
      } else if (p.notif) { if (!reduzir) notificar(p.notif); seguir() }
      else if (p.tipo === 'audio') {
        var b = bolha(p)
        b.querySelector('.sl-zap-play').addEventListener('click', function () { tocarAudio(b, p.seg) })
        depois(function () { tocarAudio(b, p.seg, function () { tique(b, 'lida'); b.classList.add('sl-zap-ouvido'); seguir() }) }, reduzir ? 0 : 900)
      } else if (p.de === 'gf' && p.digita && !reduzir) {
        tique(ultimaMinha, 'lida')
        status.textContent = 'digitando…'
        var d = document.createElement('div'); d.className = 'sl-zap-msg sl-zap-gf sl-zap-digitando'; d.innerHTML = '<i></i><i></i><i></i>'
        conversa.appendChild(d); descer()
        depois(function () { d.remove(); status.textContent = 'online'; bolha(p); seguir() }, p.digita)
      } else { if (p.de === 'gf') tique(ultimaMinha, 'lida'); bolha(p); seguir() }
    })()
  }
  if (deNovo) deNovo.addEventListener('click', function () { raiz.scrollIntoView({ block: 'center', behavior: reduzir ? 'auto' : 'smooth' }); rodar() })
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { if (e[0].isIntersecting && !jaRodou) rodar() }, { threshold: 0.35 }).observe(raiz)
  } else rodar()

  // inclinação 3D: segue o mouse no computador e a rolagem no celular (o reflexo do vidro anda junto)
  if (reduzir) return
  var alvoX = 0, alvoY = 0, x = 0, y = 0, pedido = false
  function aplicar() {
    x += (alvoX - x) * 0.12; y += (alvoY - y) * 0.12
    raiz.style.setProperty('--ry', x.toFixed(2) + 'deg'); raiz.style.setProperty('--rx', y.toFixed(2) + 'deg'); raiz.style.setProperty('--brilho', (50 + x * 4).toFixed(1) + '%'); raiz.style.setProperty('--esp', (-x * 0.55).toFixed(2) + 'px')
    if (Math.abs(alvoX - x) > 0.02 || Math.abs(alvoY - y) > 0.02) requestAnimationFrame(aplicar); else pedido = false
  }
  function pedir() { if (!pedido) { pedido = true; requestAnimationFrame(aplicar) } }
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    addEventListener('pointermove', function (e) {
      var r = raiz.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return
      alvoX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2))) * 13
      alvoY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2))) * -7
      pedir()
    }, { passive: true })
  } else {
    addEventListener('scroll', function () {
      var r = raiz.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return
      var u = Math.max(-1, Math.min(1, ((r.top + r.height / 2) - innerHeight / 2) / (innerHeight / 2)))
      alvoX = u * -10; alvoY = u * 6; pedir()
    }, { passive: true })
  }
})()
