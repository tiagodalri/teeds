/** Laboratório (?tela=psicologia(&vazio)(&erro)(&aluno)): a Psicologia do aluno com números de exemplo, sem banco. Nomes inventados. */
import { useState } from 'react'
import { PsicologiaDoAluno } from './PsicologiaDoAluno'

const agora = Date.now()
const ha = (h: number) => new Date(agora - h * 3_600_000).toISOString()
const NOMES = ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes', 'Camila Barros', 'Thiago Moreira', 'Fernanda Dias', 'Bruno Teixeira', 'Aline Souza', 'Gustavo Pires', 'Larissa Rocha']
const PERFIS = ['revanche', 'sumiu_na_perda', 'estuda_nao_deposita', 'depositou_parado', 'disciplinado', 'lucrando', 'operando', 'so_no_treino', 'curioso', 'parado_no_cadastro']
const fim = (f: string, n: number, pessoas: number, resultado: number, volta2: number, volta10: number, trocou: number, resultado_volta: number, dep60: number) =>
  ({ fim: f, n, pessoas, resultado, seg_mediano: 25, volta2, volta10, aumentou: 40, trocou, resultado_volta, volta_ganhou: Math.round(volta10 * 0.5), dep60, saque24: 30 })
const aula = (aula_id: string, titulo: string, modulo: string, viram: number, sem_dep: number, d30m: number, d24h: number, d7d: number, min_mediano: number, gatilho: number) =>
  ({ aula_id, titulo, modulo, viram, concluiram: Math.round(viram * 0.75), reviram: Math.round(viram * 0.35), sem_dep, d30m, d24h, d7d, min_mediano, gatilho })

