/**
 * Planilha Excel do Compartilhamento de receita (18/11/2026, Tiago: "extrair uma planilha da tela de
 * compartilhamento... com um layout legal da GlobalFly... para ficar fácil a explicação para o aluno novo").
 *
 * Duas abas:
 *  - Resumo: como funciona (4 passos), os números do mês, a conta por plano (Gold 10%, Black 5%, Prestige isento)
 *    com fórmulas que leem a aba Clientes, e a cotação usada;
 *  - Clientes: uma linha por cliente (nome completo, telefone, e-mail, quando entrou, corretora, depósito inicial,
 *    plano, resultado do mês em US$ e em %, em reais, participação e quanto paga), com filtro e linha de total.
 *
 * Vale para a base real (acompanhamento interno) e para a simulada. A simulada leva a faixa laranja
 * "Simulação" no topo das duas abas e no nome do arquivo: os nomes e os números são inventados.
 * A biblioteca (exceljs) só é baixada quando alguém clica em Baixar planilha.
 */
import type { Linha } from './CompartilhamentoDeReceita'

export interface DadosDaPlanilha {
  simulado: boolean
  /** "Novembro de 2026" */
  mesNome: string
  fechado: boolean
  cotacao: number
  cotacaoTexto: string
  percentuais: Record<string, number>
  linhas: Linha[]
  /** "Todos os parceiros" ou o nome do parceiro do filtro */
  recorte: string
}

