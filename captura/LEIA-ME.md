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
