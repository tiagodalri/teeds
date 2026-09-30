import React from 'react'
import {createRoot} from 'react-dom/client'
import {AdminEmails} from '../src/components/AdminEmails'
import '../src/styles/app.css'
import '../src/styles/tema.css'
// Fixture isolada: os testes interceptam a consulta, sem login ou dados reais.
createRoot(document.getElementById('root')!).render(<div className="admin-panel" style={{padding:16}}><AdminEmails sessao={{token:'fixture-sem-acesso'} as any} marca="teeds"/></div>)
