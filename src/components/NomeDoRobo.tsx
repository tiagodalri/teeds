import { MARCA } from '../marca'

/** O prefixo da marca no nome do robô: "GF" hoje, "GlobalFly" nas sessões antigas. */
const PREFIXO = /^(GF|GlobalFly)\s+/i

/**
 * O nome de um robô na tela (19/10/2026).
 *
 * Na marca com `monogramaNosRobos`, o "GF" escrito vira o monograma oficial,
 * alinhado ao texto ("[GF] Raptor"). Onde não cabe imagem (um <option>, um
 * e-mail, o leitor de tela) o nome continua sendo o texto "GF Raptor".
 */
export function NomeDoRobo({ nome }: { nome: string }) {
  const m = MARCA.monogramaNosRobos ? nome.match(PREFIXO) : null
  if (!m) return <>{nome}</>
  return (
    <span className="nome-robo" title={nome}>
      <span className="nome-robo-gf" role="img" aria-label="GF" />
      <span className="nome-robo-txt">{nome.slice(m[0].length)}</span>
    </span>
  )
}