function painel(vazio: boolean) {
  if (vazio) return { lido_em: ha(0), parceiro: null, base: { alunos: 0, com_aula: 0, com_conta: 0, com_real: 0, depositaram: 0, operaram: 0, markup: 0, dep_total: 0, dep_n: 0, saq_total: 0, resultado: 0, lucrando: 0, perdendo: 0 } }
  return {
    lido_em: ha(0), parceiro: null,
    base: { alunos: 1248, com_aula: 596, com_conta: 442, com_real: 360, depositaram: 244, operaram: 227, markup: 6623.67, dep_total: 31961.71, dep_n: 501, saq_total: 7661.04, resultado: -13282.7, lucrando: 12, perdendo: 215 },
    jornada: { h_ate_aula: 52.7, h_ate_dep: 129, min_dep_op: 66.7, h_aula_dep: 21.7, dep_sem_aula: 18, dep_com_aula: 226, dep1_mediano: 26.9, dia0: 41, dia1a3: 64, dia4a7: 94, dia8: 45 },
    estudo: [
      { ordem: 0, pessoas: 714, depositaram: 2, dep_total: 27.79, markup: 0, operaram: 0, resultado: 0, lucrando: 0, perdas: 0, revanches: 0, dias_media: null },
      { ordem: 1, pessoas: 355, depositaram: 96, dep_total: 7572.81, markup: 2146.78, operaram: 91, resultado: -4001.57, lucrando: 4, perdas: 775, revanches: 399, dias_media: 3.8 },
      { ordem: 2, pessoas: 73, depositaram: 57, dep_total: 10648.95, markup: 1935.13, operaram: 51, resultado: -4243.17, lucrando: 4, perdas: 403, revanches: 192, dias_media: 5 },
      { ordem: 3, pessoas: 106, depositaram: 89, dep_total: 13712.16, markup: 2541.76, operaram: 85, resultado: -5037.96, lucrando: 4, perdas: 844, revanches: 368, dias_media: 7.4 }],
    perfis: [['revanche', 54, 2283, 7785, 54], ['sumiu_na_perda', 74, 1464, 6568, 0], ['estuda_nao_deposita', 38, 0, 0, 16], ['depositou_parado', 23, 0, 3416, 9], ['disciplinado', 22, 455, 1597, 22],
      ['lucrando', 5, 22, 295, 5], ['operando', 72, 2400, 12301, 67], ['so_no_treino', 117, 0, 0, 26], ['curioso', 195, 0, 0, 58], ['parado_no_cadastro', 648, 0, 0, 41]]
      .map(([perfil, pessoas, markup, dep_total, vistos_7d]) => ({ perfil, pessoas, markup, dep_total, resultado: -Number(markup) * 1.6, saldo: 300, vistos_7d })),
    dep1_faixas: [[0, 11, 10, 319], [1, 103, 49, 1658], [2, 42, 11, 769], [3, 29, 11, 657], [4, 59, 16, 3148]].map(([ordem, pessoas, voltaram, markup]) => ({ ordem, pessoas, voltaram, markup, dep_total: markup * 4, resultado: -markup * 2, dias_media: 4 + ordem * 0.6 })),
    redeposito: { uma_vez: 147, duas_ou_mais: 97, cinco_ou_mais: 21, h_ate_segundo: 47.5, segundo_em_24h: 41, markup_uma: 2348.27, markup_duas: 4203.67 },
    saques: { sacaram: 52, depositaram_depois: 32, operaram_depois: 23, sacou_mais_que_pos: 4, h_dep_saque: 58.4, total: 7661.04 },
    sinais: { foto: 104, foto_dep: 73, sem_foto: 1144, sem_foto_dep: 171, push: 215, push_dep: 128, sem_push: 1033, sem_push_dep: 116, bio: 136, bio_dep: 96, sem_bio: 1112, sem_bio_dep: 148, suporte: 67, suporte_dep: 54 },
    treino: { ganhou: 109, ganhou_dep: 64, perdeu: 201, perdeu_dep: 95, sem_treino: 132, sem_treino_dep: 85, direto_real: 85 },
    gerenciamento: { viu: 65, viu_perdas: 575, viu_revanches: 207, viu_zerou: 8, viu_resultado: -4167.61, nao: 145, nao_perdas: 1447, nao_revanches: 752, nao_zerou: 41, nao_resultado: -8956.47 },
    sumico: { negativo: 182, negativo_sumiu: 74, positivo: 45, positivo_sumiu: 5, saldo_parado: 860.73, markup_dos_sumidos: 1463.53 },
    madrugada: { pessoas: 53, forte: 11, resultado_forte: -848.87 },
    aulas: {
      lista: [
        aula('boas-vindas', 'Boas-vindas', 'Trilha', 595, 578, 12, 133, 218, 854, 66), aula('introducao', 'Introdução à GlobalFly Trade', 'Comece aqui', 213, 157, 18, 70, 99, 388, 3),
        aula('visao-geral', 'Conhecendo a plataforma e suas funcionalidades', 'Comece aqui', 199, 147, 16, 65, 95, 426, 4), aula('primeiro-deposito', 'Como depositar via PIX?', 'Comece aqui', 173, 129, 18, 75, 98, 346, 4),
        aula('saldo-demo-real', 'Saldo DEMO e saldo REAL', 'Comece aqui', 170, 117, 12, 61, 84, 347, 13), aula('transferir-saldo', 'Depositou? Transfira seu saldo para operar', 'Comece aqui', 127, 76, 38, 51, 61, 3, 35),
        aula('robo-raptor', 'Como funciona a estratégia RAPTOR?', 'Estratégias de I.A. na prática', 167, 86, 1, 38, 54, 471, 8), aula('gerenciamento', 'O que é gerenciamento de risco?', 'Gerenciamento e emocional', 96, 47, 2, 27, 33, 261, 6),
        aula('depoimentos', 'Depoimentos', 'Alunos e depoimentos', 54, 23, 2, 12, 15, 349, 7)],
      conclusao: { concluiu: 1865, concluiu_dep: 1173, largou: 468, largou_dep: 238 },
      robos: [{ aula_id: 'robo-raptor', nome: 'Raptor', viram: 167, ligaram: 130, ligaram_real: 54, ja_usavam: 102 }, { aula_id: 'robo-legacy', nome: 'Legacy', viram: 103, ligaram: 62, ligaram_real: 23, ja_usavam: 50 }],
    },
    sessoes: {
      fins: [fim('stop', 1670, 204, -9322.37, 780, 977, 558, -1560.2, 79), fim('parou_ganhando', 1263, 144, 1480.36, 591, 810, 216, -663.24, 18), fim('meta', 1257, 134, 2840.75, 682, 862, 135, -730.18, 36),
        fim('parou_perdendo', 232, 84, -741.58, 122, 159, 66, -178.62, 9), fim('zerou', 120, 49, -343.03, 57, 70, 21, -189.48, 16)],
      calor: { quente: 959, quente_ganhou: 442, quente_resultado: -1541.26, frio: 1365, frio_ganhou: 712, frio_resultado: -2466.63 },
      cadeias: { n: 176, pessoas: 75, resultado: -1862.38, sessoes: 611, maior: 9, positivas: 7 },
      robos: [{ nome: 'GF Raptor', n: 1890, pessoas: 190, resultado: -2992.94, perdas: 853, revanches: 399, metas: 289 }, { nome: 'GF Legacy', n: 1378, pessoas: 166, resultado: -1522.08, perdas: 621, revanches: 279, metas: 465 },
        { nome: 'GF Falcon', n: 1193, pessoas: 154, resultado: -1396.05, perdas: 522, revanches: 270, metas: 495 }],
      limites: { stop_mediano: 5, meta_mediana: 2, stop_maior_que_meta: 1488, total: 4543, meta_maior: 1563, res_stop_maior: -2175.52, res_meta_maior: -1754.04 },
    },
    manual: { apos_perda: 4193, apos_ganho: 5655, seg_apos_perda: 108, seg_apos_ganho: 201, dobrou_apos_perda: 857, dobrou_apos_ganho: 348, dobrou_ganhou: 403, dobrou_resultado: -2605.46, igual_apos_perda: 2199, igual_ganhou: 1122,
      igual_resultado: -2837.13, rapida_apos_perda: 1775, pessoas: 184 },
    tempo: {
      horas: Array.from({ length: 24 }, (_, hora) => {
        const peso = hora < 6 ? 0.12 : hora < 9 ? 0.3 : 0.6 + Math.abs(Math.sin(hora / 2.2)) * 0.9 + (hora === 21 ? 0.8 : 0) + (hora === 20 ? 0.5 : 0)
        return { hora, ops: Math.round(5200 * peso), pessoas: Math.round(70 * peso), resultado: Math.round(-620 * peso * (hora === 9 || hora === 19 ? -0.1 : 1) * (hora === 10 ? 2.4 : 1)), deps: Math.round(22 * peso * (hora === 20 ? 1.6 : 1)), dep_valor: Math.round(1300 * peso), saques: Math.round(3 * peso), aulas: Math.round(150 * peso * (hora === 20 ? 1.5 : 1)) }
      }),
      semana: [[0, 13, 515, 127, 3], [1, 41, 2514, 558, 5], [2, 165, 12381, 1602, 6], [3, 95, 7437, 739, 6], [4, 110, 4954, 432, 7], [5, 62, 3139, 194, 6], [6, 15, 1023, 70, 5]].map(([d, deps, dep_valor, aulas, dias]) => ({ d, ops: deps * 180, pessoas: deps, resultado: -deps * 22, deps, dep_valor, aulas, dias })),
    },
    lives: { lives: 40, horas_live: 68.5, horas_fora: 490.7, dep_live: 102, dep_live_valor: 5545.34, dep_fora: 381, dep_fora_valor: 24956, sess_live: 1302, sess_fora: 3234, perdas_live: 620, rev_live: 261, perdas_fora: 1399, rev_fora: 696,
      res_live: -1672.12, res_fora: -4414.82, top: [{ inicio: ha(400), minutos: 221, deps: 24, valor: 878.71 }, { inicio: ha(230), minutos: 75, deps: 5, valor: 688.37 }, { inicio: ha(430), minutos: 167, deps: 2, valor: 645 }] },
    depositos: { total: 501, valor: 31961.71, no_calor: 69, no_calor_valor: 4621.36, no_calor_pessoas: 38, no_calor_depois: -6525.3, no_calor_perdeu: 47, a_frio: 416, a_frio_depois: -8081.42, a_frio_perdeu: 221, apos_ganho: 16,
      min_ate_operar: 23.6, opera_em_5: 121, opera_em_24h: 365, perde_em_24h: 280, ganha_em_24h: 85, devolve_tudo_24h: 107 },
    extras: {
      avisos: [{ titulo: '🔴 Estamos ao vivo agora', criado_em: ha(400), pessoas: 193, clicaram: 10, abriram: 95, depositaram: 25 }, { titulo: '⏳ Falta 1 hora: EP 1 · Raptor', criado_em: ha(5), pessoas: 224, clicaram: 4, abriram: 16, depositaram: 2 }],
      sem_saldo: { viram: 164, clicaram: 63, depositaram_24h: 14, depositaram_7d: 20, vezes_mediana: 3, insistiram: 45 },
      telas: [{ pagina: 'operar', seg_dep: 2757934, seg_nao: 159767, pessoas_dep: 242, pessoas_nao: 256 }, { pagina: 'aulas', seg_dep: 514956, seg_nao: 95150, pessoas_dep: 235, pessoas_nao: 248 }, { pagina: 'aovivo', seg_dep: 184565, seg_nao: 33448, pessoas_dep: 193, pessoas_nao: 84 }],
      suporte: { pessoas: 67, antes_do_deposito: 54, depositou_24h: 36, depositou_7d: 40 },
    },
    historias: [
      { tipo: 'aula_deposito', d: { aula: 'Depositou? Transfira seu saldo para operar', minutos: 1, valor: 272.24, primeiro: true, markup: 57.96, operacoes: 631 } },
      { tipo: 'aula_deposito', d: { aula: 'Como depositar via PIX?', minutos: 3, valor: 423.28, primeiro: false, markup: 1.95, operacoes: 102 } },
      { tipo: 'cadeia', d: { sessoes: 9, minutos: 2, resultado: -0.37 } }, { tipo: 'cadeia', d: { sessoes: 6, minutos: 9, resultado: -30.14 } },
      { tipo: 'zerou_deposito', d: { ia: 'GF Raptor', valor: 333.12, perdeu: 10, minutos: 42 } }, { tipo: 'zerou_deposito', d: { ia: 'GF Falcon', valor: 70, perdeu: 5, minutos: 8 } },
      { tipo: 'passou_da_meta', d: { ia: 'GF Legacy', ganhou: 4.08, devolveu: 50, segundos: 31 } }, { tipo: 'passou_da_meta', d: { ia: 'GF Falcon', ganhou: 0.69, devolveu: 30, segundos: 9 } },
      { tipo: 'perda_aula', d: { aula: 'Como definir sua meta diária?', perdeu: 25, minutos: 290 } },
      { tipo: 'saque_deposito', d: { horas: 0.5, sacou: 800, valor: 400 } }, { tipo: 'saque_deposito', d: { horas: 0.6, sacou: 333.79, valor: 333.12 } },
    ].map((h, i) => ({ ...h, user_id: `a${i % NOMES.length}`, nome: NOMES[i % NOMES.length], foto_url: null, parceiro: i % 2 ? 'n' : 'v', quando: ha(20 + i * 31) })),
  }
}

