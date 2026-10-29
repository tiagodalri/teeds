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
  ;(function paraOEnderecoDoParceiro() {
    var q = new URLSearchParams(location.search), codigo = (q.get('parceiro') || '').toLowerCase()
    if (DO_ENDERECO || PARCEIROS.indexOf(codigo) < 0) return
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

  // As marcações da campanha (utm) seguem de página em página
  function proxima(caminho) {
    var destino = new URL(caminho, location.href), aqui = new URLSearchParams(location.search)
    aqui.forEach(function (valor, chave) { if (/^(utm_|fbclid|gclid|src|sck)/.test(chave)) destino.searchParams.set(chave, valor) })
    return destino.toString()
  }

  return { SENHA: SENHA, MOTOR: MOTOR, SUPABASE: SUPABASE, CHAVE: CHAVE, COMUNIDADE: COMUNIDADE, ler: ler, guardar: guardar, proxima: proxima, paginaComParceiro: paginaComParceiro }
})()
