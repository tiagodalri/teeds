# Captação de leads

> 26/10/2026: a GlobalFly deixou de usar esta landing. O /cadastro dela é o
> fluxo do lançamento em `captura-globalfly/` (cadastro -> questionário ->
> obrigado com a comunidade do WhatsApp); o build escolhe a pasta pela marca.

Uma única landing page atende as três marcas sem misturar seus dados. A marca
sai do domínio (`/cadastro/` dentro do site de cada uma):

- domínio com `globalfly` (globalflytrade.com) grava `marca = globalfly`;
- domínio com `omni` (omnifinanc.com) grava `marca = omni`;
- qualquer outro (teedscompany.com) fica com a padrão, `marca = teeds`.

Em desenvolvimento (localhost ou 127.0.0.1), use `?marca=teeds`, `?marca=omni`
ou `?marca=globalfly`. O formulário envia
somente para `https://motor.teedscompany.com/publico/leads`. A chave do Supabase
nunca é entregue ao navegador.

Antes de publicar, é obrigatório: aplicar a migração
`20260909143000_captacao_publica_de_leads.sql`, atualizar o motor, apontar os
domínios para a hospedagem desta pasta e revisar o texto de privacidade/LGPD.

GlobalFly segue o brandbook oficial (GlobalFly Trade, "Precisão em movimento."),
aplicado só nas regras `[data-marca=globalfly]` e na configuração `globalfly`
de `landing.js` e `obrigado/index.html`: Azul GF `#051528` nas superfícies,
Marfim `#F3F0E9` para leitura, Aço `#9CB1C7` para apoio, Ouro `#B78D39` só como
acento (botões com texto Azul GF, cortes diagonais no ângulo do monograma).
Fonte Arimo (carregada só nesta marca) e números em monoespaçada. O nome da
marca NUNCA é digitado no topo: entra a assinatura oficial
`/globalfly-assinatura.png` (versão para fundo escuro, mínimo ~180px de largura;
abaixo de 360px de tela, o monograma `/globalfly-marca.png`). Textos sem
metáfora de aviação e sem promessa de ganho.

GlobalFly, pendências conhecidas: o canal do Telegram ainda não existe, então a
página de obrigado mostra o cartão "Seu acesso chega por e-mail" no lugar do
botão (basta preencher `telegram` na configuração de `obrigado/index.html`).
As telas `plataforma/globalfly-*.webp` ainda não foram capturadas; enquanto
não existirem, a galeria esconde a figura que falhar e, sem nenhuma, a seção
"Por dentro" e o atalho dela no topo.

## As telas da plataforma (`plataforma/*.webp`)

Elas não são print da plataforma de verdade: são as MESMAS telas, montadas
com os mesmos componentes e dados de exemplo, na bancada `preview/telas.tsx`.
Assim dá para recapturar depois de qualquer mudança de layout, sem login,
sem conta conectada e sem robô operando.

Para refazer (Chrome instalado, na raiz do projeto):

```
npx vite --port 5194 &                     # Teeds
MARCA=omni npx vite --port 5195 &          # OMNI
MARCA=globalfly npx vite --port 5196 &     # GlobalFly
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for m in teeds:5194 omni:5195 globalfly:5196; do marca=${m%%:*}; porta=${m##*:}
  for t in robos gerenciamento aulas marketplace; do
    "$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1500,1120 --virtual-time-budget=9000 \
      --screenshot="/tmp/$marca-$t.png" \
      "http://127.0.0.1:$porta/preview/telas.html?tela=$t"
  done
done
```

Depois recorte para 16:10 e salve em WEBP 1440x900, qualidade 82.