const lado = (n: number, aulas: number, dep1: number, dias: number, op: number, mk: number, dt: number) => ({ n, aulas, dep1, dias_ate_dep: dias, dias_operando: op, markup: mk / n, depositado: dt / n, markup_total: mk, dep_total: dt })
const fatores = (base: number) => [['Operou em 5 dias ou mais', 71, 39], ['Continua depois de bater a meta', 58, 22], ['2º depósito em até 48 h', 33, 19], ['Concluiu 10 aulas ou mais', 49, 35], ['Opera com I.A. e na manual', 62, 41],
  ['Já sacou', 38, 15], ['Colocou foto no perfil', 44, 24], ['Falou com o suporte', 31, 18], ['Opera só com I.A.', 12, 34], ['Fechou o treino no positivo', 24, 28], ['Veio pelo Victor', 52, 47]]
  .map(([fator, a, b]) => ({ fator, g_sim: Math.round(Number(a) * base / 100), g_n: base, r_sim: Math.round(Number(b) * (220 - base) / 100), r_n: 220 - base }))
const investigacao = () => ({
  lido_em: ha(0),
  numeros: { depositantes: 244, depositos: 501, depositado: 31961.71, deposito_medio: 63.8, por_depositante_medio: 130.99, por_depositante_mediano: 53.19, depositos_por_pessoa: 2.05, redepositaram: 97, sacado: 7693.59,
    saldo_parado: 7611.29, operaram: 221, volume: 131152.71, markup: 6564.36, resultado: -13117.73, giro: 4.1, markup_por_depositante: 26.9, markup_sobre_deposito: 20.5, markup_sobre_volume: 5.01, markup_por_dia_ativo: 5.39,
    vida_mediana_dias: 7.5, dias_operando_mediana: 4, ativos_7d: 116, pararam: 105, vida_de_quem_parou: 2, markup_de_quem_parou: 20.59 },
  redeposito: { h_entre_depositos: 20.4, segundo_maior: 38, segundo_menor: 40, segundo_igual: 19, valor_1: 26.9, valor_2: 20.6, valor_3mais: 22.1, em_1h: 57, em_24h: 141, total: 257 },
  sobrevivencia: [{ dias: 1, base: 220, seguem: 181 }, { dias: 3, base: 214, seguem: 145 }, { dias: 7, base: 211, seguem: 117 }, { dias: 14, base: 181, seguem: 59 }],
  concentracao: { geradores: 221, top10: 37.6, top20pct: 69.5 },
  estrategias: [['GF Raptor', 52000, 190, 2100, 61000, -2990, 37000], ['Manual', 10000, 184, 2400, 34000, -8100, 5200], ['GF Legacy', 31000, 166, 1200, 21000, -1520, 22000], ['GF Falcon', 24000, 154, 860, 15000, -1396, 18500]]
    .map(([nome, operacoes, alunos, markup, volume, resultado, ganhas]) => ({ nome, operacoes, alunos, markup, volume, resultado, ganhas })),
  cortes: { deposito_alto: 157.62, top_markup: 33.45 },
  grupos: { redeposito: { fatores: fatores(97), dentro: lado(97, 7, 20.13, 3.6, 4, 4216, 21660), fora: lado(147, 6, 35.81, 5.9, 3, 2348, 10301) },
    deposito_alto: { fatores: fatores(49), dentro: lado(49, 9, 110, 4.1, 6, 3900, 22100), fora: lado(195, 6, 22, 5.2, 3, 2664, 9861) },
    top_markup: { fatores: fatores(45), dentro: lado(45, 9, 48, 3.9, 8, 4560, 16900), fora: lado(176, 6, 25, 5.1, 3, 2004, 14200) } },
})

