import React from 'react'
import {createRoot} from 'react-dom/client'
import {LoginScreen} from '../src/components/LoginScreen'
import '../src/styles/app.css'
import '../src/styles/tema.css'
createRoot(document.getElementById('root')!).render(<LoginScreen ocupado={false} limparErro={()=>{}} onEntrar={async()=>true} onEsqueci={async()=>true} onCadastrar={async()=>{document.documentElement.dataset.cadastrou='sim';return {ok:true,confirmar:true}}} />)
