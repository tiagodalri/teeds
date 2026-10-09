/**
 * A chave do Modo CEO — a mesma em toda tela de administração.
 *
 * Nasceu só na Administração. Em 09/10/2026 o Tiago pediu para ligar o modo
 * também no Monitoramento (para ver o markup de cada operação na cabine) e
 * nos Insights (para ver a receita do período). Uma chave só, reaproveitada,
 * e a mesma preferência por trás (`usePreferenciaColuna`): ligou numa tela,
 * está ligado nas três.
 *
 * O `texto` muda por tela porque o que o modo revela muda por tela.
 */
interface Props {
  ligado: boolean
  onTrocar: (ligado: boolean) => void
  texto: string
}

export function ChaveModoCeo({ ligado, onTrocar, texto }: Props) {
  return (
    <section className={`admin-card modo-ceo ${ligado ? 'on' : ''}`}>
      <div className="modo-ceo-quem">
        <i aria-hidden><svg viewBox="0 0 24 24"><path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19.2 19H4.8L3 7.5Z" /></svg></i>
        <div>
          <b>Modo CEO<em>{ligado ? 'ligado' : 'desligado'}</em></b>
          <small>{texto}</small>
        </div>
      </div>
      <div className="modo-ceo-chave" role="group" aria-label="Modo CEO">
        <button type="button" aria-pressed={!ligado} onClick={() => onTrocar(false)}>Normal</button>
        <button type="button" aria-pressed={ligado} onClick={() => onTrocar(true)}>CEO</button>
      </div>
    </section>
  )
}
