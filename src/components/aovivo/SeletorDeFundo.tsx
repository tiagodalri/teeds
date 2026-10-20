import { FUNDOS, fundosDisponiveis, miniaturaDoFundo, type EscolhaDeFundo } from '../../core/live/fundos'

/**
 * A escolha do fundo da câmera, em miniaturas: sem fundo, desfocar o fundo
 * real, ou a arte do monograma GF (20/10/2026: só essas, mais objetivo).
 */
export function SeletorDeFundo({ valor, onEscolher, cameraLigada, aplicando }: {
  valor: EscolhaDeFundo; onEscolher: (e: EscolhaDeFundo) => void; cameraLigada: boolean; aplicando: boolean
}) {
  if (!fundosDisponiveis()) return <p className="av-fundo-aviso">Este navegador não troca o fundo. Use o Chrome atualizado, ou o OBS (guia na pasta "Fundos para live").</p>
  return (
    <div className="av-fundos">
      <div className="av-fundos-grade" role="radiogroup" aria-label="Fundo da câmera">
        <button role="radio" aria-checked={valor === 'nenhum'} className={`av-fundo especial ${valor === 'nenhum' ? 'on' : ''}`} onClick={() => onEscolher('nenhum')}>
          <span className="av-fundo-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></svg>
          </span>
          <small>Sem fundo</small>
        </button>
        <button role="radio" aria-checked={valor === 'desfoque'} className={`av-fundo especial ${valor === 'desfoque' ? 'on' : ''}`} onClick={() => onEscolher('desfoque')}>
          <span className="av-fundo-icone desfoque" aria-hidden="true" />
          <small>Desfocar</small>
        </button>
        {FUNDOS.map((f) => (
          <button key={f.id} role="radio" aria-checked={valor === f.id} className={`av-fundo ${valor === f.id ? 'on' : ''}`} title={f.nome} onClick={() => onEscolher(f.id)}>
            <img src={miniaturaDoFundo(f.id)} alt="" loading="lazy" width="160" height="90" />
            <small>{f.nome}</small>
          </button>
        ))}
      </div>
      <p className="av-fundo-nota">
        {aplicando ? 'Aplicando o fundo…' : !cameraLigada ? 'O fundo entra assim que você ligar a câmera.' : 'A IA recorta você no navegador. Luz de frente deixa o recorte mais limpo.'}
      </p>
    </div>
  )
}
