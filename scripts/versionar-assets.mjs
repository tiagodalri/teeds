// A URL de um módulo deve ser idêntica na entrada e nos imports dos chunks.
// Versionar apenas o HTML cria duas instâncias do React (main.js?v e main.js).
export function versionarReferencias(texto, versao) {
  return texto.replace(/(["'])((?:\.{1,2}\/|\/?assets\/)[^"'\s?]+\.(?:js|css))(?:\?v=[^"']*)?\1/g,
    (_, aspas, caminho) => `${aspas}${caminho}?v=${versao}${aspas}`)
}

// O carregador de chunks do Vite decide se um arquivo é estilo por
// `nome.endsWith(".css")`. Com o "?v=" no fim, o CSS de uma tela que carrega
// sob demanda (Ao vivo, convite do app) era pedido como script e nunca
// aplicado: a página abria crua (18/10/2026). A troca faz ele reconhecer o
// .css mesmo com a versão.
export function cssDosChunksComVersao(texto) {
  return texto.replaceAll('.endsWith(".css")', '.includes(".css")')
}