const AZUL = 'FF051528', AZUL2 = 'FF0A2340', OURO = 'FFD9B465', OURO_ESCURO = 'FFB78D39', CREME = 'FFF7F3EA', LINHA = 'FFE7DFCC'
const VERDE = 'FF0B9E4A', VERMELHO = 'FFDC1F2E', SUAVE = 'FF5B6B80', LARANJA = 'FFFB923C', TEXTO = 'FF0B1B2E'
const NOME_PLANO: Record<string, string> = { gold: 'Gold', black: 'Black', prestige: 'Prestige', silver: 'Silver' }
const nomePlano = (s: string) => NOME_PLANO[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : '—')
const USD = '"US$" #,##0.00;[Red]-"US$" #,##0.00'
const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const PCT = '0.0%;[Red]-0.0%'
/** Arredonda em 2 casas como o ROUND do Excel/Numbers (metade para longe do zero, sem o resto de ponto flutuante). */
const r2 = (x: number) => Math.sign(x) * Math.round(Number(Math.abs(x * 100).toPrecision(12))) / 100
type LinhaDaPlanilha = Linha & { _lucro?: number; _lucroR?: number; _paga?: number; _pagaR?: number }
/** "11987654321" → "(11) 98765-4321" (o que não for só número fica como veio) */
function telefone(t: string | null | undefined) {
  if (!t) return '—'
  let d = t.replace(/\D/g, '')
  if (!/^[\d\s()+-]+$/.test(t)) return t
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

async function logoEmBase64(): Promise<string | null> {
  try {
    const r = await fetch('/globalfly-assinatura.png')
    if (!r.ok) return null
    const b = new Uint8Array(await r.arrayBuffer())
    let s = ''
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
    return btoa(s)
  } catch { return null }
}

export async function baixarPlanilhaDoCompartilhamento(d: DadosDaPlanilha): Promise<void> {
  const buf = await montarPlanilhaDoCompartilhamento(d, await logoEmBase64())
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `GlobalFly - Compartilhamento de receita - ${d.mesNome}${d.simulado ? ' (simulação)' : ''}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/** Monta o arquivo (sem baixar): a tela usa pelo botão; dá também para montar fora do navegador. */
export async function montarPlanilhaDoCompartilhamento(d: DadosDaPlanilha, logo: string | null = null): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GlobalFly Trade'
  wb.created = new Date()
  const idLogo = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null
  const plano = (l: Linha) => l.fatura?.subplano ?? l.subplano
  const perc = (l: Linha) => l.fatura?.percentual ?? l.percentual
  // cópia: o lucro da planilha (_lucro) é gravado na linha sem mexer no que a tela mostra
  const linhas = [...d.linhas].map((l) => ({ ...l })).sort((a, b) => b.resultado - a.resultado)
  // simulação (24/11/2026, Tiago: "ordem misturada os positivos e negativos, aleatoriamente, pra ficar natural"):
  // embaralha com uma semente tirada dos próprios clientes — a mesma base sai sempre na mesma ordem
  if (d.simulado) {
    let h = 2166136261
    for (const l of linhas) for (const ch of l.user_id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
    h = h || 1
    const acaso = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296 }
    for (let i = linhas.length - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [linhas[i], linhas[j]] = [linhas[j], linhas[i]] }
  }
  const n = linhas.length

  type Ws = ReturnType<typeof wb.addWorksheet>
  const fundo = (c: { fill?: unknown }, cor: string) => { (c as { fill: unknown }).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } } }
  /** faixa azul com o logo e o título, na largura das colunas da aba */
  const cabecalho = (ws: Ws, colunas: number, titulo: string, sub: string) => {
    for (let r = 1; r <= 4; r++) { ws.getRow(r).height = r === 1 || r === 4 ? 10 : 30; for (let c = 1; c <= colunas; c++) fundo(ws.getCell(r, c), AZUL) }
    if (idLogo !== null) ws.addImage(idLogo, { tl: { col: 0.25, row: 0.45 }, ext: { width: 200, height: 63 } })
    const t = ws.getCell(2, 4); t.value = titulo; t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: OURO } }
    const s = ws.getCell(3, 4); s.value = sub; s.font = { name: 'Calibri', size: 11, color: { argb: 'FFC9D3DF' } }
    // 24/11/2026 (Tiago): "por enquanto, pode remover a linha 5" — sai a faixa laranja da simulação; o aviso fica
    // no subtítulo ("base simulada"), na nota do rodapé e no nome do arquivo
    return 6
  }

  /* ------------------------------------------------------------------------------------------ aba Clientes */
  // o Resumo é criado antes, para ser a 1ª aba (é preenchido depois, porque lê a aba Clientes)
  const wr = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
  const wc = wb.addWorksheet('Clientes', { views: [{ state: 'frozen', ySplit: 6, showGridLines: false }] })
  // 24/11/2026 (Victor): sem a coluna de parceiro, e a conta na ordem em que se explica — depósito × % = lucro,
  // depósito + lucro = saldo final, e a participação só sobre o lucro
  const COLS: Array<{ t: string; w: number }> = [
    { t: 'Nº', w: 6 }, { t: 'Nome completo', w: 30 }, { t: 'Telefone', w: 17 }, { t: 'E-mail', w: 30 }, { t: 'Entrou em', w: 12 },
    { t: 'Corretora', w: 11 }, { t: 'Plano', w: 10 }, { t: 'Depósito inicial (US$)', w: 15 }, { t: 'Lucro do mês (%)', w: 13 },
    { t: 'Lucro do mês (US$)', w: 16 }, { t: 'Saldo final (US$)', w: 16 }, { t: 'Lucro em reais', w: 16 },
    { t: 'Participação', w: 12 }, { t: 'Paga (US$)', w: 13 }, { t: 'Paga (R$)', w: 13 }, { t: 'Situação', w: 19 },
  ]
  COLS.forEach((c, i) => { wc.getColumn(i + 1).width = c.w })
  const iniC = cabecalho(wc, COLS.length, 'Compartilhamento de receita · Clientes', `${d.mesNome} · ${d.simulado ? 'base simulada' : 'conta real, I.A. e manual'}`)
  const cab = wc.getRow(iniC)
  COLS.forEach((c, i) => {
    const x = cab.getCell(i + 1); x.value = c.t
    x.font = { bold: true, size: 10.5, color: { argb: OURO } }; fundo(x, AZUL2)
    x.alignment = { vertical: 'middle', horizontal: i < 7 || i === 15 ? 'left' : 'right', wrapText: true }
    x.border = { bottom: { style: 'medium', color: { argb: OURO_ESCURO } } }
  })
  cab.height = 34
  // cotação: uma célula só, que as fórmulas leem (quem trocar ela vê a planilha inteira mudar)
  // Resumo: cabeçalho (5 linhas, +1 com a faixa da simulação) + 1, Como funciona (6) e a 9ª linha dos números
  const celCot = `Resumo!$C$${6 + 6 + 9}`
  const L = (l: Linha) => (l as LinhaDaPlanilha)._lucro ?? l.resultado
  const LR = (l: Linha) => (l as LinhaDaPlanilha)._lucroR ?? 0
  const PG = (l: Linha) => (l as LinhaDaPlanilha)._paga ?? 0
  const PR = (l: Linha) => (l as LinhaDaPlanilha)._pagaR ?? 0
  const somar = (lista: Linha[], f: (l: Linha) => number) => r2(lista.reduce((t, l) => t + f(l), 0))
  linhas.forEach((l, k) => {
    const r = iniC + 1 + k
    const row = wc.getRow(r)
    const dep = l.deposito_inicial ?? null
    const p = perc(l)
    // simulação: a % é o número digitado e o lucro sai dela (depósito × %); quem mudar o depósito ou a % vê o lucro,
    // o saldo e a participação acompanharem. Base real: o lucro é o que aconteceu e a % sai dele.
    const taxa = dep ? Math.round(l.resultado / dep * 1000) / 1000 : null
    const lucro = d.simulado && dep && taxa !== null ? r2(dep * taxa) : l.resultado
    const pagaUsd = lucro > 0 ? r2(lucro * p) : 0
    // os valores de cada linha, como o Excel calcula: todos os totais somam estes (fecham centavo a centavo)
    Object.assign(l as LinhaDaPlanilha, { _lucro: lucro, _lucroR: r2(lucro * d.cotacao), _paga: pagaUsd, _pagaR: r2(pagaUsd * d.cotacao) })
    const sitFixa = l.fatura ? (l.fatura.situacao === 'paga' ? 'Fatura paga' : l.fatura.situacao === 'cancelada' ? 'Cancelada' : 'Fatura em aberto')
      : lucro <= 0 ? 'Negativo: não paga' : p <= 0 ? 'Prestige: isento' : d.simulado ? `Paga ${Math.round(p * 100)}% do lucro` : d.fechado ? 'A faturar' : 'Prévia do mês'
    row.values = [
      k + 1, l.nome || l.email || 'Sem nome', telefone(l.telefone), l.email || '—', l.entrou_em ? new Date(l.entrou_em) : '—', l.corretora || 'Deriv',
      nomePlano(plano(l)), dep ?? '—',
      d.simulado && taxa !== null ? taxa : { formula: `IF(ISNUMBER(H${r}),IF(H${r}>0,J${r}/H${r},""),"")`, result: taxa ?? '' },
      d.simulado && dep ? { formula: `ROUND(H${r}*I${r},2)`, result: lucro } : lucro,
      { formula: `IF(ISNUMBER(H${r}),H${r}+J${r},"")`, result: dep ? r2(dep + lucro) : '' },
      { formula: `ROUND(J${r}*${celCot},2)`, result: r2(lucro * d.cotacao) },
      p,
      { formula: `ROUND(MAX(0,J${r})*M${r},2)`, result: pagaUsd },
      { formula: `ROUND(N${r}*${celCot},2)`, result: r2(pagaUsd * d.cotacao) },
      d.simulado ? { formula: `IF(J${r}<0,"Negativo: não paga",IF(M${r}=0,"Prestige: isento","Paga "&ROUND(M${r}*100,0)&"% do lucro"))`, result: sitFixa } : sitFixa,
    ]
    row.height = 20
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (k % 2 === 1) fundo(c, CREME)
      c.font = { size: 10.5, color: { argb: TEXTO } }
      c.alignment = { vertical: 'middle', horizontal: col <= 7 || col === 16 ? 'left' : 'right' }
      c.border = { bottom: { style: 'hair', color: { argb: LINHA } } }
    })
    row.getCell(1).font = { size: 10, color: { argb: SUAVE } }
    row.getCell(2).font = { size: 10.5, bold: true, color: { argb: TEXTO } }
    row.getCell(5).numFmt = 'dd/mm/yyyy'
    row.getCell(8).numFmt = USD
    const cor = lucro > 0 ? VERDE : lucro < 0 ? VERMELHO : SUAVE
    for (const c of [9, 10, 12]) row.getCell(c).font = { size: 10.5, bold: c === 10, color: { argb: cor } }
    row.getCell(9).numFmt = PCT; row.getCell(10).numFmt = USD; row.getCell(11).numFmt = USD; row.getCell(12).numFmt = BRL
    row.getCell(11).font = { size: 10.5, bold: true, color: { argb: TEXTO } }
    row.getCell(13).numFmt = '0%'
    row.getCell(14).numFmt = USD; row.getCell(15).numFmt = BRL
    row.getCell(15).font = { size: 10.5, bold: pagaUsd > 0, color: { argb: pagaUsd > 0 ? OURO_ESCURO : SUAVE } }
    const corPlano = plano(l) === 'gold' ? OURO_ESCURO : plano(l) === 'black' ? 'FF111113' : 'FF8A7550'
    row.getCell(7).font = { size: 10.5, bold: true, color: { argb: corPlano } }
  })
  const fimC = iniC + n
  const tot = wc.getRow(fimC + 1)
  tot.getCell(2).value = `Total · ${n.toLocaleString('pt-BR')} clientes`
  if (n) {
    const somaL = linhas.reduce((t, l) => t + L(l), 0), somaDep = linhas.reduce((t, l) => t + (l.deposito_inicial ?? 0), 0)
    const somaP = somar(linhas, PG)
    tot.getCell(8).value = { formula: `SUM(H${iniC + 1}:H${fimC})`, result: somaDep }
    tot.getCell(10).value = { formula: `SUM(J${iniC + 1}:J${fimC})`, result: somaL }
    tot.getCell(11).value = { formula: `SUM(K${iniC + 1}:K${fimC})`, result: somaDep + somaL }
    tot.getCell(12).value = { formula: `SUM(L${iniC + 1}:L${fimC})`, result: somar(linhas, LR) }
    tot.getCell(14).value = { formula: `SUM(N${iniC + 1}:N${fimC})`, result: somaP }
    tot.getCell(15).value = { formula: `SUM(O${iniC + 1}:O${fimC})`, result: somar(linhas, PR) }
  }
  tot.height = 26
  for (let c = 1; c <= COLS.length; c++) {
    const x = tot.getCell(c); fundo(x, AZUL)
    x.font = { bold: true, size: 11, color: { argb: c === 15 ? OURO : 'FFF4EEDF' } }
    x.alignment = { vertical: 'middle', horizontal: c <= 7 ? 'left' : 'right' }
  }
  tot.getCell(8).numFmt = USD; tot.getCell(10).numFmt = USD; tot.getCell(11).numFmt = USD; tot.getCell(12).numFmt = BRL; tot.getCell(14).numFmt = USD; tot.getCell(15).numFmt = BRL
  if (n) wc.autoFilter = { from: { row: iniC, column: 1 }, to: { row: fimC, column: COLS.length } }

  /* ------------------------------------------------ rodapé: fechamento do mês (18/11/2026, Tiago: "um rodapé com
     todas as somatórias bonitinho... quantidade de prejuízo, de lucro, valor em dólar, a conversão para reais e os
     10% que a gente tem para receber... alto padrão"). Cartões em 4 blocos de colunas + a conta por plano alinhada
     às colunas da tabela. Tudo em fórmula, lendo as linhas de cima e a cotação do Resumo. */
  {
    const faixa = (col: string) => `${col}${iniC + 1}:${col}${Math.max(iniC + 1, fimC)}`
    const somaPaga = somar(linhas, PG)
    const lucroUsd = linhas.filter((l) => L(l) > 0).reduce((s, l) => s + L(l), 0)
    const perdaUsd = linhas.filter((l) => L(l) < 0).reduce((s, l) => s + L(l), 0)
    const borda = { style: 'thin' as const, color: { argb: 'FFD9C9A3' } }
    let r0 = fimC + 3
    // título da seção
    wc.mergeCells(r0, 2, r0, COLS.length)
    const tt = wc.getCell(r0, 2)
    tt.value = `FECHAMENTO DO MÊS  ·  ${d.mesNome}${d.simulado ? ' · simulação' : ''}`
    tt.font = { bold: true, size: 13, color: { argb: OURO } }
    tt.alignment = { vertical: 'middle', indent: 1 }
    for (let c = 1; c <= COLS.length; c++) fundo(wc.getCell(r0, c), AZUL)
    wc.getRow(r0).height = 30
    // fio dourado embaixo do título
    for (let c = 1; c <= COLS.length; c++) { fundo(wc.getCell(r0 + 1, c), OURO_ESCURO) }
    wc.getRow(r0 + 1).height = 3
    r0 += 3

    // cartões: [coluna inicial, coluna final] — B:D, E:I, J:L, M:P
    const BLOCOS: Array<[number, number]> = [[2, 4], [5, 9], [10, 12], [13, 16]]
    type Cartao = { rot: string; valor: unknown; fmt: string; cor: string; sub?: unknown; subFmt?: string; destaque?: boolean }
    const cartao = (linha: number, [a, b]: [number, number], k: Cartao) => {
      wc.mergeCells(linha, a, linha, b); wc.mergeCells(linha + 1, a, linha + 1, b); wc.mergeCells(linha + 2, a, linha + 2, b)
      const fundoCartao = k.destaque ? 'FF0A2340' : CREME
      const r = wc.getCell(linha, a); r.value = k.rot.toUpperCase()
      r.font = { bold: true, size: 9, color: { argb: k.destaque ? OURO : SUAVE } }
      r.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 }
      const v = wc.getCell(linha + 1, a); v.value = k.valor as never; v.numFmt = k.fmt
      v.font = { bold: true, size: 18, color: { argb: k.destaque ? OURO : k.cor } }
      v.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      const s = wc.getCell(linha + 2, a); s.value = (k.sub ?? '') as never; if (k.subFmt) s.numFmt = k.subFmt
      s.font = { size: 10, italic: !k.subFmt, color: { argb: k.destaque ? 'FFF4EEDF' : SUAVE } }
      s.alignment = { vertical: 'top', horizontal: 'left', indent: 1 }
      for (let rr = linha; rr <= linha + 2; rr++) for (let c = a; c <= b; c++) {
        const x = wc.getCell(rr, c); fundo(x, fundoCartao)
        x.border = { top: rr === linha ? borda : undefined, bottom: rr === linha + 2 ? borda : undefined, left: c === a ? borda : undefined, right: c === b ? borda : undefined }
      }
      if (k.destaque) for (let c = a; c <= b; c++) wc.getCell(linha, c).border = { ...wc.getCell(linha, c).border, top: { style: 'medium', color: { argb: OURO } } }
    }
    const alturas = (linha: number) => { wc.getRow(linha).height = 18; wc.getRow(linha + 1).height = 30; wc.getRow(linha + 2).height = 18 }
    const nLucro = linhas.filter((l) => L(l) > 0).length, nNeg = linhas.filter((l) => L(l) < 0).length

    // 1ª fileira: quantos e quanto
    alturas(r0)
    cartao(r0, BLOCOS[0], { rot: 'Clientes no lucro', valor: { formula: `COUNTIF(${faixa('J')},">0")`, result: nLucro }, fmt: '0', cor: VERDE,
      sub: `de ${n.toLocaleString('pt-BR')} que operaram no mês` })
    cartao(r0, BLOCOS[1], { rot: 'Clientes no prejuízo', valor: { formula: `COUNTIF(${faixa('J')},"<0")`, result: nNeg }, fmt: '0', cor: VERMELHO,
      sub: 'Não pagam nada e o mês zera' })
    cartao(r0, BLOCOS[2], { rot: 'Lucro dos clientes (US$)', valor: { formula: `SUMIF(${faixa('J')},">0")`, result: lucroUsd }, fmt: USD, cor: VERDE,
      sub: { formula: `SUMIF(${faixa('J')},"<0")`, result: perdaUsd }, subFmt: '"Prejuízo " "US$" #,##0.00;"Prejuízo " -"US$" #,##0.00' })
    cartao(r0, BLOCOS[3], { rot: 'Lucro dos clientes em reais', valor: { formula: `SUMIF(${faixa('J')},">0",${faixa('L')})`, result: somar(linhas.filter((l) => L(l) > 0), LR) }, fmt: BRL, cor: VERDE,
      sub: { formula: celCot, result: d.cotacao }, subFmt: '"Cotação R$ "0.0000' })
    // espaço entre as fileiras
    wc.getRow(r0 + 3).height = 10
    const r1 = r0 + 4
    alturas(r1)
    const pagaGold = somar(linhas.filter((l) => plano(l) === 'gold'), PG)
    const pagaBlack = somar(linhas.filter((l) => plano(l) === 'black'), PG)
    cartao(r1, BLOCOS[0], { rot: `Gold · ${Math.round((d.percentuais.gold ?? 0.1) * 100)}% do lucro`, fmt: USD, cor: OURO_ESCURO,
      valor: { formula: `SUMIFS(${faixa('N')},${faixa('G')},"Gold")`, result: pagaGold },
      sub: { formula: `SUMIFS(${faixa('O')},${faixa('G')},"Gold")`, result: somar(linhas.filter((l) => plano(l) === 'gold'), PR) }, subFmt: '"Em reais R$ "#,##0.00' })
    cartao(r1, BLOCOS[1], { rot: `Black · ${Math.round((d.percentuais.black ?? 0.05) * 100)}% do lucro`, fmt: USD, cor: 'FF111113',
      valor: { formula: `SUMIFS(${faixa('N')},${faixa('G')},"Black")`, result: pagaBlack },
      sub: { formula: `SUMIFS(${faixa('O')},${faixa('G')},"Black")`, result: somar(linhas.filter((l) => plano(l) === 'black'), PR) }, subFmt: '"Em reais R$ "#,##0.00' })
    cartao(r1, BLOCOS[2], { rot: 'Compartilhamento (US$)', fmt: USD, cor: TEXTO,
      valor: { formula: `SUM(${faixa('N')})`, result: somaPaga }, sub: 'Prestige é isento' })
    cartao(r1, BLOCOS[3], { rot: d.fechado && !d.simulado ? 'A receber da equipe' : 'Total a receber', fmt: BRL, cor: OURO, destaque: true,
      valor: { formula: `SUM(${faixa('O')})`, result: somar(linhas, PR) },
      sub: 'Gold + Black, convertido pela cotação' })

    // conta por plano alinhada às colunas da tabela (Plano em H, US$ em J, R$ em L, % em M, paga em N e O)
    const rP = r1 + 4
    const hp = wc.getRow(rP); hp.height = 24
    const cabP: Array<[number, string]> = [[2, 'Conta por plano'], [7, 'Plano'], [8, 'No lucro'], [10, 'Lucro (US$)'], [12, 'Lucro em reais'], [13, 'Participação'], [14, 'Paga (US$)'], [15, 'Paga (R$)']]
    for (let c = 2; c <= COLS.length; c++) { const x = hp.getCell(c); fundo(x, AZUL2); x.border = { bottom: { style: 'medium', color: { argb: OURO_ESCURO } } } }
    for (const [c, t] of cabP) { const x = hp.getCell(c); x.value = t; x.font = { bold: true, size: 10, color: { argb: OURO } }; x.alignment = { vertical: 'middle', horizontal: c >= 8 ? 'right' : 'left', indent: c === 2 ? 1 : 0 } }
    ;(['gold', 'black', 'prestige'] as const).forEach((p, k) => {
      const r = rP + 1 + k, nome = nomePlano(p), pc = d.percentuais[p] ?? 0
      const lucroP = linhas.filter((l) => plano(l) === p && L(l) > 0)
      const sL = lucroP.reduce((s, l) => s + L(l), 0)
      const row = wc.getRow(r); row.height = 22
      row.getCell(2).value = k === 0 ? 'Quem lucrou, por plano' : ''
      row.getCell(7).value = nome
      row.getCell(8).value = { formula: `COUNTIFS(${faixa('G')},"${nome}",${faixa('J')},">0")`, result: lucroP.length }
      row.getCell(10).value = { formula: `SUMIFS(${faixa('J')},${faixa('G')},"${nome}",${faixa('J')},">0")`, result: sL }
      row.getCell(12).value = { formula: `SUMIFS(${faixa('L')},${faixa('G')},"${nome}",${faixa('J')},">0")`, result: somar(lucroP, LR) }
      row.getCell(13).value = pc > 0 ? pc : 'Isento'
      row.getCell(14).value = { formula: `SUMIFS(${faixa('N')},${faixa('G')},"${nome}")`, result: somar(linhas.filter((l) => plano(l) === p), PG) }
      row.getCell(15).value = { formula: `SUMIFS(${faixa('O')},${faixa('G')},"${nome}")`, result: somar(linhas.filter((l) => plano(l) === p), PR) }
      for (let c = 2; c <= COLS.length; c++) {
        const x = row.getCell(c); if (k % 2 === 1) fundo(x, CREME)
        x.border = { bottom: { style: 'hair', color: { argb: LINHA } } }
        x.alignment = { vertical: 'middle', horizontal: c >= 8 ? 'right' : 'left', indent: c === 2 ? 1 : 0 }
        x.font = { size: 10.5, color: { argb: TEXTO } }
      }
      row.getCell(2).font = { size: 10, italic: true, color: { argb: SUAVE } }
      row.getCell(7).font = { size: 10.5, bold: true, color: { argb: p === 'gold' ? OURO_ESCURO : p === 'black' ? 'FF111113' : 'FF8A7550' } }
      row.getCell(10).font = { size: 10.5, bold: true, color: { argb: VERDE } }; row.getCell(12).font = { size: 10.5, color: { argb: VERDE } }
      row.getCell(15).font = { size: 10.5, bold: true, color: { argb: OURO_ESCURO } }
      row.getCell(8).numFmt = '0'; row.getCell(10).numFmt = USD; row.getCell(12).numFmt = BRL; row.getCell(13).numFmt = '0%'; row.getCell(14).numFmt = USD; row.getCell(15).numFmt = BRL
    })
    const rt = rP + 4, tr = wc.getRow(rt); tr.height = 26
    tr.getCell(2).value = 'Total'
    tr.getCell(8).value = { formula: `SUM(H${rP + 1}:H${rP + 3})`, result: nLucro }
    tr.getCell(10).value = { formula: `SUM(J${rP + 1}:J${rP + 3})`, result: lucroUsd }
    tr.getCell(12).value = { formula: `SUM(L${rP + 1}:L${rP + 3})`, result: somar(linhas.filter((l) => L(l) > 0), LR) }
    tr.getCell(14).value = { formula: `SUM(N${rP + 1}:N${rP + 3})`, result: somaPaga }
    tr.getCell(15).value = { formula: `SUM(O${rP + 1}:O${rP + 3})`, result: somar(linhas, PR) }
    for (let c = 2; c <= COLS.length; c++) {
      const x = tr.getCell(c); fundo(x, AZUL)
      x.font = { bold: true, size: 11.5, color: { argb: c === 15 ? OURO : 'FFF4EEDF' } }
      x.alignment = { vertical: 'middle', horizontal: c >= 8 ? 'right' : 'left', indent: c === 2 ? 1 : 0 }
    }
    tr.getCell(8).numFmt = '0'; tr.getCell(10).numFmt = USD; tr.getCell(12).numFmt = BRL; tr.getCell(14).numFmt = USD; tr.getCell(15).numFmt = BRL
    const pe = wc.getCell(rt + 2, 2)
    pe.value = `Os totais acima são fórmulas: leem as linhas dos clientes e a cotação do Resumo. Gerada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · GlobalFly Trade${d.simulado ? ' · simulação com nomes e números fictícios' : ''}.`
    pe.font = { size: 9.5, italic: true, color: { argb: SUAVE } }
  }

  /* ------------------------------------------------------------------------------------------- aba Resumo */
  ;[3, 30, 18, 16, 16, 16, 18, 18].forEach((w, i) => { wr.getColumn(i + 1).width = w })
  const iniR = cabecalho(wr, 8, 'Compartilhamento de receita', `${d.mesNome}${d.simulado ? ' · simulação' : ''}`)

  // como funciona (para o aluno novo)
  const passos = [
    ['1', 'O lucro do mês de cada cliente é o depósito × a % que ele lucrou. Ex.: US$ 1.000 com 20% = US$ 200 de lucro.'],
    ['2', 'O saldo final é o depósito + o lucro. No exemplo: US$ 1.000 + US$ 200 = US$ 1.200.'],
    ['3', `O compartilhamento é só sobre o lucro, nunca sobre o saldo: Gold ${Math.round((d.percentuais.gold ?? 0.1) * 100)}%, Black ${Math.round((d.percentuais.black ?? 0.05) * 100)}% e Prestige não paga nada. No exemplo, Gold paga 10% de US$ 200 = US$ 20.`],
    ['4', 'Convertemos para reais pela cotação do dólar do dia. Quem fechou o mês no negativo não paga nada, e cada mês começa do zero.'],
  ]
  const tit = (r: number, t: string) => { const c = wr.getCell(r, 2); c.value = t; c.font = { bold: true, size: 13, color: { argb: AZUL } }; wr.getRow(r).height = 22 }
  tit(iniR, 'Como funciona')
  passos.forEach(([k, t], i) => {
    const r = iniR + 1 + i
    wr.mergeCells(r, 2, r, 8)
    const b = wr.getCell(r, 2)
    b.value = { richText: [{ text: `${k}.  `, font: { bold: true, size: 12, color: { argb: OURO_ESCURO } } }, { text: t, font: { size: 11, color: { argb: TEXTO } } }] }
    b.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
    for (let c = 2; c <= 8; c++) fundo(wr.getCell(r, c), CREME)
    wr.getRow(r).height = 34
  })

  // números do mês
  const soma = (f: (l: Linha) => number, l = linhas) => l.reduce((s, x) => s + f(x), 0)
  const noLucro = linhas.filter((l) => L(l) > 0), noNeg = linhas.filter((l) => L(l) < 0)
  const comDep = linhas.filter((l) => (l.deposito_inicial ?? 0) > 0)
  const rN = iniR + 6
  tit(rN, 'Os números do mês')
  const R = (k: number) => rN + 1 + k
  const ref = (col: string) => `Clientes!${col}${iniC + 1}:${col}${Math.max(iniC + 1, fimC)}`
  const kpis: Array<[string, unknown, string]> = [
    ['Clientes que operaram', { formula: `COUNTA(${ref('B')})`, result: n }, '0'],
    ['No lucro', { formula: `COUNTIF(${ref('J')},">0")`, result: noLucro.length }, '0'],
    ['No negativo', { formula: `COUNTIF(${ref('J')},"<0")`, result: noNeg.length }, '0'],
    ['Depósito médio', { formula: `IFERROR(AVERAGE(${ref('H')}),0)`, result: comDep.length ? soma((l) => l.deposito_inicial ?? 0, comDep) / comDep.length : 0 }, USD],
    ['Lucro somado de quem lucrou (US$)', { formula: `SUMIF(${ref('J')},">0")`, result: soma((l) => L(l), noLucro) }, USD],
    ['Prejuízo somado de quem perdeu (US$)', { formula: `SUMIF(${ref('J')},"<0")`, result: soma((l) => L(l), noNeg) }, USD],
    ['Lucro somado em reais', { formula: `SUMIF(${ref('J')},">0",${ref('L')})`, result: somar(noLucro, LR) }, BRL],
    ['Resultado médio do mês', { formula: `IFERROR(AVERAGE(${ref('I')}),0)`, result: comDep.length ? soma((l) => L(l) / (l.deposito_inicial || 1), comDep) / comDep.length : 0 }, PCT],
    ['Cotação do dólar (R$)', d.cotacao, '"R$" #,##0.0000'],
  ]
  kpis.forEach(([rot, v, fmt], k) => {
    const r = R(k)
    const a = wr.getCell(r, 2); a.value = rot; a.font = { size: 11, color: { argb: SUAVE } }
    const b = wr.getCell(r, 3); b.value = v as never; b.numFmt = fmt; b.font = { bold: true, size: 12, color: { argb: k === 4 || k === 6 ? VERDE : k === 5 ? VERMELHO : TEXTO } }
    b.alignment = { horizontal: 'right' }
    for (let c = 2; c <= 3; c++) wr.getCell(r, c).border = { bottom: { style: 'hair', color: { argb: LINHA } } }
    wr.getRow(r).height = 20
  })
  wr.getCell(R(8), 4).value = d.cotacaoTexto
  wr.getCell(R(8), 4).font = { size: 9.5, italic: true, color: { argb: SUAVE } }
  wr.getCell(R(8), 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } }
  // a cotação precisa ficar onde as fórmulas da aba Clientes procuram
  if (`Resumo!$C$${R(8)}` !== celCot) throw new Error('Planilha: a cotação saiu do lugar.')

  // a conta por plano
  const rP = R(9) + 1
  tit(rP, 'Quanto cada plano compartilha')
  const cabP = ['Plano', 'Clientes', 'No lucro', 'Lucro do mês (US$)', 'Participação', 'A pagar (US$)', 'A pagar (R$)']
  const hp = wr.getRow(rP + 1)
  cabP.forEach((t, i) => {
    const c = hp.getCell(i + 2); c.value = t; c.font = { bold: true, size: 10.5, color: { argb: OURO } }; fundo(c, AZUL2)
    c.alignment = { horizontal: i ? 'right' : 'left', vertical: 'middle', wrapText: true }
  })
  hp.height = 30
  const pls = ['gold', 'black', 'prestige'] as const
  pls.forEach((p, k) => {
    const r = rP + 2 + k
    const nome = nomePlano(p), pc = d.percentuais[p] ?? 0
    const daqui = linhas.filter((l) => plano(l) === p), lucro = daqui.filter((l) => L(l) > 0)
    const sL = soma((l) => L(l), lucro)
    const vals: unknown[] = [
      nome,
      { formula: `COUNTIF(${ref('G')},"${nome}")`, result: daqui.length },
      { formula: `COUNTIFS(${ref('G')},"${nome}",${ref('J')},">0")`, result: lucro.length },
      { formula: `SUMIFS(${ref('J')},${ref('G')},"${nome}",${ref('J')},">0")`, result: sL },
      pc,
      // soma o que cada cliente paga (já arredondado na linha dele): fecha com a aba Clientes
      { formula: `SUMIFS(${ref('N')},${ref('G')},"${nome}")`, result: somar(daqui, PG) },
      { formula: `SUMIFS(${ref('O')},${ref('G')},"${nome}")`, result: somar(daqui, PR) },
    ]
    vals.forEach((v, i) => {
      const c = wr.getCell(r, i + 2); c.value = v as never
      c.font = { size: 11, bold: i === 0 || i === 6, color: { argb: i === 0 ? (p === 'gold' ? OURO_ESCURO : p === 'black' ? 'FF111113' : 'FF8A7550') : i === 6 ? OURO_ESCURO : TEXTO } }
      c.alignment = { horizontal: i ? 'right' : 'left', vertical: 'middle' }
      c.border = { bottom: { style: 'hair', color: { argb: LINHA } } }
      if (k % 2 === 1) fundo(c, CREME)
    })
    wr.getCell(r, 5).numFmt = USD; wr.getCell(r, 6).numFmt = '0%'; wr.getCell(r, 7).numFmt = USD; wr.getCell(r, 8).numFmt = BRL
    if (pc <= 0) { wr.getCell(r, 6).value = 'Isento'; wr.getCell(r, 7).value = 0 }
    wr.getRow(r).height = 22
  })
  const rT = rP + 5
  const totP: unknown[] = ['Total',
    { formula: `SUM(C${rP + 2}:C${rP + 4})`, result: n }, { formula: `SUM(D${rP + 2}:D${rP + 4})`, result: noLucro.length },
    { formula: `SUM(E${rP + 2}:E${rP + 4})`, result: soma((l) => L(l), noLucro) }, '',
    { formula: `SUM(G${rP + 2}:G${rP + 4})`, result: somar(linhas, PG) },
    { formula: `SUM(H${rP + 2}:H${rP + 4})`, result: somar(linhas, PR) }]
  totP.forEach((v, i) => {
    const c = wr.getCell(rT, i + 2); c.value = v as never; fundo(c, AZUL)
    c.font = { bold: true, size: 12, color: { argb: i === 6 ? OURO : 'FFF4EEDF' } }
    c.alignment = { horizontal: i ? 'right' : 'left', vertical: 'middle' }
  })
  wr.getCell(rT, 5).numFmt = USD; wr.getCell(rT, 7).numFmt = USD; wr.getCell(rT, 8).numFmt = BRL
  wr.getRow(rT).height = 28

  // exemplo de um cliente (o primeiro Gold no lucro), para explicar com um caso só
  // o cliente do meio entre os Gold no lucro (um caso típico, nem o maior nem o menor)
  const golds = linhas.filter((l) => plano(l) === 'gold' && L(l) > 0 && (l.deposito_inicial ?? 0) > 0)
  const ex = golds[Math.floor(golds.length / 2)]
  let rE = rT + 2
  if (ex) {
    tit(rE, 'Exemplo com um cliente')
    const pc = perc(ex), dep = ex.deposito_inicial ?? 0
    const nomeEx = (ex.nome || 'Cliente').split(' ')[0]
    const us = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const taxaEx = Math.round(L(ex) / dep * 1000) / 10
    const frases = [
      `${nomeEx} começou com US$ ${us(dep)} na ${ex.corretora || 'Deriv'} e está no plano Gold.`,
      `No mês, lucrou ${taxaEx.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do capital: US$ ${us(dep)} × ${taxaEx.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% = US$ ${us(L(ex))} de lucro.`,
      `Saldo final: US$ ${us(dep)} + US$ ${us(L(ex))} = US$ ${us(dep + L(ex))}.`,
      `Compartilha ${Math.round(pc * 100)}% só do lucro: US$ ${us(PG(ex))}, que dão R$ ${us(PR(ex))} pela cotação.`,
      `O resto do lucro, US$ ${us(L(ex) - Math.round(L(ex) * pc * 100) / 100)}, fica com ${nomeEx}.`,
    ]
    frases.forEach((t, i) => {
      const r = rE + 1 + i
      wr.mergeCells(r, 2, r, 8)
      const c = wr.getCell(r, 2); c.value = t; c.font = { size: 11, color: { argb: TEXTO }, bold: i === 3 }
      c.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
      fundo(c, i === 3 ? 'FFFFF4D6' : CREME); wr.getRow(r).height = 22
    })
    rE += 7
  }
  const pe = wr.getCell(rE, 2)
  pe.value = `Gerada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} pela plataforma GlobalFly Trade.${d.simulado ? ' Simulação: nomes e números fictícios.' : ' Uso interno da equipe.'}`
  pe.font = { size: 9.5, italic: true, color: { argb: SUAVE } }
  wr.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  wc.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }

  return await wb.xlsx.writeBuffer() as ArrayBuffer
}
