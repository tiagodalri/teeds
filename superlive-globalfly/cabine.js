// A cabine: reprise de sessões reais gravadas na plataforma (extraída da landing de 09/11).
(function () {
      var reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches
      // ------------------------------------------------ cabine: reprise de sessões reais, operação por operação
      // (31/10/2026) Uma sessão de cada I.A., gravada na plataforma e terminada na meta: [entrada, 1 = dígito acima
      // / 0 = abaixo, resultado, preço do Volatility 75 na entrada]. Nada aqui é sorteado: é a sessão como foi.
      // Na fila aparece o preço do índice em cada entrada (pedido do Tiago, no lugar de "Dígito acima/abaixo").
      var cab = document.querySelector('[data-cabine]')
      if (!cab) return
      // 02/11/2026 (Tiago: "não pode chegar num negativo tão alto, tem que ir ficando mais positiva"): só sessões
      // reais que quase não foram ao negativo. As do Raptor e do Gulf gravadas até agora caíram fundo antes de
      // recuperar, então ficam de fora da cabine (seguem no hangar) até haver uma sessão assim delas.
      var SESSOES = [
        { n: 'GF Falcon', f: 'falcon', meta: 60, dia: '30/10', ops: [[5,0,-5,39062.78],[10.17,0,-10.17,39065.83],[28.98,0,16.16,39074.80],[5,0,2.79,39075.09],[5,0,-5,39079.68],[10.17,0,5.67,39079.48],[5,0,2.79,39100.83],[5,0,2.79,39105.93],[5,0,2.79,39100.68],[5,0,2.79,39096.24],[5,0,-5,39093.58],[10.17,0,-10.17,39093.39],[28.98,0,16.16,39091.78],[5,0,2.79,39096.32],[5,0,2.79,39099.13],[5,0,2.79,39102.99],[5,0,-5,39113.52],[10.17,0,5.67,39117.58],[5,0,-5,39122.70],[10.17,0,5.67,39117.22],[5,0,-5,39114.78],[10.17,0,5.67,39101.40],[5,0,2.79,39091.85],[5,0,2.79,39106.89],[5,0,-5,39114.57],[10.17,0,5.67,39125.32],[5,0,2.79,39131.90],[5,0,-5,39131.67],[10.17,0,5.67,39138.17],[5,0,2.79,39125.32],[5,0,2.79,39130.92],[5,0,-5,39130.47],[10.17,0,5.67,39120.04],[5,0,2.79,39120.55],[5,0,2.79,39120.50],[5,0,2.79,39116.69],[5,0,-5,39104.73],[10.17,0,-10.17,39106.28],[28.98,0,16.16,39109.18],[5,0,-5,39097.39],[10.17,0,-10.17,39108.95],[28.98,0,-28.98,39109.20],[82.55,0,46.03,39109.91],[5,0,2.79,39111.34],[5,0,2.79,39113.44],[5,0,2.79,39108.36]] },
        { n: 'GF Phenom', f: 'phenom', meta: 20, dia: '23/10', ops: [[0.8,0,-0.8,39125.88],[0.86,0,1.65,39117.93],[0.8,0,-0.8,39156.40],[0.86,0,1.65,39144.04],[0.8,0,1.54,39135.24],[0.8,0,-0.8,39138.01],[0.86,0,1.65,39145.34],[0.8,0,-0.8,39122.19],[0.86,0,-0.86,39112.78],[1.33,0,-1.33,39117.56],[2.03,0,3.91,39108.53],[0.8,0,-0.8,39057.80],[0.86,0,-0.86,39066.10],[1.33,0,2.56,39063.20],[0.8,0,-0.8,39064.61],[0.86,0,-0.86,39062.73],[1.33,0,2.56,39065.05],[0.8,0,1.54,39047.00],[0.8,0,1.54,39061.22],[0.8,0,1.54,39044.95],[0.8,0,1.54,39005.16],[0.8,0,1.54,39015.19],[0.8,0,-0.8,38951.39],[0.86,0,-0.86,38938.97],[1.33,0,-1.33,38950.89],[2.03,0,-2.03,38943.46],[3.23,0,-3.23,38931.41],[5.31,0,-5.31,38913.06],[8.72,0,16.78,38908.35],[0.8,0,-0.8,38928.10],[0.86,0,-0.86,38932.64],[1.33,0,2.56,38937.13],[0.8,0,-0.8,38955.28],[0.86,0,-0.86,38966.67],[1.33,0,-1.33,38973.13],[2.03,0,-2.03,38981.47],[3.23,0,6.21,38976.82],[0.8,0,-0.8,38996.85],[0.86,0,-0.86,38995.87],[1.33,0,2.56,38988.68]] },
        { n: 'GF Legacy', f: 'legacy', meta: 10, dia: '31/10', ops: [[0.35,1,0.2,38363.75],[0.35,1,0.2,38366.30],[0.35,1,0.2,38372.17],[0.35,1,-0.35,38357.20],[0.7,1,0.39,38352.34],[0.35,1,0.2,38347.22],[0.35,1,-0.35,38353.79],[0.7,1,0.39,38361.38],[0.35,1,0.2,38360.19],[0.35,1,0.2,38371.63],[0.35,1,0.2,38370.03],[0.35,1,0.2,38371.18],[0.35,1,-0.35,38379.62],[0.7,1,0.39,38379.42],[0.35,1,0.2,38370.46],[0.35,1,0.2,38357.07],[0.35,1,0.2,38360.49],[0.35,1,0.2,38353.40],[0.35,1,-0.35,38354.21],[0.7,1,-0.7,38357.37],[2.01,1,1.12,38370.57],[0.35,1,0.2,38362.84],[0.35,1,0.2,38349.79],[0.35,1,0.2,38340.59],[0.35,1,-0.35,38339.33],[0.7,1,0.39,38349.29],[0.35,1,-0.35,38368.03],[0.7,1,-0.7,38372.07],[2.01,1,1.12,38365.44],[0.35,1,0.2,38359.06],[0.35,1,-0.35,38363.61],[0.7,1,-0.7,38362.57],[2.01,1,-2.01,38350.96],[5.73,1,3.2,38352.86],[0.35,1,0.2,38349.96],[0.35,1,0.2,38341.48],[0.35,1,0.2,38330.24],[0.35,1,0.2,38327.53],[0.35,1,0.2,38330.43],[0.35,1,0.2,38329.22],[0.35,1,0.2,38330.68],[0.35,1,-0.35,38321.18],[0.7,1,0.39,38317.96],[0.35,1,0.2,38329.23],[0.35,1,-0.35,38329.97],[0.7,1,0.39,38330.83],[0.35,1,0.2,38324.76],[0.35,1,-0.35,38334.46],[0.7,1,0.39,38334.64],[0.35,1,0.2,38339.92],[0.35,1,-0.35,38348.38],[0.7,1,-0.7,38346.35],[2.01,1,1.12,38363.02],[0.35,1,-0.35,38375.29],[0.7,1,-0.7,38377.23],[2.01,1,-2.01,38373.63],[5.73,1,-5.73,38361.94],[16.3,1,9.09,38377.87],[0.35,1,-0.35,38369.08],[0.7,1,-0.7,38367.05],[2.01,1,-2.01,38377.89],[5.73,1,3.2,38374.09],[0.35,1,0.2,38368.62],[0.35,1,0.2,38367.60],[0.35,1,0.2,38349.95],[0.35,1,0.2,38348.84],[0.35,1,-0.35,38355.61],[0.7,1,-0.7,38365.66],[2.01,1,1.12,38358.35],[0.35,1,0.2,38357.69],[0.35,1,-0.35,38376.29],[0.7,1,-0.7,38384.46],[2.01,1,1.12,38396.95],[0.35,1,0.2,38396.86],[0.35,1,-0.35,38381.53],[0.7,1,-0.7,38385.00],[2.01,1,1.12,38389.45],[0.35,1,-0.35,38385.35],[0.7,1,-0.7,38396.02],[2.01,1,1.12,38400.21],[0.35,1,-0.35,38419.16],[0.7,1,-0.7,38423.97],[2.01,1,-2.01,38420.80],[5.73,1,-5.73,38416.72],[16.3,1,9.09,38414.54],[0.35,1,0.2,38410.25],[0.35,1,-0.35,38404.41],[0.7,1,0.39,38420.09],[0.35,1,0.2,38411.25],[0.35,1,-0.35,38418.74],[0.7,1,0.39,38425.75],[0.35,1,0.2,38426.94],[0.35,1,0.2,38432.75],[0.35,1,0.2,38432.60],[0.35,1,-0.35,38429.06],[0.7,1,0.39,38426.40],[0.35,1,-0.35,38412.58],[0.7,1,0.39,38414.17],[0.35,1,0.2,38411.45],[0.35,1,-0.35,38406.22],[0.7,1,0.39,38398.86],[0.35,1,0.2,38401.05],[0.35,1,0.2,38401.46],[0.35,1,0.2,38400.17]] },
      ]
      var q = function (s) { return cab.querySelector(s) }
      var tela = q('[data-cab-grafico]'), ctx = tela.getContext('2d')
      var ias = q('[data-cab-ias]'), capa = q('[data-cab-capa]'), nomeEl = q('[data-cab-nome]'), status = q('[data-cab-status]'), faseEl = q('[data-cab-fase]')
      var resEl = q('[data-cab-res]'), metaEl = q('[data-cab-meta]'), barraMeta = q('[data-cab-barra]'), pct = q('[data-cab-pct]'), precoEl = q('[data-cab-preco]')
      var nEl = q('[data-cab-n]'), posEl = q('[data-cab-pos]'), entEl = q('[data-cab-ent]'), lista = q('[data-cab-ops]')
      var alerta = q('[data-cab-alerta]'), alertaTit = q('[data-cab-alerta-titulo]'), alertaTxt = q('[data-cab-alerta-txt]'), nota = q('[data-cab-nota]')
      var moeda = function (v, sinal) { var t = 'US$ ' + Math.abs(v).toFixed(2).replace('.', ','); return sinal ? (v < 0 ? '−' : '+') + t : t }
      var preco = function (v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
      // a fita de cada I.A. (como os stories): toca para ver aquela sessão
      SESSOES.forEach(function (s, i) {
        var b = document.createElement('button')
        b.type = 'button'; b.setAttribute('role', 'tab'); b.className = 'lp-cab-ia'
        b.innerHTML = '<img src="/aulas-globalfly/robo-' + s.f + '-mobile.webp" alt="" width="64" height="96" loading="lazy" /><span>' + s.n.replace('GF ', '') + '</span><i><u></u></i>'
        b.addEventListener('click', function () { escolher(i, true) })
        ias.appendChild(b)
      })
      var fitas = ias.querySelectorAll('.lp-cab-ia')
      // as capas do hangar também escolhem a I.A. da cabine
      var hangar = document.querySelectorAll('.lp-hangar figure')
      Array.prototype.forEach.call(hangar, function (fig) {
        var img = fig.querySelector('img'), i = SESSOES.map(function (x) { return x.n }).indexOf(img ? img.alt : '')
        if (i < 0) return
        fig.dataset.ia = String(i); fig.setAttribute('role', 'button'); fig.tabIndex = 0; fig.setAttribute('aria-label', 'Ver a sessão da ' + SESSOES[i].n)
        var ir = function () { escolher(i, true); if (cab.getBoundingClientRect().top < 0) cab.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
        fig.addEventListener('click', ir); fig.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir() } })
      })

      var atual = 0, s = null, k = 0, acum = [0], mostrado = 0, alvo = 0, positivas = 0
      var rodando = false, visivel = false, timer = null, quadro = null, pausaFim = false, inicio = 0
      // uma operação por segundo (31/10/2026, Tiago: "rápida, mas nem tanto")
      function passoMs() { return 1000 }

      function escolher(i, pelaPessoa) {
        clearTimeout(timer); atual = i; s = SESSOES[i]; k = 0; acum = [0]; mostrado = 0; alvo = 0; positivas = 0; pausaFim = false
        lista.innerHTML = ''; alerta.hidden = true; inicio = performance.now()
        capa.src = '/aulas-globalfly/robo-' + s.f + '-mobile.webp'; nomeEl.textContent = s.n
        metaEl.textContent = moeda(s.meta); entEl.textContent = moeda(s.ops[0][0]); precoEl.textContent = preco(s.ops[0][3])
        nota.textContent = 'Reprise da sessão de ' + s.dia + ', gravada na plataforma, operação por operação.'
        nEl.textContent = '0 de ' + s.ops.length; posEl.textContent = '0'
        fase('Operando', 'opera')
        Array.prototype.forEach.call(hangar || [], function (fig) { fig.classList.toggle('on', fig.dataset.ia === String(i)) })
        Array.prototype.forEach.call(fitas, function (f, j) { f.classList.toggle('on', j === i); f.classList.toggle('vista', j < i); f.setAttribute('aria-selected', String(j === i)); f.querySelector('u').style.width = j < i ? '100%' : '0%' })
        if (pelaPessoa) fitas[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
        // cada sessão já entra com as três primeiras operações na tela (nunca começa vazia)
        if (!reduzir) adiantar(3)
        if (rodando) timer = setTimeout(operar, 500)
      }
      function fase(t, c) { faseEl.textContent = t; status.className = 'lp-cab-status ' + c }

      function operar() {
        if (!rodando || pausaFim) return
        var op = s.ops[k], n = k + 1, recup = op[0] > s.ops[0][0] + 0.001
        var li = document.createElement('li')
        li.innerHTML = '<span class="lp-op-n">#' + n + '</span><span class="lp-op-tipo">' + '<b>' + preco(op[3]) + '</b>' + (recup ? '<em>Recuperação</em>' : '') + '</span><span class="lp-op-ent">' + moeda(op[0]) + '</span><span class="lp-op-res">…</span>'
        lista.insertBefore(li, lista.firstChild); while (lista.children.length > 5) lista.removeChild(lista.lastChild)
        entEl.textContent = moeda(op[0]); precoEl.textContent = preco(op[3])
        fase(recup ? 'Recuperando' : 'Operando', recup ? 'recupera' : 'opera')
        var meio = passoMs() * .45
        timer = setTimeout(function () {
          if (!rodando) return
          var ganhou = op[2] > 0, r = li.querySelector('.lp-op-res')
          r.textContent = moeda(op[2], true); r.className = 'lp-op-res ' + (ganhou ? 'pos' : 'neg'); li.classList.add(ganhou ? 'ganhou' : 'perdeu')
          if (ganhou) positivas++
          k = n; alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo)
          nEl.textContent = n + ' de ' + s.ops.length; posEl.textContent = String(positivas)
          if (k >= s.ops.length) return terminar()
          timer = setTimeout(operar, passoMs() - meio)
        }, meio)
      }
      function terminar() {
        pausaFim = true
        fase('Meta atingida', 'meta')
        alertaTit.textContent = '✅ ' + s.n + ' · Meta atingida'
        alertaTxt.textContent = moeda(alvo, true) + ' em ' + s.ops.length + ' operações · ' + positivas + ' positivas'
        alerta.hidden = false
        timer = setTimeout(function () { escolher((atual + 1) % SESSOES.length) }, 4200)
      }

      // o número e a fita andam em tempo de quadro; o gráfico se desenha com a curva entrando aos poucos
      function desenhar() {
        var dpr = Math.min(2, window.devicePixelRatio || 1), w = tela.clientWidth, h = tela.clientHeight
        if (!w || !h) return
        if (tela.width !== Math.round(w * dpr) || tela.height !== Math.round(h * dpr)) { tela.width = Math.round(w * dpr); tela.height = Math.round(h * dpr) }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
        var tudo = [0]; for (var i = 0, a = 0; i < s.ops.length; i++) { a += s.ops[i][2]; tudo.push(a) }
        var min = Math.min(0, Math.min.apply(null, tudo)), max = Math.max(s.meta, Math.max.apply(null, tudo))
        var pad = (max - min) * .1, topo = 30, base = h - 14
        var X = function (i) { return 10 + i / s.ops.length * (w - 20) }, Y = function (v) { return base - (v - min + pad) / (max - min + pad * 2) * (base - topo) }
        // a meta e o zero
        ctx.setLineDash([5, 5]); ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(95,196,140,.55)'; ctx.beginPath(); ctx.moveTo(0, Y(s.meta)); ctx.lineTo(w, Y(s.meta)); ctx.stroke()
        ctx.strokeStyle = 'rgba(156,177,199,.22)'; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = 'rgba(95,196,140,.85)'; ctx.font = '700 10.5px ui-monospace, "SF Mono", Menlo, monospace'; ctx.textAlign = 'right'
        ctx.fillText('META ' + moeda(s.meta), w - 8, Y(s.meta) - 6); ctx.textAlign = 'left'
        // a curva até onde a sessão chegou, com a última perna crescendo
        var feito = acum.length - 1, frac = Math.min(1, (performance.now() - ultimoPonto) / 260)
        var pts = acum.map(function (v, i) { return [X(i), Y(v)] })
        if (feito > 0 && frac < 1) { var a0 = pts[feito - 1], a1 = pts[feito]; pts[feito] = [a0[0] + (a1[0] - a0[0]) * frac, a0[1] + (a1[1] - a0[1]) * frac] }
        var grad = ctx.createLinearGradient(0, topo, 0, base); grad.addColorStop(0, 'rgba(212,166,74,.30)'); grad.addColorStop(1, 'rgba(212,166,74,0)')
        ctx.beginPath(); pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]) })
        ctx.lineTo(pts[pts.length - 1][0], Y(min - pad)); ctx.lineTo(pts[0][0], Y(min - pad)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill()
        ctx.beginPath(); pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]) })
        ctx.strokeStyle = '#E2B95C'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(226,185,92,.6)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0
        // pontinhos verdes e vermelhos de cada operação (nas sessões curtas)
        if (s.ops.length <= 50) for (var j = 1; j < pts.length; j++) { if (j === feito && frac < 1) continue; ctx.fillStyle = s.ops[j - 1][2] > 0 ? '#5FC48C' : '#F1828A'; ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], 2.6, 0, 7); ctx.fill() }
        var u = pts[pts.length - 1], pulso = (Math.sin(performance.now() / 180) + 1) / 2
        ctx.fillStyle = 'rgba(243,213,140,' + (.18 + pulso * .2) + ')'; ctx.beginPath(); ctx.arc(u[0], u[1], 8 + pulso * 4, 0, 7); ctx.fill()
        ctx.fillStyle = '#F3D58C'; ctx.beginPath(); ctx.arc(u[0], u[1], 4, 0, 7); ctx.fill()
      }
      var ultimoPonto = 0, acumAntes = 1
      function quadroDeTela() {
        if (acum.length !== acumAntes) { acumAntes = acum.length; ultimoPonto = performance.now() }
        // o resultado corre até o valor novo, como um contador
        mostrado += (alvo - mostrado) * .22; if (Math.abs(alvo - mostrado) < .005) mostrado = alvo
        resEl.textContent = moeda(mostrado, true); resEl.className = mostrado > 0.004 ? 'pos' : mostrado < -0.004 ? 'neg' : ''
        var p = Math.max(0, Math.min(1, mostrado / s.meta))
        barraMeta.style.width = (p * 100) + '%'; barraMeta.className = mostrado < 0 ? 'neg' : ''; pct.textContent = Math.round(Math.max(0, mostrado) / s.meta * 100) + '%'
        if (!pausaFim) fitas[atual].querySelector('u').style.width = Math.min(100, (k / s.ops.length) * 100) + '%'
        else fitas[atual].querySelector('u').style.width = '100%'
        desenhar()
        if (rodando) quadro = requestAnimationFrame(quadroDeTela)
      }
      function ligar() { if (rodando) return; rodando = true; if (pausaFim) timer = setTimeout(function () { escolher((atual + 1) % SESSOES.length) }, 1500); else timer = setTimeout(operar, 400); quadro = requestAnimationFrame(quadroDeTela) }
      function desligar() { rodando = false; clearTimeout(timer); cancelAnimationFrame(quadro) }
      escolher(0)
      // as primeiras operações da sessão chegam na tela de uma vez, sem animação
      function adiantar(qtd) {
        for (var x = 0; x < qtd && k < s.ops.length - 1; x++) {
          var op = s.ops[k], n = k + 1, recup = op[0] > s.ops[0][0] + 0.001, ganhou = op[2] > 0
          var li = document.createElement('li'); li.className = ganhou ? 'ganhou' : 'perdeu'; li.style.animation = 'none'
          li.innerHTML = '<span class="lp-op-n">#' + n + '</span><span class="lp-op-tipo">' + '<b>' + preco(op[3]) + '</b>' + (recup ? '<em>Recuperação</em>' : '') + '</span><span class="lp-op-ent">' + moeda(op[0]) + '</span><span class="lp-op-res ' + (ganhou ? 'pos' : 'neg') + '">' + moeda(op[2], true) + '</span>'
          lista.insertBefore(li, lista.firstChild)
          if (ganhou) positivas++
          k = n; alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo)
        }
        mostrado = alvo; entEl.textContent = moeda(s.ops[k][0]); precoEl.textContent = preco(s.ops[k - 1][3])
        nEl.textContent = k + ' de ' + s.ops.length; posEl.textContent = String(positivas)
      }
      if (!reduzir) quadroDeTela()
      if (reduzir) {
        // sem animação: a sessão inteira de uma vez
        s.ops.forEach(function (op) { alvo = +(alvo + op[2]).toFixed(2); acum.push(alvo); if (op[2] > 0) positivas++ })
        k = s.ops.length; mostrado = alvo; nEl.textContent = k + ' de ' + k; posEl.textContent = String(positivas)
        terminar(); clearTimeout(timer); rodando = false; quadroDeTela()
      } else if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (e) { visivel = e[0].isIntersecting; visivel && !document.hidden ? ligar() : desligar() }, { threshold: .2 }).observe(cab)
        document.addEventListener('visibilitychange', function () { document.hidden ? desligar() : visivel && ligar() })
      } else ligar()
      addEventListener('resize', function () { if (!rodando) desenhar() })
})()
