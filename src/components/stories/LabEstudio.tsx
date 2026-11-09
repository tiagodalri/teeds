import { useEffect, useState } from 'react'
import { EstudioDeStories } from './EstudioDeStories'
import { ligarLab } from './LabStories'

/** ?tela=estudio[&foto=1][&tema=escuro]: o estúdio de stories com o banco de mentira (09/11/2026). */
export default function LabEstudio() {
  const q = new URLSearchParams(location.search)
  const [pronto, setPronto] = useState(false)
  const [aberto, setAberto] = useState(true)
  useEffect(() => { ligarLab(); setPronto(true) }, [])
  if (!pronto) return null
  return (
    <div className="app" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <button type="button" onClick={() => setAberto(true)}>Abrir o estúdio</button>
      {aberto && (
        <EstudioDeStories sessao={{ token: 'lab', usuario: { id: 'lab' } } as never} papel={{ admin: true, geral: true, parceiro: null, nomeDoParceiro: null, total: true, ve: [] }}
          aoFechar={() => setAberto(false)} fotoDeExemplo={q.has('foto') ? `${import.meta.env.BASE_URL}aulas-globalfly/boas-vindas-mobile.webp` : undefined} />
      )}
    </div>
  )
}
