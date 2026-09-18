import React from 'react'
import {createRoot} from 'react-dom/client'
import {AdminPendentes} from '../src/components/AdminPendentes'
import '../src/styles/app.css'
import '../src/styles/tema.css'
import '../src/styles/ux-refinements.css'
document.documentElement.dataset.theme='dark'
const sessao:any={token:'teste-sem-acesso-real',usuario:{id:'fixture'}}
createRoot(document.getElementById('root')!).render(<main style={{padding:16,maxWidth:1200,margin:'auto'}}><AdminPendentes sessao={sessao} versao={0} onAprovado={()=>{}} /></main>)
