/**
 * A ponte entre o motor e o Node.
 *
 * O motor da Teeds foi escrito para o navegador, mas quase não depende
 * dele: `engine.ts`, `trading.ts`, `strategies.ts` e `market.ts` não têm
 * uma linha de API de navegador. Sobram duas coisas, e as duas se
 * resolvem aqui — sem tocar em nenhum arquivo do app:
 *
 *  1. `WebSocket`, que o Node 22 já traz nativo (por isso o engines do
 *     package.json exige 22). Nada a fazer além de exigir a versão.
 *  2. `localStorage`, usado só por `robotNames.ts` para anotar qual robô
 *     comprou cada contrato. No servidor isso não precisa sobreviver a
 *     nada: quem guarda a autoria de verdade é a tabela `operacoes_robos`
 *     no Supabase. Um armazenamento em memória basta.
 *
 * Este módulo tem efeito colateral e precisa ser importado ANTES de
 * qualquer coisa do motor.
 */

const maior = Number(process.versions.node.split('.')[0])
if (maior < 22) {
  console.error(`Node ${process.versions.node} não serve: o WebSocket nativo chegou no 22. Instale o Node 22 ou mais novo.`)
  process.exit(1)
}
if (typeof globalThis.WebSocket !== 'function') {
  console.error('Este Node não expõe WebSocket global. Atualize para o Node 22 ou mais novo.')
  process.exit(1)
}

if (typeof (globalThis as any).localStorage === 'undefined') {
  const dados = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => dados.has(k) ? dados.get(k)! : null,
    setItem: (k: string, v: string) => { dados.set(k, String(v)) },
    removeItem: (k: string) => { dados.delete(k) },
    clear: () => { dados.clear() },
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() { return dados.size },
  }
}

export {}
