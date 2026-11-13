/**
 * Provas da fila das operações (fila-operacoes.ts).
 *   cd servidor && npm run build --silent && node dist/teste-fila-operacoes.mjs
 */
import { criarFilaDeOperacoes, type LinhaDeOperacao, type PlacarDaSessao } from './fila-operacoes'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))
const op = (c: number, s = 's1'): LinhaDeOperacao => ({ contract_id: c, user_id: 'u', sessao_id: s })
const pl = (n: number, s = 's1'): PlacarDaSessao => ({ id: s, operacoes: n, ganhas: n, perdidas: 0, resultado: n, movimentado: n, entrada_atual: 1 })
const erroDeRede = () => new Error('fetch failed')
const erroDoBanco = (code: string) => Object.assign(new Error(`erro ${code}`), { code })

async function provas() {
  /* 1. junta as operações de várias sessões num pacote só, com o placar mais novo de cada uma */
  {
    const pacotes: Array<{ ops: number[]; ses: PlacarDaSessao[] }> = []
    const f = criarFilaDeOperacoes({ esperaMs: 30, enviar: async (o, s) => { pacotes.push({ ops: o.map((x) => x.contract_id), ses: s }) }, umAUm: async () => { throw new Error('não devia') }, avisar: () => undefined })
    f(op(1), pl(1)); f(op(2), pl(2)); f(op(3, 's2'), pl(1, 's2')); f(op(4), pl(3))
    await dormir(80)
    conferir('F1 um pacote com as 4 operações', pacotes.map((p) => p.ops), [[1, 2, 3, 4]])
    conferir('F1b placar mais novo de cada sessão', pacotes[0].ses.map((s) => [s.id, s.operacoes]).sort(), [['s1', 3], ['s2', 1]])
    conferir('F1c medidas', [f.medidas.recebidas, f.medidas.gravadas, f.medidas.pacotes], [4, 4, 1])
  }
  /* 2. banco fora: nada se perde, tenta de novo e grava quando volta */
  {
    let fora = 2
    const gravadas: number[] = []
    const avisos: string[] = []
    const f = criarFilaDeOperacoes({ esperaMs: 10, enviar: async (o) => { if (fora-- > 0) throw erroDeRede(); o.forEach((x) => gravadas.push(x.contract_id)) }, umAUm: async () => { throw new Error('não devia') }, avisar: (m) => avisos.push(m) })
    f(op(10), pl(1)); f(op(11), pl(2))
    await dormir(40)
    f(op(12), pl(3))   // chega enquanto o banco está fora
    await dormir(3500)  // 1ª nova tentativa em 1 s, 2ª em 2 s
    conferir('F2 as 3 operações gravadas depois que o banco voltou, na ordem', gravadas, [10, 11, 12])
    conferir('F2b novas tentativas contadas e avisadas uma vez', [f.medidas.novasTentativas, avisos.length], [2, 1])
  }
  /* 3. um dado ruim no pacote: refaz um a um e só o culpado fica de fora */
  {
    const umAUm: number[] = []
    const avisos: string[] = []
    const f = criarFilaDeOperacoes({ esperaMs: 10, enviar: async () => { throw erroDoBanco('23514') }, umAUm: async (l) => { if (l.contract_id === 21) throw new Error('dígito 12'); umAUm.push(l.contract_id) }, avisar: (m) => avisos.push(m) })
    f(op(20), pl(1)); f(op(21), pl(2)); f(op(22), pl(3))
    await dormir(60)
    conferir('F3 os bons gravam um a um', umAUm, [20, 22])
    conferir('F3b avisa o pacote recusado e o culpado', avisos.length, 2)
  }
  /* 4. sem a função no banco: cai para o caminho antigo e fica nele */
  {
    let chamadasDoPacote = 0
    const umAUm: number[] = []
    const f = criarFilaDeOperacoes({ esperaMs: 10, enviar: async () => { chamadasDoPacote++; throw erroDoBanco('PGRST202') }, umAUm: async (l) => { umAUm.push(l.contract_id) }, avisar: () => undefined })
    f(op(30), pl(1)); await dormir(40); f(op(31), pl(2)); await dormir(40)
    conferir('F4 sem a função: um a um, e o pacote não é tentado de novo', [umAUm, chamadasDoPacote], [[30, 31], 1])
  }
  /* 5. erro de conexão do PostgREST (PGRST001) é passageiro: tenta de novo, não descarta */
  {
    let vezes = 0
    const gravadas: number[] = []
    const f = criarFilaDeOperacoes({ esperaMs: 10, enviar: async (o) => { if (vezes++ === 0) throw erroDoBanco('PGRST001'); o.forEach((x) => gravadas.push(x.contract_id)) }, umAUm: async () => { throw new Error('não devia') }, avisar: () => undefined })
    f(op(40), pl(1)); await dormir(1300)
    conferir('F5 PGRST001 vira nova tentativa', gravadas, [40])
  }
  /* 6. esvaziar espera as operações da sessão gravarem (o encerramento usa) */
  {
    let solta: () => void = () => undefined
    const f = criarFilaDeOperacoes({ esperaMs: 500, enviar: () => new Promise<void>((ok) => { solta = ok }), umAUm: async () => undefined, avisar: () => undefined })
    f(op(50, 'sx'), pl(1, 'sx'))
    let terminou = false
    const espera = f.esvaziar('sx', 2000).then((ok) => { terminou = true; return ok })
    await dormir(30)
    conferir('F6 esvaziar não espera os 500 ms do relógio e não termina antes de o banco confirmar', terminou, false)
    solta(); const ok = await espera
    conferir('F6b terminou com sucesso depois da confirmação', [terminou, ok], [true, true])
    conferir('F6c sessão sem nada guardado responde na hora', await f.esvaziar('outra', 50), true)
  }
  /* 7. esvaziar desiste no limite (banco fora) e o encerramento segue */
  {
    const f = criarFilaDeOperacoes({ esperaMs: 10, enviar: async () => { throw erroDeRede() }, umAUm: async () => undefined, avisar: () => undefined })
    f(op(60), pl(1))
    const t0 = Date.now(); const ok = await f.esvaziar(null, 300)
    conferir('F7 desiste em ~0,3 s sem perder a operação', [ok, Date.now() - t0 < 1000, f.tamanho()], [false, true, 1])
  }
}

provas().then(() => { console.log(`\n${certos} certos, ${errados} errados`); process.exit(errados ? 1 : 0) }).catch((e) => { console.error(e); process.exit(1) })
