// O WhatsApp do Assessor GF, animado (25/11/2026). Conversa ilustrativa com os MESMOS modelos de mensagem
// que o Assessor manda de verdade (servidor/src/zapi.ts: mensagemDoInicio e mensagemDoFim).
(function () {
  var raiz = document.querySelector('[data-zap]')
  if (!raiz) return
  var conversa = raiz.querySelector('[data-zap-conversa]'), status = raiz.querySelector('[data-zap-status]')
  var deNovo = document.querySelector('[data-zap-de-novo]')
  var reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
  var onda = [5, 9, 14, 8, 17, 11, 6, 13, 19, 10, 7, 15, 12, 18, 9, 5, 11, 16, 8, 13, 6, 10, 15, 7, 12, 9, 5, 8]
  var PASSOS = [
    { de: 'eu', tipo: 'audio', seg: 7, transcricao: 'Liga a GF Falcon na demo, com 1 dólar de entrada, meta de 10 e limite de 20.', espera: 700 },
    { de: 'gf', digita: 1500, html: '🟢 <b>GF Falcon ligada</b><br>Conta demo<br><br>Entrada: <b>US$ 1,00</b><br>Meta: <b>US$ 10,00</b><br>Limite de perda: <b>US$ 20,00</b><br><br><i>Te aviso aqui quando terminar.</i>', espera: 1500 },
    { tipo: 'tempo', txt: '18 minutos depois', espera: 900 },
    { de: 'gf', digita: 900, html: '✅ <b>GF Falcon bateu a meta</b><br>Conta demo<br><br>Resultado: <b class="sl-verde">+US$ 10,12</b><br>Operações: 23 (17 ganhos · 6 perdas)<br>Duração: 18 min', espera: 1600 },
    { de: 'eu', html: 'Boa! Qual I.A. você recomenda agora?', espera: 900 },
    { de: 'gf', digita: 1300, html: 'Agora a recomendada é a <b>GF Phenom</b>. Quer que eu ligue? É só me dizer a conta, a entrada, a meta e o limite.', espera: 0 },
  ]
  var timers = [], rodada = 0, jaRodou = false
  function depois(f, ms) { timers.push(setTimeout(f, ms)) }
  function limpar() { timers.forEach(clearTimeout); timers = []; conversa.innerHTML = ''; status.textContent = 'online' }
  function hora() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
  function descer() { conversa.scrollTop = conversa.scrollHeight }
  function bolha(p) {
    var b = document.createElement('div')
    if (p.tipo === 'tempo') { b.className = 'sl-zap-tempo'; b.textContent = p.txt; conversa.appendChild(b); descer(); return b }
    b.className = 'sl-zap-msg sl-zap-' + p.de
    if (p.tipo === 'audio') {
      b.classList.add('sl-zap-audio')
      b.innerHTML = '<button type="button" class="sl-zap-play" aria-label="Tocar o áudio de novo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></button>' +
        '<span class="sl-zap-onda">' + onda.map(function (h) { return '<i style="height:' + h + 'px"></i>' }).join('') + '</span>' +
        '<span class="sl-zap-dur">0:0' + p.seg + '</span>' +
        '<p class="sl-zap-transc" hidden><em>Transcrição</em> ' + p.transcricao + '</p><time>' + hora() + ' ✓✓</time>'
    } else b.innerHTML = '<p>' + p.html + '</p><time>' + hora() + (p.de === 'eu' ? ' ✓✓' : '') + '</time>'
    conversa.appendChild(b); descer(); return b
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
      if (p.tipo === 'audio') {
        var b = bolha(p)
        b.querySelector('.sl-zap-play').addEventListener('click', function () { tocarAudio(b, p.seg) })
        depois(function () { tocarAudio(b, p.seg, seguir) }, reduzir ? 0 : 500)
      } else if (p.de === 'gf' && !reduzir) {
        status.textContent = 'digitando…'
        var d = document.createElement('div'); d.className = 'sl-zap-msg sl-zap-gf sl-zap-digitando'; d.innerHTML = '<i></i><i></i><i></i>'
        conversa.appendChild(d); descer()
        depois(function () { d.remove(); status.textContent = 'online'; bolha(p); seguir() }, p.digita)
      } else { bolha(p); seguir() }
    })()
  }
  if (deNovo) deNovo.addEventListener('click', rodar)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { if (e[0].isIntersecting && !jaRodou) rodar() }, { threshold: 0.35 }).observe(raiz)
  } else rodar()
})()
