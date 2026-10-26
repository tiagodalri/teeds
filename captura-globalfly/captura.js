/* Captação da GlobalFly: o que as três páginas dividem. */
var GF = (function () {
  // O cadastro vai para o motor (ele grava com a chave do servidor). O
  // questionário só completa essa linha, por uma função do banco que aceita a
  // chave pública: a mesma de src/core/teeds/config.ts, que já vai no site.
  var MOTOR = 'https://motor.globalflytrade.com/publico/leads'
  var SUPABASE = 'https://wonxykovfvfnuhzpqsle.supabase.co'
  var CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvbnh5a292ZnZmbnVoenBxc2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDU3MTgsImV4cCI6MjEwMzc4MTcxOH0.5n9ePaGLNMOHOzitZULblGCsTj3ORJDgsWvc17V_0PU'
  // A comunidade oficial (src/marca/marcas.ts, `comunidade`)
  var COMUNIDADE = 'https://chat.whatsapp.com/CPBJlfpTpZy7u2N5VF9Drq'
  var CHAVE_LOCAL = 'gf-captacao'

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

  // As marcações da campanha (utm) seguem de página em página
  function proxima(caminho) {
    var destino = new URL(caminho, location.href), aqui = new URLSearchParams(location.search)
    aqui.forEach(function (valor, chave) { if (/^(utm_|fbclid|gclid|src|sck)/.test(chave)) destino.searchParams.set(chave, valor) })
    return destino.toString()
  }

  return { MOTOR: MOTOR, SUPABASE: SUPABASE, CHAVE: CHAVE, COMUNIDADE: COMUNIDADE, ler: ler, guardar: guardar, proxima: proxima }
})()
