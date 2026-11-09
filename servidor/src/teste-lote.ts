/** Provas do carteiro em lote do monitoramento (lote.ts). `node dist/teste-lote.mjs` */
import { criarLote } from './lote'

let certos = 0, errados = 0
const conferir = (nome: string, obtido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (ok) certos++; else errados++
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`)
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))
type L = { sessao_id: string; n: number }

{ // 1. junta tudo numa ida só e resolve cada um
  const pacotes: L[][] = []
  const g = criarLote<L>({ enviar: async (x) => { pacotes.push(x) }, enviarUm: async () => { throw new Error('não devia') }, esperaMs: 20 })
  const r = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => g({ sessao_id: `s${n}`, n })))
  conferir('cinco gravações viram um pacote', pacotes.map((p) => p.length), [5])
  conferir('todas confirmadas', r.map((x) => x.status), ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'])
}
{ // 2. o banco recusa por causa de um item: refaz um a um e só ele falha
  const umAUm: number[] = []
  const g = criarLote<L>({
    enviar: async () => { throw Object.assign(new Error('chave estrangeira'), { code: '23503' }) },
    enviarUm: async (x) => { umAUm.push(x.n); if (x.n === 2) throw Object.assign(new Error('sessão não existe'), { code: '23503' }) },
    esperaMs: 10,
  })
  const r = await Promise.allSettled([1, 2, 3].map((n) => g({ sessao_id: `s${n}`, n })))
  conferir('recusa do banco: refeito item a item', umAUm.sort(), [1, 2, 3])
  conferir('só o item ruim falha', r.map((x) => x.status), ['fulfilled', 'rejected', 'fulfilled'])
}
{ // 3. falha de rede (sem código): todos falham, para o publicador tentar de novo
  let um = 0
  const g = criarLote<L>({ enviar: async () => { throw new TypeError('fetch failed') }, enviarUm: async () => { um++ }, esperaMs: 10 })
  const r = await Promise.allSettled([1, 2].map((n) => g({ sessao_id: `s${n}`, n })))
  conferir('rede caiu: todos recusados', r.map((x) => x.status), ['rejected', 'rejected'])
  conferir('rede caiu: não tenta um a um', um, 0)
}
{ // 4. mesma sessão nunca vai duas vezes no mesmo pacote (upsert)
  const pacotes: string[][] = []
  const g = criarLote<L>({ enviar: async (x) => { pacotes.push(x.map((l) => l.sessao_id)); await dormir(5) }, enviarUm: async () => {}, chave: (l) => l.sessao_id, esperaMs: 10, emVoo: 1 })
  await Promise.all([g({ sessao_id: 'a', n: 1 }), g({ sessao_id: 'a', n: 2 }), g({ sessao_id: 'b', n: 3 })])
  conferir('a mesma chave sai em pacotes separados', pacotes.every((p) => new Set(p).size === p.length), true)
  conferir('tudo saiu', pacotes.flat().sort(), ['a', 'a', 'b'])
}
{ // 5. limite por pacote
  const tamanhos: number[] = []
  const g = criarLote<L>({ enviar: async (x) => { tamanhos.push(x.length) }, enviarUm: async () => {}, maximo: 50, esperaMs: 10 })
  await Promise.all(Array.from({ length: 120 }, (_, n) => g({ sessao_id: `s${n}`, n })))
  conferir('120 itens com máximo 50: 50+50+20', tamanhos.sort((a, b) => b - a), [50, 50, 20])
}
{ // 6. espera no máximo esperaMs
  const g = criarLote<L>({ enviar: async () => {}, enviarUm: async () => {}, esperaMs: 30 })
  const t0 = Date.now(); await g({ sessao_id: 's', n: 1 }); const ms = Date.now() - t0
  conferir('um item sozinho sai em ~30 ms', ms >= 25 && ms < 200, true)
}

console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