const alunos = () => NOMES.flatMap((nome, i) => [0, 1].map((k) => {
  const perfil = PERFIS[(i + k * 5) % PERFIS.length], opera = ['revanche', 'sumiu_na_perda', 'disciplinado', 'lucrando', 'operando'].includes(perfil)
  return { user_id: `a${i}${k ? 'b' : ''}`, nome: k ? `${nome.split(' ')[0]} ${NOMES[(i + 3) % NOMES.length].split(' ').slice(-1)[0]}` : nome, foto_url: null, parceiro: i % 3 === 0 ? 'v' : i % 3 === 1 ? 'n' : null, categoria: 'gold',
    criado_em: ha(600 - i * 20), visto_em: perfil === 'sumiu_na_perda' ? ha(260) : ha(i * 3 + 1), acessos: 30 - i, tempo_seg: 40000, abertas: 12 - (i % 8), concl: opera ? 9 - (i % 6) : perfil === 'estuda_nao_deposita' ? 6 : i % 3,
    viu_ger: i % 2 === 0, saldo: opera ? 60 + i * 9 : 0, dep_n: opera || perfil === 'depositou_parado' ? 1 + (i % 4) : 0, dep_total: opera || perfil === 'depositou_parado' ? 80 + i * 55 : 0, dep1_em: ha(300), dep_ult_em: ha(40),
    saq_n: i % 5 === 0 && opera ? 1 : 0, saq_total: i % 5 === 0 && opera ? 120 : 0, ops: opera ? 900 - i * 60 : 0, resultado: opera ? (perfil === 'lucrando' ? 13.4 : -(40 + i * 21.5)) : 0, markup: opera ? 110 - i * 8.3 : 0, dias: opera ? 3 + (i % 6) : 0,
    op_ult_em: ha(20), madrugada: opera ? i * 14 : 0, ult_dia_res: opera ? -12 : null, demo_n: 4 + i, sess: opera ? 30 + i : 0, stops: opera ? 9 : 0, metas: opera ? 7 : 0, zerou: i % 4 === 0 && opera ? 1 : 0, perdas: opera ? 12 : 0,
    revanches: perfil === 'revanche' ? 9 : opera ? 2 : 0, passou_meta: opera ? 5 : 0, man_apos_perda: opera ? 14 : 0, man_dobras: perfil === 'revanche' ? 6 : 1, perfil }
}))

