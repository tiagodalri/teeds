import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'
// o tema da marca vem por ultimo, para vencer o app.css (ver src/styles/tema.css)
import './styles/tema.css'
import { aplicarTema, temaGuardado } from './core/tema'

// o tema entra antes do primeiro quadro, para a tela nao piscar clara
aplicarTema(temaGuardado())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
