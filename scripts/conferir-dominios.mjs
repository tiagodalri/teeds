#!/usr/bin/env node
/**
 * Os endereços dos clientes abrem? Com certificado válido? Em IPv4 e IPv6?
 *
 *   node scripts/conferir-dominios.mjs
 *
 * EXISTE POR CAUSA DE 07/10/2026. Vários clientes da OMNI receberam do
 * navegador a acusação "este site pode estar se passando por omnifinanc.com
 * para roubar suas informações" — a pior frase que um cliente pode ler sobre
 * uma plataforma onde ele põe dinheiro. Ficamos sabendo por print no WhatsApp,
 * e o primeiro relato ("não consegui acessar o site") era da véspera.
 *
 * Eram três defeitos empilhados, nenhum deles visível de dentro:
 *
 *  1. o certificado do GitHub Pages cobria só o domínio sem `www`, então
 *     quem digitava `www.` recebia o certificado genérico `*.github.io`;
 *  2. o `www` da OMNI apontava para o próprio domínio em vez de apontar para
 *     o GitHub — e sem isso o GitHub nunca emitiria certificado para ele;
 *  3. os dois domínios tinham UM dos quatro endereços do GitHub e NENHUM
 *     endereço IPv6 — cliente em rede móvel só-IPv6 não abria de jeito nenhum.
 *
 * Nada disso aparece para quem já tem o site aberto e funcionando. Só aparece
 * para o cliente, do lado de fora, e só quando já é tarde. Por isso esta
 * conferência olha de fora: resolve o DNS e abre o TLS de verdade, em vez de
 * perguntar ao painel se está tudo bem.
 *
 * Roda sem credencial nenhuma: consulta DNS público e abre conexão TLS. Sai
 * com código 1 se qualquer coisa estiver errada, para servir de alarme.
 */
import { Resolver } from 'node:dns/promises'
import { connect } from 'node:tls'

/** Onde o GitHub Pages atende hoje. Conferido resolvendo o próprio host. */
const PAGES = 'tiagodalri.github.io'

const SITES = [
  { marca: 'Teeds', dominio: 'teedscompany.com' },
  { marca: 'OMNI', dominio: 'omnifinanc.com' },
]

const resolvedor = new Resolver()
// Dois resolvedores públicos: o do sistema pode ter cache antigo e esconder
// justamente a mudança que a gente quer conferir.
resolvedor.setServers(['1.1.1.1', '8.8.8.8'])

const nada = async (p) => { try { return await p } catch { return [] } }

/** O certificado que o cliente recebe — não o que o painel diz existir. */
function certificadoDe(host) {
  return new Promise((pronto) => {
    const s = connect({ host, port: 443, servername: host, timeout: 12_000 }, () => {
      const c = s.getPeerCertificate()
      const nomes = String(c.subjectaltname || '')
        .split(',').map((x) => x.trim().replace(/^DNS:/, '')).filter(Boolean)
      s.destroy()
      pronto({ ok: true, nomes, ate: c.valid_to })
    })
    s.on('error', (e) => { s.destroy(); pronto({ ok: false, erro: e.code || e.message }) })
    s.on('timeout', () => { s.destroy(); pronto({ ok: false, erro: 'sem resposta' }) })
  })
}

/** Um nome bate com o certificado? `*.github.io` NÃO cobre teedscompany.com. */
const cobre = (nomes, host) => nomes.some((n) =>
  n === host || (n.startsWith('*.') && host.endsWith(n.slice(1)) && !host.slice(0, -n.slice(1).length).includes('.')))

let problemas = 0
const diga = (ok, texto, detalhe = '') => {
  if (!ok) problemas++
  console.log(`  ${ok ? '  ok  ' : ' FALHA'}  ${texto}${detalhe ? `\n            ${detalhe}` : ''}`)
}

console.log('\nOS ENDEREÇOS DOS CLIENTES · VISTOS DE FORA\n')

// Os endereços que o GitHub Pages publica agora. Fixar a lista no código
// envelheceria calado no dia em que o GitHub trocasse de faixa.
const esperadoA = (await nada(resolvedor.resolve4(PAGES))).sort()
const esperadoAAAA = (await nada(resolvedor.resolve6(PAGES))).sort()
console.log(`  ${PAGES}: ${esperadoA.length} endereços IPv4, ${esperadoAAAA.length} IPv6\n`)
if (!esperadoA.length) {
  console.log('  Não consegui resolver o GitHub Pages. Sem rede? Abortando.\n')
  process.exit(1)
}

for (const { marca, dominio } of SITES) {
  console.log(`${marca} · ${dominio}`)
  const www = `www.${dominio}`

  const a = (await nada(resolvedor.resolve4(dominio))).sort()
  diga(a.length === esperadoA.length,
    `o domínio tem os ${esperadoA.length} endereços do GitHub`,
    a.length === esperadoA.length ? '' : `tem ${a.length}: um só endereço é um ponto único de falha`)

  const aaaa = (await nada(resolvedor.resolve6(dominio))).sort()
  diga(aaaa.length === esperadoAAAA.length,
    `e os ${esperadoAAAA.length} endereços IPv6`,
    aaaa.length ? '' : 'nenhum: quem está em rede móvel só-IPv6 não abre o site')

  const alvo = (await nada(resolvedor.resolveCname(www)))[0] ?? ''
  diga(alvo === PAGES, `o www aponta para o GitHub`,
    alvo === PAGES ? '' : `aponta para "${alvo || '(nada)'}" — o GitHub não emite certificado assim`)

  for (const host of [dominio, www]) {
    const c = await certificadoDe(host)
    if (!c.ok) { diga(false, `${host} abre em HTTPS`, `falhou: ${c.erro}`); continue }
    diga(cobre(c.nomes, host), `${host} com certificado válido`,
      cobre(c.nomes, host) ? '' : `o certificado é de ${c.nomes.join(', ')} — o navegador acusa falsificação`)
  }
  console.log('')
}

console.log(problemas === 0
  ? '✓ Os dois endereços abrem limpos, nas duas versões do IP.\n'
  : `✗ ${problemas} problema(s). Cada um deles é um cliente que não entra.\n`)
process.exit(problemas ? 1 : 0)
