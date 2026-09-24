# Captação de leads

Uma única landing page atende as duas marcas sem misturar seus dados:

- `cadastro.teedscompany.com` identifica e grava `marca = teeds`;
- `cadastro.omnifinanc.com` identifica e grava `marca = omni`.

Em desenvolvimento, use `?marca=teeds` ou `?marca=omni`. O formulário envia
somente para `https://motor.teedscompany.com/publico/leads`. A chave do Supabase
nunca é entregue ao navegador.

Antes de publicar, é obrigatório: aplicar a migração
`20260909143000_captacao_publica_de_leads.sql`, atualizar o motor, apontar os dois
subdomínios para a hospedagem desta pasta e revisar o texto de privacidade/LGPD.

## As telas da plataforma (`plataforma/*.webp`)

Elas não são print da plataforma de verdade: são as MESMAS telas, montadas
com os mesmos componentes e dados de exemplo, na bancada `preview/telas.tsx`.
Assim dá para recapturar depois de qualquer mudança de layout, sem login,
sem conta conectada e sem robô operando.

Para refazer (Chrome instalado, na raiz do projeto):

```
npx vite --port 5194 &                     # Teeds
MARCA=omni npx vite --port 5195 &          # OMNI
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for m in teeds:5194 omni:5195; do marca=${m%%:*}; porta=${m##*:}
  for t in robos gerenciamento aulas marketplace; do
    "$CH" --headless=new --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1500,1120 --virtual-time-budget=9000 \
      --screenshot="/tmp/$marca-$t.png" \
      "http://127.0.0.1:$porta/preview/telas.html?tela=$t"
  done
done
```

Depois recorte para 16:10 e salve em WEBP 1440x900, qualidade 82.
