// Fixture local sem sessão, credenciais ou operações. Não é entrada de produção.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarketplacePanel } from '../src/components/MarketplacePanel'
import { AulasPanel } from '../src/components/AulasPanel'
import { OperationalManagementPanel } from '../src/components/OperationalManagementPanel'
import { aplicarTema } from '../src/core/tema'
import { MARCA } from '../src/marca'
import '../src/styles/app.css'
import '../src/styles/tema.css'
import '../src/styles/ux-refinements.css'
document.documentElement.dataset.marca = MARCA.id
aplicarTema('escuro')
const tela = new URLSearchParams(location.search).get('tela')
createRoot(document.getElementById('root')!).render(<div style={{paddingTop: 70, marginLeft: innerWidth > 900 ? 236 : 0}}>{tela === 'aulas' ? <AulasPanel /> : tela === 'ger' ? <OperationalManagementPanel /> : <MarketplacePanel />}</div>)