function linhaDoTempo(id: string) {
  const l = alunos().find((a) => a.user_id === id) ?? alunos()[0]
  const ev = (tipo: string, h: number, d: Record<string, unknown> = {}) => ({ tipo, em: ha(h), d })
  return { aluno: { user_id: l.user_id, nome: l.nome, foto_url: null, parceiro: l.parceiro, criado_em: ha(300), visto_em: ha(2), cidade: 'Curitiba', regiao: 'Paraná' }, eventos: [
    ev('cadastro', 300), ev('termos', 299.99), ev('aula', 299.9, { aula: 'Boas-vindas', concluida: true, segundos: 212, aberturas: 2, ate: 96 }), ev('conta', 296, { real: false }),
    ev('manual', 295.5, { demo: true, ate: ha(295.2), operacoes: 6, ganhas: 4, resultado: 12.4, entrada_min: 5, entrada_max: 5, ativos: 'R_25' }),
    ev('acesso', 250, { visitas: 2, segundos: 900, aparelho: 'celular' }),
    ev('aula', 202, { aula: 'Como depositar via PIX?', concluida: true, segundos: 84, aberturas: 3, ate: 100 }), ev('conta', 201.8, { real: true }), ev('suporte', 201.7, { assunto: 'Depósito · Ainda não, quero saber como' }),
    ev('aula', 201.3, { aula: 'Depositou? Transfira seu saldo para operar', concluida: false, segundos: 40, aberturas: 1, ate: 62 }), ev('deposito', 201.25, { valor: 150, saldo: 150 }),
    ev('ia', 201.2, { demo: false, ate: ha(201.1), sessoes: 2, operacoes: 44, resultado: 6.3, ias: 'GF Raptor', motivo: 'meta', stops: 0, metas: 2, entrada_min: 0.35, entrada_max: 0.35 }),
    ev('ia', 201.05, { demo: false, ate: ha(200.6), sessoes: 5, operacoes: 210, resultado: -48.9, ias: 'GF Raptor, GF Legacy', motivo: 'stop', stops: 4, metas: 0, entrada_min: 0.35, entrada_max: 2 }),
    ev('deposito', 200.4, { valor: 100, saldo: 207.4 }), ev('manual', 200.35, { demo: false, ate: ha(200.1), operacoes: 18, ganhas: 7, resultado: -61.2, entrada_min: 2, entrada_max: 20, ativos: 'EUR/USD' }),
    ev('aula', 196, { aula: 'O que é gerenciamento de risco?', concluida: true, segundos: 1076, aberturas: 1, ate: 99 }),
    ev('aviso_clicado', 60, { titulo: '🔴 Estamos ao vivo agora' }), ev('ia', 59.8, { demo: false, ate: ha(59.3), sessoes: 1, operacoes: 60, resultado: 31.6, ias: 'GF Falcon', motivo: 'meta', stops: 0, metas: 1, entrada_min: 0.5, entrada_max: 0.5 }),
    ev('saque', 58, { valor: 80, saldo: 97.8 }), ev('deposito', 30, { valor: 60, saldo: 157.8 }), ev('acesso', 2, { visitas: 1, segundos: 300, aparelho: 'celular' }),
  ] }
}

