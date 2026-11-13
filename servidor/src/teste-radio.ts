/**
 * Provas do rádio do monitoramento (radio.ts).
 *   cd servidor && npm run build --silent && node dist/teste-radio.mjs
 */
import { canaisDaSessao, canalDosEventos, criarRadio, type Transmissao } from './radio'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function provas() {
  conferir('C1 canais: marca + parceiro', canaisDaSessao('globalfly', 'n'), ['espelho:globalfly', 'espelho:globalfly:n'])
  conferir('C2 direto vira "-"', canaisDaSessao('globalfly', ''), ['espelho:globalfly', 'espelho:globalfly:-'])
  conferir('C3 parceiro desconhecido: só a marca', [canaisDaSessao('teeds', null), canaisDaSessao('omni', undefined)], [['espelho:teeds'], ['espelho:omni']])
  conferir('C4 canal dos eventos', canalDosEventos('abc'), 'espelho-sessao:abc')

  /* junta tudo num pacote e não segura quem chama */
  {
    const pacotes: Transmissao[][] = []
    const r = criarRadio({ enviar: async (m) => { pacotes.push(m) }, esperaMs: 20, maximo: 3 })
    const t0 = Date.now()
    r(['a', 'b'], 'linha', { x: 1 }); r(['a'], 'linha', { x: 2 }); r(['c'], 'linha', { x: 3 })
    conferir('R1 transmitir volta na hora (não espera a rede)', Date.now() - t0 < 5, true)
    await dormir(60)
    conferir('R2 4 mensagens em pacotes de até 3', pacotes.map((p) => p.length), [3, 1])
    conferir('R3 formato da mensagem (privada, tópico, evento)', pacotes[0][0], { topic: 'a', event: 'linha', payload: { x: 1 }, private: true })
    conferir('R4 medidas', [r.medidas.mensagens, r.medidas.pacotes, r.medidas.falhas], [4, 2, 0])
  }
  /* falha do Realtime vira aviso (um por minuto), nunca exceção */
  {
    const avisos: string[] = []
    const r = criarRadio({ enviar: async () => { throw new Error('503') }, esperaMs: 5, avisar: (m) => avisos.push(m) })
    r(['a'], 'linha', 1); await dormir(30); r(['a'], 'linha', 2); await dormir(30)
    conferir('R5 duas falhas, um aviso só', [r.medidas.falhas, avisos.length], [2, 1])
  }
  /* Realtime parado: a fila tem teto e descarta o mais antigo */
  {
    let solta: () => void = () => undefined
    const enviados: Transmissao[][] = []
    const r = criarRadio({ enviar: (m) => { enviados.push(m); return new Promise<void>((ok) => { solta = ok }) }, esperaMs: 1, emVoo: 1, maximo: 10, teto: 50 })
    r(['a'], 'linha', 0); await dormir(10)            // um pacote preso no ar
    for (let i = 1; i <= 200; i++) r(['a'], 'linha', i)
    conferir('R6 fila presa não passa do teto', r.medidas.descartadas, 150)
    solta(); await dormir(20)
    while (enviados.length < 6) { solta(); await dormir(5) }
    conferir('R7 sobra o mais novo (151..200)', [enviados[1][0].payload, enviados[enviados.length - 1].slice(-1)[0].payload], [151, 200])
  }
}

provas().then(() => { console.log(`\n${certos} certos, ${errados} errados`); process.exit(errados ? 1 : 0) }).catch((e) => { console.error(e); process.exit(1) })
