# Teste de carga (20/10/2026)

Robôs (motor de verdade contra uma Deriv falsa) e sala de treino (LiveKit).

**Robôs**, no servidor:
1. `cd servidor && npx esbuild ../scripts/carga/carga-robos.ts --bundle --platform=node --target=node22 --format=esm --outfile=/tmp/carga-robos.mjs`
2. Copiar `carga-robos.mjs`, `deriv-falsa.mjs`, `rodar.sh` e `medir-robos.sh` para `/root/carga/` e gerar
   `chave.pem`/`cert.pem` (`openssl req -x509 -newkey rsa:2048 -nodes -keyout chave.pem -out cert.pem -days 2 -subj "/CN=127.0.0.1"`).
3. `./rodar.sh 100 90` (robôs, segundos). Apagar `/root/carga` no fim.

**Sala de treino**, daqui: baixar o `lk` (github.com/livekit/livekit-cli), pôr um `chaves.env` com
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `LIVEKIT_URL` ao lado, copiar `medir.sh` para `/root/` e rodar
`./degraus.sh 25 50 100`. Um computador só não imita mais de ~100 pessoas (a banda dele vira o teto).

Resultados de 20/10/2026 na memória do projeto (teeds-capacidade-servidor).
