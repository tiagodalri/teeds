// A URL de um módulo deve ser idêntica na entrada e nos imports dos chunks.
// Versionar apenas o HTML cria duas instâncias do React (main.js?v e main.js).
export function versionarReferencias(texto, versao) {
  return texto.replace(/(["'])((?:\.{1,2}\/|\/?assets\/)[^"'\s?]+\.(?:js|css))(?:\?v=[^"']*)?\1/g,
    (_, aspas, caminho) => `${aspas}${caminho}?v=${versao}${aspas}`)
}