export default function LabPsicologia() {
  const q = new URLSearchParams(location.search)
  useState(() => {
    const f = window.fetch
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
      const url = String(u), ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/functions/v1/psicologia-consultor')) {
        await new Promise((r) => setTimeout(r, 1600))
        if (String(i?.body ?? '').includes('estrategista-chefe')) return ok({ resposta: ['RETENÇÃO | Por que 105 alunos pararam em 2 dias, se quem passa do 7º dia dura o dobro? | Quem parou durou 2 dias; a vida útil típica é 7,5.', 'DEPÓSITO | O que os 40 alunos que diminuíram o 2º depósito viram entre um e outro? | 40 de 97 colocaram menos no segundo.', 'RECEITA | Quanto do markup vem de sessões ligadas no impulso? | 47% das perdas viram religada em 2 minutos.', 'AULAS | A aula de gerenciamento deveria vir antes das aulas das I.A.? | Quem concluiu religa em 36% das perdas, contra 52%.', 'LIVES | O que fizemos na live de 10/11 que trouxe 24 depósitos? | Foi a live com mais depósitos de todas.', 'RISCO | Quanto da receita some se os 10 maiores pararem? | Eles são 37,6% do markup.'].join('\n'), modelo: 'lab' })
        return ok({ resposta: 'O ponto mais forte hoje é o estudo: **89 de 106** alunos que concluíram 10 aulas ou mais depositaram (84%).\n\nTrês coisas para esta semana:\n- Chamar os **38 alunos** que estudam e ainda não depositaram.\n- Falar com os **74** que sumiram depois de perder: eles ainda têm **US$ 860,73** parados.\n- Deixar a aula «Depositou? Transfira seu saldo para operar» em destaque: metade deposita em até 30 minutos.\n\nIsso mostra o que acontece junto, não prova de causa.\n\nPRÓXIMAS: Quem são os 38 que estudam e não depositam? | O que eu digo para quem sumiu depois de perder? | Quanto vale recuperar metade dos 74?', modelo: 'lab', alunos_citados: ['a0'], consultas: 2 })
      }
      if (url.includes('/rpc/teeds_psicologia_investigacao')) return ok(q.has('vazio') ? { numeros: null } : investigacao())
      if (url.includes('/rpc/teeds_psicologia_lista')) return ok(q.has('vazio') ? [] : alunos())
      if (url.includes('/rpc/teeds_psicologia_aluno')) return ok(linhaDoTempo(JSON.parse(String(i?.body ?? '{}')).p_user))
      if (url.includes('/rpc/teeds_psicologia')) return q.has('erro') ? new Response('{}', { status: 500 }) : ok(painel(q.has('vazio')))
      return f(u, i)
    }) as typeof fetch
    return 0
  })
  return (
    <div className="admin-page" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px clamp(12px, 3vw, 32px)' }}>
      <PsicologiaDoAluno sessao={{ token: 'lab' } as never} marca="globalfly" parceiro="" />
    </div>
  )
}
