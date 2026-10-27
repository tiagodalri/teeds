import { MARCA } from '../marca'
import { LogotipoDaIA, temLogotipo } from './marca/LogotipoDaIA'

/** O prefixo da marca no nome do robô: "GF" hoje, "GlobalFly" nas sessões antigas. */
const PREFIXO = /^(GF|GlobalFly)\s+/i

/**
 * O nome de um robô na tela (19/10/2026).
 *
 * Na marca com `monogramaNosRobos`, o "GF" escrito vira o monograma oficial,
 * alinhado ao texto ("[GF] Raptor"). Onde não cabe imagem (um <option>, um
 * e-mail, o leitor de tela) o nome continua sendo o texto "GF Raptor".
 *
 * 27/10/2026: as I.A. com logotipo desenhado (Phenom, Raptor, Falcon, Legacy,
 * Gulf) aparecem com ele; `id` (o código da I.A.) acha o logotipo mesmo
 * quando o nome gravado não traz o "GF". `emTexto` mantém o nome escrito no meio de uma
 * frase ("O GF Raptor entra depois de…"), onde um logotipo atrapalha a leitura.
 */
export function NomeDoRobo({ nome, id, emTexto = false }: { nome: string; id?: string | null; emTexto?: boolean }) {
  if (!emTexto && temLogotipo(nome, id)) return <LogotipoDaIA nome={nome} id={id} />
  const m = MARCA.monogramaNosRobos ? nome.match(PREFIXO) : null
  if (!m) return <>{nome}</>
  return (
    <span className="nome-robo" title={nome}>
      <span className="nome-robo-gf" role="img" aria-label="GF" />
      <span className="nome-robo-txt">{nome.slice(m[0].length)}</span>
    </span>
  )
}
