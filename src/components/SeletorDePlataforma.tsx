/**
 * O que o painel está olhando: a rede inteira ou uma plataforma.
 *
 * Era um `<select>` do sistema escrito "Teeds · master" — e isso confundia
 * duas coisas diferentes. "Master" é quem manda (a Teeds administra todas);
 * não é o total da casa. Quem quisesse ver a soma das plataformas não tinha
 * para onde clicar. (Tiago, 30/09/2026.)
 *
 * Agora são botões visíveis, lado a lado: Rede, Teeds, OMNI. A opção em que
 * você está não precisa ser aberta para ser lida, e a soma da casa virou um
 * lugar, não uma conta de cabeça.
 */
import { MARCAS } from '../marca/marcas'
import { REDE } from '../core/teeds/clientes'
import { FiltroDeParceiros } from './parceiros/FiltroDeParceiros'

export interface OpcaoDePlataforma {
  id: string
  nome: string
  /** Uma palavra embaixo do nome, dizendo o que aquilo é. */
  papel: string
}

export const opcoesDePlataforma = (master: boolean, marcaPropria: string): OpcaoDePlataforma[] => {
  const marcas = Object.values(MARCAS).filter((m) => master || m.id === marcaPropria)
  const cada = marcas.map((m) => ({
    id: m.id,
    nome: m.prosa,
    papel: m.id === 'teeds' ? 'Plataforma master' : 'Whitelabel',
  }))
  // Quem administra uma plataforma só não tem rede para ver: a rede dele é
  // ela. Sem a opção, o seletor inteiro some (veja o componente abaixo).
  if (cada.length < 2) return cada
  return [{ id: REDE, nome: 'Rede', papel: `${cada.length} plataformas somadas` }, ...cada]
}

export function SeletorDePlataforma({ valor, opcoes, onTrocar, parceiros = [], parceiro = '', onParceiro, soParceiros = false }: {
  valor: string
  opcoes: OpcaoDePlataforma[]
  onTrocar: (id: string) => void
  /** Parceiros de divulgação da marca em foco (27/10/2026): só o admin geral recebe. */
  parceiros?: Array<{ codigo: string; nome: string }>
  parceiro?: string
  onParceiro?: (codigo: string) => void
  /** Só os parceiros, sem "Todos" e "Direto" (a aba Anúncios: cada conta de anúncios é de um parceiro). */
  soParceiros?: boolean
}) {
  if (opcoes.length < 2 && !parceiros.length) return null
  const nomeDaMarca = opcoes.find((o) => o.id === valor)?.nome ?? ''
  return (
    <>
    {/* uma plataforma só (o painel da GF): o "Vendo" com um botão só não escolhe nada, então some */}
    {opcoes.length > 1 && <div className="sel-plat" role="group" aria-label="O que este painel está mostrando">
      <span className="sel-plat-rot">Vendo</span>
      <div className="sel-plat-opcoes">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            className={o.id === REDE ? 'sel-plat-rede' : undefined}
            aria-pressed={valor === o.id}
            title={o.papel}
            onClick={() => { if (valor !== o.id) onTrocar(o.id) }}
          >
            {o.id === REDE && (
              <i aria-hidden>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M12 7.4 6.2 15.8M12 7.4l5.8 8.4M7.4 18h9.2" /></svg>
              </i>
            )}
            <b>{o.nome}</b>
            <small>{o.papel}</small>
          </button>
        ))}
      </div>
    </div>}
    {parceiros.length > 0 && onParceiro && (
      <div className="sel-parc" role="group" aria-label={soParceiros ? 'Conta de anúncios do parceiro' : 'Parceiro de divulgação'}>
        <span className="sel-plat-rot">Parceiro</span>
        <FiltroDeParceiros rotulo={soParceiros ? 'Conta de anúncios do parceiro' : 'Parceiro de divulgação'} valor={parceiro} onTrocar={onParceiro}
          opcoes={[
            ...(soParceiros ? [] : [{ id: '', nome: 'Todos', titulo: 'Todos os parceiros e quem chegou direto' }]),
            ...parceiros.map((p) => ({ id: p.codigo, pessoa: p.nome, prefixo: opcoes.length > 1 ? nomeDaMarca : undefined, nome: p.nome.split(' ')[0], codigo: p.codigo, titulo: soParceiros ? `A conta de anúncios do ${p.nome.split(' ')[0]}` : `${nomeDaMarca} · ${p.nome}` })),
            ...(soParceiros ? [] : [{ id: 'direto', nome: 'Direto', titulo: 'Quem chegou sem link de parceiro' }]),
          ]} />
      </div>
    )}
    </>
  )
}
